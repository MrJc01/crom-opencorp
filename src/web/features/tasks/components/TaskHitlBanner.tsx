import React, { type FC } from "react";
import { type Task } from "@opencorp/sdk";
import { AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react";

export interface TaskHitlBannerProps {
  task: Task;
  aoDesbloquearEAprovar: (task: Task) => Promise<void>;
  aoMoverParaBacklog: (task: Task) => Promise<void>;
  carregando?: boolean;
}

export const TaskHitlBanner: FC<TaskHitlBannerProps> = ({
  task,
  aoDesbloquearEAprovar,
  aoMoverParaBacklog,
  carregando = false,
}) => {
  return (
    <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/60 space-y-2.5">
      <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
        <AlertCircle size={16} className="text-amber-400 shrink-0" />
        <span>Tarefa Bloqueada — Aguardando Desbloqueio (HITL)</span>
      </div>
      <p className="text-[11px] text-zinc-300 leading-relaxed">
        Esta tarefa está pausada aguardando aprovação humana ou resolução de dependência para continuar.
      </p>
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          disabled={carregando}
          onClick={() => aoDesbloquearEAprovar(task)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
        >
          <CheckCircle2 size={13} className="shrink-0" />
          <span>Aprovar & Desbloquear</span>
        </button>
        <button
          type="button"
          disabled={carregando}
          onClick={() => aoMoverParaBacklog(task)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
        >
          <ArrowLeft size={12} className="shrink-0" />
          <span>Mover para Backlog</span>
        </button>
      </div>
    </div>
  );
};
