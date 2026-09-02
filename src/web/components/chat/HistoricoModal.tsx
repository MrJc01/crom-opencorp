import { type Component, createSignal, For, Show } from "solid-js";
import { Search, Plus, MessageSquare, Trash2 } from "lucide-solid";
import { Modal } from "../../ui/Dialog";
import { Button } from "../../ui/Button";
import { IconButton } from "../../ui/IconButton";

export interface SessaoResumo {
  id: string;
  titulo?: string;
  criado_em?: string | number;
  atualizado_em?: string | number;
  mensagens_count?: number;
}

export interface HistoricoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessoes: SessaoResumo[];
  sessaoAtivaId: string | null;
  onSelecionarSessao: (id: string) => void;
  onNovaConversa: () => void;
  onExcluirSessao?: (id: string) => void;
}

export const HistoricoModal: Component<HistoricoModalProps> = (props) => {
  const [busca, setBusca] = createSignal("");

  const sessoesFiltradas = () => {
    const termo = busca().toLowerCase().trim();
    if (!termo) return props.sessoes;
    return props.sessoes.filter((s) => (s.titulo || s.id).toLowerCase().includes(termo));
  };

  return (
    <Modal
      open={props.open}
      onOpenChange={props.onOpenChange}
      title="Histórico de Conversas"
      description="Navegue entre sessões anteriores ou inicie um novo chat"
      maxWidth="lg"
    >
      <div class="space-y-3">
        {/* Barra superior com Busca e Botão de Nova Conversa */}
        <div class="flex items-center gap-2">
          <div class="relative flex-1">
            <Search size={14} class="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Buscar conversas..."
              value={busca()}
              onInput={(e) => setBusca(e.currentTarget.value)}
              class="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
            />
          </div>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              props.onNovaConversa();
              props.onOpenChange(false);
            }}
          >
            <Plus size={14} class="mr-1" /> Nova Conversa
          </Button>
        </div>

        {/* Lista de Sessões */}
        <div class="max-h-[50vh] overflow-y-auto space-y-1 scrollbar-thin pr-1">
          <For
            each={sessoesFiltradas()}
            fallback={
              <div class="py-8 text-center text-xs text-zinc-500">
                Nenhuma conversa encontrada.
              </div>
            }
          >
            {(s) => {
              const ativa = () => s.id === props.sessaoAtivaId;
              return (
                <div
                  class={`group flex items-center justify-between p-2.5 rounded-lg border transition-all cursor-pointer ${
                    ativa()
                      ? "bg-zinc-800/80 border-zinc-700 text-zinc-100"
                      : "bg-zinc-950/40 border-zinc-900 text-zinc-300 hover:bg-zinc-800/40 hover:border-zinc-800"
                  }`}
                  onClick={() => {
                    props.onSelecionarSessao(s.id);
                    props.onOpenChange(false);
                  }}
                >
                  <div class="flex items-center gap-2.5 min-w-0 flex-1">
                    <MessageSquare
                      size={15}
                      class={`flex-shrink-0 ${ativa() ? "text-emerald-400" : "text-zinc-500"}`}
                    />
                    <div class="min-w-0 flex-1">
                      <div class="text-xs font-medium truncate">
                        {s.titulo || `Conversa ${s.id.slice(0, 8)}`}
                      </div>
                      <div class="text-[10px] text-zinc-500">
                        {s.mensagens_count ? `${s.mensagens_count} mensagens` : "Sessão"}
                      </div>
                    </div>
                  </div>

                  <Show when={props.onExcluirSessao}>
                    <IconButton
                      size="xs"
                      variant="ghost"
                      class="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Excluir esta conversa permanentemente?")) {
                          props.onExcluirSessao?.(s.id);
                        }
                      }}
                      title="Excluir conversa"
                    >
                      <Trash2 size={13} />
                    </IconButton>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </div>
    </Modal>
  );
};
