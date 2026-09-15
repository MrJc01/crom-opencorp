import { type Component, createSignal, Show } from "solid-js";
import { Terminal, ChevronDown, CheckCircle2, AlertTriangle, Loader2, Copy, Check } from "lucide-solid";

export interface ToolExecutionCardProps {
  comando: string;
  ferramenta?: string;
  saida?: string;
  status?: "running" | "ok" | "erro";
  duracaoMs?: number;
  exitCode?: number;
  defaultExpanded?: boolean;
}

export const ToolExecutionCard: Component<ToolExecutionCardProps> = (props) => {
  const [expandido, setExpandido] = createSignal(props.defaultExpanded ?? false);
  const [copiado, setCopiado] = createSignal(false);

  const copiarSaida = (e: MouseEvent) => {
    e.stopPropagation();
    if (!props.saida) return;
    navigator.clipboard?.writeText(props.saida);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <div data-testid="tool-execution-card" class="w-full text-left py-0.5 text-xs select-none">
      <button
        type="button"
        onClick={() => setExpandido(!expandido())}
        class="inline-flex items-center gap-2 text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer py-0.5 group text-left max-w-full"
      >
        <ChevronDown
          size={13}
          class={`text-zinc-500 group-hover:text-zinc-300 transition-transform duration-200 shrink-0 ${
            expandido() ? "" : "-rotate-90"
          }`}
        />
        <Terminal size={13} class="text-sky-400 shrink-0" />
        <span class="font-medium text-zinc-200 shrink-0">{props.ferramenta || "Shell"}</span>
        <span class="text-zinc-500 shrink-0">·</span>
        <span class="text-zinc-400 font-mono text-[11px] truncate max-w-[260px] sm:max-w-[460px]">
          {props.comando}
        </span>

        <Show when={props.duracaoMs !== undefined}>
          <span class="shrink-0 text-[10px] text-zinc-500 font-mono">({props.duracaoMs}ms)</span>
        </Show>

        {/* Status Badge */}
        <Show when={props.status === "running"}>
          <span class="shrink-0 text-[10px] text-amber-400 font-mono flex items-center gap-1">
            <Loader2 size={10} class="animate-spin" />
            executando
          </span>
        </Show>
        <Show when={props.status === "erro"}>
          <span class="shrink-0 text-[10px] text-rose-400 font-mono flex items-center gap-1">
            <AlertTriangle size={10} />
            exit {props.exitCode ?? 1}
          </span>
        </Show>
        <Show when={props.status === "ok" || (!props.status && props.exitCode === 0)}>
          <span class="shrink-0 text-[10px] text-emerald-400 font-mono flex items-center gap-1">
            <CheckCircle2 size={10} />
            exit {props.exitCode ?? 0}
          </span>
        </Show>
      </button>

      {/* Saída colapsável */}
      <Show when={expandido() && props.saida}>
        <div class="w-full text-left pt-1 pb-1 text-[11px] font-mono text-zinc-300 relative border-l-2 border-sky-500/30 pl-3 my-1">
          <div class="flex items-center justify-between py-1 text-[10px] text-zinc-500 border-b border-zinc-800/60 mb-1.5">
            <span class="truncate text-zinc-400">$ {props.comando}</span>
            <button
              type="button"
              onClick={copiarSaida}
              class="flex items-center gap-1 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer shrink-0 ml-2"
              title="Copiar saída do comando"
            >
              <Show when={copiado()} fallback={<Copy size={11} />}>
                <Check size={11} class="text-emerald-400" />
              </Show>
              <span>{copiado() ? "Copiado!" : "Copiar"}</span>
            </button>
          </div>
          <pre class="text-emerald-400/90 whitespace-pre-wrap leading-relaxed select-text font-mono text-left bg-transparent p-0 m-0 border-none">{props.saida}</pre>
        </div>
      </Show>
    </div>
  );
};
export default ToolExecutionCard;
