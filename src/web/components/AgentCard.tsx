import { type Component, createSignal, onMount, createEffect, Show, For } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import {
  Bot,
  Lupe,
  CheckCircle,
  XCircle,
  Play,
  MessageCircle,
  Clock,
  Globe,
  Puzzle,
} from "lucide-solid";
import { Button } from "../ui/Button";
import { useChat } from "../lib/chat/store";

export interface AgentCardProps {
  agentId: string;
}

export const AgentCard: Component<AgentCardProps> = ({ agentId }) => {
  const [agente, setAgente] = createSignal<any>(null);
  const [carregando, setCarregando] = createSignal(true);
  const [sessoesAtivas, setSessoesAtivas] = createSignal(0);

  const [focoInput, setFocoInput] = createSignal(false);

  createEffect(async () => {
    try {
      setCarregando(true);
      const data = await fetchApi<AnyAgent>(`/agents/${encodeURIComponent(agentId)}`);
      setAgente(data);
    } catch (err: any) {
      showToast("Erro ao carregar agente: " + err.message, "erro");
    } finally {
      setCarregando(false);
    }
  });

  const { refTextarea } = useChat();

  const iniciarConversa = async () => {
    if (!agente()) return;
    setFocoInput(true);
    // Focar no input do secretary após um pequeno delay
    setTimeout(() => {
      refTextarea?.focus();
    }, 100);
  };

  const sessoes = agente()?.sessoes || [];

  onMount(() => {
    void (async () => {
      try {
        const execs = await fetchApi<any[]>("/execucoes?limite=20&agente=" + encodeURIComponent(agentId));
        const executando = execs.filter((e: any) => e.status === "executando");
        setSessoesAtivas(executando.length);
      } catch {}
    })();
  });

  if (carregando) {
    return (
      <div class="p-6 border rounded-xl bg-zinc-950 text-zinc-400">
        <Loader2 class="h-6 w-6 animate-spin text-emerald-400" /> Carregando...
      </div>
    );
  }

  if (!agente()) {
    return (
      <div class="p-6 border rounded-xl bg-zinc-950 text-zinc-400">
        <XCircle class="h-6 w-6 text-rose-500" /> Agente não encontrado
      </div>
    );
  }

  const skills = agente()?.skills || [];
  const nome = agente()?.name || agente()?.id;
  const executorId = agente()?.id || "executor-padrao";
  const ativo = agente()?.ativo !== false;

  return (
    <div class="p-6 border rounded-xl bg-zinc-950/50 border-zinc-800 mb-4">
      <div class="flex items-center gap-3 mb-4">
        <Bot class="h-5 w-5 text-emerald-400" />
        <div>
          <h2 class="font-bold text-zinc-100">{nome}</h2>
          <span class="text-xs text-zinc-500 font-mono">@{executorId}</span>
        </div>
        <Show when={ativo}>
          <CheckCircle class="h-3.5 w-3.5 text-emerald-400" />
        </Show>
        <Show when={!ativo}>
          <XCircle class="h-3.5 w-3.5 text-rose-400" />
        </Show>
      </div>

      {/* Executor info line - for test visibility */}
      <div class="text-xs text-zinc-500 font-mono mt-2">Executor: {executorId}</div>

      {/* Skills chips */}
      <div class="flex flex-wrap gap-1.5 mb-4 pt-4 border-t border-zinc-800/30">
        <Show when={skills && skills.length > 0}>
          {() => (
            <For each={skills}>
              {(skill) => (
                <span
                  key={skill}
                  class={`inline-flex items-center gap-1.5 rounded-full text-[10px] font-medium px-2.5 py-0.5 bg-emerald-950/30 border border-emerald-800/40 text-emerald-300`}
                >
                  <Puzzle size={10} class="text-emerald-300" /> {skill}
                </span>
              )}
            </For>
          )}
        </Show>
        <Show when={!skills || skills.length === 0}>
          <span class="text-[11px] text-zinc-500">Nenhuma skill</span>
        </Show>
      </div>

      {/* Status e sessões */}
      <div class="flex items-center gap-3 text-xs text-zinc-400">
        <Clock class="h-3.5 w-3.5 text-emerald-400" /> {sessoesAtivas} sessão(ens) ativa(s)
      </div>

      {/* Botão Iniciar conversa */}
      <div class="mt-4">
        <Button
          size="sm"
          variant="primary"
          onClick={iniciarConversa}
          disabled={carregando}
        >
          <MessageCircle size={13} class="mr-1 fill-current" /> Iniciar conversa
        </Button>
      </div>
    </div>
  );
};

type AnyAgent = {
  id: string;
  name?: string;
  id?: string;
  ativo?: boolean;
  skills?: string[];
  sessoes?: any[];
};