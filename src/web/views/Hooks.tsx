import { type Component, createSignal, onMount, For } from "solid-js";
import { Webhook, Trash2 } from "lucide-solid";
import { IconButton } from "../ui/IconButton";
import { showToast } from "../ui/Toast";
import { fetchApi } from "../lib/context";

export const HooksView: Component = () => {
  const [hooks, setHooks] = createSignal<any[]>([]);

  const carregarHooks = async () => {
    try {
      const lista = await fetchApi<any[]>("/hooks");
      setHooks(lista || []);
    } catch {}
  };

  onMount(() => {
    void carregarHooks();
  });

  return (
    <div class="flex flex-col h-full p-6 space-y-4 overflow-y-auto scrollbar-thin">
      <div class="pb-2 border-b border-zinc-800">
        <h1 class="text-lg font-bold text-zinc-100 tracking-tight">Webhooks & Gatilhos</h1>
        <p class="text-xs text-zinc-400">Gatilhos orientados a eventos para disparar ações automáticas.</p>
      </div>

      <div class="space-y-3">
        <For
          each={hooks()}
          fallback={
            <div class="py-12 text-center text-xs text-zinc-500">
              Nenhum webhook cadastrado no momento.
            </div>
          }
        >
          {(h) => (
            <div class="p-4 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="h-8 w-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400">
                  <Webhook size={16} />
                </div>
                <div>
                  <div class="text-xs font-semibold text-zinc-100">{h.evento || "evento.custom"}</div>
                  <div class="text-[11px] text-zinc-400">Destino: {h.destino || "agente-orquestrador"}</div>
                </div>
              </div>
            </div>
          )}
        </For>
      </div>
    </div>
  );
};
