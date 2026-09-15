import { type Component, createSignal, Show } from "solid-js";
import { ChevronDown, Brain } from "lucide-solid";

export interface ReasoningBlockProps {
  pensamento: string;
  duracaoSegundos?: number;
  concluido?: boolean;
  defaultExpanded?: boolean;
}

export const ReasoningBlock: Component<ReasoningBlockProps> = (props) => {
  const [expandido, setExpandido] = createSignal(props.defaultExpanded ?? false);

  return (
    <div data-testid="reasoning-block" class="w-full text-left py-1 text-xs select-none">
      <button
        type="button"
        onClick={() => setExpandido(!expandido())}
        class="inline-flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer py-0.5 group text-left"
      >
        <ChevronDown
          size={13}
          class={`text-zinc-500 group-hover:text-zinc-300 transition-transform duration-200 ${
            expandido() ? "" : "-rotate-90"
          }`}
        />
        <Brain size={13} class="text-purple-400 shrink-0" />
        <span class="font-medium text-zinc-300 flex items-center gap-1.5">
          <span>Raciocínio</span>
          <Show when={props.duracaoSegundos !== undefined}>
            <span class="text-zinc-500 font-mono text-[11px]">
              ({props.duracaoSegundos}s)
            </span>
          </Show>
        </span>
        <span class="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
          <span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
          {props.concluido !== false ? "concluído" : "refletindo..."}
        </span>
      </button>

      <Show when={expandido()}>
        <div class="w-full text-left pt-1 pb-1 space-y-1 text-[11px] font-mono text-zinc-400 leading-relaxed border-l-2 border-purple-500/30 pl-3 my-1 animate-in fade-in duration-150">
          <p class="whitespace-pre-wrap">{props.pensamento}</p>
        </div>
      </Show>
    </div>
  );
};
export default ReasoningBlock;
