import React, { type FC } from "react";
import { Terminal, Copy, Download } from "lucide-react";
import { showToast } from "../../../../shared/ui/Toast.js";

export interface HistoryTerminalTabProps {
  log: string;
  execId: string;
}

export const HistoryTerminalTab: FC<HistoryTerminalTabProps> = ({
  log,
  execId,
}) => {
  const copiarLog = () => {
    navigator.clipboard.writeText(log);
    showToast("Log completo copiado para a área de transferência!", "sucesso");
  };

  const baixarLog = () => {
    const blob = new Blob([log], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${execId || "execucao"}.log`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Arquivo ${execId || "execucao"}.log baixado!`, "sucesso");
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-black text-xs font-mono select-text">
      {/* Barra Superior do Terminal */}
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-950 border-b border-zinc-800 text-zinc-400 shrink-0">
        <div className="flex items-center gap-2">
          <Terminal size={13} className="text-emerald-400" />
          <span className="font-semibold text-zinc-300">Terminal Raw Console</span>
          <span className="text-[10px] text-zinc-600">
            {log ? `${log.split("\n").length} linhas` : "0 linhas"}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={copiarLog}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-850 text-zinc-300 hover:text-white border border-zinc-800 transition-colors cursor-pointer text-[11px]"
            title="Copiar log completo"
          >
            <Copy size={12} />
            <span>Copiar</span>
          </button>
          <button
            type="button"
            onClick={baixarLog}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-850 text-zinc-300 hover:text-white border border-zinc-800 transition-colors cursor-pointer text-[11px]"
            title="Baixar arquivo .log"
          >
            <Download size={12} />
            <span>Baixar .log</span>
          </button>
        </div>
      </div>

      {/* Conteúdo do Log */}
      <div className="flex-1 p-3.5 overflow-y-auto scrollbar-thin">
        {log ? (
          <pre className="text-[11px] text-zinc-300 leading-relaxed font-mono whitespace-pre-wrap break-all">
            {log}
          </pre>
        ) : (
          <div className="p-8 text-center text-zinc-600">
            Nenhum dado de log capturado para esta execução.
          </div>
        )}
      </div>
    </div>
  );
};
