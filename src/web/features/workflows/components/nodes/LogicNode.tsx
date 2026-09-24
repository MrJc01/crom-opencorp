import React, { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GitBranch, Workflow, RefreshCw, Clock, HelpCircle } from "lucide-react";
import type { NoGrafo } from "../../types.js";

export const LogicNode = memo(({ data, selected }: NodeProps) => {
  const no = (data?.no || {}) as NoGrafo;
  const config = (no.config || {}) as Record<string, any>;
  const tipo = no.tipo || "condicao";

  const isBifurcado = tipo === "condicao" || tipo === "decisao";
  const condicaoExpr =
    config.expressao ||
    config.condicao ||
    config.regra ||
    (tipo === "delay" ? `${config.segundos || config.ms || 30}s delay` : tipo === "subflow" ? `Sub-fluxo: ${config.flow || config.fluxo_id || "modular"}` : "critério booleano");

  const Icone =
    tipo === "subflow"
      ? Workflow
      : tipo === "loop"
      ? RefreshCw
      : tipo === "delay"
      ? Clock
      : tipo === "decisao"
      ? HelpCircle
      : GitBranch;

  return (
    <div
      className={`min-w-[220px] max-w-[280px] rounded-xl bg-zinc-950 border transition-all duration-150 shadow-md relative ${
        selected
          ? "border-amber-500 shadow-amber-500/20 shadow-lg ring-1 ring-amber-500/40"
          : "border-zinc-800 hover:border-zinc-700"
      }`}
    >
      {/* Handle de Entrada à Esquerda */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-amber-500 !border-2 !border-zinc-950 hover:!scale-125 transition-transform"
      />

      {/* Topo do Card */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-850/80 bg-zinc-900/60 rounded-t-xl">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-400">
            <Icone size={14} />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-amber-400">
              Lógica • {tipo}
            </span>
            <span className="text-xs font-semibold text-zinc-100 font-mono truncate max-w-[150px]">
              {no.id}
            </span>
          </div>
        </div>
      </div>

      {/* Conteúdo do Card */}
      <div className="p-3 space-y-2">
        <div className="bg-zinc-900/60 border border-zinc-800 rounded p-1.5 font-mono text-[11px] text-zinc-300 break-all">
          {condicaoExpr}
        </div>

        {isBifurcado && (
          <div className="flex flex-col gap-1.5 pt-1 text-[10px] font-mono font-semibold">
            <div className="flex items-center justify-end text-emerald-400 pr-2">
              <span>então (true) ➔</span>
            </div>
            <div className="flex items-center justify-end text-rose-400 pr-2">
              <span>senão (false) ➔</span>
            </div>
          </div>
        )}
      </div>

      {/* Handles de Saída à Direita */}
      {isBifurcado ? (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="entao"
            style={{ top: "42%" }}
            className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-zinc-950 hover:!scale-125 transition-transform"
          />
          <Handle
            type="source"
            position={Position.Right}
            id="senao"
            style={{ top: "78%" }}
            className="!w-3 !h-3 !bg-rose-500 !border-2 !border-zinc-950 hover:!scale-125 transition-transform"
          />
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-amber-500 !border-2 !border-zinc-950 hover:!scale-125 transition-transform"
        />
      )}
    </div>
  );
});

LogicNode.displayName = "LogicNode";
