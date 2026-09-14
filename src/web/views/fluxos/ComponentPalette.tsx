import { type Component, createSignal, createMemo, For, Show } from "solid-js";
import {
  Plus,
  X,
  Search,
  Maximize2,
  Copy,
  Sliders,
  Trash2,
} from "lucide-solid";
import { IconButton } from "../../ui/IconButton";
import { TIPOS_NODE_CATALOGO, type TipoNodeItem, type MenuContextoState } from "./types";

export interface ComponentPaletteProps {
  aberto: () => boolean;
  onClose: () => void;
  onAdicionarNode: (tipo: string) => void;
  menuContexto: () => MenuContextoState;
  onCloseMenuContexto: () => void;
  onResetView: () => void;
  onCopiarJson: () => void;
  onAbrirNdv: (noId: string) => void;
  onDuplicarNode: (noId: string) => void;
  onExcluirNode: (noId: string) => void;
}

export const ComponentPalette: Component<ComponentPaletteProps> = (props) => {
  const [categoriaNodeFiltro, setCategoriaNodeFiltro] = createSignal<string>("todos");
  const [buscaTipoNode, setBuscaTipoNode] = createSignal("");

  const tiposFiltrados = createMemo(() => {
    const q = buscaTipoNode().toLowerCase().trim();
    const cat = categoriaNodeFiltro();
    return TIPOS_NODE_CATALOGO.filter((t) => {
      const matchCat = cat === "todos" || t.categoria === cat;
      const matchQ =
        !q ||
        t.rotulo.toLowerCase().includes(q) ||
        t.tipo.toLowerCase().includes(q) ||
        t.desc.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  });

  return (
    <>
      {/* ─────────────────────────────────────────────────────────────
          DRAWER LATERAL: CATÁLOGO DE NÓS COM DRAG & DROP (estilo n8n)
         ───────────────────────────────────────────────────────────── */}
      <Show when={props.aberto()}>
        {/* Overlay escuro */}
        <div class="fixed inset-0 bg-black/50 z-40" onClick={() => props.onClose()} />

        {/* Drawer lateral direito */}
        <div class="fixed top-0 right-0 bottom-0 w-[340px] max-w-[85vw] z-50 bg-zinc-900 border-l border-zinc-700 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
          {/* Cabeçalho */}
          <div class="p-3 border-b border-zinc-800 flex items-center justify-between shrink-0">
            <div class="flex items-center gap-2">
              <div class="p-1.5 rounded-lg bg-orange-600/20 border border-orange-500/40">
                <Plus size={15} class="text-orange-400" />
              </div>
              <div>
                <h3 class="text-xs font-bold text-zinc-100">Adicionar Node</h3>
                <p class="text-[10px] text-zinc-500">Arraste para o canvas ou clique</p>
              </div>
            </div>
            <IconButton size="xs" variant="ghost" onClick={() => props.onClose()}>
              <X size={15} />
            </IconButton>
          </div>

          {/* Barra de busca */}
          <div class="px-3 py-2 border-b border-zinc-800 shrink-0">
            <div class="relative">
              <Search size={13} class="absolute left-2.5 top-2 text-zinc-500" />
              <input
                type="text"
                placeholder="Buscar nós..."
                value={buscaTipoNode()}
                onInput={(e) => setBuscaTipoNode(e.currentTarget.value)}
                class="w-full bg-zinc-950 border border-zinc-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          {/* Abas de categoria */}
          <div class="flex gap-1 p-2 border-b border-zinc-800 overflow-x-auto shrink-0 scrollbar-none">
            {[
              { id: "todos", label: "Todos" },
              { id: "gatilhos", label: "Gatilhos" },
              { id: "agentes", label: "Agentes" },
              { id: "logica", label: "Lógica" },
              { id: "integracoes", label: "Integrações" },
              { id: "governanca", label: "Governança" },
            ].map((cat) => (
              <button
                type="button"
                onClick={() => setCategoriaNodeFiltro(cat.id)}
                class={`px-2 py-1 rounded text-[10px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
                  categoriaNodeFiltro() === cat.id
                    ? "bg-orange-600/20 text-orange-300 border border-orange-500/40"
                    : "bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Lista de nós */}
          <div class="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
            <For
              each={tiposFiltrados()}
              fallback={<div class="p-6 text-center text-xs text-zinc-500">Nenhum nó encontrado</div>}
            >
              {(item: TipoNodeItem) => {
                const Icone = item.icone;
                return (
                  <div
                    draggable={true}
                    onDragStart={(e) => {
                      e.dataTransfer?.setData("application/opencorp-node-tipo", item.tipo);
                      e.dataTransfer!.effectAllowed = "copy";
                    }}
                    onClick={() => {
                      props.onAdicionarNode(item.tipo);
                      props.onClose();
                    }}
                    class="p-2.5 rounded-lg border border-zinc-800/80 bg-zinc-950/60 hover:bg-zinc-800/70 hover:border-zinc-700 transition-all cursor-grab active:cursor-grabbing flex items-start gap-2.5 group select-none"
                  >
                    <div class={`p-1.5 rounded-lg ${item.bg} ${item.cor} shrink-0 mt-0.5 group-hover:scale-105 transition-transform`}>
                      <Icone size={15} />
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center justify-between gap-1">
                        <span class="text-xs font-semibold text-zinc-200 group-hover:text-white truncate">
                          {item.rotulo}
                        </span>
                        <span class="text-[9px] font-mono text-zinc-500 uppercase px-1 py-0.5 rounded bg-zinc-900 border border-zinc-800 shrink-0">
                          {item.tipo}
                        </span>
                      </div>
                      <p class="text-[10px] text-zinc-400 mt-0.5 line-clamp-2 leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </div>
      </Show>

      {/* ─────────────────────────────────────────────────────────────
          MENU DE CONTEXTO ESTILO N8N (Ao clicar com botão direito)
         ───────────────────────────────────────────────────────────── */}
      <Show when={props.menuContexto().aberto}>
        <div
          class="fixed z-50 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl py-1.5 w-56 text-xs text-zinc-200 select-none animate-in fade-in zoom-in-95 duration-100"
          style={{
            left: `${Math.min(props.menuContexto().x, window.innerWidth - 230)}px`,
            top: `${Math.min(props.menuContexto().y, window.innerHeight - 250)}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <Show
            when={props.menuContexto().noId}
            fallback={
              /* Menu do Canvas Vazio */
              <>
                <button
                  onClick={() => {
                    props.onCloseMenuContexto();
                    props.onAdicionarNode("");
                  }}
                  class="w-full px-3 py-1.5 flex items-center justify-between hover:bg-orange-600 hover:text-white transition-colors text-left cursor-pointer"
                >
                  <span class="flex items-center gap-2">
                    <Plus size={14} /> Adicionar Node
                  </span>
                  <span class="text-[10px] opacity-60 font-mono">N</span>
                </button>
                <div class="my-1 border-t border-zinc-800" />
                <button
                  onClick={() => {
                    props.onCloseMenuContexto();
                    props.onResetView();
                  }}
                  class="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-zinc-800 text-left cursor-pointer"
                >
                  <Maximize2 size={13} /> Resetar Visualização
                </button>
                <button
                  onClick={() => {
                    props.onCloseMenuContexto();
                    props.onCopiarJson();
                  }}
                  class="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-zinc-800 text-left cursor-pointer"
                >
                  <Copy size={13} /> Copiar Workflow JSON
                </button>
              </>
            }
          >
            {/* Menu ao Clicar em um Node */}
            <div class="px-3 py-1 text-[10px] font-mono text-zinc-500 uppercase border-b border-zinc-800 mb-1">
              Node: {props.menuContexto().noId}
            </div>
            <button
              onClick={() => {
                props.onAbrirNdv(props.menuContexto().noId!);
                props.onCloseMenuContexto();
              }}
              class="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-zinc-800 text-left cursor-pointer"
            >
              <Sliders size={13} class="text-orange-400" /> Abrir Parâmetros (NDV)
            </button>
            <button
              onClick={() => {
                props.onDuplicarNode(props.menuContexto().noId!);
                props.onCloseMenuContexto();
              }}
              class="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-zinc-800 text-left cursor-pointer"
            >
              <Copy size={13} /> Duplicar Node
            </button>
            <button
              onClick={() => {
                props.onCloseMenuContexto();
                props.onAdicionarNode("");
              }}
              class="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-zinc-800 text-left cursor-pointer"
            >
              <Plus size={13} /> Conectar Novo Node
            </button>
            <div class="my-1 border-t border-zinc-800" />
            <button
              onClick={() => {
                props.onExcluirNode(props.menuContexto().noId!);
                props.onCloseMenuContexto();
              }}
              class="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-rose-950/80 text-rose-400 text-left cursor-pointer"
            >
              <Trash2 size={13} /> Excluir Node
            </button>
          </Show>
        </div>
      </Show>
    </>
  );
};
