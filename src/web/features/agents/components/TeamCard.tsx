import React, { type FC } from "react";
import { type TeamSpec } from "@opencorp/sdk";
import {
  Users,
  Play,
  Layers,
  Cpu,
  Shield,
  MessageSquare,
  Trash2,
  Sliders,
  ArrowRight,
} from "lucide-react";

export interface TeamCardProps {
  team: TeamSpec;
  aoEditar: (team: TeamSpec) => void;
  aoDisparar: (team: TeamSpec) => void;
  aoExcluir: (id: string) => Promise<void>;
  carregandoExcluir?: boolean;
}

export const TeamCard: FC<TeamCardProps> = ({
  team,
  aoEditar,
  aoDisparar,
  aoExcluir,
  carregandoExcluir = false,
}) => {
  const getPadraoBadge = () => {
    switch (team.padrao) {
      case "pipeline":
        return {
          label: "Pipeline Sequencial",
          icon: <Layers size={11} className="text-blue-400" />,
          classes: "bg-blue-950/60 border-blue-800 text-blue-300",
        };
      case "fanout":
        return {
          label: "Fan-out Paralelo",
          icon: <Cpu size={11} className="text-purple-400" />,
          classes: "bg-purple-950/60 border-purple-800 text-purple-300",
        };
      case "review":
        return {
          label: "Autor & Revisor",
          icon: <Shield size={11} className="text-amber-400" />,
          classes: "bg-amber-950/60 border-amber-800 text-amber-300",
        };
      case "debate":
        return {
          label: "Debate Colegiado",
          icon: <MessageSquare size={11} className="text-emerald-400" />,
          classes: "bg-emerald-950/60 border-emerald-800 text-emerald-300",
        };
    }
  };

  const badge = getPadraoBadge();

  // Lista os agentes participantes para exibição
  const obterAgentesParticipantes = (): string[] => {
    const list: string[] = [];
    if (team.padrao === "pipeline" && team.passos) {
      team.passos.forEach((p) => p.agente && list.push(p.agente));
    } else if (team.padrao === "fanout") {
      team.paralelos?.forEach((p) => p.agente && list.push(p.agente));
      if (team.sintese?.agente) list.push(team.sintese.agente);
    } else if (team.padrao === "review") {
      if (team.executor?.agente) list.push(team.executor.agente);
      if (team.revisor?.agente) list.push(team.revisor.agente);
    } else if (team.padrao === "debate") {
      team.proponentes?.forEach((p) => p.agente && list.push(p.agente));
      if (team.moderador?.agente) list.push(team.moderador.agente);
    }
    return [...new Set(list)];
  };

  const participantes = obterAgentesParticipantes();

  return (
    <div
      onClick={() => aoEditar(team)}
      className="p-4 rounded-2xl border border-zinc-800/90 bg-zinc-900/60 hover:bg-zinc-900/90 hover:border-zinc-700 transition-all flex flex-col justify-between cursor-pointer space-y-3.5 group shadow-xs"
    >
      <div>
        {/* Topo: Ícone, Título e Badge de Padrão */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-purple-950/50 border border-purple-800/40 flex items-center justify-center text-purple-400 shrink-0 group-hover:bg-purple-900/60 transition-colors">
              <Users size={18} />
            </div>

            <div className="min-w-0">
              <h3 className="text-xs font-bold text-zinc-100 truncate">
                {team.titulo || team.id}
              </h3>
              <span className="text-[11px] font-mono text-zinc-500 block truncate">
                ID: {team.id}
              </span>
            </div>
          </div>

          <span
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-medium shrink-0 ${badge.classes}`}
          >
            {badge.icon}
            <span>{badge.label}</span>
          </span>
        </div>

        {/* Participantes */}
        <div className="mt-3 space-y-1.5">
          <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider block">
            Membros Participantes ({participantes.length})
          </span>

          <div className="flex flex-wrap gap-1.5">
            {participantes.length === 0 && (
              <span className="text-[11px] text-zinc-600 italic">Nenhum membro configurado</span>
            )}
            {participantes.map((membro) => (
              <span
                key={membro}
                className="px-2 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-emerald-400"
              >
                @{membro}
              </span>
            ))}
          </div>
        </div>

        {/* Resumo de Etapas / Turnos */}
        <div className="mt-2.5 text-[10px] text-zinc-500 font-mono flex items-center gap-2">
          {team.turnos && (
            <span>{team.turnos} turnos de debate</span>
          )}
          {team.max_mensagens_auto_h && (
            <span>· máx {team.max_mensagens_auto_h} msgs</span>
          )}
        </div>
      </div>

      {/* Rodapé: Ações */}
      <div className="flex items-center justify-between pt-3 border-t border-zinc-800/60">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              aoEditar(team);
            }}
            className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <Sliders size={12} />
            <span>Editar</span>
          </button>

          <button
            type="button"
            disabled={carregandoExcluir}
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`Tem certeza que deseja excluir a equipe "${team.titulo || team.id}"?`)) {
                void aoExcluir(team.id);
              }
            }}
            className="p-1 rounded text-zinc-500 hover:text-rose-400 transition-colors"
            title="Excluir equipe"
          >
            <Trash2 size={13} />
          </button>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            aoDisparar(team);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
          title="Disparar orquestração da equipe"
        >
          <Play size={11} className="fill-current" />
          <span>Executar Equipe</span>
        </button>
      </div>
    </div>
  );
};
