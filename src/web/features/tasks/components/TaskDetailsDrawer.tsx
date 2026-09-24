import React, { useState, useEffect, useCallback, type FC } from "react";
import { useNavigate } from "react-router-dom";
import {
  type Task,
  type AgentResumo,
  type MensagemTask,
  type ExecucaoVinculada,
} from "@opencorp/sdk";
import { useOpenCorp } from "../../../providers/OpenCorpProvider.js";
import { TaskHitlBanner } from "./TaskHitlBanner.js";
import {
  X,
  Trash2,
  Play,
  CheckCircle2,
  Lock,
  ArrowRight,
  History,
  MessageSquare,
  Send,
  Loader2,
} from "lucide-react";

export interface TaskDetailsDrawerProps {
  task: Task | null;
  agentes: AgentResumo[];
  aoFechar: () => void;
  aoMover: (task: Task, novaColuna: string) => Promise<void>;
  aoExcluir: (id: string) => Promise<void>;
  aoExecutar: (task: Task, instrucaoExtra?: string) => Promise<void>;
  aoDesbloquearEAprovar: (task: Task) => Promise<void>;
}

export const TaskDetailsDrawer: FC<TaskDetailsDrawerProps> = ({
  task,
  agentes,
  aoFechar,
  aoMover,
  aoExcluir,
  aoExecutar,
  aoDesbloquearEAprovar,
}) => {
  const navigate = useNavigate();
  const { client, tratarErro } = useOpenCorp();

  const [mensagens, setMensagens] = useState<MensagemTask[]>([]);
  const [execsTask, setExecsTask] = useState<ExecucaoVinculada[]>([]);
  const [carregandoMsgs, setCarregandoMsgs] = useState(false);
  const [carregandoExecs, setCarregandoExecs] = useState(false);

  const [novoComentario, setNovoComentario] = useState("");
  const [enviandoComentario, setEnviandoComentario] = useState(false);
  const [executandoTask, setExecutandoTask] = useState(false);

  const carregarDadosTask = useCallback(async (taskId: string) => {
    setCarregandoMsgs(true);
    setCarregandoExecs(true);

    try {
      const [msgs, execs] = await Promise.all([
        client.tasks.mensagens(taskId).catch(() => []),
        client.tasks.execucoes(taskId).catch(() => []),
      ]);
      setMensagens(msgs || []);
      setExecsTask(execs || []);
    } catch (err) {
      tratarErro(err, "Falha ao carregar detalhes da tarefa");
    } finally {
      setCarregandoMsgs(false);
      setCarregandoExecs(false);
    }
  }, [client, tratarErro]);

  useEffect(() => {
    if (task?.id) {
      void carregarDadosTask(task.id);
    } else {
      setMensagens([]);
      setExecsTask([]);
    }
  }, [task?.id, carregarDadosTask]);

  if (!task) return null;

  const enviarComentario = async (executar = true) => {
    const texto = novoComentario.trim();
    if (!texto) return;

    setEnviandoComentario(true);
    try {
      const tipoMsg = executar ? "instrucao" : "comentario";
      await client.tasks.adicionarMensagem(task.id, {
        corpo: texto,
        autor: "humano",
        tipo: tipoMsg,
      });

      setNovoComentario("");
      const atualizadas = await client.tasks.mensagens(task.id).catch(() => []);
      setMensagens(atualizadas || []);

      if (executar) {
        setExecutandoTask(true);
        await aoExecutar(task, texto);
        setExecutandoTask(false);
        const execsAtualizadas = await client.tasks.execucoes(task.id).catch(() => []);
        setExecsTask(execsAtualizadas || []);
      }
    } catch (err) {
      tratarErro(err, "Erro ao enviar mensagem na tarefa");
    } finally {
      setEnviandoComentario(false);
      setExecutandoTask(false);
    }
  };

  const semPrefixoAgente = (r?: string | null) =>
    String(r || "").replace(/^@/, "").replace(/^agente:/, "");

  const agentePadrao =
    semPrefixoAgente(task.responsavel) || agentes[0]?.id || "secretario-exec";

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[480px] bg-zinc-950 border-l border-zinc-800 shadow-2xl z-40 flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header do Drawer */}
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
            {task.id}
          </span>
          <span className="text-xs text-zinc-400 font-medium">Detalhes da Tarefa</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Tem certeza que deseja excluir permanentemente "${task.titulo || task.id}"?`)) {
                void aoExcluir(task.id);
              }
            }}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors cursor-pointer"
            title="Excluir Tarefa"
          >
            <Trash2 size={15} />
          </button>
          <button
            type="button"
            onClick={aoFechar}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Fechar"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Conteúdo do Drawer */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-thin">
        {/* Título & Descrição */}
        <div>
          <h2 className="text-base font-bold text-zinc-100 leading-snug">
            {task.titulo || task.id}
          </h2>
          {task.descricao && (
            <p className="text-xs text-zinc-300 mt-2.5 leading-relaxed whitespace-pre-wrap bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-800">
              {task.descricao}
            </p>
          )}
        </div>

        {/* Bloco HITL se Bloqueada */}
        {(task.coluna === "bloqueado" || task.bloqueada === true) && (
          <TaskHitlBanner
            task={task}
            aoDesbloquearEAprovar={aoDesbloquearEAprovar}
            aoMoverParaBacklog={(t) => aoMover(t, "backlog")}
          />
        )}

        {/* Ações Rápidas de Workflow */}
        <div className="p-3.5 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-2.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-zinc-400 uppercase tracking-wider">
              Status: <span className="text-zinc-200 capitalize font-mono">{task.coluna || "backlog"}</span>
            </span>
            <span className="text-zinc-400 font-mono text-[10px]">
              Executor: @{agentePadrao}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {task.coluna !== "fazendo" && (
              <button
                type="button"
                disabled={executandoTask}
                onClick={async () => {
                  setExecutandoTask(true);
                  await aoExecutar(task);
                  setExecutandoTask(false);
                  void carregarDadosTask(task.id);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-colors cursor-pointer disabled:opacity-50"
              >
                {executandoTask ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Play size={12} className="fill-current" />
                )}
                <span>Executar Tarefa</span>
              </button>
            )}

            {task.coluna !== "feito" && (
              <button
                type="button"
                onClick={() => aoMover(task, "feito")}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-850 hover:bg-zinc-800 border border-zinc-750 text-emerald-400 hover:text-emerald-300 text-xs font-medium transition-colors cursor-pointer"
              >
                <CheckCircle2 size={12} />
                <span>Concluir</span>
              </button>
            )}

            {task.coluna !== "backlog" && (
              <button
                type="button"
                onClick={() => aoMover(task, "backlog")}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-850 hover:bg-zinc-800 border border-zinc-750 text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
              >
                <span>Mover para Backlog</span>
              </button>
            )}

            {task.coluna !== "bloqueado" && (
              <button
                type="button"
                onClick={() => aoMover(task, "bloqueado")}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-850 hover:bg-zinc-800 border border-zinc-750 text-amber-400 hover:text-amber-300 text-xs font-medium transition-colors cursor-pointer"
              >
                <Lock size={12} />
                <span>Bloquear</span>
              </button>
            )}
          </div>
        </div>

        {/* Metadados: Responsável e Prioridade */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800">
            <span className="text-zinc-500 block text-[10px] uppercase font-semibold mb-1">
              Responsável
            </span>
            <span className="font-mono text-emerald-400 font-semibold">
              {task.responsavel ? `@${semPrefixoAgente(task.responsavel)}` : "Sem agente"}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800">
            <span className="text-zinc-500 block text-[10px] uppercase font-semibold mb-1">
              Prioridade
            </span>
            <span className="capitalize font-semibold text-zinc-200">
              {task.prioridade || "Média"}
            </span>
          </div>
        </div>

        {/* Execuções Vinculadas */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
              <History size={13} className="text-zinc-400" />
              <span>Execuções Vinculadas</span>
              {execsTask.length > 0 && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                  {execsTask.length}
                </span>
              )}
            </h3>
            {carregandoExecs && <Loader2 size={12} className="animate-spin text-zinc-500" />}
          </div>

          {!carregandoExecs && execsTask.length === 0 && (
            <div className="text-[11px] text-zinc-500 py-2.5 text-center bg-zinc-900/30 rounded-xl border border-zinc-850">
              Nenhuma execução vinculada a esta tarefa ainda.
            </div>
          )}

          <div className="space-y-1.5">
            {execsTask.map((ex) => {
              const concluido = ex.status === "concluido" || ex.status === "feito";
              const falhou = ex.status === "falhou" || ex.status === "erro";
              const executando = ex.status === "executando";

              return (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => navigate(`/historico?run=${encodeURIComponent(ex.id)}`)}
                  className="w-full text-left p-2.5 rounded-xl bg-zinc-900/70 border border-zinc-800 hover:border-zinc-700 cursor-pointer flex items-center justify-between gap-2 transition-colors"
                  title={`Abrir execução ${ex.id} no Histórico`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${
                          concluido
                            ? "bg-emerald-400"
                            : falhou
                            ? "bg-rose-400"
                            : executando
                            ? "bg-emerald-400 animate-pulse"
                            : "bg-zinc-500"
                        }`}
                      />
                      <span className="font-mono font-semibold text-zinc-200 text-[11px]">
                        @{ex.agente}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono truncate">
                        {ex.id}
                      </span>
                    </div>

                    <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                      {ex.status}
                      {ex.duracao_ms ? ` · ${(ex.duracao_ms / 1000).toFixed(1)}s` : ""}
                      {ex.inicio ? ` · ${new Date(ex.inicio).toLocaleTimeString("pt-BR")}` : ""}
                    </div>
                  </div>
                  <ArrowRight size={13} className="text-zinc-600 shrink-0" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Histórico de Comentários & Handoffs */}
        <div className="space-y-3 pt-3 border-t border-zinc-800">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
              <MessageSquare size={13} className="text-zinc-400" />
              <span>Histórico de Comentários & Handoffs</span>
            </h3>
            {carregandoMsgs && <Loader2 size={12} className="animate-spin text-zinc-500" />}
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-thin pr-1">
            {mensagens.length === 0 && !carregandoMsgs && (
              <div className="text-[11px] text-zinc-500 py-3 text-center bg-zinc-900/30 rounded-xl border border-zinc-850">
                Nenhum comentário registrado ainda.
              </div>
            )}

            {mensagens.map((m) => (
              <div
                key={m.id}
                className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 text-xs space-y-1"
              >
                <div className="flex items-center justify-between text-[10px] text-zinc-500">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-zinc-300 font-mono">@{m.autor}</span>
                    {m.tipo === "execucao" && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-950 text-emerald-400 border border-emerald-800/60 font-mono">
                        execução
                      </span>
                    )}
                    {m.tipo === "aprovacao" && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-950 text-amber-400 border border-amber-800/60 font-mono">
                        aprovado
                      </span>
                    )}
                    {m.tipo === "instrucao" && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] bg-blue-950 text-blue-400 border border-blue-800/60 font-mono">
                        instrução
                      </span>
                    )}
                  </div>
                  <span>
                    {m.criado_em ? new Date(m.criado_em).toLocaleTimeString("pt-BR") : ""}
                  </span>
                </div>
                <p className="text-zinc-300 leading-relaxed text-[11px] whitespace-pre-wrap">
                  {m.corpo}
                </p>
              </div>
            ))}
          </div>

          {/* Input para Nova Mensagem */}
          <div className="space-y-2 pt-2 border-t border-zinc-800/60">
            <input
              type="text"
              placeholder="Instrução para o agente executar na tarefa..."
              value={novoComentario}
              onChange={(e) => setNovoComentario(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void enviarComentario(true);
                }
              }}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
            />

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={enviandoComentario}
                onClick={() => enviarComentario(false)}
                className="text-[11px] text-zinc-400 hover:text-zinc-200 cursor-pointer disabled:opacity-50"
              >
                Apenas comentar
              </button>
              <button
                type="button"
                disabled={enviandoComentario || executandoTask}
                onClick={() => enviarComentario(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-colors cursor-pointer disabled:opacity-50"
              >
                {enviandoComentario || executandoTask ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Send size={12} />
                )}
                <span>Enviar & Executar</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Rodapé do Drawer */}
      <div className="p-3.5 border-t border-zinc-800 flex justify-between items-center bg-zinc-900/60">
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Tem certeza que deseja excluir permanentemente "${task.titulo || task.id}"?`)) {
              void aoExcluir(task.id);
            }
          }}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-950/40 border border-rose-900/50 hover:bg-rose-900/60 text-rose-300 text-xs font-medium transition-colors cursor-pointer"
        >
          <Trash2 size={13} />
          <span>Excluir</span>
        </button>
        <button
          type="button"
          onClick={aoFechar}
          className="px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors cursor-pointer"
        >
          Fechar
        </button>
      </div>
    </div>
  );
};
