import React, { type FC } from "react";
import { Search, Bot, Users, Layers, Plus, RefreshCw, Cpu, Sparkles } from "lucide-react";

export interface AgentFiltersProps {
  abaAtiva: "todos" | "agentes" | "equipes";
  aoMudarAba: (aba: "todos" | "agentes" | "equipes") => void;
  busca: string;
  aoMudarBusca: (busca: string) => void;
  totalAgentes: number;
  totalEquipes: number;
  aoNovoAgente: () => void;
  aoNovaEquipe: () => void;
  aoAplicarModeloGlobal: () => void;
  aoSemearCatalogo: () => void;
  aoAtualizar: () => void;
  carregando?: boolean;
}

export const AgentFilters: FC<AgentFiltersProps> = ({
  abaAtiva,
  aoMudarAba,
  busca,
  aoMudarBusca,
  totalAgentes,
  totalEquipes,
  aoNovoAgente,
  aoNovaEquipe,
  aoAplicarModeloGlobal,
  aoSemearCatalogo,
  aoAtualizar,
  carregando = false,
}) => {
  return (
    <div className="space-y-4 pb-4 border-b border-zinc-800">
      {/* Topo: Título e Botões de Ação Global */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight flex items-center gap-2">
            <Bot className="text-emerald-400" size={22} />
            <span>Catálogo de Agentes & Equipes Multi-Agente</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Orquestração autônoma, governança de modelos, especialização de papéis e equipes.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={aoSemearCatalogo}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-xs text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            title="Restaurar agentes de catálogo padrão do OpenCorp"
          >
            <Sparkles size={13} className="text-amber-400" />
            <span>Semear Catálogo</span>
          </button>

          <button
            type="button"
            onClick={aoAplicarModeloGlobal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-xs text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            title="Aplicar modelo padrão a todos os agentes"
          >
            <Cpu size={13} className="text-cyan-400" />
            <span>Modelo Global</span>
          </button>

          <button
            type="button"
            onClick={aoAtualizar}
            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            title="Atualizar catálogo"
          >
            <RefreshCw size={14} className={carregando ? "animate-spin text-emerald-400" : ""} />
          </button>

          <button
            type="button"
            onClick={aoNovaEquipe}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
          >
            <Users size={13} />
            <span>Nova Equipe</span>
          </button>

          <button
            type="button"
            onClick={aoNovoAgente}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
          >
            <Plus size={14} />
            <span>Novo Agente</span>
          </button>
        </div>
      </div>

      {/* Barra de Filtro e Abas */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Abas: Todos / Agentes / Equipes */}
        <div className="flex rounded-xl bg-zinc-900/80 p-1 border border-zinc-800 self-start">
          <button
            type="button"
            onClick={() => aoMudarAba("todos")}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              abaAtiva === "todos"
                ? "bg-zinc-800 text-zinc-100 shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Layers size={13} />
            <span>Todos</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-zinc-950 text-zinc-400">
              {totalAgentes + totalEquipes}
            </span>
          </button>

          <button
            type="button"
            onClick={() => aoMudarAba("agentes")}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              abaAtiva === "agentes"
                ? "bg-zinc-800 text-zinc-100 shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Bot size={13} />
            <span>Agentes</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-zinc-950 text-zinc-400">
              {totalAgentes}
            </span>
          </button>

          <button
            type="button"
            onClick={() => aoMudarAba("equipes")}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              abaAtiva === "equipes"
                ? "bg-zinc-800 text-zinc-100 shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Users size={13} />
            <span>Equipes</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-zinc-950 text-zinc-400">
              {totalEquipes}
            </span>
          </button>
        </div>

        {/* Busca textual */}
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Buscar por nome, papel ou skill..."
            value={busca}
            onChange={(e) => aoMudarBusca(e.target.value)}
            className="w-full sm:w-64 pl-8 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
          />
        </div>
      </div>
    </div>
  );
};
