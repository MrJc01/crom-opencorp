import { type Component, createSignal, For, Show } from "solid-js";
import { Copy, Check, Edit3, ShieldAlert, CheckCircle, XCircle } from "lucide-solid";
import { IconButton } from "../../ui/IconButton";
import { Button } from "../../ui/Button";
import { showToast } from "../../ui/Toast";

export interface AcaoItem {
  ferramenta?: string;
  resumo?: string;
  sucesso?: boolean;
}

export interface ChatMensagem {
  role: "user" | "assistant" | "system";
  content: string;
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
    try {
      await navigator.clipboard.writeText(m().content);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
      showToast("Copiado para a área de transferência", "info");
    } catch {
      showToast("Falha ao copiar", "aviso");
    }
  };

  return (
    <div
      class={`group relative flex flex-col py-3 px-4 rounded-xl transition-colors ${
        m().role === "user"
          ? "bg-zinc-900/60 border border-zinc-800/80 ml-auto max-w-[85%]"
          : "bg-transparent mr-auto max-w-full w-full"
      }`}
    >
      {/* Cabeçalho / Ações no Hover */}
      <div class="flex items-center justify-between gap-2 mb-1.5 select-none">
        <span class="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          {m().role === "user" ? "Você" : "Secretário Executivo"}
        </span>

        <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <Show when={m().role === "user"}>
            <IconButton
              size="xs"
              variant="ghost"
              onClick={() => props.onEditarPrompt(props.indice)}
              title="Editar prompt (restaura texto e trunca conversa)"
              aria-label="Editar prompt"
              class="text-zinc-400 hover:text-amber-300"
            >
              <Edit3 size={13} />
            </IconButton>
          </Show>

          <IconButton
            size="xs"
            variant="ghost"
            onClick={copiar}
            title="Copiar mensagem"
            aria-label="Copiar mensagem"
            class="text-zinc-400 hover:text-zinc-200"
          >
            <Show when={copiado()} fallback={<Copy size={13} />}>
              <Check size={13} class="text-emerald-400" />
            </Show>
          </IconButton>
        </div>
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

      {/* Bloco Retrátil de Pensamento (Reasoning do Modelo) */}
      <Show when={m().pensamento}>
        <details
          class="mb-3 rounded-lg bg-zinc-950/70 border border-zinc-800/80 overflow-hidden text-xs"
          open={m().concluida === false}
        >
          <summary class="px-3 py-2 cursor-pointer font-medium text-zinc-400 hover:text-zinc-200 flex items-center justify-between select-none bg-zinc-900/40">
            <span class="flex items-center gap-1.5">
              <span>💭</span>
              <span>{m().concluida === false ? "Pensando…" : "Raciocínio Interno"}</span>
            </span>
            <Show when={m().concluida === false && props.decorridoFmt}>
              <span class="font-mono text-[10px] text-zinc-500">{props.decorridoFmt}</span>
            </Show>
          </summary>
          <div class="p-3 text-zinc-400 leading-relaxed font-sans whitespace-pre-wrap border-t border-zinc-800/60 bg-zinc-950/40 max-h-60 overflow-y-auto scrollbar-thin">
            {m().pensamento}
          </div>
        </details>
      </Show>

      {/* Ações / Ferramentas em Andamento */}
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

      {/* Conteúdo Principal da Mensagem */}
      <Show when={m().content}>
        <div class="text-sm text-zinc-100 leading-relaxed whitespace-pre-wrap font-sans break-words">
          {m().content}
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
