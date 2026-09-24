import { type Component, Show, For, createSignal } from "solid-js";
import {
  Cpu,
  X,
  Check,
  Play,
  RefreshCw,
  Sparkles,
  Info,
  Terminal,
  Brain,
  RotateCw,
} from "lucide-solid";
import { useOpenCorp } from "../../providers/OpenCorpProvider";
import { ProblemDetailsError } from "@opencorp/sdk";

export interface ConfigDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedAgent: string;
  onSelectAgent: (ag: string) => void;
  selectedModel: string;
  onSelectModel: (m: string) => void;
  rotationList: string;
  onUpdateRotationList: (list: string) => void;
  mostrarPensamento: boolean;
  onToggleMostrarPensamento: () => void;
  mostrarAcoes: boolean;
  onToggleMostrarAcoes: () => void;
  simulateRotationError?: boolean;
  onToggleSimulateRotationError?: () => void;
  onTriggerRotationDemo?: () => void;
}

const AGENT_OPTIONS = [
  { id: "secretario-exec", role: "Orquestrador autônomo com execução de ferramentas", engine: "opencode" },
  { id: "secretario", role: "Consultor executivo e analista estratégico", engine: "opencode" },
  { id: "pautador-youtube", role: "Especialista em pautas, roteiros e SEO para YouTube", engine: "opencode" },
  { id: "pesquisador-fontes", role: "Curador de notícias e métricas de audiência em tempo real", engine: "opencode" },
  { id: "code-reviewer", role: "Auditor técnico de código e boas práticas", engine: "opencode" },
];

const PRESET_MODELS = [
  "openrouter/google/gemini-2.5-flash",
  "meta-llama/llama-3.3-70b-instruct:free",
  "anthropic/claude-3-7-sonnet",
  "deepseek/deepseek-r1:free",
  "openai/gpt-4o-mini",
  "google/gemini-2.0-flash-exp:free",
];

export const SecretarioConfigDrawer: Component<ConfigDrawerProps> = (props) => {
  const { client, tratarErro } = useOpenCorp();
  const [testandoMotor, setTestandoMotor] = createSignal(false);
  const [resultadoTeste, setResultadoTeste] = createSignal<{ ok: boolean; msg: string; latencyMs?: number } | null>(null);

  const testarConexao = async () => {
    setTestandoMotor(true);
    setResultadoTeste(null);
    const inicio = performance.now();
    try {
      const data = await client().secretary.getStatus();
      const tempo = Math.round(performance.now() - inicio);
      if (data.rodando) {
        setResultadoTeste({
          ok: true,
          msg: `Daemon ativo na porta ${data.porta || 4096} — Modelo: ${props.selectedModel.split("/").slice(-1)[0]}`,
          latencyMs: tempo,
        });
      } else {
        setResultadoTeste({
          ok: false,
          msg: "Daemon do Secretário não respondeu ou está inativo",
        });
      }
    } catch (err: unknown) {
      if (err instanceof ProblemDetailsError) {
        setResultadoTeste({
          ok: false,
          msg: `[${err.status}] ${err.title}: ${err.detail ?? "Daemon inacessível"}`,
        });
      } else {
        const msg = err instanceof Error ? err.message : "Falha de conexão com a API do Secretário";
        setResultadoTeste({
          ok: false,
          msg,
        });
      }
      tratarErro(err, "Diagnóstico do Secretário");
    } finally {
      setTestandoMotor(false);
    }
  };

  return (
    <Show when={props.isOpen}>
      {/* Backdrop */}
      <div
        class="fixed inset-0 bg-black/65 z-50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={props.onClose}
      />

      {/* Gaveta Lateral */}
      <aside
        data-testid="drawer-lateral-config"
        class="fixed inset-y-0 right-0 w-84 sm:w-110 bg-zinc-950/98 border-l border-zinc-800 shadow-2xl z-50 flex flex-col backdrop-blur-md animate-in slide-in-from-right duration-250 font-sans select-none text-zinc-200"
      >
        {/* Header do Drawer */}
        <div class="h-12 px-4 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/50">
          <div class="flex items-center gap-2">
            <Cpu size={16} class="text-emerald-400" />
            <span class="font-semibold text-sm text-zinc-100">Configurar Motor & Modelo</span>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            class="h-7 w-7 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 flex items-center justify-center transition-colors cursor-pointer"
            title="Fechar painel"
          >
            <X size={15} />
          </button>
        </div>

        {/* Conteúdo com rolagem */}
        <div class="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin text-xs">
          {/* Seção 1: Controles de Visibilidade do Chat */}
          <div class="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-2.5">
            <div class="flex items-center gap-2 text-zinc-200 font-semibold text-xs border-b border-zinc-800/60 pb-1.5">
              <Sparkles size={13} class="text-purple-400" />
              <span>Visibilidade no Chat</span>
            </div>

            {/* Toggle Raciocínio */}
            <div class="flex items-center justify-between py-1">
              <div class="space-y-0.5">
                <span class="font-medium text-zinc-200 flex items-center gap-1.5">
                  <Brain size={13} class="text-purple-400" />
                  <span>Exibir Pensamento / Raciocínio</span>
                </span>
                <p class="text-[11px] text-zinc-500">
                  Mostra o processo reflexivo do modelo antes da resposta.
                </p>
              </div>
              <button
                type="button"
                onClick={props.onToggleMostrarPensamento}
                class={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                  props.mostrarPensamento ? "bg-purple-600" : "bg-zinc-800"
                }`}
              >
                <div
                  class={`h-4.5 w-4.5 rounded-full bg-white transition-transform duration-200 absolute top-0.75 ${
                    props.mostrarPensamento ? "left-5.5" : "left-1"
                  }`}
                />
              </button>
            </div>

            {/* Toggle Ações / Shell */}
            <div class="flex items-center justify-between py-1 border-t border-zinc-800/40">
              <div class="space-y-0.5">
                <span class="font-medium text-zinc-200 flex items-center gap-1.5">
                  <Terminal size={13} class="text-amber-400" />
                  <span>Exibir Passos de Ferramentas / Shell</span>
                </span>
                <p class="text-[11px] text-zinc-500">
                  Exibe a linha de comando executada e a saída do stdout.
                </p>
              </div>
              <button
                type="button"
                onClick={props.onToggleMostrarAcoes}
                class={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                  props.mostrarAcoes ? "bg-emerald-600" : "bg-zinc-800"
                }`}
              >
                <div
                  class={`h-4.5 w-4.5 rounded-full bg-white transition-transform duration-200 absolute top-0.75 ${
                    props.mostrarAcoes ? "left-5.5" : "left-1"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Seção 2: Simulação de Erro e Rotação Automática (Fallback) */}
          <Show when={props.onTriggerRotationDemo}>
            <div class="p-3 rounded-xl bg-amber-950/20 border border-amber-800/40 space-y-2.5">
              <div class="flex items-center justify-between border-b border-amber-900/40 pb-1.5">
                <div class="flex items-center gap-1.5 text-amber-300 font-semibold text-xs">
                  <RotateCw size={13} class="text-amber-400" />
                  <span>Simulação de Falha & Rotação</span>
                </div>
                <span class="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-950/60 text-amber-400 border border-amber-800/60">
                  FALLBACK DEMO
                </span>
              </div>
              <p class="text-[11px] text-zinc-400 leading-relaxed">
                Simula erro <strong>429 (Rate Limit / Quota Exceeded)</strong> no modelo principal e disparo imediato do fallback para o próximo modelo da lista.
              </p>
              <div class="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={props.onTriggerRotationDemo}
                  class="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-zinc-950 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-md"
                >
                  <RotateCw size={12} />
                  <span>Disparar Demonstração de Rotação</span>
                </button>
              </div>
            </div>
          </Show>

          {/* Seção 3: Escolha do Agente */}
          <div class="space-y-1.5">
            <label class="font-medium text-zinc-300 block">Agente do Workspace</label>
            <select
              class="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/80 cursor-pointer"
              value={props.selectedAgent}
              onChange={(e) => props.onSelectAgent(e.currentTarget.value)}
            >
              <For each={AGENT_OPTIONS}>
                {(ag) => (
                  <option value={ag.id}>
                    {ag.id} — {ag.role} ({ag.engine})
                  </option>
                )}
              </For>
            </select>
            <p class="text-[11px] text-zinc-500">
              Direciona ordens do chat para o agente especialista correspondente.
            </p>
          </div>

          {/* Seção 4: Motor de Execução (Harness) */}
          <div class="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between">
            <div class="space-y-0.5">
              <span class="font-medium text-zinc-300 block">Motor de Execução (Harness)</span>
              <p class="text-[11px] text-zinc-500">
                Inferido por <span class="font-mono text-zinc-400">provedor/modelo</span>
              </p>
            </div>
            <span class="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-emerald-400 border border-zinc-700/60 font-semibold">
              híbrido (opencode + direct llm)
            </span>
          </div>

          {/* Seção 5: Modelo Principal */}
          <div class="space-y-1.5">
            <label class="font-medium text-zinc-300 block">Modelo Principal</label>
            <input
              type="text"
              class="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/80"
              value={props.selectedModel}
              onInput={(e) => props.onSelectModel(e.currentTarget.value)}
            />

            {/* Presets Rápidos */}
            <div class="space-y-1 pt-1">
              <span class="text-[11px] text-zinc-400 flex items-center gap-1">
                <Sparkles size={11} class="text-amber-400" /> Presets rápidos:
              </span>
              <div class="flex flex-wrap gap-1">
                <For each={PRESET_MODELS}>
                  {(mod) => {
                    const isSel = () => props.selectedModel === mod;
                    return (
                      <button
                        type="button"
                        onClick={() => props.onSelectModel(mod)}
                        class={`px-2 py-0.5 rounded-full text-[10px] font-mono border transition-colors cursor-pointer ${
                          isSel()
                            ? "bg-emerald-950/50 text-emerald-300 border-emerald-500/70 font-semibold"
                            : "bg-zinc-855/80 hover:bg-zinc-750 text-zinc-300 border-zinc-700/60"
                        }`}
                      >
                        {mod.split("/").slice(-1)[0]}
                      </button>
                    );
                  }}
                </For>
              </div>
            </div>
          </div>

          {/* Seção 6: Lista de Rotação / Fallback */}
          <div class="space-y-1.5">
            <label class="font-medium text-zinc-300 block">
              Lista de Rotação / Fallback
            </label>
            <textarea
              rows={3}
              class="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/80 scrollbar-thin resize-none leading-relaxed"
              value={props.rotationList}
              onInput={(e) => props.onUpdateRotationList(e.currentTarget.value)}
            />
            <div class="p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800/80 space-y-1">
              <div class="flex items-center gap-1 text-zinc-300 font-medium">
                <Info size={12} class="text-emerald-400" />
                <span>Comportamento de Fallback:</span>
              </div>
              <p class="text-[11px] text-zinc-400 leading-snug">
                Se o modelo atual retornar erro ou timeout, o sistema avança para o próximo modelo sem travar o usuário.
              </p>
            </div>
          </div>

          {/* Seção 7: Teste de Conexão */}
          <div class="pt-2 border-t border-zinc-800/80 space-y-2">
            <div class="flex items-center justify-between">
              <span class="font-medium text-zinc-300">Diagnóstico de Conectividade</span>
              <button
                type="button"
                onClick={testarConexao}
                disabled={testandoMotor()}
                class="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-750 text-zinc-200 border border-zinc-700 text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Show when={testandoMotor()} fallback={<Play size={11} class="text-emerald-400" />}>
                  <RefreshCw size={11} class="animate-spin text-emerald-400" />
                </Show>
                <span>{testandoMotor() ? "Testando..." : "Testar Conexão"}</span>
              </button>
            </div>

            <Show when={resultadoTeste()}>
              {(res) => (
                <div
                  class={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                    res().ok
                      ? "bg-emerald-950/20 border-emerald-800/60 text-emerald-300"
                      : "bg-rose-950/20 border-rose-800/60 text-rose-300"
                  }`}
                >
                  <Check size={14} class="shrink-0 mt-0.5 text-emerald-400" />
                  <div class="space-y-0.5">
                    <p class="font-medium">{res().msg}</p>
                    <Show when={res().latencyMs}>
                      <p class="text-[10px] text-zinc-400 font-mono">
                        Latência aferida: {res().latencyMs}ms
                      </p>
                    </Show>
                  </div>
                </div>
              )}
            </Show>
          </div>
        </div>

        {/* Rodapé de Ações */}
        <div class="p-3 border-t border-zinc-800/80 flex items-center justify-between gap-2 bg-zinc-900/60">
          <button
            type="button"
            onClick={props.onClose}
            class="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <div class="flex items-center gap-2">
            <button
              type="button"
              onClick={props.onClose}
              class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-md"
            >
              <Check size={13} />
              <span>Salvar e Aplicar</span>
            </button>
          </div>
        </div>
      </aside>
    </Show>
  );
};
export default SecretarioConfigDrawer;
