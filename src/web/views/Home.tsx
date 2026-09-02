import { type Component, createSignal, onMount, onCleanup, For, Show } from "solid-js";
import {
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  Cpu,
  ArrowRight,
  Terminal,
  Activity,
  ShieldAlert,
  GitBranch,
  Calendar,
  Send,
  Plus,
  Play,
  RotateCcw,
  Check,
  X,
  Clock,
  Timer,
  ListTodo,
  Radio,
  ExternalLink,
} from "lucide-solid";
import { A, useNavigate } from "@solidjs/router";
import { fetchApi, wsAtivo } from "../lib/context";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { showToast } from "../ui/Toast";

function formatarContagem(ms: number): string {
  if (ms <= 0) return "agora / a qualquer instante";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  const p2 = (n: number): string => String(n).padStart(2, "0");
  if (d > 0) return `em ${d}d ${p2(h)}h ${p2(m)}m`;
  return `em ${p2(h)}:${p2(m)}:${p2(seg)}`;
}

function formatarDecorrido(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  const p2 = (n: number): string => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${p2(h)}:${p2(m)}:${p2(seg)}`;
  return `${p2(h)}:${p2(m)}:${p2(seg)}`;
}

export const HomeView: Component = () => {
  const navigate = useNavigate();
  const [agoraMs, setAgoraMs] = createSignal(Date.now());

  const [metricas, setMetricas] = createSignal<any>({
    custoHoje: "US$ 0.0000",
    custoTeto: "US$ 5.00",
    tasksPendentes: 0,
    tasksVencidas: 0,
    agentesAtivos: 0,
    fluxosAtivos: 0,
    schedulerOk: true,
    secretarioOk: true,
  });

  const [schedules, setSchedules] = createSignal<any[]>([]);
  const [aprovacoes, setAprovacoes] = createSignal<any[]>([]);
  const [atividades, setAtividades] = createSignal<any[]>([]);
  const [tasksEmAberto, setTasksEmAberto] = createSignal<any[]>([]);
  const [agentes, setAgentes] = createSignal<any[]>([]);

  // Linha de Comando Inline
  const [comando, setComando] = createSignal("");
  const [executandoComando, setExecutandoComando] = createSignal(false);
  const [saidaComando, setSaidaComando] = createSignal<string | null>(null);

  // Modal de Criação de Tarefa Direto na Home
  const [modalNovaTask, setModalNovaTask] = createSignal(false);
  const [novoTitulo, setNovoTitulo] = createSignal("");
  const [novaDescricao, setNovaDescricao] = createSignal("");
  const [novaPrioridade, setNovaPrioridade] = createSignal("media");
  const [novoResponsavel, setNovoResponsavel] = createSignal("");
  const [criandoTask, setCriandoTask] = createSignal(false);

  // Ticker de 1 segundo para contagem regressiva em tempo real
  let timerId: any = null;

  const carregarDadosHome = async () => {
    try {
      const [ledger, tasks, ags, flows, aprovs, budget, status, jobs] = await Promise.allSettled([
        fetchApi<any>("/ledger/resumo"),
        fetchApi<any[]>("/tasks"),
        fetchApi<any[]>("/agents"),
        fetchApi<any[]>("/flows"),
        fetchApi<any[]>("/approvals"),
        fetchApi<any>("/budget/status"),
        fetchApi<any>("/status"),
        fetchApi<any[]>("/schedules"),
      ]);

      const getVal = <T>(r: PromiseSettledResult<T>, def: T): T => (r.status === "fulfilled" ? r.value : def);

      const dLedger = getVal(ledger, null);
      const dTasks = getVal(tasks, []);
      const dAgentes = getVal(ags, []);
      const dFlows = getVal(flows, []);
      const dAprovs = getVal(aprovs, []);
      const dBudget = getVal(budget, null);
      const dStatus = getVal(status, null);
      const dJobs = getVal(jobs, []);

      setAgentes(dAgentes);
      setSchedules(dJobs);

      const hoje = new Date().toISOString().slice(0, 10);
      const vencidas = dTasks.filter(
        (t: any) => t.coluna !== "feito" && t.due && String(t.due).slice(0, 10) < hoje
      ).length;

      setMetricas({
        custoHoje: dBudget?.estado?.workspace_usd_hoje !== undefined
          ? `US$ ${Number(dBudget.estado.workspace_usd_hoje).toFixed(4)}`
          : dLedger?.total_custo_estimado
            ? `US$ ${Number(dLedger.total_custo_estimado).toFixed(4)}`
            : "US$ 0.0000",
        custoTeto: dBudget?.limites?.daily_usd ? `US$ ${Number(dBudget.limites.daily_usd).toFixed(2)}` : "US$ 5.00",
        tasksPendentes: dTasks.filter((t: any) => t.coluna !== "feito").length,
        tasksVencidas: vencidas,
        agentesAtivos: dAgentes.filter((a: any) => a.ativo !== false).length,
        fluxosAtivos: dFlows.length,
        schedulerOk: dStatus?.scheduler ?? true,
        secretarioOk: dStatus?.secretario ?? true,
      });

      // Aprovações pendentes
      setAprovacoes(dAprovs.filter((a: any) => a.status === "pendente"));

      // Tasks em aberto (máx 6)
      setTasksEmAberto(dTasks.filter((t: any) => t.coluna !== "feito").slice(0, 6));

      // Últimos runs
      const ultimos = dLedger?.ultimos_runs || [];
      setAtividades(ultimos.slice(0, 8));
    } catch {}
  };

  const enviarComando = async () => {
    const cmd = comando().trim();
    if (!cmd) return;
    setExecutandoComando(true);
    setSaidaComando(null);

    try {
      if (cmd.startsWith("!")) {
        const bashCmd = cmd.slice(1).trim();
        const res = await fetchApi<any>("/terminal/exec", {
          method: "POST",
          body: JSON.stringify({ comando: bashCmd }),
        });
        setSaidaComando(res?.saida || "Comando executado sem saída.");
        setComando("");
      } else {
        navigate(`/secretario?ordem=${encodeURIComponent(cmd)}`);
      }
    } catch (err: any) {
      setSaidaComando(`Erro: ${err.message}`);
    } finally {
      setExecutandoComando(false);
    }
  };

  const criarNovaTask = async () => {
    const titulo = novoTitulo().trim();
    if (!titulo) {
      showToast("Título é obrigatório", "aviso");
      return;
    }
    setCriandoTask(true);
    try {
      await fetchApi("/tasks", {
        method: "POST",
        body: JSON.stringify({
          titulo,
          descricao: novaDescricao().trim(),
          coluna: "backlog",
          prioridade: novaPrioridade(),
          responsavel: novoResponsavel().trim() || undefined,
        }),
      });

      setNovoTitulo("");
      setNovaDescricao("");
      setModalNovaTask(false);
      showToast("Tarefa criada com sucesso!", "sucesso");
      void carregarDadosHome();
    } catch (err: any) {
      showToast(`Erro ao criar tarefa: ${err.message}`, "erro");
    } finally {
      setCriandoTask(false);
    }
  };

  const responderAprovacao = async (id: string, aprovar: boolean) => {
    try {
      const endpoint = aprovar ? `/approvals/${id}/approve` : `/approvals/${id}/reject`;
      await fetchApi(endpoint, { method: "POST" });
      showToast(aprovar ? "Aprovação concedida com sucesso!" : "Ação rejeitada.", aprovar ? "sucesso" : "aviso");
      void carregarDadosHome();
    } catch (err: any) {
      showToast(`Erro ao responder aprovação: ${err.message}`, "erro");
    }
  };

  const dispararJobAgora = async (id: string) => {
    try {
      await fetchApi(`/schedules/${encodeURIComponent(id)}/run`, { method: "POST" });
      showToast("Execução manual disparada com sucesso!", "sucesso");
      void carregarDadosHome();
    } catch (err: any) {
      showToast(`Erro ao disparar job: ${err.message}`, "erro");
    }
  };

  const extrairAgenteJob = (args: any) => {
    if (Array.isArray(args) && args[0] === "agent" && args[1] === "run") {
      return args[2];
    }
    return "agente";
  };

  // Lista ordenada das próximas rotinas (com contagem regressiva ao vivo)
  const jobsASeguir = () => {
    const now = agoraMs();
    return schedules()
      .filter((j: any) => j.ativo !== false && j.proxima_exec)
      .map((j: any) => {
        const diff = new Date(j.proxima_exec).getTime() - now;
        return {
          ...j,
          diffMs: diff,
          agente: extrairAgenteJob(j.args),
        };
      })
      .filter((j: any) => j.diffMs > -1800000) // até 30min atrás
      .sort((a: any, b: any) => a.diffMs - b.diffMs);
  };

  const proximoImediato = () => {
    const lista = jobsASeguir();
    return lista.length > 0 ? lista[0] : null;
  };

  onMount(() => {
    void carregarDadosHome();
    // Inicia o timer que atualiza agoraMs a cada segundo
    timerId = setInterval(() => {
      setAgoraMs(Date.now());
    }, 1000);
  });

  onCleanup(() => {
    if (timerId) clearInterval(timerId);
  });

  return (
    <div class="h-full w-full overflow-y-auto p-6 space-y-6 scrollbar-thin bg-zinc-950">
      {/* Top Header com Ações Rápidas */}
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-xl font-bold text-zinc-100 tracking-tight">Painel de Operações</h1>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 border border-emerald-800/80 text-emerald-400">
              {wsAtivo() || "global"}
            </span>
          </div>
          <p class="text-xs text-zinc-400 mt-0.5">
            Visão geral da empresa, saúde dos agentes e controle em tempo real.
          </p>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          <Button size="xs" variant="primary" onClick={() => setModalNovaTask(true)}>
            <Plus size={13} class="mr-1" /> Nova Task
          </Button>
          <Button size="xs" variant="secondary" onClick={() => navigate("/secretario")}>
            <Play size={13} class="mr-1" /> Falar com Secretário
          </Button>
          <Button size="xs" variant="ghost" onClick={carregarDadosHome} title="Atualizar dados">
            <RotateCcw size={13} />
          </Button>
        </div>
      </div>

      {/* BANNER PRINCIPAL COM TIMER AO VIVO EM SEGUNDOS */}
      <Show when={proximoImediato()}>
        {(job) => {
          const diff = () => job().diffMs;
          const perto = () => diff() > 0 && diff() < 120000; // menos de 2 min

          return (
            <div
              class={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm ${
                perto()
                  ? "bg-gradient-to-r from-amber-950/50 via-zinc-900 to-zinc-900/80 border-amber-500/60 ring-1 ring-amber-500/30"
                  : "bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-zinc-900/60 border-emerald-500/30"
              }`}
            >
              <div class="flex items-center gap-3.5 min-w-0">
                <div
                  class={`h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    perto()
                      ? "bg-amber-500/20 border border-amber-500/40 text-amber-300"
                      : "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                  }`}
                >
                  <Timer size={22} class={perto() ? "animate-spin" : "animate-pulse"} />
                </div>

                <div class="min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span
                      class={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded font-mono ${
                        perto()
                          ? "bg-amber-500/30 text-amber-200 border border-amber-500/50 animate-pulse"
                          : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      }`}
                    >
                      Próxima Ronda Automática
                    </span>

                    {/* TIMER AO VIVO DE SEGUNDO A SEGUNDO */}
                    <span class="text-xs font-mono font-bold px-2 py-0.5 rounded bg-black/60 text-emerald-300 border border-zinc-800">
                      ⏱ {formatarContagem(diff())}
                    </span>
                  </div>

                  <div class="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span class="text-sm font-bold text-zinc-100 font-mono truncate">
                      {job().nome}
                    </span>
                    <span class="text-xs font-semibold text-emerald-400 font-mono">
                      @{job().agente}
                    </span>
                    <span class="text-[11px] text-zinc-400 font-mono">
                      · Programado para {new Date(job().proxima_exec).toLocaleTimeString("pt-BR")}
                    </span>
                  </div>
                </div>
              </div>

              <div class="flex items-center gap-2 flex-shrink-0 self-end sm:self-auto">
                <Button
                  size="xs"
                  variant="primary"
                  onClick={() => dispararJobAgora(job().id)}
                  title="Disparar este job agora sem esperar o horário"
                >
                  <Play size={12} class="mr-1 fill-current" /> Rodar Agora
                </Button>
                <A href="/agenda" class="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1">
                  Ver Agenda Completa →
                </A>
              </div>
            </div>
          );
        }}
      </Show>

      {/* 5 KPIs de Governança */}
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Custo do Dia */}
        <div class="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
          <div class="flex items-center justify-between text-zinc-400 mb-1.5">
            <span class="text-xs font-medium">Custo do Dia</span>
            <DollarSign size={15} class="text-emerald-400" />
          </div>
          <div class="text-xl font-bold text-zinc-100 font-mono">{metricas().custoHoje}</div>
          <div class="text-[10px] text-zinc-500 mt-1">Teto: {metricas().custoTeto}</div>
        </div>

        {/* Tasks em Aberto */}
        <div class="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
          <div class="flex items-center justify-between text-zinc-400 mb-1.5">
            <span class="text-xs font-medium">Tasks em Aberto</span>
            <CheckCircle2 size={15} class="text-blue-400" />
          </div>
          <div class="text-xl font-bold text-zinc-100">{metricas().tasksPendentes}</div>
          <div class="text-[10px] text-zinc-500 mt-1">
            <Show when={metricas().tasksVencidas > 0} fallback={<span>No prazo</span>}>
              <span class="text-rose-400 font-medium">{metricas().tasksVencidas} vencida(s)</span>
            </Show>
          </div>
        </div>

        {/* Agentes Ativos */}
        <div class="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
          <div class="flex items-center justify-between text-zinc-400 mb-1.5">
            <span class="text-xs font-medium">Agentes Prontos</span>
            <Cpu size={15} class="text-purple-400" />
          </div>
          <div class="text-xl font-bold text-zinc-100">{metricas().agentesAtivos}</div>
          <div class="text-[10px] text-zinc-500 mt-1">Catálogo operacional</div>
        </div>

        {/* Fluxos Ativos */}
        <div class="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
          <div class="flex items-center justify-between text-zinc-400 mb-1.5">
            <span class="text-xs font-medium">Fluxos Ativos</span>
            <GitBranch size={15} class="text-amber-400" />
          </div>
          <div class="text-xl font-bold text-zinc-100">{metricas().fluxosAtivos}</div>
          <div class="text-[10px] text-zinc-500 mt-1">Workflows em grafo</div>
        </div>

        {/* Saúde Operacional */}
        <div class="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
          <div class="flex items-center justify-between text-zinc-400 mb-1.5">
            <span class="text-xs font-medium">Saúde do Sistema</span>
            <Activity size={15} class="text-emerald-400" />
          </div>
          <div class="flex items-center gap-2 mt-1">
            <span class="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
              <span class="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Scheduler OK
            </span>
          </div>
          <div class="text-[10px] text-zinc-500 mt-1">Rondas 24h ativas</div>
        </div>
      </div>

      {/* Seção 2: Linha de Comando Rápida & Terminal Inline */}
      <div class="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-2">
        <div class="flex items-center justify-between">
          <label class="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
            <Terminal size={14} class="text-emerald-400" />
            Comando Rápido ao Secretário ou Terminal Inline
          </label>
          <span class="text-[10px] text-zinc-500">
            Dica: use <code>! comando</code> para rodar bash imediato (ex: <code>! curl ...</code>)
          </span>
        </div>
        <div class="flex items-center gap-2">
          <input
            type="text"
            value={comando()}
            onInput={(e) => setComando(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && enviarComando()}
            placeholder="Digite uma instrução para o Secretário ou ! comando no terminal..."
            class="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-700"
          />
          <Button size="sm" variant="primary" loading={executandoComando()} onClick={enviarComando}>
            <Send size={13} class="mr-1" /> Executar
          </Button>
        </div>

        <Show when={saidaComando()}>
          <div class="mt-2 p-3 rounded-lg bg-black/90 border border-zinc-800/80 text-xs font-mono text-zinc-300 whitespace-pre-wrap max-h-48 overflow-y-auto scrollbar-thin">
            {saidaComando()}
          </div>
        </Show>
      </div>

      {/* Seção 3: Grid de 2 Colunas - A Seguir (Cronômetros ao Vivo) & Feed de Execuções */}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Coluna 1: A Seguir (Próximas Rondas com Timer em Tempo Real) */}
        <div class="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-3">
          <div class="flex items-center justify-between border-b border-zinc-800/80 pb-2">
            <div class="flex items-center gap-2">
              <Clock size={16} class="text-emerald-400" />
              <h2 class="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                A Seguir · Rondas 24h Agendadas
              </h2>
            </div>
            <A href="/agenda" class="text-[11px] text-blue-400 hover:underline flex items-center gap-1">
              Ver todas ({schedules().length}) <ArrowRight size={10} />
            </A>
          </div>

          <div class="space-y-2 max-h-80 overflow-y-auto scrollbar-thin pr-1">
            <For
              each={jobsASeguir().slice(0, 5)}
              fallback={
                <div class="py-8 text-center text-xs text-zinc-500">
                  Nenhuma ronda com próxima execução programada.
                </div>
              }
            >
              {(j) => {
                const diff = () => new Date(j.proxima_exec).getTime() - agoraMs();
                const perto = () => diff() > 0 && diff() < 120000;

                return (
                  <div class="p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800 flex items-center justify-between gap-3 text-xs">
                    <div class="flex items-center gap-2.5 min-w-0">
                      <span class="h-2 w-2 rounded-full bg-emerald-400 flex-shrink-0" />
                      <div class="min-w-0">
                        <div class="font-semibold text-zinc-200 font-mono truncate">{j.nome}</div>
                        <div class="text-[10px] text-zinc-500">@{j.agente} · {j.agenda?.valor || "0 * * * *"}</div>
                      </div>
                    </div>

                    <div class="flex items-center gap-2 flex-shrink-0">
                      <span
                        class={`text-[11px] font-mono px-2 py-0.5 rounded font-bold ${
                          perto()
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse"
                            : "bg-zinc-900 text-emerald-400 border border-zinc-800"
                        }`}
                      >
                        {formatarContagem(diff())}
                      </span>
                      <IconButton
                        size="xs"
                        variant="ghost"
                        onClick={() => dispararJobAgora(j.id)}
                        title="Executar agora"
                      >
                        <Play size={11} class="fill-current" />
                      </IconButton>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </div>

        {/* Coluna 2: Feed de Atividades Recentes do Ledger */}
        <div class="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-3">
          <div class="flex items-center justify-between border-b border-zinc-800/80 pb-2">
            <div class="flex items-center gap-2">
              <Activity size={16} class="text-blue-400" />
              <h2 class="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                Feed de Execuções Recentes
              </h2>
            </div>
            <A href="/historico" class="text-[11px] text-blue-400 hover:underline flex items-center gap-1">
              Ver histórico <ArrowRight size={10} />
            </A>
          </div>

          <div class="space-y-2 max-h-80 overflow-y-auto scrollbar-thin pr-1">
            <For
              each={atividades()}
              fallback={
                <div class="py-8 text-center text-xs text-zinc-500">
                  Nenhuma atividade recente registrada neste workspace.
                </div>
              }
            >
              {(at) => (
                <div class="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80 flex items-center justify-between text-xs">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div
                      class={`h-2 w-2 rounded-full flex-shrink-0 ${
                        at.status === "concluido"
                          ? "bg-emerald-400"
                          : at.status === "falhou"
                          ? "bg-rose-400"
                          : at.status === "hitl_pendente"
                          ? "bg-amber-400 animate-pulse"
                          : "bg-blue-400"
                      }`}
                    />
                    <div class="min-w-0">
                      <div class="font-medium text-zinc-200 truncate">
                        @{at.agente || "agente"}
                      </div>
                      <div class="text-[10px] text-zinc-500 truncate">
                        {at.ordem ? at.ordem.slice(0, 48) + "..." : "Rotina periódica"}
                      </div>
                    </div>
                  </div>

                  <div class="text-right flex-shrink-0 text-[10px] text-zinc-400 font-mono">
                    <div>{at.duracao_ms ? `${(at.duracao_ms / 1000).toFixed(1)}s` : "—"}</div>
                    <div class="text-zinc-500">
                      {at.inicio ? new Date(at.inicio).toLocaleTimeString("pt-BR") : ""}
                    </div>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>

      {/* Seção 4: Tarefas Prioritárias em Aberto */}
      <div class="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-3">
        <div class="flex items-center justify-between border-b border-zinc-800/80 pb-2">
          <div class="flex items-center gap-2">
            <ListTodo size={16} class="text-purple-400" />
            <h2 class="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
              Tarefas Prioritárias em Aberto
            </h2>
          </div>
          <div class="flex items-center gap-2">
            <Button size="xs" variant="primary" onClick={() => setModalNovaTask(true)}>
              <Plus size={12} class="mr-1" /> Criar Task
            </Button>
            <A href="/tasks" class="text-[11px] text-blue-400 hover:underline flex items-center gap-1">
              Ver Kanban completo <ArrowRight size={10} />
            </A>
          </div>
        </div>

        <Show
          when={tasksEmAberto().length > 0}
          fallback={
            <div class="p-6 text-center text-xs text-zinc-500">
              Nenhuma tarefa em aberto no momento. Clique em "+ Nova Task" para adicionar.
            </div>
          }
        >
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <For each={tasksEmAberto()}>
              {(task) => (
                <div class="p-3 rounded-lg bg-zinc-950/80 border border-zinc-800 flex flex-col justify-between gap-2 shadow-xs">
                  <div class="space-y-1">
                    <div class="flex items-start justify-between gap-2">
                      <span class="text-xs font-semibold text-zinc-100 line-clamp-1">{task.titulo}</span>
                      <Show when={task.prioridade}>
                        <span
                          class={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0 ${
                            task.prioridade === "alta"
                              ? "bg-rose-950 text-rose-300 border border-rose-800/80"
                              : "bg-zinc-800 text-zinc-400"
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
                  </div>

                  <div class="flex items-center justify-between text-[10px] pt-1.5 border-t border-zinc-800/60 text-zinc-500 font-mono">
                    <span class="text-emerald-400">
                      {task.responsavel ? `@${task.responsavel}` : "Sem agente"}
                    </span>
                    <span class="capitalize px-1.5 py-0.2 rounded bg-zinc-900 border border-zinc-800">
                      {task.coluna}
                    </span>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>

      {/* Seção 5: Banner e Atalhos do Sistema */}
      <div class="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <A
          href="/agenda"
          class="p-3 rounded-lg bg-zinc-950/80 border border-zinc-800/60 hover:border-zinc-700 transition-colors flex items-center gap-3"
        >
          <Calendar size={18} class="text-amber-400" />
          <div>
            <div class="text-xs font-semibold text-zinc-200">Agenda 24h</div>
            <div class="text-[10px] text-zinc-500">Rondas periódicas</div>
          </div>
        </A>

        <A
          href="/fluxos"
          class="p-3 rounded-lg bg-zinc-950/80 border border-zinc-800/60 hover:border-zinc-700 transition-colors flex items-center gap-3"
        >
          <GitBranch size={18} class="text-blue-400" />
          <div>
            <div class="text-xs font-semibold text-zinc-200">Fluxos de Trabalho</div>
            <div class="text-[10px] text-zinc-500">Orquestrações em grafo</div>
          </div>
        </A>

        <A
          href="/apps"
          class="p-3 rounded-lg bg-zinc-950/80 border border-zinc-800/60 hover:border-zinc-700 transition-colors flex items-center gap-3"
        >
          <Terminal size={18} class="text-purple-400" />
          <div>
            <div class="text-xs font-semibold text-zinc-200">Apps & Secrets</div>
            <div class="text-[10px] text-zinc-500">Chaves e conexões</div>
          </div>
        </A>

        <A
          href="/config"
          class="p-3 rounded-lg bg-zinc-950/80 border border-zinc-800/60 hover:border-zinc-700 transition-colors flex items-center gap-3"
        >
          <ShieldAlert size={18} class="text-emerald-400" />
          <div>
            <div class="text-xs font-semibold text-zinc-200">Segurança & Regras</div>
            <div class="text-[10px] text-zinc-500">Permissões e políticas</div>
          </div>
        </A>
      </div>

      {/* Modal de Criação de Tarefa Rápida */}
      <Show when={modalNovaTask()}>
        <div class="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div class="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div class="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 class="text-sm font-bold text-zinc-100">Criar Nova Tarefa</h2>
              <IconButton size="xs" variant="ghost" onClick={() => setModalNovaTask(false)}>
                <X size={16} />
              </IconButton>
            </div>

            <div class="space-y-3 text-xs">
              <div>
                <label class="block text-zinc-400 mb-1 font-medium">Título da Tarefa *</label>
                <input
                  type="text"
                  placeholder="Ex: Auditoria editorial dos últimos artigos"
                  value={novoTitulo()}
                  onInput={(e) => setNovoTitulo(e.currentTarget.value)}
                  class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-700"
                />
              </div>

              <div>
                <label class="block text-zinc-400 mb-1 font-medium">Descrição (Opcional)</label>
                <textarea
                  rows={3}
                  placeholder="Detalhes da entrega..."
                  value={novaDescricao()}
                  onInput={(e) => setNovaDescricao(e.currentTarget.value)}
                  class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-700 resize-none"
                />
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-zinc-400 mb-1 font-medium">Prioridade</label>
                  <select
                    value={novaPrioridade()}
                    onChange={(e) => setNovaPrioridade(e.currentTarget.value)}
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-2 text-zinc-200 focus:outline-none cursor-pointer"
                  >
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                  </select>
                </div>

                <div>
                  <label class="block text-zinc-400 mb-1 font-medium">Responsável</label>
                  <select
                    value={novoResponsavel()}
                    onChange={(e) => setNovoResponsavel(e.currentTarget.value)}
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-2 text-zinc-200 focus:outline-none cursor-pointer"
                  >
                    <option value="">Sem responsável</option>
                    <For each={agentes()}>
                      {(ag) => <option value={ag.id}>@{ag.id}</option>}
                    </For>
                  </select>
                </div>
              </div>
            </div>

            <div class="pt-3 border-t border-zinc-800 flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setModalNovaTask(false)}>
                Cancelar
              </Button>
              <Button size="sm" variant="primary" loading={criandoTask()} onClick={criarNovaTask}>
                Criar Tarefa
              </Button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};
