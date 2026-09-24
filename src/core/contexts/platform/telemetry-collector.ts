import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { CorpDb, type LinhaAcaoAgente } from "../../corp-db.js";
import type { PassoChat } from "../../opencode-server.js";
import { eventBus } from "../../event-bus.js";

// ─── Constantes de configuração ──────────────────────────────────

/** Máximo de bytes em campos de texto antes de truncamento */
const MAX_OUTPUT_BYTES = 64 * 1024; // 64KB

/** Intervalo do flush automático do buffer em milissegundos */
const FLUSH_INTERVAL_MS = 500;

/** Máximo de itens no buffer antes de flush forçado */
const FLUSH_THRESHOLD = 50;

// ─── Regex de sanitização de segredos ────────────────────────────

const PADROES_SEGREDOS: RegExp[] = [
  // API keys genéricas
  /(?:sk|pk|api[_-]?key|apikey|secret|token|password|senha|auth)[_\-]?\s*[:=]\s*["']?([A-Za-z0-9\-_./+=]{8,})["']?/gi,
  // OpenAI / Anthropic / Google keys
  /sk-[A-Za-z0-9\-_]{20,}/g,
  /sk-ant-[A-Za-z0-9\-_]{20,}/g,
  /AIza[A-Za-z0-9\-_]{30,45}/g,
  // GitHub tokens
  /gh[pousr]_[A-Za-z0-9]{36,}/g,
  // AWS
  /AKIA[0-9A-Z]{16}/g,
  // Senhas em variáveis de ambiente
  /(?:PASSWORD|PASSWD|PWD|SECRET)\s*=\s*\S+/gi,
  // Bearer tokens
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  // SSH private keys
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END/g,
];

// ─── Helpers ─────────────────────────────────────────────────────

/** Gera um span_id curto e único (16 chars hex) */
export function gerarSpanId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 16);
}

/** Gera um trace_id (32 chars hex) para propagar entre módulos */
export function gerarTraceId(): string {
  return randomUUID().replace(/-/g, "");
}

/** Sanitiza texto removendo/mascarando segredos */
export function sanitizarSegredos(texto: string | null | undefined): string | null {
  if (!texto) return null;
  let limpo = texto;
  for (const padrao of PADROES_SEGREDOS) {
    // Reset lastIndex para regex com flag /g
    padrao.lastIndex = 0;
    limpo = limpo.replace(padrao, (match) => {
      const prefix = match.slice(0, Math.min(6, Math.floor(match.length / 4)));
      return `${prefix}***REDACTED***`;
    });
  }
  return limpo;
}

/** Trunca texto para um tamanho máximo, adicionando hash de integridade */
export function truncarComHash(texto: string | null | undefined, maxBytes = MAX_OUTPUT_BYTES): string | null {
  if (!texto) return null;
  const bytes = Buffer.byteLength(texto, "utf8");
  if (bytes <= maxBytes) return texto;
  const hash = createHash("sha256").update(texto).digest("hex").slice(0, 12);
  const cortado = Buffer.from(texto, "utf8").subarray(0, maxBytes).toString("utf8");
  return `${cortado}\n\n[... truncado: ${bytes} bytes originais, SHA-256: ${hash}]`;
}

// ─── Contexto de rastreamento (propagação entre módulos) ─────────

export interface TraceContext {
  trace_id: string;
  parent_span_id?: string;
  sessao_id: string;
  agente: string;
  modelo: string;
  workspace: string;
}

// ─── TelemetryCollector ──────────────────────────────────────────

export class TelemetryCollector {
  private static instancia: TelemetryCollector | null = null;

  private buffer: LinhaAcaoAgente[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private db: CorpDb | null = null;

  static obter(): TelemetryCollector {
    if (!TelemetryCollector.instancia) {
      TelemetryCollector.instancia = new TelemetryCollector();
    }
    return TelemetryCollector.instancia;
  }

  /** Conecta o collector a um banco de dados */
  conectar(db: CorpDb): void {
    this.db = db;
    if (!this.timer) {
      this.timer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
      if (this.timer.unref) this.timer.unref(); // Não impede o Node de sair
    }
  }

  /** Desconecta e faz flush final */
  desconectar(): void {
    this.flush();
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.db = null;
  }

  /** Converte PassoChat[] em LinhaAcaoAgente[] e adiciona ao buffer */
  registrarPassos(ctx: TraceContext, passos: PassoChat[]): void {
    const agora = new Date().toISOString();
    const rootSpanId = gerarSpanId();

    for (const p of passos) {
      const spanId = gerarSpanId();
      let acao: LinhaAcaoAgente;

      if (p.tipo === "acao") {
        const inputSanitizado = sanitizarSegredos(p.resumo ?? null);
        const outputSanitizado = truncarComHash(sanitizarSegredos(p.saida ?? null));

        acao = {
          id: `act-${randomUUID()}`,
          trace_id: ctx.trace_id,
          span_id: spanId,
          parent_span_id: ctx.parent_span_id ?? rootSpanId,
          sessao_id: ctx.sessao_id,
          agente: ctx.agente,
          modelo: ctx.modelo,
          workspace: ctx.workspace,
          tipo_acao: "tool",
          ferramenta: p.ferramenta ?? null,
          comando_resumo: inputSanitizado ? inputSanitizado.slice(0, 500) : null,
          input_json: inputSanitizado ? JSON.stringify({ resumo: inputSanitizado }) : null,
          output_json: outputSanitizado,
          status: p.sucesso === false ? "falhou" : "sucesso",
          duracao_ms: 0,
          erro: p.sucesso === false ? (p.saida?.slice(0, 2000) ?? "erro desconhecido") : null,
          criado_em: agora,
        };
      } else if (p.tipo === "pensamento") {
        acao = {
          id: `act-${randomUUID()}`,
          trace_id: ctx.trace_id,
          span_id: spanId,
          parent_span_id: ctx.parent_span_id ?? rootSpanId,
          sessao_id: ctx.sessao_id,
          agente: ctx.agente,
          modelo: ctx.modelo,
          workspace: ctx.workspace,
          tipo_acao: "pensamento",
          comando_resumo: p.texto ? p.texto.slice(0, 200) : null,
          input_json: null,
          output_json: truncarComHash(p.texto ?? null),
          status: "sucesso",
          duracao_ms: 0,
          criado_em: agora,
        };
      } else if (p.tipo === "texto") {
        acao = {
          id: `act-${randomUUID()}`,
          trace_id: ctx.trace_id,
          span_id: spanId,
          parent_span_id: ctx.parent_span_id ?? rootSpanId,
          sessao_id: ctx.sessao_id,
          agente: ctx.agente,
          modelo: ctx.modelo,
          workspace: ctx.workspace,
          tipo_acao: "resposta",
          comando_resumo: p.texto ? p.texto.slice(0, 200) : null,
          input_json: null,
          output_json: truncarComHash(p.texto ?? null),
          status: "sucesso",
          duracao_ms: 0,
          criado_em: agora,
        };
      } else {
        continue;
      }

      this.buffer.push(acao);
    }

    // Flush se o buffer estiver cheio
    if (this.buffer.length >= FLUSH_THRESHOLD) {
      this.flush();
    }
  }

  /** Registra uma ação individual (para uso direto sem PassoChat) */
  registrarAcao(acao: LinhaAcaoAgente): void {
    // Sanitizar antes de armazenar
    acao.input_json = sanitizarSegredos(acao.input_json);
    acao.output_json = truncarComHash(sanitizarSegredos(acao.output_json));
    acao.erro = sanitizarSegredos(acao.erro);
    this.buffer.push(acao);
    if (this.buffer.length >= FLUSH_THRESHOLD) {
      this.flush();
    }
  }

  /** Faz flush do buffer para o banco de dados */
  flush(): void {
    if (!this.buffer.length || !this.db) return;
    const lote = this.buffer.splice(0);
    try {
      this.db.gravarAcoesEmLote(lote);
      eventBus.emit("telemetria.flush", {
        total: lote.length,
        sessoes: [...new Set(lote.map((a) => a.sessao_id))],
      });
    } catch (err) {
      // Em caso de falha, recolocar no buffer para retry
      console.error(`[telemetria] falha ao gravar ${lote.length} ações:`, err);
      this.buffer.unshift(...lote);
    }
  }

  /** Retorna o tamanho atual do buffer (para diagnóstico) */
  tamanhoBuffer(): number {
    return this.buffer.length;
  }
}
