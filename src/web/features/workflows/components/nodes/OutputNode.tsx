import React, { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CheckCircle2, FileCheck, Layers, FileText, Users } from "lucide-react";
import type { NoGrafo } from "../../types.js";

export const OutputNode = memo(({ data, selected }: NodeProps) => {
  const no = (data?.no || {}) as NoGrafo;
  const config = (no.config || {}) as Record<string, any>;
  const tipo = no.tipo || "saida";

  const Icone =
    tipo === "task_create"
      ? Layers
      : tipo === "registro"
      ? FileText
      : tipo === "reuniao"
      ? Users
      : FileCheck;

  const subtitulo =
    tipo === "task_create"
      ? `Kanban: ${config.coluna || "backlog"}`
      : tipo === "registro"
      ? `Registry: ${config.colecao || "relatorios"}`
      : tipo === "reuniao"
      ? `Pauta: ${config.pauta || "deliberacao"}`
      : "Retorno de Contexto";

  const descricao =
    config.titulo ||
    config.mensagem ||
    config.formato ||
    (tipo === "saida" ? "Finalização do pipeline DAG com sucesso" : "Ação de governança registrada");

  return (
    <div
      className={`min-w-[220px] max-w-[280px] rounded-xl bg-zinc-950 border transition-all duration-150 shadow-md ${
        selected
          ? "border-emerald-500 shadow-emerald-500/20 shadow-lg ring-1 ring-emerald-500/40"
          : "border-zinc-800 hover:border-zinc-700"
      }`}
    >
      {/* Handle de Entrada à Esquerda (Sem saída posterior) */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-zinc-950 hover:!scale-125 transition-transform"
      />

      {/* Topo do Card */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-850/80 bg-zinc-900/60 rounded-t-xl">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shrink-0">
            <Icone size={14} />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-emerald-400">
              {tipo}
            </span>
            <span className="text-xs font-semibold text-zinc-100 font-mono truncate">
              {no.id}
            </span>
          </div>
        </div>

        <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
      </div>

      {/* Conteúdo do Card */}
      <div className="p-3 space-y-1.5 text-xs">
        <div className="font-mono text-[11px] text-zinc-300 font-semibold truncate">
          {subtitulo}
        </div>
        <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
          {String(descricao)}
        </p>
      </div>
    </div>
  );
});

OutputNode.displayName = "OutputNode";
