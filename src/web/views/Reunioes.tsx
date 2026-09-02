import { type Component, createSignal, onMount, For, Show } from "solid-js";
import { Users, Play, RefreshCw, X, FileText, CheckCircle2, MessageSquare } from "lucide-solid";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { showToast } from "../ui/Toast";
import { fetchApi } from "../lib/context";

export const ReunioesView: Component = () => {
  const [reunioes, setReunioes] = createSignal<any[]>([]);
  const [agentes, setAgentes] = createSignal<any[]>([]);
  const [modalConvocacao, setModalConvocacao] = createSignal(false);
  const [pauta, setPauta] = createSignal("");
  const [agentesSelecionados, setAgentesSelecionados] = createSignal<string[]>([]);
  const [iniciando, setIniciando] = createSignal(false);

  // Reunião em visualização
  const [reuniaoAtiva, setReuniaoAtiva] = createSignal<any | null>(null);

  const carregarReunioes = async () => {
    try {
      const [listaReunioes, listaAgentes] = await Promise.all([
        fetchApi<any[]>("/meetings").catch(() => []),
        fetchApi<any[]>("/agents").catch(() => []),
      ]);
      setReunioes(listaReunioes || []);
      setAgentes(listaAgentes || []);
    } catch {}
  };

  const toggleAgente = (id: string) => {
    setAgentesSelecionados((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const abrirSalaReuniao = async (id: string) => {
    try {
      const sala = await fetchApi<any>(`/meetings/${encodeURIComponent(id)}`);
      setReuniaoAtiva(sala);
    } catch (err: any) {
      showToast(`Erro ao abrir reunião: ${err.message}`, "erro");
    }
  };

  const iniciarReuniao = async () => {
    const p = pauta().trim();
    if (!p) {
      showToast("Pauta é obrigatória", "aviso");
      return;
    }
    setIniciando(true);
    try {
      const ags = agentesSelecionados().length > 0 ? agentesSelecionados().join(",") : undefined;
      await fetchApi("/meetings", {
        method: "POST",
        body: JSON.stringify({ pauta: p, agentes: ags }),
      });
      setPauta("");
      setAgentesSelecionados([]);
      setModalConvocacao(false);
      showToast("Reunião convocada com sucesso!", "sucesso");
      void carregarReunioes();
    } catch (err: any) {
      showToast(`Erro ao iniciar reunião: ${err.message}`, "erro");
    } finally {
      setIniciando(false);
    }
  };

  onMount(() => {
    void carregarReunioes();
  });

  return (
    <div class="flex flex-col h-full w-full overflow-hidden p-6 space-y-4 bg-zinc-950">
      {/* Header */}
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-800">
        <div>
          <h1 class="text-xl font-bold text-zinc-100 tracking-tight">Reuniões Multi-Agente</h1>
          <p class="text-xs text-zinc-400">
            Debates e deliberações autônomas com loop de consenso e atas executivas.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={carregarReunioes} title="Atualizar">
            <RefreshCw size={13} />
          </Button>
          <Button size="sm" variant="primary" onClick={() => setModalConvocacao(true)}>
            <Play size={12} class="mr-1.5 fill-current" /> Convocar Reunião
          </Button>
        </div>
      </div>

      {/* Lista de Reuniões */}
      <div class="flex-1 overflow-y-auto min-h-0 scrollbar-thin">
        <div class="space-y-3 pb-4">
          <For
            each={reunioes()}
            fallback={
              <div class="py-16 text-center text-xs text-zinc-500">
                Nenhuma reunião registrada ainda neste workspace. Clique em "Convocar Reunião" para iniciar.
              </div>
            }
          >
            {(r) => (
              <div
                onClick={() => abrirSalaReuniao(r.id)}
                class="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 cursor-pointer transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs"
              >
                <div class="space-y-1.5 min-w-0">
                  <div class="flex items-center gap-2">
                    <span
                      class={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold ${
                        r.status === "concluido"
                          ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800/60"
                          : r.status === "em_andamento"
                          ? "bg-blue-950/80 text-blue-400 border border-blue-800/60 animate-pulse"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {r.status || "registrada"}
                    </span>
                    <span class="text-xs font-mono text-zinc-500">{r.id}</span>
                  </div>
                  <h2 class="text-xs font-bold text-zinc-100 truncate">{r.pauta}</h2>
                  <div class="flex items-center gap-2 text-[11px] text-zinc-400">
                    <Users size={12} class="text-zinc-500" />
                    <span>
                      {Array.isArray(r.agentes) ? r.agentes.map((a: string) => `@${a}`).join(", ") : r.agentes || "Mesa completa"}
                    </span>
                  </div>
                </div>

                <div class="text-right flex-shrink-0 text-[11px] text-zinc-500 font-mono">
                  {r.inicio ? new Date(r.inicio).toLocaleDateString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}
                </div>
              </div>
            )}
          </For>
        </div>
      </div>

      {/* Modal Convocação */}
      <Show when={modalConvocacao()}>
        <div class="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div class="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div class="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 class="text-sm font-bold text-zinc-100">Convocar Reunião Multi-Agente</h2>
              <IconButton size="xs" variant="ghost" onClick={() => setModalConvocacao(false)}>
                <X size={16} />
              </IconButton>
            </div>

            <div class="space-y-3 text-xs">
              <div>
                <label class="block text-zinc-400 mb-1 font-medium">Pauta da Reunião *</label>
                <textarea
                  rows={3}
                  placeholder="Ex: Alinhar pauta editorial da semana e definir responsáveis pelas correções..."
                  value={pauta()}
                  onInput={(e) => setPauta(e.currentTarget.value)}
                  class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-200 focus:outline-none focus:border-zinc-700 resize-none"
                />
              </div>

              <div>
                <label class="block text-zinc-400 mb-1.5 font-medium">
                  Agentes Participantes (Deixe vazio para convocar todos os ativos)
                </label>
                <div class="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto scrollbar-thin p-1">
                  <For each={agentes()}>
                    {(ag) => {
                      const sel = () => agentesSelecionados().includes(ag.id);
                      return (
                        <div
                          onClick={() => toggleAgente(ag.id)}
                          class={`p-2 rounded-lg border text-left cursor-pointer transition-all flex items-center justify-between ${
                            sel()
                              ? "bg-emerald-950/40 border-emerald-500/80 text-emerald-200"
                              : "bg-zinc-950 border-zinc-800/80 text-zinc-400 hover:border-zinc-700"
                          }`}
                        >
                          <span class="truncate font-mono font-medium">@{ag.id}</span>
                          <Show when={sel()}>
                            <CheckCircle2 size={13} class="text-emerald-400 flex-shrink-0" />
                          </Show>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </div>
            </div>

            <div class="pt-3 border-t border-zinc-800 flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setModalConvocacao(false)}>
                Cancelar
              </Button>
              <Button size="sm" variant="primary" loading={iniciando()} onClick={iniciarReuniao}>
                Iniciar Debate
              </Button>
            </div>
          </div>
        </div>
      </Show>

      {/* Modal Sala de Reunião e Ata */}
      <Show when={reuniaoAtiva()}>
        <div class="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div class="bg-zinc-900 border border-zinc-800 rounded-xl max-w-2xl w-full p-5 space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
            <div class="flex items-center justify-between border-b border-zinc-800 pb-3 flex-shrink-0">
              <div>
                <h2 class="text-sm font-bold text-zinc-100 flex items-center gap-2">
                  <FileText size={16} class="text-emerald-400" />
                  Ata da Reunião: {reuniaoAtiva()!.id}
                </h2>
                <p class="text-xs text-zinc-400 mt-0.5">{reuniaoAtiva()!.pauta}</p>
              </div>
              <IconButton size="xs" variant="ghost" onClick={() => setReuniaoAtiva(null)}>
                <X size={16} />
              </IconButton>
            </div>

            <div class="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin text-xs">
              <div class="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                <span class="text-[10px] uppercase font-bold text-zinc-500 block mb-1">Status</span>
                <span class="font-semibold text-emerald-400">{reuniaoAtiva()!.status || "concluída"}</span>
              </div>

              <Show when={reuniaoAtiva()!.ata || reuniaoAtiva()!.resultado}>
                <div>
                  <span class="text-[10px] uppercase font-bold text-zinc-500 block mb-1">
                    Ata / Parecer Executivo
                  </span>
                  <pre class="bg-zinc-950 p-3 rounded-lg border border-zinc-800 text-[11px] font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed">
                    {reuniaoAtiva()!.ata || reuniaoAtiva()!.resultado}
                  </pre>
                </div>
              </Show>

              <Show when={Array.isArray(reuniaoAtiva()!.turnos)}>
                <div>
                  <span class="text-[10px] uppercase font-bold text-zinc-500 block mb-1">
                    Turnos de Intervenção
                  </span>
                  <div class="space-y-2">
                    <For each={reuniaoAtiva()!.turnos}>
                      {(t: any) => (
                        <div class="p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800 space-y-1">
                          <div class="font-semibold text-emerald-400 font-mono">@{t.agente}</div>
                          <p class="text-zinc-300 leading-relaxed">{t.fala || t.mensagem}</p>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </Show>
            </div>

            <div class="pt-3 border-t border-zinc-800 flex justify-end flex-shrink-0">
              <Button size="sm" variant="secondary" onClick={() => setReuniaoAtiva(null)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};
