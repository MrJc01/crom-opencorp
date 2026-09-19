import { type Component, createSignal, For, Show } from "solid-js";
import {
  History,
  Terminal,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Play,
} from "lucide-solid";
import { IconButton } from "../../ui/IconButton";
import { Button } from "../../ui/Button";

export interface ExecutionLogsPanelProps {
  fluxoId: string;
  logs: () => any[];
  aberto: () => boolean;
  onToggleAberto: () => void;
  onRecarregar: () => void;
  onRetomarExecucao?: (execId: string) => void;
  visible?: boolean;
}

export const ExecutionLogsPanel: Component<ExecutionLogsPanelProps> = (props) => {
  const [execucaoSelecionadaId, setExecucaoSelecionadaId] = createSignal<string | null>(null);
  const [noLogSelecionadoId, setNoLogSelecionadoId] = createSignal<string | null>(null);
  const [abaLogDetalhe, setAbaLogDetalhe] = createSignal<"dados" | "entrada" | "raw">("dados");

  const logSelecionado = () => {
    const lista = props.logs();
    if (!lista || lista.length === 0) return null;
    const selId = execucaoSelecionadaId();
    if (selId) {
      const achado = lista.find((l: any) => (l.execId || l.id) === selId);
      if (achado) return achado;
    }
    return lista[0];
  };

  return (
    <>
      {/* Painel Inferior de Logs & Dados I/O (Sanfona Estilo n8n) */}
      <Show when={props.aberto()}>
        <div class="h-64 sm:h-72 border-t border-zinc-800 bg-zinc-900/95 flex flex-col shrink-0 z-20 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom duration-150">
          {/* Topo do Painel */}
          <div class="h-9 px-3 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-950/60">
            <div class="flex items-center gap-2">
              <History size={14} class="text-orange-400" />
              <span class="text-xs font-bold text-zinc-200">Execuções & Dados I/O</span>
              <span class="text-[10px] text-zinc-500 font-mono">({props.logs().length} execuções)</span>
            </div>
            <div class="flex items-center gap-1">
              <IconButton size="xs" variant="ghost" onClick={props.onRecarregar} title="Atualizar Logs">
                <RefreshCw size={12} />
              </IconButton>
              <IconButton size="xs" variant="ghost" onClick={props.onToggleAberto} title="Fechar Painel">
                <ChevronDown size={14} />
              </IconButton>
            </div>
          </div>

          {/* Corpo: 3 Colunas (Execuções | Trilha de Nós | Dados I/O) */}
          <div class="flex-1 min-h-0 flex overflow-hidden">
            {/* Coluna da esquerda: lista de execuções */}
            <div class="w-48 sm:w-56 shrink-0 border-r border-zinc-800 overflow-y-auto p-1.5 space-y-1 scrollbar-thin">
              <Show when={props.logs().length === 0}>
                <div class="p-4 text-center text-zinc-500 text-[11px]">Nenhuma execução registrada ainda</div>
              </Show>
              <For each={props.logs()}>
                {(log: any) => {
                  const id = () => log.execId || log.id;
                  const sel = () => (logSelecionado()?.execId || logSelecionado()?.id) === id();
                  return (
                    <button
                      type="button"
                      class={`w-full text-left p-2 rounded-lg text-xs transition-colors cursor-pointer ${
                        sel()
                          ? "bg-orange-600/15 border border-orange-500/40 text-white"
                          : "hover:bg-zinc-800/60 text-zinc-300 border border-transparent"
                      }`}
                      onClick={() => {
                        setExecucaoSelecionadaId(id());
                        setNoLogSelecionadoId(null);
                      }}
                    >
                      <div class="flex items-center justify-between gap-1">
                        <span class="font-mono text-[11px] truncate font-bold text-zinc-200">
                          {id()?.slice(0, 10)}...
                        </span>
                        <span
                          class={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                            log.status === "concluido"
                              ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800"
                              : log.status === "falhou"
                              ? "bg-rose-950/80 text-rose-400 border border-rose-800"
                              : "bg-amber-950/80 text-amber-400 border border-amber-800"
                          }`}
                        >
                          {log.status || "ok"}
                        </span>
                      </div>
                      <div class="text-[9px] text-zinc-500 font-mono mt-0.5">
                        {new Date(log.criadoEm || log.em || Date.now()).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </div>
                      <Show when={log.status === "falhou" && props.onRetomarExecucao}>
                        <div class="mt-1 flex justify-end">
                          <Button
                            size="xs"
                            variant="secondary"
                            class="text-[9px] py-0.5 px-1.5 border-rose-800 text-rose-300 hover:bg-rose-900/40"
                            onClick={(e) => {
                              e.stopPropagation();
                              props.onRetomarExecucao!(id());
                            }}
                          >
                            <Play size={9} class="mr-1" /> Retomar
                          </Button>
                        </div>
                      </Show>
                    </button>
                  );
                }}
              </For>
            </div>

            {/* Coluna central: trilha de nós da execução */}
            <div class="w-48 shrink-0 border-r border-zinc-800 overflow-y-auto scrollbar-thin">
              <Show
                when={logSelecionado()?.nos?.length > 0}
                fallback={<div class="text-center text-zinc-500 text-[10px] py-6">Selecione uma execução</div>}
              >
                <div class="p-1 space-y-0.5">
                  <For each={logSelecionado()?.nos || []}>
                    {(n: any) => {
                      const sel = () => noLogSelecionadoId() === n.id;
                      return (
                        <button
                          type="button"
                          class={`w-full text-left px-2 py-1.5 rounded-lg text-[10px] transition-colors cursor-pointer flex items-center gap-1.5 ${
                            sel() ? "bg-zinc-800 text-zinc-100 ring-1 ring-orange-500/50" : "hover:bg-zinc-800/50 text-zinc-300"
                          }`}
                          onClick={() => {
                            setNoLogSelecionadoId(n.id);
                            setAbaLogDetalhe("dados");
                          }}
                        >
                          <span
                            class={`w-2 h-2 rounded-full shrink-0 ${
                              n.status === "ok" ? "bg-emerald-400" : n.status === "falhou" ? "bg-rose-400" : "bg-zinc-600"
                            }`}
                          />
                          <span class="font-mono truncate">{n.id}</span>
                          <span class="text-zinc-600 text-[9px]">({n.tipo})</span>
                        </button>
                      );
                    }}
                  </For>
                </div>
              </Show>
            </div>

            {/* Coluna da direita: detalhe I/O do nó selecionado */}
            <div class="flex-1 min-w-0 flex flex-col overflow-hidden">
              <Show
                when={noLogSelecionadoId()}
                fallback={
                  <div class="flex-1 flex items-center justify-center text-zinc-500 text-[10px]">
                    Selecione um nó na trilha para inspecionar
                  </div>
                }
              >
                {(() => {
                  const noLog = () => (logSelecionado()?.nos || []).find((n: any) => n.id === noLogSelecionadoId());
                  return (
                    <>
                      {/* Abas */}
                      <div class="h-8 px-2 flex items-center gap-1 border-b border-zinc-800 shrink-0">
                        <button
                          type="button"
                          onClick={() => setAbaLogDetalhe("dados")}
                          class={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                            abaLogDetalhe() === "dados" ? "bg-zinc-800 text-orange-400 font-bold" : "text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          Saída (Output)
                        </button>
                        <button
                          type="button"
                          onClick={() => setAbaLogDetalhe("entrada")}
                          class={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                            abaLogDetalhe() === "entrada" ? "bg-zinc-800 text-orange-400 font-bold" : "text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          Entrada (Input)
                        </button>
                        <button
                          type="button"
                          onClick={() => setAbaLogDetalhe("raw")}
                          class={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                            abaLogDetalhe() === "raw" ? "bg-zinc-800 text-orange-400 font-bold" : "text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          Raw / Erros
                        </button>
                        <div class="flex-1" />
                        <Show when={noLog()}>
                          <span
                            class={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                              noLog()?.status === "ok"
                                ? "bg-emerald-950/50 text-emerald-400"
                                : noLog()?.status === "falhou"
                                ? "bg-rose-950/50 text-rose-400"
                                : "bg-zinc-800 text-zinc-400"
                            }`}
                          >
                            {noLog()?.status} {noLog()?.duracao_ms !== undefined ? `· ${noLog()?.duracao_ms}ms` : ""}
                          </span>
                        </Show>
                      </div>
                      {/* Conteúdo */}
                      <div class="flex-1 overflow-y-auto p-3 scrollbar-thin">
                        <Show when={abaLogDetalhe() === "dados"}>
                          <pre class="text-[11px] font-mono text-zinc-300 whitespace-pre-wrap select-text">
                            {noLog()?.saida
                              ? typeof noLog()?.saida === "string"
                                ? noLog()?.saida
                                : JSON.stringify(noLog()?.saida, null, 2)
                              : "Sem dados de saída"}
                          </pre>
                        </Show>
                        <Show when={abaLogDetalhe() === "entrada"}>
                          <pre class="text-[11px] font-mono text-zinc-300 whitespace-pre-wrap select-text">
                            {noLog()?.entrada
                              ? typeof noLog()?.entrada === "string"
                                ? noLog()?.entrada
                                : JSON.stringify(noLog()?.entrada, null, 2)
                              : "Sem dados de entrada"}
                          </pre>
                        </Show>
                        <Show when={abaLogDetalhe() === "raw"}>
                          <pre class="text-[11px] font-mono text-zinc-300 whitespace-pre-wrap select-text">
                            {noLog()?.erro ? `ERRO: ${noLog()?.erro}\n\n` : ""}
                            {JSON.stringify(noLog(), null, 2)}
                          </pre>
                        </Show>
                      </div>
                    </>
                  );
                })()}
              </Show>
            </div>
          </div>
        </div>
      </Show>

      {/* Botão flutuante para abrir painel de logs (quando fechado) */}
      <Show when={!props.aberto() && (props.visible ?? true)}>
        <button
          type="button"
          id="btn-painel-logs"
          class="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 px-4 py-1.5 rounded-full bg-zinc-900/90 border border-zinc-700 hover:border-orange-500/60 text-xs text-zinc-300 hover:text-orange-400 flex items-center gap-2 transition-all backdrop-blur-md shadow-lg cursor-pointer"
          onClick={props.onToggleAberto}
        >
          <ChevronUp size={13} />
          <Terminal size={12} />
          <span class="font-medium">Logs & Dados I/O</span>
          <Show when={props.logs().length > 0}>
            <span class="px-1.5 py-0.5 rounded-full bg-orange-600/30 text-orange-300 text-[9px] font-bold">
              {props.logs().length}
            </span>
          </Show>
        </button>
      </Show>
    </>
  );
};
