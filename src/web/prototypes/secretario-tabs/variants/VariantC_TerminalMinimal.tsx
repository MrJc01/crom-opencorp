import { type Component, Show, For } from "solid-js";
import { Plus, X, Signal, Terminal, AlertCircle, Settings2 } from "lucide-solid";
import { OpenCodeWatermark } from "../components/OpenCodeWatermark";
import { SharedComposer } from "../components/SharedComposer";
import { MessagePartsRenderer } from "../components/MessagePartsRenderer";
import type { TabSession, PrototypeMessage } from "../types";

interface VariantCProps {
  tabs: TabSession[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string, e: MouseEvent) => void;
  onAddTab: () => void;
  messages: PrototypeMessage[];
  typewriterText: string;
  onTypewriterInput: (val: string) => void;
  onSubmitPrompt: (val: string) => void;
  selectedModel: string;
  onSelectModel: (m: string) => void;
  selectedContext: string;
  onSelectContext: (c: string) => void;
  isPartExpanded: (id: string) => boolean;
  onTogglePart: (id: string) => void;
  mostrarPensamento?: boolean;
  mostrarAcoes?: boolean;
  rotationAlert?: string | null;
  onDismissRotationAlert?: () => void;
  onOpenConfig?: () => void;
}

export const VariantC_TerminalMinimal: Component<VariantCProps> = (props) => {
  return (
    <div class="flex flex-col h-full w-full bg-[#090a0f] text-zinc-200 select-none overflow-hidden font-mono">
      {/* 1. Barra de Abas Estilo IDE com Atalhos de Teclado (Ctrl+1, Ctrl+2, Ctrl+T) */}
      <div class="h-10 bg-[#0e1017] border-b border-zinc-800/90 flex items-center px-2 gap-1 overflow-x-auto scrollbar-none">
        <For each={props.tabs}>
          {(tab, index) => {
            const isActive = () => tab.id === props.activeTabId;
            return (
              <div
                onClick={() => props.onSelectTab(tab.id)}
                class={`group h-7.5 px-2.5 sm:px-3 rounded flex items-center gap-1.5 sm:gap-2 cursor-pointer transition-all text-xs border shrink-0 ${
                  isActive()
                    ? "bg-[#161a24] border-sky-500/50 text-sky-200 font-medium shadow-sm"
                    : "bg-[#0b0d13] border-zinc-850 hover:bg-zinc-850 text-zinc-400 hover:text-zinc-300"
                }`}
              >
                <span class="text-zinc-500 text-[10px]">&gt;</span>
                <span class="max-w-[80px] sm:max-w-[130px] truncate">{tab.title}</span>

                {/* Atalho visível (Ctrl+N) */}
                <span class="hidden sm:inline text-[9px] px-1 py-0.2 rounded bg-zinc-800/80 text-zinc-400 font-sans border border-zinc-700/50">
                  ^{index() + 1}
                </span>

                <button
                  type="button"
                  onClick={(e) => props.onCloseTab(tab.id, e)}
                  class="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 hover:text-rose-400 transition-opacity ml-1 shrink-0"
                >
                  <X size={11} />
                </button>
              </div>
            );
          }}
        </For>

        {/* Botão + com Atalho Ctrl+T */}
        <button
          type="button"
          onClick={props.onAddTab}
          class="h-7 px-2 rounded bg-[#0b0d13] hover:bg-zinc-800 border border-zinc-850 text-zinc-400 hover:text-zinc-200 flex items-center gap-1.5 transition-colors cursor-pointer text-xs shrink-0"
          title="Nova sessão (Ctrl+T)"
        >
          <Plus size={12} />
          <span class="hidden sm:inline text-[9px] text-zinc-500">^T</span>
        </button>

        {/* Monitor de Ping e Latência + Botão de Configuração */}
        <div class="ml-auto flex items-center gap-2 pr-2 text-xs font-mono shrink-0">
          <div class="hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300">
            <Signal size={11} class="text-emerald-400 animate-pulse" />
            <span class="text-zinc-400">{props.selectedModel.split("/").slice(-1)[0]}</span>
            <span class="text-zinc-600">·</span>
            <span class="text-emerald-400">142ms</span>
          </div>

          <Show when={props.onOpenConfig}>
            <button
              type="button"
              onClick={props.onOpenConfig}
              class="h-7 px-2 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-sky-400 flex items-center gap-1 text-xs cursor-pointer"
              title="Configurar motor / fallback"
            >
              <Settings2 size={12} />
              <span class="hidden sm:inline">CFG</span>
            </button>
          </Show>
        </div>
      </div>

      {/* Alerta de Falha / Rotação de Modelo */}
      <Show when={props.rotationAlert}>
        <div class="mx-3 mt-2 px-3 py-2 rounded-lg bg-amber-950/60 border border-amber-700/60 text-[12px] text-amber-200 flex items-center gap-2 animate-in slide-in-from-top-2 duration-200 shadow-md">
          <AlertCircle size={14} class="text-amber-400 shrink-0" />
          <span class="flex-1 font-mono text-[11px]">{props.rotationAlert}</span>
          <button
            type="button"
            onClick={props.onDismissRotationAlert}
            class="text-amber-400 hover:text-amber-200 cursor-pointer"
            title="Dispensar alerta"
          >
            <X size={13} />
          </button>
        </div>
      </Show>

      {/* 2. Stream de Mensagens — Intercalado, sem bordas, sem fundos, alinhado à esquerda */}
      <div class="flex-1 overflow-y-auto p-2 sm:p-4 flex flex-col items-center justify-start scrollbar-thin scrollbar-thumb-zinc-800">
        <Show
          when={props.messages.length > 0}
          fallback={
            <div class="my-auto">
              <OpenCodeWatermark
                title="terminal // raw"
                subtitle="Ambiente técnico de alto desempenho com logs de execução em tempo real."
              />
            </div>
          }
        >
          <div class="w-full max-w-3xl flex flex-col gap-4 py-3">
            <For each={props.messages}>
              {(msg) => (
                <Show
                  when={msg.role === "user"}
                  fallback={
                    <div class="flex flex-col gap-1 w-full text-left items-start animate-in fade-in duration-150">
                      <div class="flex items-center gap-2 text-xs font-medium text-sky-400 pb-1">
                        <Terminal size={13} />
                        <span>Secretário CLI // Intercalado</span>
                      </div>

                      <Show when={msg.parts && msg.parts.length > 0}>
                        <MessagePartsRenderer
                          parts={msg.parts || []}
                          isPartExpanded={props.isPartExpanded}
                          onTogglePart={props.onTogglePart}
                          styleMode="terminal"
                          mostrarPensamento={props.mostrarPensamento}
                          mostrarAcoes={props.mostrarAcoes}
                        />
                      </Show>
                    </div>
                  }
                >
                  <div class="flex flex-col items-end gap-1 w-full">
                    <div class="max-w-[85%] rounded-md bg-[#161a24] border border-sky-500/40 px-3.5 py-2 text-xs text-sky-100">
                      <span class="text-sky-400 mr-2 select-none">&gt;</span>
                      {msg.content}
                    </div>
                    <span class="text-[9px] text-zinc-500">{msg.timestamp}</span>
                  </div>
                </Show>
              )}
            </For>
          </div>
        </Show>
      </div>

      {/* 3. Composer Estilo Terminal */}
      <div class="w-full shrink-0">
        <SharedComposer
          value={props.typewriterText}
          onInput={props.onTypewriterInput}
          onSubmit={props.onSubmitPrompt}
          selectedModel={props.selectedModel}
          onSelectModel={props.onSelectModel}
          selectedContext={props.selectedContext}
          onSelectContext={props.onSelectContext}
          variant="terminal"
          placeholder="digite o comando ou instrução..."
          onOpenConfig={props.onOpenConfig}
        />
      </div>
    </div>
  );
};
