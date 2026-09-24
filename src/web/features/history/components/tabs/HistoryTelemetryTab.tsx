import React, { useState, type FC } from "react";
import {
  Activity,
  Download,
  Clock,
  DollarSign,
  Cpu,
  Layers,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Code,
} from "lucide-react";
import type { AcaoAgente } from "../../types.js";
import { showToast } from "../../../../shared/ui/Toast.js";

export interface HistoryTelemetryTabProps {
  acoes: AcaoAgente[];
  carregando: boolean;
  duracaoTotalMs?: number | null;
  custoTotalUsd?: number | null;
}

export const HistoryTelemetryTab: FC<HistoryTelemetryTabProps> = ({
  acoes,
  carregando,
  duracaoTotalMs,
  custoTotalUsd,
}) => {
  const [busca, setBusca] = useState("");

  const totalTokensPrompt = acoes.reduce((acc, a) => acc + (a.tokens_prompt || 0), 0);
  const totalTokensSaida = acoes.reduce((acc, a) => acc + (a.tokens_saida || 0), 0);
  const custoCalculado =
    custoTotalUsd ?? acoes.reduce((acc, a) => acc + (a.custo_usd || 0), 0);

  const acoesFiltradas = acoes.filter((a) => {
    if (!busca.trim()) return true;
    const q = busca.toLowerCase();
    return (
      a.ferramenta?.toLowerCase().includes(q) ||
      a.tipo_acao?.toLowerCase().includes(q) ||
      a.comando_resumo?.toLowerCase().includes(q) ||
      a.span_id?.toLowerCase().includes(q)
    );
  });

  const exportarCsv = () => {
    if (acoes.length === 0) return;
    const cabecalho = [
      "span_id",
      "tipo_acao",
      "ferramenta",
      "status",
      "duracao_ms",
      "tokens_prompt",
      "tokens_saida",
      "custo_usd",
      "criado_em",
    ].join(",");
    const linhas = acoes.map((a) =>
      [
        a.span_id,
        a.tipo_acao,
        a.ferramenta || "",
        a.status,
        a.duracao_ms || 0,
        a.tokens_prompt || 0,
        a.tokens_saida || 0,
        (a.custo_usd || 0).toFixed(6),
        a.criado_em,
      ].join(",")
    );
    const blob = new Blob([[cabecalho, ...linhas].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `telemetria-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Relatório CSV exportado com sucesso!", "sucesso");
  };

  const exportarJson = () => {
    const blob = new Blob([JSON.stringify(acoes, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `telemetria-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Relatório JSON exportado com sucesso!", "sucesso");
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-sans scrollbar-thin">
      {/* Resumo Quantitativo dos Spans */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-850 space-y-1">
          <div className="flex items-center gap-1.5 text-zinc-400 font-mono text-[10px]">
            <Layers size={12} className="text-orange-400" />
            <span>TOTAL SPANS</span>
          </div>
          <div className="text-base font-bold text-zinc-100 font-mono">
            {acoes.length}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-850 space-y-1">
          <div className="flex items-center gap-1.5 text-zinc-400 font-mono text-[10px]">
            <Clock size={12} className="text-sky-400" />
            <span>DURAÇÃO TOTAL</span>
          </div>
          <div className="text-base font-bold text-zinc-100 font-mono">
            {duracaoTotalMs ? `${(duracaoTotalMs / 1000).toFixed(2)}s` : "--"}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-850 space-y-1">
          <div className="flex items-center gap-1.5 text-zinc-400 font-mono text-[10px]">
            <Cpu size={12} className="text-emerald-400" />
            <span>TOKENS (IN/OUT)</span>
          </div>
          <div className="text-xs font-bold text-zinc-100 font-mono">
            {totalTokensPrompt} / {totalTokensSaida}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-850 space-y-1">
          <div className="flex items-center gap-1.5 text-zinc-400 font-mono text-[10px]">
            <DollarSign size={12} className="text-emerald-400" />
            <span>CUSTO USD</span>
          </div>
          <div className="text-base font-bold text-emerald-400 font-mono">
            ${custoCalculado.toFixed(5)}
          </div>
        </div>
      </div>

      {/* Barra de Ações: Filtro e Exportação */}
      <div className="flex items-center justify-between gap-2 bg-zinc-900/40 p-2 rounded-xl border border-zinc-850">
        <input
          type="text"
          placeholder="Filtrar spans por ferramenta, tipo..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-orange-500 w-60"
        />

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={exportarCsv}
            disabled={acoes.length === 0}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-[11px] font-medium text-zinc-300 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Download size={12} />
            <span>CSV</span>
          </button>
          <button
            type="button"
            onClick={exportarJson}
            disabled={acoes.length === 0}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-[11px] font-medium text-zinc-300 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Code size={12} />
            <span>JSON</span>
          </button>
        </div>
      </div>

      {/* Tabela de Spans OpenTelemetry */}
      {carregando ? (
        <div className="p-8 text-center text-xs text-zinc-500">
          Carregando spans de telemetria...
        </div>
      ) : acoesFiltradas.length === 0 ? (
        <div className="p-8 text-center text-xs text-zinc-500 bg-zinc-900/20 rounded-xl border border-zinc-850 border-dashed">
          Nenhum span registrado nesta execução.
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-850 overflow-hidden bg-zinc-950">
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-[11px]">
              <thead className="bg-zinc-900/80 text-zinc-400 border-b border-zinc-850">
                <tr>
                  <th className="p-2.5">Span ID</th>
                  <th className="p-2.5">Tipo / Tool</th>
                  <th className="p-2.5">Status</th>
                  <th className="p-2.5">Duração</th>
                  <th className="p-2.5">Tokens</th>
                  <th className="p-2.5">Custo USD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-850/60 text-zinc-300">
                {acoesFiltradas.map((acao) => {
                  const isOk = acao.status === "sucesso";
                  return (
                    <tr key={acao.id || acao.span_id} className="hover:bg-zinc-900/40">
                      <td className="p-2.5 font-bold text-zinc-400">
                        {acao.span_id?.slice(0, 10) || "span"}
                      </td>
                      <td className="p-2.5">
                        <span className="text-orange-400 font-semibold uppercase text-[10px]">
                          {acao.tipo_acao}
                        </span>
                        {acao.ferramenta && (
                          <span className="ml-1 text-zinc-200">
                            • {acao.ferramenta}
                          </span>
                        )}
                        {acao.comando_resumo && (
                          <div className="text-[10px] text-zinc-500 truncate max-w-xs mt-0.5">
                            {acao.comando_resumo}
                          </div>
                        )}
                      </td>
                      <td className="p-2.5">
                        <span
                          className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                            isOk
                              ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800"
                              : "bg-rose-950/60 text-rose-400 border border-rose-800"
                          }`}
                        >
                          {acao.status}
                        </span>
                      </td>
                      <td className="p-2.5 text-zinc-400">
                        {acao.duracao_ms ? `${acao.duracao_ms}ms` : "--"}
                      </td>
                      <td className="p-2.5 text-zinc-400">
                        {acao.tokens_prompt || acao.tokens_saida
                          ? `${acao.tokens_prompt || 0} + ${acao.tokens_saida || 0}`
                          : "--"}
                      </td>
                      <td className="p-2.5 text-emerald-400 font-semibold">
                        {acao.custo_usd ? `$${acao.custo_usd.toFixed(6)}` : "$0.00"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
