import { type Component, Show, For } from "solid-js";
import { Plus, X, Coins, Activity, Bot, FileCode, ShieldCheck, Sparkles, AlertCircle, Settings2 } from "lucide-solid";
import { OpenCodeWatermark } from "../components/OpenCodeWatermark";
import { SharedComposer } from "../components/SharedComposer";
import { MessagePartsRenderer } from "../components/MessagePartsRenderer";
import type { TabSession, PrototypeMessage } from "../types";

interface VariantBProps {
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

export const VariantB_ExecutiveStudio: Component<VariantBProps> = (props) => {
  const quickActions = [
    { label: "@agente", icon: Bot, hint: "Delegar para sub-agente" },
    { label: "@arquivo", icon: FileCode, hint: "Inserir referência de arquivo" },
    { label: "/status", icon: Activity, hint: "Verificar integridade do cluster" },
    { label: "/rotacao", icon: ShieldCheck, hint: "Checar fallback de modelos" },
  ];

  const handleQuickAction = (action: string) => {
    props.onTypewriterInput(props.typewriterText + (props.typewriterText ? " " : "") + action + " ");
  };

  return (
    <div class="flex flex-col h-full w-full bg-[#0b0c0e] text-zinc-200 select-none overflow-hidden font-sans">
      {/* 1. Header Executivo com Abas Compactas + Métricas de Custo/Tokens à Direita */}
      <div class="h-11 bg-[#101114] border-b border-zinc-800 flex items-center justify-between px-3 gap-2 shrink-0">
        {/* Abas Compactas Estilo Studio */}
        <div class="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1 min-w-0 flex-1">
          <For each={props.tabs}>
            {(tab) => {
              const isActive = () => tab.id === props.activeTabId;
              return (
                <div
                  onClick={() => props.onSelectTab(tab.id)}
                  class={`group h-7 px-2.5 sm:px-3 rounded-md flex items-center gap-1.5 sm:gap-2 cursor-pointer transition-all text-xs border shrink-0 ${
                    isActive()
                      ? "bg-zinc-800/90 border-emerald-500/40 text-emerald-300 font-medium shadow-sm"
                      : "bg-zinc-900/60 border-zinc-800 hover:bg-zinc-850 text-zinc-400 hover:text-zinc-300"
                  }`}
                >
                  <span class={`h-1.5 w-1.5 rounded-full shrink-0 ${isActive() ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"}`}></span>
                  <span class="max-w-[85px] sm:max-w-[130px] truncate">{tab.title}</span>

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

          <button
            type="button"
            onClick={props.onAddTab}
            class="h-7 px-2 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors cursor-pointer text-xs shrink-0"
            title="Nova sessão"
          >
            <Plus size={12} />
            <span class="hidden sm:inline text-[11px]">Nova</span>
          </button>
        </div>

        {/* Métricas e Botão de Configuração */}
        <div class="hidden md:flex items-center gap-2 pr-1 text-xs shrink-0 font-mono">
          <div class="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300">
            <Coins size={11} class="text-amber-400" />
            <span>0.0042</span>
          </div>

          <Show when={props.onOpenConfig}>
            <button
              type="button"
              onClick={props.onOpenConfig}
              class="h-7 px-2 rounded-md bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer border border-zinc-700/60 text-xs"
              title="Configurar Motor e Rotação"
            >
              <Settings2 size={13} class="text-purple-400" />
              <span class="hidden lg:inline">Config</span>
            </button>
          </Show>
        </div>
      </div>

      {/* Alerta de Falha / Rotação de Modelo */}
      <Show when={props.rotationAlert}>
        <div class="mx-3 mt-2 px-3 py-2 rounded-xl bg-amber-950/60 border border-amber-700/60 text-[12px] text-amber-200 flex items-center gap-2 animate-in slide-in-from-top-2 duration-200 shadow-md">
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

      {/* 2. Chat Stream */}
      <div class="flex-1 overflow-y-auto p-2 sm:p-4 flex flex-col items-center justify-start scrollbar-thin scrollbar-thumb-zinc-800">
        <Show
          when={props.messages.length > 0}
          fallback={
            <div class="my-auto">
              <OpenCodeWatermark
                title="studio // executive"
                subtitle="Layout otimizado para despacho de ordens e acompanhamento em lote."
              />
            </div>
          }
        >
          <div class="w-full max-w-3xl flex flex-col gap-4 py-2">
            <For each={props.messages}>
              {(msg) => (
                <Show
                  when={msg.role === "user"}
                  fallback={
                    <div class="flex flex-col gap-1 w-full text-left items-start animate-in fade-in duration-200">
                      <div class="flex items-center gap-2 text-xs font-medium text-purple-400 pb-1">
                        <Sparkles size={14} />
                        <span>Secretário Executivo (Studio Flow)</span>
                      </div>

                      <Show when={msg.parts && msg.parts.length > 0}>
                        <MessagePartsRenderer
                          parts={msg.parts || []}
                          isPartExpanded={props.isPartExpanded}
                          onTogglePart={props.onTogglePart}
                          styleMode="executive"
                          mostrarPensamento={props.mostrarPensamento}
                          mostrarAcoes={props.mostrarAcoes}
                        />
                      </Show>
                    </div>
                  }
                >
                  <div class="flex flex-col items-end gap-1 w-full">
                    <div class="max-w-[80%] rounded-xl bg-emerald-950/30 border border-emerald-700/40 px-4 py-2 text-xs sm:text-sm text-zinc-100">
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

      {/* 3. Micro-Ações Deslizantes + Composer Integrado */}
      <div class="w-full shrink-0 flex flex-col items-center">
        {/* Chips de Micro-Ações Executivas */}
        <div class="w-full max-w-3xl px-2 sm:px-4 pb-1.5 flex items-center gap-2 overflow-x-auto scrollbar-none">
          <span class="text-[10px] text-zinc-500 font-mono uppercase tracking-wider shrink-0 mr-1">Ações:</span>
          <For each={quickActions}>
            {(act) => (
              <button
                type="button"
                onClick={() => handleQuickAction(act.label)}
                class="px-2 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 text-[11px] font-mono flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                title={act.hint}
              >
                <act.icon size={11} class="text-zinc-400" />
                <span>{act.label}</span>
              </button>
            )}
          </For>
        </div>

        <SharedComposer
          value={props.typewriterText}
          onInput={props.onTypewriterInput}
          onSubmit={props.onSubmitPrompt}
          selectedModel={props.selectedModel}
          onSelectModel={props.onSelectModel}
          selectedContext={props.selectedContext}
          onSelectContext={props.onSelectContext}
          variant="executive"
          onOpenConfig={props.onOpenConfig}
        />
      </div>
    </div>
  );
};
