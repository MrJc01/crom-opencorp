import { type Component, For } from "solid-js";
import { Sparkles, Bot, Stethoscope, CheckSquare, Terminal, GitBranch } from "lucide-solid";

export interface EmptyStateProps {
  onSelectSuggestion?: (sugestao: string) => void;
  workspaceId?: string;
}

const DEFAULT_SUGGESTIONS = [
  { label: "/status", desc: "Diagnóstico de serviços e tasks", icon: Sparkles },
  { label: "/doctor", desc: "Verificar portas e conexões", icon: Stethoscope },
  { label: "/agents", desc: "Listar catálogo de agentes", icon: Bot },
  { label: "/task list", desc: "Ver quadro Kanban de tarefas", icon: CheckSquare },
  { label: "!git status", desc: "Consultar status do git", icon: GitBranch },
  { label: "!ls -la", desc: "Ver arquivos do workspace", icon: Terminal },
];

export const EmptyState: Component<EmptyStateProps> = (props) => {
  return (
    <div
      data-testid="secretario-empty-state"
      class="flex flex-col items-center justify-center min-h-[50vh] text-center p-6 select-none animate-in fade-in duration-300 max-w-xl mx-auto"
    >
      {/* Ícone Central / Marca */}
      <div class="h-16 w-16 rounded-2xl bg-gradient-to-tr from-emerald-600/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center mb-4 shadow-xl shadow-emerald-950/30">
        <Bot size={32} class="text-emerald-400" />
      </div>

      <h3 class="text-base font-semibold text-zinc-100 mb-1">
        Secretário Executivo
      </h3>
      <p class="text-xs text-zinc-400 max-w-sm mb-6 leading-relaxed">
        Orquestrador inteligente conectado aos agentes, tarefas e ferramentas do workspace{" "}
        <span class="font-mono text-zinc-300 font-semibold">{props.workspaceId || "ativo"}</span>.
      </p>

      {/* Grid de Sugestões Rápidas */}
      <div class="w-full grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
        <For each={DEFAULT_SUGGESTIONS}>
          {(sug) => {
            const Icon = sug.icon;
            return (
              <button
                type="button"
                onClick={() => props.onSelectSuggestion?.(sug.label)}
                class="flex items-center gap-2.5 p-2.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer group text-left"
              >
                <div class="h-7 w-7 rounded-lg bg-zinc-800 group-hover:bg-emerald-950/50 flex items-center justify-center shrink-0 border border-zinc-750 group-hover:border-emerald-800/60 transition-colors">
                  <Icon size={14} class="text-zinc-400 group-hover:text-emerald-400 transition-colors" />
                </div>
                <div class="min-w-0">
                  <div class="font-mono text-xs font-semibold text-zinc-200 group-hover:text-emerald-300 transition-colors">
                    {sug.label}
                  </div>
                  <div class="text-[10px] text-zinc-500 truncate">
                    {sug.desc}
                  </div>
                </div>
              </button>
            );
          }}
        </For>
      </div>
    </div>
  );
};
export default EmptyState;
