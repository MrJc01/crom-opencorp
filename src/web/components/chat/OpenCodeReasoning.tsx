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

  const tamanhoFmt = () => {
    const len = props.texto?.length || 0;
    if (len === 0) return "";
    return len >= 1000 ? `${(len / 1000).toFixed(1)}k chars` : `${len} chars`;
  };

  return (
    <div class="w-full text-left py-0.5 text-xs select-none">
      <button
        type="button"
        onClick={() => setAberto(!aberto())}
        class="inline-flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer py-1 px-1.5 -ml-1.5 rounded-lg hover:bg-zinc-900/60 group text-left"
        title={aberto() ? "Recolher raciocínio" : "Expandir raciocínio"}
      >
        <ChevronDown
          size={13}
          class={`text-zinc-500 group-hover:text-zinc-300 transition-transform duration-250 ease-out ${
            aberto() ? "" : "-rotate-90"
          }`}
        />
        <span class="font-medium text-zinc-300 flex items-center gap-1.5">
          <span>{props.titulo || "Raciocínio"}</span>
          <Show when={props.duracao}>
            <span class="text-zinc-500 font-mono text-[11px]">({props.duracao})</span>
          </Show>
          <Show when={tamanhoFmt()}>
            <span class="px-1.5 py-0.2 rounded-md bg-zinc-800/80 text-zinc-400 font-mono text-[10px]">
              {tamanhoFmt()}
            </span>
          </Show>
        </span>
        <span class="text-[10px] text-emerald-400 font-mono flex items-center gap-1 ml-1">
          <span class={`h-1.5 w-1.5 rounded-full ${props.ativo ? "bg-emerald-400 animate-pulse" : "bg-emerald-500/60"}`}></span>
          {props.ativo ? "refletindo…" : "concluído"}
        </span>
      </button>

      {/* Container com animação fluida de expansão/recolhimento */}
      <div class={`chat-reasoning-accordion ${aberto() ? "aberto" : "fechado"}`}>
        <div
          ref={containerRef}
          onScroll={onScroll}
          class="w-full text-left pt-1.5 pb-2 text-[11px] font-mono text-zinc-400 leading-relaxed max-h-64 overflow-y-auto scrollbar-thin select-text pl-5 border-l-2 border-purple-800/40 ml-1.5 my-1 bg-zinc-950/30 rounded-r-lg"
          innerHTML={renderMarkdown(props.texto)}
        />
      </div>
    </div>
  );
};
