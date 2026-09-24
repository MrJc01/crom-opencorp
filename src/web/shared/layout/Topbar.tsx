import React, { type FC } from "react";
import { useOpenCorp } from "../../providers/OpenCorpProvider.js";
import { Bot, Folder, Sparkles, Terminal } from "lucide-react";

export interface TopbarProps {
  aoAlternarSecretario?: () => void;
  secretarioAberto?: boolean;
}

export const Topbar: FC<TopbarProps> = ({
  aoAlternarSecretario,
  secretarioAberto = false,
}) => {
  const { workspaceId } = useOpenCorp();

  return (
    <header className="h-14 bg-zinc-950 border-b border-zinc-850 px-4 md:px-6 flex items-center justify-between z-20 select-none">
      {/* Lado Esquerdo: Identificação do Workspace Ativo */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 font-mono">
          <Folder size={13} className="text-emerald-400" />
          <span className="font-semibold text-zinc-200">{workspaceId || "principal"}</span>
        </div>

        <span className="hidden sm:inline-block text-xs text-zinc-600">|</span>
        <span className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-400">
          <Terminal size={12} className="text-zinc-500" />
          <span>Sessão Operacional OpenCorp</span>
        </span>
      </div>

      {/* Lado Direito: Botão / Badge do Secretário & Atalho Ctrl+J */}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={aoAlternarSecretario}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs transition-all cursor-pointer ${
            secretarioAberto
              ? "bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-950/60"
              : "bg-emerald-950/40 border-emerald-800/50 text-emerald-300 hover:bg-emerald-900/50 hover:border-emerald-700"
          }`}
          title="Abrir/Fechar Secretário Executivo (Ctrl+J)"
        >
          <Bot size={14} className={secretarioAberto ? "text-white" : "text-emerald-400"} />
          <span className="font-semibold hidden sm:inline">Secretário Executivo</span>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        </button>

        <kbd
          onClick={aoAlternarSecretario}
          className="hidden lg:flex items-center gap-1 text-[10px] font-mono text-zinc-400 bg-zinc-900 hover:bg-zinc-800 hover:text-zinc-200 px-2 py-1 rounded border border-zinc-800 cursor-pointer transition-colors"
          title="Atalho de teclado: Ctrl+J ou Cmd+J"
        >
          <span>Ctrl+J</span>
        </kbd>
      </div>
    </header>
  );
};
