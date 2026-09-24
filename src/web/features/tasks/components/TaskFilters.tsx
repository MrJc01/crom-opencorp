import React, { type FC } from "react";
import { type AgentResumo } from "@opencorp/sdk";
import { Search, Filter, RefreshCw, Plus, Kanban } from "lucide-react";

export interface TaskFiltersProps {
  busca: string;
  aoMudarBusca: (busca: string) => void;
  responsavel: string;
  aoMudarResponsavel: (resp: string) => void;
  agentes: AgentResumo[];
  aoNovaTarefa: () => void;
  aoAtualizar: () => void;
  carregando?: boolean;
}

export const TaskFilters: FC<TaskFiltersProps> = ({
  busca,
  aoMudarBusca,
  responsavel,
  aoMudarResponsavel,
  agentes,
  aoNovaTarefa,
  aoAtualizar,
  carregando = false,
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
      <div>
        <h1 className="text-xl font-bold text-zinc-100 tracking-tight flex items-center gap-2">
          <Kanban className="text-emerald-400" size={20} />
          <span>Quadro Kanban</span>
        </h1>
        <p className="text-xs text-zinc-400 mt-0.5">
          Gerencie tarefas, atribua agentes autônomos e acompanhe entregas em tempo real.
        </p>
      </div>

      <div className="flex items-center gap-2.5 flex-wrap">
        {/* Input de Busca */}
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Buscar tarefas..."
            value={busca}
            onChange={(e) => aoMudarBusca(e.target.value)}
            className="w-44 sm:w-48 pl-8 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
          />
        </div>

        {/* Dropdown de Filtro por Responsável */}
        <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-1 text-xs">
          <Filter size={13} className="text-zinc-400 shrink-0" />
          <select
            value={responsavel}
            onChange={(e) => aoMudarResponsavel(e.target.value)}
            className="bg-transparent text-xs text-zinc-300 focus:outline-none cursor-pointer"
          >
            <option value="todos" className="bg-zinc-900">
              Todos os responsáveis
            </option>
            {agentes.map((ag) => (
              <option key={ag.id} value={ag.id} className="bg-zinc-900">
                @{ag.id}
              </option>
            ))}
          </select>
        </div>

        {/* Botão Atualizar */}
        <button
          type="button"
          onClick={aoAtualizar}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-xs text-zinc-300 transition-colors cursor-pointer"
          title="Atualizar Kanban"
        >
          <RefreshCw size={13} className={carregando ? "animate-spin text-emerald-400" : ""} />
          <span>Atualizar</span>
        </button>

        {/* Botão Nova Tarefa */}
        <button
          type="button"
          onClick={aoNovaTarefa}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
        >
          <Plus size={14} />
          <span>Nova Tarefa</span>
        </button>
      </div>
    </div>
  );
};
