import React, { useState, type FC } from "react";
import {
  Brain,
  Terminal,
  FileCode,
  FileEdit,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Bot,
  Sparkles,
  Clock,
  CheckCircle2,
  XCircle,
  Copy,
} from "lucide-react";
import { parseExecutionLog, type LogEvento } from "../../lib/log-parser.js";
import { showToast } from "../../../../shared/ui/Toast.js";

export interface HistoryChatTabProps {
  log: string;
  ordem?: string;
  agente?: string;
  modelo?: string;
  status?: string;
}

export const HistoryChatTab: FC<HistoryChatTabProps> = ({
  log,
  ordem: ordemProp,
  agente: agenteProp,
  modelo: modeloProp,
  status,
}) => {
  const parsed = parseExecutionLog(log);
  const ordem = ordemProp || parsed.ordem;
  const agente = agenteProp || parsed.agente || "agente";
  const modelo = modeloProp || parsed.modelo || "llm";

  const [expandedThinks, setExpandedThinks] = useState<Record<number, boolean>>({});
  const [expandedActions, setExpandedActions] = useState<Record<number, boolean>>({});

  const toggleThink = (idx: number) => {
    setExpandedThinks((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const toggleAction = (idx: number) => {
    setExpandedActions((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  if (!log || parsed.eventosCronologicos.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-500">
        <Bot size={32} className="text-zinc-600 mb-2" />
        <h4 className="text-sm font-semibold text-zinc-300">
          Nenhuma saída registrada
        </h4>
        <p className="text-xs text-zinc-500 max-w-sm mt-1">
          Esta execução não produziu mensagens capturáveis de chat. Verifique a aba Terminal para os logs brutos.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-sans scrollbar-thin">
      {/* Ordem / Prompt Original */}
      {ordem && (
        <div className="p-3 rounded-xl bg-orange-950/20 border border-orange-500/30 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400 font-mono flex items-center gap-1.5">
              <Sparkles size={12} />
              Ordem Operacional
            </span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(ordem);
                showToast("Ordem copiada!", "info");
              }}
              className="text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Copiar ordem"
            >
              <Copy size={12} />
            </button>
          </div>
          <p className="text-xs text-zinc-200 whitespace-pre-wrap leading-relaxed">
            {ordem}
          </p>
        </div>
      )}

      {/* Sequência Cronológica de Eventos */}
      <div className="space-y-3">
        {parsed.eventosCronologicos.map((ev: LogEvento, idx: number) => {
          if (ev.kind === "texto") {
            const isThink =
              ev.conteudo.startsWith("<think>") ||
              ev.conteudo.toLowerCase().includes("raciocínio") ||
              ev.conteudo.toLowerCase().includes("pensando");
            const isOpen = expandedThinks[idx] ?? !isThink;

            return (
              <div
                key={idx}
                className={`rounded-xl border transition-all ${
                  isThink
                    ? "bg-zinc-900/40 border-purple-900/40"
                    : "bg-zinc-900/70 border-zinc-800"
                }`}
              >
                {/* Header de Pensamento / Texto */}
                {isThink && (
                  <button
                    type="button"
                    onClick={() => toggleThink(idx)}
                    className="w-full flex items-center justify-between p-2.5 text-purple-300 font-mono text-[11px] hover:bg-purple-950/20 rounded-t-xl transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5">
                      <Brain size={13} className="text-purple-400" />
                      <span className="font-semibold">Raciocínio Interno (&lt;think&gt;)</span>
                    </div>
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                )}

                {/* Conteúdo */}
                {isOpen && (
                  <div className="p-3 text-zinc-300 whitespace-pre-wrap leading-relaxed font-sans text-xs">
                    {ev.conteudo.replace(/<\/?think>/g, "").trim()}
                  </div>
                )}
              </div>
            );
          }

          // Ação de Ferramenta
          const acao = ev.acao;
          const isAcaoOpen = expandedActions[idx] ?? false;
          const IconeAcao =
            acao.tipo === "bash"
              ? Terminal
              : acao.tipo === "read"
              ? FileCode
              : acao.tipo === "write"
              ? FileEdit
              : ArrowRight;

          return (
            <div
              key={idx}
              className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden shadow-xs"
            >
              <button
                type="button"
                onClick={() => toggleAction(idx)}
                className="w-full flex items-center justify-between p-2.5 bg-zinc-950/80 hover:bg-zinc-850/80 transition-colors text-left cursor-pointer border-b border-zinc-850"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-1 rounded bg-zinc-800 text-orange-400 shrink-0">
                    <IconeAcao size={12} />
                  </div>
                  <span className="font-mono text-[10px] font-bold uppercase text-zinc-400">
                    {acao.tipo}
                  </span>
                  <span className="font-mono text-xs text-zinc-200 truncate">
                    {acao.comando}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 text-zinc-500">
                  {acao.saida && (
                    <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-zinc-900 text-zinc-400">
                      saída
                    </span>
                  )}
                  {isAcaoOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </div>
              </button>

              {/* Saída da Ferramenta */}
              {isAcaoOpen && acao.saida && (
                <div className="p-2.5 bg-zinc-950 font-mono text-[11px] text-zinc-400 overflow-x-auto max-h-48 scrollbar-thin whitespace-pre-wrap leading-relaxed">
                  {acao.saida}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
