import { type Component, createSignal, onMount, For, Show } from "solid-js";
import { Bell, Check, CheckCheck, Trash2, RefreshCw, AlertCircle, Info } from "lucide-solid";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { showToast } from "../ui/Toast";
import { fetchApi, setBadgeNotificacoes } from "../lib/context";

export const NotificacoesView: Component = () => {
  const [notificacoes, setNotificacoes] = createSignal<any[]>([]);

  const carregarNotificacoes = async () => {
    try {
      const res = await fetchApi<any>("/notifications");
      const lista = Array.isArray(res) ? res : res?.itens || [];
      setNotificacoes(lista);
      const naoLidas = lista.filter((n: any) => !n.lida).length;
      setBadgeNotificacoes(naoLidas);
    } catch {}
  };

  const marcarLida = async (id: string) => {
    try {
      await fetchApi(`/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
      setNotificacoes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, lida: true } : n))
      );
      showToast("Notificação marcada como lida", "info");
      const naoLidas = notificacoes().filter((n: any) => !n.lida && n.id !== id).length;
      setBadgeNotificacoes(naoLidas);
    } catch (err: any) {
      showToast(`Erro ao atualizar: ${err.message}`, "erro");
    }
  };

  const marcarTodasLidas = async () => {
    try {
      await fetchApi("/notifications/read-all", { method: "POST" }).catch(() => {});
      setNotificacoes((prev) => prev.map((n) => ({ ...n, lida: true })));
      setBadgeNotificacoes(0);
      showToast("Todas as notificações marcadas como lidas", "sucesso");
    } catch (err: any) {
      showToast(`Erro: ${err.message}`, "erro");
    }
  };

  onMount(() => {
    void carregarNotificacoes();
  });

  const naoLidasCount = () => notificacoes().filter((n) => !n.lida).length;

  return (
    <div class="flex flex-col h-full w-full overflow-hidden p-6 space-y-4 bg-zinc-950">
      {/* Header */}
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-800">
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-xl font-bold text-zinc-100 tracking-tight">Central de Notificações</h1>
            <Show when={naoLidasCount() > 0}>
              <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                {naoLidasCount()} nova(s)
              </span>
            </Show>
          </div>
          <p class="text-xs text-zinc-400 mt-0.5">
            Alertas operacionais, conclusões de tarefas e avisos de governança.
          </p>
        </div>

        <div class="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={carregarNotificacoes} title="Recarregar">
            <RefreshCw size={13} />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={naoLidasCount() === 0}
            onClick={marcarTodasLidas}
          >
            <CheckCheck size={14} class="mr-1.5" /> Marcar todas como lidas
          </Button>
        </div>
      </div>

      {/* Lista de Notificações */}
      <div class="flex-1 overflow-y-auto min-h-0 scrollbar-thin">
        <div class="space-y-2.5 pb-4">
          <For
            each={notificacoes()}
            fallback={
              <div class="py-16 text-center text-xs text-zinc-500">
                Nenhuma notificação recebida até o momento.
              </div>
            }
          >
            {(n) => (
              <div
                class={`p-4 rounded-xl border flex items-start justify-between gap-4 transition-all shadow-xs ${
                  n.lida
                    ? "bg-zinc-950/40 border-zinc-900 opacity-60"
                    : "bg-zinc-900/80 border-zinc-800/90 hover:border-zinc-700"
                }`}
              >
                <div class="flex items-start gap-3 min-w-0">
                  <div class="mt-0.5 flex-shrink-0">
                    {n.tipo === "erro" ? (
                      <AlertCircle size={16} class="text-rose-400" />
                    ) : (
                      <Info size={16} class="text-blue-400" />
                    )}
                  </div>
                  <div class="space-y-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="font-semibold text-xs text-zinc-100">
                        {n.titulo || n.resumo || "Alerta do Sistema"}
                      </span>
                      <Show when={n.agente}>
                        <span class="text-[10px] text-emerald-400 font-mono">@{n.agente}</span>
                      </Show>
                    </div>
                    <p class="text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap">
                      {n.mensagem || n.corpo || n.resumo}
                    </p>
                    <span class="text-[10px] text-zinc-500 font-mono block">
                      {n.criado_em ? new Date(n.criado_em).toLocaleString("pt-BR") : ""}
                    </span>
                  </div>
                </div>

                <Show when={!n.lida}>
                  <Button
                    size="xs"
                    variant="ghost"
                    class="text-zinc-400 hover:text-emerald-400 flex-shrink-0"
                    onClick={() => marcarLida(n.id)}
                    title="Marcar como lida"
                  >
                    <Check size={13} class="mr-1" /> Lido
                  </Button>
                </Show>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
};
