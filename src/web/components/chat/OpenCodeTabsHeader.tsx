import { type Component, For, Show } from "solid-js";
import {
  MessageSquare,
  Plus,
  X,
  History,
  Settings2,
  Brain,
  Terminal,
  Globe,
  Square,
} from "lucide-solid";
import { IconButton } from "../../ui/IconButton";
import type { SessaoResumo } from "./HistoricoModal";

export interface OpenCodeTabsHeaderProps {
  sessoes: SessaoResumo[];
  sessaoAtivaId: string | null;
  emNovaConversa?: boolean;
  onSelecionarSessao: (id: string) => void;
  onNovaSessao: () => void;
  onExcluirSessao: (id: string, e: MouseEvent) => void;
  onAbrirHistorico?: () => void;
  onAbrirConfiguracoes?: () => void;
  carregando?: boolean;
  onParar?: () => void;
  mostrarPensamento?: boolean;
  onTogglePensamento?: () => void;
  mostrarAcoes?: boolean;
  onToggleAcoes?: () => void;
  iframeHabilitado?: boolean;
  iframeAberto?: boolean;
  onToggleIframe?: () => void;
  motorInferido?: string;
  modeloAtivo?: string;
}

export const OpenCodeTabsHeader: Component<OpenCodeTabsHeaderProps> = (props) => {
  // Limita a exibição de abas na barra superior às mais recentes (até 6 abas)
  const abasExibidas = () => {
    const lista = props.sessoes || [];
    // Garante que a sessão ativa está incluída se existir
    if (props.sessaoAtivaId && !lista.some((s) => s.id === props.sessaoAtivaId)) {
      return [{ id: props.sessaoAtivaId, titulo: "Sessão Atual" }, ...lista.slice(0, 5)];
    }
    return lista.slice(0, 6);
  };

  const isNovaAtiva = () => props.emNovaConversa || !props.sessaoAtivaId;

  return (
    <div class="h-10 bg-[#121316] border-b border-zinc-800/80 flex items-center px-2 gap-1.5 overflow-x-auto scrollbar-none shrink-0 z-20 select-none">
      {/* ─── Lista de Abas de Sessões ─── */}
      <div class="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto scrollbar-none py-1">
        {/* Aba de Nova Conversa (visível se estiver em nova conversa ou não houver sessões) */}
        <Show when={isNovaAtiva() || abasExibidas().length === 0}>
          <div class="relative flex items-center shrink-0">
            <div
              class="h-8 px-3 rounded-md flex items-center gap-2 cursor-pointer transition-all text-xs bg-[#1c1d22] text-zinc-100 font-medium shadow-xs border border-zinc-700/50"
            >
              <MessageSquare size={13} class="text-emerald-400 shrink-0" />
              <span class="max-w-[120px] truncate">Nova sessão</span>
            </div>
          </div>
        </Show>

        <For each={abasExibidas()}>
          {(tab, index) => {
            const isActive = () => tab.id === props.sessaoAtivaId && !isNovaAtiva();
            return (
              <div class="relative flex items-center shrink-0">
                {/* Separador vertical sutil entre abas inativas (estilo OpenCode CSS) */}
                <Show
                  when={
                    index() > 0 &&
                    !isActive() &&
                    abasExibidas()[index() - 1]?.id !== props.sessaoAtivaId &&
                    !isNovaAtiva()
                  }
                >
                  <div class="absolute -left-[2.5px] top-2.5 w-[1.5px] h-3 bg-zinc-700/60 rounded-full pointer-events-none" />
                </Show>

                <div
                  onClick={() => props.onSelecionarSessao(tab.id)}
                  class={`group relative h-8 px-3 rounded-md flex items-center gap-2 cursor-pointer transition-all text-xs ${
                    isActive()
                      ? "bg-[#1c1d22] text-zinc-100 font-medium shadow-xs border border-zinc-700/50"
                      : "bg-transparent hover:bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 border border-transparent"
                  }`}
                  title={tab.titulo || tab.id}
                >
                  <MessageSquare
                    size={13}
                    class={isActive() ? "text-emerald-400 shrink-0" : "text-zinc-500 shrink-0"}
                  />
                  <span class="max-w-[90px] sm:max-w-[140px] truncate">
                    {tab.titulo || tab.id}
                  </span>

                  {/* Botão Fechar Aba (x) */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onExcluirSessao(tab.id, e);
                    }}
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

        {/* Botão + (Nova Sessão Imediata) */}
        <button
          type="button"
          data-testid="btn-nova-conversa"
          onClick={props.onNovaSessao}
          class="h-7 w-7 shrink-0 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 flex items-center justify-center transition-colors cursor-pointer border border-transparent hover:border-zinc-700/40 ml-0.5"
          title="Nova conversa"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* ─── Ações da Direita ─── */}
      <div class="flex items-center gap-1 text-xs shrink-0 pl-1 border-l border-zinc-800/80">
        {/* Status de Execução Ao Vivo / Parar */}
        <Show when={props.carregando}>
          <div class="flex items-center gap-1.5 mr-1 font-mono text-[11px]">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 animate-pulse">
              <span class="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              AO VIVO
            </span>
            <Show when={props.onParar}>
              <button
                type="button"
                onClick={props.onParar}
                class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
                title="Interromper agente"
              >
                <Square size={8} fill="currentColor" />
                Parar
              </button>
            </Show>
          </div>
        </Show>

        {/* Badge do Motor OpenCode */}
        <span class="hidden xl:flex items-center gap-1.5 text-zinc-500 font-mono text-[11px] px-1.5 mr-1">
          <span class="h-2 w-2 rounded-full bg-emerald-500/80 animate-pulse" />
          <span>OpenCode Engine</span>
        </span>

        {/* Toggle Pensamento */}
        <Show when={props.onTogglePensamento}>
          <IconButton
            size="sm"
            variant="ghost"
            titulo={
              props.mostrarPensamento
                ? "Ocultar Raciocínio / Pensamento"
                : "Exibir Raciocínio / Pensamento"
            }
            onClick={props.onTogglePensamento!}
            class={
              props.mostrarPensamento
                ? "text-purple-400 bg-purple-500/10 border border-purple-500/30"
                : "text-zinc-500 hover:text-zinc-300"
            }
          >
            <Brain size={14} />
          </IconButton>
        </Show>

        {/* Toggle Ações */}
        <Show when={props.onToggleAcoes}>
          <IconButton
            size="sm"
            variant="ghost"
            titulo={
              props.mostrarAcoes
                ? "Ocultar Passos de Ferramentas"
                : "Exibir Passos de Ferramentas"
            }
            onClick={props.onToggleAcoes!}
            class={
              props.mostrarAcoes
                ? "text-sky-400 bg-sky-500/10 border border-sky-500/30"
                : "text-zinc-500 hover:text-zinc-300"
            }
          >
            <Terminal size={14} />
          </IconButton>
        </Show>

        {/* Toggle Preview Iframe */}
        <Show when={props.iframeHabilitado && props.onToggleIframe}>
          <IconButton
            size="sm"
            variant="ghost"
            titulo={props.iframeAberto ? "Fechar Preview Lateral" : "Abrir Preview Lateral (Iframe)"}
            onClick={props.onToggleIframe!}
            class={
              props.iframeAberto
                ? "text-blue-400 bg-blue-500/15 border border-blue-500/30"
                : "text-zinc-400 hover:text-zinc-200"
            }
          >
            <Globe size={14} />
          </IconButton>
        </Show>

        {/* Botão de Histórico Completo de Sessões */}
        <Show when={props.onAbrirHistorico}>
          <IconButton
            size="sm"
            variant="ghost"
            titulo="Histórico de Sessões"
            onClick={props.onAbrirHistorico!}
            class="text-zinc-400 hover:text-zinc-200"
          >
            <History size={14} />
          </IconButton>
        </Show>

        {/* Botão de Configuração do Motor */}
        <Show when={props.onAbrirConfiguracoes}>
          <IconButton
            size="sm"
            variant="ghost"
            titulo="Configurar Agente / Motor"
            data-testid="btn-configurar-motor"
            onClick={props.onAbrirConfiguracoes!}
            class="text-zinc-400 hover:text-zinc-200"
          >
            <Settings2 size={14} />
          </IconButton>
        </Show>
      </div>
    </div>
  );
};
