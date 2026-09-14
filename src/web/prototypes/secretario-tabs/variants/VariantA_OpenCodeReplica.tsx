import { type Component, Show, For } from "solid-js";
import { Plus, X, MessageSquare, Sparkles, AlertCircle, Settings2 } from "lucide-solid";
import { OpenCodeWatermark } from "../components/OpenCodeWatermark";
import { SharedComposer } from "../components/SharedComposer";
import { MessagePartsRenderer } from "../components/MessagePartsRenderer";
import type { TabSession, PrototypeMessage } from "../types";

interface VariantAProps {
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

export const VariantA_OpenCodeReplica: Component<VariantAProps> = (props) => {
  return (
    <div class="flex flex-col h-full w-full bg-[#0d0e11] text-zinc-200 select-none overflow-hidden font-sans">
      {/* 1. Barra de Abas no Topo — Réplica 1:1 do OpenCode */}
      <div class="h-10 bg-[#121316] border-b border-zinc-800/80 flex items-center px-2 gap-1.5 overflow-x-auto scrollbar-none shrink-0">
        <For each={props.tabs}>
          {(tab, index) => {
            const isActive = () => tab.id === props.activeTabId;
            return (
              <div class="relative flex items-center shrink-0">
                {/* Separador vertical sutil entre abas inativas (estilo OpenCode CSS) */}
                <Show when={index() > 0 && !isActive() && props.tabs[index() - 1]?.id !== props.activeTabId}>
                  <div class="absolute -left-[3.5px] top-2.5 w-[1.5px] h-3 bg-zinc-700/60 rounded-full pointer-events-none"></div>
                </Show>

                <div
                  onClick={() => props.onSelectTab(tab.id)}
                  class={`group relative h-8 px-3 rounded-md flex items-center gap-2 cursor-pointer transition-all text-xs ${
                    isActive()
                      ? "bg-[#1c1d22] text-zinc-100 font-medium shadow-sm border border-zinc-700/50"
                      : "bg-transparent hover:bg-zinc-800/60 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <MessageSquare size={13} class={isActive() ? "text-emerald-400 shrink-0" : "text-zinc-500 shrink-0"} />
                  <span class="max-w-[90px] sm:max-w-[140px] truncate">{tab.title}</span>

                  {/* Botão Fechar Aba (x) */}
                  <button
                    type="button"
                    onClick={(e) => props.onCloseTab(tab.id, e)}
                    class={`h-4 w-4 rounded flex items-center justify-center transition-colors shrink-0 ${
                      isActive()
                        ? "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/60"
                        : "text-zinc-500 sm:text-transparent group-hover:text-zinc-400 hover:bg-zinc-700/40"
                    }`}
                    title="Fechar sessão"
                  >
                    <X size={11} />
                  </button>
                </div>
              </div>
            );
          }}
        </For>

        {/* Botão + (Criar Nova Sessão) */}
        <button
          type="button"
          onClick={props.onAddTab}
          class="h-7 w-7 shrink-0 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 flex items-center justify-center transition-colors cursor-pointer border border-transparent hover:border-zinc-700/40"
          title="Nova sessão"
        >
          <Plus size={14} />
        </button>

        {/* Ações da Direita: Motor + Botão de Configuração Lateral */}
        <div class="ml-auto flex items-center gap-2 pr-2 text-xs font-mono shrink-0">
          <span class="hidden md:flex items-center gap-1.5 text-zinc-500">
            <span class="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            OpenCode Engine v1.2
          </span>

          <Show when={props.onOpenConfig}>
            <button
              type="button"
              onClick={props.onOpenConfig}
              class="h-7 px-2 rounded-md bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer border border-zinc-700/60 text-xs"
              title="Configurar Motor, Modelo e Rotação"
            >
              <Settings2 size={13} class="text-emerald-400" />
              <span class="hidden sm:inline">Config</span>
            </button>
          </Show>
        </div>
      </div>

      {/* Alerta de Falha / Rotação de Modelo em Produção */}
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

      {/* 2. Área Central de Conversação ou Marca d'Água */}
      <div class="flex-1 overflow-y-auto p-2 sm:p-4 flex flex-col items-center justify-start scrollbar-thin scrollbar-thumb-zinc-800">
        <Show
          when={props.messages.length > 0}
          fallback={
            <div class="my-auto">
              <OpenCodeWatermark subtitle="Pressione Enter ou aguarde a automação para ver o fluxo intercalado do OpenCode." />
            </div>
          }
        >
          <div class="w-full max-w-3xl flex flex-col gap-4 py-3">
            <For each={props.messages}>
              {(msg) => (
                <Show
                  when={msg.role === "user"}
                  fallback={
                    /* Resposta do Assistente: Stream intercalado de MessageParts (Pensar -> Falar -> Executar -> Pensar -> ...) */
                    <div class="flex flex-col gap-1 w-full text-left items-start animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div class="flex items-center gap-2 text-xs font-medium text-emerald-400 pb-1">
                        <Sparkles size={14} />
                        <span>Secretário Executivo (OpenCode)</span>
                      </div>

                      {/* Renderizador de partes sem borda, sem fundo, alinhado à esquerda */}
                      <Show when={msg.parts && msg.parts.length > 0}>
                        <MessagePartsRenderer
                          parts={msg.parts || []}
                          isPartExpanded={props.isPartExpanded}
                          onTogglePart={props.onTogglePart}
                          styleMode="pure"
                          mostrarPensamento={props.mostrarPensamento}
                          mostrarAcoes={props.mostrarAcoes}
                        />
                      </Show>
                    </div>
                  }
                >
                  {/* Mensagem do Usuário */}
                  <div class="flex flex-col items-end gap-1.5 w-full">
                    <div class="max-w-[85%] rounded-2xl rounded-tr-sm bg-zinc-800/90 border border-zinc-700/60 px-4 py-2.5 text-xs sm:text-sm text-zinc-100 shadow-md">
                      {msg.content}
                    </div>
                    <span class="text-[10px] text-zinc-500 font-mono mr-1">{msg.timestamp}</span>
                  </div>
                </Show>
              )}
            </For>
          </div>
        </Show>
      </div>

      {/* 3. Caixa de Entrada Flutuante Integrada (Composer) */}
      <div class="w-full shrink-0">
        <SharedComposer
          value={props.typewriterText}
          onInput={props.onTypewriterInput}
          onSubmit={props.onSubmitPrompt}
          selectedModel={props.selectedModel}
          onSelectModel={props.onSelectModel}
          selectedContext={props.selectedContext}
          onSelectContext={props.onSelectContext}
          variant="pure"
          onOpenConfig={props.onOpenConfig}
        />
      </div>
    </div>
  );
};
