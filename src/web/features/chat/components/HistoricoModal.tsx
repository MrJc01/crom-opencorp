import React, { useState, useEffect, type FC } from "react";
import { Search, Plus, MessageSquare, Trash2, X } from "lucide-react";

export interface SessaoResumo {
  id: string;
  titulo?: string;
  criado_em?: string | number;
  atualizado_em?: string | number;
  mensagens_count?: number;
  executando?: boolean;
  status?: string;
}

export interface HistoricoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessoes: SessaoResumo[];
  sessaoAtivaId: string | null;
  onSelecionarSessao: (id: string) => void;
  onNovaConversa: () => void;
  onExcluirSessao?: (id: string) => void;
}

export const HistoricoModal: FC<HistoricoModalProps> = ({
  open,
  onOpenChange,
  sessoes,
  sessaoAtivaId,
  onSelecionarSessao,
  onNovaConversa,
  onExcluirSessao,
}) => {
  const [busca, setBusca] = useState("");

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  const termo = busca.toLowerCase().trim();
  const sessoesFiltradas = termo
    ? sessoes.filter((s) => (s.titulo || s.id).toLowerCase().includes(termo))
    : sessoes;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-5 overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between pb-3 border-b border-zinc-800">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              Histórico de Conversas
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Navegue entre sessões anteriores ou inicie um novo chat
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Fechar"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Barra superior com Busca e Botão de Nova Conversa */}
        <div className="flex items-center gap-2 py-3">
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
            />
            <input
              type="text"
              placeholder="Buscar conversas..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              onNovaConversa();
              onOpenChange(false);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium cursor-pointer transition-all active:scale-95 shrink-0"
          >
            <Plus size={14} />
            <span>Nova Conversa</span>
          </button>
        </div>

        {/* Lista de Sessões */}
        <div className="flex-1 overflow-y-auto space-y-1 scrollbar-thin pr-1 min-h-[140px]">
          {sessoesFiltradas.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500">
              Nenhuma conversa encontrada.
            </div>
          ) : (
            sessoesFiltradas.map((s) => {
              const ativa = s.id === sessaoAtivaId;
              return (
                <div
                  key={s.id}
                  className={`group flex items-center justify-between p-2.5 rounded-lg border transition-all cursor-pointer ${
                    ativa
                      ? "bg-zinc-800/80 border-zinc-700 text-zinc-100"
                      : "bg-zinc-950/40 border-zinc-900 text-zinc-300 hover:bg-zinc-800/40 hover:border-zinc-800"
                  }`}
                  onClick={() => {
                    onSelecionarSessao(s.id);
                    onOpenChange(false);
                  }}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <MessageSquare
                      size={15}
                      className={`flex-shrink-0 ${
                        ativa ? "text-emerald-400" : "text-zinc-500"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium truncate">
                        {s.titulo || `Conversa ${s.id.slice(0, 8)}`}
                      </div>
                      <div className="text-[10px] text-zinc-500 flex items-center gap-1.5">
                        {s.executando || s.status === "executando" ? (
                          <>
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-emerald-400 font-semibold">
                              executando agora
                            </span>
                          </>
                        ) : (
                          <span>
                            {s.mensagens_count
                              ? `${s.mensagens_count} mensagens`
                              : "Sessão"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {onExcluirSessao && (
                    <button
                      type="button"
                      className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400 p-1 rounded transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Excluir esta conversa permanentemente?")) {
                          onExcluirSessao(s.id);
                        }
                      }}
                      title="Excluir conversa"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
