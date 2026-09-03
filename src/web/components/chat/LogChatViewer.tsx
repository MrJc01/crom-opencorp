import { type Component, createSignal, createMemo, For, Show } from "solid-js";
import {
  Terminal,
  FileText,
  FileCode,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Bot,
  User,
  Copy,
  Check,
  Code2,
  Activity,
  Layers,
} from "lucide-solid";
import { showToast } from "../../ui/Toast";

export interface LogStepAction {
  id: string;
  tipo: "bash" | "read" | "write" | "edit" | "tool";
  comando: string;
  saida?: string;
}

export interface LogChatParsed {
  ordem: string;
  agente: string;
  modelo: string;
  pensamentos: string[];
  acoes: LogStepAction[];
  respostaFinal: string;
}

export function parseExecutionLog(rawLog: string): LogChatParsed {
  if (!rawLog) {
    return {
      ordem: "",
      agente: "",
      modelo: "",
      pensamentos: [],
      acoes: [],
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

  const acoes: LogStepAction[] = [];
  let acaoAtual: LogStepAction | null = null;
  const linhasSaida: string[] = [];
  const blocosTexto: string[] = [];
  let bufferTexto: string[] = [];
  let actionCounter = 0;

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
      if (acaoAtual) {
        acaoAtual.saida = linhasSaida.join("\n").trim();
        acoes.push(acaoAtual);
        linhasSaida.length = 0;
        acaoAtual = null;
      }

      if (bufferTexto.length > 0) {
        const textoJunto = bufferTexto.join("\n").trim();
        if (textoJunto && !textoJunto.startsWith("Wrote file successfully")) {
          blocosTexto.push(textoJunto);
        }
        bufferTexto = [];
      }

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
      acaoAtual.saida = linhasSaida.join("\n").trim();
      acoes.push(acaoAtual);
      linhasSaida.length = 0;
      acaoAtual = null;
      bufferTexto.push(l);
      continue;
    }

    if (acaoAtual) {
      linhasSaida.push(l);
    } else if (trim) {
      bufferTexto.push(l);
    }
  }

  if (acaoAtual) {
    acaoAtual.saida = linhasSaida.join("\n").trim();
    acoes.push(acaoAtual);
  }

  if (bufferTexto.length > 0) {
    const textoJunto = bufferTexto.join("\n").trim();
    if (textoJunto) blocosTexto.push(textoJunto);
  }

  const pensamentos: string[] = [];
  let respostaFinal = "";

  if (blocosTexto.length > 1) {
    respostaFinal = blocosTexto[blocosTexto.length - 1];
    pensamentos.push(...blocosTexto.slice(0, -1));
  } else if (blocosTexto.length === 1) {
    respostaFinal = blocosTexto[0];
  }

  return {
    ordem: ordem.trim(),
    agente: agente.trim(),
    modelo: modelo.trim(),
    pensamentos,
    acoes,
    respostaFinal,
  };
}

export interface LogChatViewerProps {
  log: string;
  agente?: string;
  modelo?: string;
  status?: string;
  quando?: string | null;
  gatilho?: { tipo: string; origem: string };
  duracaoMs?: number | null;
}

export const LogChatViewer: Component<LogChatViewerProps> = (props) => {
  const parsed = createMemo(() => parseExecutionLog(props.log));
  const [acoesExpandidas, setAcoesExpandidas] = createSignal(true);
  const [pensamentoExpandido, setPensamentoExpandido] = createSignal(true);
  const [expandidos, setExpandidos] = createSignal<Record<string, boolean>>({});
  const [copiadoId, setCopiadoId] = createSignal<string | null>(null);

  const toggleSaida = (id: string) => {
    setExpandidos((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copiarTexto = async (texto: string, id: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiadoId(id);
      setTimeout(() => setCopiadoId(null), 2000);
      showToast("Copiado!", "info");
    } catch {
      showToast("Falha ao copiar", "aviso");
    }
  };

  const agenteNome = () => parsed().agente || props.agente || "agente";
  const modeloNome = () => parsed().modelo || props.modelo || "";

  return (
    <div class="flex flex-col space-y-4 p-1">
      {/* 1. MENSAGEM DO USUÁRIO / GATILHO (BALÃO À DIREITA) */}
      <div class="flex justify-end">
        <div class="max-w-[85%] rounded-2xl bg-zinc-900/90 border border-zinc-800 p-4 shadow-sm space-y-2">
          <div class="flex items-center justify-between gap-3 text-xs text-zinc-400 border-b border-zinc-800/60 pb-2">
            <div class="flex items-center gap-1.5 font-medium text-zinc-300">
              <User size={13} class="text-blue-400" />
              <span>Ordem de Execução</span>
            </div>
            <Show when={props.gatilho}>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-mono bg-blue-950/60 text-blue-300 border border-blue-800/50">
                {props.gatilho?.tipo}: {props.gatilho?.origem}
              </span>
            </Show>
          </div>

          <div class="text-xs text-zinc-200 leading-relaxed font-sans select-text">
            {parsed().ordem ||
              "Execução autônoma disparada pelo cron/scheduler do workspace."}
          </div>

          <Show when={props.quando}>
            <div class="text-[10px] text-zinc-500 font-mono text-right">
              {new Date(props.quando!).toLocaleTimeString("pt-BR")}
            </div>
          </Show>
        </div>
      </div>

      {/* 2. MENSAGEM DO AGENTE / ASSISTENTE (CORPO DO CHAT) */}
      <div class="flex items-start gap-3 w-full">
        {/* Avatar do Agente */}
        <div class="relative flex-shrink-0 mt-1">
          <div class="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-blue-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-md">
            <Bot size={18} />
          </div>
          <Show when={props.status === "executando"}>
            <span class="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-blue-500 ring-2 ring-zinc-900 animate-ping" />
            <span class="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-blue-500 ring-2 ring-zinc-900" />
          </Show>
        </div>

        {/* Conteúdo do Turno do Agente */}
        <div class="flex-1 min-w-0 space-y-3">
          {/* Cabeçalho do Agente */}
          <div class="flex flex-wrap items-center gap-2 text-xs">
            <span class="font-semibold text-zinc-100 font-mono">
              @{agenteNome()}
            </span>
            <Show when={modeloNome()}>
              <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700/60 truncate max-w-xs">
                {modeloNome()}
              </span>
            </Show>
            <Show when={props.status === "executando"}>
              <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40 animate-pulse">
                ● AO VIVO
              </span>
            </Show>
            <Show when={props.status === "concluido"}>
              <span class="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <CheckCircle2 size={11} /> Concluído
              </span>
            </Show>
            <Show when={props.status === "falhou"}>
              <span class="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                <XCircle size={11} /> Falhou
              </span>
            </Show>
          </div>

          {/* CARD DE AÇÕES / TOOLS EXECUTADAS */}
          <Show when={parsed().acoes.length > 0}>
            <div class="rounded-xl border border-zinc-800 bg-zinc-950/60 overflow-hidden shadow-sm">
              <button
                type="button"
                onClick={() => setAcoesExpandidas(!acoesExpandidas())}
                class="w-full flex items-center justify-between p-3 text-xs text-zinc-300 hover:bg-zinc-900/50 transition-colors font-mono cursor-pointer"
              >
                <div class="flex items-center gap-2 font-medium">
                  <Terminal size={14} class="text-amber-400" />
                  <span>Ações & Ferramentas Executadas</span>
                  <span class="px-1.5 py-0.2 rounded text-[10px] bg-zinc-800 text-zinc-400">
                    {parsed().acoes.length}
                  </span>
                </div>
                <div class="flex items-center gap-1 text-[11px] text-zinc-500">
                  <span>{acoesExpandidas() ? "Recolher" : "Expandir"}</span>
                  <Show when={acoesExpandidas()} fallback={<ChevronDown size={14} />}>
                    <ChevronUp size={14} />
                  </Show>
                </div>
              </button>

              <Show when={acoesExpandidas()}>
                <div class="border-t border-zinc-800/80 divide-y divide-zinc-900/80 max-h-96 overflow-y-auto scrollbar-thin">
                  <For each={parsed().acoes}>
                    {(act) => {
                      const temSaida = () => Boolean(act.saida && act.saida.trim());
                      const aberta = () => Boolean(expandidos()[act.id]);

                      return (
                        <div class="p-2.5 hover:bg-zinc-900/30 transition-colors space-y-1.5">
                          <div class="flex items-start justify-between gap-2 text-xs font-mono">
                            <div class="flex items-start gap-2 min-w-0">
                              <span
                                class={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider flex-shrink-0 mt-0.5 ${
                                  act.tipo === "bash"
                                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                    : act.tipo === "read"
                                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                                    : act.tipo === "write"
                                    ? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                                    : "bg-zinc-800 text-zinc-300"
                                }`}
                              >
                                {act.tipo}
                              </span>
                              <span class="text-zinc-200 break-all select-text font-mono text-[11px]">
                                {act.comando}
                              </span>
                            </div>

                            <Show when={temSaida()}>
                              <button
                                type="button"
                                onClick={() => toggleSaida(act.id)}
                                class="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-200 px-1.5 py-0.5 rounded hover:bg-zinc-800 transition-colors flex-shrink-0 cursor-pointer"
                              >
                                <span>{aberta() ? "Ocultar" : "Saída"}</span>
                                <Show when={aberta()} fallback={<ChevronDown size={11} />}>
                                  <ChevronUp size={11} />
                                </Show>
                              </button>
                            </Show>
                          </div>

                          {/* Bloco de Saída Expansível */}
                          <Show when={temSaida() && aberta()}>
                            <div class="relative mt-1">
                              <pre class="bg-black/90 p-3 rounded-lg border border-zinc-800 text-[10px] font-mono text-zinc-400 overflow-x-auto max-h-48 whitespace-pre-wrap leading-relaxed select-text scrollbar-thin">
                                {act.saida}
                              </pre>
                              <button
                                type="button"
                                onClick={() => copiarTexto(act.saida!, act.id)}
                                class="absolute top-2 right-2 p-1 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 transition-colors cursor-pointer"
                                title="Copiar saída"
                              >
                                <Show
                                  when={copiadoId() === act.id}
                                  fallback={<Copy size={11} />}
                                >
                                  <Check size={11} class="text-emerald-400" />
                                </Show>
                              </button>
                            </div>
                          </Show>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </Show>
            </div>
          </Show>

          {/* CARD DE RACIOCÍNIO INTERMEDIÁRIO / PENSAMENTO */}
          <Show when={parsed().pensamentos.length > 0}>
            <div class="rounded-xl border border-purple-900/40 bg-purple-950/10 p-3 space-y-2">
              <button
                type="button"
                onClick={() => setPensamentoExpandido(!pensamentoExpandido())}
                class="w-full flex items-center justify-between text-xs text-purple-300 font-medium cursor-pointer"
              >
                <div class="flex items-center gap-1.5">
                  <Sparkles size={14} class="text-purple-400" />
                  <span>Raciocínio Intermediário da IA</span>
                </div>
                <Show when={pensamentoExpandido()} fallback={<ChevronDown size={14} />}>
                  <ChevronUp size={14} />
                </Show>
              </button>

              <Show when={pensamentoExpandido()}>
                <div class="text-xs text-purple-200/90 italic font-sans leading-relaxed space-y-1.5 pt-1 border-t border-purple-900/30 select-text">
                  <For each={parsed().pensamentos}>
                    {(pens) => <p>{pens}</p>}
                  </For>
                </div>
              </Show>
            </div>
          </Show>

          {/* RESPOSTA PRINCIPAL / CONTEÚDO FINAL */}
          <Show when={parsed().respostaFinal}>
            <div class="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 text-xs text-zinc-100 leading-relaxed font-sans space-y-2 select-text shadow-sm whitespace-pre-wrap break-words">
              {parsed().respostaFinal}
            </div>
          </Show>

          {/* INDICADOR DE STREAMING AO VIVO */}
          <Show when={props.status === "executando"}>
            <div class="flex items-center gap-2.5 p-3 rounded-xl bg-blue-950/20 border border-blue-800/40 text-xs text-blue-300">
              <span class="h-2 w-2 rounded-full bg-blue-400 animate-ping flex-shrink-0" />
              <span class="font-medium">
                Agente trabalhando ao vivo... (recebendo atualizações contínuas)
              </span>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
};
