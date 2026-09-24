import React, { type FC } from "react";
import { useOpenCorp } from "../../providers/OpenCorpProvider.js";
import { Bot, Folder, Sparkles, Terminal } from "lucide-react";

export const Topbar: FC = () => {
  const { workspaceId } = useOpenCorp();

  return (
    <header className="h-14 bg-zinc-950 border-b border-zinc-850 px-4 md:px-6 flex items-center justify-between z-20 select-none">
      {/* Lado Esquerdo: Identificação do Workspace Ativo */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 font-mono">
          <Folder size={13} className="text-emerald-400" />
          <span className="font-semibold text-zinc-200">{workspaceId}</span>
        </div>

        <span className="hidden sm:inline-block text-xs text-zinc-600">|</span>
        <span className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-400">
          <Terminal size={12} className="text-zinc-500" />
          <span>Sessão Operacional Governa</span>
        </span>
      </div>

      {/* Lado Direito: Badge do Secretário & Ações Rápidas */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/40 border border-emerald-800/40 text-emerald-300 text-xs">
          <Bot size={13} className="text-emerald-400" />
          <span className="font-medium hidden sm:inline">Secretário Online</span>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
        </div>

        <div className="hidden lg:flex items-center gap-1 text-[11px] font-mono text-zinc-500 bg-zinc-900/60 px-2 py-0.5 rounded border border-zinc-850">
          <span>Ctrl+J</span>
        </div>
      </div>
    </header>
  );
};
