import React, { type FC } from "react";
import { type Task } from "@opencorp/sdk";
import { Play, Trash2, Calendar, Lock, Bot, User } from "lucide-react";

export interface TaskCardProps {
  task: Task;
  selecionada: boolean;
  aoSelecionar: (task: Task) => void;
  aoMover: (task: Task, novaColuna: string) => Promise<void>;
  aoExcluir: (id: string) => Promise<void>;
  aoExecutar: (task: Task) => Promise<void>;
  executando?: boolean;
}

export const TaskCard: FC<TaskCardProps> = ({
  task,
  selecionada,
  aoSelecionar,
  aoExcluir,
  aoExecutar,
  executando = false,
}) => {
  const isBloqueada = task.coluna === "bloqueado" || task.bloqueada === true;

  const getPrioridadeClasses = (p?: string) => {
    switch (p?.toLowerCase()) {
      case "critica":
        return "bg-purple-950/80 text-purple-300 border-purple-800/80";
      case "alta":
        return "bg-rose-950/80 text-rose-300 border-rose-800/80";
      case "baixa":
        return "bg-zinc-800/80 text-zinc-400 border-zinc-700/60";
      case "media":
      default:
        return "bg-amber-950/80 text-amber-300 border-amber-800/80";
    }
  };

  const formatarDataDue = (due?: string | null) => {
    if (!due) return null;
    const d = new Date(due);
    if (Number.isNaN(d.getTime())) return due;
    return d.toLocaleDateString("pt-BR", { month: "short", day: "numeric" });
  };

  const semPrefixoAgente = (r?: string | null) =>
    String(r || "").replace(/^@/, "").replace(/^agente:/, "");

  return (
    <div
      draggable={!executando}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => aoSelecionar(task)}
      className={`group p-3 rounded-xl border cursor-grab active:cursor-grabbing transition-all shadow-xs flex flex-col gap-2 relative ${
        selecionada
          ? "bg-zinc-850/90 border-emerald-500/80 ring-1 ring-emerald-500/40"
          : isBloqueada
          ? "bg-zinc-900/90 border-amber-800/50 hover:border-amber-600/70"
          : "bg-zinc-900/90 border-zinc-800/90 hover:border-zinc-700"
      }`}
    >
      {/* Topo do Card: Título e Badge de Prioridade */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {isBloqueada && (
            <span title="Aguardando desbloqueio HITL" className="flex items-center">
              <Lock size={12} className="text-amber-400 shrink-0" />
            </span>
          )}
          <span className="text-xs font-semibold text-zinc-100 leading-snug line-clamp-2">
            {task.titulo || task.id}
          </span>
        </div>

        {task.prioridade && (
          <span
            className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 font-mono ${getPrioridadeClasses(
              task.prioridade,
            )}`}
          >
            {task.prioridade}
          </span>
        )}
      </div>

      {/* Descrição curta */}
      {task.descricao && (
        <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
          {task.descricao}
        </p>
      )}

      {/* Metadados do Card: Responsável, Data e Ações */}
      <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60 text-[10px] text-zinc-500">
        <div className="flex items-center gap-1.5 min-w-0">
          {task.responsavel ? (
            <span
              className="text-emerald-400 font-mono font-medium truncate max-w-[120px] flex items-center gap-1"
              title={task.responsavel}
            >
              <Bot size={11} className="shrink-0 text-emerald-500" />
              @{semPrefixoAgente(task.responsavel)}
            </span>
          ) : (
            <span className="text-zinc-600 flex items-center gap-1">
              <User size={11} className="shrink-0" />
              Sem agente
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {task.due && (
            <span
              className="flex items-center gap-1 font-mono text-zinc-400"
              title={String(task.due)}
            >
              <Calendar size={10} className="shrink-0" />
              {formatarDataDue(task.due)}
            </span>
          )}

          {/* Botão de Executar com Agente */}
          <button
            type="button"
            disabled={executando}
            onClick={(e) => {
              e.stopPropagation();
              void aoExecutar(task);
            }}
            className="p-1 rounded bg-zinc-800 hover:bg-emerald-600 hover:text-white text-zinc-400 transition-colors cursor-pointer disabled:opacity-50"
            title="Executar tarefa com agente autônomo"
          >
            <Play size={10} className="fill-current" />
          </button>

          {/* Botão de Excluir */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`Tem certeza que deseja excluir a tarefa "${task.titulo || task.id}"?`)) {
                void aoExcluir(task.id);
              }
            }}
            className="p-1 rounded bg-zinc-800/80 hover:bg-rose-950 hover:text-rose-400 text-zinc-500 transition-colors cursor-pointer border border-transparent hover:border-rose-800/60"
            title="Excluir tarefa"
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>
    </div>
  );
};
