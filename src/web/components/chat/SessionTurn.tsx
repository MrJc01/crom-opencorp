import { type Component, createSignal, createEffect, For, Show } from "solid-js";
import { Copy, Check, Edit3, ShieldAlert, CheckCircle, XCircle, Terminal } from "lucide-solid";
import { IconButton } from "../../ui/IconButton";
import { Button } from "../../ui/Button";
import { showToast } from "../../ui/Toast";
import { renderMarkdown, processarDiagramasMermaid } from "../../md.js";

export interface AcaoItem {
  ferramenta?: string;
  resumo?: string;
  sucesso?: boolean;
}

export type TurnoPasso =
  | { tipo: "pensamento"; texto: string }
  | { tipo: "acao"; ferramenta: string; resumo?: string; sucesso?: boolean }
  | { tipo: "texto"; texto: string };

export interface ChatMensagem {
  role: "user" | "assistant" | "system";
  content: string;
  passos?: TurnoPasso[];
  pensamento?: string;
  concluida?: boolean;
  acoes?: AcaoItem[];
  imagens?: string[];
  terminal?: string;
  hitl?: {
    id: string;
    agente: string;
    ordem: string;
    motivo_guard: string;
  };
}

export interface SessionTurnProps {
  mensagem: ChatMensagem;
  indice: number;
  decorridoFmt?: string;
  onEditarPrompt: (indice: number) => void;
  onAprovarHitl?: (id: string) => void;
  onRejeitarHitl?: (id: string, motivo: string) => void;
}

export const SessionTurn: Component<SessionTurnProps> = (props) => {
  const [copiado, setCopiado] = createSignal(false);
  const m = () => props.mensagem;

  const copiar = async () => {
    const texto = m().content || "";
    if (!texto) { showToast("Nada para copiar", "aviso"); return; }
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(texto);
        ok = true;
      }
    } catch { /* fallback abaixo */ }
    if (!ok) {
      try {
        const ta = document.createElement("textarea");
        ta.value = texto;
        ta.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch { /* nada */ }
    }
    if (ok) {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
      showToast("Copiado para a área de transferência", "info");
    } else {
      showToast("Falha ao copiar", "aviso");
    }
  };

  createEffect(() => {
    // Dispara renderização de fluxogramas/diagramas Mermaid quando passos ou texto mudam
    m().content;
    m().passos;
    setTimeout(() => {
      void processarDiagramasMermaid();
    }, 40);
  });

  return (
    <div
      class={`group relative flex flex-col py-3 px-4 rounded-xl transition-colors ${
        m().role === "user"
          ? "bg-zinc-900/60 border border-zinc-800/80 ml-auto max-w-[85%]"
          : "bg-transparent mr-auto max-w-full w-full"
      }`}
    >
      {/* Cabeçalho */}
      <div class="flex items-center justify-between gap-2 mb-1 select-none">
        <span class="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          {m().role === "user" ? "Você" : "Secretário Executivo"}
        </span>
      </div>

      {/* Imagens Anexadas no Prompt do Usuário */}
      <Show when={m().imagens && m().imagens!.length > 0}>
        <div class="flex flex-wrap gap-2 mb-2">
          <For each={m().imagens}>
            {(img) => (
              <img
                src={img}
                alt="Anexo"
                class="max-h-48 max-w-xs rounded-lg border border-zinc-700 object-cover shadow-sm"
              />
            )}
          </For>
        </div>
      </Show>

      {/* Alerta de HITL (Human In The Loop) */}
      <Show when={m().hitl}>
        {(h) => (
          <div class="my-2 p-3 rounded-lg bg-amber-950/30 border border-amber-800/60 text-xs">
            <div class="flex items-center gap-1.5 font-semibold text-amber-300 mb-1">
              <ShieldAlert size={15} />
              <span>Autorização Requerida · {h().agente}</span>
            </div>
            <p class="text-zinc-300 mb-1">{h().ordem}</p>
            <p class="text-amber-400/80 italic text-[11px] mb-2">{h().motivo_guard}</p>
            <div class="flex items-center gap-2">
              <Button
                size="xs"
                variant="primary"
                onClick={() => props.onAprovarHitl?.(h().id)}
              >
                <CheckCircle size={13} class="mr-1 text-emerald-600" /> Aprovar
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  const mot = prompt("Motivo da rejeição:")?.trim();
                  if (mot) props.onRejeitarHitl?.(h().id, mot);
                }}
              >
                <XCircle size={13} class="mr-1 text-rose-400" /> Rejeitar
              </Button>
            </div>
          </div>
        )}
      </Show>

      {/* Saída de Terminal Direto */}
      <Show when={m().terminal !== undefined}>
        <pre class="p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-emerald-400 overflow-x-auto my-1 scrollbar-thin">
          <code>{m().terminal}</code>
        </pre>
      </Show>

      {/* Indicador de Raciocínio ao Vivo quando ainda não há passos prontos */}
      <Show when={m().concluida === false && (!m().passos || m().passos!.length === 0) && !m().content && !m().pensamento}>
        <div class="flex items-center gap-2 text-xs font-mono text-purple-300 py-2 px-3 rounded-xl bg-purple-950/40 border border-purple-800/50 animate-pulse my-1.5">
          <span class="animate-spin text-purple-400">⚡</span>
          <span>Iniciando raciocínio ao vivo...</span>
          <Show when={props.decorridoFmt}>
            <span class="ml-auto text-zinc-500 text-[10px]">{props.decorridoFmt}</span>
          </Show>
        </div>
      </Show>

      {/* Exibição em Ordem Cronológica de Passos (Pensamento -> Bash/Ação -> Texto) */}
      <Show
        when={m().passos && m().passos!.length > 0}
        fallback={
          <>
            {/* Fallback Seguro: Se não houver passos estruturados, separa cada pensamento em seu próprio collapse */}
            <Show when={m().pensamento}>
              <For each={m().pensamento!.split("\n\n---\n\n").filter(Boolean)}>
                {(pensamentoItem, pIdx) => {
                  const isUltimo = () => m().concluida === false && pIdx() === m().pensamento!.split("\n\n---\n\n").filter(Boolean).length - 1;
                  return (
                    <details
                      class="mb-2 rounded-xl bg-zinc-950/70 border border-zinc-800/80 overflow-hidden text-xs"
                      open={m().concluida === false}
                    >
                      <summary class="px-3 py-1.5 cursor-pointer font-medium text-zinc-400 hover:text-zinc-200 flex items-center justify-between select-none bg-zinc-900/40">
                        <span class="flex items-center gap-1.5">
                          <span>💭</span>
                          <span class={isUltimo() ? "text-purple-300 animate-pulse font-semibold" : ""}>
                            {isUltimo() ? "Pensando…" : `Raciocínio (${pIdx() + 1})`}
                          </span>
                        </span>
                        <Show when={isUltimo() && props.decorridoFmt}>
                          <span class="font-mono text-[10px] text-zinc-500">{props.decorridoFmt}</span>
                        </Show>
                      </summary>
                      <div
                        class="p-3 text-zinc-300 leading-relaxed font-sans border-t border-zinc-800/60 bg-zinc-950/40 max-h-60 overflow-y-auto scrollbar-thin select-text text-xs"
                        innerHTML={renderMarkdown(pensamentoItem)}
                      />
                    </details>
                  );
                }}
              </For>
            </Show>

            {/* Fallback Legado: Ações / Ferramentas em Andamento */}
            <Show when={m().acoes && m().acoes!.length > 0}>
              <div class="space-y-1 mb-2">
                <For each={m().acoes}>
                  {(acao) => (
                    <div class="flex items-center gap-2 text-xs text-zinc-400 bg-zinc-900/50 px-2.5 py-1 rounded border border-zinc-800/60 font-mono">
                      <span class={acao.sucesso === false ? "text-rose-400" : "text-emerald-400"}>
                        {acao.sucesso === false ? "✗" : "✓"}
                      </span>
                      <span class="text-zinc-300 font-semibold">{acao.ferramenta || "ferramenta"}:</span>
                      <span class="text-zinc-400 truncate">{acao.resumo || "executando..."}</span>
                    </div>
                  )}
                </For>
              </div>
            </Show>

            {/* Fallback Legado: Conteúdo Principal da Mensagem com Markdown Rico */}
            <Show when={m().content}>
              <div
                class="text-sm text-zinc-100 leading-relaxed font-sans break-words select-text my-1"
                innerHTML={renderMarkdown(m().content)}
              />
            </Show>
          </>
        }
      >
        <div class="space-y-2">
          <For each={m().passos}>
            {(passo, idx) => (
              <>
                {/* Passo: Pensamento Separado */}
                <Show when={passo.tipo === "pensamento" && passo.texto}>
                  {(() => {
                    const isUltimo = () => m().concluida === false && idx() === (m().passos?.length ?? 1) - 1;
                    return (
                      <details
                        class="rounded-xl bg-zinc-950/70 border border-zinc-800/80 overflow-hidden text-xs my-1.5"
                        open={isUltimo()}
                      >
                        <summary class="px-3 py-1.5 cursor-pointer font-medium text-zinc-400 hover:text-zinc-200 flex items-center justify-between select-none bg-zinc-900/40">
                          <span class="flex items-center gap-1.5">
                            <span>💭</span>
                            <span class={isUltimo() ? "text-purple-300 animate-pulse font-semibold" : ""}>
                              {isUltimo() ? "Pensando…" : `Raciocínio (${idx() + 1})`}
                            </span>
                          </span>
                          <Show when={isUltimo() && props.decorridoFmt}>
                            <span class="font-mono text-[10px] text-zinc-500">{props.decorridoFmt}</span>
                          </Show>
                        </summary>
                        <div
                          class="p-3 text-zinc-300 leading-relaxed font-sans border-t border-zinc-800/60 bg-zinc-950/40 max-h-60 overflow-y-auto scrollbar-thin select-text text-xs"
                          innerHTML={renderMarkdown(passo.texto)}
                        />
                      </details>
                    );
                  })()}
                </Show>

                {/* Passo: Ação / Tool (Bash, Comandos, Leitura) */}
                <Show when={passo.tipo === "acao"}>
                  <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-950/85 border border-zinc-800 text-xs font-mono text-zinc-300 my-1.5">
                    <Terminal size={13} class="text-amber-400 flex-shrink-0" />
                    <span class="text-amber-300/90 font-bold">{passo.ferramenta}:</span>
                    <span class="truncate flex-1 text-zinc-300">{passo.resumo || "executado"}</span>
                    <span
                      class={`text-[10px] ml-auto flex-shrink-0 font-bold px-1.5 py-0.2 rounded border ${
                        passo.sucesso !== false
                          ? "bg-emerald-950/60 text-emerald-300 border-emerald-800/60"
                          : "bg-rose-950/60 text-rose-300 border-rose-800/60"
                      }`}
                    >
                      {passo.sucesso !== false ? "✓ ok" : "✗ falhou"}
                    </span>
                  </div>
                </Show>

                {/* Passo: Resposta de Texto com Markdown Rico */}
                <Show when={passo.tipo === "texto" && passo.texto}>
                  <div
                    class="text-sm text-zinc-100 leading-relaxed font-sans break-words my-1.5 select-text"
                    innerHTML={renderMarkdown(passo.texto)}
                  />
                </Show>
              </>
            )}
          </For>
        </div>
      </Show>

      {/* Ações Discretas na Base do Balão do Usuário (Editar / Copiar) */}
      <Show when={m().role === "user"}>
        <div class="flex items-center justify-end gap-1 pt-1 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => props.onEditarPrompt(props.indice)}
            class="p-1 rounded-md bg-transparent text-zinc-500 hover:text-amber-300 hover:bg-zinc-800/80 transition-colors cursor-pointer"
            title="Editar prompt"
            aria-label="Editar prompt"
          >
            <Edit3 size={13} />
          </button>
          <button
            type="button"
            onClick={copiar}
            class="p-1 rounded-md bg-transparent text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/80 transition-colors cursor-pointer"
            title="Copiar prompt"
            aria-label="Copiar prompt"
          >
            <Show when={copiado()} fallback={<Copy size={13} />}>
              <Check size={13} class="text-emerald-400" />
            </Show>
          </button>
        </div>
      </Show>

      {/* Ação Discreta de Copiar na Base da Resposta do Assistente */}
      <Show when={m().role === "assistant" && m().content && m().concluida !== false}>
        <div class="flex items-center justify-end pt-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={copiar}
            class="p-1 rounded-md bg-transparent text-zinc-500 hover:text-zinc-200 hover:bg-zinc-850/80 transition-colors cursor-pointer"
            title="Copiar resposta"
            aria-label="Copiar resposta"
          >
            <Show when={copiado()} fallback={<Copy size={13} />}>
              <Check size={13} class="text-emerald-400" />
            </Show>
          </button>
        </div>
      </Show>

      {/* Indicador de Digitação / Pensando quando vazio */}
      <Show when={!m().content && m().concluida === false && !m().pensamento}>
        <div class="flex items-center gap-2 py-1 text-xs text-zinc-400 italic">
          <span class="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
          <span>Processando resposta com modelo livre...</span>
        </div>
      </Show>
    </div>
  );
};
