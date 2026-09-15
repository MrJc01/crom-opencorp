import { type Component, For, Show, Switch, Match, createSignal, createMemo } from "solid-js";
import { Terminal, ChevronDown, CheckCircle2, Copy, Check } from "lucide-solid";
import type { MessagePart } from "./types";

interface MessagePartsRendererProps {
  parts: MessagePart[];
  isPartExpanded?: (id: string) => boolean;
  onTogglePart?: (id: string) => void;
  styleMode?: "pure" | "executive" | "terminal" | "glass";
  mostrarPensamento?: boolean;
  mostrarAcoes?: boolean;
}

export const MessagePartsRenderer: Component<MessagePartsRendererProps> = (props) => {
  const [copiedId, setCopiedId] = createSignal<string | null>(null);
  const [manualOverrides, setManualOverrides] = createSignal<Record<string, boolean>>({});

  const handleCopy = (text: string, id: string, e: MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Identifica dinamicamente o último bloco recolhível (reasoning ou tool)
  const lastCollapsibleId = createMemo(() => {
    const collapsibles = props.parts.filter(
      (p) =>
        (p.type === "reasoning" && props.mostrarPensamento !== false) ||
        (p.type === "tool" && props.mostrarAcoes !== false)
    );
    if (collapsibles.length === 0) return null;
    return collapsibles[collapsibles.length - 1]!.id;
  });

  // Regra de collapse: aberto no último por padrão, fecha se não for mais o último
  const isPartExpanded = (id: string) => {
    const override = manualOverrides()[id];
    if (override !== undefined) {
      return override;
    }
    return id === lastCollapsibleId();
  };

  const handleToggle = (id: string) => {
    const current = isPartExpanded(id);
    setManualOverrides((prev) => ({
      ...prev,
      [id]: !current,
    }));
    props.onTogglePart?.(id);
  };

  return (
    <div class="flex flex-col gap-2 w-full text-left items-start">
      <For each={props.parts}>
        {(part) => (
          <Switch>
            {/* 1. Bloco de Pensamento (Reasoning) */}
            <Match when={part.type === "reasoning" && props.mostrarPensamento !== false && part}>
              {(reasoning) => {
                const isExpanded = () => isPartExpanded(reasoning().id);
                return (
                  <div class="w-full text-left py-0.5 text-xs select-none">
                    <button
                      type="button"
                      onClick={() => handleToggle(reasoning().id)}
                      class="inline-flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer py-0.5 group text-left"
                    >
                      <ChevronDown
                        size={13}
                        class={`text-zinc-500 group-hover:text-zinc-300 transition-transform duration-200 ${
                          isExpanded() ? "" : "-rotate-90"
                        }`}
                      />
                      <span class="font-medium text-zinc-300 flex items-center gap-1.5">
                        <span class={props.styleMode === "executive" ? "text-purple-400 font-semibold" : "text-zinc-300"}>
                          {reasoning().title || "Raciocínio"}
                        </span>
                        <Show when={reasoning().durationSeconds}>
                          <span class="text-zinc-500 font-mono text-[11px]">
                            ({reasoning().durationSeconds}s)
                          </span>
                        </Show>
                      </span>
                      <span class="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                        <span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                        {reasoning().completed ? "concluído" : "refletindo..."}
                      </span>
                    </button>

                    <Show when={isExpanded()}>
                      <div class="w-full text-left pt-1 pb-1 space-y-1 text-[11px] font-mono text-zinc-400 leading-relaxed animate-in fade-in duration-150">
                        <For each={reasoning().thoughts}>
                          {(thought) => (
                            <div class="flex items-start gap-2 text-left">
                              <span class="text-zinc-500 select-none">›</span>
                              <span class="whitespace-pre-wrap">{thought}</span>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>
                );
              }}
            </Match>

            {/* 2. Chamada de Ferramenta (Tool / Shell) */}
            <Match when={part.type === "tool" && props.mostrarAcoes !== false && part}>
              {(tool) => {
                const isExpanded = () => isPartExpanded(tool().id);
                const isCopied = () => copiedId() === tool().id;
                return (
                  <div class="w-full text-left py-0.5 text-xs select-none">
                    <button
                      type="button"
                      onClick={() => handleToggle(tool().id)}
                      class="inline-flex items-center gap-2 text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer py-0.5 group text-left max-w-full"
                    >
                      <ChevronDown
                        size={13}
                        class={`text-zinc-500 group-hover:text-zinc-300 transition-transform duration-200 shrink-0 ${
                          isExpanded() ? "" : "-rotate-90"
                        }`}
                      />
                      <Terminal size={13} class="text-sky-400 shrink-0" />
                      <span class="font-medium text-zinc-200 shrink-0">{tool().tool || "Shell"}</span>
                      <span class="text-zinc-500 shrink-0">·</span>
                      <span class="text-zinc-400 font-mono text-[11px] truncate max-w-[260px] sm:max-w-[460px]">
                        {tool().command}
                      </span>
                      <Show when={tool().durationMs}>
                        <span class="shrink-0 text-[10px] text-zinc-500 font-mono">({tool().durationMs}ms)</span>
                      </Show>
                      <span class="shrink-0 text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                        <CheckCircle2 size={10} />
                        exit {tool().exitCode ?? 0}
                      </span>
                    </button>

                    {/* Saída do comando (bash-output) */}
                    <Show when={isExpanded()}>
                      <div class="w-full text-left pt-1 pb-1 text-[11px] font-mono text-zinc-300 relative">
                        <div class="flex items-center justify-between py-1 text-[10px] text-zinc-500 border-b border-zinc-850/60 mb-1.5">
                          <span class="truncate text-zinc-400">$ {tool().command}</span>
                          <button
                            type="button"
                            onClick={(e) => handleCopy(tool().output, tool().id, e)}
                            class="flex items-center gap-1 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer shrink-0 ml-2"
                            title="Copiar saída do comando"
                          >
                            <Show when={isCopied()} fallback={<Copy size={11} />}>
                              <Check size={11} class="text-emerald-400" />
                            </Show>
                            <span>{isCopied() ? "Copiado!" : "Copiar"}</span>
                          </button>
                        </div>
                        <pre class="text-emerald-400/90 whitespace-pre-wrap leading-relaxed select-text font-mono text-left bg-transparent p-0 m-0 border-none">{tool().output}</pre>
                      </div>
                    </Show>
                  </div>
                );
              }}
            </Match>

            {/* 3. Texto / Resposta Intermediária ou Final */}
            <Match when={part.type === "text" && part}>
              {(text) => (
                <div class="w-full text-left text-sm text-zinc-200 leading-relaxed py-1 animate-in fade-in duration-200 whitespace-pre-wrap">
                  {text().content}
                </div>
              )}
            </Match>
          </Switch>
        )}
      </For>
    </div>
  );
};
export default MessagePartsRenderer;
