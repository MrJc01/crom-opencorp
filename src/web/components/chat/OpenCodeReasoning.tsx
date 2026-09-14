import { type Component, createSignal, Show, createEffect } from "solid-js";
import { ChevronDown, Brain } from "lucide-solid";
import { renderMarkdown } from "../../md.js";

export interface OpenCodeReasoningProps {
  id?: string;
  titulo?: string;
  texto: string;
  ativo?: boolean;
  duracao?: string;
  defaultOpen?: boolean;
}

export const OpenCodeReasoning: Component<OpenCodeReasoningProps> = (props) => {
  const [aberto, setAberto] = createSignal(props.defaultOpen ?? (props.ativo || false));
  let containerRef: HTMLDivElement | undefined;
  let usuarioRolouParaCima = false;

  const onScroll = () => {
    if (!containerRef) return;
    const distFim = containerRef.scrollHeight - containerRef.scrollTop - containerRef.clientHeight;
    usuarioRolouParaCima = distFim > 45;
  };

  createEffect(() => {
    const _t = props.texto;
    if (!containerRef) return;
    const scrollAnterior = containerRef.scrollTop;
    queueMicrotask(() => {
      if (!containerRef) return;
      if (!usuarioRolouParaCima) {
        containerRef.scrollTop = containerRef.scrollHeight;
      } else {
        containerRef.scrollTop = scrollAnterior;
      }
    });
  });

  return (
    <div class="w-full text-left py-0.5 text-xs select-none">
      <button
        type="button"
        onClick={() => setAberto(!aberto())}
        class="inline-flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer py-0.5 group text-left"
      >
        <ChevronDown
          size={13}
          class={`text-zinc-500 group-hover:text-zinc-300 transition-transform duration-200 ${
            aberto() ? "" : "-rotate-90"
          }`}
        />
        <span class="font-medium text-zinc-300 flex items-center gap-1.5">
          <span>{props.titulo || "Raciocínio"}</span>
          <Show when={props.duracao}>
            <span class="text-zinc-500 font-mono text-[11px]">({props.duracao})</span>
          </Show>
        </span>
        <span class="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
          <span class={`h-1.5 w-1.5 rounded-full ${props.ativo ? "bg-emerald-400 animate-pulse" : "bg-emerald-500/60"}`}></span>
          {props.ativo ? "refletindo…" : "concluído"}
        </span>
      </button>

      <Show when={aberto()}>
        <div
          ref={containerRef}
          onScroll={onScroll}
          class="w-full text-left pt-1.5 pb-2 text-[11px] font-mono text-zinc-400 leading-relaxed max-h-64 overflow-y-auto scrollbar-thin select-text pl-5 border-l border-zinc-800/60 ml-1.5 my-1"
          innerHTML={renderMarkdown(props.texto)}
        />
      </Show>
    </div>
  );
};
