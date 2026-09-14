import { type Component, createSignal, onMount, Show, For } from "solid-js";
import { Wrench, RefreshCw } from "lucide-solid";
import { Button } from "../../../ui/Button";
import { fetchApi } from "../../../lib/context";
import { type ToolItem } from "./types";

export const TabSkillsTools: Component = () => {
  const [toolsLista, setToolsLista] = createSignal<ToolItem[]>([]);
  const [carregandoTools, setCarregandoTools] = createSignal(false);

  const carregarTools = async () => {
    setCarregandoTools(true);
    try {
      const data = await fetchApi<ToolItem[]>("/tools");
      setToolsLista(Array.isArray(data) ? data : []);
    } catch {
      setToolsLista([]);
    } finally {
      setCarregandoTools(false);
    }
  };

  onMount(() => {
    void carregarTools();
  });

  return (
    <div class="space-y-6 bg-transparent">
      <div class="flex items-center justify-between pb-1 border-b border-zinc-800/40">
        <div>
          <h2 class="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <Wrench size={15} class="text-zinc-400" />
            Ferramentas & Integrações (Tools)
          </h2>
          <p class="text-xs text-zinc-400 mt-0.5">
            Catálogo de ferramentas disponíveis em .opencorp/tools/ com especificações e permissões de execução.
          </p>
        </div>
        <Button size="xs" variant="ghost" loading={carregandoTools()} onClick={carregarTools}>
          <RefreshCw size={12} class="mr-1" /> Atualizar
        </Button>
      </div>

      <div class="divide-y divide-zinc-800/40">
        <For each={toolsLista()}>
          {(tool) => (
            <div class="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-transparent">
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-semibold text-zinc-100 font-mono">{tool.name}</span>
                  <span class="text-[10px] font-mono px-1.5 py-0.2 rounded border text-zinc-400 bg-zinc-800/40 border-zinc-700/40">
                    {tool.scope || "global"}
                  </span>
                  <Show when={tool.requiresApproval}>
                    <span class="text-[10px] font-mono px-1.5 py-0.2 rounded border text-amber-400 bg-amber-950/40 border-amber-800/40">
                      requer aprovação
                    </span>
                  </Show>
                </div>
                <p class="text-xs text-zinc-400 leading-relaxed">{tool.description}</p>
                <Show when={tool.parameters && Object.keys(tool.parameters).length > 0}>
                  <div class="text-[11px] font-mono text-zinc-500 pt-0.5">
                    Parâmetros: {Object.keys(tool.parameters).join(", ")}
                  </div>
                </Show>
              </div>

              <div class="flex items-center gap-2 shrink-0 self-start sm:self-center">
                <span class="text-[11px] font-mono text-zinc-500">
                  {tool.enabled !== false ? "Ativa" : "Desativada"}
                </span>
              </div>
            </div>
          )}
        </For>

        <Show when={toolsLista().length === 0 && !carregandoTools()}>
          <div class="py-6 text-center text-xs text-zinc-500">
            Nenhuma ferramenta customizada encontrada em .opencorp/tools/
          </div>
        </Show>
      </div>
    </div>
  );
};
