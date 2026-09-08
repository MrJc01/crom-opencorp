import { type Component, createMemo, For, Show } from "solid-js";
import { Bot, Sparkles, Check, X, Clock } from "lucide-solid";
import { SessionTurn, type ChatMensagem, type TurnoPasso } from "./SessionTurn";
import { UniversalChat } from "./UniversalChat";

// ─── Types ────────────────────────────────────────────────────────────
export interface LogStepAction {
  id: string;
  tipo: "bash" | "read" | "write" | "edit" | "tool";
  comando: string;
  saida?: string;
}

/** A single chronological event from the execution log. */
export type LogEvento =
  | { kind: "texto"; conteudo: string }
  | { kind: "acao"; acao: LogStepAction };

export interface LogChatParsed {
  ordem: string;
  agente: string;
  modelo: string;
  /** @deprecated Use eventosCronologicos for ordered rendering. */
  pensamentos: string[];
  /** @deprecated Use eventosCronologicos for ordered rendering. */
  acoes: LogStepAction[];
  /** Chronological sequence of all events (text + actions) as they appear in the log. */
  eventosCronologicos: LogEvento[];
  respostaFinal: string;
}

// ─── Log Parser (preserves chronological order) ───────────────────────
export function parseExecutionLog(rawLog: string): LogChatParsed {
  if (!rawLog) {
    return {
      ordem: "",
      agente: "",
      modelo: "",
      pensamentos: [],
      acoes: [],
      eventosCronologicos: [],
      respostaFinal: "",
    };
  }

  // Remove caracteres de escape ANSI
  const limpo = rawLog.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "");
  const linhas = limpo.split("\n");

  let ordem = "";
  let agente = "";
  let modelo = "";
  let capturandoOrdem = false;

  // Chronological list — the single source of truth for ordering
  const eventos: LogEvento[] = [];

  // Legacy arrays kept for backwards compat
  const acoes: LogStepAction[] = [];
  const pensamentos: string[] = [];

  let acaoAtual: LogStepAction | null = null;
  const linhasSaida: string[] = [];
  let bufferTexto: string[] = [];
  let actionCounter = 0;

  /** Flush pending text buffer into `eventos` (and legacy `pensamentos`). */
  const flushTexto = () => {
    if (bufferTexto.length === 0) return;
    const textoJunto = bufferTexto.join("\n").trim();
    if (textoJunto && !textoJunto.startsWith("Wrote file successfully")) {
      eventos.push({ kind: "texto", conteudo: textoJunto });
      pensamentos.push(textoJunto);
    }
    bufferTexto = [];
  };

  /** Flush pending action into `eventos` (and legacy `acoes`). */
  const flushAcao = () => {
    if (!acaoAtual) return;
    acaoAtual.saida = linhasSaida.join("\n").trim();
    acoes.push(acaoAtual);
    eventos.push({ kind: "acao", acao: acaoAtual });
    linhasSaida.length = 0;
    acaoAtual = null;
  };

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    const trim = l.trim();

    // Headers do opencorp (# sessão, # agente, # ordem)
    if (trim.startsWith("# ")) {
      if (trim.startsWith("# agente:")) {
        const match = trim.match(/# agente:\s*([^·\n]+)(?:·\s*modelo:\s*([^·\n]+))?/);
        if (match) {
          agente = match[1]?.trim() || "";
          modelo = match[2]?.trim() || "";
        }
      } else if (trim.startsWith("# ordem:")) {
        ordem = trim.replace("# ordem:", "").trim();
        capturandoOrdem = true;
      } else if (capturandoOrdem) {
        ordem += " " + trim.replace(/^#\s*/, "");
      }
      continue;
    } else if (capturandoOrdem && !trim) {
      capturandoOrdem = false;
      continue;
    }

    // Turno do opencode (ex: "> executor-padrao · nvidia/nemotron...")
    if (trim.startsWith("> ")) {
      const parts = trim.substring(2).split("·");
      if (!agente && parts[0]) agente = parts[0].trim();
      if (!modelo && parts[1]) modelo = parts[1].trim();
      continue;
    }

    // Ações e ferramentas
    if (
      trim.startsWith("$ ") ||
      trim.startsWith("→ Read ") ||
      trim.startsWith("← Write ") ||
      trim.startsWith("→ Edit ")
    ) {
      // Flush any pending action and text BEFORE this new action
      flushAcao();
      flushTexto();

      actionCounter++;
      if (trim.startsWith("$ ")) {
        acaoAtual = {
          id: `act-${actionCounter}`,
          tipo: "bash",
          comando: trim.substring(2),
        };
      } else if (trim.startsWith("→ Read ")) {
        acaoAtual = {
          id: `act-${actionCounter}`,
          tipo: "read",
          comando: trim.substring(7),
        };
      } else if (trim.startsWith("← Write ")) {
        acaoAtual = {
          id: `act-${actionCounter}`,
          tipo: "write",
          comando: trim.substring(8),
        };
      } else if (trim.startsWith("→ Edit ")) {
        acaoAtual = {
          id: `act-${actionCounter}`,
          tipo: "edit",
          comando: trim.substring(7),
        };
      }
      continue;
    }

    // Heurística: texto explicativo gerado pelo agente após output de comando
    const ehTextoAgente = /^(GA4\/GTM|Vou |Agora |Post |Com isto|Task |Registro:|Publicado:|Conclusão:|Resumo:)/.test(
      trim,
    );
    if (acaoAtual && ehTextoAgente) {
      flushAcao();
      bufferTexto.push(l);
      continue;
    }

    if (acaoAtual) {
      linhasSaida.push(l);
    } else if (trim) {
      bufferTexto.push(l);
    }
  }

  // Flush remaining
  flushAcao();
  flushTexto();

  // Determine resposta final = last text event (if any)
  let respostaFinal = "";
  const textEvents = eventos.filter((e) => e.kind === "texto");
  if (textEvents.length > 0) {
    respostaFinal = (textEvents[textEvents.length - 1] as { kind: "texto"; conteudo: string }).conteudo;
  }

  return {
    ordem: ordem.trim(),
    agente: agente.trim(),
    modelo: modelo.trim(),
    pensamentos,
    acoes,
    eventosCronologicos: eventos,
    respostaFinal,
  };
}

// ─── Chronological Log → ChatMensagem[] Converter ─────────────────────
// Converts a raw log into ChatMensagem[] using the chronological event list,
// so SessionTurn renders thoughts and actions interleaved in exact log order.

export function parseLogToMensagens(
  rawLog: string,
  meta?: {
    agente?: string;
    modelo?: string;
    status?: string;
    quando?: string | null;
    gatilho?: { tipo: string; origem: string };
  }
): ChatMensagem[] {
  const parsed = parseExecutionLog(rawLog);
  const mensagens: ChatMensagem[] = [];

  // 1. Mensagem do USUÁRIO = a "ordem" de execução
  const ordemTexto = parsed.ordem
    || (meta?.gatilho
      ? `[${meta.gatilho.tipo}] ${meta.gatilho.origem}`
      : "Execução autônoma disparada pelo cron/scheduler do workspace.");

  mensagens.push({
    role: "user",
    content: ordemTexto,
    concluida: true,
  });

  // 2. Mensagem do ASSISTENTE — passos na ordem cronológica exata do log
  const passos: TurnoPasso[] = [];
  const totalEventos = parsed.eventosCronologicos.length;

  for (let i = 0; i < totalEventos; i++) {
    const ev = parsed.eventosCronologicos[i];
    if (ev.kind === "texto") {
      // Last text event is the "resposta final" → render as texto, not pensamento
      const isLastText = i === totalEventos - 1
        || parsed.eventosCronologicos.slice(i + 1).every((e) => e.kind !== "texto");
      if (isLastText) {
        passos.push({ tipo: "texto", texto: ev.conteudo });
      } else {
        passos.push({ tipo: "pensamento", texto: ev.conteudo });
      }
    } else {
      const acao = ev.acao;
      passos.push({
        tipo: "acao",
        ferramenta: acao.tipo,
        resumo: acao.comando + (acao.saida ? ` → ${acao.saida.split("\n")[0].substring(0, 80)}` : ""),
        sucesso: true,
      });
    }
  }

  const statusExec = meta?.status || "concluido";

  mensagens.push({
    role: "assistant",
    content: parsed.respostaFinal,
    passos: passos.length > 0 ? passos : undefined,
    pensamento: parsed.pensamentos.length > 0 ? parsed.pensamentos.join("\n\n---\n\n") : undefined,
    concluida: statusExec !== "executando",
  });

  return mensagens;
}


// ─── Props ────────────────────────────────────────────────────────────
export interface LogChatViewerProps {
  log: string;
  agente?: string;
  modelo?: string;
  status?: string;
  quando?: string | null;
  gatilho?: { tipo: string; origem: string };
  duracaoMs?: number | null;
}

// ─── Component ────────────────────────────────────────────────────────
// Now renders as a sequential chat feed using SessionTurn, matching
// the Secretary's layout pattern exactly.

export const LogChatViewer: Component<LogChatViewerProps> = (props) => {
  const mensagens = createMemo(() =>
    parseLogToMensagens(props.log, {
      agente: props.agente,
      modelo: props.modelo,
      status: props.status,
      quando: props.quando,
      gatilho: props.gatilho,
    })
  );

  const agenteNome = createMemo(() => {
    const parsed = parseExecutionLog(props.log);
    return parsed.agente || props.agente || "agente";
  });

  const modeloNome = createMemo(() => {
    const parsed = parseExecutionLog(props.log);
    return parsed.modelo || props.modelo || "";
  });

  const duracaoFmt = createMemo(() => {
    if (!props.duracaoMs) return "";
    const s = Math.floor(props.duracaoMs / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  });

  // No-op para edição de prompt (logs são read-only)
  return (
    <div class="h-full w-full flex flex-col min-h-0">
      <UniversalChat
        modo="leitura"
        podeEnviarPrompt={false}
        mensagens={mensagens()}
        agente={{
          id: agenteNome(),
          nome: agenteNome(),
          modelo: modeloNome(),
          status: props.status,
        }}
        decorridoFmt={duracaoFmt()}
        iframeConfig={{
          habilitado: true,
          aberto: false,
        }}
      />
    </div>
  );
};

