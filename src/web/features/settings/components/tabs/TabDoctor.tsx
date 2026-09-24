import React, { useState, useEffect, useCallback, type FC } from "react";
import {
  Activity,
  RefreshCw,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Stethoscope,
} from "lucide-react";
import { showToast } from "../../../../shared/ui/Toast.js";
import { useOpenCorp } from "../../../../providers/OpenCorpProvider.js";
import type { DoctorCheck, DoctorReport } from "../../types.js";

export const TabDoctor: FC = () => {
  const { client, tratarErro } = useOpenCorp();
  const [report, setReport] = useState<DoctorReport | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [reparando, setReparando] = useState(false);

  const carregarDoctor = useCallback(async () => {
    setCarregando(true);
    try {
      const data = await client.http.get<DoctorReport>("/doctor");
      setReport(data);
    } catch (err: unknown) {
      tratarErro(err, "Falha ao executar autodiagnóstico Doctor SRE");
    } finally {
      setCarregando(false);
    }
  }, [client, tratarErro]);

  const executarReparo = async () => {
    setReparando(true);
    try {
      const res = await client.http.post<{ ok?: boolean; mensagem?: string }>("/doctor/fix", {});
      showToast(res?.mensagem || "Rotina de auto-reparo e remediação concluída!", "sucesso");
      await carregarDoctor();
    } catch (err: unknown) {
      tratarErro(err, "Erro durante auto-reparo SRE");
    } finally {
      setReparando(false);
    }
  };

  useEffect(() => {
    void carregarDoctor();
  }, [carregarDoctor]);

  return (
    <div className="space-y-6 bg-transparent">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-800 gap-3">
        <div>
          <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
            <Stethoscope size={16} className="text-emerald-400" />
            Autodiagnóstico do Sistema (Doctor SRE)
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Inspeção automática de integridade do SQLite WAL, daemon de supervisão, API e portas de rede.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={reparando}
            onClick={executarReparo}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 border border-orange-500/40 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
            title="Tentar remediação e autocura automática"
          >
            {reparando ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Wrench size={13} />
            )}
            <span>Auto-Reparar (Fix)</span>
          </button>

          <button
            type="button"
            disabled={carregando}
            onClick={carregarDoctor}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-850 text-zinc-300 border border-zinc-800 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={13} className={carregando ? "animate-spin" : ""} />
            <span>Diagnosticar</span>
          </button>
        </div>
      </div>

      {report && (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-850 text-xs">
            <div className="flex items-center gap-2.5">
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  report.ok ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" : "bg-rose-400 animate-pulse shadow-[0_0_8px_rgba(251,113,133,0.5)]"
                }`}
              />
              <span className="font-bold text-zinc-100">
                {report.ok
                  ? "Sistema Operando Normalmente (Todos os Subsistemas Verdes)"
                  : "Problemas ou Inconsistências Detectados no Ambiente"}
              </span>
            </div>
            <span className="text-zinc-500 font-mono text-[11px]">
              {report.timestamp}
            </span>
          </div>

          <div className="divide-y divide-zinc-850/60 border border-zinc-850 rounded-xl bg-zinc-900/30 overflow-hidden">
            {(report.checks || []).map((chk: DoctorCheck) => (
              <div
                key={chk.id}
                className="p-3.5 flex items-start justify-between gap-3 text-xs hover:bg-zinc-900/50 transition-colors"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {chk.status === "ok" && (
                      <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                    )}
                    {chk.status === "aviso" && (
                      <AlertTriangle size={15} className="text-amber-400 shrink-0" />
                    )}
                    {chk.status === "erro" && (
                      <XCircle size={15} className="text-rose-400 shrink-0" />
                    )}
                    <span className="font-semibold text-zinc-100">{chk.nome}</span>
                    <span className="text-[10px] font-mono text-zinc-500">[{chk.id}]</span>
                  </div>
                  <p className="text-zinc-400 text-[11px] leading-relaxed pl-6">
                    {chk.mensagem}
                  </p>
                  {chk.reparo && (
                    <p className="text-orange-400/90 text-[10px] font-mono pl-6">
                      💡 Sugestão SRE: {chk.reparo}
                    </p>
                  )}
                </div>

                <span
                  className={`text-[9px] font-mono uppercase px-2 py-0.5 rounded border shrink-0 font-bold ${
                    chk.status === "ok"
                      ? "text-emerald-400 bg-emerald-950/40 border-emerald-800/40"
                      : chk.status === "aviso"
                      ? "text-amber-400 bg-amber-950/40 border-amber-800/40"
                      : "text-rose-400 bg-rose-950/40 border-rose-800/40"
                  }`}
                >
                  {chk.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!report && !carregando && (
        <div className="py-12 text-center text-xs text-zinc-500 border border-dashed border-zinc-850 rounded-xl">
          Nenhum relatório de diagnóstico carregado. Clique em "Diagnosticar" para iniciar a varredura SRE.
        </div>
      )}
    </div>
  );
};
