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
  Sliders,
  CheckSquare,
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

export const TIPOS_NODE_CATALOGO = [
  { tipo: "agente", rotulo: "Agente Executor", icone: Bot, cor: "text-emerald-400", desc: "Executa ordens e tarefas especializadas com LLM" },
  { tipo: "script", rotulo: "Script do Workspace", icone: Terminal, cor: "text-cyan-400", desc: "Executa scripts (.js, .py, .sh) ou comandos bash locais" },
  { tipo: "reuniao", rotulo: "Reunião de Agentes", icone: Users, cor: "text-indigo-400", desc: "Convoca mesa de deliberação coletiva entre múltiplos agentes" },
  { tipo: "decisao", rotulo: "Decisão Estruturada", icone: HelpCircle, cor: "text-amber-400", desc: "Bifurcação e ramificação com base em critérios lógicos" },
  { tipo: "task_create", rotulo: "Criar Tarefa", icone: Layers, cor: "text-blue-400", desc: "Cria um card no Kanban com título e prioridade" },
  { tipo: "registro", rotulo: "Registro / Documento", icone: FileText, cor: "text-purple-400", desc: "Grava ata, parecer ou relatório nos registries da empresa" },
  { tipo: "webhook", rotulo: "Gatilho Webhook", icone: Webhook, cor: "text-amber-400", desc: "Recebe requisições HTTP externas para acionar o pipeline" },
];

export const FluxosView: Component = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [fluxos, setFluxos] = createSignal<any[]>([]);
  const [agentes, setAgentes] = createSignal<any[]>([]);
  const [fluxoAtivo, setFluxoAtivo] = createSignal<FluxoCompleto | null>(null);
  const [noSelecionado, setNoSelecionado] = createSignal<NoGrafo | null>(null);

  // Modo no NDV: formulário visual ou JSON avançado
  const [modoNdv, setModoNdv] = createSignal<"form" | "json">("form");

  // Menu de Contexto (Botão Direito no Canvas / Node)
  const [menuContexto, setMenuContexto] = createSignal<{
    aberto: boolean;
    x: number;
    y: number;
    noId?: string;
  }>({ aberto: false, x: 0, y: 0 });

  // Modal / Drawer de Adicionar Novo Node
  const [modalAdicionarNode, setModalAdicionarNode] = createSignal(false);
  const [buscaTipoNode, setBuscaTipoNode] = createSignal("");

  // Busca na Lista de Workflows
  const [buscaTexto, setBuscaTexto] = createSignal("");
  const [copiadoId, setCopiadoId] = createSignal<string | null>(null);

  // Zoom & Pan do Canvas
  const [zoom, setZoom] = createSignal(1);
  const [pan, setPan] = createSignal({ x: 50, y: 50 });
  const [isPanning, setIsPanning] = createSignal(false);
  const [startPan, setStartPan] = createSignal({ x: 0, y: 0 });

  // Modais de Execução e Novo Workflow
  const [modalExecutar, setModalExecutar] = createSignal(false);
  const [entradaTexto, setEntradaTexto] = createSignal("");
  const [executando, setExecutando] = createSignal(false);

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

    const fecharMenu = () => {
      if (menuContexto().aberto) {
        setMenuContexto((prev) => ({ ...prev, aberto: false }));
      }
    };
    window.addEventListener("click", fecharMenu);
    return () => window.removeEventListener("click", fecharMenu);
  });

  // Salvar alterações do Workflow no backend
  const salvarAlteracoesWorkflow = async (novoFluxo: FluxoCompleto) => {
    try {
      await fetchApi("/flows", {
        method: "POST",
        body: JSON.stringify(novoFluxo),
      });
      setFluxoAtivo(novoFluxo);
      showToast("Workflow atualizado!", "sucesso");
    } catch (err: any) {
      showToast(`Erro ao salvar: ${err.message}`, "erro");
    }
  };

  // Copiar Workflow JSON
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
      showToast(`Workflow copiado como JSON!`, "sucesso");
      setTimeout(() => setCopiadoId(null), 2500);
    } catch (err: any) {
      showToast(`Erro ao copiar: ${err.message}`, "erro");
    }
  };

  // Adicionar Novo Node ao Workflow Ativo
  const adicionarNodeAoWorkflow = async (tipo: string) => {
    const f = fluxoAtivo();
    if (!f) return;

    const baseId = `${tipo}_${Date.now().toString(36).slice(-4)}`;
    let configPadrao: any = {};

    if (tipo === "agente") {
      const primeiroAgente = agentes()[0]?.id || "executor-padrao";
      configPadrao = { agente: primeiroAgente, ordem: "Analise a entrada: {{entrada}}" };
    } else if (tipo === "script") {
      configPadrao = { arquivo: "scripts/processar.sh", comando: "echo 'executando...'" };
    } else if (tipo === "reuniao") {
      configPadrao = { pauta: "Alinhamento operacional", agentes: ["editor", "critico-site"] };
    } else if (tipo === "decisao") {
      configPadrao = { pergunta: "Aprovar conteúdo?", opcoes: [{ rotulo: "Sim", proximo: "saida" }, { rotulo: "Não", proximo: "revisao" }] };
    } else if (tipo === "task_create") {
      configPadrao = { titulo: "Nova Tarefa via Workflow", coluna: "backlog", prioridade: "media" };
    } else if (tipo === "registro") {
      configPadrao = { categoria: "documentos", titulo: "Resultado do Fluxo" };
    }

    const novoNode: NoGrafo = {
      id: baseId,
      tipo,
      config: configPadrao,
    };

    // Conecta automaticamente o último nó existente ao novo nó
    const novosNos = [...(f.nos || []), novoNode];
    const novasArestas = [...(f.arestas || [])];

    if (f.nos && f.nos.length > 0) {
      const ultimo = f.nos[f.nos.length - 1];
      novasArestas.push({ de: ultimo.id, para: baseId });
    }

    const workflowAtualizado: FluxoCompleto = {
      ...f,
      nos: novosNos,
      arestas: novasArestas,
    };

    await salvarAlteracoesWorkflow(workflowAtualizado);
    setNoSelecionado(novoNode);
    setModalAdicionarNode(false);
  };

  // Duplicar Node
  const duplicarNodeSelecionado = async (noId: string) => {
    const f = fluxoAtivo();
    if (!f) return;
    const alvo = f.nos.find((n) => n.id === noId);
    if (!alvo) return;

    const novoId = `${alvo.id}_copia_${Date.now().toString(36).slice(-3)}`;
    const novoNode: NoGrafo = {
      id: novoId,
      tipo: alvo.tipo,
      config: JSON.parse(JSON.stringify(alvo.config || {})),
    };

    const workflowAtualizado: FluxoCompleto = {
      ...f,
      nos: [...f.nos, novoNode],
      arestas: [...f.arestas, { de: alvo.id, para: novoId }],
    };

    await salvarAlteracoesWorkflow(workflowAtualizado);
    setNoSelecionado(novoNode);
  };

  // Excluir Node
  const excluirNode = async (noId: string) => {
    const f = fluxoAtivo();
    if (!f) return;
    if (f.nos.length <= 1) {
      showToast("O workflow precisa ter ao menos um nó", "aviso");
      return;
    }

    const novosNos = f.nos.filter((n) => n.id !== noId);
    const novasArestas = f.arestas.filter((a) => a.de !== noId && a.para !== noId);

    const workflowAtualizado: FluxoCompleto = {
      ...f,
      nos: novosNos,
      arestas: novasArestas,
    };

    await salvarAlteracoesWorkflow(workflowAtualizado);
    setNoSelecionado(novosNos[0] || null);
  };

  // Atualizar Configuração do Node no formulário NDV
  const atualizarConfigNo = (campo: string, valor: any) => {
    const no = noSelecionado();
    const f = fluxoAtivo();
    if (!no || !f) return;

    const novaConfig = { ...(no.config || {}), [campo]: valor };
    const noAtualizado = { ...no, config: novaConfig };

    setNoSelecionado(noAtualizado);

    const workflowAtualizado: FluxoCompleto = {
      ...f,
      nos: f.nos.map((n) => (n.id === no.id ? noAtualizado : n)),
    };
    setFluxoAtivo(workflowAtualizado);
  };

  // Disparar Execução
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

  // Menu de Contexto ao Clicar com Botão Direito no Canvas ou no Node
  const onContextMenuCanvas = (e: MouseEvent, noId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuContexto({
      aberto: true,
      x: e.clientX,
      y: e.clientY,
      noId,
    });
    if (noId) {
      const n = fluxoAtivo()?.nos.find((item) => item.id === noId);
      if (n) setNoSelecionado(n);
    }
  };

  // Layout Automático de Nós no Canvas
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

                  <div class="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
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
                      variant="primary"
                      class="bg-orange-600 hover:bg-orange-500 text-white font-bold text-[11px]"
                      onClick={() => abrirEditorCanvas(f.id)}
                    >
                      <Eye size={12} class="mr-1.5" /> Abrir Canvas
                    </Button>
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
              {/* Botão + Adicionar Node no Topo */}
              <Button
                size="sm"
                variant="secondary"
                class="border-zinc-800 hover:border-orange-500/50 text-zinc-200 text-xs font-semibold"
                onClick={() => setModalAdicionarNode(true)}
              >
                <Plus size={14} class="mr-1 text-orange-400" /> Adicionar Node
              </Button>

              {/* Botão Copiar JSON */}
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
            onContextMenu={(e) => onContextMenuCanvas(e)}
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
                        onContextMenu={(e) => onContextMenuCanvas(e, no.id)}
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
                            : "Configurado"}
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

            {/* ─────────────────────────────────────────────────────────────
                NDV LATERAL (Node Details View com Formulário Automático + JSON)
               ───────────────────────────────────────────────────────────── */}
            <Show when={noSelecionado()}>
              <div class="absolute right-4 top-4 bottom-4 w-96 bg-zinc-900/95 backdrop-blur-md border border-zinc-800 rounded-xl shadow-2xl flex flex-col z-30 transition-all">
                {/* Topo do NDV */}
                <div class="p-3.5 border-b border-zinc-800 flex items-center justify-between">
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

                  <div class="flex items-center gap-1">
                    {/* Toggle de Modos: Formulário Automático vs JSON */}
                    <div class="flex items-center bg-zinc-950 border border-zinc-800 rounded p-0.5 text-[10px] font-mono">
                      <button
                        onClick={() => setModoNdv("form")}
                        class={`px-2 py-0.5 rounded transition-colors ${
                          modoNdv() === "form" ? "bg-zinc-800 text-zinc-100 font-bold" : "text-zinc-400"
                        }`}
                      >
                        Form
                      </button>
                      <button
                        onClick={() => setModoNdv("json")}
                        class={`px-2 py-0.5 rounded transition-colors ${
                          modoNdv() === "json" ? "bg-zinc-800 text-zinc-100 font-bold" : "text-zinc-400"
                        }`}
                      >
                        JSON
                      </button>
                    </div>

                    <IconButton size="xs" variant="ghost" onClick={() => setNoSelecionado(null)}>
                      <X size={15} />
                    </IconButton>
                  </div>
                </div>

                {/* Conteúdo do NDV */}
                <div class="flex-1 overflow-y-auto p-4 space-y-4 text-xs scrollbar-thin">
                  <Show
                    when={modoNdv() === "form"}
                    fallback={
                      /* Versão Avançada JSON */
                      <div class="space-y-2">
                        <span class="text-[10px] font-bold uppercase text-zinc-500 block font-mono">
                          Configuração Estruturada (Raw JSON)
                        </span>
                        <pre class="p-3 rounded-lg bg-black border border-zinc-800 text-[11px] font-mono text-zinc-300 max-h-96 overflow-y-auto whitespace-pre-wrap scrollbar-thin select-text">
                          {JSON.stringify(noSelecionado()!, null, 2)}
                        </pre>
                      </div>
                    }
                  >
                    {/* FORMULÁRIO AUTOMÁTICO BASEADO NO TIPO DE NÓ */}
                    <div class="space-y-3.5">
                      {/* Nó Tipo Agente */}
                      <Show when={noSelecionado()!.tipo === "agente"}>
                        <div class="space-y-1">
                          <label class="text-[11px] font-medium text-zinc-300 block">
                            Agente Especialista *
                          </label>
                          <select
                            class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 focus:border-orange-500 font-mono"
                            value={noSelecionado()!.config?.agente || ""}
                            onChange={(e) => atualizarConfigNo("agente", e.currentTarget.value)}
                          >
                            <For each={agentes()}>
                              {(ag) => <option value={ag.id}>@{ag.id} ({ag.role || ag.categoria || "agente"})</option>}
                            </For>
                          </select>
                        </div>

                        <div class="space-y-1">
                          <label class="text-[11px] font-medium text-zinc-300 block">
                            Ordem / Instrução ao Agente *
                          </label>
                          <textarea
                            rows={4}
                            placeholder="Instrução para a IA. Aceita {{entrada}} como dado anterior..."
                            value={noSelecionado()!.config?.ordem || ""}
                            onInput={(e) => atualizarConfigNo("ordem", e.currentTarget.value)}
                            class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-200 font-mono focus:border-orange-500 resize-none leading-relaxed"
                          />
                        </div>
                      </Show>

                      {/* Nó Tipo Script */}
                      <Show when={noSelecionado()!.tipo === "script"}>
                        <div class="space-y-1">
                          <label class="text-[11px] font-medium text-zinc-300 block">
                            Caminho do Script (.js, .py, .sh)
                          </label>
                          <input
                            type="text"
                            placeholder="ex: scripts/processar-dados.sh"
                            value={noSelecionado()!.config?.arquivo || ""}
                            onInput={(e) => atualizarConfigNo("arquivo", e.currentTarget.value)}
                            class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 font-mono focus:border-orange-500"
                          />
                        </div>

                        <div class="space-y-1">
                          <label class="text-[11px] font-medium text-zinc-300 block">
                            Comando Bash Alternativo
                          </label>
                          <input
                            type="text"
                            placeholder="ex: python3 script.py {{entrada}}"
                            value={noSelecionado()!.config?.comando || ""}
                            onInput={(e) => atualizarConfigNo("comando", e.currentTarget.value)}
                            class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 font-mono focus:border-orange-500"
                          />
                        </div>
                      </Show>

                      {/* Nó Tipo Reunião */}
                      <Show when={noSelecionado()!.tipo === "reuniao"}>
                        <div class="space-y-1">
                          <label class="text-[11px] font-medium text-zinc-300 block">
                            Pauta da Reunião *
                          </label>
                          <textarea
                            rows={3}
                            placeholder="Tema central para a deliberação dos agentes..."
                            value={noSelecionado()!.config?.pauta || ""}
                            onInput={(e) => atualizarConfigNo("pauta", e.currentTarget.value)}
                            class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 focus:border-orange-500 resize-none"
                          />
                        </div>
                      </Show>

                      {/* Nó Tipo Decisão */}
                      <Show when={noSelecionado()!.tipo === "decisao"}>
                        <div class="space-y-1">
                          <label class="text-[11px] font-medium text-zinc-300 block">
                            Pergunta de Decisão *
                          </label>
                          <input
                            type="text"
                            placeholder="ex: Os critérios de qualidade foram atendidos?"
                            value={noSelecionado()!.config?.pergunta || ""}
                            onInput={(e) => atualizarConfigNo("pergunta", e.currentTarget.value)}
                            class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 focus:border-orange-500"
                          />
                        </div>
                      </Show>

                      {/* Nó Tipo Task Create */}
                      <Show when={noSelecionado()!.tipo === "task_create"}>
                        <div class="space-y-1">
                          <label class="text-[11px] font-medium text-zinc-300 block">
                            Título da Tarefa no Kanban *
                          </label>
                          <input
                            type="text"
                            placeholder="ex: Publicar artigo aprovado na fila"
                            value={noSelecionado()!.config?.titulo || ""}
                            onInput={(e) => atualizarConfigNo("titulo", e.currentTarget.value)}
                            class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 focus:border-orange-500"
                          />
                        </div>

                        <div class="grid grid-cols-2 gap-2">
                          <div>
                            <label class="text-[10px] text-zinc-400 block mb-1">Coluna</label>
                            <select
                              class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-1.5 text-xs text-zinc-200 focus:border-orange-500"
                              value={noSelecionado()!.config?.coluna || "backlog"}
                              onChange={(e) => atualizarConfigNo("coluna", e.currentTarget.value)}
                            >
                              <option value="backlog">Backlog</option>
                              <option value="fazer">A Fazer</option>
                              <option value="andamento">Em Andamento</option>
                              <option value="revisao">Revisão</option>
                            </select>
                          </div>
                          <div>
                            <label class="text-[10px] text-zinc-400 block mb-1">Prioridade</label>
                            <select
                              class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-1.5 text-xs text-zinc-200 focus:border-orange-500"
                              value={noSelecionado()!.config?.prioridade || "media"}
                              onChange={(e) => atualizarConfigNo("prioridade", e.currentTarget.value)}
                            >
                              <option value="baixa">Baixa</option>
                              <option value="media">Média</option>
                              <option value="alta">Alta</option>
                              <option value="urgente">Urgente</option>
                            </select>
                          </div>
                        </div>
                      </Show>

                      {/* Nó Tipo Registro / Documento */}
                      <Show when={noSelecionado()!.tipo === "registro" || noSelecionado()!.tipo === "saida"}>
                        <div class="space-y-1">
                          <label class="text-[11px] font-medium text-zinc-300 block">
                            Categoria do Registro
                          </label>
                          <input
                            type="text"
                            placeholder="ex: documentos, atas, relatorios"
                            value={noSelecionado()!.config?.categoria || "documentos"}
                            onInput={(e) => atualizarConfigNo("categoria", e.currentTarget.value)}
                            class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 focus:border-orange-500 font-mono"
                          />
                        </div>
                      </Show>
                    </div>
                  </Show>
                </div>

                {/* Rodapé do NDV com Ações de Salvar e Excluir Node */}
                <div class="p-3 border-t border-zinc-800 flex items-center justify-between">
                  <Button
                    size="xs"
                    variant="ghost"
                    class="text-rose-400 hover:text-rose-300"
                    onClick={() => excluirNode(noSelecionado()!.id)}
                  >
                    <Trash2 size={13} class="mr-1" /> Excluir Node
                  </Button>

                  <Button
                    size="xs"
                    variant="primary"
                    class="bg-orange-600 hover:bg-orange-500 text-white font-bold"
                    onClick={() => setNoSelecionado(null)}
                  >
                    Concluir Edição
                  </Button>
                </div>
              </div>
            </Show>
          </div>
        </div>
      </Show>

      {/* ─────────────────────────────────────────────────────────────
          MENU DE CONTEXTO ESTILO N8N (Ao clicar com botão direito)
         ───────────────────────────────────────────────────────────── */}
      <Show when={menuContexto().aberto}>
        <div
          class="fixed z-50 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl py-1.5 w-56 text-xs text-zinc-200 select-none animate-in fade-in zoom-in-95 duration-100"
          style={{
            left: `${Math.min(menuContexto().x, window.innerWidth - 230)}px`,
            top: `${Math.min(menuContexto().y, window.innerHeight - 250)}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <Show
            when={menuContexto().noId}
            fallback={
              /* Menu do Canvas Vazio */
              <>
                <button
                  onClick={() => {
                    setMenuContexto((p) => ({ ...p, aberto: false }));
                    setModalAdicionarNode(true);
                  }}
                  class="w-full px-3 py-1.5 flex items-center justify-between hover:bg-orange-600 hover:text-white transition-colors text-left"
                >
                  <span class="flex items-center gap-2">
                    <Plus size={14} /> Adicionar Node
                  </span>
                  <span class="text-[10px] opacity-60 font-mono">N</span>
                </button>
                <div class="my-1 border-t border-zinc-800" />
                <button
                  onClick={() => {
                    setMenuContexto((p) => ({ ...p, aberto: false }));
                    resetView();
                  }}
                  class="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-zinc-800 text-left"
                >
                  <Maximize2 size={13} /> Resetar Visualização
                </button>
                <button
                  onClick={() => {
                    setMenuContexto((p) => ({ ...p, aberto: false }));
                    void copiarWorkflowJson(fluxoAtivo()!);
                  }}
                  class="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-zinc-800 text-left"
                >
                  <Copy size={13} /> Copiar Workflow JSON
                </button>
              </>
            }
          >
            {/* Menu ao Clicar em um Node */}
            <div class="px-3 py-1 text-[10px] font-mono text-zinc-500 uppercase border-b border-zinc-800 mb-1">
              Node: {menuContexto().noId}
            </div>
            <button
              onClick={() => {
                const n = fluxoAtivo()?.nos.find((item) => item.id === menuContexto().noId);
                if (n) setNoSelecionado(n);
                setMenuContexto((p) => ({ ...p, aberto: false }));
              }}
              class="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-zinc-800 text-left"
            >
              <Sliders size={13} class="text-orange-400" /> Abrir Parâmetros (NDV)
            </button>
            <button
              onClick={() => {
                void duplicarNodeSelecionado(menuContexto().noId!);
                setMenuContexto((p) => ({ ...p, aberto: false }));
              }}
              class="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-zinc-800 text-left"
            >
              <Copy size={13} /> Duplicar Node
            </button>
            <button
              onClick={() => {
                setMenuContexto((p) => ({ ...p, aberto: false }));
                setModalAdicionarNode(true);
              }}
              class="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-zinc-800 text-left"
            >
              <Plus size={13} /> Conectar Novo Node
            </button>
            <div class="my-1 border-t border-zinc-800" />
            <button
              onClick={() => {
                void excluirNode(menuContexto().noId!);
                setMenuContexto((p) => ({ ...p, aberto: false }));
              }}
              class="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-rose-950/80 text-rose-400 text-left"
            >
              <Trash2 size={13} /> Excluir Node
            </button>
          </Show>
        </div>
      </Show>

      {/* ─────────────────────────────────────────────────────────────
          MODAL / DRAWER CATÁLOGO DE ADICIONAR NOVO NODE
         ───────────────────────────────────────────────────────────── */}
      <Show when={modalAdicionarNode()}>
        <div class="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50" onClick={() => setModalAdicionarNode(false)}>
          <div class="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div class="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 class="text-sm font-bold text-zinc-100 flex items-center gap-2">
                  <Plus size={16} class="text-orange-400" /> Adicionar Node ao Workflow
                </h3>
                <p class="text-[11px] text-zinc-400 mt-0.5">
                  Escolha o bloco para adicionar ao pipeline e conectar ao fluxo
                </p>
              </div>
              <IconButton size="xs" variant="ghost" onClick={() => setModalAdicionarNode(false)}>
                <X size={16} />
              </IconButton>
            </div>

            <div class="space-y-2">
              <For each={TIPOS_NODE_CATALOGO}>
                {(item) => (
                  <div
                    onClick={() => void adicionarNodeAoWorkflow(item.tipo)}
                    class="p-3 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-orange-500/60 hover:bg-zinc-900 cursor-pointer transition-all flex items-start gap-3 group"
                  >
                    <div class={`p-2 rounded-lg bg-zinc-900 border border-zinc-800 ${item.cor} group-hover:scale-110 transition-transform`}>
                      <item.icone size={18} />
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="font-bold text-xs text-zinc-200 group-hover:text-orange-400 transition-colors">
                        {item.rotulo}
                      </div>
                      <p class="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                    <ChevronRight size={15} class="text-zinc-600 group-hover:text-orange-400 transition-colors self-center" />
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>
      </Show>

      {/* Modal Novo Workflow */}
      <Show when={modalNovoFluxo()}>
        <div class="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50" onClick={() => setModalNovoFluxo(false)}>
          <div class="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
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
                onClick={async () => {
                  const id = novoFluxoId().trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
                  const nome = novoFluxoNome().trim();
                  if (!id || !nome) return;
                  try {
                    await fetchApi("/flows", {
                      method: "POST",
                      body: JSON.stringify({
                        id,
                        nome,
                        descricao: novoFluxoDesc(),
                        nos: [{ id: "gatilho", tipo: "manual", config: {} }],
                        arestas: [],
                      }),
                    });
                    setModalNovoFluxo(false);
                    await carregarFluxos();
                    void abrirEditorCanvas(id);
                  } catch {}
                }}
              >
                Criar Workflow
              </Button>
            </div>
          </div>
        </div>
      </Show>

      {/* Modal Executar Workflow */}
      <Show when={modalExecutar()}>
        <div class="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50" onClick={() => setModalExecutar(false)}>
          <div class="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
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
