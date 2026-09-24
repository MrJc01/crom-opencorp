import React, { type FC } from "react";
import { Link } from "react-router-dom";
import { Bot, Layers, ArrowRight, Construction } from "lucide-react";

export interface ModulePlaceholderProps {
  modulo: string;
  descricao?: string;
  icone?: React.ComponentType<{ size?: number; className?: string }>;
}

export const ModulePlaceholder: FC<ModulePlaceholderProps> = ({
  modulo,
  descricao = "Módulo operacional do OpenCorp preparado para o Passo 4 da migração.",
  icone: Icone = Layers,
}) => {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[480px] p-8 text-center select-none">
      <div className="max-w-md w-full p-8 rounded-2xl bg-zinc-900/40 border border-zinc-850 shadow-2xl space-y-6">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-emerald-400 shadow-md">
          <Icone size={28} />
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950/50 border border-emerald-800/40 text-[11px] font-mono text-emerald-300">
            <Construction size={11} />
            <span>Trampolim Strangler Fig · Passo 4</span>
          </div>

          <h2 className="text-xl font-bold text-zinc-100">{modulo}</h2>
          <p className="text-xs text-zinc-400 leading-relaxed">{descricao}</p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/secretario"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-950/60 transition-all cursor-pointer"
          >
            <Bot size={14} />
            <span>Falar com o Secretário</span>
            <ArrowRight size={13} />
          </Link>

          <Link
            to="/docs"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
          >
            <span>Ver Documentação</span>
          </Link>
        </div>
      </div>
    </div>
  );
};
