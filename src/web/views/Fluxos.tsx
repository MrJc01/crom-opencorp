import {
  type Component,
  createSignal,
  onMount,
  createEffect,
  For,
  Show,
  createMemo,
} from "solid-js";
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
  Bot,
  Layers,
  HelpCircle,
  FileText,
  Terminal,
  Users,
  CheckCircle2,
  Webhook,
  ArrowRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sparkles,
  Settings,
  Check,
  ChevronRight,
  Copy,
  Folder,
  Search,
  ArrowLeft,
  Calendar,
  MoreVertical,
  ExternalLink,
  Code2,
} from "lucide-solid";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { showToast } from "../ui/Toast";
import { fetchApi } from "../lib/context";

export interface NoGrafo {
  id: string;
  tipo: string;
  config?: any;
  pos?: { x: number; y: number };
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
  const [agentes, setAgentes] = createSignal<any[]>([]);
  const [fluxoAtivo, setFluxoAtivo] = createSignal<FluxoCompleto | null>(null);
  const [noSelecionado, setNoSelecionado] = createSignal<NoGrafo | null>(null);

  // Busca e Filtros na Lista de Workflows (estilo n8n WorkflowsView)
  const [buscaTexto, setBuscaTexto] = createSignal("");
  const [copiadoId, setCopiadoId] = createSignal<string | null>(null);

  // Zoom & Pan do Canvas
  const [zoom, setZoom] = createSignal(1);
  const [pan, setPan] = createSignal({ x: 50, y: 50 });
  const [isPanning, setIsPanning] = createSignal(false);
  const [startPan, setStartPan] = createSignal({ x: 0, y: 0 });

  // Modais
  const [modalExecutar, setModalExecutar] = createSignal(false);
  const [entradaTexto, setEntradaTexto] = createSignal("");
  const [executando, setExecutando] = createSignal(false);

  // Modal Novo Workflow
  const [modalNovoFluxo, setModalNovoFluxo] = createSignal(false);
  const [novoFluxoId, setNovoFluxoId] = createSignal("");
  const [novoFluxoNome, setNovoFluxoNome] = createSignal("");
  const [novoFluxoDesc, setNovoFluxoDesc] = createSignal("");
  const [novoFluxoTemplate, setNovoFluxoTemplate] = createSignal<"pipeline" | "fanout" | "review" | "debate">("pipeline");

  const carregarFluxos = async () => {
    try {
      const [lista, listaAgentes] = await Promise.all([
        fetchApi<any[]>("/flows").catch(() => []),
        fetchApi<any[]>("/agents").catch(() => []),
      ]);
      setFluxos(lista || []);
      setAgentes(listaAgentes || []);

      const urlId = searchParams.fluxo as string;
      if (urlId) {
        void abrirEditorCanvas(urlId);
      }
    } catch {}
  };

  const abrirEditorCanvas = async (id: string) => {
    try {
      const f = await fetchApi<FluxoCompleto>(`/flows/${encodeURIComponent(id)}`);
      setFluxoAtivo(f);
      setNoSelecionado(f.nos && f.nos.length > 0 ? f.nos[0] : null);
      setSearchParams({ fluxo: id });
    } catch (e: any) {
      showToast(`Erro ao carregar fluxo: ${e.message}`, "erro");
    }
  };

  const voltarParaLista = () => {
    setFluxoAtivo(null);
    setNoSelecionado(null);
    setSearchParams({ fluxo: undefined });
  };

  createEffect(() => {
    const fId = searchParams.fluxo as string | undefined;
    if (fId && (!fluxoAtivo() || fluxoAtivo()!.id !== fId)) {
      void abrirEditorCanvas(fId);
    } else if (!fId && fluxoAtivo()) {
      setFluxoAtivo(null);
      setNoSelecionado(null);
    }
  });

  onMount(() => {
    void carregarFluxos();
  });

  // Copiar Workflow JSON (Paridade com recurso de copiar do n8n)
  const copiarWorkflowJson = async (fluxo: any, e?: MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      let dados = fluxo;
      if (!dados.nos || !dados.arestas) {
        dados = await fetchApi<FluxoCompleto>(`/flows/${encodeURIComponent(fluxo.id)}`);
      }
      const jsonStr = JSON.stringify(dados, null, 2);
      await navigator.clipboard.writeText(jsonStr);
      setCopiadoId(fluxo.id);
      showToast(`Workflow "${fluxo.nome || fluxo.id}" copiado como JSON!`, "sucesso");
      setTimeout(() => setCopiadoId(null), 2500);
    } catch (err: any) {
      showToast(`Erro ao copiar: ${err.message}`, "erro");
    }
  };

  // Duplicar Workflow
  const duplicarWorkflow = async (fluxo: any, e?: MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const original = await fetchApi<FluxoCompleto>(`/flows/${encodeURIComponent(fluxo.id)}`);
      const novoId = `${fluxo.id}-copia-${Date.now().toString(36).slice(-4)}`;
      const novoNome = `${original.nome || original.id} (Cópia)`;
      await fetchApi("/flows", {
        method: "POST",
        body: JSON.stringify({
          id: novoId,
          nome: novoNome,
          nos: original.nos,
          arestas: original.arestas,
        }),
      });
      showToast(`Workflow duplicado como "${novoNome}"!`, "sucesso");
      await carregarFluxos();
    } catch (err: any) {
      showToast(`Erro ao duplicar: ${err.message}`, "erro");
    }
  };

  // Excluir Workflow
  const excluirWorkflow = async (id: string, e?: MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm(`Deseja excluir o workflow "${id}"?`)) return;
    try {
      await fetchApi(`/flows/${encodeURIComponent(id)}`, { method: "DELETE" });
      setFluxos((prev) => prev.filter((f) => f.id !== id));
      if (fluxoAtivo()?.id === id) {
        voltarParaLista();
      }
      showToast("Workflow excluído", "sucesso");
    } catch (err: any) {
      showToast(`Erro ao excluir: ${err.message}`, "erro");
    }
  };

  // Criar Workflow pelo Modal
  const salvarNovoWorkflow = async () => {
    const id = novoFluxoId().trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const nome = novoFluxoNome().trim();
    if (!id || !nome) {
      showToast("ID e Nome são obrigatórios", "aviso");
      return;
    }

    const tpl = novoFluxoTemplate();
    let nos: any[] = [];
    let arestas: any[] = [];

    if (tpl === "pipeline") {
      nos = [
        { id: "gatilho", tipo: "manual", config: {} },
        { id: "etapa_1", tipo: "agente", config: { agente: "executor-padrao", ordem: "Execute a tarefa com base na entrada: {{entrada}}" } },
        { id: "saida", tipo: "registro", config: { categoria: "documentos" } },
      ];
      arestas = [
        { de: "gatilho", para: "etapa_1" },
        { de: "etapa_1", para: "saida" },
      ];
    } else if (tpl === "fanout") {
      nos = [
        { id: "gatilho", tipo: "manual", config: {} },
        { id: "fanout", tipo: "fanout", config: { paralelos: [{ agente: "pesquisador-fontes" }, { agente: "analisador-corretor-post" }] } },
        { id: "sintese", tipo: "agente", config: { agente: "editor", ordem: "Sintetize os resultados: {{entrada}}" } },
      ];
      arestas = [
        { de: "gatilho", para: "fanout" },
        { de: "fanout", para: "sintese" },
      ];
    } else if (tpl === "review") {
      nos = [
        { id: "gatilho", tipo: "manual", config: {} },
        { id: "review", tipo: "review", config: { executor: { agente: "redator-conteudo" }, revisor: { agente: "editor" }, turnos: 2 } },
      ];
      arestas = [{ de: "gatilho", para: "review" }];
    } else {
      nos = [
        { id: "gatilho", tipo: "manual", config: {} },
        { id: "debate", tipo: "debate", config: { proponentes: [{ agente: "analisador-corretor-post" }, { agente: "critico-site" }], moderador: { agente: "ceo" } } },
      ];
      arestas = [{ de: "gatilho", para: "debate" }];
    }

    try {
      await fetchApi("/flows", {
        method: "POST",
        body: JSON.stringify({ id, nome, descricao: novoFluxoDesc().trim() || undefined, nos, arestas }),
      });
      showToast(`Workflow "${nome}" criado com sucesso!`, "sucesso");
      setModalNovoFluxo(false);
      setNovoFluxoId("");
      setNovoFluxoNome("");
      setNovoFluxoDesc("");
      await carregarFluxos();
      void abrirEditorCanvas(id);
    } catch (err: any) {
      showToast(`Erro ao criar: ${err.message}`, "erro");
    }
  };

  // Layout Automático de Nós no Canvas estilo n8n (Horizontal Flow)
  const nosPosicionados = createMemo(() => {
    const f = fluxoAtivo();
    if (!f || !f.nos) return [];

    const nos = [...f.nos];
    const arestas = f.arestas || [];

    const niveis: Record<string, number> = {};
    nos.forEach((n) => {
      niveis[n.id] = 0;
    });

    for (let iter = 0; iter < nos.length; iter++) {
      arestas.forEach((a) => {
        if (niveis[a.de] !== undefined) {
          niveis[a.para] = Math.max(niveis[a.para] || 0, (niveis[a.de] || 0) + 1);
        }
      });
    }

    const colunas: Record<number, NoGrafo[]> = {};
    nos.forEach((n) => {
      const lvl = niveis[n.id] || 0;
      if (!colunas[lvl]) colunas[lvl] = [];
      colunas[lvl].push(n);
    });

    const posicionados: Array<NoGrafo & { x: number; y: number }> = [];
    const COL_WIDTH = 270;
    const ROW_HEIGHT = 140;

    Object.entries(colunas).forEach(([lvlStr, lista]) => {
      const colIdx = Number(lvlStr);
      const totalNaColuna = lista.length;
      lista.forEach((no, rowIdx) => {
        const x = 70 + colIdx * COL_WIDTH;
        const y = 90 + (rowIdx - (totalNaColuna - 1) / 2) * ROW_HEIGHT + 110;
        posicionados.push({ ...no, x, y });
      });
    });

    return posicionados;
  });

  const arestasCurvadas = createMemo(() => {
    const nos = nosPosicionados();
    const f = fluxoAtivo();
    if (!f || !f.arestas) return [];

    const mapaNos = new Map(nos.map((n) => [n.id, n]));

    return f.arestas
      .map((a) => {
        const origem = mapaNos.get(a.de);
        const destino = mapaNos.get(a.para);
        if (!origem || !destino) return null;

        const x1 = origem.x + 190;
        const y1 = origem.y + 40;
        const x2 = destino.x;
        const y2 = destino.y + 40;

        const dx = Math.max(Math.abs(x2 - x1) * 0.5, 40);
        const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

        return { ...a, path, x1, y1, x2, y2 };
      })
      .filter(Boolean);
  });

  const iconeDoNo = (tipo: string) => {
    switch (tipo) {
      case "manual":
      case "webhook":
        return <Webhook size={15} class="text-amber-400" />;
      case "agente":
        return <Bot size={15} class="text-emerald-400" />;
      case "script":
        return <Terminal size={15} class="text-cyan-400" />;
      case "decisao":
        return <HelpCircle size={15} class="text-amber-400" />;
      case "task_create":
        return <Layers size={15} class="text-blue-400" />;
      case "reuniao":
        return <Users size={15} class="text-indigo-400" />;
      case "registro":
      case "saida":
        return <FileText size={15} class="text-purple-400" />;
      case "fanout":
      case "debate":
      case "review":
        return <GitBranch size={15} class="text-rose-400" />;
      default:
        return <Play size={15} class="text-zinc-400" />;
    }
  };

  const corDoNo = (tipo: string) => {
    switch (tipo) {
      case "manual":
      case "webhook":
        return "border-amber-500/50 bg-amber-950/20 text-amber-300";
      case "agente":
        return "border-emerald-500/50 bg-emerald-950/20 text-emerald-300";
      case "script":
        return "border-cyan-500/50 bg-cyan-950/20 text-cyan-300";
      case "decisao":
        return "border-amber-500/50 bg-amber-950/20 text-amber-300";
      case "task_create":
        return "border-blue-500/50 bg-blue-950/20 text-blue-300";
      case "reuniao":
        return "border-indigo-500/50 bg-indigo-950/20 text-indigo-300";
      default:
        return "border-zinc-700 bg-zinc-900 text-zinc-300";
    }
  };

  const dispararExecucao = async () => {
    const f = fluxoAtivo();
    if (!f) return;
    setExecutando(true);
    try {
      await fetchApi(`/flows/${encodeURIComponent(f.id)}/run`, {
        method: "POST",
        body: JSON.stringify({ entrada: entradaTexto().trim() || undefined }),
      });
      showToast(`Execução do workflow "${f.nome || f.id}" iniciada!`, "sucesso");
      setModalExecutar(false);
      setEntradaTexto("");
    } catch (err: any) {
      showToast(`Erro ao rodar: ${err.message}`, "erro");
    } finally {
      setExecutando(false);
    }
  };

  const onMouseDownCanvas = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest(".canvas-node")) return;
    setIsPanning(true);
    setStartPan({ x: e.clientX - pan().x, y: e.clientY - pan().y });
  };

  const onMouseMoveCanvas = (e: MouseEvent) => {
    if (!isPanning()) return;
    setPan({ x: e.clientX - startPan().x, y: e.clientY - startPan().y });
  };

  const onMouseUpCanvas = () => {
    setIsPanning(false);
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 60, y: 60 });
  };

  const fluxosFiltrados = createMemo(() => {
    const q = buscaTexto().toLowerCase().trim();
    if (!q) return fluxos();
    return fluxos().filter(
      (f) =>
        (f.id && f.id.toLowerCase().includes(q)) ||
        (f.nome && f.nome.toLowerCase().includes(q)) ||
        (f.descricao && f.descricao.toLowerCase().includes(q))
    );
  });

  return (
    <div class="flex flex-col h-full w-full overflow-hidden bg-zinc-950 select-none">
      {/* ─────────────────────────────────────────────────────────────
          CASO 1: LISTA PRINCIPAL DE WORKFLOWS (Estilo n8n WorkflowsView)
         ───────────────────────────────────────────────────────────── */}
      <Show when={!fluxoAtivo()}>
        <div class="flex flex-col h-full overflow-hidden p-6 space-y-5">
          {/* Header da Página de Workflows */}
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
            <div class="space-y-1">
              <div class="flex items-center gap-2.5">
                <div class="h-9 w-9 rounded-xl bg-orange-600/20 border border-orange-500/40 flex items-center justify-center text-orange-400">
                  <GitBranch size={18} />
                </div>
                <div>
                  <h1 class="text-xl font-bold text-zinc-100 tracking-tight">Workflows</h1>
                  <span class="text-xs text-zinc-400">
                    Gerencie, orquestre e execute pipelines automatizados em grafo
                  </span>
                </div>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={carregarFluxos} title="Atualizar">
                <RefreshCw size={13} />
              </Button>
              <Button
                size="sm"
                variant="primary"
                class="bg-orange-600 hover:bg-orange-500 text-white font-bold"
                onClick={() => setModalNovoFluxo(true)}
              >
                <Plus size={14} class="mr-1.5" /> Adicionar Workflow
              </Button>
            </div>
          </div>

          {/* Barra de Filtros e Busca estilo n8n */}
          <div class="flex items-center justify-between gap-3">
            <div class="relative w-72">
              <Search size={14} class="absolute left-3 top-2.5 text-zinc-500" />
              <input
                type="text"
                placeholder="Pesquisar workflows..."
                value={buscaTexto()}
                onInput={(e) => setBuscaTexto(e.currentTarget.value)}
                class="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-orange-500 font-sans"
              />
            </div>

            <div class="text-xs text-zinc-500 font-mono">
              {fluxosFiltrados().length} de {fluxos().length} workflow(s)
            </div>
          </div>

          {/* Lista de Workflow Cards (Estilo WorkflowCard.vue do n8n) */}
          <div class="flex-1 overflow-y-auto min-h-0 space-y-2.5 pr-1 scrollbar-thin">
            <For
              each={fluxosFiltrados()}
              fallback={
                <div class="py-16 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
                  Nenhum workflow encontrado.
                </div>
              }
            >
              {(f) => (
                <div
                  class="group p-4 rounded-xl bg-zinc-900/70 border border-zinc-800/80 hover:border-orange-500/50 hover:bg-zinc-900 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer shadow-xs"
                  onClick={() => abrirEditorCanvas(f.id)}
                >
                  <div class="flex items-start gap-3.5 min-w-0">
                    <div class="h-10 w-10 rounded-xl bg-zinc-950 border border-zinc-800 group-hover:border-orange-500/40 flex items-center justify-center text-orange-400 flex-shrink-0 transition-colors">
                      <GitBranch size={18} />
                    </div>

                    <div class="min-w-0 space-y-1">
                      <div class="flex items-center gap-2 flex-wrap">
                        <h2 class="text-sm font-bold text-zinc-100 group-hover:text-orange-400 transition-colors truncate">
                          {f.nome || f.id}
                        </h2>
                        <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-400">
                          id: {f.id}
                        </span>
                        <span class="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-950/40 border border-emerald-800/50 text-emerald-400">
                          {f.nos ?? 0} nodes
                        </span>
                      </div>

                      <p class="text-xs text-zinc-400 line-clamp-1">
                        {f.descricao || "Pipeline autônomo com nós de agentes, scripts do workspace e governança."}
                      </p>
                    </div>
                  </div>

                  {/* Ações Rápidas do Card (Abrir Canvas, Copiar JSON, Executar, Duplicar, Excluir) */}
                  <div class="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    {/* Botão Copiar JSON estilo n8n */}
                    <Button
                      size="xs"
                      variant="secondary"
                      class="border-zinc-800 hover:border-zinc-700 text-zinc-300 text-[11px]"
                      onClick={(e) => copiarWorkflowJson(f, e)}
                      title="Copiar Workflow JSON (Ctrl+C)"
                    >
                      <Show
                        when={copiadoId() === f.id}
                        fallback={
                          <>
                            <Copy size={12} class="mr-1.5 text-zinc-400" /> Copiar JSON
                          </>
                        }
                      >
                        <>
                          <Check size={12} class="mr-1.5 text-emerald-400" /> Copiado!
                        </>
                      </Show>
                    </Button>

                    <Button
                      size="xs"
                      variant="secondary"
                      class="border-zinc-800 hover:border-zinc-700 text-zinc-300 text-[11px]"
                      onClick={(e) => duplicarWorkflow(f, e)}
                      title="Duplicar Workflow"
                    >
                      Duplicar
                    </Button>

                    <Button
                      size="xs"
                      variant="primary"
                      class="bg-orange-600 hover:bg-orange-500 text-white font-bold text-[11px]"
                      onClick={() => abrirEditorCanvas(f.id)}
                    >
                      <Eye size={12} class="mr-1.5" /> Abrir Canvas
                    </Button>

                    <IconButton
                      size="xs"
                      variant="ghost"
                      class="text-zinc-500 hover:text-rose-400"
                      onClick={(e) => excluirWorkflow(f.id, e)}
                      title="Excluir Workflow"
                    >
                      <Trash2 size={13} />
                    </IconButton>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* ─────────────────────────────────────────────────────────────
          CASO 2: CANVAS VISUAL DO WORKFLOW (Estilo n8n Canvas Editor)
         ───────────────────────────────────────────────────────────── */}
      <Show when={fluxoAtivo()}>
        <div class="flex flex-col h-full w-full overflow-hidden">
          {/* Topo / Barra de Navegação do Canvas */}
          <div class="h-14 border-b border-zinc-800 bg-zinc-900/90 px-4 flex items-center justify-between gap-4 z-20">
            <div class="flex items-center gap-3 min-w-0">
              <Button
                size="xs"
                variant="ghost"
                class="text-zinc-400 hover:text-zinc-100"
                onClick={voltarParaLista}
                title="Voltar para lista de Workflows"
              >
                <ArrowLeft size={14} class="mr-1" /> Workflows
              </Button>

              <div class="h-4 w-px bg-zinc-800" />

              <div class="flex items-center gap-2 min-w-0">
                <div class="h-7 w-7 rounded-lg bg-orange-600/20 border border-orange-500/40 flex items-center justify-center text-orange-400 flex-shrink-0">
                  <GitBranch size={15} />
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-xs text-zinc-100 truncate block">
                      {fluxoAtivo()!.nome || fluxoAtivo()!.id}
                    </span>
                    <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                      {fluxoAtivo()!.nos?.length || 0} nodes
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Controles de Canvas e Ações */}
            <div class="flex items-center gap-2">
              {/* Botão Copiar JSON no Editor */}
              <Button
                size="sm"
                variant="secondary"
                class="border-zinc-800 text-zinc-300 text-xs"
                onClick={() => copiarWorkflowJson(fluxoAtivo()!)}
                title="Copiar Workflow JSON"
              >
                <Show
                  when={copiadoId() === fluxoAtivo()!.id}
                  fallback={
                    <>
                      <Copy size={13} class="mr-1.5 text-zinc-400" /> Copiar
                    </>
                  }
                >
                  <>
                    <Check size={13} class="mr-1.5 text-emerald-400" /> Copiado!
                  </>
                </Show>
              </Button>

              {/* Zoom Controls */}
              <div class="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-0.5 text-xs text-zinc-400">
                <IconButton size="xs" variant="ghost" onClick={() => setZoom((z) => Math.max(z - 0.15, 0.4))} title="Zoom Out">
                  <ZoomOut size={13} />
                </IconButton>
                <span class="px-2 font-mono text-[11px] text-zinc-300">
                  {Math.round(zoom() * 100)}%
                </span>
                <IconButton size="xs" variant="ghost" onClick={() => setZoom((z) => Math.min(z + 0.15, 2))} title="Zoom In">
                  <ZoomIn size={13} />
                </IconButton>
                <IconButton size="xs" variant="ghost" onClick={resetView} title="Resetar Visualização">
                  <Maximize2 size={12} />
                </IconButton>
              </div>

              <Button
                size="sm"
                variant="primary"
                class="bg-orange-600 hover:bg-orange-500 text-white font-bold"
                onClick={() => setModalExecutar(true)}
              >
                <Play size={13} class="mr-1.5 fill-current" /> Executar Workflow
              </Button>
            </div>
          </div>

          {/* Área de Canvas com Grid Pontilhado estilo n8n */}
          <div
            class="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing bg-[#0d0f12]"
            onMouseDown={onMouseDownCanvas}
            onMouseMove={onMouseMoveCanvas}
            onMouseUp={onMouseUpCanvas}
            onMouseLeave={onMouseUpCanvas}
            style={{
              "background-image": "radial-gradient(#27272a 1px, transparent 1px)",
              "background-size": `${24 * zoom()}px ${24 * zoom()}px`,
              "background-position": `${pan().x}px ${pan().y}px`,
            }}
          >
            {/* Camada Transformada por Zoom e Pan */}
            <div
              class="absolute inset-0 origin-top-left pointer-events-none"
              style={{
                transform: `translate(${pan().x}px, ${pan().y}px) scale(${zoom()})`,
              }}
            >
              {/* SVG para as Arestas / Conexões Curvas com Handles */}
              <svg class="absolute inset-0 overflow-visible w-full h-full pointer-events-none">
                <defs>
                  <linearGradient id="edge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#f97316" />
                    <stop offset="100%" stop-color="#3b82f6" />
                  </linearGradient>
                </defs>
                <For each={arestasCurvadas()}>
                  {(a: any) => (
                    <g>
                      <path
                        d={a.path}
                        fill="none"
                        stroke="#000000"
                        stroke-width="5"
                        opacity="0.4"
                      />
                      <path
                        d={a.path}
                        fill="none"
                        stroke="url(#edge-gradient)"
                        stroke-width="2.5"
                        class="transition-all"
                      />
                    </g>
                  )}
                </For>
              </svg>

              {/* Nós Visuais no Canvas */}
              <div class="relative pointer-events-auto">
                <For each={nosPosicionados()}>
                  {(no) => {
                    const selecionado = () => noSelecionado()?.id === no.id;
                    const isTrigger = no.tipo === "manual" || no.tipo === "webhook";

                    return (
                      <div
                        class={`canvas-node absolute w-[190px] h-[80px] rounded-xl border p-2.5 transition-all shadow-xl flex flex-col justify-between cursor-pointer ${
                          corDoNo(no.tipo)
                        } ${
                          selecionado()
                            ? "ring-2 ring-orange-500 border-orange-400 shadow-orange-500/20 scale-105 z-10"
                            : "hover:border-zinc-500 hover:scale-[1.02]"
                        }`}
                        style={{
                          left: `${no.x}px`,
                          top: `${no.y}px`,
                          background: "#18181b",
                        }}
                        onClick={() => setNoSelecionado(no)}
                      >
                        {/* Handle de Entrada (Esquerda) */}
                        <Show when={!isTrigger}>
                          <div
                            class="absolute -left-2 top-[34px] w-3.5 h-3.5 rounded-full bg-zinc-900 border-2 border-orange-500 shadow-xs flex items-center justify-center hover:scale-125 transition-transform"
                            title="Input Port"
                          >
                            <div class="w-1 h-1 rounded-full bg-orange-400" />
                          </div>
                        </Show>

                        {/* Topo do Card do Nó */}
                        <div class="flex items-center justify-between gap-1.5 min-w-0">
                          <div class="flex items-center gap-1.5 min-w-0">
                            <div class="p-1 rounded bg-zinc-900 border border-zinc-800 flex-shrink-0">
                              {iconeDoNo(no.tipo)}
                            </div>
                            <div class="min-w-0">
                              <span class="font-bold text-xs text-zinc-100 truncate block font-mono">
                                {no.id}
                              </span>
                              <span class="text-[9px] uppercase font-mono text-zinc-400">
                                {no.tipo}
                              </span>
                            </div>
                          </div>

                          <Show when={selecionado()}>
                            <span class="h-2 w-2 rounded-full bg-orange-400 animate-pulse" />
                          </Show>
                        </div>

                        {/* Subtítulo / Resumo do Nó */}
                        <div class="text-[10px] text-zinc-400 font-mono truncate px-1 py-0.5 bg-zinc-950/80 rounded border border-zinc-900">
                          {no.config?.agente
                            ? `@${no.config.agente}`
                            : no.config?.arquivo
                            ? no.config.arquivo
                            : no.config?.pergunta
                            ? no.config.pergunta
                            : no.config?.titulo
                            ? no.config.titulo
                            : "Etapa configurada"}
                        </div>

                        {/* Handle de Saída (Direita) */}
                        <div
                          class="absolute -right-2 top-[34px] w-3.5 h-3.5 rounded-full bg-zinc-900 border-2 border-blue-500 shadow-xs flex items-center justify-center hover:scale-125 transition-transform"
                          title="Output Port"
                        >
                          <div class="w-1 h-1 rounded-full bg-blue-400" />
                        </div>
                      </div>
                    );
                  }}
                </For>
              </div>
            </div>

            {/* NDV Lateral (Node Details View) */}
            <Show when={noSelecionado()}>
              <div class="absolute right-4 top-4 bottom-4 w-96 bg-zinc-900/95 backdrop-blur-md border border-zinc-800 rounded-xl shadow-2xl flex flex-col z-30 transition-all">
                <div class="p-4 border-b border-zinc-800 flex items-center justify-between">
                  <div class="flex items-center gap-2 min-w-0">
                    <div class="p-1.5 rounded-lg bg-zinc-800 text-orange-400">
                      {iconeDoNo(noSelecionado()!.tipo)}
                    </div>
                    <div class="min-w-0">
                      <h3 class="font-bold text-xs text-zinc-100 font-mono truncate">
                        {noSelecionado()!.id}
                      </h3>
                      <span class="text-[10px] uppercase font-mono text-zinc-500">
                        Tipo: {noSelecionado()!.tipo}
                      </span>
                    </div>
                  </div>

                  <IconButton size="xs" variant="ghost" onClick={() => setNoSelecionado(null)}>
                    <X size={15} />
                  </IconButton>
                </div>

                <div class="flex-1 overflow-y-auto p-4 space-y-4 text-xs scrollbar-thin">
                  <Show when={noSelecionado()!.config?.agente}>
                    <div class="space-y-1">
                      <label class="text-[10px] uppercase font-bold text-zinc-500 block">
                        Agente Executor
                      </label>
                      <div class="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-emerald-400">
                        @{noSelecionado()!.config.agente}
                      </div>
                    </div>
                  </Show>

                  <Show when={noSelecionado()!.config?.arquivo}>
                    <div class="space-y-1">
                      <label class="text-[10px] uppercase font-bold text-zinc-500 block">
                        Script do Workspace
                      </label>
                      <div class="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-cyan-400">
                        {noSelecionado()!.config.arquivo}
                      </div>
                    </div>
                  </Show>

                  <Show when={noSelecionado()!.config?.ordem || noSelecionado()!.config?.comando}>
                    <div class="space-y-1">
                      <label class="text-[10px] uppercase font-bold text-zinc-500 block">
                        Instrução / Código
                      </label>
                      <pre class="p-2.5 rounded-lg bg-black border border-zinc-800 font-mono text-[11px] text-zinc-300 whitespace-pre-wrap max-h-48 overflow-y-auto scrollbar-thin">
                        {noSelecionado()!.config.ordem || noSelecionado()!.config.comando}
                      </pre>
                    </div>
                  </Show>

                  <Show when={noSelecionado()!.config?.pergunta}>
                    <div class="space-y-1">
                      <label class="text-[10px] uppercase font-bold text-zinc-500 block">
                        Pergunta de Decisão
                      </label>
                      <div class="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-amber-300 font-medium">
                        {noSelecionado()!.config.pergunta}
                      </div>
                    </div>
                  </Show>

                  <Show when={noSelecionado()!.config?.opcoes}>
                    <div class="space-y-1">
                      <label class="text-[10px] uppercase font-bold text-zinc-500 block">
                        Ramos de Decisão
                      </label>
                      <div class="space-y-1.5">
                        <For each={noSelecionado()!.config.opcoes}>
                          {(op: any) => (
                            <div class="flex items-center justify-between p-2 rounded bg-zinc-950 border border-zinc-800 font-mono text-[11px]">
                              <span class="text-zinc-300">{op.rotulo}</span>
                              <span class="text-blue-400 flex items-center gap-1">
                                <ArrowRight size={10} /> {op.proximo}
                              </span>
                            </div>
                          )}
                        </For>
                      </div>
                    </div>
                  </Show>

                  <div class="space-y-1 pt-2 border-t border-zinc-800">
                    <label class="text-[10px] uppercase font-bold text-zinc-500 block">
                      Configuração JSON Completa
                    </label>
                    <pre class="p-2 rounded bg-black border border-zinc-800 text-[10px] font-mono text-zinc-400 max-h-36 overflow-y-auto whitespace-pre-wrap scrollbar-thin">
                      {JSON.stringify(noSelecionado()!, null, 2)}
                    </pre>
                  </div>
                </div>

                <div class="p-3 border-t border-zinc-800 flex justify-end">
                  <Button size="xs" variant="secondary" onClick={() => setNoSelecionado(null)}>
                    Fechar Detalhes
                  </Button>
                </div>
              </div>
            </Show>
          </div>
        </div>
      </Show>

      {/* Modal Novo Workflow */}
      <Show when={modalNovoFluxo()}>
        <div class="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div class="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div class="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div class="flex items-center gap-2">
                <Plus size={16} class="text-orange-400" />
                <h3 class="text-sm font-bold text-zinc-100">Criar Novo Workflow</h3>
              </div>
              <IconButton size="xs" variant="ghost" onClick={() => setModalNovoFluxo(false)}>
                <X size={16} />
              </IconButton>
            </div>

            <div class="space-y-3 text-xs">
              <div>
                <label class="block text-zinc-300 font-medium mb-1">Nome do Workflow *</label>
                <input
                  type="text"
                  placeholder="ex: Publicação Editorial de Conteúdo"
                  value={novoFluxoNome()}
                  onInput={(e) => {
                    setNovoFluxoNome(e.currentTarget.value);
                    if (!novoFluxoId()) {
                      setNovoFluxoId(
                        e.currentTarget.value
                          .toLowerCase()
                          .normalize("NFD")
                          .replace(/[\u0300-\u036f]/g, "")
                          .replace(/[^a-z0-9]+/g, "-")
                          .replace(/^-+|-+$/g, "")
                      );
                    }
                  }}
                  class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label class="block text-zinc-300 font-medium mb-1">ID (kebab-case) *</label>
                <input
                  type="text"
                  placeholder="ex: publicacao-editorial"
                  value={novoFluxoId()}
                  onInput={(e) => setNovoFluxoId(e.currentTarget.value)}
                  class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200 font-mono focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label class="block text-zinc-300 font-medium mb-1">Template Inicial</label>
                <select
                  value={novoFluxoTemplate()}
                  onChange={(e) => setNovoFluxoTemplate(e.currentTarget.value as any)}
                  class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200 focus:outline-none focus:border-orange-500"
                >
                  <option value="pipeline">Pipeline Sequencial (Gatilho ➔ Agente ➔ Registro)</option>
                  <option value="fanout">Fanout Paralelo (Múltiplos agentes ➔ Síntese)</option>
                  <option value="review">Review de Qualidade (Executor ➔ Revisor)</option>
                  <option value="debate">Debate de Diretoria (Proponentes ➔ Moderador)</option>
                </select>
              </div>

              <div>
                <label class="block text-zinc-300 font-medium mb-1">Descrição (Opcional)</label>
                <textarea
                  rows={2}
                  placeholder="Objetivo deste fluxo..."
                  value={novoFluxoDesc()}
                  onInput={(e) => setNovoFluxoDesc(e.currentTarget.value)}
                  class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200 focus:outline-none focus:border-orange-500 resize-none"
                />
              </div>
            </div>

            <div class="pt-3 border-t border-zinc-800 flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setModalNovoFluxo(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                variant="primary"
                class="bg-orange-600 hover:bg-orange-500 text-white font-bold"
                onClick={salvarNovoWorkflow}
              >
                Criar Workflow
              </Button>
            </div>
          </div>
        </div>
      </Show>

      {/* Modal Executar Workflow */}
      <Show when={modalExecutar()}>
        <div class="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div class="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div class="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div class="flex items-center gap-2">
                <Play size={16} class="text-orange-400 fill-current" />
                <h3 class="text-sm font-bold text-zinc-100">
                  Executar Workflow: {fluxoAtivo()?.nome}
                </h3>
              </div>
              <IconButton size="xs" variant="ghost" onClick={() => setModalExecutar(false)}>
                <X size={16} />
              </IconButton>
            </div>

            <div class="space-y-3 text-xs">
              <label class="block text-zinc-300 font-medium">
                Entrada Inicial / Payload para o primeiro Node
              </label>
              <textarea
                rows={4}
                placeholder="Insira parâmetros ou dados para alimentar o pipeline..."
                value={entradaTexto()}
                onInput={(e) => setEntradaTexto(e.currentTarget.value)}
                class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-200 focus:outline-none focus:border-orange-500 font-mono resize-none"
              />
            </div>

            <div class="pt-3 border-t border-zinc-800 flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setModalExecutar(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                variant="primary"
                class="bg-orange-600 hover:bg-orange-500 text-white font-bold"
                loading={executando()}
                onClick={dispararExecucao}
              >
                <Send size={12} class="mr-1.5" /> Iniciar Execução
              </Button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};
