import { type Component, createSignal, onMount, For, Show } from "solid-js";
import {
  Calendar,
  Plus,
  Trash2,
  Clock,
  Play,
  Pause,
  RefreshCw,
  X,
  Bot,
  AlertCircle,
  CheckCircle2,
  GitBranch,
  Users,
  Layers,
  Terminal,
  Activity,
} from "lucide-solid";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { showToast } from "../ui/Toast";
import { fetchApi } from "../lib/context";

export const AgendaView: Component = () => {
  const [agendamentos, setAgendamentos] = createSignal<any[]>([]);
  const [agentes, setAgentes] = createSignal<any[]>([]);
  const [fluxos, setFluxos] = createSignal<any[]>([]);
  const [modalAberto, setModalAberto] = createSignal(false);
  const [executandoJob, setExecutandoJob] = createSignal<string | null>(null);

  // Form de Novo Agendamento
  const [novoNome, setNovoNome] = createSignal("");
  const [novoCron, setNovoCron] = createSignal("0 * * * *");
  const [tipoAlvo, setTipoAlvo] = createSignal<"agente" | "flow" | "reuniao" | "task" | "doctor">("agente");
  const [salvando, setSalvando] = createSignal(false);

  // Campos específicos: Agente
  const [novoAgente, setNovoAgente] = createSignal("");
  const [novaOrdem, setNovaOrdem] = createSignal("");

  // Campos específicos: Flow
  const [novoFlowId, setNovoFlowId] = createSignal("");
  const [novaEntradaFlow, setNovaEntradaFlow] = createSignal("");

  // Campos específicos: Reunião
  const [novaPauta, setNovaPauta] = createSignal("");
  const [reuniaoAgentes, setReuniaoAgentes] = createSignal<string[]>([]);

  // Campos específicos: Task
  const [tasksExistentes, setTasksExistentes] = createSignal<any[]>([]);
  const [modoTask, setModoTask] = createSignal<"executar" | "criar">("executar");
  const [buscaTask, setBuscaTask] = createSignal("");
  const [taskSelecionada, setTaskSelecionada] = createSignal<any | null>(null);
  const [taskAgenteExecutor, setTaskAgenteExecutor] = createSignal("");
  const [taskTitulo, setTaskTitulo] = createSignal("");
  const [taskColuna, setTaskColuna] = createSignal("backlog");
  const [taskPrioridade, setTaskPrioridade] = createSignal("media");
  const [taskResponsavel, setTaskResponsavel] = createSignal("");

  const carregarAgenda = async () => {
    try {
      const [listaJobs, listaAgentes, listaFlows, listaTasks] = await Promise.all([
        fetchApi<any[]>("/schedules").catch(() => []),
        fetchApi<any[]>("/agents").catch(() => []),
        fetchApi<any[]>("/flows").catch(() => []),
        fetchApi<any[]>("/tasks").catch(() => []),
      ]);
      setAgendamentos(listaJobs || []);
      setAgentes(listaAgentes || []);
      setFluxos(listaFlows || []);
      setTasksExistentes(listaTasks || []);
      if (listaAgentes && listaAgentes.length > 0 && !novoAgente()) {
        setNovoAgente(listaAgentes[0].id);
      }
      if (listaAgentes && listaAgentes.length > 0 && !taskAgenteExecutor()) {
        setTaskAgenteExecutor(listaAgentes[0].id);
      }
      if (listaFlows && listaFlows.length > 0 && !novoFlowId()) {
        setNovoFlowId(listaFlows[0].id);
      }
    } catch {}
  };

  const toggleReuniaoAgente = (id: string) => {
    setReuniaoAgentes((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const criarAgendamento = async () => {
    const nome = novoNome().trim();
    const cron = novoCron().trim();

    if (!nome || !cron) {
      showToast("Preencha o nome do job e a expressão cron", "aviso");
      return;
    }

    let args: string[] = [];

    if (tipoAlvo() === "agente") {
      const agente = novoAgente().trim();
      const ordem = novaOrdem().trim();
      if (!agente || !ordem) {
        showToast("Selecione o agente e descreva a ordem", "aviso");
        return;
      }
      args = ["agent", "run", agente, ordem];
    } else if (tipoAlvo() === "flow") {
      const fId = novoFlowId().trim();
      if (!fId) {
        showToast("Selecione um fluxo para agendar", "aviso");
        return;
      }
      args = ["flow", "run", fId];
      if (novaEntradaFlow().trim()) {
        args.push("--entrada", novaEntradaFlow().trim());
      }
    } else if (tipoAlvo() === "reuniao") {
      const pauta = novaPauta().trim();
      if (!pauta) {
        showToast("Informe a pauta da reunião", "aviso");
        return;
      }
      args = ["meeting", "iniciar", "--pauta", pauta];
      if (reuniaoAgentes().length > 0) {
        args.push("--agentes", reuniaoAgentes().join(","));
      }
    } else if (tipoAlvo() === "task") {
      if (modoTask() === "executar") {
        const t = taskSelecionada();
        if (!t) {
          showToast("Selecione uma tarefa existente para agendar a execução", "aviso");
          return;
        }
        const ag = taskAgenteExecutor() || t.responsavel || (agentes()[0]?.id ?? "secretario-exec");
        const ordem = `Executar tarefa [${t.id}] "${t.titulo}": ${t.descricao || ""}`.trim();
        args = ["agent", "run", ag, "--ordem", ordem];
      } else {
        const tit = taskTitulo().trim();
        if (!tit) {
          showToast("Informe o título da tarefa recorrente", "aviso");
          return;
        }
        args = ["task", "create", "--titulo", tit, "--coluna", taskColuna(), "--prioridade", taskPrioridade()];
        if (taskResponsavel().trim()) {
          args.push("--responsavel", taskResponsavel().trim());
        }
      }
    } else if (tipoAlvo() === "doctor") {
      args = ["doctor"];
    }

    setSalvando(true);

    try {
      await fetchApi("/schedules", {
        method: "POST",
        body: JSON.stringify({
          nome,
          agenda: { tipo: "cron", valor: cron },
          args,
        }),
      });

      setNovoNome("");
      setNovaOrdem("");
      setNovaPauta("");
      setTaskTitulo("");
      setModalAberto(false);
      showToast("Agendamento criado com sucesso!", "sucesso");
      void carregarAgenda();
    } catch (err: any) {
      showToast(`Erro ao agendar: ${err.message}`, "erro");
    } finally {
      setSalvando(false);
    }
  };

  const alternarStatus = async (job: any) => {
    const novoAtivo = !job.ativo;
    try {
      await fetchApi(`/schedules/${encodeURIComponent(job.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ ativo: novoAtivo }),
      });
      setAgendamentos((prev) =>
        prev.map((j) => (j.id === job.id ? { ...j, ativo: novoAtivo } : j))
      );
      showToast(novoAtivo ? "Job retomado" : "Job pausado", "info");
    } catch (err: any) {
      showToast(`Erro ao alterar status: ${err.message}`, "erro");
    }
  };

  const rodarAgora = async (id: string) => {
    setExecutandoJob(id);
    try {
      await fetchApi(`/schedules/${encodeURIComponent(id)}/run`, { method: "POST" });
      showToast("Execução manual disparada com sucesso!", "sucesso");
      void carregarAgenda();
    } catch (err: any) {
      showToast(`Erro ao disparar: ${err.message}`, "erro");
    } finally {
      setExecutandoJob(null);
    }
  };

  const excluirAgendamento = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta rotina agendada?")) return;
    try {
      await fetchApi(`/schedules/${encodeURIComponent(id)}`, { method: "DELETE" });
      setAgendamentos((prev) => prev.filter((j) => j.id !== id));
      showToast("Agendamento removido", "sucesso");
    } catch (err: any) {
      showToast(`Erro ao excluir: ${err.message}`, "erro");
    }
  };

  onMount(() => {
    void carregarAgenda();
  });

  const parseJobInfo = (job: any) => {
    const args = Array.isArray(job.args) ? job.args : (job.args || "").split(" ");
    const comando = args[0] || "";

    if (comando === "flow") {
      return {
        tipo: "flow",
        badge: "FLUXO",
        corBadge: "bg-purple-950 text-purple-300 border-purple-800",
        icone: <GitBranch size={13} class="text-purple-400" />,
        alvo: args[2] || "fluxo",
        detalhe: args.slice(3).join(" "),
      };
    }
    if (comando === "meeting") {
      return {
        tipo: "reuniao",
        badge: "REUNIÃO",
        corBadge: "bg-blue-950 text-blue-300 border-blue-800",
        icone: <Users size={13} class="text-blue-400" />,
        alvo: "Conselho Executivo",
        detalhe: args.slice(2).join(" "),
      };
    }
    if (comando === "task") {
      return {
        tipo: "task",
        badge: "TASK",
        corBadge: "bg-amber-950 text-amber-300 border-amber-800",
        icone: <Layers size={13} class="text-amber-400" />,
        alvo: "Quadro Kanban",
        detalhe: args.slice(2).join(" "),
      };
    }
    if (comando === "doctor") {
      return {
        tipo: "doctor",
        badge: "DIAGNÓSTICO",
        corBadge: "bg-cyan-950 text-cyan-300 border-cyan-800",
        icone: <Activity size={13} class="text-cyan-400" />,
        alvo: "Saúde do Sistema",
        detalhe: "Auditoria contínua do ambiente",
      };
    }
    return {
      tipo: "agente",
      badge: "AGENTE",
      corBadge: "bg-emerald-950 text-emerald-300 border-emerald-800",
      icone: <Bot size={13} class="text-emerald-400" />,
      alvo: args[2] ? `@${args[2]}` : "@agente",
      detalhe: args.slice(3).join(" "),
    };
  };

  return (
    <div class="flex flex-col h-full w-full overflow-hidden p-6 space-y-4 bg-zinc-950">
      {/* Header */}
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-800">
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-xl font-bold text-zinc-100 tracking-tight">Agenda de Rotinas (24h)</h1>
            <span class="text-[11px] font-mono px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300">
              {agendamentos().filter((j) => j.ativo !== false).length} ativas de {agendamentos().length}
            </span>
          </div>
          <p class="text-xs text-zinc-400 mt-0.5">
            Cronogramas automáticos para disparar agentes, pipelines de fluxos, reuniões periódicas e criação de tarefas.
          </p>
        </div>

        <div class="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={carregarAgenda} title="Recarregar">
            <RefreshCw size={13} />
          </Button>
          <Button size="sm" variant="primary" onClick={() => setModalAberto(true)}>
            <Plus size={14} class="mr-1" /> Nova Ronda
          </Button>
        </div>
      </div>

      {/* Lista de Rotinas Agendadas */}
      <div class="flex-1 overflow-y-auto min-h-0 scrollbar-thin">
        <div class="space-y-3 pb-4">
          <For
            each={agendamentos()}
            fallback={
              <div class="py-16 text-center text-xs text-zinc-500">
                Nenhuma rotina agendada no momento. Clique em "+ Nova Ronda" para automatizar tarefas.
              </div>
            }
          >
            {(job) => {
              const ativo = job.ativo !== false;
              const cronStr =
                typeof job.agenda === "object" ? job.agenda.valor : job.cron || job.expressao || "0 * * * *";
              const info = parseJobInfo(job);

              return (
                <div
                  class={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all shadow-xs ${
                    ativo
                      ? "bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700"
                      : "bg-zinc-950/40 border-zinc-900 opacity-60 hover:opacity-80"
                  }`}
                >
                  <div class="space-y-1.5 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${info.corBadge}`}>
                        {info.badge}
                      </span>
                      <span class="text-xs font-bold text-zinc-100">{job.nome || job.id}</span>
                      <Show when={!ativo}>
                        <span class="px-1.5 py-0.2 rounded text-[9px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          PAUSADO
                        </span>
                      </Show>
                    </div>

                    <div class="flex items-center gap-2 text-xs text-zinc-300">
                      {info.icone}
                      <span class="font-semibold text-zinc-200">{info.alvo}</span>
                      <Show when={info.detalhe}>
                        <span class="text-zinc-500 truncate max-w-md font-mono text-[11px]">
                          · {info.detalhe}
                        </span>
                      </Show>
                    </div>

                    <div class="flex items-center gap-3 text-[11px] text-zinc-500 font-mono">
                      <div class="flex items-center gap-1">
                        <Clock size={11} class="text-zinc-400" />
                        <span>{cronStr}</span>
                      </div>
                      <Show when={job.ultima_exec}>
                        <span>
                          Última:{" "}
                          {new Date(job.ultima_exec).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </Show>
                    </div>
                  </div>

                  <div class="flex items-center gap-2 flex-shrink-0">
                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={() => alternarStatus(job)}
                      title={ativo ? "Pausar agendamento" : "Retomar agendamento"}
                    >
                      {ativo ? <Pause size={12} class="mr-1" /> : <Play size={12} class="mr-1" />}
                      {ativo ? "Pausar" : "Ativar"}
                    </Button>

                    <Button
                      size="xs"
                      variant="ghost"
                      loading={executandoJob() === job.id}
                      onClick={() => rodarAgora(job.id)}
                      title="Disparar uma execução manual agora"
                    >
                      <Play size={12} class="mr-1 fill-current" /> Rodar Agora
                    </Button>

                    <IconButton
                      size="xs"
                      variant="ghost"
                      class="text-zinc-500 hover:text-rose-400"
                      onClick={() => excluirAgendamento(job.id)}
                      title="Excluir rotina"
                    >
                      <Trash2 size={13} />
                    </IconButton>
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </div>

      {/* Modal Novo Agendamento Universal */}
      <Show when={modalAberto()}>
        <div class="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50" onClick={() => setModalAberto(false)}>
          <div class="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full p-5 space-y-4 max-h-[90vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div class="flex items-center justify-between border-b border-zinc-800 pb-3 flex-shrink-0">
              <h2 class="text-sm font-bold text-zinc-100">Novo Agendamento Periódico (Cron)</h2>
              <IconButton size="xs" variant="ghost" onClick={() => setModalAberto(false)}>
                <X size={16} />
              </IconButton>
            </div>

            <div class="space-y-3.5 text-xs overflow-y-auto pr-1 scrollbar-thin flex-1">
              <div>
                <label class="block text-zinc-400 mb-1 font-medium">Nome da Rotina *</label>
                <input
                  type="text"
                  placeholder="Ex: pulso-editorial-hora-a-hora ou sync-banco-dados"
                  value={novoNome()}
                  onInput={(e) => setNovoNome(e.currentTarget.value)}
                  class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono"
                />
              </div>

              <div>
                <label class="block text-zinc-400 mb-1 font-medium">Frequência (Expressão Cron) *</label>
                <input
                  type="text"
                  placeholder="0 * * * * (a cada hora), */15 * * * * (a cada 15 min)"
                  value={novoCron()}
                  onInput={(e) => setNovoCron(e.currentTarget.value)}
                  class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono"
                />
              </div>

              {/* Seletor de Tipo de Ação */}
              <div>
                <label class="block text-zinc-400 mb-1 font-medium">O que esta rotina deve executar? *</label>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setTipoAlvo("agente")}
                    class={`p-2 rounded-lg border text-center cursor-pointer transition-colors ${
                      tipoAlvo() === "agente"
                        ? "bg-emerald-950/60 border-emerald-500 text-emerald-200 font-bold"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <Bot size={14} class="mx-auto mb-1" />
                    <span class="text-[11px] block">Agente</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTipoAlvo("flow")}
                    class={`p-2 rounded-lg border text-center cursor-pointer transition-colors ${
                      tipoAlvo() === "flow"
                        ? "bg-purple-950/60 border-purple-500 text-purple-200 font-bold"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <GitBranch size={14} class="mx-auto mb-1" />
                    <span class="text-[11px] block">Fluxo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTipoAlvo("reuniao")}
                    class={`p-2 rounded-lg border text-center cursor-pointer transition-colors ${
                      tipoAlvo() === "reuniao"
                        ? "bg-blue-950/60 border-blue-500 text-blue-200 font-bold"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <Users size={14} class="mx-auto mb-1" />
                    <span class="text-[11px] block">Reunião</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTipoAlvo("task")}
                    class={`p-2 rounded-lg border text-center cursor-pointer transition-colors ${
                      tipoAlvo() === "task"
                        ? "bg-amber-950/60 border-amber-500 text-amber-200 font-bold"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <Layers size={14} class="mx-auto mb-1" />
                    <span class="text-[11px] block">Task</span>
                  </button>
                </div>
              </div>

              {/* Formulário Específico de Agente */}
              <Show when={tipoAlvo() === "agente"}>
                <div class="space-y-3 p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                  <div>
                    <label class="block text-zinc-400 mb-1 font-medium">Agente Executor</label>
                    <select
                      value={novoAgente()}
                      onChange={(e) => setNovoAgente(e.currentTarget.value)}
                      class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-zinc-200 focus:outline-none cursor-pointer"
                    >
                      <For each={agentes()}>
                        {(ag) => <option value={ag.id}>@{ag.id}</option>}
                      </For>
                    </select>
                  </div>

                  <div>
                    <label class="block text-zinc-400 mb-1 font-medium">Instrução / Ordem *</label>
                    <textarea
                      rows={3}
                      placeholder="Você é critico-site em ronda horária... (ordem a ser executada)"
                      value={novaOrdem()}
                      onInput={(e) => setNovaOrdem(e.currentTarget.value)}
                      class="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 focus:outline-none resize-none font-mono text-[11px]"
                    />
                  </div>
                </div>
              </Show>

              {/* Formulário Específico de Fluxo */}
              <Show when={tipoAlvo() === "flow"}>
                <div class="space-y-3 p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                  <div>
                    <label class="block text-zinc-400 mb-1 font-medium">Selecionar Fluxo de Trabalho *</label>
                    <select
                      value={novoFlowId()}
                      onChange={(e) => setNovoFlowId(e.currentTarget.value)}
                      class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-zinc-200 focus:outline-none cursor-pointer"
                    >
                      <For each={fluxos()}>
                        {(f) => <option value={f.id}>{f.nome || f.id}</option>}
                      </For>
                    </select>
                  </div>

                  <div>
                    <label class="block text-zinc-400 mb-1 font-medium">Entrada Inicial do Fluxo (Opcional)</label>
                    <textarea
                      rows={2}
                      placeholder="Parâmetros ou contexto passado para o primeiro nó do pipeline..."
                      value={novaEntradaFlow()}
                      onInput={(e) => setNovaEntradaFlow(e.currentTarget.value)}
                      class="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 focus:outline-none resize-none font-mono text-[11px]"
                    />
                  </div>
                </div>
              </Show>

              {/* Formulário Específico de Reunião */}
              <Show when={tipoAlvo() === "reuniao"}>
                <div class="space-y-3 p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                  <div>
                    <label class="block text-zinc-400 mb-1 font-medium">Pauta da Reunião Periódica *</label>
                    <textarea
                      rows={3}
                      placeholder="Ex: Alinhamento diário sobre métricas do site, novos leads e gargalos operacionais..."
                      value={novaPauta()}
                      onInput={(e) => setNovaPauta(e.currentTarget.value)}
                      class="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 focus:outline-none resize-none font-mono text-[11px]"
                    />
                  </div>

                  <div>
                    <label class="block text-zinc-400 mb-1 font-medium">Agentes Convocados</label>
                    <div class="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto scrollbar-thin p-1 bg-zinc-900 rounded border border-zinc-800">
                      <For each={agentes()}>
                        {(ag) => {
                          const marcado = () => reuniaoAgentes().includes(ag.id);
                          return (
                            <label class="flex items-center gap-2 p-1 text-[11px] text-zinc-300 cursor-pointer hover:bg-zinc-800/50 rounded">
                              <input
                                type="checkbox"
                                checked={marcado()}
                                onChange={() => toggleReuniaoAgente(ag.id)}
                                class="rounded bg-zinc-950 border-zinc-700"
                              />
                              <span class="truncate">@{ag.id}</span>
                            </label>
                          );
                        }}
                      </For>
                    </div>
                  </div>
                </div>
              </Show>

              {/* Formulário Específico de Task */}
              <Show when={tipoAlvo() === "task"}>
                <div class="space-y-3 p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                  {/* Tabs: Executar Existente vs Criar Nova */}
                  <div class="flex items-center gap-1.5 p-1 bg-zinc-900 rounded-lg border border-zinc-800 text-xs">
                    <button
                      type="button"
                      onClick={() => setModoTask("executar")}
                      class={`flex-1 py-1 px-2 rounded-md font-medium text-center transition-colors cursor-pointer ${
                        modoTask() === "executar"
                          ? "bg-zinc-800 text-amber-300 font-semibold shadow-xs"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      Executar Tarefa Existente
                    </button>
                    <button
                      type="button"
                      onClick={() => setModoTask("criar")}
                      class={`flex-1 py-1 px-2 rounded-md font-medium text-center transition-colors cursor-pointer ${
                        modoTask() === "criar"
                          ? "bg-zinc-800 text-amber-300 font-semibold shadow-xs"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      Criar Nova Tarefa Recorrente
                    </button>
                  </div>

                  {/* MODO: Executar Tarefa Existente */}
                  <Show when={modoTask() === "executar"}>
                    <div class="space-y-2">
                      <label class="block text-zinc-400 text-xs font-medium">
                        Pesquisar Tarefa pelo Nome ou Descrição *
                      </label>
                      <input
                        type="text"
                        placeholder="Digite para buscar tarefas existentes..."
                        value={buscaTask()}
                        onInput={(e) => setBuscaTask(e.currentTarget.value)}
                        class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-500 font-mono"
                      />

                      {/* Lista de Tarefas Encontradas */}
                      <div class="max-h-36 overflow-y-auto space-y-1.5 scrollbar-thin p-1">
                        <For
                          each={tasksExistentes().filter((t) => {
                            if (!buscaTask().trim()) return true;
                            const q = buscaTask().toLowerCase();
                            return (
                              (t.titulo && t.titulo.toLowerCase().includes(q)) ||
                              (t.descricao && t.descricao.toLowerCase().includes(q)) ||
                              (t.id && t.id.toLowerCase().includes(q))
                            );
                          })}
                          fallback={
                            <div class="text-[11px] text-zinc-500 py-3 text-center">
                              Nenhuma tarefa encontrada.
                            </div>
                          }
                        >
                          {(t) => {
                            const isSelecionada = () => taskSelecionada()?.id === t.id;
                            return (
                              <div
                                onClick={() => {
                                  setTaskSelecionada(t);
                                  if (t.responsavel) setTaskAgenteExecutor(t.responsavel);
                                  if (!novoNome()) setNovoNome(`exec-task-${t.id.toLowerCase()}`);
                                  showToast(`Tarefa "${t.titulo}" selecionada!`, "sucesso");
                                }}
                                class={`p-2 rounded-lg border cursor-pointer text-xs transition-colors flex items-center justify-between gap-2 ${
                                  isSelecionada()
                                    ? "bg-amber-950/40 border-amber-500 text-zinc-100"
                                    : "bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-300"
                                }`}
                              >
                                <div class="min-w-0">
                                  <div class="flex items-center gap-1.5">
                                    <span class="font-mono text-[10px] text-zinc-400">{t.id}</span>
                                    <span class="font-medium truncate">{t.titulo}</span>
                                  </div>
                                  <Show when={t.descricao}>
                                    <p class="text-[10px] text-zinc-400 truncate mt-0.5">{t.descricao}</p>
                                  </Show>
                                </div>
                                <span class={`text-[9px] font-mono px-1.5 py-0.5 rounded flex-shrink-0 ${
                                  t.coluna === "feito" ? "bg-emerald-950/60 text-emerald-400" :
                                  t.coluna === "fazendo" ? "bg-blue-950/60 text-blue-400" :
                                  t.coluna === "bloqueado" ? "bg-amber-950/60 text-amber-400" :
                                  "bg-zinc-800 text-zinc-400"
                                }`}>
                                  {t.coluna}
                                </span>
                              </div>
                            );
                          }}
                        </For>
                      </div>

                      {/* Tarefa Selecionada Card */}
                      <Show when={taskSelecionada()}>
                        <div class="p-2.5 rounded-lg bg-amber-950/20 border border-amber-500/40 text-xs space-y-1">
                          <span class="text-[10px] font-semibold text-amber-400 uppercase tracking-wider block">
                            Tarefa Selecionada para Execução
                          </span>
                          <div class="font-medium text-zinc-100">{taskSelecionada()!.titulo}</div>
                          <div class="text-[10px] text-zinc-400 font-mono">ID: {taskSelecionada()!.id}</div>
                        </div>
                      </Show>

                      {/* Agente Executor */}
                      <div>
                        <label class="block text-zinc-400 mb-1 text-xs font-medium">Agente Executor da Tarefa</label>
                        <select
                          value={taskAgenteExecutor()}
                          onChange={(e) => setTaskAgenteExecutor(e.currentTarget.value)}
                          class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-zinc-200 cursor-pointer"
                        >
                          <For each={agentes()}>
                            {(ag) => <option value={ag.id}>@{ag.id} ({ag.nome || ag.papel || "agente"})</option>}
                          </For>
                        </select>
                      </div>
                    </div>
                  </Show>

                  {/* MODO: Criar Nova Tarefa */}
                  <Show when={modoTask() === "criar"}>
                    <div class="space-y-3">
                      <div>
                        <label class="block text-zinc-400 mb-1 font-medium">Título da Tarefa Recorrente *</label>
                        <input
                          type="text"
                          placeholder="Ex: Auditoria semanal de SEO e links quebrados"
                          value={taskTitulo()}
                          onInput={(e) => setTaskTitulo(e.currentTarget.value)}
                          class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 font-mono text-xs"
                        />
                      </div>

                      <div class="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <label class="block text-zinc-400 mb-1 font-medium">Coluna Inicial</label>
                          <select
                            value={taskColuna()}
                            onChange={(e) => setTaskColuna(e.currentTarget.value)}
                            class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-zinc-200 cursor-pointer"
                          >
                            <option value="backlog">Backlog</option>
                            <option value="fazendo">Fazendo</option>
                          </select>
                        </div>

                        <div>
                          <label class="block text-zinc-400 mb-1 font-medium">Prioridade</label>
                          <select
                            value={taskPrioridade()}
                            onChange={(e) => setTaskPrioridade(e.currentTarget.value)}
                            class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-zinc-200 cursor-pointer"
                          >
                            <option value="baixa">Baixa</option>
                            <option value="media">Média</option>
                            <option value="alta">Alta</option>
                          </select>
                        </div>
                      </div>

                      <div class="text-xs">
                        <label class="block text-zinc-400 mb-1 font-medium">Responsável (Opcional)</label>
                        <select
                          value={taskResponsavel()}
                          onChange={(e) => setTaskResponsavel(e.currentTarget.value)}
                          class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-zinc-200 cursor-pointer"
                        >
                          <option value="">Sem responsável inicial</option>
                          <For each={agentes()}>
                            {(ag) => <option value={`agente:${ag.id}`}>@{ag.id}</option>}
                          </For>
                        </select>
                      </div>
                    </div>
                  </Show>
                </div>
              </Show>
            </div>

            <div class="pt-3 border-t border-zinc-800 flex justify-end gap-2 flex-shrink-0">
              <Button size="sm" variant="secondary" onClick={() => setModalAberto(false)}>
                Cancelar
              </Button>
              <Button size="sm" variant="primary" loading={salvando()} onClick={criarAgendamento}>
                Criar Agendamento
              </Button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};
