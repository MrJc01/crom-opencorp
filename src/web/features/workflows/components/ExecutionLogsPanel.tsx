import React, { useState, useMemo, type FC } from "react";
import { useNavigate } from "react-router-dom";
import {
  History,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Terminal,
  Layers,
  Code,
  ArrowRight,
  ExternalLink,
  Search,
} from "lucide-react";
import type { FlowRunLog } from "../types.js";

export interface ExecutionLogsPanelProps {
  fluxoId: string;
  logs: FlowRunLog[];
  aberto: boolean;
  carregando: boolean;
  onToggleAberto: () => void;
  onRecarregar: () => void;
}

export const ExecutionLogsPanel: FC<ExecutionLogsPanelProps> = ({
  fluxoId,
  logs,
  aberto,
  carregando,
  onToggleAberto,
  onRecarregar,
}) => {
  const navigate = useNavigate();
  const [execSelecionadaId, setExecSelecionadaId] = useState<string | null>(null);
  const [noSelecionadoId, setNoSelecionadoId] = useState<string | null>(null);
  const [abaDetalhe, setAbaDetalhe] = useState<"dados" | "entrada" | "contexto">("dados");
  const [filtroNoTexto, setFiltroNoTexto] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "sucesso" | "falha">("todos");

  const execSelecionada = useMemo(() => {
    if (!logs || logs.length === 0) return null;
    if (execSelecionadaId) {
      const achado = logs.find((l) => (l.execId || l.id) === execSelecionadaId);
      if (achado) return achado;
    }
    return logs[0];
  }, [logs, execSelecionadaId]);

  const nosExecutados = useMemo(() => {
    return execSelecionada?.nos_executados || [];
  }, [execSelecionada]);

  const nosExecutadosFiltrados = useMemo(() => {
    let lista = nosExecutados;
    if (filtroStatus === "sucesso") {
      lista = lista.filter((n) => n.status === "concluido" || n.status === "sucesso");
    } else if (filtroStatus === "falha") {
      lista = lista.filter((n) => n.status !== "concluido" && n.status !== "sucesso");
    }
    if (filtroNoTexto.trim()) {
      const q = filtroNoTexto.toLowerCase();
      lista = lista.filter((n) => n.no_id.toLowerCase().includes(q));
    }
    return lista;
  }, [nosExecutados, filtroStatus, filtroNoTexto]);

  const noSelecionado = useMemo(() => {
    if (!nosExecutados || nosExecutados.length === 0) return null;
    if (noSelecionadoId) {
      const achado = nosExecutados.find((n) => n.no_id === noSelecionadoId);
      if (achado) return achado;
    }
    return nosExecutados[0];
  }, [nosExecutados, noSelecionadoId]);

  if (!aberto) return null;

  return (
    <div className="h-64 sm:h-72 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-md flex flex-col shrink-0 z-30 shadow-2xl animate-in slide-in-from-bottom duration-150">
      {/* Topo do Painel */}
      <div className="h-9 px-3 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-900/60">
        <div className="flex items-center gap-2">
          <History size={14} className="text-orange-400" />
          <span className="text-xs font-bold text-zinc-200">
            Execuções &amp; Telemetria I/O
          </span>
          <span className="text-[10px] text-zinc-500 font-mono">
            ({logs.length} execuções registradas)
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {execSelecionada && (
            <button
              type="button"
              onClick={() => {
                const runId = execSelecionada.execId || execSelecionada.id;
                if (runId) {
                  navigate(`/historico?run=${encodeURIComponent(runId)}`);
                } else {
                  navigate("/historico");
                }
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-orange-400 hover:text-white hover:bg-orange-600 transition-colors border border-orange-500/30 cursor-pointer shadow-xs"
              title="Abrir auditoria forense detalhada na central de Histórico"
            >
              <ExternalLink size={12} />
              <span className="hidden sm:inline">Abrir no Histórico</span>
            </button>
          )}
          <button
            type="button"
            onClick={onRecarregar}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Recarregar histórico"
          >
            <RefreshCw size={12} className={carregando ? "animate-spin text-orange-400" : ""} />
          </button>
          <button
            type="button"
            onClick={onToggleAberto}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Recolher painel"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {/* Corpo: 3 Colunas (Execuções | Trilha de Nós | Dados I/O) */}
      <div className="flex-1 min-h-0 flex overflow-hidden text-xs">
        {/* Coluna 1: Lista de Execuções */}
        <div className="w-48 sm:w-56 shrink-0 border-r border-zinc-800 overflow-y-auto p-1.5 space-y-1 scrollbar-thin bg-zinc-950">
          {logs.length === 0 ? (
            <div className="p-4 text-center text-zinc-500 text-[11px]">
              Nenhuma execução registrada para este fluxo.
            </div>
          ) : (
            logs.map((log) => {
              const id = log.execId || log.id || "run";
              const isSelected = (execSelecionada?.execId || execSelecionada?.id) === id;
              const isConcluido = log.status === "concluido";
              const isFalhou = log.status === "falhou";

              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setExecSelecionadaId(id);
                    setNoSelecionadoId(null);
                  }}
                  className={`w-full text-left p-2 rounded-lg text-xs transition-colors cursor-pointer border ${
                    isSelected
                      ? "bg-orange-600/15 border-orange-500/40 text-white"
                      : "bg-zinc-900/40 hover:bg-zinc-850/60 text-zinc-300 border-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-[11px] font-bold truncate">
                      {id.slice(0, 12)}...
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold uppercase ${
                        isConcluido
                          ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800"
                          : isFalhou
                          ? "bg-rose-950/80 text-rose-400 border border-rose-800"
                          : "bg-amber-950/80 text-amber-400 border border-amber-800"
                      }`}
                    >
                      {log.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono mt-1">
                    <span>{log.inicio ? new Date(log.inicio).toLocaleTimeString() : "--:--"}</span>
                    {log.duracao_ms && <span>{log.duracao_ms}ms</span>}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Coluna 2: Trilha de Nós Executados */}
        <div className="w-56 sm:w-68 shrink-0 border-r border-zinc-800 flex flex-col min-h-0 bg-zinc-900/30">
          <div className="p-1.5 border-b border-zinc-800/80 space-y-1.5 shrink-0 bg-zinc-950/40">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-[10px] uppercase font-bold text-zinc-400 font-mono">
                Trilha de Execução
              </span>
              <span className="text-[9px] text-zinc-500 font-mono">
                {nosExecutadosFiltrados.length}/{nosExecutados.length} nós
              </span>
            </div>

            {/* Input de Busca de Nó */}
            <div className="relative">
              <Search size={11} className="absolute left-2 top-2 text-zinc-500" />
              <input
                type="text"
                placeholder="Filtrar por ID do nó..."
                value={filtroNoTexto}
                onChange={(e) => setFiltroNoTexto(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 pl-6 text-[10px] text-zinc-200 font-mono focus:outline-none focus:border-orange-500"
              />
            </div>

            {/* Pílulas de Status */}
            <div className="flex items-center gap-1 text-[9px] font-mono">
              {[
                { id: "todos", label: "Todos" },
                { id: "sucesso", label: "Sucesso" },
                { id: "falha", label: "Falhas" },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFiltroStatus(f.id as any)}
                  className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                    filtroStatus === f.id
                      ? f.id === "falha"
                        ? "bg-rose-950 border border-rose-800 text-rose-300 font-bold"
                        : f.id === "sucesso"
                        ? "bg-emerald-950 border border-emerald-800 text-emerald-300 font-bold"
                        : "bg-zinc-800 text-white font-bold"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-1.5 space-y-1 scrollbar-thin">
            {nosExecutadosFiltrados.length === 0 ? (
              <div className="p-4 text-center text-zinc-500 text-[11px]">
                {nosExecutados.length === 0
                  ? "Sem telemetria de nós individuais para este run."
                  : "Nenhum nó corresponde aos filtros."}
              </div>
            ) : (
              nosExecutadosFiltrados.map((item, idx) => {
                const isSelected = noSelecionado?.no_id === item.no_id;
                const isOk = item.status === "concluido" || item.status === "sucesso";

                return (
                  <button
                    key={`${item.no_id}-${idx}`}
                    type="button"
                    onClick={() => setNoSelecionadoId(item.no_id)}
                    className={`w-full flex items-center justify-between p-2 rounded-lg text-xs transition-colors cursor-pointer border ${
                      isSelected
                        ? "bg-zinc-800 border-zinc-700 text-white"
                        : "hover:bg-zinc-850/40 text-zinc-300 border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isOk ? (
                        <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle size={13} className="text-rose-400 shrink-0" />
                      )}
                      <span className="font-mono text-[11px] font-semibold truncate">
                        {item.no_id}
                      </span>
                    </div>
                    {item.duracao_ms && (
                      <span className="font-mono text-[10px] text-zinc-500 shrink-0">
                        {item.duracao_ms}ms
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Coluna 3: Inspeção de Dados I/O */}
        <div className="flex-1 min-w-0 flex flex-col bg-zinc-950">
          {/* Abas */}
          <div className="flex items-center gap-1 p-1.5 border-b border-zinc-850 bg-zinc-900/40">
            {[
              { id: "dados", label: "Saída (Output)", icon: Code },
              { id: "entrada", label: "Entrada (Input)", icon: Layers },
              { id: "contexto", label: "Contexto Final", icon: Terminal },
            ].map((aba) => (
              <button
                key={aba.id}
                type="button"
                onClick={() => setAbaDetalhe(aba.id as any)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                  abaDetalhe === aba.id
                    ? "bg-zinc-800 text-white font-bold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <aba.icon size={12} />
                <span>{aba.label}</span>
              </button>
            ))}
          </div>

          {/* Visualizador de JSON */}
          <div className="flex-1 p-3 overflow-y-auto scrollbar-thin">
            <pre className="font-mono text-[11px] text-zinc-300 leading-relaxed whitespace-pre-wrap break-all">
              {abaDetalhe === "dados"
                ? JSON.stringify(noSelecionado?.saida ?? execSelecionada?.contexto_final ?? "Sem dados de saída", null, 2)
                : abaDetalhe === "entrada"
                ? JSON.stringify(noSelecionado?.entrada ?? "Sem dados de entrada", null, 2)
                : JSON.stringify(execSelecionada?.contexto_final ?? execSelecionada ?? {}, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
