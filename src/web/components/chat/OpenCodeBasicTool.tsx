import { type Component, createSignal, Show } from "solid-js";
import { ChevronDown, Terminal, CheckCircle2, AlertCircle, Copy, Check, Loader2 } from "lucide-solid";

export interface OpenCodeBasicToolProps {
  id?: string;
  titulo?: string;
  comando?: string;
  status?: "rodando" | "ok" | "erro" | "pendente";
  duracaoMs?: number;
  codigoSaida?: number;
  saida?: string;
  defaultOpen?: boolean;
}

export const OpenCodeBasicTool: Component<OpenCodeBasicToolProps> = (props) => {
  const [aberto, setAberto] = createSignal(props.defaultOpen ?? false);
  const [copiado, setCopiado] = createSignal(false);

  const copiarSaida = (e: MouseEvent) => {
    e.stopPropagation();
    if (!props.saida) return;
    navigator.clipboard?.writeText(props.saida);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const status = () => props.status || "ok";
  const temSaida = () => Boolean(props.saida && props.saida.trim().length > 0);

  return (
    <div class="w-full text-left py-0.5 text-xs select-none">
      <button
        type="button"
        onClick={() => {
          if (temSaida()) setAberto(!aberto());
        }}
        class={`inline-flex items-center gap-2 text-zinc-300 hover:text-zinc-100 transition-colors py-0.5 group text-left max-w-full ${
          temSaida() ? "cursor-pointer" : "cursor-default"
        }`}
      >
        <Show when={temSaida()}>
          <ChevronDown
            size={13}
            class={`text-zinc-500 group-hover:text-zinc-300 transition-transform duration-200 shrink-0 ${
              aberto() ? "" : "-rotate-90"
            }`}
          />
        </Show>

        <Terminal size={13} class="text-sky-400 shrink-0" />
        <span class="font-medium text-zinc-200 shrink-0">{props.titulo || "Shell"}</span>

        <Show when={props.comando}>
          <span class="text-zinc-500 shrink-0">·</span>
          <span class="text-zinc-400 font-mono text-[11px] truncate max-w-[260px] sm:max-w-[460px]">
            {props.comando}
          </span>
        </Show>

        <Show when={props.duracaoMs !== undefined}>
          <span class="shrink-0 text-[10px] text-zinc-500 font-mono">({props.duracaoMs}ms)</span>
        </Show>

        {/* Status Badge */}
        <Show when={status() === "rodando"}>
          <span class="shrink-0 text-[10px] text-sky-400 font-mono flex items-center gap-1">
            <Loader2 size={10} class="animate-spin text-sky-400" />
            executando
          </span>
        </Show>
        <Show when={status() === "ok"}>
          <span class="shrink-0 text-[10px] text-emerald-400 font-mono flex items-center gap-1">
            <CheckCircle2 size={10} />
            {props.codigoSaida !== undefined ? `exit ${props.codigoSaida}` : "ok"}
          </span>
        </Show>
        <Show when={status() === "erro"}>
          <span class="shrink-0 text-[10px] text-rose-400 font-mono flex items-center gap-1">
            <AlertCircle size={10} />
            {props.codigoSaida !== undefined ? `exit ${props.codigoSaida}` : "erro"}
          </span>
        </Show>
      </button>

      {/* Saída colapsável limpa estilo OpenCode */}
      <Show when={aberto() && temSaida()}>
        <div class="w-full text-left pt-1 pb-1 text-[11px] font-mono text-zinc-300 relative pl-5">
          <div class="flex items-center justify-between py-1 text-[10px] text-zinc-500 border-b border-zinc-800/60 mb-1.5">
            <span class="truncate text-zinc-400">$ {props.comando || props.titulo}</span>
            <button
              type="button"
              onClick={copiarSaida}
              class="flex items-center gap-1 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer shrink-0 ml-2"
              title="Copiar saída do comando"
            >
              <Show when={copiado()} fallback={<Copy size={11} />}>
                <Check size={11} class="text-emerald-400" />
              </Show>
              <span>{copiado() ? "copiado" : "copiar"}</span>
            </button>
          </div>

          <pre class="overflow-x-auto whitespace-pre-wrap break-all text-zinc-300 leading-relaxed max-h-72 overflow-y-auto scrollbar-thin">
            {props.saida}
          </pre>
        </div>
      </Show>
    </div>
  );
};
