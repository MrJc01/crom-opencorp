import { type Component, createSignal, createEffect, Show } from "solid-js";
import {
  Globe,
  RotateCw,
  ExternalLink,
  Maximize2,
  Minimize2,
  X,
  Copy,
  Check,
  Layout,
  Layers,
} from "lucide-solid";
import { IconButton } from "../../ui/IconButton";
import { showToast } from "../../ui/Toast";

export interface ChatIframeEmbedProps {
  url: string;
  titulo?: string;
  aberto: boolean;
  onFechar: () => void;
  onUrlChange?: (novaUrl: string) => void;
  modoExpandido?: boolean;
  onToggleExpandido?: () => void;
}

export const ChatIframeEmbed: Component<ChatIframeEmbedProps> = (props) => {
  const [urlInput, setUrlInput] = createSignal(props.url || "");
  const [iframeKey, setIframeKey] = createSignal(0);
  const [copiado, setCopiado] = createSignal(false);
  const [carregando, setCarregando] = createSignal(true);

  createEffect(() => {
    setUrlInput(props.url || "");
    setCarregando(true);
  });

  const recarregar = () => {
    setCarregando(true);
    setIframeKey((k) => k + 1);
  };

  const submitUrl = (e: Event) => {
    e.preventDefault();
    let u = urlInput().trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u) && !u.startsWith("/")) {
      u = "https://" + u;
    }
    setUrlInput(u);
    props.onUrlChange?.(u);
    recarregar();
  };

  const copiarUrl = async () => {
    if (!props.url) return;
    try {
      await navigator.clipboard.writeText(props.url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
      showToast("URL copiada!", "info");
    } catch {
      showToast("Falha ao copiar URL", "aviso");
    }
  };

  return (
    <Show when={props.aberto}>
      <div class="flex flex-col h-full w-full bg-zinc-950 border-l border-zinc-800/80 shadow-2xl relative transition-all duration-200 min-w-0">
        {/* Barra de Ferramentas Superior */}
        <div class="flex items-center gap-1.5 px-3 py-2 bg-zinc-900/90 border-b border-zinc-800 text-xs select-none flex-shrink-0">
          <div class="flex items-center gap-2 text-zinc-400 font-medium truncate min-w-0 flex-1">
            <div class="h-6 w-6 rounded-md bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 flex-shrink-0">
              <Globe size={13} />
            </div>
            <form onSubmit={submitUrl} class="flex-1 min-w-0">
              <input
                type="text"
                value={urlInput()}
                onInput={(e) => setUrlInput(e.currentTarget.value)}
                placeholder="https://exemplo.com ou /apps/meu-app"
                class="w-full bg-zinc-950/70 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/40 transition-colors font-mono"
              />
            </form>
          </div>

          <div class="flex items-center gap-1 flex-shrink-0">
            <IconButton
              icon={RotateCw}
              titulo="Recarregar"
              onClick={recarregar}
              class="h-7 w-7 text-zinc-400 hover:text-zinc-200"
            >
              <RotateCw size={13} />
            </IconButton>
            <IconButton
              icon={copiado() ? Check : Copy}
              titulo="Copiar Link"
              onClick={copiarUrl}
              class={`h-7 w-7 ${copiado() ? "text-emerald-400" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              <Show when={copiado()} fallback={<Copy size={13} />}>
                <Check size={13} class="text-emerald-400" />
              </Show>
            </IconButton>
            <a
              href={props.url}
              target="_blank"
              rel="noopener noreferrer"
              class="h-7 w-7 inline-flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              title="Abrir em Nova Aba"
            >
              <ExternalLink size={13} />
            </a>
            <Show when={props.onToggleExpandido}>
              <IconButton
                icon={props.modoExpandido ? Minimize2 : Maximize2}
                titulo={props.modoExpandido ? "Restaurar Lado a Lado" : "Expandir Tela Cheia"}
                onClick={props.onToggleExpandido!}
                class="h-7 w-7 text-zinc-400 hover:text-zinc-200 hidden md:inline-flex"
              >
                <Show when={props.modoExpandido} fallback={<Maximize2 size={13} />}>
                  <Minimize2 size={13} />
                </Show>
              </IconButton>
            </Show>
            <IconButton
              icon={X}
              titulo="Fechar Preview"
              onClick={props.onFechar}
              class="h-7 w-7 text-zinc-400 hover:text-rose-400"
            >
              <X size={13} />
            </IconButton>
          </div>
        </div>

        {/* Área do Iframe */}
        <div class="flex-1 relative w-full h-full min-h-0 bg-zinc-900/40 overflow-hidden">
          <Show when={carregando()}>
            <div class="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/60 backdrop-blur-xs z-10 text-xs text-zinc-400 gap-2 select-none">
              <RotateCw size={18} class="animate-spin text-blue-400" />
              <span>Carregando preview...</span>
            </div>
          </Show>

          <Show
            when={props.url}
            fallback={
              <div class="flex flex-col items-center justify-center h-full text-center p-6 text-zinc-500">
                <Globe size={32} class="mb-3 opacity-40 text-blue-400" />
                <p class="text-sm font-medium text-zinc-300">Nenhuma URL selecionada</p>
                <p class="text-xs text-zinc-500 mt-1 max-w-sm">
                  Digite uma URL acima ou clique em uma URL gerada pela IA para abrir no preview embutido.
                </p>
              </div>
            }
          >
            <iframe
              key={iframeKey()}
              src={props.url}
              title={props.titulo || "Preview Embutido"}
              class="w-full h-full border-none bg-white dark:bg-zinc-950"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
              onLoad={() => setCarregando(false)}
            />
          </Show>
        </div>
      </div>
    </Show>
  );
};
