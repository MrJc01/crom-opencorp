import React, { useState, useEffect, useCallback, type FC } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  AlertCircle,
  Info,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";
import { showToast } from "../../../shared/ui/Toast.js";
import { useOpenCorp } from "../../../providers/OpenCorpProvider.js";

export interface AcaoNotificacao {
  label: string;
  tipo?: "link" | "api" | "hitl";
  url?: string;
  endpoint?: string;
  metodo?: "GET" | "POST";
  corpo?: Record<string, unknown>;
}

export interface NotificacaoItem {
  id: string;
  titulo: string;
  corpo?: string;
  mensagem?: string;
  tipo?: "resumo" | "aviso" | "erro" | "info" | "sucesso";
  origem?: string;
  lida: boolean;
  criado_em?: string;
  criadaEm?: string;
  acoes?: AcaoNotificacao[];
}

function formatarDataRelativa(dataIso?: string): string {
  if (!dataIso) return "Recente";
  try {
    const d = new Date(dataIso);
    if (isNaN(d.getTime())) return dataIso;
    const agora = Date.now();
    const difSegundos = Math.floor((agora - d.getTime()) / 1000);
    if (difSegundos < 60) return "Agora mesmo";
    if (difSegundos < 3600) return `Há ${Math.floor(difSegundos / 60)} min`;
    if (difSegundos < 86400) return `Há ${Math.floor(difSegundos / 3600)} h`;
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return dataIso;
  }
}

export const NotificacoesView: FC = () => {
  const { client, workspaceId, tratarErro } = useOpenCorp();
  const [notificacoes, setNotificacoes] = useState<NotificacaoItem[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [filtro, setFiltro] = useState<"todas" | "nao_lidas">("todas");
  const [executandoAcao, setExecutandoAcao] = useState<string | null>(null);

  const wsEfetivo = workspaceId || undefined;

  const carregarNotificacoes = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await client.http.get<any>("/notifications", {
        headers: wsEfetivo ? { "x-opencorp-workspace": wsEfetivo } : undefined,
      });

      if (res && Array.isArray(res.notificacoes)) {
        setNotificacoes(res.notificacoes);
      } else if (Array.isArray(res)) {
        setNotificacoes(res);
      } else {
        setNotificacoes([]);
      }
    } catch (err: unknown) {
      tratarErro(err, "Falha ao carregar notificações do servidor");
    } finally {
      setCarregando(false);
    }
  }, [client, wsEfetivo, tratarErro]);

  useEffect(() => {
    void carregarNotificacoes();
  }, [carregarNotificacoes]);

  const marcarLida = async (id: string) => {
    try {
      await client.http.post(
        `/notifications/${encodeURIComponent(id)}/lida`,
        {},
        {
          headers: wsEfetivo ? { "x-opencorp-workspace": wsEfetivo } : undefined,
        }
      );
      setNotificacoes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, lida: true } : n))
      );
      showToast("Notificação marcada como lida", "info");
    } catch (err: unknown) {
      tratarErro(err, "Erro ao marcar notificação como lida");
    }
  };

  const marcarTodasLidas = async () => {
    try {
      await client.http.post(
        "/notifications/lidas",
        {},
        {
          headers: wsEfetivo ? { "x-opencorp-workspace": wsEfetivo } : undefined,
        }
      );
      setNotificacoes((prev) => prev.map((n) => ({ ...n, lida: true })));
      showToast("Todas as notificações foram marcadas como lidas", "sucesso");
    } catch (err: unknown) {
      tratarErro(err, "Erro ao marcar todas as notificações como lidas");
    }
  };

  const limparTodas = async () => {
    if (!window.confirm("Deseja realmente limpar todas as notificações do workspace?")) return;
    try {
      await client.http.delete("/notifications", {
        headers: wsEfetivo ? { "x-opencorp-workspace": wsEfetivo } : undefined,
      });
      setNotificacoes([]);
      showToast("Histórico de notificações limpo com sucesso", "info");
    } catch (err: unknown) {
      tratarErro(err, "Erro ao limpar notificações");
    }
  };

  const dispararAcao = async (notifId: string, acao: AcaoNotificacao) => {
    if (acao.url) {
      window.open(acao.url, "_blank");
      return;
    }
    if (!acao.endpoint) return;

    setExecutandoAcao(`${notifId}:${acao.label}`);
    try {
      const metodo = (acao.metodo || "POST").toUpperCase();
      if (metodo === "POST") {
        await client.http.post(acao.endpoint, acao.corpo || {}, {
          headers: wsEfetivo ? { "x-opencorp-workspace": wsEfetivo } : undefined,
        });
      } else {
        await client.http.get(acao.endpoint, {
          headers: wsEfetivo ? { "x-opencorp-workspace": wsEfetivo } : undefined,
        });
      }
      showToast(`Ação "${acao.label}" executada com sucesso!`, "sucesso");
      void marcarLida(notifId);
    } catch (err: unknown) {
      tratarErro(err, `Falha ao executar ação "${acao.label}"`);
    } finally {
      setExecutandoAcao(null);
    }
  };

  const listaFiltrada = notificacoes.filter((n) => {
    if (filtro === "nao_lidas") return !n.lida;
    return true;
  });

  const totalNaoLidas = notificacoes.filter((n) => !n.lida).length;

  return (
    <div className="flex flex-col h-full w-full p-6 md:p-8 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <Bell className="text-emerald-400" size={20} />
            Central de Alertas & Notificações
            {totalNaoLidas > 0 && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-300">
                {totalNaoLidas} novas
              </span>
            )}
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Registro em tempo real de eventos, avisos de cotas e transições operacionais do sistema.
          </p>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={carregando}
            onClick={carregarNotificacoes}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-850 text-xs text-zinc-300 transition-colors cursor-pointer disabled:opacity-50"
            title="Recarregar notificações"
          >
            <RefreshCw size={13} className={carregando ? "animate-spin text-emerald-400" : ""} />
            <span>Atualizar</span>
          </button>

          <button
            type="button"
            disabled={totalNaoLidas === 0}
            onClick={marcarTodasLidas}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-xs text-zinc-300 transition-colors cursor-pointer disabled:opacity-50"
          >
            <CheckCheck size={14} className="text-emerald-400" />
            <span>Marcar Todas como Lidas</span>
          </button>

          <button
            type="button"
            disabled={notificacoes.length === 0}
            onClick={limparTodas}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-xs text-rose-400 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Trash2 size={13} />
            <span>Limpar</span>
          </button>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="flex items-center gap-2 border-b border-zinc-850 pb-3">
        <button
          type="button"
          onClick={() => setFiltro("todas")}
          className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            filtro === "todas"
              ? "bg-zinc-800 text-zinc-100 font-semibold"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Todas ({notificacoes.length})
        </button>

        <button
          type="button"
          onClick={() => setFiltro("nao_lidas")}
          className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            filtro === "nao_lidas"
              ? "bg-zinc-800 text-zinc-100 font-semibold"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Não Lidas ({totalNaoLidas})
        </button>
      </div>

      {/* Lista de Notificações */}
      {carregando && notificacoes.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center text-zinc-500 space-y-2">
          <RefreshCw size={24} className="animate-spin text-emerald-400 opacity-60" />
          <p className="text-xs">Carregando notificações do servidor...</p>
        </div>
      ) : listaFiltrada.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center text-zinc-500 space-y-2">
          <Bell size={32} className="opacity-40" />
          <p className="text-xs">Nenhuma notificação encontrada no momento.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {listaFiltrada.map((item) => {
            const Icone =
              item.tipo === "erro"
                ? AlertCircle
                : item.tipo === "aviso"
                ? AlertTriangle
                : Info;

            const corIcone =
              item.tipo === "erro"
                ? "text-rose-400 bg-rose-950/50 border-rose-800/40"
                : item.tipo === "aviso"
                ? "text-amber-400 bg-amber-950/50 border-amber-800/40"
                : "text-emerald-400 bg-emerald-950/50 border-emerald-800/40";

            const textoCorpo = item.corpo || item.mensagem || "";
            const dataStr = formatarDataRelativa(item.criado_em || item.criadaEm);

            return (
              <div
                key={item.id}
                className={`flex flex-col sm:flex-row sm:items-start justify-between gap-4 p-4 rounded-2xl border transition-all ${
                  item.lida
                    ? "bg-zinc-900/30 border-zinc-850/80 text-zinc-400"
                    : "bg-zinc-900/70 border-zinc-800 text-zinc-100 shadow-sm"
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`h-8 w-8 rounded-xl border flex items-center justify-center flex-shrink-0 mt-0.5 ${corIcone}`}>
                    <Icone size={16} />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xs font-semibold text-zinc-100">{item.titulo}</h3>
                      {item.origem && (
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded border bg-zinc-850 text-zinc-400 border-zinc-750">
                          {item.origem}
                        </span>
                      )}
                    </div>
                    {textoCorpo && (
                      <p className="text-xs text-zinc-400 leading-relaxed break-words">{textoCorpo}</p>
                    )}
                    <span className="text-[10px] text-zinc-500 block">{dataStr}</span>

                    {/* Ações interativas da notificação */}
                    {item.acoes && item.acoes.length > 0 && (
                      <div className="flex items-center gap-2 pt-2 flex-wrap">
                        {item.acoes.map((acao, idx) => (
                          <button
                            key={idx}
                            type="button"
                            disabled={executandoAcao === `${item.id}:${acao.label}`}
                            onClick={() => dispararAcao(item.id, acao)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 border border-zinc-700 transition-colors cursor-pointer font-medium"
                          >
                            {acao.tipo === "hitl" ? (
                              <ShieldAlert size={12} className="text-amber-400" />
                            ) : (
                              <ExternalLink size={12} className="text-emerald-400" />
                            )}
                            <span>{acao.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {!item.lida && (
                  <button
                    type="button"
                    onClick={() => marcarLida(item.id)}
                    className="self-end sm:self-start p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer shrink-0"
                    title="Marcar como lida"
                  >
                    <Check size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
