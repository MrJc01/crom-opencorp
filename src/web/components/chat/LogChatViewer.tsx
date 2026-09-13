import { type Component, createMemo, For, Show } from "solid-js";
import { Bot, Sparkles, Check, X, Clock } from "lucide-solid";
import { UniversalChat } from "./UniversalChat";
import { parseExecutionLog, parseLogToMensagens } from "./log-parse.js";

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

  // Log sem nenhum evento parseável (ex.: run arquivado sem saída): em vez de
  // um chat vazio, mostra um estado informativo (o prompt está na caixa
  // "Ordem Original" do modal e o bruto no Terminal Raw).
  const semSaida = createMemo(() => parseExecutionLog(props.log).eventosCronologicos.length === 0);
  const executando = () => props.status === "executando";

  // No-op para edição de prompt (logs são read-only)
  return (
    <div class="h-full w-full flex flex-col min-h-0">
      <Show
        when={!semSaida()}
        fallback={
          <div class="flex-1 flex flex-col items-center justify-center text-center p-8 text-zinc-500 select-none">
            <div class="h-12 w-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-3">
              {executando() ? <Clock size={22} class="text-emerald-400 animate-pulse" /> : <Bot size={22} class="text-zinc-500" />}
            </div>
            <h3 class="text-sm font-semibold text-zinc-300 mb-1">
              {executando() ? "Streaming ao vivo — aguardando a primeira saída…" : "Nenhuma saída capturada para esta execução"}
            </h3>
            <p class="text-xs text-zinc-500 max-w-sm">
              {executando()
                ? "O chat preenche sozinho assim que o agente gerar o primeiro passo."
                : "A ordem original está no topo do visualizador e o log bruto no Terminal Raw."}
            </p>
          </div>
        }
      >
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
      </Show>
    </div>
  );
};

