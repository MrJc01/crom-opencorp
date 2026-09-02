import { type Component, createSignal, onMount, createEffect, For, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import {
  GitBranch,
  Play,
  RefreshCw,
  Plus,
  Trash2,
  X,
  Send,
  Eye,
  ArrowRight,
  Bot,
  Layers,
  HelpCircle,
  FileCheck,
  FileText,
  Terminal,
  Users,
  CheckCircle2,
  Webhook,
} from "lucide-solid";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { showToast } from "../ui/Toast";
import { fetchApi } from "../lib/context";

export interface NoGrafo {
  id: string;
  tipo: string;
  config?: any;
}

export interface ArestaGrafo {
  de: string;
  para: string;
}

export interface FluxoCompleto {
  id: string;
  nome: string;
  descricao?: string;
  nos: NoGrafo[];
  arestas: ArestaGrafo[];
}

export const FluxosView: Component = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [fluxos, setFluxos] = createSignal<any[]>([]);
  const [fluxoSelecionado, setFluxoSelecionado] = createSignal<FluxoCompleto | null>(null);
  const [carregandoDetalhes, setCarregandoDetalhes] = createSignal(false);

  // Modal de Execução do Fluxo
  const [fluxoParaExecutar, setFluxoParaExecutar] = createSignal<any | null>(null);
  const [entradaTexto, setEntradaTexto] = createSignal("");
  const [executando, setExecutando] = createSignal(false);

  // Modal Novo Fluxo
  const [modalNovoAberto, setModalNovoAberto] = createSignal(false);
  const [novoId, setNovoId] = createSignal("");
  const [novoNome, setNovoNome] = createSignal("");
  const [novoTemplate, setNovoTemplate] = createSignal<"pipeline" | "review" | "debate">("pipeline");
  const [salvando, setSalvando] = createSignal(false);

  const carregarFluxos = async () => {
    try {
      const lista = await fetchApi<any[]>("/flows");
      setFluxos(lista || []);
    } catch {
      setFluxos([]);
    }
  };

  const abrirDetalhesFluxo = async (id: string) => {
    setCarregandoDetalhes(true);
    try {
      const dados = await fetchApi<FluxoCompleto>(`/flows/${encodeURIComponent(id)}`);
      setFluxoSelecionado(dados);
    } catch (err: any) {
      showToast(`Erro ao carregar fluxo: ${err.message}`, "erro");
    } finally {
      setCarregandoDetalhes(false);
    }
  };

  const dispararFluxo = async () => {
    const f = fluxoParaExecutar();
    if (!f) return;
    setExecutando(true);

    try {
      await fetchApi(`/flows/${encodeURIComponent(f.id)}/run`, {
        method: "POST",
        body: JSON.stringify({ entrada: entradaTexto().trim() || undefined }),
      });
      showToast(`Fluxo "${f.nome || f.id}" disparado com sucesso!`, "sucesso");
      setFluxoParaExecutar(null);
      setEntradaTexto("");
    } catch (err: any) {
      showToast(`Erro ao rodar fluxo: ${err.message}`, "erro");
    } finally {
      setExecutando(false);
    }
  };

  const excluirFluxo = async (id: string) => {
    if (!confirm(`Deseja excluir o fluxo "${id}"?`)) return;
    try {
      await fetchApi(`/flows/${encodeURIComponent(id)}`, { method: "DELETE" });
      setFluxos((prev) => prev.filter((f) => f.id !== id));
      if (fluxoSelecionado()?.id === id) {
        setSearchParams({ fluxo: undefined });
      }
      showToast("Fluxo removido", "sucesso");
    } catch (err: any) {
      showToast(`Erro ao excluir: ${err.message}`, "erro");
    }
  };

  createEffect(() => {
    const fId = searchParams.fluxo as string | undefined;
    if (fId) {
      void abrirDetalhesFluxo(fId);
    } else {
      setFluxoSelecionado(null);
    }
  });

  onMount(() => {
    void carregarFluxos();
  });

  const iconeDoNo = (tipo: string) => {
    switch (tipo) {
      case "agente":
        return <Bot size={14} class="text-emerald-400" />;
      case "script":
        return <Terminal size={14} class="text-cyan-400" />;
      case "reuniao":
        return <Users size={14} class="text-blue-400" />;
      case "webhook":
        return <Webhook size={14} class="text-emerald-400" />;
      case "decisao":
        return <HelpCircle size={14} class="text-amber-400" />;
      case "task_create":
        return <Layers size={14} class="text-blue-400" />;
      case "registro":
        return <FileText size={14} class="text-purple-400" />;
      case "fanout":
        return <GitBranch size={14} class="text-indigo-400" />;
      case "review":
        return <CheckCircle2 size={14} class="text-rose-400" />;
      case "debate":
        return <Users size={14} class="text-orange-400" />;
      default:
        return <Play size={14} class="text-zinc-400" />;
    }
  };

  return (
    <div class="flex flex-col h-full w-full overflow-hidden p-6 space-y-4 bg-zinc-950">
      {/* Header */}
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-800">
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-xl font-bold text-zinc-100 tracking-tight">Fluxos de Trabalho (Orquestrações)</h1>
            <span class="text-[11px] font-mono px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300">
              {fluxos().length} fluxo(s)
            </span>
          </div>
          <p class="text-xs text-zinc-400 mt-0.5">
            Pipelines autônomos multi-etapas baseados em grafos com nós de agentes, decisões e registros.
          </p>
        </div>

        <div class="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={carregarFluxos} title="Atualizar">
            <RefreshCw size={13} />
          </Button>
        </div>
      </div>

      {/* Grid de Fluxos */}
      <div class="flex-1 overflow-y-auto min-h-0 scrollbar-thin">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 pb-4">
          <For
            each={fluxos()}
            fallback={
              <div class="col-span-2 py-16 text-center text-xs text-zinc-500">
                Nenhum fluxo configurado no workspace ativo.
              </div>
            }
          >
            {(f) => (
              <div class="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 transition-all flex flex-col justify-between gap-4 shadow-xs">
                <div class="space-y-2">
                  <div class="flex items-start justify-between gap-3">
                    <div class="flex items-center gap-2.5 min-w-0">
                      <div class="h-9 w-9 rounded-lg bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-emerald-400 flex-shrink-0">
                        <GitBranch size={17} />
                      </div>
                      <div class="min-w-0">
                        <h2 class="text-xs font-bold text-zinc-100 truncate">{f.nome || f.id}</h2>
                        <span class="text-[11px] font-mono text-zinc-500">id: {f.id}</span>
                      </div>
                    </div>

                    <div class="flex items-center gap-1.5 flex-shrink-0">
                      <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300">
                        {f.nos ?? 0} nós
                      </span>
                      <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-400">
                        {f.arestas ?? 0} arestas
                      </span>
                    </div>
                  </div>

                  <p class="text-xs text-zinc-400 leading-relaxed line-clamp-2">
                    {f.descricao || "Pipeline de automação e orquestração de múltiplos agentes em etapas sequenciais ou condicionais."}
                  </p>
                </div>

                <div class="flex items-center justify-between gap-2 pt-3 border-t border-zinc-800/60">
                  <Button
                    size="xs"
                    variant="ghost"
                    class="text-zinc-400 hover:text-zinc-200"
                    onClick={() => setSearchParams({ fluxo: f.id })}
                  >
                    <Eye size={12} class="mr-1.5" /> Inspecionar Grafo
                  </Button>

                  <div class="flex items-center gap-2">
                    <Button
                      size="xs"
                      variant="primary"
                      onClick={() => {
                        setFluxoParaExecutar(f);
                        setEntradaTexto("");
                      }}
                    >
                      <Play size={11} class="mr-1 fill-current" /> Executar Fluxo
                    </Button>
                    <IconButton
                      size="xs"
                      variant="ghost"
                      class="text-zinc-500 hover:text-rose-400"
                      onClick={() => excluirFluxo(f.id)}
                      title="Excluir fluxo"
                    >
                      <Trash2 size={13} />
                    </IconButton>
                  </div>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>

      {/* Modal / Drawer de Inspeção do Grafo do Fluxo */}
      <Show when={fluxoSelecionado()}>
        <div class="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div class="bg-zinc-900 border border-zinc-800 rounded-xl max-w-2xl w-full p-5 space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
            <div class="flex items-center justify-between border-b border-zinc-800 pb-3 flex-shrink-0">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <GitBranch size={16} class="text-emerald-400" />
                  <h2 class="text-sm font-bold text-zinc-100 truncate">
                    Grafo do Fluxo: {fluxoSelecionado()!.nome}
                  </h2>
                </div>
                <span class="text-[11px] text-zinc-500 font-mono">id: {fluxoSelecionado()!.id}</span>
              </div>
              <IconButton size="xs" variant="ghost" onClick={() => setSearchParams({ fluxo: undefined })}>
                <X size={16} />
              </IconButton>
            </div>

            <div class="space-y-4 text-xs overflow-y-auto pr-1 scrollbar-thin flex-1">
              <div>
                <span class="text-zinc-500 block text-[10px] uppercase font-bold mb-2">
                  Sequência de Etapas e Nós ({fluxoSelecionado()!.nos?.length || 0})
                </span>
                <div class="space-y-2">
                  <For each={fluxoSelecionado()!.nos}>
                    {(no, idx) => (
                      <div class="p-3 rounded-lg bg-zinc-950 border border-zinc-800 flex items-start justify-between gap-3">
                        <div class="space-y-1 min-w-0">
                          <div class="flex items-center gap-2">
                            <span class="text-[10px] font-mono text-zinc-500">#{idx() + 1}</span>
                            {iconeDoNo(no.tipo)}
                            <span class="font-bold text-zinc-200 font-mono">{no.id}</span>
                            <span class="px-1.5 py-0.2 rounded text-[9px] font-mono uppercase bg-zinc-900 border border-zinc-800 text-zinc-400">
                              {no.tipo}
                            </span>
                          </div>

                          <Show when={no.config?.agente}>
                            <div class="text-[11px] text-emerald-400 font-mono">
                              Executor: @{no.config.agente}
                            </div>
                          </Show>

                          <Show when={no.config?.ordem || no.config?.pergunta}>
                            <p class="text-[11px] text-zinc-400 font-mono line-clamp-2 bg-zinc-900/50 p-2 rounded border border-zinc-800/40">
                              {no.config.ordem || no.config.pergunta}
                            </p>
                          </Show>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </div>

              <div>
                <span class="text-zinc-500 block text-[10px] uppercase font-bold mb-2">
                  Definição Estruturada (JSON)
                </span>
                <pre class="bg-black p-3.5 rounded-lg border border-zinc-800 text-[11px] font-mono text-zinc-300 max-h-48 overflow-y-auto whitespace-pre-wrap scrollbar-thin">
                  {JSON.stringify(fluxoSelecionado(), null, 2)}
                </pre>
              </div>
            </div>

            <div class="pt-3 border-t border-zinc-800 flex justify-end gap-2 flex-shrink-0">
              <Button size="sm" variant="secondary" onClick={() => setSearchParams({ fluxo: undefined })}>
                Fechar
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  setFluxoParaExecutar(fluxoSelecionado());
                  setSearchParams({ fluxo: undefined });
                }}
              >
                <Play size={12} class="mr-1.5 fill-current" /> Executar Este Fluxo
              </Button>
            </div>
          </div>
        </div>
      </Show>

      {/* Modal Executar Fluxo */}
      <Show when={fluxoParaExecutar()}>
        <div class="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div class="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div class="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h2 class="text-sm font-bold text-zinc-100">
                  Executar Fluxo: {fluxoParaExecutar()!.nome}
                </h2>
                <p class="text-[11px] text-zinc-400 mt-0.5">
                  Inicia a orquestração em background passando dados para o nó de entrada.
                </p>
              </div>
              <IconButton size="xs" variant="ghost" onClick={() => setFluxoParaExecutar(null)}>
                <X size={16} />
              </IconButton>
            </div>

            <div class="space-y-3 text-xs">
              <label class="block text-zinc-300 font-medium">
                Entrada Inicial / Contexto (Opcional)
              </label>
              <textarea
                rows={4}
                placeholder="Insira parâmetros ou instruções adicionais para o pipeline..."
                value={entradaTexto()}
                onInput={(e) => setEntradaTexto(e.currentTarget.value)}
                class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono resize-none"
              />
            </div>

            <div class="pt-3 border-t border-zinc-800 flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setFluxoParaExecutar(null)}>
                Cancelar
              </Button>
              <Button size="sm" variant="primary" loading={executando()} onClick={dispararFluxo}>
                <Send size={12} class="mr-1.5" /> Iniciar Orquestração
              </Button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};
