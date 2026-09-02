import { type Component, createSignal, onMount, createEffect, For, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import {
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  Send,
  User,
  MessageSquare,
  Calendar,
  Tag,
  ArrowRight,
  Filter,
} from "lucide-solid";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { showToast } from "../ui/Toast";
import { fetchApi } from "../lib/context";

export interface MensagemTask {
  id: string;
  autor: string;
  corpo: string;
  tipo?: string;
  criado_em: string;
}

export interface Task {
  id: string;
  titulo: string;
  coluna: "backlog" | "fazendo" | "bloqueado" | "feito";
  descricao?: string;
  responsavel?: string;
  prioridade?: "alta" | "media" | "baixa";
  due?: string | null;
  labels?: string[];
  criado_em?: string;
}

export const TasksView: Component = () => {
  const [tasks, setTasks] = createSignal<Task[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [agentes, setAgentes] = createSignal<any[]>([]);
  const [filtroResponsavel, setFiltroResponsavel] = createSignal<string>("todos");
  const [busca, setBusca] = createSignal("");

  // Modal / Drawer de Criação
  const [modalCriacaoAberto, setModalCriacaoAberto] = createSignal(false);
  const [novoTitulo, setNovoTitulo] = createSignal("");
  const [novaDescricao, setNovaDescricao] = createSignal("");
  const [novaColuna, setNovaColuna] = createSignal<Task["coluna"]>("backlog");
  const [novaPrioridade, setNovaPrioridade] = createSignal<Task["prioridade"]>("media");
  const [novoResponsavel, setNovoResponsavel] = createSignal("");

  // Drawer de Detalhes da Task Ativa
  const [taskSelecionada, setTaskSelecionada] = createSignal<Task | null>(null);
  const [mensagens, setMensagens] = createSignal<MensagemTask[]>([]);
  const [novoComentario, setNovoComentario] = createSignal("");
  const [enviandoComentario, setEnviandoComentario] = createSignal(false);

  const carregarTasks = async () => {
    try {
      const [listaTasks, listaAgentes] = await Promise.all([
        fetchApi<Task[]>("/tasks").catch(() => []),
        fetchApi<any[]>("/agents").catch(() => []),
      ]);
      setTasks(listaTasks || []);
      setAgentes(listaAgentes || []);
    } catch {}
  };

  const carregarMsgsTask = async (task: Task) => {
    setTaskSelecionada(task);
    try {
      const msgs = await fetchApi<MensagemTask[]>(`/tasks/${encodeURIComponent(task.id)}/mensagens`).catch(() => []);
      setMensagens(msgs || []);
    } catch {
      setMensagens([]);
    }
  };

  const abrirDetalhesTask = (task: Task) => {
    setSearchParams({ task: task.id });
  };

  const fecharDetalhes = () => {
    setTaskSelecionada(null);
    setMensagens([]);
    setSearchParams({ task: undefined });
  };

  // Reagir a alteracao na URL (?task=tsk-xxx)
  createEffect(() => {
    const taskId = searchParams.task as string | undefined;
    if (taskId) {
      const t = tasks().find((item) => item.id === taskId);
      if (t) {
        void carregarMsgsTask(t);
      } else {
        void fetchApi<Task>(`/tasks/${encodeURIComponent(taskId)}`).then((encontrada) => {
          if (encontrada) void carregarMsgsTask(encontrada);
        }).catch(() => {});
      }
    } else {
      setTaskSelecionada(null);
      setMensagens([]);
    }
  });

  const enviarComentario = async () => {
    const t = taskSelecionada();
    const texto = novoComentario().trim();
    if (!t || !texto) return;
    setEnviandoComentario(true);

    try {
      await fetchApi(`/tasks/${encodeURIComponent(t.id)}/mensagens`, {
        method: "POST",
        body: JSON.stringify({ corpo: texto, autor: "humano", tipo: "comentario" }),
      });
      setNovoComentario("");
      const msgs = await fetchApi<MensagemTask[]>(`/tasks/${encodeURIComponent(t.id)}/mensagens`).catch(() => []);
      setMensagens(msgs || []);
      showToast("Comentário registrado", "sucesso");
    } catch (err: any) {
      showToast(`Erro ao enviar comentário: ${err.message}`, "erro");
    } finally {
      setEnviandoComentario(false);
    }
  };

  const criarTask = async () => {
    const titulo = novoTitulo().trim();
    if (!titulo) {
      showToast("Título é obrigatório", "aviso");
      return;
    }

    try {
      await fetchApi("/tasks", {
        method: "POST",
        body: JSON.stringify({
          titulo,
          descricao: novaDescricao().trim(),
          coluna: novaColuna(),
          prioridade: novaPrioridade(),
          responsavel: novoResponsavel().trim() || undefined,
        }),
      });

      setNovoTitulo("");
      setNovaDescricao("");
      setModalCriacaoAberto(false);
      showToast("Tarefa criada com sucesso!", "sucesso");
      void carregarTasks();
    } catch (err: any) {
      showToast(`Erro ao criar tarefa: ${err.message}`, "erro");
    }
  };

  const moverTask = async (id: string, novaCol: Task["coluna"]) => {
    try {
      await fetchApi(`/tasks/${encodeURIComponent(id)}/move`, {
        method: "POST",
        body: JSON.stringify({ coluna: novaCol }),
      });
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, coluna: novaCol } : t)));
      if (taskSelecionada()?.id === id) {
        setTaskSelecionada((prev) => (prev ? { ...prev, coluna: novaCol } : null));
      }
      showToast(`Movido para ${novaCol}`, "info");
    } catch (err: any) {
      showToast(`Erro ao mover: ${err.message}`, "erro");
    }
  };

  const excluirTask = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir permanentemente esta tarefa?")) return;
    try {
      await fetchApi(`/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
      setTasks((prev) => prev.filter((t) => t.id !== id));
      if (taskSelecionada()?.id === id) fecharDetalhes();
      showToast("Tarefa excluída", "sucesso");
    } catch (err: any) {
      showToast(`Erro ao excluir: ${err.message}`, "erro");
    }
  };

  onMount(() => {
    void carregarTasks();
  });

  const colunas: Array<{ id: Task["coluna"]; nome: string; cor: string }> = [
    { id: "backlog", nome: "Backlog", cor: "border-zinc-700 text-zinc-300" },
    { id: "fazendo", nome: "Em Andamento", cor: "border-blue-500 text-blue-400" },
    { id: "bloqueado", nome: "Bloqueado", cor: "border-amber-500 text-amber-400" },
    { id: "feito", nome: "Concluído", cor: "border-emerald-500 text-emerald-400" },
  ];

  const tasksFiltradas = () => {
    return tasks().filter((t) => {
      const matchResp = filtroResponsavel() === "todos" || t.responsavel === filtroResponsavel();
      const matchBusca =
        !busca().trim() ||
        t.titulo.toLowerCase().includes(busca().toLowerCase()) ||
        (t.descricao && t.descricao.toLowerCase().includes(busca().toLowerCase()));
      return matchResp && matchBusca;
    });
  };

  return (
    <div class="flex flex-col h-full w-full overflow-hidden p-6 space-y-4 bg-zinc-950">
      {/* Topbar do Kanban */}
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-800">
        <div>
          <h1 class="text-xl font-bold text-zinc-100 tracking-tight">Quadro Kanban</h1>
          <p class="text-xs text-zinc-400">
            Gerencie tarefas, atribua agentes autônomos e acompanhe entregas.
          </p>
        </div>

        <div class="flex items-center gap-2.5 flex-wrap">
          {/* Busca */}
          <input
            type="text"
            placeholder="Buscar tarefas..."
            value={busca()}
            onInput={(e) => setBusca(e.currentTarget.value)}
            class="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 w-44"
          />

          {/* Filtro por Responsável */}
          <div class="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs">
            <Filter size={13} class="text-zinc-400" />
            <select
              class="bg-transparent text-xs text-zinc-300 focus:outline-none cursor-pointer"
              value={filtroResponsavel()}
              onChange={(e) => setFiltroResponsavel(e.currentTarget.value)}
            >
              <option value="todos" class="bg-zinc-900">Todos responsáveis</option>
              <For each={agentes()}>
                {(ag) => (
                  <option value={ag.id} class="bg-zinc-900">
                    @{ag.id}
                  </option>
                )}
              </For>
            </select>
          </div>

          <Button size="sm" variant="primary" onClick={() => setModalCriacaoAberto(true)}>
            <Plus size={14} class="mr-1" /> Nova Tarefa
          </Button>
        </div>
      </div>

      {/* Grid Kanban das 4 Colunas */}
      <div class="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4 min-h-0 overflow-x-auto pb-2">
        <For each={colunas}>
          {(col) => {
            const itens = () => tasksFiltradas().filter((t) => t.coluna === col.id);

            return (
              <div class="flex flex-col h-full bg-zinc-900/40 rounded-xl border border-zinc-800/80 p-3 min-w-[260px]">
                {/* Header da Coluna */}
                <div class={`flex items-center justify-between pb-2.5 mb-2.5 border-b-2 ${col.cor}`}>
                  <span class="text-xs font-bold tracking-tight">{col.nome}</span>
                  <span class="text-[11px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300">
                    {itens().length}
                  </span>
                </div>

                {/* Cards da Coluna */}
                <div class="flex-1 overflow-y-auto space-y-2.5 scrollbar-thin pr-1">
                  <For each={itens()}>
                    {(task) => (
                      <div
                        onClick={() => abrirDetalhesTask(task)}
                        class={`group p-3 rounded-lg border cursor-pointer transition-all shadow-xs flex flex-col gap-2 ${
                          taskSelecionada()?.id === task.id
                            ? "bg-zinc-800/90 border-emerald-500/80 ring-1 ring-emerald-500/40"
                            : "bg-zinc-900/90 border-zinc-800/90 hover:border-zinc-700"
                        }`}
                      >
                        <div class="flex items-start justify-between gap-2">
                          <span class="text-xs font-semibold text-zinc-100 leading-snug line-clamp-2">
                            {task.titulo}
                          </span>
                          <Show when={task.prioridade}>
                            <span
                              class={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0 ${
                                task.prioridade === "alta"
                                  ? "bg-rose-950 text-rose-300 border border-rose-800/80"
                                  : task.prioridade === "baixa"
                                  ? "bg-zinc-800 text-zinc-400"
                                  : "bg-amber-950 text-amber-300 border border-amber-800/80"
                              }`}
                            >
                              {task.prioridade}
                            </span>
                          </Show>
                        </div>

                        <Show when={task.descricao}>
                          <p class="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                            {task.descricao}
                          </p>
                        </Show>

                        {/* Metadados do Card */}
                        <div class="flex items-center justify-between pt-1 border-t border-zinc-800/60 text-[10px] text-zinc-500">
                          <Show when={task.responsavel} fallback={<span class="text-zinc-600">Sem agente</span>}>
                            <span class="text-emerald-400 font-mono font-medium truncate max-w-[120px]">
                              @{task.responsavel}
                            </span>
                          </Show>

                          <Show when={task.due}>
                            <span class="flex items-center gap-1 font-mono text-zinc-400">
                              <Calendar size={10} />
                              {new Date(task.due!).toLocaleDateString("pt-BR", { month: "short", day: "numeric" })}
                            </span>
                          </Show>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            );
          }}
        </For>
      </div>

      {/* Drawer Lateral de Detalhes da Task Selecionada */}
      <Show when={taskSelecionada()}>
        <div class="fixed inset-y-0 right-0 w-full sm:w-[460px] bg-zinc-950 border-l border-zinc-800 shadow-2xl z-40 flex flex-col">
          {/* Header do Drawer */}
          <div class="p-4 border-b border-zinc-800 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-xs font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
                {taskSelecionada()!.id}
              </span>
              <span class="text-xs text-zinc-400">Detalhes da Tarefa</span>
            </div>
            <IconButton size="xs" variant="ghost" onClick={fecharDetalhes} title="Fechar">
              <X size={16} />
            </IconButton>
          </div>

          {/* Conteúdo do Drawer */}
          <div class="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-thin">
            <div>
              <h2 class="text-base font-bold text-zinc-100 leading-snug">
                {taskSelecionada()!.titulo}
              </h2>
              <Show when={taskSelecionada()!.descricao}>
                <p class="text-xs text-zinc-400 mt-2 leading-relaxed whitespace-pre-wrap bg-zinc-900/50 p-3 rounded-lg border border-zinc-800/80">
                  {taskSelecionada()!.descricao}
                </p>
              </Show>
            </div>

            {/* Ações Rápidas de Mover Coluna */}
            <div class="p-3 rounded-lg bg-zinc-900/40 border border-zinc-800 space-y-2">
              <label class="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                Mover de Coluna
              </label>
              <div class="grid grid-cols-4 gap-1.5">
                <For each={colunas}>
                  {(col) => (
                    <button
                      onClick={() => moverTask(taskSelecionada()!.id, col.id)}
                      class={`px-2 py-1.5 rounded text-[11px] font-medium border text-center transition-all cursor-pointer ${
                        taskSelecionada()!.coluna === col.id
                          ? "bg-zinc-800 text-zinc-100 border-zinc-600 font-bold"
                          : "bg-zinc-950 text-zinc-400 border-zinc-800/80 hover:text-zinc-200"
                      }`}
                    >
                      {col.nome}
                    </button>
                  )}
                </For>
              </div>
            </div>

            {/* Metadados: Responsável e Prioridade */}
            <div class="grid grid-cols-2 gap-3 text-xs">
              <div class="p-3 rounded-lg bg-zinc-900/30 border border-zinc-800">
                <span class="text-zinc-500 block text-[10px] uppercase font-semibold mb-1">Responsável</span>
                <span class="font-mono text-emerald-400 font-semibold">
                  {taskSelecionada()!.responsavel ? `@${taskSelecionada()!.responsavel}` : "Nenhum"}
                </span>
              </div>

              <div class="p-3 rounded-lg bg-zinc-900/30 border border-zinc-800">
                <span class="text-zinc-500 block text-[10px] uppercase font-semibold mb-1">Prioridade</span>
                <span class="capitalize font-semibold text-zinc-200">
                  {taskSelecionada()!.prioridade || "Média"}
                </span>
              </div>
            </div>

            {/* Histórico de Comentários & Handoffs */}
            <div class="space-y-3 pt-2 border-t border-zinc-800">
              <h3 class="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <MessageSquare size={13} class="text-zinc-400" /> Histórico de Comentários & Handoffs
              </h3>

              <div class="space-y-2 max-h-64 overflow-y-auto scrollbar-thin pr-1">
                <For
                  each={mensagens()}
                  fallback={
                    <div class="text-[11px] text-zinc-500 py-3 text-center">
                      Nenhum comentário registrado ainda.
                    </div>
                  }
                >
                  {(m) => (
                    <div class="p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-xs space-y-1">
                      <div class="flex items-center justify-between text-[10px] text-zinc-500">
                        <span class="font-semibold text-zinc-300 font-mono">@{m.autor}</span>
                        <span>{new Date(m.criado_em).toLocaleTimeString("pt-BR")}</span>
                      </div>
                      <p class="text-zinc-300 leading-relaxed text-[11px] whitespace-pre-wrap">{m.corpo}</p>
                    </div>
                  )}
                </For>
              </div>

              {/* Adicionar Comentário */}
              <div class="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  placeholder="Escreva um comentário ou instrução..."
                  value={novoComentario()}
                  onInput={(e) => setNovoComentario(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === "Enter" && enviarComentario()}
                  class="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-zinc-700"
                />
                <Button size="xs" variant="primary" loading={enviandoComentario()} onClick={enviarComentario}>
                  <Send size={12} class="mr-1" /> Enviar
                </Button>
              </div>
            </div>
          </div>

          {/* Rodapé do Drawer */}
          <div class="p-3 border-t border-zinc-800 flex justify-between items-center bg-zinc-900/40">
            <IconButton
              size="sm"
              variant="danger"
              onClick={() => excluirTask(taskSelecionada()!.id)}
              title="Excluir tarefa"
            >
              <Trash2 size={14} class="mr-1" /> Excluir
            </IconButton>
            <Button size="xs" variant="secondary" onClick={fecharDetalhes}>
              Fechar
            </Button>
          </div>
        </div>
      </Show>

      {/* Modal de Criação de Tarefa */}
      <Show when={modalCriacaoAberto()}>
        <div class="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div class="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div class="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 class="text-sm font-bold text-zinc-100">Criar Nova Tarefa</h2>
              <IconButton size="xs" variant="ghost" onClick={() => setModalCriacaoAberto(false)}>
                <X size={16} />
              </IconButton>
            </div>

            <div class="space-y-3 text-xs">
              <div>
                <label class="block text-zinc-400 mb-1 font-medium">Título da Tarefa *</label>
                <input
                  type="text"
                  placeholder="Ex: Auditoria técnica do site"
                  value={novoTitulo()}
                  onInput={(e) => setNovoTitulo(e.currentTarget.value)}
                  class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-700"
                />
              </div>

              <div>
                <label class="block text-zinc-400 mb-1 font-medium">Descrição (Opcional)</label>
                <textarea
                  rows={3}
                  placeholder="Detalhes da entrega esperada..."
                  value={novaDescricao()}
                  onInput={(e) => setNovaDescricao(e.currentTarget.value)}
                  class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-700 resize-none"
                />
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-zinc-400 mb-1 font-medium">Coluna Inicial</label>
                  <select
                    value={novaColuna()}
                    onChange={(e) => setNovaColuna(e.currentTarget.value as any)}
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-2 text-zinc-200 focus:outline-none cursor-pointer"
                  >
                    <option value="backlog">Backlog</option>
                    <option value="fazendo">Em Andamento</option>
                    <option value="bloqueado">Bloqueado</option>
                    <option value="feito">Concluído</option>
                  </select>
                </div>

                <div>
                  <label class="block text-zinc-400 mb-1 font-medium">Prioridade</label>
                  <select
                    value={novaPrioridade()}
                    onChange={(e) => setNovaPrioridade(e.currentTarget.value as any)}
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-2 text-zinc-200 focus:outline-none cursor-pointer"
                  >
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                  </select>
                </div>
              </div>

              <div>
                <label class="block text-zinc-400 mb-1 font-medium">Agente Responsável</label>
                <select
                  value={novoResponsavel()}
                  onChange={(e) => setNovoResponsavel(e.currentTarget.value)}
                  class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-2 text-zinc-200 focus:outline-none cursor-pointer"
                >
                  <option value="">Sem responsável definido</option>
                  <For each={agentes()}>
                    {(ag) => <option value={ag.id}>@{ag.id}</option>}
                  </For>
                </select>
              </div>
            </div>

            <div class="pt-3 border-t border-zinc-800 flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setModalCriacaoAberto(false)}>
                Cancelar
              </Button>
              <Button size="sm" variant="primary" onClick={criarTask}>
                Criar Tarefa
              </Button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};
