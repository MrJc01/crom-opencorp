import React, { useState, useEffect, useCallback, type FC } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
  ListTodo,
  ExternalLink,
  Bot,
  User,
  Clock,
  Terminal,
  MessageSquare,
  AlertCircle,
  RefreshCw,
  Lock,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { useOpenCorp } from "../../../providers/OpenCorpProvider.js";

export interface TaskExecucaoItem {
  id: string;
  agente: string;
  inicio: string;
  status: string;
  ordem?: string;
  modelo?: string;
  duracao_ms?: number;
}

export interface TaskMensagemItem {
  id: string;
  task_id: string;
  autor: string;
  corpo: string;
  tipo?: string;
  criado_em?: string;
}

export interface TaskDetalhe {
  id: string;
  titulo: string;
  descricao?: string;
  coluna: string;
  prioridade?: string;
  responsavel?: string;
  due?: string | null;
  labels?: string[];
  bloqueada?: boolean;
  criado_em?: string;
  atualizado_em?: string;
}

export interface HistoryTaskDrawerProps {
  aberto: boolean;
  taskId: string | null;
  aoFechar: () => void;
  aoAbrirExecucao?: (execId: string) => void;
}

function formatarDataHora(dataIso?: string | null): string {
  if (!dataIso) return "—";
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

export const HistoryTaskDrawer: FC<HistoryTaskDrawerProps> = ({
  aberto,
  taskId,
  aoFechar,
  aoAbrirExecucao,
}) => {
  const navigate = useNavigate();
  const { client, workspaceId, tratarErro } = useOpenCorp();

  const [task, setTask] = useState<TaskDetalhe | null>(null);
  const [mensagens, setMensagens] = useState<TaskMensagemItem[]>([]);
  const [execucoes, setExecucoes] = useState<TaskExecucaoItem[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const wsEfetivo = workspaceId || undefined;

  const carregarDadosTask = useCallback(async (id: string) => {
    setCarregando(true);
    setErro(null);
    try {
      const headers = wsEfetivo ? { "x-opencorp-workspace": wsEfetivo } : undefined;

      const [taskRes, msgsRes, execsRes] = await Promise.all([
        client.http.get<TaskDetalhe>(`/tasks/${encodeURIComponent(id)}`, { headers }).catch(() => null),
        client.http.get<TaskMensagemItem[]>(`/tasks/${encodeURIComponent(id)}/mensagens`, { headers }).catch(() => []),
        client.http.get<TaskExecucaoItem[]>(`/tasks/${encodeURIComponent(id)}/execucoes`, { headers }).catch(() => []),
      ]);

      if (!taskRes) {
        setErro("Tarefa não encontrada no workspace ativo.");
        setTask(null);
      } else {
        setTask(taskRes);
      }
      setMensagens(Array.isArray(msgsRes) ? msgsRes : []);
      setExecucoes(Array.isArray(execsRes) ? execsRes : []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha ao carregar tarefa";
      setErro(msg);
      tratarErro(err, "Falha ao carregar detalhes da tarefa");
    } finally {
      setCarregando(false);
    }
  }, [client, wsEfetivo, tratarErro]);

  useEffect(() => {
    if (aberto && taskId) {
      void carregarDadosTask(taskId);
    } else {
      setTask(null);
      setMensagens([]);
      setExecucoes([]);
      setErro(null);
    }
  }, [aberto, taskId, carregarDadosTask]);

  if (!aberto || !taskId) return null;

  const statusColuna = (task?.coluna || "").toLowerCase();
  const corStatus =
    statusColuna === "concluida" || statusColuna === "pronto" || statusColuna === "done"
      ? "bg-emerald-950/60 text-emerald-400 border-emerald-800"
      : statusColuna === "fazendo" || statusColuna === "andamento"
      ? "bg-amber-950/60 text-amber-400 border-amber-800 animate-pulse"
      : "bg-zinc-800/80 text-zinc-300 border-zinc-700";

  const prioridade = (task?.prioridade || "media").toLowerCase();
  const corPrioridade =
    prioridade === "urgente" || prioridade === "alta"
      ? "bg-rose-950/50 text-rose-300 border-rose-800/60"
      : prioridade === "baixa"
      ? "bg-blue-950/50 text-blue-300 border-blue-800/60"
      : "bg-amber-950/50 text-amber-300 border-amber-800/60";

  return (
    <>
      {/* Overlay escuro em mobile / desktop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 transition-opacity"
        onClick={aoFechar}
      />

      {/* Gaveta Lateral Direita */}
      <aside className="fixed inset-y-0 right-0 w-full sm:w-[560px] md:w-[600px] max-w-full z-50 bg-zinc-950/95 backdrop-blur-md border-l border-zinc-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Cabeçalho */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-900/60">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-purple-950/60 border border-purple-800/50 text-purple-300 shrink-0">
              <ListTodo size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono text-zinc-400 font-bold">
                  {taskId}
                </span>
                {task && (
                  <>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase border ${corStatus}`}>
                      {task.coluna}
                    </span>
                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono border ${corPrioridade}`}>
                      {task.prioridade || "Média"}
                    </span>
                  </>
                )}
              </div>
              <h2 className="text-sm font-bold text-zinc-100 truncate mt-0.5">
                {task?.titulo || (carregando ? "Carregando tarefa..." : "Detalhes da Tarefa")}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void carregarDadosTask(taskId)}
              disabled={carregando}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850 transition-colors cursor-pointer disabled:opacity-50"
              title="Atualizar dados da tarefa"
            >
              <RefreshCw size={14} className={carregando ? "animate-spin text-purple-400" : ""} />
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

        {/* Corpo com Scroll */}
        <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-5 space-y-4 scrollbar-thin">
          {carregando && !task ? (
            <div className="py-20 text-center text-xs text-zinc-400 space-y-2">
              <RefreshCw size={22} className="animate-spin text-purple-400 mx-auto" />
              <p>Carregando tarefa, comentários e execuções vinculadas...</p>
            </div>
          ) : erro ? (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-200 text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-rose-400 shrink-0" />
                <span>{erro}</span>
              </div>
              <button
                type="button"
                onClick={() => void carregarDadosTask(taskId)}
                className="px-2.5 py-1 rounded-lg bg-rose-900/60 hover:bg-rose-800 text-rose-100 text-xs font-medium cursor-pointer"
              >
                Tentar novamente
              </button>
            </div>
          ) : task ? (
            <>
              {/* Metadados da Tarefa */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
                  <span className="text-[10px] uppercase font-mono font-bold text-zinc-500 block mb-0.5">
                    Responsável
                  </span>
                  <div className="flex items-center gap-1.5 font-medium text-zinc-200">
                    <Bot size={13} className="text-purple-400 shrink-0" />
                    <span className="truncate">
                      {task.responsavel ? `@${task.responsavel.replace(/^agente:/, "")}` : "Sem responsável"}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
                  <span className="text-[10px] uppercase font-mono font-bold text-zinc-500 block mb-0.5">
                    Prazo / Due Date
                  </span>
                  <div className="flex items-center gap-1.5 font-medium text-zinc-200">
                    <Clock size={13} className="text-amber-400 shrink-0" />
                    <span className="truncate">{formatarDataHora(task.due)}</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 col-span-2 sm:col-span-1">
                  <span className="text-[10px] uppercase font-mono font-bold text-zinc-500 block mb-0.5">
                    Status / Bloqueio
                  </span>
                  <div className="flex items-center gap-1.5 font-medium text-zinc-200">
                    {task.bloqueada ? (
                      <>
                        <Lock size={13} className="text-rose-400 shrink-0" />
                        <span className="text-rose-300 font-semibold">Bloqueada</span>
                      </>
                    ) : (
                      <>
                        <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                        <span className="text-emerald-300">Desbloqueada</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Descrição / Instrução */}
              {task.descricao && (
                <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs space-y-1.5">
                  <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-zinc-500 block">
                    Instrução / Especificação da Tarefa
                  </span>
                  <p className="text-zinc-200 leading-relaxed whitespace-pre-wrap font-sans select-text">
                    {task.descricao}
                  </p>
                </div>
              )}

              {/* Execuções do Agente nesta Task */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-200">
                  <span className="flex items-center gap-1.5">
                    <Terminal size={14} className="text-emerald-400" />
                    <span>Execuções Vinculadas</span>
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400">
                    {execucoes.length} {execucoes.length === 1 ? "execução" : "execuções"}
                  </span>
                </div>

                {execucoes.length === 0 ? (
                  <div className="p-4 rounded-xl bg-zinc-900/30 border border-zinc-850/80 text-center text-xs text-zinc-500">
                    Nenhuma execução de agente gerada para esta tarefa ainda.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {execucoes.map((ex) => {
                      const isOk = ex.status === "concluido" || ex.status === "ok" || ex.status === "sucesso";
                      const isFalhou = ex.status === "falhou" || ex.status === "erro";
                      const isExec = ex.status === "executando";

                      return (
                        <div
                          key={ex.id}
                          onClick={() => aoAbrirExecucao?.(ex.id)}
                          className="p-3 rounded-xl bg-zinc-900/70 border border-zinc-800/80 hover:border-purple-600/60 transition-all cursor-pointer flex items-center justify-between gap-3 group"
                          title={`Inspecionar execução ${ex.id}`}
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span
                                className={`h-2 w-2 rounded-full shrink-0 ${
                                  isOk
                                    ? "bg-emerald-400"
                                    : isFalhou
                                    ? "bg-rose-400"
                                    : isExec
                                    ? "bg-amber-400 animate-pulse"
                                    : "bg-zinc-500"
                                }`}
                              />
                              <span className="font-mono text-xs font-bold text-zinc-200">
                                @{ex.agente.replace(/^agente:/, "")}
                              </span>
                              <span className="text-[10px] font-mono text-zinc-500 truncate">
                                {ex.id}
                              </span>
                            </div>

                            <div className="text-[10px] font-mono text-zinc-400 flex items-center gap-2">
                              <span className="capitalize">{ex.status}</span>
                              {ex.duracao_ms !== undefined && (
                                <span>· {(ex.duracao_ms / 1000).toFixed(1)}s</span>
                              )}
                              <span>· {formatarDataHora(ex.inicio)}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 text-[11px] font-mono text-purple-400 opacity-80 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0">
                            <span>Ver log</span>
                            <ArrowRight size={12} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Comentários & Handoffs */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-200">
                  <span className="flex items-center gap-1.5">
                    <MessageSquare size={14} className="text-zinc-400" />
                    <span>Comentários &amp; Handoffs</span>
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400">
                    {mensagens.length}
                  </span>
                </div>

                {mensagens.length === 0 ? (
                  <div className="p-4 rounded-xl bg-zinc-900/30 border border-zinc-850/80 text-center text-xs text-zinc-500">
                    Nenhum comentário registrado nesta tarefa.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {mensagens.map((msg) => (
                      <div
                        key={msg.id}
                        className="p-3 rounded-xl bg-zinc-900/70 border border-zinc-800/80 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono">
                          <span className="font-semibold text-zinc-300">
                            @{msg.autor.replace(/^agente:/, "")}
                            {msg.tipo && ` · ${msg.tipo}`}
                          </span>
                          <span>{formatarDataHora(msg.criado_em)}</span>
                        </div>
                        <p className="text-zinc-200 leading-relaxed whitespace-pre-wrap select-text">
                          {msg.corpo}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* Rodapé da Gaveta */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              aoFechar();
              navigate(`/tasks?task=${encodeURIComponent(taskId)}`);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 text-xs font-semibold transition-colors cursor-pointer shadow-xs"
            title="Abrir no Quadro Kanban"
          >
            <ExternalLink size={13} />
            <span>Abrir no Quadro Kanban</span>
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
