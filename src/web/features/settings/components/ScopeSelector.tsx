import React, { type FC } from "react";
import { Layers, Bot } from "lucide-react";

export interface ScopeSelectorProps {
  escopo: "global" | "workspace";
  onMudarEscopo: (escopo: "global" | "workspace") => void;
  workspaceId: string;
}

export const ScopeSelector: FC<ScopeSelectorProps> = ({
  escopo,
  onMudarEscopo,
  workspaceId,
}) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center bg-zinc-950 p-1 rounded-xl border border-zinc-800 w-full sm:w-auto shadow-inner">
        <button
          type="button"
          onClick={() => onMudarEscopo("global")}
          className={`flex-1 sm:flex-initial justify-center px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
            escopo === "global"
              ? "bg-cyan-600 text-white shadow-xs"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
          }`}
        >
          <Layers size={13} className="shrink-0" />
          <span>Global (Sistema)</span>
        </button>

        <button
          type="button"
          onClick={() => onMudarEscopo("workspace")}
          className={`flex-1 sm:flex-initial justify-center px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
            escopo === "workspace"
              ? "bg-purple-600 text-white shadow-xs"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
          }`}
        >
          <Bot size={13} className="shrink-0" />
          <span className="truncate max-w-[160px]">
            Workspace: {workspaceId || "Ativo"}
          </span>
        </button>
      </div>

      {/* Indicador visual de escopo ativo */}
      <div className="flex items-center gap-2 text-[11px]">
        {escopo === "global" ? (
          <div className="flex items-center gap-2 text-cyan-400">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0 animate-pulse" />
            <span className="font-semibold">Escopo Global:</span>
            <span className="text-zinc-400 truncate">
              Configurações padrão herdadas por todas as empresas e workspaces.
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-purple-400">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0 animate-pulse" />
            <span className="font-semibold">Escopo Workspace:</span>
            <span className="text-zinc-400 truncate">
              Sobrescreve as regras globais exclusivamente para "{workspaceId}".
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
