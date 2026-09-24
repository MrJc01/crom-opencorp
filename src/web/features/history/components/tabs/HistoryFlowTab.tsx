import React, { type FC } from "react";
import {
  Workflow,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  ExternalLink,
  Bot,
  Terminal,
} from "lucide-react";
import type { FilhaHistorico } from "../../types.js";

export interface HistoryFlowTabProps {
  filhas?: FilhaHistorico[];
  flowId?: string;
  onSelecionarExecucao?: (execId: string) => void;
}

export const HistoryFlowTab: FC<HistoryFlowTabProps> = ({
  filhas = [],
  flowId,
  onSelecionarExecucao,
}) => {
  if (filhas.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-500">
        <Workflow size={32} className="text-zinc-600 mb-2" />
        <h4 className="text-sm font-semibold text-zinc-300">
          Nenhum passo de fluxo registrado
        </h4>
        <p className="text-xs text-zinc-500 max-w-sm mt-1">
          Esta execução não é um fluxo orquestrado ou não gerou nós filhos vinculados.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-sans scrollbar-thin">
      <div className="flex items-center justify-between p-3 rounded-xl bg-purple-950/20 border border-purple-800/40">
        <div className="flex items-center gap-2">
          <Workflow size={15} className="text-purple-400" />
          <span className="font-bold text-zinc-200">
            {flowId ? `Trilha do Fluxo: ${flowId}` : "Cadeia de Execução DAG"}
          </span>
        </div>
        <span className="text-[10px] font-mono text-zinc-400">
          {filhas.length} {filhas.length === 1 ? "nó executado" : "nós executados"}
        </span>
      </div>

      {/* Timeline dos Nós Filhos */}
      <div className="space-y-2">
        {filhas.map((f, idx) => {
          const isOk = f.status === "concluido" || f.status === "ok";
          const isFalhou = f.status === "falhou" || f.status === "erro";

          return (
            <div
              key={f.id || idx}
              className="flex items-center justify-between p-3 rounded-xl bg-zinc-900 border border-zinc-850 hover:border-zinc-750 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`p-1.5 rounded-lg border shrink-0 ${
                    isOk
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : isFalhou
                      ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                      : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                  }`}
                >
                  {isOk ? <CheckCircle2 size={14} /> : isFalhou ? <XCircle size={14} /> : <Clock size={14} />}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-zinc-200 truncate">
                      {f.no || f.id}
                    </span>
                    {f.volta !== undefined && (
                      <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-zinc-950 text-zinc-400">
                        volta {f.volta}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 mt-0.5">
                    <Bot size={11} className="text-zinc-500" />
                    <span>@{f.agente || "agente"}</span>
                    {f.quando && (
                      <span className="text-zinc-600 font-mono">
                        • {new Date(f.quando).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Botão de Navegar para a Execução Filha */}
              {onSelecionarExecucao && (
                <button
                  type="button"
                  onClick={() => onSelecionarExecucao(f.id)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-950 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition-colors text-xs font-medium cursor-pointer"
                  title="Inspecionar execução deste nó"
                >
                  <span>Ver Chat</span>
                  <ExternalLink size={12} className="text-orange-400" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
