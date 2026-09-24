import React, { useState, useEffect, useCallback, type FC } from "react";
import { useOpenCorp } from "../../../providers/OpenCorpProvider.js";
import { type SessaoResumo } from "@opencorp/sdk";
import {
  History,
  MessageSquare,
  Clock,
  ChevronRight,
  RefreshCw,
  Search,
  Bot,
  User,
} from "lucide-react";

export const HistoricoView: FC = () => {
  const { client, tratarErro } = useOpenCorp();
  const [sessoes, setSessoes] = useState<SessaoResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [sessaoAtivaId, setSessaoAtivaId] = useState<string | null>(null);
  const [mensagensSessao, setMensagensSessao] = useState<any[]>([]);
  const [carregandoMensagens, setCarregandoMensagens] = useState(false);

  const carregarSessoes = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await client.secretary.getSessoes();
      const lista = Array.isArray(res) ? res : (res as any)?.sessoes || [];
      setSessoes(lista);
      if (lista.length > 0 && !sessaoAtivaId) {
        setSessaoAtivaId(lista[0].id);
      }
    } catch (err) {
      tratarErro(err, "Falha ao consultar histórico de sessões");
    } finally {
      setCarregando(false);
    }
  }, [client, sessaoAtivaId, tratarErro]);

  useEffect(() => {
    void carregarSessoes();
  }, [carregarSessoes]);

  const carregarHistoricoSessao = useCallback(
    async (id: string) => {
      setSessaoAtivaId(id);
      setCarregandoMensagens(true);
      try {
        const hist = await client.secretary.getHistorico(id);
        setMensagensSessao(hist?.messages || []);
      } catch (err) {
        tratarErro(err, "Falha ao carregar mensagens da sessão");
      } finally {
        setCarregandoMensagens(false);
      }
    },
    [client, tratarErro],
  );

  useEffect(() => {
    if (sessaoAtivaId) {
      void carregarHistoricoSessao(sessaoAtivaId);
    }
  }, [sessaoAtivaId, carregarHistoricoSessao]);

  const sessoesFiltradas = sessoes.filter(
    (s) =>
      s.id.toLowerCase().includes(busca.toLowerCase()) ||
      (s.title && s.title.toLowerCase().includes(busca.toLowerCase())),
  );

  return (
    <div className="flex flex-col lg:flex-row h-full w-full bg-zinc-950 overflow-hidden select-text">
      {/* Coluna Lateral: Lista de Sessões */}
      <aside className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-zinc-850 p-4 space-y-4 flex-shrink-0 bg-zinc-950/80 flex flex-col h-full overflow-hidden">
        <div>
          <h2 className="text-xs font-bold text-zinc-100 flex items-center gap-1.5 uppercase tracking-wider">
            <History size={14} className="text-emerald-400" />
            Histórico Forense de Sessões
          </h2>
          <p className="text-[11px] text-zinc-500 mt-0.5">Sessões de conversa e auditoria</p>
        </div>

        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por ID ou título..."
            className="w-full pl-8 pr-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {carregando ? (
            <div className="p-4 text-center text-xs text-zinc-500">Carregando...</div>
          ) : sessoesFiltradas.length === 0 ? (
            <div className="p-6 text-center text-xs text-zinc-600">Nenhuma sessão registrada.</div>
          ) : (
            sessoesFiltradas.map((s) => {
              const ativa = s.id === sessaoAtivaId;

              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => carregarHistoricoSessao(s.id)}
                  className={`w-full flex flex-col p-2.5 rounded-xl text-left text-xs transition-colors cursor-pointer space-y-1 ${
                    ativa
                      ? "bg-emerald-950/40 text-emerald-200 border border-emerald-800/40"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-semibold truncate">{s.title || "Sessão do Secretário"}</span>
                    <ChevronRight size={13} className="opacity-40" />
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500 truncate block">ID: {s.id}</span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Conteúdo Principal: Mensagens da Sessão Inspecionada */}
      <section className="flex-1 flex flex-col h-full overflow-hidden p-6 lg:p-8 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-850">
          <div>
            <h1 className="text-lg font-bold text-zinc-100">
              {sessaoAtivaId ? `Sessão: ${sessaoAtivaId}` : "Selecione uma sessão"}
            </h1>
            <span className="text-xs text-zinc-400">
              {mensagensSessao.length} turnos registrados nesta execução
            </span>
          </div>

          <button
            type="button"
            onClick={carregarSessoes}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 text-xs text-zinc-300 transition-colors cursor-pointer"
          >
            <RefreshCw size={13} className={carregando ? "animate-spin" : ""} />
            <span>Atualizar</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {carregandoMensagens ? (
            <div className="p-12 text-center text-xs text-zinc-500">
              Carregando mensagens da sessão...
            </div>
          ) : mensagensSessao.length === 0 ? (
            <div className="p-12 text-center text-xs text-zinc-600">
              Nenhuma mensagem encontrada nesta sessão.
            </div>
          ) : (
            mensagensSessao.map((msg, idx) => {
              const isUser = msg.role === "user";

              return (
                <div
                  key={idx}
                  className={`flex ${isUser ? "justify-end" : "justify-start"} my-2`}
                >
                  <div className={`flex items-start gap-3 max-w-[85%] ${isUser ? "flex-row-reverse" : "flex-row"}`}>
                    <div
                      className={`h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 text-white ${
                        isUser ? "bg-zinc-800 text-zinc-300" : "bg-emerald-600"
                      }`}
                    >
                      {isUser ? <User size={14} /> : <Bot size={14} />}
                    </div>

                    <div
                      className={`p-3.5 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                        isUser
                          ? "bg-emerald-950/40 border border-emerald-800/40 text-emerald-100"
                          : "bg-zinc-900/60 border border-zinc-850 text-zinc-200"
                      }`}
                    >
                      {typeof msg.content === "string"
                        ? msg.content
                        : JSON.stringify(msg.content, null, 2)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
};
