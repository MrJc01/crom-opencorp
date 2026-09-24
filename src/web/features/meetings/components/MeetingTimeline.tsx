import React, { useState, useRef, useEffect, type FC, type KeyboardEvent } from "react";
import {
  Send,
  Bot,
  User,
  Sparkles,
  Loader2,
  Clock,
  Layers,
  ArrowRight,
} from "lucide-react";
import type { MensagemGrupo } from "../types.js";

export interface MeetingTimelineProps {
  mensagens: MensagemGrupo[];
  participantes: string[];
  enviando: boolean;
  agenteDigitando?: string | null;
  onEnviarMensagem: (
    texto: string,
    modo: "sequencial" | "direcionado",
    agenteAlvo?: string
  ) => Promise<void>;
  salaStatus?: string;
}

export const MeetingTimeline: FC<MeetingTimelineProps> = ({
  mensagens,
  participantes,
  enviando,
  agenteDigitando,
  onEnviarMensagem,
  salaStatus,
}) => {
  const [texto, setTexto] = useState("");
  const [modo, setModo] = useState<"sequencial" | "direcionado">("sequencial");
  const [agenteAlvo, setAgenteAlvo] = useState<string>(participantes[0] || "");
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (participantes.length > 0 && (!agenteAlvo || !participantes.includes(agenteAlvo))) {
      setAgenteAlvo(participantes[0]);
    }
  }, [participantes, agenteAlvo]);

  const scrollToBottom = () => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [mensagens.length, agenteDigitando]);

  const handleEnviar = async () => {
    const limpo = texto.trim();
    if (!limpo || enviando) return;
    setTexto("");
    await onEnviarMensagem(
      limpo,
      modo,
      modo === "direcionado" ? agenteAlvo : undefined
    );
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleEnviar();
    }
  };

  const isEncerrada =
    salaStatus === "encerrada" || salaStatus === "concluida";

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-zinc-950">
      {/* Feed de Mensagens */}
      <div
        ref={feedRef}
        className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 scrollbar-thin select-text"
      >
        {mensagens.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-2 text-zinc-500">
            <div className="h-10 w-10 rounded-2xl bg-purple-950/40 border border-purple-800/30 flex items-center justify-center text-purple-400 mb-1">
              <Bot size={20} />
            </div>
            <h4 className="text-sm font-semibold text-zinc-300">
              A sala de deliberação está aberta
            </h4>
            <p className="text-xs text-zinc-500 max-w-sm">
              Envie uma mensagem ou provocação para iniciar a rodada de deliberação entre os agentes presentes.
            </p>
          </div>
        )}

        {mensagens.map((msg, idx) => {
          const isUser = msg.agente === "usuario" || msg.agente === "user";

          return (
            <div
              key={idx}
              className={`flex items-start gap-3 ${
                isUser ? "flex-row-reverse" : "flex-row"
              }`}
            >
              {/* Avatar */}
              <div
                className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 border ${
                  isUser
                    ? "bg-purple-600 border-purple-500 text-white"
                    : "bg-zinc-900 border-zinc-800 text-purple-400"
                }`}
              >
                {isUser ? <User size={15} /> : <Bot size={15} />}
              </div>

              {/* Balão de Mensagem */}
              <div
                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-3.5 space-y-1 ${
                  isUser
                    ? "bg-purple-950/60 border border-purple-800/50 text-purple-100 rounded-tr-xs"
                    : "bg-zinc-900/80 border border-zinc-850 text-zinc-200 rounded-tl-xs"
                }`}
              >
                <div className="flex items-center justify-between gap-3 text-[11px] pb-1 border-b border-zinc-800/50">
                  <span className="font-bold font-mono">
                    {isUser ? "Você (Operador)" : `@${msg.agente}`}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500">
                    {msg.ts ? new Date(msg.ts).toLocaleTimeString() : ""}
                  </span>
                </div>

                <div className="text-xs leading-relaxed whitespace-pre-wrap">
                  {msg.texto}
                </div>
              </div>
            </div>
          );
        })}

        {/* Indicador de Digitação */}
        {agenteDigitando && (
          <div className="flex items-center gap-2.5 text-xs text-purple-400 italic py-1 animate-in fade-in">
            <div className="h-6 w-6 rounded-lg bg-purple-950/50 border border-purple-800/40 flex items-center justify-center">
              <Loader2 size={12} className="animate-spin" />
            </div>
            <span>
              @{agenteDigitando} deliberando e redigindo resposta...
            </span>
          </div>
        )}
      </div>

      {/* Composer de Mensagens */}
      {!isEncerrada ? (
        <div className="p-3 sm:p-4 border-t border-zinc-850 bg-zinc-900/60 shrink-0 space-y-2">
          {/* Seletor de Modo */}
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setModo("sequencial")}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                  modo === "sequencial"
                    ? "bg-purple-950 border border-purple-700 text-purple-300 font-semibold"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                }`}
              >
                Sequencial (Todos os Agentes)
              </button>
              <button
                type="button"
                onClick={() => setModo("direcionado")}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                  modo === "direcionado"
                    ? "bg-purple-950 border border-purple-700 text-purple-300 font-semibold"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                }`}
              >
                Direcionado para Agente
              </button>
            </div>

            {modo === "direcionado" && participantes.length > 0 && (
              <select
                value={agenteAlvo}
                onChange={(e) => setAgenteAlvo(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-0.5 text-xs font-mono text-purple-300 focus:outline-none focus:border-purple-500 cursor-pointer"
              >
                {participantes.map((ag) => (
                  <option key={ag} value={ag}>
                    @{ag}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Campo de Entrada e Botão Enviar */}
          <div className="flex items-end gap-2">
            <textarea
              rows={2}
              placeholder={
                modo === "direcionado"
                  ? `Pergunte ou envie instrução diretamente para @${agenteAlvo}...`
                  : "Envie uma ponderação para todos os membros da reunião deliberarem..."
              }
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500 resize-none leading-relaxed"
            />

            <button
              type="button"
              disabled={enviando || !texto.trim()}
              onClick={handleEnviar}
              className="p-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white transition-colors cursor-pointer disabled:opacity-40 shrink-0"
              title="Enviar mensagem (Enter)"
            >
              {enviando ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="p-3 text-center text-xs text-zinc-500 bg-zinc-900/40 border-t border-zinc-850">
          Esta reunião foi encerrada. Veja a Ata Executiva acima para conferir as deliberações e tarefas geradas.
        </div>
      )}
    </div>
  );
};
