import { type Component, createSignal, onMount, For, Show } from "solid-js";
import { Play, Power, Bot, Search, RefreshCw, X, Shield, Wrench, Eye, Send } from "lucide-solid";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { showToast } from "../ui/Toast";
import { fetchApi } from "../lib/context";

export interface Agente {
  id: string;
  name?: string;
  description?: string;
  model?: string;
  ativo?: boolean;
  system_prompt?: string;
  tools?: string[];
  permissions?: string;
}

export const AgentesView: Component = () => {
  const [agentes, setAgentes] = createSignal<Agente[]>([]);
  const [busca, setBusca] = createSignal("");
  const [executando, setExecutando] = createSignal<string | null>(null);

  // Modal de Execução de Ordem
  const [agenteParaRodar, setAgenteParaRodar] = createSignal<Agente | null>(null);
  const [ordemTexto, setOrdemTexto] = createSignal("");
  const [disparando, setDisparando] = createSignal(false);

  // Modal de Detalhes / Prompt do Agente
  const [agenteDetalhes, setAgenteDetalhes] = createSignal<Agente | null>(null);

  const carregarAgentes = async () => {
    try {
      const lista = await fetchApi<Agente[]>("/agents");
      setAgentes(lista || []);
    } catch {}
  };

  const toggleAtivo = async (agente: Agente) => {
    const novoStatus = !(agente.ativo !== false);
    try {
      await fetchApi(`/agents/${encodeURIComponent(agente.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ ativo: novoStatus }),
      });
      setAgentes((prev) =>
        prev.map((a) => (a.id === agente.id ? { ...a, ativo: novoStatus } : a))
      );
      showToast(`${agente.name || agente.id} ${novoStatus ? "ativado" : "desativado"}`, "info");
    } catch (err: any) {
      showToast("Erro ao alterar status: " + err.message, "erro");
    }
  };

  const abrirModalExecucao = (agente: Agente) => {
    setAgenteParaRodar(agente);
    setOrdemTexto("");
  };

  const dispararOrdem = async () => {
    const ag = agenteParaRodar();
    const texto = ordemTexto().trim();
    if (!ag || !texto) return;
    setDisparando(true);

    try {
      await fetchApi(`/agents/${encodeURIComponent(ag.id)}/run`, {
        method: "POST",
        body: JSON.stringify({ ordem: texto }),
      });
      showToast(`Execução de @${ag.id} iniciada com sucesso!`, "sucesso");
      setAgenteParaRodar(null);
    } catch (err: any) {
      showToast(`Erro ao rodar agente: ${err.message}`, "erro");
    } finally {
      setDisparando(false);
    }
  };

  onMount(() => {
    void carregarAgentes();
  });

  const agentesFiltrados = () => {
    const t = busca().toLowerCase().trim();
    if (!t) return agentes();
    return agentes().filter(
      (a) =>
        (a.name || a.id).toLowerCase().includes(t) ||
        (a.description || "").toLowerCase().includes(t) ||
        (a.model || "").toLowerCase().includes(t)
    );
  };

  const totalAtivos = () => agentes().filter((a) => a.ativo !== false).length;

  return (
    <div class="flex flex-col h-full w-full overflow-hidden p-6 space-y-4 bg-zinc-950">
      {/* Header */}
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-800">
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-xl font-bold text-zinc-100 tracking-tight">Catálogo de Agentes</h1>
            <span class="text-[11px] font-mono px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-emerald-400">
              {totalAtivos()} ativos de {agentes().length}
            </span>
          </div>
          <p class="text-xs text-zinc-400 mt-0.5">
            Especialistas autônomos que realizam tarefas, rondas, auditorias e reuniões.
          </p>
        </div>

        <div class="flex items-center gap-2.5">
          <div class="relative">
            <Search size={13} class="text-zinc-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Buscar por nome ou papel..."
              value={busca()}
              onInput={(e) => setBusca(e.currentTarget.value)}
              class="bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 w-56"
            />
          </div>
          <Button size="sm" variant="ghost" onClick={carregarAgentes} title="Recarregar agentes">
            <RefreshCw size={13} />
          </Button>
        </div>
      </div>

      {/* Grid de Cards de Agentes */}
      <div class="flex-1 overflow-y-auto min-h-0 scrollbar-thin">
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-4">
          <For each={agentesFiltrados()}>
            {(agente) => {
              const ativo = agente.ativo !== false;

              return (
                <div
                  class={`p-4 rounded-xl border flex flex-col justify-between transition-all shadow-xs ${
                    ativo
                      ? "bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700"
                      : "bg-zinc-950/40 border-zinc-900 opacity-60 hover:opacity-80"
                  }`}
                >
                  <div class="space-y-2.5">
                    {/* Topo do Card */}
                    <div class="flex items-start justify-between gap-3">
                      <div class="flex items-center gap-2.5 min-w-0">
                        <div
                          class={`h-9 w-9 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                            ativo
                              ? "bg-emerald-950/70 border border-emerald-500/40 text-emerald-300"
                              : "bg-zinc-800 text-zinc-500"
                          }`}
                        >
                          <Bot size={18} />
                        </div>
                        <div class="min-w-0">
                          <h2 class="text-xs font-bold text-zinc-100 truncate">
                            {agente.name || agente.id}
                          </h2>
                          <span class="text-[10px] text-emerald-400 font-mono">@{agente.id}</span>
                        </div>
                      </div>

                      {/* Botão Liga/Desliga */}
                      <button
                        onClick={() => toggleAtivo(agente)}
                        class={`px-2 py-1 rounded-md text-[10px] font-semibold border flex items-center gap-1 transition-all cursor-pointer ${
                          ativo
                            ? "bg-emerald-950/40 border-emerald-800 text-emerald-400 hover:bg-emerald-900/50"
                            : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
                        }`}
                        title={ativo ? "Desativar agente" : "Ativar agente"}
                      >
                        <Power size={10} />
                        {ativo ? "Ativo" : "Inativo"}
                      </button>
                    </div>

                    {/* Descrição */}
                    <p class="text-xs text-zinc-400 line-clamp-3 leading-relaxed min-h-[3.2rem]">
                      {agente.description || "Agente autônomo especialista do workspace."}
                    </p>

                    {/* Tags e Modelo */}
                    <div class="flex items-center justify-between text-[10px] text-zinc-500 pt-1 border-t border-zinc-800/50">
                      <span class="truncate max-w-[170px] font-mono text-zinc-400">
                        {agente.model || "nemotron-3-ultra:free"}
                      </span>
                      <span class="px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-400 font-mono">
                        {agente.permissions || "level-2"}
                      </span>
                    </div>
                  </div>

                  {/* Ações Inferiores */}
                  <div class="flex items-center gap-2 pt-3 mt-2 border-t border-zinc-800/50">
                    <Button
                      size="xs"
                      variant="ghost"
                      class="flex-1 text-zinc-400 hover:text-zinc-200"
                      onClick={() => setAgenteDetalhes(agente)}
                    >
                      <Eye size={12} class="mr-1" /> Inspecionar
                    </Button>
                    <Button
                      size="xs"
                      variant="primary"
                      class="flex-1"
                      disabled={!ativo}
                      onClick={() => abrirModalExecucao(agente)}
                    >
                      <Play size={11} class="mr-1 fill-current" /> Executar
                    </Button>
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </div>

      {/* Modal de Execução de Ordem */}
      <Show when={agenteParaRodar()}>
        <div class="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div class="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div class="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h2 class="text-sm font-bold text-zinc-100">
                  Executar Ordem com @{agenteParaRodar()!.id}
                </h2>
                <p class="text-[11px] text-zinc-400 mt-0.5">
                  Dispare uma instrução direta em background para este agente.
                </p>
              </div>
              <IconButton size="xs" variant="ghost" onClick={() => setAgenteParaRodar(null)}>
                <X size={16} />
              </IconButton>
            </div>

            <div class="space-y-3">
              <label class="block text-xs font-medium text-zinc-300">
                Instrução / Ordem para o Agente *
              </label>
              <textarea
                rows={4}
                placeholder="Descreva o que o agente deve analisar, auditar ou executar..."
                value={ordemTexto()}
                onInput={(e) => setOrdemTexto(e.currentTarget.value)}
                class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 resize-none font-mono"
              />
            </div>

            <div class="pt-3 border-t border-zinc-800 flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setAgenteParaRodar(null)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                variant="primary"
                loading={disparando()}
                onClick={dispararOrdem}
              >
                <Send size={12} class="mr-1.5" /> Disparar Execução
              </Button>
            </div>
          </div>
        </div>
      </Show>

      {/* Modal de Inspeção de Prompt do Agente */}
      <Show when={agenteDetalhes()}>
        <div class="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div class="bg-zinc-900 border border-zinc-800 rounded-xl max-w-2xl w-full p-5 space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
            <div class="flex items-center justify-between border-b border-zinc-800 pb-3 flex-shrink-0">
              <div>
                <h2 class="text-sm font-bold text-zinc-100">
                  Especificação Técnica: @{agenteDetalhes()!.id}
                </h2>
                <span class="text-[11px] text-emerald-400 font-mono">
                  {agenteDetalhes()!.name} · {agenteDetalhes()!.model}
                </span>
              </div>
              <IconButton size="xs" variant="ghost" onClick={() => setAgenteDetalhes(null)}>
                <X size={16} />
              </IconButton>
            </div>

            <div class="space-y-4 text-xs overflow-y-auto pr-1 scrollbar-thin flex-1">
              <div>
                <span class="text-zinc-500 block text-[10px] uppercase font-semibold mb-1">
                  Descrição do Papel
                </span>
                <p class="text-zinc-300 leading-relaxed bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                  {agenteDetalhes()!.description || "Sem descrição informada."}
                </p>
              </div>

              <div>
                <span class="text-zinc-500 block text-[10px] uppercase font-semibold mb-1">
                  System Prompt (Instruções de Personalidade & Regras)
                </span>
                <pre class="bg-zinc-950 p-3.5 rounded-lg border border-zinc-800 text-[11px] font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto scrollbar-thin">
                  {agenteDetalhes()!.system_prompt || "Instruções carregadas a partir de .opencorp/agents/"}
                </pre>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div class="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                  <span class="text-zinc-500 block text-[10px] uppercase font-semibold mb-1">Nível de Permissão</span>
                  <span class="font-mono text-zinc-200">{agenteDetalhes()!.permissions || "level-2"}</span>
                </div>
                <div class="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                  <span class="text-zinc-500 block text-[10px] uppercase font-semibold mb-1">Status</span>
                  <span class="font-semibold text-emerald-400">
                    {agenteDetalhes()!.ativo !== false ? "Ativo no Workspace" : "Desativado"}
                  </span>
                </div>
              </div>
            </div>

            <div class="pt-3 border-t border-zinc-800 flex justify-end flex-shrink-0">
              <Button size="sm" variant="secondary" onClick={() => setAgenteDetalhes(null)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};
