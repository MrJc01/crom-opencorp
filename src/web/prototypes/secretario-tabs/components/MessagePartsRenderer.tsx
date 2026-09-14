import { type Component, For, Show, Switch, Match, createSignal } from "solid-js";
import { Terminal, ChevronDown, CheckCircle2, Copy, Check, Sparkles } from "lucide-solid";
import type { MessagePart } from "../types";

interface MessagePartsRendererProps {
  parts: MessagePart[];
  isPartExpanded: (id: string) => boolean;
  onTogglePart: (id: string) => void;
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
    // Apenas o último bloco fica aberto; se não for o último, fecha automaticamente
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
            {/* 1. Bloco de Pensamento (Reasoning) — Sem borda, sem fundo, 100% alinhado à esquerda */}
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
                          {reasoning().title}
                        </span>
                        <span class="text-zinc-500 font-mono text-[11px]">
                          ({reasoning().durationSeconds}s)
                        </span>
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
                              <span>{thought}</span>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>
                );
              }}
            </Match>

            {/* 2. Chamada de Ferramenta (Tool / Shell) — Sem bordas, sem fundo, 100% alinhado à esquerda */}
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
                      <span class="font-medium text-zinc-200 shrink-0">Shell</span>
                      <span class="text-zinc-500 shrink-0">·</span>
                      <span class="text-zinc-400 font-mono text-[11px] truncate max-w-[260px] sm:max-w-[460px]">
                        {tool().command}
                      </span>
                      <span class="shrink-0 text-[10px] text-zinc-500 font-mono">({tool().durationMs}ms)</span>
                      <span class="shrink-0 text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                        <CheckCircle2 size={10} />
                        exit {tool().exitCode}
                      </span>
                    </button>

                    {/* Saída do comando (bash-output) — Sem fundo cinza/preto, sem borda de cartão, alinhado à esquerda */}
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

            {/* 3. Texto / Resposta Intermediária ou Final — Sem bordas, sem fundo, alinhado à esquerda */}
            <Match when={part.type === "text" && part}>
              {(text) => (
                <div class="w-full text-left text-sm text-zinc-200 leading-relaxed py-1 animate-in fade-in duration-200">
                  <Show
                    when={text().content.includes("###")}
                    fallback={
                      /* Resposta curta intermediária */
                      <p class="text-zinc-300 text-xs sm:text-sm font-sans flex items-center gap-2 text-left">
                        <span class="h-1.5 w-1.5 rounded-full bg-sky-400 shrink-0 animate-pulse"></span>
                        <span>{text().content}</span>
                      </p>
                    }
                  >
                    {/* Resposta final estruturada com tabela */}
                    <div class="prose prose-invert max-w-none text-xs sm:text-sm space-y-2.5 font-sans text-left">
                      <h4 class="text-sm sm:text-base font-semibold text-zinc-100 border-b border-zinc-800/80 pb-2 text-left">
                        📊 Boletim Diário de Transmissões — YouTube Factory
                      </h4>
                      <p class="text-zinc-300 text-xs text-left">
                        Analisei as transmissões de hoje em todos os 28 canais do workspace <code class="px-1.5 py-0.5 rounded bg-zinc-850 text-emerald-400 text-xs font-mono">yt-factory-01</code>. Foram consolidadas <strong>18 lives ativas</strong> e <strong>10 transmissões agendadas</strong> para o horário nobre.
                      </p>

                      <div class="overflow-x-auto my-2 text-left">
                        <table class="w-full text-left text-xs border-collapse font-sans">
                          <thead>
                            <tr class="border-b border-zinc-700 text-zinc-400 font-mono text-[11px]">
                              <th class="py-2 pr-3 text-left">Canal / Stream</th>
                              <th class="py-2 px-2 text-center">Status</th>
                              <th class="py-2 px-2 text-right">Espectadores</th>
                              <th class="py-2 pl-3 text-left">Tópico Principal</th>
                            </tr>
                          </thead>
                          <tbody class="divide-y divide-zinc-800 text-zinc-300 text-xs">
                            <tr>
                              <td class="py-2 pr-3 font-semibold text-zinc-100 text-left">Radar Tech & IA</td>
                              <td class="py-2 px-2 text-center text-rose-400 font-mono text-[11px]">🔴 Ao vivo</td>
                              <td class="py-2 px-2 text-right font-mono font-bold text-emerald-400">12.480</td>
                              <td class="py-2 pl-3 text-zinc-400 text-left">Modelos Open-Source & Arquitetura OpenCode</td>
                            </tr>
                            <tr>
                              <td class="py-2 pr-3 font-semibold text-zinc-100 text-left">Mercado & Finanças 24h</td>
                              <td class="py-2 px-2 text-center text-rose-400 font-mono text-[11px]">🔴 Ao vivo</td>
                              <td class="py-2 px-2 text-right font-mono font-bold text-emerald-400">8.920</td>
                              <td class="py-2 pl-3 text-zinc-400 text-left">Abertura dos Mercados & Tendências Macro</td>
                            </tr>
                            <tr>
                              <td class="py-2 pr-3 font-semibold text-zinc-100 text-left">Fábrica de Notícias</td>
                              <td class="py-2 px-2 text-center text-rose-400 font-mono text-[11px]">🔴 Ao vivo</td>
                              <td class="py-2 px-2 text-right font-mono font-bold text-emerald-400">6.140</td>
                              <td class="py-2 pl-3 text-zinc-400 text-left">Resumo dos Fatos do Dia (Edição da Tarde)</td>
                            </tr>
                            <tr>
                              <td class="py-2 pr-3 font-semibold text-zinc-100 text-left">Podcast Exclusivo #84</td>
                              <td class="py-2 px-2 text-center text-amber-400 font-mono text-[11px]">⏳ 19:00</td>
                              <td class="py-2 px-2 text-right font-mono text-zinc-400">4.200 agend.</td>
                              <td class="py-2 pl-3 text-zinc-400 text-left">Entrevista com Desenvolvedores Principais</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Resumo sem fundo de caixa nem bordas — apenas texto elegante e alinhado */}
                      <div class="py-1 text-xs text-zinc-300 flex items-start gap-2 text-left">
                        <span class="text-emerald-400 select-none">⚡</span>
                        <span><strong>Resumo Executivo:</strong> Audiência total supera em <strong>+24.5%</strong> a média da semana anterior. Boletim catalogado e pronto para despacho à equipe editorial.</span>
                      </div>
                    </div>
                  </Show>
                </div>
              )}
            </Match>
          </Switch>
        )}
      </For>
    </div>
  );
};
