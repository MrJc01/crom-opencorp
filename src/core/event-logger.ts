import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { eventBus, type EventoBus } from "./event-bus.js";
import { opencorpHome } from "../utils/paths.js";

export type NivelLog = "info" | "aviso" | "erro";

export interface LogEntry {
  ts: string;
  nivel: NivelLog;
  tipo: string;
  workspace: string;
  resumo: string;
  dados: Record<string, unknown>;
}

export class EventLogger {
  private static instancia: EventLogger | null = null;
  private desconectarBus: (() => void) | null = null;

  static obter(): EventLogger {
    if (!EventLogger.instancia) {
      EventLogger.instancia = new EventLogger();
    }
    return EventLogger.instancia;
  }

  iniciar(): void {
    if (this.desconectarBus) return;
    this.desconectarBus = eventBus.on((evento: EventoBus) => {
      this.processarEvento(evento);
    });
  }

  parar(): void {
    if (this.desconectarBus) {
      this.desconectarBus();
      this.desconectarBus = null;
    }
  }

  private inferirNivel(tipo: string, dados: Record<string, unknown>): NivelLog {
    if (
      tipo.includes("erro") ||
      tipo.includes("falhou") ||
      dados.status === "falhou" ||
      dados.erro !== undefined
    ) {
      return "erro";
    }
    if (
      tipo.includes("aviso") ||
      tipo.includes("timeout") ||
      tipo.includes("bloqueado") ||
      dados.status === "cancelado"
    ) {
      return "aviso";
    }
    return "info";
  }

  private inferirResumo(tipo: string, dados: Record<string, unknown>): string {
    switch (tipo) {
      case "sessao-inicio":
        return `Sessão ${dados.sessao_id || ""} iniciada com agente @${dados.agente || ""}`;
      case "sessao-fim":
        return `Sessão ${dados.sessao_id || ""} finalizada (${dados.status || ""}) em ${dados.duracao_ms ? Math.round(Number(dados.duracao_ms) / 1000) + "s" : "-"}`;
      case "task.criada":
        return `Task criada: "${dados.titulo || dados.id || ""}"`;
      case "task.movida":
        return `Task ${dados.task_id || ""} movida de ${dados.de} para ${dados.para}`;
      case "task.concluida":
        return `Task ${dados.task_id || ""} concluída`;
      case "doc.criado":
        return `Documento criado: ${dados.categoria}/${dados.doc_id || ""} por ${dados.criado_por || ""}`;
      case "doc.atualizado":
        return `Documento atualizado: ${dados.categoria}/${dados.doc_id || ""}`;
      case "task.mensagem":
        return `Mensagem na task ${dados.task_id || ""} por ${dados.autor || ""}`;
      case "hook.executado":
        return `Hook ${dados.hook || ""} disparado (alvo: ${dados.alvo || ""})`;
      case "flow-inicio":
        return `Fluxo ${dados.flow || ""} iniciado (${dados.exec_id || ""})`;
      case "flow-no":
        return `Nó "${dados.no || ""}" do fluxo ${dados.flow || ""}: ${dados.status || ""}`;
      case "secretario.iniciado":
        return `Secretário iniciado na porta ${dados.porta || ""}`;
      case "secretario.erro":
        return `Erro no Secretário: ${dados.erro || ""}`;
      default:
        return dados.resumo ? String(dados.resumo) : `Evento ${tipo}`;
    }
  }

  private processarEvento(ev: EventoBus): void {
    const ws = (ev.dados.workspace as string) || (ev.dados.ws as string) || "global";
    const nivel = this.inferirNivel(ev.tipo, ev.dados);
    const resumo = this.inferirResumo(ev.tipo, ev.dados);

    const entrada: LogEntry = {
      ts: ev.em || new Date().toISOString(),
      nivel,
      tipo: ev.tipo,
      workspace: ws,
      resumo,
      dados: ev.dados,
    };

    this.anexar(entrada, ev.dados.ws_path as string | undefined);
  }

  registrar(
    entrada: Omit<LogEntry, "ts"> & { ts?: string },
    wsPath?: string,
  ): void {
    const completa: LogEntry = {
      ts: entrada.ts || new Date().toISOString(),
      nivel: entrada.nivel,
      tipo: entrada.tipo,
      workspace: entrada.workspace || "global",
      resumo: entrada.resumo,
      dados: entrada.dados || {},
    };
    this.anexar(completa, wsPath);
  }

  private anexar(entrada: LogEntry, wsPath?: string): void {
    const linha = JSON.stringify(entrada) + "\n";

    // 1. Log global em ~/.opencorp/logs/events.jsonl
    try {
      const globalLogDir = join(opencorpHome(), "logs");
      mkdirSync(globalLogDir, { recursive: true });
      appendFileSync(join(globalLogDir, "events.jsonl"), linha, "utf8");
    } catch {}

    // 2. Log local no workspace se caminho fornecido ou cognoscível
    if (wsPath && existsSync(wsPath)) {
      try {
        const wsLogDir = join(wsPath, ".opencorp", "logs");
        mkdirSync(wsLogDir, { recursive: true });
        appendFileSync(join(wsLogDir, "events.jsonl"), linha, "utf8");
      } catch {}
    } else if (entrada.workspace && entrada.workspace !== "global") {
      try {
        const possivelWs = join(opencorpHome(), "workspaces", entrada.workspace);
        if (existsSync(possivelWs)) {
          const wsLogDir = join(possivelWs, ".opencorp", "logs");
          mkdirSync(wsLogDir, { recursive: true });
          appendFileSync(join(wsLogDir, "events.jsonl"), linha, "utf8");
        }
      } catch {}
    }
  }

  lerLogs(
    wsPath: string | null,
    filtros: {
      limite?: number;
      nivel?: string;
      tipo?: string;
    } = {},
  ): LogEntry[] {
    const caminhos: string[] = [];

    if (wsPath) {
      caminhos.push(join(wsPath, ".opencorp", "logs", "events.jsonl"));
    }
    caminhos.push(join(opencorpHome(), "logs", "events.jsonl"));

    let arquivoAlvo: string | null = null;
    for (const c of caminhos) {
      if (existsSync(c)) {
        arquivoAlvo = c;
        break;
      }
    }

    if (!arquivoAlvo) return [];

    try {
      const conteudo = readFileSync(arquivoAlvo, "utf8");
      const linhas = conteudo.trim().split("\n").filter(Boolean);
      const entradas: LogEntry[] = [];

      for (let i = linhas.length - 1; i >= 0; i--) {
        try {
          const entry = JSON.parse(linhas[i]!) as LogEntry;
          if (filtros.nivel && entry.nivel !== filtros.nivel.toLowerCase()) {
            continue;
          }
          if (filtros.tipo && !entry.tipo.toLowerCase().includes(filtros.tipo.toLowerCase())) {
            continue;
          }
          entradas.push(entry);
          if (filtros.limite && entradas.length >= filtros.limite) {
            break;
          }
        } catch {}
      }

      return entradas.reverse();
    } catch {
      return [];
    }
  }

  obterCaminhoLog(wsPath: string | null): string {
    if (wsPath && existsSync(join(wsPath, ".opencorp", "logs", "events.jsonl"))) {
      return join(wsPath, ".opencorp", "logs", "events.jsonl");
    }
    return join(opencorpHome(), "logs", "events.jsonl");
  }
}

export const eventLogger = EventLogger.obter();
eventLogger.iniciar();
