import { type Component, createSignal, onMount, For, Show } from "solid-js";
import { History, CheckCircle2, XCircle, Clock, AlertTriangle, RefreshCw, X, Terminal, Filter } from "lucide-solid";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { fetchApi } from "../lib/context";

export const HistoricoView: Component = () => {
  const [runs, setRuns] = createSignal<any[]>([]);
  const [filtroStatus, setFiltroStatus] = createSignal("todos");
  const [runSelecionado, setRunSelecionado] = createSignal<any | null>(null);
  const [logRun, setLogRun] = createSignal<string>("");
  const [carregandoLog, setCarregandoLog] = createSignal(false);

  const carregarHistorico = async () => {
    try {
      const dados = await fetchApi<{ ultimos_runs?: any[] }>("/ledger/resumo");
      setRuns(dados.ultimos_runs || []);
    } catch {}
  };

  const abrirLog = async (run: any) => {
    setRunSelecionado(run);
    setCarregandoLog(true);
    setLogRun("Carregando log da execução...");

    try {
      // Buscar log da execução via API de arquivos ou registros
      const res = await fetchApi<any>(`/registries/execucoes/${encodeURIComponent(run.id)}`).catch(() => null);
      if (res && res.extras?.log) {
        setLogRun(res.extras.log);
      } else {
        setLogRun(run.log || "Log não disponível ou execução sem saída capturada.");
      }
    } catch {
      setLogRun(run.log || "Log detalhado arquivado.");
    } finally {
      setCarregandoLog(false);
    }
  };

  onMount(() => {
    void carregarHistorico();
  });

  const runsFiltrados = () => {
    return runs().filter((r) => {
      if (filtroStatus() === "todos") return true;
      return r.status === filtroStatus();
    });
  };

  const totalConcluidos = () => runs().filter((r) => r.status === "concluido").length;
  const totalFalhas = () => runs().filter((r) => r.status === "falhou").length;

  return (
    <div class="flex flex-col h-full w-full overflow-hidden p-6 space-y-4 bg-zinc-950">
      {/* Header */}
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-800">
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-xl font-bold text-zinc-100 tracking-tight">Histórico de Execuções</h1>
            <span class="text-[11px] font-mono px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300">
              {runs().length} registros
            </span>
          </div>
          <p class="text-xs text-zinc-400 mt-0.5">
            Linha do tempo auditável de cada chamada a LLM, ferramenta e script no workspace.
          </p>
        </div>

        <div class="flex items-center gap-2.5">
          {/* Filtro Status */}
          <div class="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs">
            <Filter size={13} class="text-zinc-400" />
            <select
              class="bg-transparent text-xs text-zinc-300 focus:outline-none cursor-pointer"
              value={filtroStatus()}
              onChange={(e) => setFiltroStatus(e.currentTarget.value)}
            >
              <option value="todos" class="bg-zinc-900">Todos status</option>
              <option value="concluido" class="bg-zinc-900">Concluído</option>
              <option value="falhou" class="bg-zinc-900">Falhou</option>
              <option value="hitl_pendente" class="bg-zinc-900">HITL Pendente</option>
            </select>
          </div>

          <Button size="sm" variant="ghost" onClick={carregarHistorico} title="Atualizar">
            <RefreshCw size={13} />
          </Button>
        </div>
      </div>

      {/* Lista de Runs */}
      <div class="flex-1 overflow-y-auto min-h-0 scrollbar-thin">
        <div class="space-y-2.5 pb-4">
          <For
            each={runsFiltrados()}
            fallback={
              <div class="py-16 text-center text-xs text-zinc-500">
                Nenhuma execução encontrada para o filtro selecionado.
              </div>
            }
          >
            {(run) => {
              const ok = run.status === "concluido";
              const hitl = run.status === "hitl_pendente";

              return (
                <div
                  onClick={() => abrirLog(run)}
                  class="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 cursor-pointer transition-all flex items-center justify-between gap-4 text-xs shadow-xs"
                >
                  <div class="flex items-center gap-3 min-w-0">
                    <div class="flex-shrink-0">
                      {ok ? (
                        <CheckCircle2 size={16} class="text-emerald-400" />
                      ) : hitl ? (
                        <AlertTriangle size={16} class="text-amber-400 animate-pulse" />
                      ) : (
                        <XCircle size={16} class="text-rose-400" />
                      )}
                    </div>
                    <div class="min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="font-semibold text-zinc-100 font-mono">
                          @{run.agente || "agente"}
                        </span>
                        <span class="text-[10px] text-zinc-500 font-mono">({run.id})</span>
                      </div>
                      <div class="text-[11px] text-zinc-400 truncate max-w-xl mt-0.5">
                        {run.ordem || "Rotina de agente sem instrução textual"}
                      </div>
                    </div>
                  </div>

                  <div class="text-right text-[11px] text-zinc-400 font-mono flex-shrink-0">
                    <div>
                      {run.duracao_ms ? `${(run.duracao_ms / 1000).toFixed(1)}s` : "—"} ·{" "}
                      <span class="text-zinc-500">
                        {run.custo_estimado ? `US$ ${run.custo_estimado.toFixed(4)}` : "US$ 0.0000"}
                      </span>
                    </div>
                    <div class="text-[10px] text-zinc-500">
                      {run.inicio ? new Date(run.inicio).toLocaleTimeString("pt-BR") : ""}
                    </div>
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </div>

      {/* Modal de Log da Execução */}
      <Show when={runSelecionado()}>
        <div class="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div class="bg-zinc-900 border border-zinc-800 rounded-xl max-w-3xl w-full p-5 space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
            <div class="flex items-center justify-between border-b border-zinc-800 pb-3 flex-shrink-0">
              <div>
                <h2 class="text-sm font-bold text-zinc-100 flex items-center gap-2">
                  <Terminal size={16} class="text-emerald-400" />
                  Log da Execução: {runSelecionado()!.id}
                </h2>
                <span class="text-[11px] text-zinc-400 font-mono">
                  @{runSelecionado()!.agente} · Status: {runSelecionado()!.status}
                </span>
              </div>
              <IconButton size="xs" variant="ghost" onClick={() => setRunSelecionado(null)}>
                <X size={16} />
              </IconButton>
            </div>

            <div class="space-y-3 flex-1 overflow-hidden flex flex-col">
              <div class="text-xs text-zinc-300 bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                <span class="text-zinc-500 block text-[10px] uppercase font-bold mb-1">Instrução</span>
                <p class="font-mono text-[11px]">{runSelecionado()!.ordem || "Sem ordem salva"}</p>
              </div>

              <div class="flex-1 flex flex-col min-h-0">
                <span class="text-zinc-500 block text-[10px] uppercase font-bold mb-1">
                  Saída do Terminal (stdout / stderr)
                </span>
                <pre class="flex-1 bg-black p-3.5 rounded-lg border border-zinc-800 text-[11px] font-mono text-zinc-300 overflow-y-auto whitespace-pre-wrap leading-relaxed scrollbar-thin">
                  {logRun()}
                </pre>
              </div>
            </div>

            <div class="pt-3 border-t border-zinc-800 flex justify-end flex-shrink-0">
              <Button size="sm" variant="secondary" onClick={() => setRunSelecionado(null)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};
