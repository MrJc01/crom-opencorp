import React, { useState, useMemo, type FC } from "react";
import { Plus, X, Search, Sparkles } from "lucide-react";
import { TIPOS_NODE_CATALOGO } from "../catalog.js";
import type { TipoNodeItem } from "../types.js";

export interface ComponentPaletteProps {
  aberto: boolean;
  onClose: () => void;
  onAdicionarNode: (tipo: string) => void;
}

export const ComponentPalette: FC<ComponentPaletteProps> = ({
  aberto,
  onClose,
  onAdicionarNode,
}) => {
  const [categoria, setCategoria] = useState<string>("todos");
  const [busca, setBusca] = useState("");

  const tiposFiltrados = useMemo(() => {
    const q = busca.toLowerCase().trim();
    return TIPOS_NODE_CATALOGO.filter((t) => {
      const matchCat = categoria === "todos" || t.categoria === categoria;
      const matchQ =
        !q ||
        t.rotulo.toLowerCase().includes(q) ||
        t.tipo.toLowerCase().includes(q) ||
        t.desc.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [busca, categoria]);

  const categorias = [
    { id: "todos", label: "Todos" },
    { id: "gatilhos", label: "Gatilhos" },
    { id: "agentes", label: "Agentes" },
    { id: "logica", label: "Lógica" },
    { id: "integracoes", label: "Integrações" },
    { id: "governanca", label: "Governança" },
  ];

  if (!aberto) return null;

  return (
    <>
      {/* Overlay escuro em telas pequenas */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden"
        onClick={onClose}
      />

      {/* Drawer lateral */}
      <aside className="fixed md:absolute top-0 left-0 bottom-0 w-[320px] max-w-[85vw] z-50 bg-zinc-950/95 backdrop-blur-md border-r border-zinc-800 shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
        {/* Cabeçalho */}
        <div className="p-3.5 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-900/60">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-400">
              <Plus size={16} />
            </div>
            <div>
              <h3 className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
                Catálogo de Nós
                <Sparkles size={12} className="text-orange-400" />
              </h3>
              <p className="text-[10px] text-zinc-400">
                Arraste para o canvas ou clique para inserir
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Fechar Catálogo"
          >
            <X size={16} />
          </button>
        </div>

        {/* Busca */}
        <div className="p-3 border-b border-zinc-850 shrink-0 bg-zinc-900/20">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Buscar nós (cron, agente, script)..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>
        </div>

        {/* Abas de Categorias */}
        <div className="flex gap-1 p-2 border-b border-zinc-850 overflow-x-auto shrink-0 scrollbar-none bg-zinc-950">
          {categorias.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoria(cat.id)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
                categoria === cat.id
                  ? "bg-orange-600 text-white font-bold shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Lista de Nós */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-2 scrollbar-thin">
          {tiposFiltrados.length === 0 ? (
            <div className="p-6 text-center text-xs text-zinc-500">
              Nenhum nó encontrado para o termo pesquisado.
            </div>
          ) : (
            tiposFiltrados.map((item) => {
              const Icone = item.icone;
              return (
                <div
                  key={item.tipo}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/reactflow-type", item.tipo);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={() => onAdicionarNode(item.tipo)}
                  className="group flex items-start gap-3 p-2.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-850/80 border border-zinc-850 hover:border-zinc-700 transition-all duration-150 cursor-grab active:cursor-grabbing hover:shadow-md select-none"
                >
                  <div className={`p-2 rounded-lg border ${item.bg} ${item.borderCor} ${item.cor} shrink-0 mt-0.5 group-hover:scale-105 transition-transform`}>
                    <Icone size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold text-zinc-200 group-hover:text-white transition-colors truncate">
                        {item.rotulo}
                      </span>
                      <span className="text-[9px] font-mono text-zinc-500 uppercase px-1 py-0.2 rounded bg-zinc-950 border border-zinc-800">
                        {item.tipo}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 line-clamp-2 mt-1 leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
};
