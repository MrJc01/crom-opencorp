import { type Component, For, Show, createSignal, createMemo } from "solid-js";
import { Clock, Zap, Edit3, Trash2, ChevronDown, ChevronUp } from "lucide-solid";
import type { PromptFilaItem } from "./types";

export interface FollowupQueueDockProps {
  items: PromptFilaItem[];
  onAdiantar?: (id: string) => void;
  onEditar?: (id: string) => void;
  onRemover?: (id: string) => void;
}

export const FollowupQueueDock: Component<FollowupQueueDockProps> = (props) => {
  const [colapsado, setColapsado] = createSignal(false);
  const total = createMemo(() => props.items?.length || 0);

  return (
    <Show when={total() > 0}>
      <div
        data-testid="followup-queue-dock"
        class="w-full mb-2 rounded-xl border border-emerald-500/40 bg-zinc-900/95 backdrop-blur-md shadow-xl overflow-hidden transition-all duration-200"
      >
        {/* Cabeçalho da Fila com Contador e Alternador de Colapso */}
        <div
          class="flex items-center justify-between px-3 py-2 bg-emerald-950/30 hover:bg-emerald-950/50 cursor-pointer transition-colors border-b border-emerald-500/20 select-none"
          onClick={() => setColapsado((prev) => !prev)}
        >
          <div class="flex items-center gap-2 text-xs font-medium text-emerald-300">
            <span class="flex items-center justify-center w-5 h-5 rounded-md bg-emerald-500/20 text-emerald-300">
              <Clock size={13} class="animate-spin-slow" />
            </span>
            <span class="font-semibold tracking-wide">
              Fila de Espera
            </span>
            <span class="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-[11px] font-bold text-emerald-300 border border-emerald-500/30">
              {total()} {total() === 1 ? "prompt aguardando" : "prompts aguardando"}
            </span>
            <span class="hidden sm:inline text-[11px] text-zinc-400 font-normal">
              (executa automaticamente assim que a resposta atual terminar)
            </span>
          </div>

          <div class="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200">
            <span class="text-[11px] hidden md:inline">
              {colapsado() ? "Expandir" : "Recolher"}
            </span>
            <button
              type="button"
              class="p-0.5 text-zinc-400 hover:text-zinc-100 transition-transform"
              aria-label={colapsado() ? "Expandir fila" : "Recolher fila"}
            >
              <Show when={colapsado()} fallback={<ChevronUp size={14} />}>
                <ChevronDown size={14} />
              </Show>
            </button>
          </div>
        </div>

        {/* Lista de Prompts Enfileirados */}
        <Show when={!colapsado()}>
          <div class="p-2 space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin">
            <For each={props.items}>
              {(item, idx) => (
                <div
                  data-testid={`queue-item-${item.id}`}
                  class="flex items-center justify-between gap-2 p-2 rounded-lg bg-zinc-950/80 border border-zinc-800/80 hover:border-zinc-700/90 transition-all text-xs group"
                >
                  {/* Identificador & Texto do Prompt */}
                  <div class="flex items-center gap-2 min-w-0 flex-1">
                    <span class="flex-shrink-0 w-5 h-5 rounded-md bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center font-mono font-bold text-[10px] text-emerald-400">
                      #{idx() + 1}
                    </span>
                    <span
                      class="text-zinc-200 truncate select-text font-normal"
                      title={item.texto}
                    >
                      {item.texto}
                    </span>
                    <Show when={item.anexos && item.anexos.length > 0}>
                      <span class="flex-shrink-0 text-[10px] text-zinc-400 px-1 py-0.5 bg-zinc-800 rounded">
                        +{item.anexos!.length} anexo(s)
                      </span>
                    </Show>
                  </div>

                  {/* Ações Rápidas: Adiantar, Editar, Excluir */}
                  <div class="flex items-center gap-1 flex-shrink-0">
                    {/* Botão Adiantar (Executar Agora) */}
                    <Show when={props.onAdiantar}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          props.onAdiantar?.(item.id);
                        }}
                        class="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[11px] font-medium transition-colors cursor-pointer"
                        title="Adiantar: interrompe a resposta atual e executa este prompt imediatamente"
                      >
                        <Zap size={12} class="text-amber-400" />
                        <span class="hidden sm:inline">Adiantar</span>
                      </button>
                    </Show>

                    {/* Botão Editar */}
                    <Show when={props.onEditar}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          props.onEditar?.(item.id);
                        }}
                        class="p-1 rounded-md bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700/50 transition-colors cursor-pointer"
                        title="Editar prompt (remove da fila e devolve para o campo de digitação)"
                        aria-label="Editar prompt da fila"
                      >
                        <Edit3 size={12} />
                      </button>
                    </Show>

                    {/* Botão Excluir */}
                    <Show when={props.onRemover}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          props.onRemover?.(item.id);
                        }}
                        class="p-1 rounded-md bg-zinc-800/80 hover:bg-rose-900/40 text-zinc-400 hover:text-rose-300 border border-zinc-700/50 hover:border-rose-700/50 transition-colors cursor-pointer"
                        title="Excluir da fila"
                        aria-label="Excluir prompt da fila"
                      >
                        <Trash2 size={12} />
                      </button>
                    </Show>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  );
};
