import React, { useState, useEffect, useCallback, type FC } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
  MessageSquare,
  Bot,
  User,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  Brain,
  Wrench,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useOpenCorp } from "../../../providers/OpenCorpProvider.js";

export interface HistoryConversationDrawerProps {
  aberto: boolean;
  sessaoId: string | null;
  aoFechar: () => void;
}

export interface ConversaMensagemItem {
  id?: string;
  role: "user" | "assistant" | "system" | string;
  content: string;
  pensamento?: string;
  criado_em?: string;
  concluida?: boolean;
  acoes?: Array<{ ferramenta?: string; resumo?: string; sucesso?: boolean }>;
}

function formatarDataHora(dataIso?: string | null): string {
  if (!dataIso) return "";
  try {
    const d = new Date(dataIso);
    if (isNaN(d.getTime())) return dataIso;
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dataIso;
  }
}

export const HistoryConversationDrawer: FC<HistoryConversationDrawerProps> = ({
  aberto,
  sessaoId,
  aoFechar,
}) => {
  const navigate = useNavigate();
  const { client, workspaceId, tratarErro } = useOpenCorp();

  const [mensagens, setMensagens] = useState<ConversaMensagemItem[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pensamentoExpandido, setPensamentoExpandido] = useState<Record<number, boolean>>({});

  const wsEfetivo = workspaceId || undefined;

  const togglePensamento = (index: number) => {
    setPensamentoExpandido((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const carregarMensagens = useCallback(async (id: string) => {
    setCarregando(true);
    setErro(null);
    try {
      const cleanId = id.replace(/^(conv-|conversa-|sessao-)/, "");
      const headers = wsEfetivo ? { "x-opencorp-workspace": wsEfetivo } : undefined;

      // 1. Tentar GET /secretario/sessoes/:id/mensagens
      let lista: ConversaMensagemItem[] = [];
      try {
        const res = await client.http.get<ConversaMensagemItem[]>(
          `/secretario/sessoes/${encodeURIComponent(cleanId)}/mensagens`,
          { headers }
        );
        if (Array.isArray(res)) {
          lista = res;
        }
      } catch {
        // Fallback: tentar com id bruto
        try {
          const resBruto = await client.http.get<ConversaMensagemItem[]>(
            `/secretario/sessoes/${encodeURIComponent(id)}/mensagens`,
            { headers }
          );
          if (Array.isArray(resBruto)) {
            lista = resBruto;
          }
        } catch {}
      }

      // 2. Se vazio, tentar buscar detalhe da sessão em /secretario/sessoes/:id
      if (lista.length === 0) {
        try {
          const sessao = await client.http.get<any>(
            `/secretario/sessoes/${encodeURIComponent(cleanId)}`,
            { headers }
          );
          if (sessao && Array.isArray(sessao.mensagens)) {
            lista = sessao.mensagens;
          }
        } catch {}
      }

      setMensagens(lista);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha ao carregar histórico da conversa";
      setErro(msg);
      tratarErro(err, "Falha ao consultar conversa do secretário");
    } finally {
      setCarregando(false);
    }
  }, [client, wsEfetivo, tratarErro]);

  useEffect(() => {
    if (aberto && sessaoId) {
      void carregarMensagens(sessaoId);
    } else {
      setMensagens([]);
      setErro(null);
      setPensamentoExpandido({});
    }
  }, [aberto, sessaoId, carregarMensagens]);

  if (!aberto || !sessaoId) return null;

  const cleanId = sessaoId.replace(/^(conv-|conversa-|sessao-)/, "");

  return (
    <>
      {/* Overlay Escuro com Desfoque */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 transition-opacity"
        onClick={aoFechar}
      />

      {/* Gaveta Lateral Direita Deslizante */}
      <aside className="fixed inset-y-0 right-0 w-full sm:w-[560px] md:w-[600px] max-w-full z-50 bg-zinc-950/95 backdrop-blur-md border-l border-zinc-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200 select-none">
        {/* Cabeçalho */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-900/60">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-emerald-950/60 border border-emerald-800/50 text-emerald-400 shrink-0">
              <MessageSquare size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono text-zinc-400 font-bold truncate">
                  {sessaoId}
                </span>
                <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase border bg-emerald-950/60 text-emerald-400 border-emerald-800">
                  Secretário
                </span>
              </div>
              <h2 className="text-sm font-bold text-zinc-100 truncate mt-0.5">
                Histórico de Conversa
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void carregarMensagens(sessaoId)}
              disabled={carregando}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850 transition-colors cursor-pointer disabled:opacity-50"
              title="Atualizar mensagens"
            >
              <RefreshCw size={14} className={carregando ? "animate-spin text-emerald-400" : ""} />
            </button>
            <button
              type="button"
              onClick={aoFechar}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850 transition-colors cursor-pointer"
              title="Fechar (ESC)"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Corpo com Lista de Mensagens */}
        <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-5 space-y-4 scrollbar-thin select-text">
          {carregando && mensagens.length === 0 ? (
            <div className="py-20 text-center text-xs text-zinc-400 space-y-2 select-none">
              <RefreshCw size={22} className="animate-spin text-emerald-400 mx-auto" />
              <p>Carregando histórico de mensagens da conversa...</p>
            </div>
          ) : erro ? (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-200 text-xs flex items-center justify-between gap-3 select-none">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-rose-400 shrink-0" />
                <span>{erro}</span>
              </div>
              <button
                type="button"
                onClick={() => void carregarMensagens(sessaoId)}
                className="px-2.5 py-1 rounded-lg bg-rose-900/60 hover:bg-rose-800 text-rose-100 text-xs font-medium cursor-pointer"
              >
                Tentar novamente
              </button>
            </div>
          ) : mensagens.length === 0 ? (
            <div className="py-20 text-center text-xs text-zinc-500 space-y-2 select-none">
              <MessageSquare size={24} className="text-zinc-600 mx-auto" />
              <p>Nenhuma mensagem registrada nesta conversa.</p>
              <p className="text-[11px] text-zinc-600">
                A sessão pode ter sido concluída ou reinicializada no motor.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {mensagens.map((msg, index) => {
                const isUser = msg.role === "user";
                const isSystem = msg.role === "system";

                if (isSystem) {
                  return (
                    <div
                      key={msg.id || index}
                      className="text-center my-2 text-[10px] font-mono text-zinc-500 px-4 py-1.5 rounded-lg bg-zinc-900/40 border border-zinc-850"
                    >
                      {msg.content}
                    </div>
                  );
                }

                return (
                  <div
                    key={msg.id || index}
                    className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                  >
                    {/* Identificação de quem fala */}
                    <div
                      className={`flex items-center gap-1.5 text-[10px] font-mono mb-1 select-none ${
                        isUser ? "text-zinc-400 mr-1" : "text-emerald-400 ml-1"
                      }`}
                    >
                      {isUser ? (
                        <>
                          <span>Você</span>
                          <User size={11} className="text-zinc-400" />
                        </>
                      ) : (
                        <>
                          <Bot size={11} className="text-emerald-400" />
                          <span>Secretário Executivo</span>
                        </>
                      )}
                      {msg.criado_em && (
                        <span className="text-zinc-600 font-normal">
                          · {formatarDataHora(msg.criado_em)}
                        </span>
                      )}
                    </div>

                    {/* Balão de Mensagem */}
                    <div
                      className={`max-w-[88%] sm:max-w-[82%] p-3.5 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                        isUser
                          ? "bg-zinc-800/90 border border-zinc-700/60 text-zinc-100 rounded-tr-xs"
                          : "bg-zinc-900/80 border border-zinc-800 text-zinc-200 rounded-tl-xs shadow-xs"
                      }`}
                    >
                      {/* Pensamento / Raciocínio (se houver) */}
                      {msg.pensamento && (
                        <div className="mb-2.5 rounded-xl bg-black/40 border border-purple-900/40 overflow-hidden select-none">
                          <button
                            type="button"
                            onClick={() => togglePensamento(index)}
                            className="w-full px-2.5 py-1.5 flex items-center justify-between text-[10px] font-mono text-purple-300 hover:bg-purple-950/20 transition-colors cursor-pointer"
                          >
                            <span className="flex items-center gap-1.5">
                              <Brain size={12} className="text-purple-400" />
                              <span>Raciocínio Analítico</span>
                            </span>
                            {pensamentoExpandido[index] ? (
                              <ChevronDown size={12} />
                            ) : (
                              <ChevronRight size={12} />
                            )}
                          </button>
                          {pensamentoExpandido[index] && (
                            <div className="p-2.5 text-[11px] text-zinc-400 font-mono border-t border-purple-900/30 whitespace-pre-wrap select-text">
                              {msg.pensamento}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Ações de Ferramentas (se houver) */}
                      {msg.acoes && msg.acoes.length > 0 && (
                        <div className="mb-2.5 flex flex-wrap gap-1.5 select-none">
                          {msg.acoes.map((ac, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-950/60 border border-zinc-700/60 text-zinc-300"
                            >
                              <Wrench size={10} className="text-amber-400" />
                              <span>{ac.ferramenta || "ação"}</span>
                              {ac.sucesso !== false && (
                                <CheckCircle2 size={10} className="text-emerald-400" />
                              )}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Conteúdo da Mensagem */}
                      <p className="font-sans leading-relaxed">{msg.content}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Rodapé da Gaveta */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between gap-3 shrink-0 select-none">
          <button
            type="button"
            onClick={() => {
              aoFechar();
              navigate(`/secretario?sessao=${encodeURIComponent(cleanId)}`);
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold transition-colors cursor-pointer shadow-xs"
            title="Continuar esta conversa na tela do Secretário"
          >
            <MessageSquare size={13} />
            <span>Continuar no Secretário</span>
            <ExternalLink size={11} className="opacity-80" />
          </button>

          <button
            type="button"
            onClick={aoFechar}
            className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </aside>
    </>
  );
};
