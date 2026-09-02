import { type Component, createSignal, onMount, onCleanup, createEffect, For, Show } from "solid-js";
import {
  History,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  X,
  Terminal,
  Filter,
  Copy,
  Download,
  ListTodo,
  MessageSquare,
  Zap,
  ArrowRight,
  ExternalLink,
} from "lucide-solid";
import { useSearchParams, useNavigate } from "@solidjs/router";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { fetchApi } from "../lib/context";
import { showToast } from "../ui/Toast";

export interface ItemHistorico {
  id: string;
  tipo: "execucao" | "task" | "rotina" | "conversa";
  titulo?: string;
  ordem?: string;
  agente?: string;
  quando?: string | null;
  inicio?: string | null;
  status?: string;
  gatilho?: { tipo: string; origem: string };
  duracao_ms?: number | null;
  custo_usd?: number | null;
  modelo?: string;
}

export const HistoricoView: Component = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [itens, setItens] = createSignal<ItemHistorico[]>([]);
  const [carregando, setCarregando] = createSignal(false);
  const [runSelecionado, setRunSelecionado] = createSignal<any | null>(null);
  const [logRun, setLogRun] = createSignal<string>("");
  const [carregandoLog, setCarregandoLog] = createSignal(false);

  let liveLogInterval: any = null;

  const filtroTipo = () => (searchParams.tipo as string) || "tudo";
  const filtroStatus = () => (searchParams.status as string) || "todos";
  const filtroAgente = () => (searchParams.agente as string) || "todos";

  const carregarHistorico = async () => {
    setCarregando(true);
    try {
      // Buscar do endpoint unificado /historico que agrupa execucoes, tasks, rotinas e conversas
      const dados = await fetchApi<ItemHistorico[]>("/historico?limite=200");
      if (Array.isArray(dados) && dados.length > 0) {
        setItens(dados);
      } else {
        // Fallback para /execucoes caso /historico retorne vazio
        const execs = await fetchApi<any[]>("/execucoes?limite=100");
        const mapeados: ItemHistorico[] = (execs || []).map((e) => ({
          ...e,
          tipo: "execucao",
          quando: e.inicio,
          titulo: e.ordem || e.id,
        }));
        setItens(mapeados);
      }
    } catch {
      try {
        const execs = await fetchApi<any[]>("/execucoes?limite=50");
        const mapeados: ItemHistorico[] = (execs || []).map((e) => ({
          ...e,
          tipo: "execucao",
          quando: e.inicio,
          titulo: e.ordem || e.id,
        }));
        setItens(mapeados);
      } catch {}
    } finally {
      setCarregando(false);
    }
  };

  const buscarLog = async (runId: string) => {
    try {
      const res = await fetchApi<{ id: string; log: string }>(
        `/sessions/${encodeURIComponent(runId)}/log`
      );
      return res?.log || "(Nenhuma saída de log capturada para esta execução)";
    } catch (e: any) {
      return `Erro ao carregar log da execução ${runId}: ${e.message}`;
    }
  };

  const abrirLogPorId = async (runId: string) => {
    setCarregandoLog(true);
    setLogRun("Carregando log da execução...");

    let r = itens().find((item) => item.id === runId);
    if (!r) {
      r = { id: runId, tipo: "execucao", agente: "agente", status: "registrada" };
    }
    setRunSelecionado(r);

    const textoLog = await buscarLog(runId);
    setLogRun(textoLog);
    setCarregandoLog(false);

    if (r.status === "executando") {
      if (liveLogInterval) clearInterval(liveLogInterval);
      liveLogInterval = setInterval(async () => {
        const atualizado = await buscarLog(runId);
        setLogRun(atualizado);
      }, 2500);
    }
  };

  const selecionarItem = (item: ItemHistorico) => {
    if (item.tipo === "task") {
      navigate(`/tasks?task=${encodeURIComponent(item.id)}`);
      return;
    }
    if (item.tipo === "conversa") {
      navigate(`/secretario`);
      return;
    }
    setSearchParams({ run: item.id });
  };

  const fecharLog = () => {
    if (liveLogInterval) {
      clearInterval(liveLogInterval);
      liveLogInterval = null;
    }
    setRunSelecionado(null);
    setLogRun("");
    setSearchParams({ run: undefined });
  };

  const copiarLog = () => {
    navigator.clipboard.writeText(logRun());
    showToast("Log copiado para a área de transferência!", "sucesso");
  };

  const baixarLog = () => {
    const blob = new Blob([logRun()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${runSelecionado()?.id || "exec"}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Reagir a alteração em ?run=
  createEffect(() => {
    const runParam = searchParams.run as string | undefined;
    if (runParam) {
      void abrirLogPorId(runParam);
    } else {
      if (liveLogInterval) {
        clearInterval(liveLogInterval);
        liveLogInterval = null;
      }
      setRunSelecionado(null);
      setLogRun("");
    }
  });

  onMount(() => {
    void carregarHistorico();
  });

  onCleanup(() => {
    if (liveLogInterval) clearInterval(liveLogInterval);
  });

  const itensFiltrados = () => {
    const tp = filtroTipo();
    const st = filtroStatus();
    const ag = filtroAgente();

    return itens().filter((i) => {
      if (tp !== "tudo" && i.tipo !== tp) return false;
      if (st !== "todos" && i.status && i.status !== st) return false;
      if (ag !== "todos" && i.agente && i.agente !== ag) return false;
      return true;
    });
  };

  const agentesUnicos = () => {
    const set = new Set<string>();
    itens().forEach((i) => i.agente && set.add(i.agente));
    return Array.from(set);
  };

  const badgeTipo = (tipo: string) => {
    switch (tipo) {
      case "execucao":
        return <span class="px-1.5 py-0.2 rounded text-[9px] font-mono bg-blue-500/20 text-blue-300 border border-blue-500/30">EXECUÇÃO</span>;
      case "task":
        return <span class="px-1.5 py-0.2 rounded text-[9px] font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30">TASK</span>;
      case "conversa":
        return <span class="px-1.5 py-0.2 rounded text-[9px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">CONVERSA</span>;
      default:
        return <span class="px-1.5 py-0.2 rounded text-[9px] font-mono bg-zinc-800 text-zinc-300">EVENTO</span>;
    }
  };

  return (
    <div class="flex flex-col h-full w-full overflow-hidden p-6 space-y-4 bg-zinc-950">
      {/* Header */}
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-800">
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-xl font-bold text-zinc-100 tracking-tight">Histórico de Atividades</h1>
            <span class="text-[11px] font-mono px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300">
              {itensFiltrados().length} de {itens().length} registros
            </span>
          </div>
          <p class="text-xs text-zinc-400 mt-0.5">
            Linha do tempo auditável de cada chamada a LLM, tarefa concluída, rotina 24h e decisão do Secretário.
          </p>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          {/* Tabs Filtro por Tipo */}
          <div class="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 text-xs">
            <button
              onClick={() => setSearchParams({ tipo: undefined })}
              class={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                filtroTipo() === "tudo" ? "bg-zinc-800 text-zinc-100 font-semibold" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Tudo
            </button>
            <button
              onClick={() => setSearchParams({ tipo: "execucao" })}
              class={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                filtroTipo() === "execucao" ? "bg-zinc-800 text-zinc-100 font-semibold" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Execuções
            </button>
            <button
              onClick={() => setSearchParams({ tipo: "task" })}
              class={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                filtroTipo() === "task" ? "bg-zinc-800 text-zinc-100 font-semibold" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Tasks
            </button>
            <button
              onClick={() => setSearchParams({ tipo: "conversa" })}
              class={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                filtroTipo() === "conversa" ? "bg-zinc-800 text-zinc-100 font-semibold" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Conversas
            </button>
          </div>

          {/* Filtro Status */}
          <div class="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs">
            <Filter size={12} class="text-zinc-400" />
            <select
              class="bg-transparent text-xs text-zinc-300 focus:outline-none cursor-pointer"
              value={filtroStatus()}
              onChange={(e) =>
                setSearchParams({ status: e.currentTarget.value === "todos" ? undefined : e.currentTarget.value })
              }
            >
              <option value="todos" class="bg-zinc-900">Todos status</option>
              <option value="executando" class="bg-zinc-900">Executando</option>
              <option value="concluido" class="bg-zinc-900">Concluído</option>
              <option value="falhou" class="bg-zinc-900">Falhou</option>
              <option value="feito" class="bg-zinc-900">Feito (Task)</option>
              <option value="hitl_pendente" class="bg-zinc-900">HITL Pendente</option>
            </select>
          </div>

          {/* Filtro Agente */}
          <div class="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs">
            <select
              class="bg-transparent text-xs text-zinc-300 focus:outline-none cursor-pointer"
              value={filtroAgente()}
              onChange={(e) =>
                setSearchParams({ agente: e.currentTarget.value === "todos" ? undefined : e.currentTarget.value })
              }
            >
              <option value="todos" class="bg-zinc-900">Todos agentes</option>
              <For each={agentesUnicos()}>
                {(ag) => (
                  <option value={ag} class="bg-zinc-900">
                    @{ag}
                  </option>
                )}
              </For>
            </select>
          </div>

          <Button size="sm" variant="ghost" onClick={carregarHistorico} title="Atualizar">
            <RefreshCw size={13} class={carregando() ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>

      {/* Lista de Registros */}
      <div class="flex-1 overflow-y-auto min-h-0 scrollbar-thin">
        <div class="space-y-2.5 pb-4">
          <For
            each={itensFiltrados()}
            fallback={
              <div class="py-16 text-center text-xs text-zinc-500">
                Nenhum registro encontrado para os filtros selecionados.
              </div>
            }
          >
            {(item) => {
              const emAndamento = item.status === "executando";
              const ok = item.status === "concluido" || item.status === "feito" || item.status === "concluida";
              const hitl = item.status === "hitl_pendente";
              const falhou = item.status === "falhou";

              return (
                <div
                  onClick={() => selecionarItem(item)}
                  class={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-4 text-xs shadow-xs ${
                    searchParams.run === item.id
                      ? "bg-blue-950/40 border-blue-500/80 ring-1 ring-blue-500/40"
                      : emAndamento
                      ? "bg-blue-950/20 border-blue-800/80 hover:border-blue-700"
                      : "bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700"
                  }`}
                >
                  <div class="flex items-center gap-3 min-w-0">
                    <div class="flex-shrink-0">
                      {emAndamento ? (
                        <div class="h-3.5 w-3.5 rounded-full bg-blue-500 animate-ping" />
                      ) : ok ? (
                        <CheckCircle2 size={16} class="text-emerald-400" />
                      ) : hitl ? (
                        <AlertTriangle size={16} class="text-amber-400 animate-pulse" />
                      ) : falhou ? (
                        <XCircle size={16} class="text-rose-400" />
                      ) : (
                        <Clock size={16} class="text-zinc-500" />
                      )}
                    </div>

                    <div class="min-w-0">
                      <div class="flex items-center gap-2 flex-wrap">
                        {badgeTipo(item.tipo)}
                        <Show when={item.agente}>
                          <span class="font-semibold text-zinc-100 font-mono">
                            @{item.agente}
                          </span>
                        </Show>
                        <span class="text-[10px] text-zinc-500 font-mono">({item.id})</span>
                        <Show when={item.status}>
                          <span class="text-[10px] text-zinc-400 capitalize">· {item.status}</span>
                        </Show>
                      </div>

                      <div class="text-[11px] text-zinc-300 truncate max-w-xl mt-0.5 font-sans">
                        {item.titulo || item.ordem || "Registro de atividade no sistema"}
                      </div>
                    </div>
                  </div>

                  <div class="text-right text-[11px] text-zinc-400 font-mono flex-shrink-0 flex items-center gap-3">
                    <div>
                      {item.duracao_ms ? (
                        <div>{(item.duracao_ms / 1000).toFixed(1)}s</div>
                      ) : item.custo_usd ? (
                        <div>US$ {Number(item.custo_usd).toFixed(4)}</div>
                      ) : null}
                      <div class="text-[10px] text-zinc-500">
                        {item.quando ? new Date(item.quando).toLocaleTimeString("pt-BR") : ""}
                      </div>
                    </div>

                    <ArrowRight size={14} class="text-zinc-600 hover:text-zinc-300" />
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </div>

      {/* Modal / Visualizador de Log */}
      <Show when={runSelecionado()}>
        <div class="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div class="bg-zinc-900 border border-zinc-800 rounded-xl max-w-4xl w-full p-5 space-y-4 shadow-2xl max-h-[90vh] flex flex-col">
            {/* Topo do Modal */}
            <div class="flex items-center justify-between border-b border-zinc-800 pb-3 flex-shrink-0">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <Terminal size={17} class="text-emerald-400" />
                  <h2 class="text-sm font-bold text-zinc-100 font-mono truncate">
                    Log da Execução: {runSelecionado()!.id}
                  </h2>
                  <Show when={runSelecionado()!.status === "executando"}>
                    <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40 animate-pulse">
                      STREAMING AO VIVO
                    </span>
                  </Show>
                </div>
                <div class="text-[11px] text-zinc-400 font-mono mt-0.5 flex items-center gap-2">
                  <span>@{runSelecionado()!.agente}</span>
                  <span>·</span>
                  <span class="capitalize text-emerald-400 font-semibold">
                    {runSelecionado()!.status}
                  </span>
                  <Show when={runSelecionado()!.modelo}>
                    <span>·</span>
                    <span class="text-zinc-500 truncate max-w-xs">{runSelecionado()!.modelo}</span>
                  </Show>
                </div>
              </div>

              <div class="flex items-center gap-1.5 flex-shrink-0">
                <Button size="xs" variant="ghost" onClick={copiarLog} title="Copiar log">
                  <Copy size={13} class="mr-1" /> Copiar
                </Button>
                <Button size="xs" variant="ghost" onClick={baixarLog} title="Baixar arquivo .log">
                  <Download size={13} class="mr-1" /> Baixar
                </Button>
                <IconButton size="xs" variant="ghost" onClick={fecharLog} title="Fechar modal (ESC)">
                  <X size={16} />
                </IconButton>
              </div>
            </div>

            {/* Corpo do Terminal de Log */}
            <div class="flex-1 min-h-0 flex flex-col space-y-2">
              <div class="flex items-center justify-between text-[11px] text-zinc-400 px-1 font-mono">
                <span>URL amigável: <code class="text-emerald-400">/historico?run={runSelecionado()!.id}</code></span>
                <span>{logRun().split("\n").length} linhas</span>
              </div>

              <pre class="flex-1 bg-black p-4 rounded-xl border border-zinc-800 text-[11px] font-mono text-zinc-300 overflow-y-auto whitespace-pre-wrap leading-relaxed scrollbar-thin select-text">
                {logRun()}
              </pre>
            </div>

            {/* Rodapé */}
            <div class="pt-2 border-t border-zinc-800 flex justify-end flex-shrink-0">
              <Button size="sm" variant="secondary" onClick={fecharLog}>
                Fechar Log
              </Button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};
