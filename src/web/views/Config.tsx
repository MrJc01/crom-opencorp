import { type Component, createSignal, onMount, For, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import {
  Settings,
  Cpu,
  Key,
  Shield,
  CircleCheck,
  Bot,
  Activity,
  Layers,
  Coins,
  Clock,
  Folder,
  Users,
  Wrench,
  Stethoscope,
  Terminal,
} from "lucide-solid";
import { showToast } from "../ui/Toast";
import { fetchApi, wsAtivo } from "../lib/context";
import {
  TabGeneral,
  TabEngines,
  TabModels,
  TabSecrets,
  TabSkillsTools,
  TabSecurityBudget,
  TabDoctor,
  TabRunner,
} from "./config/tabs";
import type { TabConfigId, EntradaSettingsRow } from "./config/tabs";

export type { TabConfigId } from "./config/tabs";

export const ABAS_CONFIG: Array<{ id: TabConfigId; label: string; icon: any }> = [
  { id: "motores", label: "Motores & Provedores", icon: Bot },
  { id: "limites", label: "Limites dos Motores", icon: Activity },
  { id: "modelos", label: "Modelos", icon: Cpu },
  { id: "orcamento", label: "Orçamento", icon: Coins },
  { id: "seguranca", label: "Segurança", icon: Shield },
  { id: "scheduler", label: "Scheduler", icon: Clock },
  { id: "workspace", label: "Workspace", icon: Folder },
  { id: "testes", label: "Testes", icon: CircleCheck },
  { id: "reunioes", label: "Reuniões", icon: Users },
  { id: "chaves", label: "Chaves de API & Secrets", icon: Key },
  { id: "ferramentas", label: "Ferramentas", icon: Wrench },
  { id: "geral", label: "Geral", icon: Settings },
  { id: "doctor", label: "Doctor SRE", icon: Stethoscope },
  { id: "runner", label: "Runner Daemon", icon: Terminal },
];

export const ConfigView: Component = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const abaAtiva = () => (searchParams.tab as TabConfigId) || "motores";
  const setAbaAtiva = (tab: TabConfigId) => setSearchParams({ tab });

  // Escopo de Configuração: Global vs Workspace
  const [escopoConfig, setEscopoConfig] = createSignal<"global" | "workspace">("global");
  const [todasEntradas, setTodasEntradas] = createSignal<EntradaSettingsRow[]>([]);
  const [salvando, setSalvando] = createSignal(false);

  const carregarSettings = async () => {
    try {
      const data = await fetchApi<any>(`/settings?escopo=${escopoConfig()}`);
      if (Array.isArray(data)) {
        setTodasEntradas(data);
      } else if (data && Array.isArray(data.dados)) {
        setTodasEntradas(data.dados);
      }
    } catch (err: any) {
      console.error("Falha ao carregar configurações gerais:", err);
    }
  };

  const salvarChaveConfig = async (chave: string, valor: unknown) => {
    setSalvando(true);
    try {
      let vFinal: string = typeof valor === "object" && valor !== null ? JSON.stringify(valor) : String(valor);
      await fetchApi("/settings", {
        method: "PUT",
        body: JSON.stringify({ chave, valor: vFinal, scope: escopoConfig() }),
      });
      showToast(`"${chave}" salvo!`, "sucesso");
      await carregarSettings();
    } catch (err: any) {
      showToast(`Erro ao salvar "${chave}": ${err.message}`, "erro");
    } finally {
      setSalvando(false);
    }
  };

  onMount(() => {
    void carregarSettings();
  });

  return (
    <div class="flex flex-col h-full p-3.5 sm:p-6 space-y-4 overflow-y-auto overflow-x-hidden scrollbar-thin">
      {/* CABEÇALHO DA CENTRAL */}
      <div class="pb-2 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 class="text-base sm:text-lg font-bold text-zinc-100 tracking-tight">Configurações do Sistema</h1>
          <p class="text-xs text-zinc-400">
            Governança, motores de agentes autônomos, inferência direta e catálogo de inteligência.
          </p>
        </div>

        {/* SELETOR DE ESCOPO: GLOBAL VS WORKSPACE */}
        <div class="flex items-center bg-zinc-950 p-1 rounded-xl border border-zinc-800 w-full sm:w-auto">
          <button
            class={`flex-1 sm:flex-initial justify-center px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              escopoConfig() === "global"
                ? "bg-cyan-600 text-white shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
            onClick={() => {
              setEscopoConfig("global");
              void carregarSettings();
            }}
          >
            <Layers size={13} class="shrink-0" />
            <span>Global (Sistema)</span>
          </button>
          <button
            class={`flex-1 sm:flex-initial justify-center px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              escopoConfig() === "workspace"
                ? "bg-purple-600 text-white shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
            onClick={() => {
              if (!wsAtivo()) {
                showToast("Nenhum workspace ativo no momento", "aviso");
                return;
              }
              setEscopoConfig("workspace");
              void carregarSettings();
            }}
          >
            <Bot size={13} class="shrink-0" />
            <span class="truncate">Workspace: {wsAtivo() || "Nenhum"}</span>
          </button>
        </div>
      </div>

      {/* Indicador visual de escopo ativo */}
      <div class="py-1 flex items-center justify-between text-xs bg-transparent">
        <Show when={escopoConfig() === "global"}>
          <div class="flex items-center gap-2 text-cyan-400">
            <span class="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
            <span class="font-medium">Escopo Global:</span>
            <span class="text-zinc-400 truncate">Configurações padrão para todas as empresas.</span>
          </div>
        </Show>
        <Show when={escopoConfig() === "workspace"}>
          <div class="flex items-center gap-2 text-purple-400">
            <span class="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
            <span class="font-medium">Escopo Workspace:</span>
            <span class="text-zinc-400 truncate">Configurações exclusivas de "{wsAtivo()}".</span>
          </div>
        </Show>
      </div>

      {/* Abas de Navegação */}
      <div class="flex items-center gap-1.5 border-b border-zinc-800/40 pb-2.5 shrink-0 overflow-x-auto scrollbar-none -mx-3.5 px-3.5 sm:mx-0 sm:px-0 sm:flex-wrap">
        <For each={ABAS_CONFIG}>
          {(aba) => {
            const Icon = aba.icon;
            const ativa = () => abaAtiva() === aba.id;
            return (
              <button
                type="button"
                class={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap ${
                  ativa()
                    ? "text-zinc-100 bg-zinc-800/80 font-semibold shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30"
                }`}
                onClick={() => setAbaAtiva(aba.id)}
              >
                <Icon size={13} class={ativa() ? "text-zinc-200" : "text-zinc-500"} />
                {aba.label}
              </button>
            );
          }}
        </For>
      </div>

      {/* Conteúdo das Abas Modulares */}
      <div class="w-full max-w-6xl space-y-6">
        <Show when={abaAtiva() === "motores" || abaAtiva() === "limites"}>
          <TabEngines
            abaAtiva={abaAtiva}
            escopoConfig={escopoConfig}
            wsAtivo={wsAtivo}
            onGoToKeysTab={() => setAbaAtiva("chaves")}
          />
        </Show>

        <Show when={abaAtiva() === "modelos"}>
          <TabModels
            todasEntradas={todasEntradas}
            onSalvarChave={salvarChaveConfig}
            salvando={salvando}
          />
        </Show>

        <Show when={abaAtiva() === "orcamento" || abaAtiva() === "seguranca"}>
          <TabSecurityBudget
            abaAtiva={abaAtiva}
            todasEntradas={todasEntradas}
            onSalvarChave={salvarChaveConfig}
            salvando={salvando}
          />
        </Show>

        <Show when={abaAtiva() === "chaves"}>
          <TabSecrets escopoConfig={escopoConfig} />
        </Show>

        <Show when={abaAtiva() === "ferramentas"}>
          <TabSkillsTools />
        </Show>

        <Show when={["scheduler", "workspace", "testes", "reunioes", "geral"].includes(abaAtiva())}>
          <TabGeneral
            abaAtiva={abaAtiva}
            todasEntradas={todasEntradas}
            onSalvarChave={salvarChaveConfig}
            salvando={salvando}
          />
        </Show>

        <Show when={abaAtiva() === "doctor"}>
          <TabDoctor />
        </Show>

        <Show when={abaAtiva() === "runner"}>
          <TabRunner />
        </Show>
      </div>
    </div>
  );
};
