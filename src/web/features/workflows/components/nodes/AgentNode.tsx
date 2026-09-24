import React, { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Bot, Cpu, Users, ShieldCheck, MessageSquare } from "lucide-react";
import type { NoGrafo } from "../../types.js";

export const AgentNode = memo(({ data, selected }: NodeProps) => {
  const no = (data?.no || {}) as NoGrafo;
  const config = (no.config || {}) as Record<string, any>;
  const tipo = no.tipo || "agente";

  // Identificação do agente / time
  const agenteNome =
    config.agente ||
    config.agent ||
    config.autor ||
    (tipo === "fanout" ? "Equipe Fan-Out" : tipo === "review" ? "Equipe Review" : tipo === "debate" ? "Equipe Debate" : `@${no.id}`);
  const modelo = config.modelo || config.model || "nemotron-3-super-120b";
  const ordem = config.ordem || config.prompt || config.instrucao || config.objetivo || "";
  const join = no.join;

  const isTeam = tipo === "fanout" || tipo === "review" || tipo === "debate";
  const TeamIcon = tipo === "review" ? ShieldCheck : tipo === "debate" ? MessageSquare : Users;

  return (
    <div
      className={`min-w-[240px] max-w-[300px] rounded-xl bg-zinc-950 border transition-all duration-150 shadow-md ${
        selected
          ? "border-emerald-500 shadow-emerald-500/20 shadow-lg ring-1 ring-emerald-500/40"
          : "border-zinc-800 hover:border-zinc-700"
      }`}
    >
      {/* Handle de Entrada à Esquerda */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-zinc-950 hover:!scale-125 transition-transform"
      />

      {/* Topo do Card */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-850/80 bg-zinc-900/60 rounded-t-xl">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`p-1.5 rounded-lg border shrink-0 ${
              isTeam
                ? "bg-violet-500/10 border-violet-500/30 text-violet-400"
                : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
            }`}
          >
            {isTeam ? <TeamIcon size={14} /> : <Bot size={14} />}
          </div>
          <div className="flex flex-col min-w-0">
            <span
              className={`text-[10px] uppercase font-mono font-bold tracking-wider truncate ${
                isTeam ? "text-violet-400" : "text-emerald-400"
              }`}
            >
              {isTeam ? `Time • ${tipo}` : "Agente IA"}
            </span>
            <span className="text-xs font-semibold text-zinc-100 font-mono truncate">
              {no.id}
            </span>
          </div>
        </div>

        {join && (
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-750 text-zinc-400 font-medium">
            join:{join}
          </span>
        )}
      </div>

      {/* Conteúdo do Card */}
      <div className="p-3 space-y-2 text-xs">
        {/* Agente e Modelo */}
        <div className="flex items-center justify-between gap-1">
          <span className="font-mono text-[11px] font-bold text-zinc-200 truncate">
            {agenteNome.startsWith("@") ? agenteNome : `@${agenteNome}`}
          </span>
          <span className="flex items-center gap-1 font-mono text-[10px] text-zinc-400 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-850 truncate max-w-[120px]">
            <Cpu size={10} className="text-emerald-400 shrink-0" />
            <span className="truncate">{modelo}</span>
          </span>
        </div>

        {/* Resumo da Ordem / Prompt */}
        {ordem ? (
          <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed bg-zinc-900/40 p-1.5 rounded border border-zinc-850/50 italic">
            "{ordem}"
          </p>
        ) : (
          <p className="text-[11px] text-zinc-500 italic">
            Sem ordem configurada
          </p>
        )}
      </div>

      {/* Handle de Saída à Direita */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-zinc-950 hover:!scale-125 transition-transform"
      />
    </div>
  );
});

AgentNode.displayName = "AgentNode";
