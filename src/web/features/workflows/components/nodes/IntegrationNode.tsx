import React, { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Terminal, Globe, Code2, Clock } from "lucide-react";
import type { NoGrafo } from "../../types.js";

export const IntegrationNode = memo(({ data, selected }: NodeProps) => {
  const no = (data?.no || {}) as NoGrafo;
  const config = (no.config || {}) as Record<string, any>;
  const tipo = no.tipo || "script";

  const runtime = config.runtime || config.linguagem || (tipo === "script" ? "python" : tipo === "http_request" ? "http" : "componente");
  const comando = config.comando || config.script || config.url || config.caminho || "execução externa";
  const timeoutMs = config.timeout_ms || config.timeout || 30000;

  const Icone = tipo === "http_request" ? Globe : tipo === "componente" ? Code2 : Terminal;

  return (
    <div
      className={`min-w-[220px] max-w-[280px] rounded-xl bg-zinc-950 border transition-all duration-150 shadow-md ${
        selected
          ? "border-cyan-500 shadow-cyan-500/20 shadow-lg ring-1 ring-cyan-500/40"
          : "border-zinc-800 hover:border-zinc-700"
      }`}
    >
      {/* Handle de Entrada à Esquerda */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-cyan-500 !border-2 !border-zinc-950 hover:!scale-125 transition-transform"
      />

      {/* Topo do Card */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-850/80 bg-zinc-900/60 rounded-t-xl">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1 rounded-md border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 shrink-0">
            <Icone size={14} />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-cyan-400">
              {tipo}
            </span>
            <span className="text-xs font-semibold text-zinc-100 font-mono truncate">
              {no.id}
            </span>
          </div>
        </div>

        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-750 text-cyan-300 font-semibold uppercase shrink-0">
          {runtime}
        </span>
      </div>

      {/* Conteúdo do Card */}
      <div className="p-3 space-y-2">
        <div className="bg-zinc-900/60 border border-zinc-800 rounded p-1.5 font-mono text-[11px] text-zinc-300 truncate" title={String(comando)}>
          {String(comando)}
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
          <span className="flex items-center gap-1">
            <Clock size={10} />
            {timeoutMs}ms
          </span>
          {config.metodo && (
            <span className="px-1 py-0.2 rounded bg-zinc-900 text-zinc-400 font-bold uppercase">
              {config.metodo}
            </span>
          )}
        </div>
      </div>

      {/* Handle de Saída à Direita */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-cyan-500 !border-2 !border-zinc-950 hover:!scale-125 transition-transform"
      />
    </div>
  );
});

IntegrationNode.displayName = "IntegrationNode";
