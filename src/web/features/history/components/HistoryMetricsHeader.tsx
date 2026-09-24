import React, { type FC } from "react";
import {
  Activity,
  AlertTriangle,
  DollarSign,
  Bot,
  Wrench,
  TrendingUp,
  Clock,
} from "lucide-react";
import type { ResumoTelemetria } from "../types.js";

export interface HistoryMetricsHeaderProps {
  resumo: ResumoTelemetria | null;
  totalItens: number;
}

export const HistoryMetricsHeader: FC<HistoryMetricsHeaderProps> = ({
  resumo,
  totalItens,
}) => {
  const totalAcoes = resumo?.total_acoes || totalItens || 0;
  const totalFalhas = resumo?.total_falhas || 0;
  const taxaErro = totalAcoes > 0 ? ((totalFalhas / totalAcoes) * 100).toFixed(1) : "0.0";
  const custoUsd = resumo?.custo_usd_total || 0;

  const topAgente = resumo?.agentes?.[0];
  const topFerramenta = resumo?.ferramentas?.[0];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {/* Total de Ações */}
      <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-850 shadow-xs space-y-1">
        <div className="flex items-center justify-between text-zinc-400 font-mono text-[10px]">
          <span className="uppercase font-semibold">Total de Registros</span>
          <Activity size={13} className="text-orange-400" />
        </div>
        <div className="text-lg font-bold text-zinc-100 font-mono">
          {totalAcoes}
        </div>
        <div className="text-[10px] text-zinc-500 font-mono">
          {totalItens} eventos listados
        </div>
      </div>

      {/* Taxa de Falha */}
      <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-850 shadow-xs space-y-1">
        <div className="flex items-center justify-between text-zinc-400 font-mono text-[10px]">
          <span className="uppercase font-semibold">Taxa de Erros</span>
          <AlertTriangle size={13} className={totalFalhas > 0 ? "text-rose-400" : "text-emerald-400"} />
        </div>
        <div className={`text-lg font-bold font-mono ${totalFalhas > 0 ? "text-rose-400" : "text-emerald-400"}`}>
          {taxaErro}%
        </div>
        <div className="text-[10px] text-zinc-500 font-mono">
          {totalFalhas} falhas registradas
        </div>
      </div>

      {/* Custo Total USD */}
      <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-850 shadow-xs space-y-1">
        <div className="flex items-center justify-between text-zinc-400 font-mono text-[10px]">
          <span className="uppercase font-semibold">Custo Financeiro</span>
          <DollarSign size={13} className="text-emerald-400" />
        </div>
        <div className="text-lg font-bold text-emerald-400 font-mono">
          ${custoUsd.toFixed(4)}
        </div>
        <div className="text-[10px] text-zinc-500 font-mono">
          investimento LLM estimado
        </div>
      </div>

      {/* Top Agente Mais Ativo */}
      <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-850 shadow-xs space-y-1">
        <div className="flex items-center justify-between text-zinc-400 font-mono text-[10px]">
          <span className="uppercase font-semibold">Top Agente</span>
          <Bot size={13} className="text-sky-400" />
        </div>
        <div className="text-xs font-bold text-zinc-100 font-mono truncate">
          {topAgente ? `@${topAgente.agente}` : "—"}
        </div>
        <div className="text-[10px] text-zinc-500 font-mono truncate">
          {topAgente ? `${topAgente.total} execuções` : "sem dados"}
        </div>
      </div>

      {/* Top Ferramenta */}
      <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-850 shadow-xs space-y-1 col-span-2 sm:col-span-1">
        <div className="flex items-center justify-between text-zinc-400 font-mono text-[10px]">
          <span className="uppercase font-semibold">Top Ferramenta</span>
          <Wrench size={13} className="text-purple-400" />
        </div>
        <div className="text-xs font-bold text-zinc-100 font-mono truncate">
          {topFerramenta ? topFerramenta.ferramenta : "—"}
        </div>
        <div className="text-[10px] text-zinc-500 font-mono truncate">
          {topFerramenta ? `${topFerramenta.media_ms || 0}ms média` : "sem dados"}
        </div>
      </div>
    </div>
  );
};
