import { type Component, createSignal, onMount, For } from "solid-js";
import { GitBranch, Play } from "lucide-solid";
import { Button } from "../ui/Button";
import { showToast } from "../ui/Toast";
import { fetchApi } from "../lib/context";

export const FluxosView: Component = () => {
  const [fluxos, setFluxos] = createSignal<any[]>([]);

  const carregarFluxos = async () => {
    try {
      const lista = await fetchApi<any[]>("/flows");
      setFluxos(lista || []);
    } catch {}
  };

  const rodarFluxo = async (id: string) => {
    try {
      await fetchApi(`/flows/${encodeURIComponent(id)}/run`, { method: "POST" });
      showToast(`Fluxo ${id} disparado com sucesso`, "sucesso");
    } catch (err: any) {
      showToast("Erro ao rodar fluxo: " + err.message, "erro");
    }
  };

  onMount(() => {
    void carregarFluxos();
  });

  return (
    <div class="flex flex-col h-full p-6 space-y-4 overflow-y-auto scrollbar-thin">
      <div class="pb-2 border-b border-zinc-800">
        <h1 class="text-lg font-bold text-zinc-100 tracking-tight">Fluxos de Trabalho</h1>
        <p class="text-xs text-zinc-400">Pipelines de orquestração multi-etapas entre agentes autônomos.</p>
      </div>

      <div class="space-y-3">
        <For
          each={fluxos()}
          fallback={
            <div class="py-12 text-center text-xs text-zinc-500">
              Nenhum fluxo configurado no workspace ativo.
            </div>
          }
        >
          {(f) => (
            <div class="p-4 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="h-8 w-8 rounded-lg bg-zinc-800 flex items-center justify-center text-emerald-400">
                  <GitBranch size={16} />
                </div>
                <div>
                  <div class="text-xs font-semibold text-zinc-100">{f.nome || f.id}</div>
                  <div class="text-[11px] text-zinc-400">{f.descricao || "Pipeline de automação"}</div>
                </div>
              </div>
              <Button size="xs" variant="primary" onClick={() => rodarFluxo(f.id)}>
                <Play size={11} class="mr-1 fill-current" /> Rodar
              </Button>
            </div>
          )}
        </For>
      </div>
    </div>
  );
};
