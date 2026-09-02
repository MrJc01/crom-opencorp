import { type Component, createSignal, For, Show } from "solid-js";
import { ArrowUp, Square, Paperclip, X, Sparkles, Terminal, AtSign } from "lucide-solid";
import { IconButton } from "../../ui/IconButton";
import { showToast } from "../../ui/Toast";

export interface Anexo {
  nome: string;
  mime: string;
  url: string; // base64 data url
}

export interface PromptInputProps {
  valor: string;
  onInput: (v: string) => void;
  onEnviar: () => void;
  onParar?: () => void;
  carregando: boolean;
  anexos: Anexo[];
  onAdicionarAnexo: (a: Anexo) => void;
  onRemoverAnexo: (index: number) => void;
  placeholder?: string;
  agenteSelecionado: "secretario" | "secretario-exec";
  onMudarAgente: (ag: "secretario" | "secretario-exec") => void;
}

export const PromptInput: Component<PromptInputProps> = (props) => {
  let textareaRef!: HTMLTextAreaElement;
  let fileInputRef!: HTMLInputElement;

  const autoResize = () => {
    if (!textareaRef) return;
    textareaRef.style.height = "auto";
    textareaRef.style.height = `${Math.min(textareaRef.scrollHeight, 180)}px`;
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!props.carregando && (props.valor.trim() || props.anexos.length > 0)) {
        props.onEnviar();
      }
    }
  };

  const handlePaste = (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            props.onAdicionarAnexo({
              nome: `imagem-colada-${Date.now()}.png`,
              mime: file.type,
              url: reader.result as string,
            });
            showToast("Imagem colada da área de transferência", "sucesso");
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const handleFileChange = (e: Event) => {
    const files = (e.target as HTMLInputElement).files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onload = () => {
        props.onAdicionarAnexo({
          nome: file.name,
          mime: file.type,
          url: reader.result as string,
        });
        showToast(`Anexo ${file.name} adicionado`, "sucesso");
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div class="relative flex flex-col w-full max-w-3xl mx-auto rounded-2xl bg-zinc-900 border border-zinc-800 shadow-xl p-2.5 transition-all focus-within:border-zinc-700 focus-within:ring-1 focus-within:ring-zinc-700/50">
      {/* Visualização de Anexos Pendentes */}
      <Show when={props.anexos.length > 0}>
        <div class="flex flex-wrap gap-2 px-1 pb-2 border-b border-zinc-800/80 mb-2">
          <For each={props.anexos}>
            {(anexo, idx) => (
              <div class="relative group flex items-center gap-1.5 px-2 py-1 bg-zinc-800 rounded-md border border-zinc-700 text-xs text-zinc-200">
                <Show when={anexo.mime.startsWith("image/")} fallback={<Paperclip size={12} class="text-zinc-400" />}>
                  <img src={anexo.url} alt={anexo.nome} class="h-6 w-6 rounded object-cover" />
                </Show>
                <span class="max-w-[120px] truncate text-[11px] font-medium">{anexo.nome}</span>
                <button
                  onClick={() => props.onRemoverAnexo(idx())}
                  class="text-zinc-400 hover:text-rose-400 p-0.5 rounded transition-colors"
                  title="Remover anexo"
                >
                  <X size={12} />
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* Input de Texto */}
      <textarea
        ref={textareaRef}
        rows={1}
        value={props.valor}
        onInput={(e) => {
          props.onInput(e.currentTarget.value);
          autoResize();
        }}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={props.placeholder || "Pergunte ao Secretário Executivo… (/ comandos, @ contexto, ! terminal)"}
        class="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none px-2 py-1 leading-relaxed max-h-[180px] scrollbar-thin"
      />

      {/* Barra de Ações Inferior */}
      <div class="flex items-center justify-between pt-2 px-1 text-xs select-none">
        <div class="flex items-center gap-2 text-zinc-400">
          {/* Seletor de Agente Secretário / Secretário Executivo */}
          <select
            class="bg-zinc-800 border border-zinc-700/80 rounded-md px-2 py-1 text-xs text-zinc-200 focus:outline-none cursor-pointer hover:bg-zinc-700/80 transition-colors"
            value={props.agenteSelecionado}
            onChange={(e) => props.onMudarAgente(e.currentTarget.value as any)}
          >
            <option value="secretario-exec">secretário-exec (ações)</option>
            <option value="secretario">secretário (consulta)</option>
          </select>

          {/* Botão de Anexo */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            class="hidden"
            onChange={handleFileChange}
          />
          <IconButton
            size="sm"
            variant="ghost"
            onClick={() => fileInputRef.click()}
            title="Anexar arquivo ou imagem"
            aria-label="Anexar arquivo ou imagem"
            class="text-zinc-400 hover:text-zinc-200"
          >
            <Paperclip size={15} />
          </IconButton>

          <span class="hidden sm:inline text-[11px] text-zinc-500 font-mono">
            Enter ↵ envia · Shift+Enter quebra
          </span>
        </div>

        {/* Botão de Envio ou Parar */}
        <div>
          <Show
            when={props.carregando}
            fallback={
              <button
                onClick={props.onEnviar}
                disabled={!props.valor.trim() && props.anexos.length === 0}
                class="flex items-center justify-center h-8 w-8 rounded-full bg-zinc-100 text-zinc-950 font-bold transition-all disabled:opacity-30 disabled:pointer-events-none hover:bg-white active:scale-95 shadow-md cursor-pointer"
                title="Enviar mensagem (Enter)"
                aria-label="Enviar mensagem"
              >
                <ArrowUp size={16} stroke-width={2.5} />
              </button>
            }
          >
            <button
              onClick={props.onParar}
              class="flex items-center justify-center h-8 w-8 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-bold transition-all active:scale-95 shadow-md cursor-pointer animate-pulse"
              title="Interromper geração"
              aria-label="Interromper geração"
            >
              <Square size={13} fill="currentColor" />
            </button>
          </Show>
        </div>
      </div>
    </div>
  );
};
