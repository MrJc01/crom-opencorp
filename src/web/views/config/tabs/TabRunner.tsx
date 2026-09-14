import { type Component, createSignal, onMount, Show } from "solid-js";
import { Server, RefreshCw, Save, Shield } from "lucide-solid";
import { Button } from "../../../ui/Button";
import { showToast } from "../../../ui/Toast";
import { fetchApi } from "../../../lib/context";
import { type RunnerSettings } from "./types";

export const TabRunner: Component = () => {
  const [runner, setRunner] = createSignal<RunnerSettings>({
    engine: "opencode",
    binary_path: "opencode",
    timeout_min: 20,
    max_concurrency: 4,
    auto_restart: true,
    port: 4096,
  });
  const [carregando, setCarregando] = createSignal(false);
  const [salvando, setSalvando] = createSignal(false);

  const carregarRunner = async () => {
    setCarregando(true);
    try {
      const data = await fetchApi<RunnerSettings>("/settings/runner");
      if (data) {
        setRunner({
          engine: data.engine || "opencode",
          binary_path: data.binary_path || "opencode",
          timeout_min: data.timeout_min ?? 20,
          max_concurrency: data.max_concurrency ?? 4,
          auto_restart: data.auto_restart ?? true,
          port: data.port ?? 4096,
        });
      }
    } catch {
      // Usa valores padrão se a rota não estiver pronta
    } finally {
      setCarregando(false);
    }
  };

  const salvarRunner = async () => {
    setSalvando(true);
    try {
      await fetchApi("/settings/runner", {
        method: "PUT",
        body: JSON.stringify(runner()),
      });
      showToast("Configurações do Runner daemon salvas!", "sucesso");
      await carregarRunner();
    } catch (err: any) {
      showToast(`Erro ao salvar: ${err?.message || err}`, "erro");
    } finally {
      setSalvando(false);
    }
  };

  onMount(() => {
    void carregarRunner();
  });

  return (
    <div class="space-y-6 bg-transparent">
      <div class="flex items-center justify-between pb-1 border-b border-zinc-800/40">
        <div>
          <h2 class="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <Server size={15} class="text-zinc-400" />
            Configuração do Runner Daemon
          </h2>
          <p class="text-xs text-zinc-400 mt-0.5">
            Processo em segundo plano que orquestra workspaces, janelas de agentes e workers de tarefas.
          </p>
        </div>
        <Button size="xs" variant="ghost" loading={carregando()} onClick={carregarRunner}>
          <RefreshCw size={12} class="mr-1" /> Atualizar
        </Button>
      </div>

      <div class="space-y-4 max-w-2xl">
        <div class="space-y-1.5">
          <label class="block text-xs font-semibold text-zinc-200">Motor de Execução Padrão</label>
          <input
            type="text"
            value={runner().engine || "opencode"}
            onInput={(e) => setRunner((p) => ({ ...p, engine: e.currentTarget.value }))}
            class="w-full bg-zinc-900/80 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-600"
          />
        </div>

        <div class="space-y-1.5">
          <label class="block text-xs font-semibold text-zinc-200">Caminho do Binário OpenCode</label>
          <input
            type="text"
            value={runner().binary_path || "opencode"}
            onInput={(e) => setRunner((p) => ({ ...p, binary_path: e.currentTarget.value }))}
            class="w-full bg-zinc-900/80 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-600"
          />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-zinc-200">Timeout por Turno (minutos)</label>
            <input
              type="number"
              min="1"
              max="120"
              value={runner().timeout_min ?? 20}
              onInput={(e) => setRunner((p) => ({ ...p, timeout_min: Number(e.currentTarget.value) }))}
              class="w-full bg-zinc-900/80 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-600"
            />
          </div>

          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-zinc-200">Concorrência Máxima</label>
            <input
              type="number"
              min="1"
              max="32"
              value={runner().max_concurrency ?? 4}
              onInput={(e) => setRunner((p) => ({ ...p, max_concurrency: Number(e.currentTarget.value) }))}
              class="w-full bg-zinc-900/80 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-600"
            />
          </div>
        </div>

        <div class="pt-2 flex items-center justify-between p-3 rounded-lg bg-zinc-900/40 border border-zinc-800/60">
          <div>
            <span class="text-xs font-semibold text-zinc-200 block">Auto-Restart em Caso de Falha</span>
            <span class="text-[11px] text-zinc-500">Reinicia automaticamente o worker se o processo for encerrado inesperadamente.</span>
          </div>
          <input
            type="checkbox"
            checked={runner().auto_restart ?? true}
            onChange={(e) => setRunner((p) => ({ ...p, auto_restart: e.currentTarget.checked }))}
            class="accent-orange-500 h-4 w-4"
          />
        </div>

        <div class="pt-4 flex justify-end">
          <Button size="sm" variant="primary" loading={salvando()} onClick={salvarRunner}>
            <Save size={13} class="mr-1.5" /> Salvar Configurações do Runner
          </Button>
        </div>
      </div>
    </div>
  );
};
