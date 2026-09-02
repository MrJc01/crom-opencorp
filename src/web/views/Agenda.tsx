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
} from "lucide-solid";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { showToast } from "../ui/Toast";
import { fetchApi } from "../lib/context";

export const AgendaView: Component = () => {
  const [agendamentos, setAgendamentos] = createSignal<any[]>([]);
  const [agentes, setAgentes] = createSignal<any[]>([]);
  const [modalAberto, setModalAberto] = createSignal(false);
  const [executandoJob, setExecutandoJob] = createSignal<string | null>(null);

  // Form de Novo Agendamento
  const [novoNome, setNovoNome] = createSignal("");
  const [novoCron, setNovoCron] = createSignal("0 * * * *");
  const [novoAgente, setNovoAgente] = createSignal("");
  const [novaOrdem, setNovaOrdem] = createSignal("");
  const [salvando, setSalvando] = createSignal(false);

  const carregarAgenda = async () => {
    try {
      const [listaJobs, listaAgentes] = await Promise.all([
        fetchApi<any[]>("/schedules").catch(() => []),
        fetchApi<any[]>("/agents").catch(() => []),
      ]);
      setAgendamentos(listaJobs || []);
      setAgentes(listaAgentes || []);
    } catch {}
  };

  const criarAgendamento = async () => {
    const nome = novoNome().trim();
    const cron = novoCron().trim();
    const agente = novoAgente().trim();
    const ordem = novaOrdem().trim();

    if (!nome || !cron || !ordem) {
      showToast("Preencha nome, expressão cron e a ordem do job", "aviso");
      return;
    }
    setSalvando(true);

    try {
      await fetchApi("/schedules", {
        method: "POST",
        body: JSON.stringify({
          nome,
          agenda: { tipo: "cron", valor: cron },
          args: ["agent", "run", agente || "executor-padrao", ordem],
        }),
      });

      setNovoNome("");
      setNovaOrdem("");
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
      showToast(`Erro ao disparar job: ${err.message}`, "erro");
    } finally {
      setExecutandoJob(null);
    }
  };

  const excluirAgendamento = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este agendamento?")) return;
    try {
      await fetchApi(`/schedules/${encodeURIComponent(id)}`, { method: "DELETE" });
      setAgendamentos((prev) => prev.filter((a) => a.id !== id));
      showToast("Agendamento removido", "sucesso");
    } catch (err: any) {
      showToast(`Erro ao excluir: ${err.message}`, "erro");
    }
  };

  onMount(() => {
    void carregarAgenda();
  });

  const formatarArgs = (args: any) => {
    if (Array.isArray(args)) {
      if (args[0] === "agent" && args[1] === "run") {
        return { agente: args[2], ordem: args.slice(3).join(" ") };
      }
      return { agente: null, ordem: args.join(" ") };
    }
    return { agente: null, ordem: String(args || "") };
  };

  return (
    <div class="flex flex-col h-full w-full overflow-hidden p-6 space-y-4 bg-zinc-950">
      {/* Header */}
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-800">
        <div>
          <h1 class="text-xl font-bold text-zinc-100 tracking-tight">Agenda & Rondas 24h</h1>
          <p class="text-xs text-zinc-400">
            Cron jobs e rotinas periódicas executadas pelo scheduler autônomo.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={carregarAgenda} title="Recarregar">
            <RefreshCw size={13} />
          </Button>
          <Button size="sm" variant="primary" onClick={() => setModalAberto(true)}>
            <Plus size={14} class="mr-1" /> Novo Agendamento
          </Button>
        </div>
      </div>

      {/* Lista de Rotinas */}
      <div class="flex-1 overflow-y-auto min-h-0 scrollbar-thin">
        <div class="space-y-3 pb-4">
          <For
            each={agendamentos()}
            fallback={
              <div class="py-16 text-center text-xs text-zinc-500">
                Nenhum agendamento ativo no momento. Clique em "Novo Agendamento" para criar.
              </div>
            }
          >
            {(job) => {
              const parse = formatarArgs(job.args);
              const ativo = job.ativo !== false;

              return (
                <div
                  class={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs ${
                    ativo
                      ? "bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700"
                      : "bg-zinc-950/40 border-zinc-900 opacity-60"
                  }`}
                >
                  <div class="space-y-1.5 min-w-0">
                    <div class="flex items-center gap-2">
                      <span
                        class={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold ${
                          ativo
                            ? "bg-emerald-950 text-emerald-400 border border-emerald-800/80"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {ativo ? "Ativo 24h" : "Pausado"}
                      </span>
                      <span class="text-xs font-bold text-zinc-100">{job.nome}</span>
                      <span class="text-[11px] font-mono text-zinc-500">({job.id})</span>
                    </div>

                    <p class="text-xs text-zinc-300 font-mono text-[11px] line-clamp-2 bg-zinc-950/60 p-2 rounded border border-zinc-800/50">
                      {parse.ordem || "Sem comando definido"}
                    </p>

                    <div class="flex items-center gap-4 text-[10px] text-zinc-400">
                      <span class="flex items-center gap-1 font-mono text-amber-400">
                        <Clock size={11} />
                        {job.agenda_valor || job.agenda?.valor || "0 * * * *"}
                      </span>

                      <Show when={parse.agente}>
                        <span class="text-emerald-400 font-mono">@{parse.agente}</span>
                      </Show>

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

                  {/* Ações do Job */}
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
                      title="Excluir job"
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

      {/* Modal Novo Agendamento */}
      <Show when={modalAberto()}>
        <div class="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div class="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div class="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 class="text-sm font-bold text-zinc-100">Novo Agendamento Periódico</h2>
              <IconButton size="xs" variant="ghost" onClick={() => setModalAberto(false)}>
                <X size={16} />
              </IconButton>
            </div>

            <div class="space-y-3 text-xs">
              <div>
                <label class="block text-zinc-400 mb-1 font-medium">Nome do Job *</label>
                <input
                  type="text"
                  placeholder="Ex: ronda-saude-site"
                  value={novoNome()}
                  onInput={(e) => setNovoNome(e.currentTarget.value)}
                  class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono"
                />
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-zinc-400 mb-1 font-medium">Expressão Cron *</label>
                  <input
                    type="text"
                    placeholder="0 * * * * (a cada hora)"
                    value={novoCron()}
                    onInput={(e) => setNovoCron(e.currentTarget.value)}
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono"
                  />
                </div>

                <div>
                  <label class="block text-zinc-400 mb-1 font-medium">Agente Executor</label>
                  <select
                    value={novoAgente()}
                    onChange={(e) => setNovoAgente(e.currentTarget.value)}
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-2 text-zinc-200 focus:outline-none cursor-pointer"
                  >
                    <option value="">Selecione um agente</option>
                    <For each={agentes()}>
                      {(ag) => <option value={ag.id}>@{ag.id}</option>}
                    </For>
                  </select>
                </div>
              </div>

              <div>
                <label class="block text-zinc-400 mb-1 font-medium">Instrução / Ordem *</label>
                <textarea
                  rows={4}
                  placeholder="Você é critico-site em ronda horária... (ordem a ser executada)"
                  value={novaOrdem()}
                  onInput={(e) => setNovaOrdem(e.currentTarget.value)}
                  class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-200 focus:outline-none focus:border-zinc-700 resize-none font-mono"
                />
              </div>
            </div>

            <div class="pt-3 border-t border-zinc-800 flex justify-end gap-2">
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
