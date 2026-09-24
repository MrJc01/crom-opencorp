import React, { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Calendar, Webhook, Play, Clock } from "lucide-react";
import type { NoGrafo } from "../../types.js";

export interface TriggerNodeData {
  no: NoGrafo;
  ativo?: boolean;
}

export const TriggerNode = memo(({ data, selected }: NodeProps) => {
  const no = (data?.no || {}) as NoGrafo;
  const config = (no.config || {}) as Record<string, any>;
  const tipo = no.tipo || "manual";
  const cronExpressao = config.cron || config.expressao || config.intervalo;

  const Icone =
    tipo === "cron" ? Calendar : tipo === "webhook" ? Webhook : Play;

  const corBadge =
    tipo === "cron"
      ? "text-sky-400 bg-sky-500/10 border-sky-500/30"
      : tipo === "webhook"
      ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
      : "text-zinc-300 bg-zinc-700/20 border-zinc-700/40";

  return (
    <div
      className={`min-w-[220px] max-w-[280px] rounded-xl bg-zinc-950 border transition-all duration-150 shadow-md ${
        selected
          ? "border-sky-500 shadow-sky-500/20 shadow-lg ring-1 ring-sky-500/40"
          : "border-zinc-800 hover:border-zinc-700"
      }`}
    >
      {/* Topo do Card */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-850/80 bg-zinc-900/60 rounded-t-xl">
        <div className="flex items-center gap-2">
          <div className={`p-1 rounded-md border ${corBadge}`}>
            <Icone size={14} />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-sky-400">
              Gatilho • {tipo}
            </span>
            <span className="text-xs font-semibold text-zinc-100 font-mono truncate max-w-[160px]">
              {no.id || "gatilho"}
            </span>
          </div>
        </div>
        <div className="flex items-center">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" title="Gatilho Ativo" />
        </div>
      </div>

      {/* Conteúdo do Card */}
      <div className="p-3 space-y-2">
        {tipo === "cron" && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-zinc-300">
            <Clock size={12} className="text-sky-400 shrink-0" />
            <span className="truncate">{cronExpressao || "Não agendado"}</span>
          </div>
        )}

        {tipo === "webhook" && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-amber-300">
            <span className="text-zinc-500">POST</span>
            <span className="truncate">/api/webhooks/{no.id}</span>
          </div>
        )}

        {tipo === "manual" && (
          <p className="text-[11px] text-zinc-400">
            Disparo manual sob demanda ou via botão Play
          </p>
        )}
      </div>

      {/* Handle de Saída à Direita */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-sky-500 !border-2 !border-zinc-950 hover:!scale-125 transition-transform"
      />
    </div>
  );
});

TriggerNode.displayName = "TriggerNode";
