import React, { useState, useEffect, useCallback, type FC } from "react";
import { useOpenCorp } from "../../../providers/OpenCorpProvider.js";
import { type Task } from "@opencorp/sdk";
import { showToast } from "../../../shared/ui/Toast.js";
import {
  Kanban,
  Plus,
  Trash2,
  Play,
  ArrowRight,
  ArrowLeft,
  Clock,
  AlertCircle,
  CheckCircle2,
  User,
  X,
  Sparkles,
} from "lucide-react";

interface ColunaDef {
  id: "backlog" | "fazendo" | "bloqueado" | "feito";
  titulo: string;
  corBorda: string;
  badgeCor: string;
}

const COLUNAS: ColunaDef[] = [
  {
    id: "backlog",
    titulo: "A Fazer",
    corBorda: "border-zinc-800",
    badgeCor: "bg-zinc-800 text-zinc-300",
  },
  {
    id: "fazendo",
    titulo: "Em Progresso",
    corBorda: "border-emerald-800/60",
    badgeCor: "bg-emerald-950/60 border border-emerald-800/40 text-emerald-300",
  },
  {
    id: "bloqueado",
    titulo: "Revisão / Bloqueado",
    corBorda: "border-amber-800/60",
    badgeCor: "bg-amber-950/60 border border-amber-800/40 text-amber-300",
  },
  {
    id: "feito",
    titulo: "Concluído",
    corBorda: "border-blue-800/60",
    badgeCor: "bg-blue-950/60 border border-blue-800/40 text-blue-300",
  },
];

export const TasksView: FC = () => {
  const { client, tratarErro } = useOpenCorp();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modalCriarAberto, setModalCriarAberto] = useState(false);

  // Form states
  const [novoTitulo, setNovoTitulo] = useState("");
  const [novaDescricao, setNovaDescricao] = useState("");
  const [novaPrioridade, setNovaPrioridade] = useState<"baixa" | "media" | "alta">("media");
  const [novoResponsavel, setNovoResponsavel] = useState("");

  const carregarTasks = useCallback(async () => {
    setCarregando(true);
    try {
      const lista = await client.tasks.listar();
      setTasks(lista || []);
    } catch (err) {
      tratarErro(err, "Falha ao listar tarefas");
    } finally {
      setCarregando(false);
    }
  }, [client, tratarErro]);

  useEffect(() => {
    void carregarTasks();
  }, [carregarTasks]);

  const criarTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoTitulo.trim()) return;

    try {
      const criada = await client.tasks.criar({
        titulo: novoTitulo.trim(),
        descricao: novaDescricao.trim() || undefined,
        prioridade: novaPrioridade,
        responsavel: novoResponsavel.trim() || undefined,
        coluna: "backlog",
      });

      setTasks((prev) => [criada, ...prev]);
      showToast(`Tarefa "${criada.titulo || novoTitulo}" criada com sucesso`, "sucesso");
      setNovoTitulo("");
      setNovaDescricao("");
      setNovoResponsavel("");
      setModalCriarAberto(false);
    } catch (err) {
      tratarErro(err, "Falha ao criar tarefa");
    }
  };

  const moverColuna = async (
    id: string,
    direcao: "proximo" | "anterior",
    colunaAtual: string = "backlog",
  ) => {
    const ordem: ColunaDef["id"][] = ["backlog", "fazendo", "bloqueado", "feito"];
    const idx = ordem.indexOf(colunaAtual as any);
    const novoIdx = direcao === "proximo" ? idx + 1 : idx - 1;

    if (novoIdx < 0 || novoIdx >= ordem.length) return;
    const destino = ordem[novoIdx];

    try {
      await client.tasks.mover(id, destino);
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, coluna: destino } : t)),
      );
      showToast(`Tarefa movida para "${destino}"`, "info");
    } catch (err) {
      tratarErro(err, "Erro ao mover tarefa");
    }
  };

  const executarTask = async (id: string, titulo: string) => {
    try {
      await client.tasks.mover(id, "fazendo");
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, coluna: "fazendo" } : t)),
      );
      showToast(`Execução iniciada pelo Secretário para: ${titulo}`, "sucesso");
    } catch (err) {
      tratarErro(err, "Falha ao disparar execução da tarefa");
    }
  };

  const excluirTask = async (id: string, titulo: string) => {
    if (!window.confirm(`Deseja realmente excluir a tarefa "${titulo}"?`)) return;

    try {
      await client.tasks.deletar(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
      showToast("Tarefa excluída com sucesso", "sucesso");
    } catch (err) {
      tratarErro(err, "Falha ao excluir tarefa");
    }
  };

  return (
    <div className="flex flex-col h-full w-full p-6 md:p-8 space-y-6 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <Kanban className="text-emerald-400" size={20} />
            Quadro Kanban Operacional
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Gestão de tarefas autônomas distribuídas entre o Secretário e os agentes do workspace.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setModalCriarAberto(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-950/60 transition-all cursor-pointer self-start md:self-auto"
        >
          <Plus size={15} />
          <span>Nova Tarefa</span>
        </button>
      </div>

      {/* Grid de 4 Colunas */}
      {carregando ? (
        <div className="flex-1 flex items-center justify-center text-zinc-500 text-xs">
          Carregando quadro de tarefas...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 flex-1 min-h-0 overflow-y-auto">
          {COLUNAS.map((col) => {
            const tarefasColuna = tasks.filter(
              (t) => (t.coluna || "backlog").toLowerCase() === col.id,
            );

            return (
              <div
                key={col.id}
                className="flex flex-col rounded-2xl bg-zinc-900/40 border border-zinc-850 p-4 space-y-3 min-h-[320px] overflow-hidden"
              >
                {/* Cabeçalho da Coluna */}
                <div className="flex items-center justify-between pb-2 border-b border-zinc-850/60">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-zinc-200">{col.titulo}</span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${col.badgeCor}`}>
                      {tarefasColuna.length}
                    </span>
                  </div>
                </div>

                {/* Cards de Tarefa */}
                <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                  {tarefasColuna.length === 0 ? (
                    <div className="h-28 flex items-center justify-center border border-dashed border-zinc-850 rounded-xl text-[11px] text-zinc-600">
                      Nenhuma tarefa
                    </div>
                  ) : (
                    tarefasColuna.map((task) => (
                      <div
                        key={task.id}
                        className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80 hover:border-zinc-700 transition-all shadow-sm space-y-2.5 text-xs group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-medium text-zinc-100 leading-snug break-words">
                            {task.titulo}
                          </h4>

                          <button
                            type="button"
                            onClick={() => excluirTask(task.id, task.titulo || "")}
                            className="text-zinc-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity p-1 cursor-pointer"
                            title="Excluir tarefa"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>

                        {task.descricao && (
                          <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                            {task.descricao}
                          </p>
                        )}

                        {/* Metadados e Controles */}
                        <div className="flex items-center justify-between pt-2 border-t border-zinc-800/40 text-[10px] text-zinc-500">
                          <div className="flex items-center gap-1.5">
                            {task.responsavel ? (
                              <span className="flex items-center gap-1 font-mono text-zinc-400">
                                <User size={10} />
                                {task.responsavel}
                              </span>
                            ) : (
                              <span>Sem responsável</span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => executarTask(task.id, task.titulo || "")}
                              className="p-1 rounded bg-zinc-800 hover:bg-emerald-950 hover:text-emerald-400 text-zinc-400 transition-colors cursor-pointer"
                              title="Disparar execução pelo Secretário"
                            >
                              <Play size={11} />
                            </button>

                            {col.id !== "backlog" && (
                              <button
                                type="button"
                                onClick={() => moverColuna(task.id, "anterior", task.coluna)}
                                className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors cursor-pointer"
                                title="Mover para coluna anterior"
                              >
                                <ArrowLeft size={11} />
                              </button>
                            )}

                            {col.id !== "feito" && (
                              <button
                                type="button"
                                onClick={() => moverColuna(task.id, "proximo", task.coluna)}
                                className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors cursor-pointer"
                                title="Mover para próxima coluna"
                              >
                                <ArrowRight size={11} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Rápido de Criação */}
      {modalCriarAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <Kanban size={16} className="text-emerald-400" />
                Criar Nova Tarefa Operacional
              </h3>
              <button
                type="button"
                onClick={() => setModalCriarAberto(false)}
                className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={criarTask} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-zinc-300 font-medium mb-1">Título da Tarefa *</label>
                <input
                  type="text"
                  required
                  value={novoTitulo}
                  onChange={(e) => setNovoTitulo(e.target.value)}
                  placeholder="Ex: Auditoria de segurança de dependências"
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-zinc-300 font-medium mb-1">Descrição</label>
                <textarea
                  rows={3}
                  value={novaDescricao}
                  onChange={(e) => setNovaDescricao(e.target.value)}
                  placeholder="Instruções e escopo detalhado para os agentes..."
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 resize-none font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-300 font-medium mb-1">Prioridade</label>
                  <select
                    value={novaPrioridade}
                    onChange={(e) => setNovaPrioridade(e.target.value as any)}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-300 font-medium mb-1">Responsável</label>
                  <input
                    type="text"
                    value={novoResponsavel}
                    onChange={(e) => setNovoResponsavel(e.target.value)}
                    placeholder="Ex: secretario, dev"
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setModalCriarAberto(false)}
                  className="px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-all shadow-md cursor-pointer"
                >
                  Criar Tarefa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
