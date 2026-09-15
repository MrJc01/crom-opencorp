import Database from "better-sqlite3";
import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { OpencorpDb } from "./db/opencorp-db.js";
import { inicializarBancoConsolidado } from "./db/schema.js";

export interface LinhaRegistro {
  id: string;
  categoria: string;
  descricao: string;
  criado_por: string;
  criado_em: string;
  atualizado_em: string;
  tags: string;
  conteudo: string;
}

export interface LinhaEvento {
  registro_id: string;
  categoria: string;
  ts: string;
  por: string;
  evento: string;
  resumo: string;
}

export interface LinhaSessao {
  id: string;
  agente: string;
  modelo: string;
  inicio: string;
  fim: string | null;
  custo_usd: number | null;
  status: string;
}

export interface LinhaMensagem {
  id: string;
  sessao_id: string;
  agente: string;
  role: string;
  conteudo: string;
  criado_em: string | null;
}

/** Linha do ledger unificado de execuções (PLANO-UNIFICACAO) — toda ativação de agente, de qualquer motor. */
export interface LinhaExecucao {
  id: string;
  agente: string;
  modelo: string;
  gatilho_tipo: string;
  gatilho_origem: string;
  status: string;
  inicio: string;
  fim: string | null;
  duracao_ms: number | null;
  custo_usd: number | null;
  exit_code: number | null;
  erro?: string | null;
}

/** Linha granular de ação/passo de um agente — telemetria com trace context (OpenTelemetry-inspired). */
export interface LinhaAcaoAgente {
  id: string;
  trace_id: string;
  span_id: string;
  parent_span_id?: string | null;
  sessao_id: string;
  agente: string;
  modelo: string;
  workspace: string;
  tipo_acao: "tool" | "pensamento" | "resposta" | "erro";
  ferramenta?: string | null;
  comando_resumo?: string | null;
  input_json?: string | null;
  output_json?: string | null;
  status: "sucesso" | "falhou" | "timeout" | "abortado";
  duracao_ms?: number;
  tokens_prompt?: number;
  tokens_saida?: number;
  custo_usd?: number;
  erro?: string | null;
  criado_em: string;
}

export interface FiltroExecucoes {
  agente?: string;
  gatilho_tipo?: string;
  gatilho_origem?: string;
  status?: string;
  limite?: number;
}

export interface FiltroTelemetria {
  sessao_id?: string;
  trace_id?: string;
  agente?: string;
  ferramenta?: string;
  status?: string;
  desde?: string;
  ate?: string;
  limite?: number;
}

function parseDataParaMs(valor?: string | null): number {
  if (!valor) return Date.now();
  const parsed = Date.parse(valor);
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

function mapSpanRowParaLinhaAcao(r: any): LinhaAcaoAgente {
  return {
    id: r.id,
    trace_id: r.trace_id,
    span_id: r.span_id,
    parent_span_id: r.parent_span_id,
    sessao_id: r.session_id,
    agente: r.agente || "",
    modelo: r.modelo || "",
    workspace: r.workspace || "",
    tipo_acao: r.tipo_acao || "tool",
    ferramenta: r.ferramenta,
    comando_resumo: r.comando_resumo,
    input_json: r.input_json,
    output_json: r.output_json,
    status: r.status,
    duracao_ms: r.duracao_ms ?? 0,
    tokens_prompt: r.prompt_tokens ?? 0,
    tokens_saida: r.saida_tokens ?? 0,
    custo_usd: r.custo_micro_usd ? Number((r.custo_micro_usd / 1_000_000).toFixed(6)) : 0,
    erro: r.erro,
    criado_em: r.criado_em_ms ? new Date(r.criado_em_ms).toISOString() : new Date().toISOString(),
  };
}

/**
 * CorpDb: Fachada e Adaptador de Transição para o Schema Consolidado
 *
 * Mapeia transparentemente chamadas legadas para as tabelas universais do OpencorpDb:
 * - sessoes / execucoes -> sessions (com conversão micro-USD)
 * - mensagens -> messages
 * - acoes_agentes -> spans
 * - registros / journal -> registros / journal
 */
export class CorpDb {
  private readonly opencorp?: OpencorpDb;
  private readonly db: Database.Database;
  private readonly wsId: string;
  private readonly wsPath: string;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    const dbPathResolvido = resolve(dbPath);
    if (dirname(dbPathResolvido).endsWith(".opencorp")) {
      const wsPath = dirname(dirname(dbPathResolvido));
      this.wsPath = wsPath;
      this.opencorp = OpencorpDb.obter(wsPath);
      this.db = this.opencorp.handle;
      this.wsId = this.opencorp.wsId;

      // Garante symlink de compatibilidade corp.db apontando para opencorp.db
      const corpDbPath = join(wsPath, ".opencorp", "corp.db");
      if (!existsSync(corpDbPath)) {
        try {
          symlinkSync("opencorp.db", corpDbPath);
        } catch {}
      }
    } else {
      // Isolamento para diretórios temporários arbitrários em testes unitários
      this.wsPath = dirname(dbPath);
      this.wsId = "custom";
      this.db = new Database(dbPath);
      this.db.pragma("journal_mode = WAL");
      this.db.pragma("busy_timeout = 5000");
      inicializarBancoConsolidado(this.db);
    }
  }

  get workspacePath(): string {
    return this.wsPath;
  }

  static caminho(wsPath: string): string {
    return join(wsPath, ".opencorp", "corp.db");
  }

  limpar(): void {
    this.db.exec(
      "DELETE FROM registros; DELETE FROM journal; DELETE FROM messages; DELETE FROM spans; DELETE FROM sessions;",
    );
  }

  upsertRegistro(r: LinhaRegistro): void {
    this.db
      .prepare(
        `INSERT INTO registros (id, categoria, descricao, criado_por, criado_em, atualizado_em, tags, conteudo)
         VALUES (@id, @categoria, @descricao, @criado_por, @criado_em, @atualizado_em, @tags, @conteudo)
         ON CONFLICT (categoria, id) DO UPDATE SET
           descricao = excluded.descricao,
           criado_por = excluded.criado_por,
           criado_em = excluded.criado_em,
           atualizado_em = excluded.atualizado_em,
           tags = excluded.tags,
           conteudo = excluded.conteudo`,
      )
      .run(r);
  }

  obterRegistro(categoria: string, id: string): LinhaRegistro | undefined {
    return this.db
      .prepare("SELECT * FROM registros WHERE categoria = ? AND id = ?")
      .get(categoria, id) as LinhaRegistro | undefined;
  }

  listarRegistros(categoria?: string): LinhaRegistro[] {
    if (categoria) {
      return this.db
        .prepare("SELECT * FROM registros WHERE categoria = ? ORDER BY id")
        .all(categoria) as LinhaRegistro[];
    }
    return this.db
      .prepare("SELECT * FROM registros ORDER BY categoria, id")
      .all() as LinhaRegistro[];
  }

  removerRegistro(categoria: string, id: string): void {
    this.db
      .prepare("DELETE FROM registros WHERE categoria = ? AND id = ?")
      .run(categoria, id);
    this.db
      .prepare("DELETE FROM journal WHERE categoria = ? AND registro_id = ?")
      .run(categoria, id);
  }

  excluirRegistro(categoria: string, id: string): void {
    this.removerRegistro(categoria, id);
  }

  inserirEvento(e: LinhaEvento): void {
    this.db.prepare(
      "INSERT INTO journal (registro_id, categoria, ts, por, evento, resumo) VALUES (@registro_id, @categoria, @ts, @por, @evento, @resumo)",
    ).run(e);
  }

  inserirJournal(e: LinhaEvento): void {
    this.inserirEvento(e);
  }

  listarJournal(categoria?: string, registroId?: string): LinhaEvento[] {
    if (categoria && registroId) {
      return this.db
        .prepare("SELECT * FROM journal WHERE categoria = ? AND registro_id = ? ORDER BY ts ASC")
        .all(categoria, registroId) as LinhaEvento[];
    }
    if (categoria) {
      return this.db
        .prepare("SELECT * FROM journal WHERE categoria = ? ORDER BY ts ASC")
        .all(categoria) as LinhaEvento[];
    }
    return this.db.prepare("SELECT * FROM journal ORDER BY ts ASC").all() as LinhaEvento[];
  }

  upsertSessao(s: LinhaSessao): void {
    const inicioMs = parseDataParaMs(s.inicio);
    const fimMs = s.fim ? parseDataParaMs(s.fim) : null;
    const duracaoMs = fimMs && inicioMs ? Math.max(0, fimMs - inicioMs) : null;
    const custoMicroUsd = Math.round(Number(s.custo_usd || 0) * 1_000_000);
    const status = s.status || "executando";

    this.db
      .prepare(
        `INSERT INTO sessions (id, workspace, agente, modelo, status, inicio_ms, fim_ms, duracao_ms, custo_micro_usd)
         VALUES (@id, @workspace, @agente, @modelo, @status, @inicio_ms, @fim_ms, @duracao_ms, @custo_micro_usd)
         ON CONFLICT (id) DO UPDATE SET
           agente = excluded.agente,
           modelo = excluded.modelo,
           status = excluded.status,
           inicio_ms = excluded.inicio_ms,
           fim_ms = excluded.fim_ms,
           duracao_ms = excluded.duracao_ms,
           custo_micro_usd = excluded.custo_micro_usd`,
      )
      .run({
        id: s.id,
        workspace: this.wsId,
        agente: s.agente || "",
        modelo: s.modelo || "",
        status,
        inicio_ms: inicioMs,
        fim_ms: fimMs,
        duracao_ms: duracaoMs,
        custo_micro_usd: custoMicroUsd,
      });
  }

  obterSessao(id: string): LinhaSessao | undefined {
    const r = this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as any;
    if (!r) return undefined;
    return {
      id: r.id,
      agente: r.agente,
      modelo: r.modelo,
      inicio: r.inicio_ms ? new Date(r.inicio_ms).toISOString() : "",
      fim: r.fim_ms ? new Date(r.fim_ms).toISOString() : null,
      custo_usd: r.custo_micro_usd ? Number((r.custo_micro_usd / 1_000_000).toFixed(6)) : 0,
      status: r.status,
    };
  }

  listarSessoesLocal(limite = 30): Array<{ id: string; agente: string; modelo: string; inicio: string; fim: string | null; status: string; titulo_real?: string }> {
    const sessoes = this.listarSessoes({ limite });
    const ids = sessoes.map((s) => s.id);
    if (ids.length) {
      const primeiras = this.primeirasMensagensUsuario(ids);
      const mapa = new Map<string, string>();
      for (const p of primeiras) {
        if (!mapa.has(p.sessao_id)) mapa.set(p.sessao_id, p.conteudo);
      }
      return sessoes.map((s) => ({
        ...s,
        titulo_real: mapa.get(s.id)?.slice(0, 70) || undefined,
      }));
    }
    return sessoes;
  }

  listarSessoes(filtro?: { agentePrefixo?: string; limite?: number }): LinhaSessao[] {
    const sql = `SELECT * FROM sessions ${filtro?.agentePrefixo ? "WHERE agente LIKE ?" : ""}
                 ORDER BY inicio_ms DESC ${filtro?.limite ? "LIMIT " + Math.floor(filtro.limite) : ""}`;
    const rows = (filtro?.agentePrefixo
      ? this.db.prepare(sql).all(filtro.agentePrefixo + "%")
      : this.db.prepare(sql).all()) as any[];

    return rows.map((r) => ({
      id: r.id,
      agente: r.agente,
      modelo: r.modelo,
      inicio: r.inicio_ms ? new Date(r.inicio_ms).toISOString() : "",
      fim: r.fim_ms ? new Date(r.fim_ms).toISOString() : null,
      custo_usd: r.custo_micro_usd ? Number((r.custo_micro_usd / 1_000_000).toFixed(6)) : 0,
      status: r.status,
    }));
  }

  inserirMensagem(m: LinhaMensagem): void {
    const criadoMs = parseDataParaMs(m.criado_em);
    const role = (["user", "assistant", "system", "tool"].includes(m.role) ? m.role : "user") as any;

    // Garante sessão pai para evitar violação de FK
    const existeSessao = this.db.prepare("SELECT 1 FROM sessions WHERE id = ?").get(m.sessao_id);
    if (!existeSessao) {
      this.db
        .prepare(
          `INSERT OR IGNORE INTO sessions (id, workspace, agente, modelo, status, inicio_ms, custo_micro_usd)
           VALUES (?, ?, ?, 'auto', 'executando', ?, 0)`,
        )
        .run(m.sessao_id, this.wsId, m.agente || "agente", criadoMs);
    }

    this.db
      .prepare(
        `INSERT INTO messages (id, session_id, autor, role, tipo, conteudo, mencoes_json, criado_em_ms)
         VALUES (@id, @session_id, @autor, @role, 'conversa', @conteudo, '[]', @criado_em_ms)
         ON CONFLICT (id) DO NOTHING`,
      )
      .run({
        id: m.id,
        session_id: m.sessao_id,
        autor: m.agente || "anon",
        role,
        conteudo: m.conteudo || "",
        criado_em_ms: criadoMs,
      });
  }

  listarMensagens(sessaoId: string): LinhaMensagem[] {
    const rows = this.db
      .prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY criado_em_ms ASC, rowid ASC")
      .all(sessaoId) as any[];

    return rows.map((r) => ({
      id: r.id,
      sessao_id: r.session_id,
      agente: r.autor,
      role: r.role,
      conteudo: r.conteudo,
      criado_em: r.criado_em_ms ? new Date(r.criado_em_ms).toISOString() : null,
    }));
  }

  mensagensDaSessao(sessaoId: string): LinhaMensagem[] {
    return this.listarMensagens(sessaoId);
  }

  upsertExecucao(e: LinhaExecucao): void {
    const inicioMs = parseDataParaMs(e.inicio);
    const fimMs = e.fim ? parseDataParaMs(e.fim) : null;
    const duracaoMs =
      typeof e.duracao_ms === "number"
        ? e.duracao_ms
        : fimMs && inicioMs
          ? Math.max(0, fimMs - inicioMs)
          : null;
    const custoMicroUsd = Math.round(Number(e.custo_usd || 0) * 1_000_000);
    const status = e.status || "executando";

    this.db
      .prepare(
        `INSERT INTO sessions
          (id, workspace, agente, modelo, gatilho_tipo, gatilho_origem, status, inicio_ms, fim_ms, duracao_ms, custo_micro_usd, exit_code, erro)
         VALUES
          (@id, @workspace, @agente, @modelo, @gatilho_tipo, @gatilho_origem, @status, @inicio_ms, @fim_ms, @duracao_ms, @custo_micro_usd, @exit_code, @erro)
         ON CONFLICT (id) DO UPDATE SET
           agente = excluded.agente,
           modelo = excluded.modelo,
           gatilho_tipo = excluded.gatilho_tipo,
           gatilho_origem = excluded.gatilho_origem,
           status = excluded.status,
           fim_ms = excluded.fim_ms,
           duracao_ms = excluded.duracao_ms,
           custo_micro_usd = excluded.custo_micro_usd,
           exit_code = excluded.exit_code,
           erro = excluded.erro`,
      )
      .run({
        id: e.id,
        workspace: this.wsId,
        agente: e.agente || "",
        modelo: e.modelo || "",
        gatilho_tipo: e.gatilho_tipo || "manual",
        gatilho_origem: e.gatilho_origem || "",
        status,
        inicio_ms: inicioMs,
        fim_ms: fimMs,
        duracao_ms: duracaoMs,
        custo_micro_usd: custoMicroUsd,
        exit_code: e.exit_code ?? null,
        erro: e.erro ?? null,
      });
  }

  obterExecucao(id: string): LinhaExecucao | undefined {
    const r = this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as any;
    if (!r) return undefined;
    return {
      id: r.id,
      agente: r.agente,
      modelo: r.modelo,
      gatilho_tipo: r.gatilho_tipo || "manual",
      gatilho_origem: r.gatilho_origem || "",
      status: r.status,
      inicio: r.inicio_ms ? new Date(r.inicio_ms).toISOString() : "",
      fim: r.fim_ms ? new Date(r.fim_ms).toISOString() : null,
      duracao_ms: r.duracao_ms,
      custo_usd: r.custo_micro_usd ? Number((r.custo_micro_usd / 1_000_000).toFixed(6)) : 0,
      exit_code: r.exit_code,
      erro: r.erro,
    };
  }

  atualizarStatusExecucao(id: string, status: string, fim?: string, erro?: string | null): void {
    try {
      const fimMs = fim ? parseDataParaMs(fim) : Date.now();
      this.db
        .prepare(
          `UPDATE sessions
           SET status = @status,
               fim_ms = @fim_ms,
               duracao_ms = CASE WHEN inicio_ms > 0 THEN (@fim_ms - inicio_ms) ELSE duracao_ms END,
               erro = CASE WHEN @erro IS NOT NULL THEN @erro ELSE erro END
           WHERE id = @id`,
        )
        .run({ id, status, fim_ms: fimMs, erro: erro ?? null });
    } catch {}
  }

  listarExecucoes(filtro?: FiltroExecucoes): LinhaExecucao[] {
    const condicoes: string[] = [];
    const params: Record<string, string | number> = {};
    if (filtro?.agente) {
      condicoes.push("agente = @agente");
      params.agente = filtro.agente;
    }
    if (filtro?.gatilho_tipo) {
      condicoes.push("gatilho_tipo = @gatilho_tipo");
      params.gatilho_tipo = filtro.gatilho_tipo;
    }
    if (filtro?.gatilho_origem) {
      condicoes.push("gatilho_origem = @gatilho_origem");
      params.gatilho_origem = filtro.gatilho_origem;
    }
    if (filtro?.status) {
      condicoes.push("status = @status");
      params.status = filtro.status;
    }
    const where = condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";
    const limite = filtro?.limite ? Math.max(1, Math.floor(filtro.limite)) : 100;
    const rows = this.db
      .prepare(`SELECT * FROM sessions ${where} ORDER BY inicio_ms DESC LIMIT ${limite}`)
      .all(params) as any[];

    return rows.map((r) => ({
      id: r.id,
      agente: r.agente,
      modelo: r.modelo,
      gatilho_tipo: r.gatilho_tipo || "manual",
      gatilho_origem: r.gatilho_origem || "",
      status: r.status,
      inicio: r.inicio_ms ? new Date(r.inicio_ms).toISOString() : "",
      fim: r.fim_ms ? new Date(r.fim_ms).toISOString() : null,
      duracao_ms: r.duracao_ms,
      custo_usd: r.custo_micro_usd ? Number((r.custo_micro_usd / 1_000_000).toFixed(6)) : 0,
      exit_code: r.exit_code,
      erro: r.erro,
    }));
  }

  primeirasMensagensUsuario(ids: string[]): Array<{ sessao_id: string; conteudo: string; criado_em: string | null }> {
    if (!ids.length) return [];
    const ph = ids.map(() => "?").join(",");
    const rows = this.db
      .prepare(
        `SELECT session_id, conteudo, criado_em_ms FROM messages
         WHERE role = 'user' AND session_id IN (${ph})
         ORDER BY criado_em_ms ASC, rowid ASC`,
      )
      .all(...ids) as any[];

    return rows.map((r) => ({
      sessao_id: r.session_id,
      conteudo: r.conteudo,
      criado_em: r.criado_em_ms ? new Date(r.criado_em_ms).toISOString() : null,
    }));
  }

  buscar(termo: string): { categoria: string; id: string; descricao: string }[] {
    const padrao = `%${termo.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    return this.db
      .prepare(
        `SELECT categoria, id, descricao FROM registros
         WHERE descricao LIKE @padrao ESCAPE '\\'
            OR conteudo LIKE @padrao ESCAPE '\\'
            OR tags LIKE @padrao ESCAPE '\\'
         ORDER BY categoria, id`,
      )
      .all({ padrao }) as { categoria: string; id: string; descricao: string }[];
  }

  inserirAcaoAgente(acao: LinhaAcaoAgente): void {
    this.gravarAcoesEmLote([acao]);
  }

  listarAcoesAgente(sessaoId: string): LinhaAcaoAgente[] {
    return this.listarAcoesSessao(sessaoId);
  }

  gravarAcoesEmLote(acoes: LinhaAcaoAgente[]): void {
    if (!acoes.length) return;

    const stmtSessao = this.db.prepare(`
      INSERT OR IGNORE INTO sessions (id, workspace, agente, modelo, status, inicio_ms, custo_micro_usd)
      VALUES (?, ?, ?, ?, 'executando', ?, 0)
    `);

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO spans
        (id, session_id, trace_id, span_id, parent_span_id, agente, modelo, workspace,
         tipo_acao, ferramenta, comando_resumo, input_json, output_json,
         status, duracao_ms, prompt_tokens, saida_tokens, custo_micro_usd, erro, criado_em_ms)
      VALUES
        (@id, @session_id, @trace_id, @span_id, @parent_span_id, @agente, @modelo, @workspace,
         @tipo_acao, @ferramenta, @comando_resumo, @input_json, @output_json,
         @status, @duracao_ms, @prompt_tokens, @saida_tokens, @custo_micro_usd, @erro, @criado_em_ms)
    `);

    const tx = this.db.transaction((rows: LinhaAcaoAgente[]) => {
      for (const r of rows) {
        const criadoMs = parseDataParaMs(r.criado_em);
        stmtSessao.run(r.sessao_id, this.wsId, r.agente || "agente", r.modelo || "", criadoMs);

        stmt.run({
          id: r.id,
          session_id: r.sessao_id,
          trace_id: r.trace_id,
          span_id: r.span_id,
          parent_span_id: r.parent_span_id ?? null,
          agente: r.agente || "",
          modelo: r.modelo || "",
          workspace: r.workspace || this.wsId,
          tipo_acao: r.tipo_acao || "tool",
          ferramenta: r.ferramenta ?? null,
          comando_resumo: r.comando_resumo ?? null,
          input_json: r.input_json ?? null,
          output_json: r.output_json ?? null,
          status: r.status || "sucesso",
          duracao_ms: r.duracao_ms ?? 0,
          prompt_tokens: r.tokens_prompt ?? 0,
          saida_tokens: r.tokens_saida ?? 0,
          custo_micro_usd: Math.round(Number(r.custo_usd || 0) * 1_000_000),
          erro: r.erro ?? null,
          criado_em_ms: criadoMs,
        });
      }
    });

    tx(acoes);
  }

  listarAcoesSessao(sessaoId: string, limite = 500): LinhaAcaoAgente[] {
    const rows = this.db
      .prepare(`SELECT * FROM spans WHERE session_id = ? ORDER BY criado_em_ms ASC, rowid ASC LIMIT ?`)
      .all(sessaoId, limite) as any[];
    return rows.map(mapSpanRowParaLinhaAcao);
  }

  listarAcoesPorTrace(traceId: string): LinhaAcaoAgente[] {
    const rows = this.db
      .prepare(`SELECT * FROM spans WHERE trace_id = ? ORDER BY criado_em_ms ASC, rowid ASC`)
      .all(traceId) as any[];
    return rows.map(mapSpanRowParaLinhaAcao);
  }

  resumoTelemetria(filtro?: FiltroTelemetria): {
    total_acoes: number;
    total_falhas: number;
    ferramentas: Array<{ ferramenta: string; total: number; falhas: number; media_ms: number; custo_usd: number }>;
    agentes: Array<{ agente: string; total: number; falhas: number; media_ms: number; custo_usd: number }>;
  } {
    const condicoes: string[] = [];
    const params: Record<string, string | number> = {};
    if (filtro?.sessao_id) { condicoes.push("session_id = @sessao_id"); params.sessao_id = filtro.sessao_id; }
    if (filtro?.trace_id) { condicoes.push("trace_id = @trace_id"); params.trace_id = filtro.trace_id; }
    if (filtro?.agente) { condicoes.push("agente = @agente"); params.agente = filtro.agente; }
    if (filtro?.ferramenta) { condicoes.push("ferramenta = @ferramenta"); params.ferramenta = filtro.ferramenta; }
    if (filtro?.status) { condicoes.push("status = @status"); params.status = filtro.status; }
    if (filtro?.desde) { condicoes.push("criado_em_ms >= @desde_ms"); params.desde_ms = parseDataParaMs(filtro.desde); }
    if (filtro?.ate) { condicoes.push("criado_em_ms <= @ate_ms"); params.ate_ms = parseDataParaMs(filtro.ate); }
    const where = condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";
    const whereFerr = condicoes.length > 0
      ? `WHERE ${condicoes.join(" AND ")} AND ferramenta IS NOT NULL`
      : "WHERE ferramenta IS NOT NULL";

    const totais = this.db.prepare(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN status != 'sucesso' THEN 1 ELSE 0 END) AS falhas FROM spans ${where}`,
    ).get(params) as { total: number; falhas: number } | undefined;

    const ferramentas = this.db.prepare(
      `SELECT ferramenta, COUNT(*) AS total,
              SUM(CASE WHEN status != 'sucesso' THEN 1 ELSE 0 END) AS falhas,
              ROUND(AVG(duracao_ms), 1) AS media_ms,
              ROUND(SUM(custo_micro_usd) / 1000000.0, 6) AS custo_usd
       FROM spans ${whereFerr}
       GROUP BY ferramenta ORDER BY total DESC`,
    ).all(params) as Array<{ ferramenta: string; total: number; falhas: number; media_ms: number; custo_usd: number }>;

    const agentes = this.db.prepare(
      `SELECT agente, COUNT(*) AS total,
              SUM(CASE WHEN status != 'sucesso' THEN 1 ELSE 0 END) AS falhas,
              ROUND(AVG(duracao_ms), 1) AS media_ms,
              ROUND(SUM(custo_micro_usd) / 1000000.0, 6) AS custo_usd
       FROM spans ${where}
       GROUP BY agente ORDER BY total DESC`,
    ).all(params) as Array<{ agente: string; total: number; falhas: number; media_ms: number; custo_usd: number }>;

    return { total_acoes: totais?.total ?? 0, total_falhas: totais?.falhas ?? 0, ferramentas, agentes };
  }

  listarAcoes(filtro?: FiltroTelemetria): LinhaAcaoAgente[] {
    const condicoes: string[] = [];
    const params: Record<string, string | number> = {};
    if (filtro?.sessao_id) { condicoes.push("session_id = @sessao_id"); params.sessao_id = filtro.sessao_id; }
    if (filtro?.trace_id) { condicoes.push("trace_id = @trace_id"); params.trace_id = filtro.trace_id; }
    if (filtro?.agente) { condicoes.push("agente = @agente"); params.agente = filtro.agente; }
    if (filtro?.ferramenta) { condicoes.push("ferramenta = @ferramenta"); params.ferramenta = filtro.ferramenta; }
    if (filtro?.status) { condicoes.push("status = @status"); params.status = filtro.status; }
    if (filtro?.desde) { condicoes.push("criado_em_ms >= @desde_ms"); params.desde_ms = parseDataParaMs(filtro.desde); }
    if (filtro?.ate) { condicoes.push("criado_em_ms <= @ate_ms"); params.ate_ms = parseDataParaMs(filtro.ate); }
    const where = condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";
    const limite = filtro?.limite ? Math.max(1, Math.floor(filtro.limite)) : 200;
    const rows = this.db
      .prepare(`SELECT * FROM spans ${where} ORDER BY criado_em_ms DESC LIMIT ${limite}`)
      .all(params) as any[];

    return rows.map(mapSpanRowParaLinhaAcao);
  }

  fechar(): void {
    if (!this.opencorp) {
      try {
        this.db.close();
      } catch {}
    }
  }
}
