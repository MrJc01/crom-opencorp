import { type Component, For, Show } from "solid-js";
import { Plus, X, MessageSquare, History } from "lucide-solid";

export interface SessionTabItem {
  id: string;
  title: string;
  active?: boolean;
}

export interface SessionTabsProps {
  sessoes: SessionTabItem[];
  sessaoAtivaId: string | null;
  onSelecionarSessao: (id: string) => void;
  onNovaSessao: () => void;
  onFecharSessao?: (id: string) => void;
  onAbrirHistorico?: () => void;
}

export const SessionTabs: Component<SessionTabsProps> = (props) => {
  return (
    <div
      data-testid="session-tabs-bar"
      class="flex items-center gap-1 px-3 py-1.5 bg-zinc-950/90 border-b border-zinc-800/80 text-xs select-none overflow-x-auto scrollbar-none"
    >
      {/* Botão Nova Conversa */}
      <button
        type="button"
        onClick={props.onNovaSessao}
        class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 border border-zinc-800 transition-colors shrink-0 cursor-pointer font-medium"
        title="Iniciar nova conversa"
      >
        <Plus size={13} class="text-emerald-400" />
        <span class="text-[11px]">Nova</span>
      </button>

      {/* Lista de Abas */}
      <div class="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5">
        <For each={props.sessoes}>
          {(sessao) => {
            const isAtiva = () => sessao.id === props.sessaoAtivaId;
            return (
              <div
                class={`group flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all cursor-pointer shrink-0 max-w-[180px] sm:max-w-[220px] ${
                  isAtiva()
                    ? "bg-zinc-900 text-emerald-300 border-emerald-500/50 shadow-xs font-medium"
                    : "bg-zinc-950/60 hover:bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 border-zinc-850"
                }`}
                onClick={() => props.onSelecionarSessao(sessao.id)}
                title={sessao.title}
              >
                <MessageSquare
                  size={12}
                  class={isAtiva() ? "text-emerald-400 shrink-0" : "text-zinc-500 shrink-0"}
                />
                <span class="truncate text-[11px]">
                  {sessao.title || "Conversa"}
                </span>

                <Show when={props.onFecharSessao}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onFecharSessao?.(sessao.id);
                    }}
                    class="text-zinc-400 hover:text-rose-400 hover:bg-zinc-800/80 p-1 rounded-md transition-all cursor-pointer shrink-0 ml-1"
                    title="Fechar sessão"
                    aria-label={`Fechar sessão ${sessao.title || ""}`}
                  >
                    <X size={14} class="w-3.5 h-3.5 shrink-0" strokeWidth={2.2} />
                  </button>
                </Show>
              </div>
            );
          }}
        </For>
      </div>

      {/* Botão Histórico Completo */}
      <Show when={props.onAbrirHistorico}>
        <div class="ml-auto flex items-center shrink-0 pl-1">
          <button
            type="button"
            onClick={props.onAbrirHistorico}
            class="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer text-[11px]"
            title="Abrir histórico de todas as sessões"
          >
            <History size={13} />
            <span class="hidden sm:inline">Histórico</span>
          </button>
        </div>
      </Show>
    </div>
  );
};
export default SessionTabs;
