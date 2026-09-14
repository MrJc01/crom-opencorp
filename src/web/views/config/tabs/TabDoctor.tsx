import { type Component, createSignal, onMount, Show, For } from "solid-js";
import { Activity, RefreshCw, Wrench, CheckCircle, AlertTriangle, XCircle } from "lucide-solid";
import { Button } from "../../../ui/Button";
import { showToast } from "../../../ui/Toast";
import { fetchApi } from "../../../lib/context";
import { type DoctorCheck, type DoctorReport } from "./types";

export const TabDoctor: Component = () => {
  const [report, setReport] = createSignal<DoctorReport | null>(null);
  const [carregando, setCarregando] = createSignal(false);
  const [reparando, setReparando] = createSignal(false);

  const carregarDoctor = async () => {
    setCarregando(true);
    try {
      const data = await fetchApi<DoctorReport>("/doctor");
      setReport(data);
    } catch (err: any) {
      showToast(`Falha ao executar autodiagnóstico: ${err?.message || err}`, "erro");
    } finally {
      setCarregando(false);
    }
  };

  const executarReparo = async () => {
    setReparando(true);
    try {
      const res = await fetchApi<any>("/doctor/fix", { method: "POST" });
      showToast(res?.mensagem || "Auto-reparo concluído!", "sucesso");
      await carregarDoctor();
    } catch (err: any) {
      showToast(`Erro durante auto-reparo: ${err?.message || err}`, "erro");
    } finally {
      setReparando(false);
    }
  };

  onMount(() => {
    void carregarDoctor();
  });

  return (
    <div class="space-y-6 bg-transparent">
      <div class="flex items-center justify-between pb-1 border-b border-zinc-800/40">
        <div>
          <h2 class="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <Activity size={15} class="text-zinc-400" />
            Autodiagnóstico do Sistema (Doctor SRE)
          </h2>
          <p class="text-xs text-zinc-400 mt-0.5">
            Inspeção automática de integridade do OpenCode, API, daemon de supervisão e portas de rede.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <Button
            size="xs"
            variant="secondary"
            loading={reparando()}
            onClick={executarReparo}
            title="Tentar remediação e autocura automática"
          >
            <Wrench size={12} class="mr-1 text-orange-400" /> Auto-Reparar (Fix)
          </Button>
          <Button size="xs" variant="ghost" loading={carregando()} onClick={carregarDoctor}>
            <RefreshCw size={12} class="mr-1" /> Diagnosticar
          </Button>
        </div>
      </div>

      <Show when={report()}>
        {(rep) => (
          <div class="space-y-4">
            <div class="flex items-center gap-3 p-3 rounded-lg bg-zinc-900/40 border border-zinc-800/60 text-xs">
              <span
                class={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  rep().ok ? "bg-emerald-400" : "bg-rose-400 animate-pulse"
                }`}
              />
              <span class="font-semibold text-zinc-200">
                {rep().ok ? "Sistema Operando Normalmente" : "Problemas Detectados no Ambiente"}
              </span>
              <span class="text-zinc-500 font-mono text-[11px] ml-auto">
                {rep().timestamp}
              </span>
            </div>

            <div class="divide-y divide-zinc-800/40 border border-zinc-800/60 rounded-xl bg-zinc-900/30 overflow-hidden">
              <For each={rep().checks || []}>
                {(chk: DoctorCheck) => (
                  <div class="p-3.5 flex items-start justify-between gap-3 text-xs">
                    <div class="space-y-1">
                      <div class="flex items-center gap-2">
                        <Show when={chk.status === "ok"}>
                          <CheckCircle size={14} class="text-emerald-400 shrink-0" />
                        </Show>
                        <Show when={chk.status === "aviso"}>
                          <AlertTriangle size={14} class="text-amber-400 shrink-0" />
                        </Show>
                        <Show when={chk.status === "erro"}>
                          <XCircle size={14} class="text-rose-400 shrink-0" />
                        </Show>
                        <span class="font-medium text-zinc-100">{chk.nome}</span>
                        <span class="text-[10px] font-mono text-zinc-500">[{chk.id}]</span>
                      </div>
                      <p class="text-zinc-400 text-[11px] leading-relaxed pl-5.5">{chk.mensagem}</p>
                      <Show when={chk.reparo}>
                        <p class="text-orange-400/90 text-[10px] font-mono pl-5.5">
                          Sugestão: {chk.reparo}
                        </p>
                      </Show>
                    </div>
                    <span
                      class={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border shrink-0 ${
                        chk.status === "ok"
                          ? "text-emerald-400 bg-emerald-950/40 border-emerald-800/40"
                          : chk.status === "aviso"
                          ? "text-amber-400 bg-amber-950/40 border-amber-800/40"
                          : "text-rose-400 bg-rose-950/40 border-rose-800/40"
                      }`}
                    >
                      {chk.status}
                    </span>
                  </div>
                )}
              </For>
            </div>
          </div>
        )}
      </Show>

      <Show when={!report() && !carregando()}>
        <div class="py-12 text-center text-xs text-zinc-500">
          Nenhum relatório de diagnóstico carregado. Clique em "Diagnosticar" para iniciar.
        </div>
      </Show>
    </div>
  );
};
