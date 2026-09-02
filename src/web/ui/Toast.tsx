import { createSignal, For, Show } from "solid-js";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-solid";

export interface ToastItem {
  id: string;
  mensagem: string;
  tipo: "sucesso" | "erro" | "aviso" | "info";
}

const [toasts, setToasts] = createSignal<ToastItem[]>([]);

export function showToast(mensagem: string, tipo: "sucesso" | "erro" | "aviso" | "info" = "info", duracao = 4000) {
  const id = Math.random().toString(36).slice(2, 9);
  setToasts((prev) => [...prev, { id, mensagem, tipo }]);
  setTimeout(() => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, duracao);
}

export function ToastContainer() {
  const fechar = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <div class="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full">
      <For each={toasts()}>
        {(t) => (
          <div
            class={`pointer-events-auto flex items-start gap-2.5 p-3 rounded-lg border shadow-xl text-xs backdrop-blur-md transition-all animate-in slide-in-from-bottom-2 ${
              t.tipo === "sucesso"
                ? "bg-emerald-950/80 border-emerald-800/80 text-emerald-200"
                : t.tipo === "erro"
                ? "bg-rose-950/80 border-rose-800/80 text-rose-200"
                : t.tipo === "aviso"
                ? "bg-amber-950/80 border-amber-800/80 text-amber-200"
                : "bg-zinc-900/90 border-zinc-800 text-zinc-200"
            }`}
          >
            <div class="flex-shrink-0 mt-0.5">
              <Show when={t.tipo === "sucesso"}><CheckCircle2 size={15} class="text-emerald-400" /></Show>
              <Show when={t.tipo === "erro"}><AlertCircle size={15} class="text-rose-400" /></Show>
              <Show when={t.tipo === "aviso"}><AlertCircle size={15} class="text-amber-400" /></Show>
              <Show when={t.tipo === "info"}><Info size={15} class="text-zinc-400" /></Show>
            </div>
            <div class="flex-1 font-medium leading-relaxed">{t.mensagem}</div>
            <button
              onClick={() => fechar(t.id)}
              class="opacity-60 hover:opacity-100 p-0.5 rounded hover:bg-white/10 transition-colors"
            >
              <X size={13} />
            </button>
          </div>
        )}
      </For>
    </div>
  );
}
