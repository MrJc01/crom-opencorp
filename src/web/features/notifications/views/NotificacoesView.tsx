import React, { useState, useEffect, type FC } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  AlertCircle,
  Info,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { showToast } from "../../../shared/ui/Toast.js";

interface NotificacaoItem {
  id: string;
  titulo: string;
  mensagem: string;
  tipo?: "info" | "aviso" | "erro" | "sucesso";
  lida: boolean;
  criadaEm: string;
}

const NOTIFICACOES_MOCK: NotificacaoItem[] = [
  {
    id: "notif-1",
    titulo: "Sessão do Secretário Iniciada",
    mensagem: "O daemon do OpenCorp inicializou o supervisor de agentes com sucesso.",
    tipo: "sucesso",
    lida: false,
    criadaEm: "Há 10 minutos",
  },
  {
    id: "notif-2",
    titulo: "Checkpoint Git Automático",
    mensagem: "Commit de segurança gerado para o workspace ativo.",
    tipo: "info",
    lida: true,
    criadaEm: "Há 1 hora",
  },
  {
    id: "notif-3",
    titulo: "Aviso de Cota de Inferência",
    mensagem: "Consumo de tokens no OpenRouter atingiu 70% do limite configurado.",
    tipo: "aviso",
    lida: false,
    criadaEm: "Há 2 horas",
  },
];

export const NotificacoesView: FC = () => {
  const [notificacoes, setNotificacoes] = useState<NotificacaoItem[]>(NOTIFICACOES_MOCK);
  const [filtro, setFiltro] = useState<"todas" | "nao_lidas">("todas");

  useEffect(() => {
    fetch("/notifications")
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (data && Array.isArray(data.notificacoes)) {
          setNotificacoes(data.notificacoes);
        }
      })
      .catch(() => {});
  }, []);

  const marcarLida = (id: string) => {
    setNotificacoes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, lida: true } : n)),
    );
    showToast("Notificação marcada como lida", "info");
  };

  const marcarTodasLidas = () => {
    setNotificacoes((prev) => prev.map((n) => ({ ...n, lida: true })));
    showToast("Todas as notificações foram marcadas como lidas", "sucesso");
  };

  const limparTodas = () => {
    setNotificacoes([]);
    showToast("Histórico de notificações limpo", "info");
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
            Registro de eventos, avisos de cotas e transições operacionais do sistema.
          </p>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={marcarTodasLidas}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-xs text-zinc-300 transition-colors cursor-pointer"
          >
            <CheckCheck size={14} className="text-emerald-400" />
            <span>Marcar Todas como Lidas</span>
          </button>

          <button
            type="button"
            onClick={limparTodas}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-xs text-rose-400 transition-colors cursor-pointer"
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
      {listaFiltrada.length === 0 ? (
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

            return (
              <div
                key={item.id}
                className={`flex items-start justify-between gap-4 p-4 rounded-2xl border transition-all ${
                  item.lida
                    ? "bg-zinc-900/30 border-zinc-850/80 text-zinc-400"
                    : "bg-zinc-900/70 border-zinc-800 text-zinc-100 shadow-sm"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`h-8 w-8 rounded-xl border flex items-center justify-center flex-shrink-0 mt-0.5 ${corIcone}`}>
                    <Icone size={16} />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold">{item.titulo}</h3>
                    <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">{item.mensagem}</p>
                    <span className="text-[10px] text-zinc-500 mt-1.5 block">{item.criadaEm}</span>
                  </div>
                </div>

                {!item.lida && (
                  <button
                    type="button"
                    onClick={() => marcarLida(item.id)}
                    className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
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
