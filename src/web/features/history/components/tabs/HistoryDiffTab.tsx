import React, { type FC } from "react";
import { GitCommit, GitBranch, RotateCcw, FileText, CheckCircle2 } from "lucide-react";
import type { ArquivoDiff } from "../../types.js";
import { showToast } from "../../../../shared/ui/Toast.js";

export interface HistoryDiffTabProps {
  diff: string;
  arquivos: ArquivoDiff[];
  commitHash: string | null;
  carregando: boolean;
  onRestaurarArquivo: (caminho: string) => Promise<void>;
}

export const HistoryDiffTab: FC<HistoryDiffTabProps> = ({
  diff,
  arquivos,
  commitHash,
  carregando,
  onRestaurarArquivo,
}) => {
  if (carregando) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-xs text-zinc-500">
        Calculando diff de arquivos do Git para esta execução...
      </div>
    );
  }

  if (!diff && arquivos.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-500">
        <GitCommit size={32} className="text-zinc-600 mb-2" />
        <h4 className="text-sm font-semibold text-zinc-300">
          Nenhuma alteração de arquivos registrada
        </h4>
        <p className="text-xs text-zinc-500 max-w-sm mt-1">
          Esta execução não realizou modificações nos arquivos do repositório ou os arquivos permaneceram inalterados.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-mono scrollbar-thin">
      {/* Metadados do Commit / Arquivos */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/60 border border-zinc-850">
        <div className="flex items-center gap-2">
          <GitBranch size={14} className="text-orange-400" />
          <span className="font-bold text-zinc-200">
            {arquivos.length > 0 ? `${arquivos.length} arquivo(s) modificado(s)` : "Diff Registrado"}
          </span>
        </div>
        {commitHash && (
          <span className="text-[10px] text-zinc-400 px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800">
            commit: {commitHash.slice(0, 8)}
          </span>
        )}
      </div>

      {/* Lista de Arquivos com Botão de Rollback */}
      {arquivos.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
            Arquivos Afetados
          </div>
          <div className="space-y-1">
            {arquivos.map((arq) => (
              <div
                key={arq.caminho}
                className="flex items-center justify-between p-2 rounded-lg bg-zinc-900 border border-zinc-850 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText size={13} className="text-zinc-400 shrink-0" />
                  <span className="text-zinc-200 truncate">{arq.caminho}</span>
                  <div className="flex items-center gap-1 font-mono text-[10px]">
                    {Number(arq.adicionadas) > 0 && (
                      <span className="text-emerald-400">+{arq.adicionadas}</span>
                    )}
                    {Number(arq.removidas) > 0 && (
                      <span className="text-rose-400">-{arq.removidas}</span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Deseja reverter as alterações em "${arq.caminho}"?`)) {
                      void onRestaurarArquivo(arq.caminho);
                    }
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-950 hover:bg-rose-950/40 text-zinc-400 hover:text-rose-300 border border-zinc-800 hover:border-rose-900/60 transition-colors text-[10px] cursor-pointer"
                  title="Reverter arquivo via git checkout"
                >
                  <RotateCcw size={11} />
                  <span>Reverter</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Renderização Formatada do Diff */}
      {diff && (
        <div className="rounded-xl bg-zinc-950 border border-zinc-850 p-3 overflow-x-auto">
          <pre className="text-[11px] leading-relaxed font-mono">
            {diff.split("\n").map((linha, idx) => {
              const isHeader = linha.startsWith("diff --git") || linha.startsWith("index ");
              const isAdded = linha.startsWith("+") && !linha.startsWith("+++");
              const isRemoved = linha.startsWith("-") && !linha.startsWith("---");
              const isHunk = linha.startsWith("@@");

              const cor = isHeader
                ? "text-sky-400 font-bold"
                : isAdded
                ? "text-emerald-400 bg-emerald-950/20"
                : isRemoved
                ? "text-rose-400 bg-rose-950/20"
                : isHunk
                ? "text-amber-400 font-bold"
                : "text-zinc-400";

              return (
                <div key={idx} className={`${cor} px-1 rounded-xs`}>
                  {linha || " "}
                </div>
              );
            })}
          </pre>
        </div>
      )}
    </div>
  );
};
