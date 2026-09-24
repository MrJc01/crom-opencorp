/** @jsxImportSource react */
import React, { type FC } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, Maximize2, X, Sparkles } from "lucide-react";
import { SecretarioChat } from "./SecretarioChat.js";

export interface SecretarioDockProps {
  aberto: boolean;
  aoFechar: () => void;
}

export const SecretarioDock: FC<SecretarioDockProps> = ({ aberto, aoFechar }) => {
  const navigate = useNavigate();

  if (!aberto) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex flex-col w-full sm:w-[480px] lg:w-[540px] bg-zinc-950 border-l border-zinc-800 shadow-2xl animate-in slide-in-from-right duration-200">
      {/* Header do Dock */}
      <div className="flex items-center justify-between h-14 px-4 bg-zinc-900/80 border-b border-zinc-800 shrink-0 backdrop-blur-xs">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-md shadow-emerald-950/60 shrink-0">
            <Bot size={17} />
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs text-zinc-100">Secretário Executivo</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-950 border border-emerald-800/60 text-emerald-400 font-bold">
                Ctrl+J
              </span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">Assistente Operacional Residente</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Botão Tela Cheia */}
          <button
            type="button"
            onClick={() => {
              aoFechar();
              navigate("/secretario");
            }}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Expandir para tela cheia (/secretario)"
          >
            <Maximize2 size={15} />
          </button>

          {/* Botão Fechar */}
          <button
            type="button"
            onClick={aoFechar}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Fechar (Esc ou Ctrl+J)"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Conteúdo: Chat do Secretário */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        <SecretarioChat />
      </div>
    </div>
  );
};
