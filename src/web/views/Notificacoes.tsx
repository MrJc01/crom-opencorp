import { type Component, createSignal, onMount, For, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  RefreshCw,
  AlertCircle,
  Info,
  FileText,
  AlertTriangle,
  Filter,
} from "lucide-solid";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { showToast } from "../ui/Toast";
import { fetchApi, setBadgeNotificacoes } from "../lib/context";

export const NotificacoesView: Component = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [notificacoes, setNotificacoes] = createSignal<any[]>([]);
  const [carregando, setCarregando] = createSignal(false);

  const filtroAba = () => (searchParams.filtro as "todas" | "nao_lidas") || "todas";

  const carregarNotificacoes = async () => {
    setCarregando(true);
    try {
      const res = await fetchApi<any>("/notifications");
      const lista = res?.notificacoes || res?.itens || (Array.isArray(res) ? res : []);
      setNotificacoes(lista);
      const naoLidas = res?.resumo?.nao_lidas ?? lista.filter((n: any) => !n.lida).length;
      setBadgeNotificacoes(naoLidas);
    } catch (err: any) {
      showToast(`Erro ao carregar notificações: ${err.message}`, "erro");
    } finally {
      setCarregando(false);
    }
  };

  const marcarLida = async (id: string) => {
    try {
      await fetchApi(`/notifications/${encodeURIComponent(id)}/lida`, { method: "POST" });
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
      await fetchApi("/notifications/lidas", { method: "POST" });
      setNotificacoes((prev) => prev.map((n) => ({ ...n, lida: true })));
      setBadgeNotificacoes(0);
      showToast("Todas as notificações foram marcadas como lidas", "sucesso");
    } catch (err: any) {
      showToast(`Erro: ${err.message}`, "erro");
    }
  };

  const limparTodas = async () => {
    if (!confirm("Tem certeza que deseja apagar todas as notificações deste workspace?")) return;
    try {
      await fetchApi("/notifications", { method: "DELETE" });
      setNotificacoes([]);
      setBadgeNotificacoes(0);
      showToast("Central de notificações limpa", "sucesso");
    } catch (err: any) {
      showToast(`Erro ao limpar: ${err.message}`, "erro");
    }
  };

  onMount(() => {
    void carregarNotificacoes();
  });

  const naoLidasCount = () => notificacoes().filter((n) => !n.lida).length;

  const notificacoesFiltradas = () => {
    if (filtroAba() === "nao_lidas") {
      return notificacoes().filter((n) => !n.lida);
    }
    return notificacoes();
  };

  const iconePorTipo = (tipo: string) => {
    switch (tipo) {
      case "erro":
        return <AlertCircle size={17} class="text-rose-400 flex-shrink-0" />;
      case "aviso":
        return <AlertTriangle size={17} class="text-amber-400 flex-shrink-0" />;
      case "resumo":
        return <FileText size={17} class="text-emerald-400 flex-shrink-0" />;
      default:
        return <Info size={17} class="text-blue-400 flex-shrink-0" />;
    }
  };

  return (
    <div class="flex flex-col h-full w-full overflow-hidden p-6 space-y-4 bg-zinc-950">
      {/* Header */}
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-800">
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-xl font-bold text-zinc-100 tracking-tight">Central de Notificações</h1>
            <Show when={naoLidasCount() > 0}>
              <span class="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                {naoLidasCount()} pendente(s)
              </span>
            </Show>
          </div>
          <p class="text-xs text-zinc-400 mt-0.5">
            Alertas operacionais, conclusões de tarefas, entregas de curadoria e relatórios executivos.
          </p>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          {/* Tabs Filtro com URL State */}
          <div class="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 text-xs">
            <button
              onClick={() => setSearchParams({ filtro: "todas" })}
              class={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                filtroAba() === "todas" ? "bg-zinc-800 text-zinc-100 font-semibold" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Todas ({notificacoes().length})
            </button>
            <button
              onClick={() => setSearchParams({ filtro: "nao_lidas" })}
              class={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                filtroAba() === "nao_lidas" ? "bg-zinc-800 text-zinc-100 font-semibold" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Não lidas ({naoLidasCount()})
            </button>
          </div>

          <Button size="sm" variant="ghost" onClick={carregarNotificacoes} title="Recarregar">
            <RefreshCw size={13} class={carregando() ? "animate-spin" : ""} />
          </Button>

          <Button
            size="sm"
            variant="secondary"
            disabled={naoLidasCount() === 0}
            onClick={marcarTodasLidas}
            title="Marcar todas as mensagens como lidas"
          >
            <CheckCheck size={14} class="mr-1.5" /> Marcar lidas
          </Button>

          <IconButton
            size="sm"
            variant="ghost"
            class="text-zinc-500 hover:text-rose-400"
            disabled={notificacoes().length === 0}
            onClick={limparTodas}
            title="Limpar todas as notificações"
          >
            <Trash2 size={15} />
          </IconButton>
        </div>
      </div>

      {/* Lista de Notificações */}
      <div class="flex-1 overflow-y-auto min-h-0 scrollbar-thin">
        <div class="space-y-3 pb-4">
          <For
            each={notificacoesFiltradas()}
            fallback={
              <div class="py-16 text-center text-xs text-zinc-500">
                {filtroAba() === "nao_lidas"
                  ? "Parabéns! Todas as notificações foram visualizadas."
                  : "Nenhuma notificação registrada neste workspace."}
              </div>
            }
          >
            {(n) => {
              const naoLida = !n.lida;

              return (
                <div
                  class={`p-4 rounded-xl border flex items-start justify-between gap-4 transition-all shadow-xs ${
                    naoLida
                      ? "bg-zinc-900/90 border-emerald-500/30 hover:border-emerald-500/50"
                      : "bg-zinc-950/40 border-zinc-900 opacity-70 hover:opacity-90"
                  }`}
                >
                  <div class="flex items-start gap-3.5 min-w-0">
                    <div class="mt-0.5">{iconePorTipo(n.tipo)}</div>

                    <div class="space-y-1.5 min-w-0">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-bold text-xs text-zinc-100">{n.titulo}</span>
                        <Show when={naoLida}>
                          <span class="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        </Show>
                        <Show when={n.origem}>
                          <span class="text-[10px] text-zinc-500 font-mono">· {n.origem}</span>
                        </Show>
                      </div>

                      <p class="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap font-sans">
                        {n.corpo || n.mensagem || n.resumo}
                      </p>

                      <div class="text-[10px] text-zinc-500 font-mono">
                        {n.criado_em ? new Date(n.criado_em).toLocaleString("pt-BR") : ""}
                      </div>
                    </div>
                  </div>

                  <Show when={naoLida}>
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
              );
            }}
          </For>
        </div>
      </div>
    </div>
  );
};
