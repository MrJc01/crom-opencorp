import React, { useState, type FC } from "react";
import { type AgentResumo, type TeamSpec } from "@opencorp/sdk";
import { X, Play, Bot, Users, Loader2, Sparkles, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

export type AlvoExecucao =
  | { tipo: "agente"; item: AgentResumo }
  | { tipo: "equipe"; item: TeamSpec };

export interface AgentRunModalProps {
  aberto: boolean;
  alvo: AlvoExecucao | null;
  aoFechar: () => void;
  aoDisparar: (alvo: AlvoExecucao, ordem: string) => Promise<{ exec_id?: string } | void>;
}

export const AgentRunModal: FC<AgentRunModalProps> = ({
  aberto,
  alvo,
  aoFechar,
  aoDisparar,
}) => {
  const navigate = useNavigate();
  const [ordem, setOrdem] = useState("");
  const [disparando, setDisparando] = useState(false);
  const [execIdResultado, setExecIdResultado] = useState<string | null>(null);

  if (!aberto || !alvo) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ordem.trim()) return;

    setDisparando(true);
    setExecIdResultado(null);

    try {
      const res = await aoDisparar(alvo, ordem.trim());
      if (res && res.exec_id) {
        setExecIdResultado(res.exec_id);
      } else {
        setOrdem("");
        aoFechar();
      }
    } finally {
      setDisparando(false);
    }
  };

  const isAgente = alvo.tipo === "agente";
  const nomeAlvo = isAgente
    ? (alvo.item as AgentResumo).nome || (alvo.item as AgentResumo).name || (alvo.item as AgentResumo).id
    : (alvo.item as TeamSpec).titulo || (alvo.item as TeamSpec).id;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={aoFechar}
    >
      <div
        className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header do Modal */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div
              className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                isAgente
                  ? "bg-emerald-950/60 border border-emerald-800/40 text-emerald-400"
                  : "bg-purple-950/60 border border-purple-800/40 text-purple-400"
              }`}
            >
              {isAgente ? <Bot size={16} /> : <Users size={16} />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-1.5">
                <span>Disparar Execução:</span>
                <span className="font-mono text-emerald-400 font-semibold">{nomeAlvo}</span>
              </h2>
              <span className="text-[10px] text-zinc-500 font-mono">
                {isAgente ? `@${(alvo.item as AgentResumo).id}` : `Team: ${(alvo.item as TeamSpec).id}`}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={aoFechar}
            className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Sucesso com Exec ID */}
        {execIdResultado ? (
          <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/50 space-y-3">
            <div className="flex items-center gap-2 text-emerald-300 font-semibold text-xs">
              <Sparkles size={16} className="text-emerald-400" />
              <span>Execução iniciada com sucesso!</span>
            </div>
            <p className="text-xs text-zinc-300">
              ID da Execução: <span className="font-mono text-emerald-400 font-bold">{execIdResultado}</span>
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-emerald-900/40">
              <button
                type="button"
                onClick={() => {
                  aoFechar();
                  setExecIdResultado(null);
                  setOrdem("");
                }}
                className="px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs"
              >
                Concluir
              </button>
              <button
                type="button"
                onClick={() => {
                  aoFechar();
                  navigate(`/historico?run=${encodeURIComponent(execIdResultado)}`);
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md"
              >
                <span>Acompanhar no Histórico</span>
                <ArrowRight size={13} />
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            <div>
              <label className="block text-zinc-300 font-medium mb-1.5">
                Ordem / Instrução de Execução *
              </label>
              <textarea
                rows={4}
                required
                value={ordem}
                onChange={(e) => setOrdem(e.target.value)}
                placeholder={
                  isAgente
                    ? "Descreva detalhadamente a missão ou tarefa para este agente resolver..."
                    : "Instrução inicial para a equipe executar segundo o padrão definido..."
                }
                className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-500 text-xs leading-relaxed focus:outline-none focus:border-emerald-500 resize-none"
              />
            </div>

            <div className="pt-2 border-t border-zinc-800 flex justify-end gap-2">
              <button
                type="button"
                disabled={disparando}
                onClick={aoFechar}
                className="px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={disparando || !ordem.trim()}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl font-semibold shadow-md transition-all cursor-pointer disabled:opacity-50 ${
                  isAgente
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                    : "bg-purple-600 hover:bg-purple-500 text-white"
                }`}
              >
                {disparando ? <Loader2 size={13} className="animate-spin" /> : <Play size={12} className="fill-current" />}
                <span>Disparar Ordem</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
