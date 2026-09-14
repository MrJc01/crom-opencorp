import {
  type Component,
  createSignal,
  createMemo,
  For,
  Show,
  type JSX,
} from "solid-js";
import {
  Webhook,
  Calendar,
  RefreshCw,
  Code2,
  Bot,
  Terminal,
  HelpCircle,
  Layers,
  Users,
  Workflow,
  Globe,
  Clock,
  FileText,
  Play,
  Zap,
  Sliders,
  Copy,
  Trash2,
} from "lucide-solid";
import { showToast } from "../../ui/Toast";
import { type NoGrafo, type FluxoCompleto } from "./types";

export function iconeDoNo(tipo: string): JSX.Element {
  switch (tipo) {
    case "manual":
    case "webhook":
      return <Webhook size={15} class="text-amber-400" />;
    case "cron":
      return <Calendar size={15} class="text-sky-400" />;
    case "loop":
      return <RefreshCw size={15} class="text-orange-400" />;
    case "componente":
      return <Code2 size={15} class="text-teal-400" />;
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
    case "subflow":
      return <Workflow size={15} class="text-purple-400" />;
    case "http_request":
      return <Globe size={15} class="text-sky-400" />;
    case "delay":
      return <Clock size={15} class="text-yellow-400" />;
    case "registro":
    case "saida":
      return <FileText size={15} class="text-purple-400" />;
    default:
      return <Play size={15} class="text-zinc-400" />;
  }
}

export function corDoNo(tipo: string): string {
  switch (tipo) {
    case "manual":
    case "webhook":
      return "border-amber-500/50 bg-amber-950/20 text-amber-300";
    case "cron":
      return "border-sky-500/50 bg-sky-950/20 text-sky-300";
    case "loop":
      return "border-orange-500/50 bg-orange-950/20 text-orange-300";
    case "subflow":
      return "border-purple-500/50 bg-purple-950/20 text-purple-300";
    case "http_request":
      return "border-blue-500/50 bg-blue-950/20 text-blue-300";
    case "delay":
      return "border-yellow-500/50 bg-yellow-950/20 text-yellow-300";
    case "componente":
      return "border-teal-500/50 bg-teal-950/20 text-teal-300";
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
}

export interface GraphCanvasProps {
  fluxo: () => FluxoCompleto | null;
  noSelecionado: () => NoGrafo | null;
  onSelectNo: (no: NoGrafo | null) => void;
  conectandoDeNoId: () => string | null;
  onCancelConexao: () => void;
  onIniciarConexao: (origemId: string, e?: MouseEvent) => void;
  onCompletarConexao: (destinoId: string) => void;
  onRemoverAresta: (de: string, para: string) => void;
  onContextMenuCanvas: (e: MouseEvent, noId?: string) => void;
  onSalvarPosicaoNode: (id: string, pos: { x: number; y: number }) => void;
  onAdicionarNodeAoWorkflow: (tipo: string, pos?: { x: number; y: number }) => Promise<void>;
  onDuplicarNode: (noId: string) => void;
  onExcluirNode: (noId: string) => void;
  zoom: () => number;
  setZoom: (fn: (z: number) => number) => void;
  pan: () => { x: number; y: number };
  setPan: (fn: (p: { x: number; y: number }) => { x: number; y: number }) => void;
  logsExecucoes?: () => any[];
}

export const GraphCanvas: Component<GraphCanvasProps> = (props) => {
  const [noArrastandoId, setNoArrastandoId] = createSignal<string | null>(null);
  const [dragStart, setDragStart] = createSignal<{ mouseX: number; mouseY: number; nodeX: number; nodeY: number } | null>(null);
  const [houveArrasto, setHouveArrasto] = createSignal(false);
  const [mousePos, setMousePos] = createSignal<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = createSignal(false);
  const [startPan, setStartPan] = createSignal({ x: 0, y: 0 });

  // Posição calculada dos nós (suporta pos manual persistida ou layout topológico em colunas)
  const nosPosicionados = createMemo(() => {
    const f = props.fluxo();
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
        const defaultX = 70 + colIdx * COL_WIDTH;
        const defaultY = 90 + (rowIdx - (totalNaColuna - 1) / 2) * ROW_HEIGHT + 110;
        const x = no.pos?.x !== undefined ? no.pos.x : defaultX;
        const y = no.pos?.y !== undefined ? no.pos.y : defaultY;
        posicionados.push({ ...no, x, y });
      });
    });

    return posicionados;
  });

  // Arestas curvas Bezier entre os nós
  const arestasCurvadas = createMemo(() => {
    const nos = nosPosicionados();
    const f = props.fluxo();
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
        const midX = Math.round((x1 + x2) / 2);
        const midY = Math.round((y1 + y2) / 2);

        return { ...a, path, x1, y1, x2, y2, midX, midY };
      })
      .filter(Boolean);
  });

  // Linha de Conexão Ativa guiada pelo Mouse
  const linhaConexaoGuia = createMemo(() => {
    const origemId = props.conectandoDeNoId();
    if (!origemId) return null;
    const origemNo = nosPosicionados().find((n) => n.id === origemId);
    if (!origemNo) return null;

    const x1 = origemNo.x + 190;
    const y1 = origemNo.y + 40;
    const mx = Math.round((mousePos().x - props.pan().x) / props.zoom());
    const my = Math.round((mousePos().y - props.pan().y) / props.zoom());

    const dx = Math.max(Math.abs(mx - x1) * 0.5, 40);
    const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${mx - dx} ${my}, ${mx} ${my}`;
    return { path, mx, my };
  });

  // Mouse Handlers
  const onMouseDownCanvas = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest(".canvas-node")) return;
    if ((e.target as HTMLElement).closest(".ndv-panel")) return;
    if ((e.target as HTMLElement).closest(".canvas-toolbar")) return;

    props.onSelectNo(null);

    if (props.conectandoDeNoId()) {
      props.onCancelConexao();
      showToast("Conexão cancelada", "info");
      return;
    }

    setIsPanning(true);
    setStartPan({ x: e.clientX - props.pan().x, y: e.clientY - props.pan().y });
  };

  const onMouseDownNode = (e: MouseEvent, no: NoGrafo & { x: number; y: number }) => {
    if (props.conectandoDeNoId()) {
      e.stopPropagation();
      props.onCompletarConexao(no.id);
      return;
    }

    if (e.button !== 0) return;
    e.stopPropagation();
    props.onSelectNo(no);
    setHouveArrasto(false);
    setNoArrastandoId(no.id);
    setDragStart({
      mouseX: e.clientX,
      mouseY: e.clientY,
      nodeX: no.x,
      nodeY: no.y,
    });
  };

  const onMouseMoveCanvas = (e: MouseEvent) => {
    const arrastandoId = noArrastandoId();
    const ds = dragStart();

    if (arrastandoId && ds) {
      const z = props.zoom();
      const dx = (e.clientX - ds.mouseX) / z;
      const dy = (e.clientY - ds.mouseY) / z;

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        setHouveArrasto(true);
      }

      const novoX = Math.round(ds.nodeX + dx);
      const novoY = Math.round(ds.nodeY + dy);

      // Atualiza na memória local
      const f = props.fluxo();
      if (f) {
        const noAtualizado = f.nos.find((n) => n.id === arrastandoId);
        if (noAtualizado) {
          noAtualizado.pos = { x: novoX, y: novoY };
        }
      }
      return;
    }

    setMousePos({ x: e.clientX, y: e.clientY });

    if (!isPanning()) return;
    props.setPan(() => ({ x: e.clientX - startPan().x, y: e.clientY - startPan().y }));
  };

  const onMouseUpCanvas = () => {
    const arrastandoId = noArrastandoId();
    if (arrastandoId) {
      const ds = dragStart();
      setNoArrastandoId(null);
      setDragStart(null);
      if (houveArrasto() && ds) {
        const no = nosPosicionados().find((n) => n.id === arrastandoId);
        if (no) {
          props.onSalvarPosicaoNode(arrastandoId, { x: no.x, y: no.y });
        }
      }
    }
    setIsPanning(false);
  };

  return (
    <div
      class="flex-1 h-full min-w-0 relative overflow-hidden cursor-grab active:cursor-grabbing bg-[#0d0f12]"
      onScroll={(e) => {
        e.currentTarget.scrollLeft = 0;
        e.currentTarget.scrollTop = 0;
      }}
      onMouseDown={onMouseDownCanvas}
      onMouseMove={onMouseMoveCanvas}
      onMouseUp={onMouseUpCanvas}
      onMouseLeave={onMouseUpCanvas}
      onContextMenu={(e) => props.onContextMenuCanvas(e)}
      onDragOver={(e) => {
        if (e.dataTransfer?.types.includes("application/opencorp-node-tipo")) {
          e.preventDefault();
          e.dataTransfer!.dropEffect = "copy";
        }
      }}
      onDrop={(e) => {
        const tipo = e.dataTransfer?.getData("application/opencorp-node-tipo");
        if (!tipo) return;
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const x = Math.round((e.clientX - rect.left - props.pan().x) / props.zoom());
        const y = Math.round((e.clientY - rect.top - props.pan().y) / props.zoom());
        void props.onAdicionarNodeAoWorkflow(tipo, { x, y });
      }}
      onWheel={(e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const delta = e.deltaY > 0 ? -0.08 : 0.08;
          props.setZoom((z) => Math.max(0.3, Math.min(2.5, z + delta)));
        }
      }}
      style={{
        "background-image": "radial-gradient(#27272a 1px, transparent 1px)",
        "background-size": `${24 * props.zoom()}px ${24 * props.zoom()}px`,
        "background-position": `${props.pan().x}px ${props.pan().y}px`,
      }}
    >
      {/* Banner Flutuante de Conexão Ativa */}
      <Show when={props.conectandoDeNoId()}>
        <div class="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-orange-950/90 border border-orange-500/60 rounded-full px-4 py-1.5 shadow-2xl flex items-center gap-3 text-xs text-orange-200 backdrop-blur-md animate-pulse">
          <span class="flex items-center gap-1.5">
            <Zap size={12} class="text-orange-400" />
            <span>
              Conectando a partir de <strong class="font-mono text-white">{props.conectandoDeNoId()}</strong> — clique no nó de destino
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              props.onCancelConexao();
              showToast("Conexão cancelada", "info");
            }}
            class="px-2 py-0.5 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 text-[11px] font-bold cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      </Show>

      {/* Camada Transformada por Zoom e Pan */}
      <div
        class="absolute inset-0 origin-top-left pointer-events-none"
        style={{
          transform: `translate(${props.pan().x}px, ${props.pan().y}px) scale(${props.zoom()})`,
        }}
      >
        {/* SVG para as Arestas / Conexões Curvas */}
        <svg class="absolute inset-0 overflow-visible w-full h-full pointer-events-none">
          <defs>
            <linearGradient id="edge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#f97316" />
              <stop offset="100%" stop-color="#3b82f6" />
            </linearGradient>
          </defs>
          <For each={arestasCurvadas()}>
            {(a: any) => (
              <g class="group">
                <path
                  d={a.path}
                  fill="none"
                  stroke="#000000"
                  stroke-width="6"
                  opacity="0.5"
                />
                <path
                  d={a.path}
                  fill="none"
                  stroke="url(#edge-gradient)"
                  stroke-width="2.5"
                  class="transition-all group-hover:stroke-rose-400 group-hover:stroke-[3.5]"
                />
                {/* Ponto interativo para desconectar aresta */}
                <g
                  transform={`translate(${a.midX}, ${a.midY})`}
                  class="pointer-events-auto cursor-pointer group-hover:opacity-100 opacity-0 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onRemoverAresta(a.de, a.para);
                  }}
                >
                  <title>Clique para desconectar ({a.de} → {a.para})</title>
                  <circle r="9" fill="#18181b" stroke="#f43f5e" stroke-width="1.5" />
                  <text y="3" text-anchor="middle" fill="#f43f5e" font-size="10" font-weight="bold">✕</text>
                </g>
              </g>
            )}
          </For>

          {/* Linha Guia Dinâmica ao Conectar estilo n8n */}
          <Show when={linhaConexaoGuia()}>
            <g class="pointer-events-none animate-pulse">
              <path
                d={linhaConexaoGuia()!.path}
                fill="none"
                stroke="#f97316"
                stroke-width="2.5"
                stroke-dasharray="6,4"
              />
              <circle cx={linhaConexaoGuia()!.mx} cy={linhaConexaoGuia()!.my} r="5" fill="#f97316" />
            </g>
          </Show>
        </svg>

        {/* Nós Visuais no Canvas com Drag & Drop e Portas de Conexão */}
        <div class="relative pointer-events-auto">
          <For each={nosPosicionados()}>
            {(no) => {
              const selecionado = () => props.noSelecionado()?.id === no.id;
              const isTrigger = no.tipo === "manual" || no.tipo === "webhook" || no.tipo === "cron";
              const isConectandoOrigem = () => props.conectandoDeNoId() === no.id;
              const isConectandoAlvo = () => props.conectandoDeNoId() && props.conectandoDeNoId() !== no.id;
              const numSaidas = () => (props.fluxo()?.arestas || []).filter((a) => a.de === no.id).length;

              return (
                <div
                  data-node-id={no.id}
                  class={`canvas-node absolute w-[190px] h-[80px] rounded-xl border p-2.5 transition-all shadow-xl flex flex-col justify-between select-none ${
                    corDoNo(no.tipo)
                  } ${
                    selecionado()
                      ? "ring-2 ring-orange-500 border-orange-400 shadow-orange-500/20 scale-105 z-10"
                      : isConectandoAlvo()
                      ? "ring-2 ring-emerald-500/90 border-emerald-400 animate-pulse cursor-pointer shadow-emerald-500/20 scale-[1.02]"
                      : "hover:border-zinc-500 hover:scale-[1.02] cursor-move"
                  }`}
                  style={{
                    left: `${no.x}px`,
                    top: `${no.y}px`,
                    background: "#18181b",
                  }}
                  onMouseDown={(e) => onMouseDownNode(e, no)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (props.conectandoDeNoId()) {
                      props.onCompletarConexao(no.id);
                    } else {
                      props.onSelectNo(no);
                    }
                  }}
                  onContextMenu={(e) => props.onContextMenuCanvas(e, no.id)}
                >
                  {/* Handle de Entrada (Esquerda) */}
                  <Show when={!isTrigger}>
                    <div
                      class="absolute -left-3 top-[28px] w-6 h-6 rounded-full bg-zinc-900 border-2 border-orange-500 shadow-md flex items-center justify-center hover:scale-125 transition-transform cursor-pointer z-20 group"
                      title={props.conectandoDeNoId() ? "Clique para conectar aqui (Input Port)" : "Input Port (Entrada)"}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (props.conectandoDeNoId()) props.onCompletarConexao(no.id);
                      }}
                    >
                      <div class="w-2 h-2 rounded-full bg-orange-400 group-hover:scale-125 transition-transform" />
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

                    <div class="flex items-center gap-1">
                      <Show when={numSaidas() > 1}>
                        <span
                          class="px-1.5 py-0.2 rounded text-[9px] bg-blue-950 text-blue-400 border border-blue-800/60 font-mono font-bold"
                          title={`${numSaidas()} saídas ativas`}
                        >
                          {numSaidas()} saídas
                        </span>
                      </Show>
                      <Show when={selecionado()}>
                        <span class="h-2 w-2 rounded-full bg-orange-400 animate-pulse" />
                      </Show>
                    </div>
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

                  {/* Handle de Saída (Direita) - Permite Múltiplas Saídas */}
                  <div
                    class={`absolute -right-3 top-[28px] w-6 h-6 rounded-full bg-zinc-900 border-2 shadow-md flex items-center justify-center hover:scale-125 transition-transform cursor-pointer z-20 group ${
                      isConectandoOrigem() ? "border-orange-500 ring-2 ring-orange-500/50" : "border-blue-500"
                    }`}
                    title="Clique para ligar a outro nó (Output Port - permite múltiplas saídas)"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onIniciarConexao(no.id, e);
                    }}
                  >
                    <div class="w-2 h-2 rounded-full bg-blue-400 group-hover:scale-125 transition-transform" />
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </div>

      {/* Minimapa do canvas (canto inferior direito) */}
      <div class="absolute bottom-3 right-3 z-20 w-[150px] h-[100px] bg-zinc-950/90 border border-zinc-700/70 rounded-lg overflow-hidden shadow-xl backdrop-blur-sm">
        <div class="px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wider text-zinc-500 border-b border-zinc-800/60">Minimapa</div>
        <svg viewBox="0 0 1000 600" class="w-full h-[78px]">
          <For each={props.fluxo()?.arestas || []}>
            {(a) => {
              const nos = props.fluxo()?.nos || [];
              const de = nos.findIndex((n) => n.id === a.de);
              const para = nos.findIndex((n) => n.id === a.para);
              if (de < 0 || para < 0) return null;
              const x1 = ((de % 4) * 220 + 80) * 0.9;
              const y1 = (Math.floor(de / 4) * 140 + 80) * 0.9;
              const x2 = ((para % 4) * 220 + 80) * 0.9;
              const y2 = (Math.floor(para / 4) * 140 + 80) * 0.9;
              return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#f97316" stroke-width="2" opacity="0.6" />;
            }}
          </For>
          <For each={props.fluxo()?.nos || []}>
            {(_n, i) => {
              const x = ((i() % 4) * 220 + 80) * 0.9;
              const y = (Math.floor(i() % 4) * 140 + 80) * 0.9;
              return <rect x={x - 20} y={y - 12} width="40" height="24" rx="4" fill="#3f3f46" stroke="#71717a" stroke-width="1" />;
            }}
          </For>
        </svg>
      </div>
    </div>
  );
};
