import { type Component, Show, For } from "solid-js";
import { Plus, X, Sparkles, Waves, AlertCircle, Settings2 } from "lucide-solid";
import { OpenCodeWatermark } from "../components/OpenCodeWatermark";
import { SharedComposer } from "../components/SharedComposer";
import { MessagePartsRenderer } from "../components/MessagePartsRenderer";
import type { TabSession, PrototypeMessage } from "../types";

interface VariantDProps {
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

export const VariantD_GlassmorphicFluid: Component<VariantDProps> = (props) => {
  return (
    <div class="relative flex flex-col h-full w-full bg-[#08090d] text-zinc-100 select-none overflow-hidden font-sans">
      {/* Luzes de Fundo Ambientais (Glow Gradients) */}
      <div class="absolute -top-32 -left-32 w-96 h-96 bg-emerald-600/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div class="absolute -bottom-32 -right-32 w-96 h-96 bg-sky-600/10 rounded-full blur-[100px] pointer-events-none"></div>

      {/* 1. Barra de Abas Glassmorphic Fluid */}
      <div class="relative z-10 h-11 px-3 flex items-center justify-between border-b border-white/5 bg-zinc-950/40 backdrop-blur-md">
        <div class="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1 min-w-0 flex-1">
          <For each={props.tabs}>
            {(tab) => {
              const isActive = () => tab.id === props.activeTabId;
              return (
                <div
                  onClick={() => props.onSelectTab(tab.id)}
                  class={`group relative h-7.5 px-3 rounded-xl flex items-center gap-2 cursor-pointer transition-all duration-300 text-xs backdrop-blur-lg shrink-0 ${
                    isActive()
                      ? "bg-white/10 border border-white/20 text-white font-medium shadow-lg shadow-emerald-500/5 ring-1 ring-white/10"
                      : "bg-white/[0.02] border border-white/5 hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <span
                    class={`h-2 w-2 rounded-full transition-colors duration-300 shrink-0 ${
                      isActive() ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" : "bg-zinc-600"
                    }`}
                  />
                  <span class="max-w-[80px] sm:max-w-[130px] truncate">{tab.title}</span>

                  <button
                    type="button"
                    onClick={(e) => props.onCloseTab(tab.id, e)}
                    class="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 hover:text-rose-400 transition-opacity ml-0.5 shrink-0"
                  >
                    <X size={11} />
                  </button>
                </div>
              );
            }}
          </For>

          <button
            type="button"
            onClick={props.onAddTab}
            class="h-7 w-7 rounded-xl bg-white/[0.04] hover:bg-white/10 border border-white/10 text-zinc-400 hover:white flex items-center justify-center transition-all cursor-pointer shrink-0"
            title="Nova sessão"
          >
            <Plus size={13} />
          </button>
        </div>

        {/* Indicador Fluid Engine + Botão de Configuração */}
        <div class="flex items-center gap-2 shrink-0 ml-2">
          <div class="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.03] border border-white/5 text-[11px] text-zinc-400">
            <Waves size={12} class="text-sky-400 animate-pulse" />
            <span>Fluid Engine Active</span>
          </div>

          <Show when={props.onOpenConfig}>
            <button
              type="button"
              onClick={props.onOpenConfig}
              class="h-7 px-2.5 rounded-xl bg-white/[0.05] hover:bg-white/10 text-zinc-300 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer border border-white/10 text-xs"
              title="Configurar Motor e Rotação"
            >
              <Settings2 size={12} class="text-emerald-400" />
              <span class="hidden sm:inline">Config</span>
            </button>
          </Show>
        </div>
      </div>

      {/* Alerta de Falha / Rotação de Modelo */}
      <Show when={props.rotationAlert}>
        <div class="relative z-20 mx-3 mt-2 px-3 py-2 rounded-xl bg-amber-950/70 backdrop-blur-md border border-amber-700/60 text-[12px] text-amber-200 flex items-center gap-2 animate-in slide-in-from-top-2 duration-200 shadow-xl">
          <AlertCircle size={14} class="text-amber-400 shrink-0" />
          <span class="flex-1 font-sans">{props.rotationAlert}</span>
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

      {/* 2. Área Central de Mensagens — Intercalado, sem bordas, sem fundos, alinhado à esquerda */}
      <div class="relative z-10 flex-1 overflow-y-auto p-2 sm:p-4 flex flex-col items-center justify-start scrollbar-thin scrollbar-thumb-zinc-800">
        <Show
          when={props.messages.length > 0}
          fallback={
            <div class="my-auto">
              <OpenCodeWatermark
                title="fluid // opencode"
                subtitle="Interface fluida de alta resolução com transições elásticas e profundidade ótica."
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
                    <div class="flex flex-col gap-1 w-full text-left items-start animate-in fade-in duration-200">
                      <div class="flex items-center gap-2 text-xs font-medium text-emerald-400 pb-1">
                        <Sparkles size={14} class="animate-pulse" />
                        <span>Secretário Executivo (Fluid Interleaved)</span>
                      </div>

                      <Show when={msg.parts && msg.parts.length > 0}>
                        <MessagePartsRenderer
                          parts={msg.parts || []}
                          isPartExpanded={props.isPartExpanded}
                          onTogglePart={props.onTogglePart}
                          styleMode="glass"
                          mostrarPensamento={props.mostrarPensamento}
                          mostrarAcoes={props.mostrarAcoes}
                        />
                      </Show>
                    </div>
                  }
                >
                  <div class="flex flex-col items-end gap-1 w-full">
                    <div class="max-w-[85%] rounded-2xl bg-white/[0.08] backdrop-blur-xl border border-white/15 px-4 py-2.5 text-xs sm:text-sm text-white shadow-lg">
                      {msg.content}
                    </div>
                    <span class="text-[10px] text-zinc-500 font-mono">{msg.timestamp}</span>
                  </div>
                </Show>
              )}
            </For>
          </div>
        </Show>
      </div>

      {/* 3. Composer Flutuante com Glassmorphism */}
      <div class="relative z-10 w-full shrink-0">
        <SharedComposer
          value={props.typewriterText}
          onInput={props.onTypewriterInput}
          onSubmit={props.onSubmitPrompt}
          selectedModel={props.selectedModel}
          onSelectModel={props.onSelectModel}
          selectedContext={props.selectedContext}
          onSelectContext={props.onSelectContext}
          variant="glass"
          onOpenConfig={props.onOpenConfig}
        />
      </div>
    </div>
  );
};
