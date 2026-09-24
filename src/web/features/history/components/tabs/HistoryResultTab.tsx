import React, { type FC } from "react";
import { CheckCircle2, Copy, FileText, Sparkles } from "lucide-react";
import { showToast } from "../../../../shared/ui/Toast.js";

export interface HistoryResultTabProps {
  resultado?: any;
  contextoFinal?: string;
  status?: string;
}

export const HistoryResultTab: FC<HistoryResultTabProps> = ({
  resultado,
  contextoFinal,
  status,
}) => {
  const conteudo =
    contextoFinal ||
    (typeof resultado === "string"
      ? resultado
      : resultado
      ? JSON.stringify(resultado, null, 2)
      : null);

  const copiar = () => {
    if (!conteudo) return;
    navigator.clipboard.writeText(conteudo);
    showToast("Resultado copiado para a área de transferência!", "sucesso");
  };

  if (!conteudo) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-500">
        <FileText size={32} className="text-zinc-600 mb-2" />
        <h4 className="text-sm font-semibold text-zinc-300">
          Nenhum resultado capturado
        </h4>
        <p className="text-xs text-zinc-500 max-w-sm mt-1">
          Esta execução não retornou um payload final ou ainda está em processamento.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-mono scrollbar-thin">
      <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/60 border border-zinc-850">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={14} className="text-emerald-400" />
          <span className="font-bold text-zinc-200">Contexto Final / Resultado</span>
        </div>
        <button
          type="button"
          onClick={copiar}
          className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
        >
          <Copy size={12} />
          <span>Copiar</span>
        </button>
      </div>

      <div className="rounded-xl bg-zinc-950 border border-zinc-850 p-3.5 overflow-x-auto">
        <pre className="text-[11px] text-zinc-300 leading-relaxed whitespace-pre-wrap break-all font-mono">
          {conteudo}
        </pre>
      </div>
    </div>
  );
};
