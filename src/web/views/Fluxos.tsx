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

  // Zoom & Pan do Canvas
  const [zoom, setZoom] = createSignal(1);
  const [pan, setPan] = createSignal({ x: 50, y: 50 });
  const [isPanning, setIsPanning] = createSignal(false);
  const [startPan, setStartPan] = createSignal({ x: 0, y: 0 });

  // Modais
  const [modalExecutar, setModalExecutar] = createSignal(false);
  const [entradaTexto, setEntradaTexto] = createSignal("");
  const [executando, setExecutando] = createSignal(false);

  // Modal Novo Nó / Workflow
  const [modalNovoNo, setModalNovoNo] = createSignal(false);
  const [modalNovoFluxo, setModalNovoFluxo] = createSignal(false);
  const [novoFluxoId, setNovoFluxoId] = createSignal("");
  const [novoFluxoNome, setNovoFluxoNome] = createSignal("");
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
        void selecionarFluxoPorId(urlId);
      } else if (lista && lista.length > 0 && !fluxoAtivo()) {
        void selecionarFluxoPorId(lista[0].id);
      }
    } catch {}
  };

  const selecionarFluxoPorId = async (id: string) => {
    try {
      const f = await fetchApi<FluxoCompleto>(`/flows/${encodeURIComponent(id)}`);
      setFluxoAtivo(f);
      setNoSelecionado(f.nos && f.nos.length > 0 ? f.nos[0] : null);
      setSearchParams({ fluxo: id });
    } catch (e: any) {
      showToast(`Erro ao carregar fluxo: ${e.message}`, "erro");
    }
  };

  createEffect(() => {
    const fId = searchParams.fluxo as string | undefined;
    if (fId && (!fluxoAtivo() || fluxoAtivo()!.id !== fId)) {
      void selecionarFluxoPorId(fId);
    }
  });

  onMount(() => {
    void carregarFluxos();
  });

  // Layout Automático de Nós no Canvas estilo n8n (Horizontal Flow)
  const nosPosicionados = createMemo(() => {
    const f = fluxoAtivo();
    if (!f || !f.nos) return [];

    const nos = [...f.nos];
    const arestas = f.arestas || [];

    // Calcular coluna/nível de cada nó via ordem topológica
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
    const COL_WIDTH = 260;
    const ROW_HEIGHT = 140;

    Object.entries(colunas).forEach(([lvlStr, lista]) => {
      const colIdx = Number(lvlStr);
      const totalNaColuna = lista.length;
      lista.forEach((no, rowIdx) => {
        const x = 60 + colIdx * COL_WIDTH;
        const y = 80 + (rowIdx - (totalNaColuna - 1) / 2) * ROW_HEIGHT + 120;
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

    return f.arestas.map((a) => {
      const origem = mapaNos.get(a.de);
      const destino = mapaNos.get(a.para);
      if (!origem || !destino) return null;

      // Pontos de Conexão: Saída na direita, Entrada na esquerda
      const x1 = origem.x + 190;
      const y1 = origem.y + 40;
      const x2 = destino.x;
      const y2 = destino.y + 40;

      // Curva Bezier estilo n8n
      const dx = Math.max(Math.abs(x2 - x1) * 0.5, 40);
      const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

      return { ...a, path, x1, y1, x2, y2 };
    }).filter(Boolean);
  });

  const iconeDoNo = (tipo: string) => {
    switch (tipo) {
      case "manual":
      case "webhook":
        return <Webhook size={16} class="text-amber-400" />;
      case "agente":
        return <Bot size={16} class="text-emerald-400" />;
      case "script":
        return <Terminal size={16} class="text-cyan-400" />;
      case "decisao":
        return <HelpCircle size={16} class="text-amber-400" />;
      case "task_create":
        return <Layers size={16} class="text-blue-400" />;
      case "reuniao":
        return <Users size={16} class="text-indigo-400" />;
      case "registro":
      case "saida":
        return <FileText size={16} class="text-purple-400" />;
      case "fanout":
      case "debate":
      case "review":
        return <GitBranch size={16} class="text-rose-400" />;
      default:
        return <Play size={16} class="text-zinc-400" />;
    }
  };

  const corDoNo = (tipo: string) => {
    switch (tipo) {
      case "manual":
      case "webhook":
        return "border-amber-500/60 bg-amber-950/20 text-amber-300";
      case "agente":
        return "border-emerald-500/60 bg-emerald-950/20 text-emerald-300";
      case "script":
        return "border-cyan-500/60 bg-cyan-950/20 text-cyan-300";
      case "decisao":
        return "border-amber-500/60 bg-amber-950/20 text-amber-300";
      case "task_create":
        return "border-blue-500/60 bg-blue-950/20 text-blue-300";
      case "reuniao":
        return "border-indigo-500/60 bg-indigo-950/20 text-indigo-300";
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
      showToast(`Execução do fluxo "${f.nome}" iniciada!`, "sucesso");
      setModalExecutar(false);
      setEntradaTexto("");
    } catch (err: any) {
      showToast(`Erro ao rodar: ${err.message}`, "erro");
    } finally {
      setExecutando(false);
    }
  };

  // Pan do Canvas com Mouse Drag
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

  return (
    <div class="flex flex-col h-full w-full overflow-hidden bg-zinc-950 select-none">
      {/* Topo / Barra de Ferramentas n8n */}
      <div class="h-14 border-b border-zinc-800 bg-zinc-900/80 px-4 flex items-center justify-between gap-4 z-20">
        <div class="flex items-center gap-3 min-w-0">
          <div class="flex items-center gap-2">
            <div class="h-8 w-8 rounded-lg bg-orange-600/20 border border-orange-500/40 flex items-center justify-center text-orange-400">
              <GitBranch size={16} />
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <select
                  class="bg-transparent font-bold text-xs text-zinc-100 focus:outline-none cursor-pointer hover:text-orange-400 transition-colors"
                  value={fluxoAtivo()?.id || ""}
                  onChange={(e) => selecionarFluxoPorId(e.currentTarget.value)}
                >
                  <For each={fluxos()}>
                    {(f) => <option value={f.id} class="bg-zinc-900 text-zinc-100">{f.nome || f.id}</option>}
                  </For>
                </select>
                <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                  {fluxoAtivo()?.nos?.length || 0} nodes
                </span>
              </div>
              <p class="text-[10px] text-zinc-400 truncate max-w-xs sm:max-w-md">
                {fluxoAtivo()?.descricao || "Workflow canvas com conexões e execução em grafo estilo n8n"}
              </p>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2">
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

          <Button size="sm" variant="secondary" onClick={carregarFluxos} title="Atualizar">
            <RefreshCw size={13} />
          </Button>

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

      {/* Canvas Principal com Grid n8n e Nós Visuais */}
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
          {/* SVG para as Arestas / Conexões Curvadas com Handles */}
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
                  {/* Linha de sombra suave */}
                  <path
                    d={a.path}
                    fill="none"
                    stroke="#000000"
                    stroke-width="5"
                    opacity="0.4"
                  />
                  {/* Linha principal curva estilo n8n */}
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

          {/* Nós Visuais no Canvas (Renderização estilo n8n Node Card) */}
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

        {/* Drawer Lateral / NDV (Node Details View do n8n) */}
        <Show when={noSelecionado()}>
          <div class="absolute right-4 top-4 bottom-4 w-96 bg-zinc-900/95 backdrop-blur-md border border-zinc-800 rounded-xl shadow-2xl flex flex-col z-30 transition-all">
            {/* Header do NDV */}
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

            {/* Conteúdo dos Parâmetros do Nó */}
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

              <Show when={noSelecionado()!.config?.pauta}>
                <div class="space-y-1">
                  <label class="text-[10px] uppercase font-bold text-zinc-500 block">
                    Pauta da Reunião
                  </label>
                  <p class="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300">
                    {noSelecionado()!.config.pauta}
                  </p>
                </div>
              </Show>

              {/* JSON Raw do Nó */}
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
