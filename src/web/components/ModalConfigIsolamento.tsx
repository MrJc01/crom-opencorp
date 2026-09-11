import { type Component, createSignal, createEffect, Show } from "solid-js";
import { Shield, Zap, Container, Cpu, HardDrive, Sliders } from "lucide-solid";
import { Modal } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { showToast } from "../ui/Toast";
import { fetchApi, wsAtivo } from "../lib/context";

export interface ModalConfigIsolamentoProps {
  open: boolean;
  onClose: () => void;
  driverAtual?: {
    driver_configurado: string;
    driver_ativo: string;
    limites?: { ramMb?: number; cpuPct?: number };
  } | null;
  onSalvo?: () => void;
}

export const ModalConfigIsolamento: Component<ModalConfigIsolamentoProps> = (props) => {
  const [driver, setDriver] = createSignal<string>("sandbox");
  const [ramMb, setRamMb] = createSignal<number | "">("");
  const [cpuPct, setCpuPct] = createSignal<number | "">("");
  const [redeIsolada, setRedeIsolada] = createSignal(false);
  const [salvando, setSalvando] = createSignal(false);

  createEffect(() => {
    if (props.open && props.driverAtual) {
      setDriver(props.driverAtual.driver_configurado || "sandbox");
      setRamMb(props.driverAtual.limites?.ramMb ?? "");
      setCpuPct(props.driverAtual.limites?.cpuPct ?? "");
      setRedeIsolada(Boolean((props.driverAtual.limites as { redeIsolada?: boolean } | undefined)?.redeIsolada));
    }
  });

  const salvar = async () => {
    setSalvando(true);
    try {
      const payload = {
        driver: driver(),
        limites: {
          ramMb: ramMb() !== "" ? Number(ramMb()) : undefined,
          cpuPct: cpuPct() !== "" ? Number(cpuPct()) : undefined,
          redeIsolada: redeIsolada(),
        },
      };

      const res = await fetchApi<{ ok?: boolean; erro?: string; mensagem?: string }>("/workspaces/driver-config", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (res && res.ok === false) {
        showToast(res.erro || "Falha ao salvar configuração", "erro");
        return;
      }

      showToast(res?.mensagem || "Configuração de isolamento e limites salva!", "sucesso");
      props.onSalvo?.();
      props.onClose();
    } catch (err: any) {
      showToast("Erro ao salvar: " + (err.message || String(err)), "erro");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal open={props.open} onClose={props.onClose} title="Isolamento & Limites de Recursos">
      <div class="space-y-5 p-1">
        {/* Workspace info */}
        <div class="flex items-center justify-between text-xs bg-zinc-900/80 border border-zinc-800 rounded-lg px-3 py-2">
          <span class="text-zinc-400">Workspace Ativo:</span>
          <span class="font-mono font-semibold text-emerald-400">{wsAtivo() || "padrão"}</span>
        </div>

        {/* Escolha de Driver */}
        <div class="space-y-2">
          <label class="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
            <Sliders size={14} class="text-sky-400" />
            Driver de Execução dos Agentes
          </label>
          <p class="text-[11px] text-zinc-500">
            Define a camada de isolamento do sistema operacional sob a qual os agentes e runners rodam.
          </p>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            {/* Sandbox */}
            <button
              type="button"
              onClick={() => setDriver("sandbox")}
              class={`flex flex-col items-start p-3 rounded-xl border text-left transition-all cursor-pointer ${
                driver() === "sandbox"
                  ? "bg-emerald-950/40 border-emerald-500/60 ring-1 ring-emerald-500/40"
                  : "bg-zinc-900/60 border-zinc-800 hover:border-zinc-700"
              }`}
            >
              <div class="flex items-center justify-between w-full mb-1.5">
                <div class="flex items-center gap-1.5 font-bold text-xs text-emerald-400">
                  <Shield size={14} />
                  <span>Sandbox</span>
                </div>
              </div>
              <span class="text-[10px] text-zinc-400 leading-tight">
                Bubblewrap (bwrap) com namespace isolado e leitura estrita.
              </span>
            </button>

            {/* Host */}
            <button
              type="button"
              onClick={() => setDriver("host")}
              class={`flex flex-col items-start p-3 rounded-xl border text-left transition-all cursor-pointer ${
                driver() === "host"
                  ? "bg-amber-950/40 border-amber-500/60 ring-1 ring-amber-500/40"
                  : "bg-zinc-900/60 border-zinc-800 hover:border-zinc-700"
              }`}
            >
              <div class="flex items-center justify-between w-full mb-1.5">
                <div class="flex items-center gap-1.5 font-bold text-xs text-amber-400">
                  <Zap size={14} />
                  <span>Host</span>
                </div>
              </div>
              <span class="text-[10px] text-zinc-400 leading-tight">
                Execução nativa direta na máquina hospedeira sem camadas extras.
              </span>
            </button>

            {/* Container */}
            <button
              type="button"
              onClick={() => setDriver("container")}
              class={`flex flex-col items-start p-3 rounded-xl border text-left transition-all cursor-pointer ${
                driver() === "container"
                  ? "bg-blue-950/40 border-blue-500/60 ring-1 ring-blue-500/40"
                  : "bg-zinc-900/60 border-zinc-800 hover:border-zinc-700"
              }`}
            >
              <div class="flex items-center justify-between w-full mb-1.5">
                <div class="flex items-center gap-1.5 font-bold text-xs text-blue-400">
                  <Container size={14} />
                  <span>Container</span>
                </div>
              </div>
              <span class="text-[10px] text-zinc-400 leading-tight">
                Contêiner isolado (Docker / Podman) com sistema de arquivos OCI.
              </span>
            </button>
          </div>
        </div>

        {/* Limite de Memória RAM */}
        <div class="space-y-2 border-t border-zinc-800/80 pt-3">
          <div class="flex items-center justify-between">
            <label class="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
              <HardDrive size={14} class="text-emerald-400" />
              Teto de Memória RAM (cgroups / limits)
            </label>
            <span class="text-xs font-mono font-bold text-emerald-400">
              {ramMb() !== "" ? `${ramMb()} MB` : "Sem limite (Livre)"}
            </span>
          </div>

          <div class="flex items-center gap-1.5">
            <input
              type="number"
              min="128"
              max="65536"
              step="128"
              placeholder="Ex: 1024 (vazio para sem limite)"
              class="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 font-mono"
              value={ramMb()}
              onInput={(e) => setRamMb(e.currentTarget.value ? Number(e.currentTarget.value) : "")}
            />
            <span class="text-xs text-zinc-500 font-mono">MB</span>
          </div>

          {/* Presets de RAM */}
          <div class="flex items-center gap-1.5 pt-0.5">
            <span class="text-[10px] text-zinc-500">Presets:</span>
            {[
              { label: "Livre", val: "" as const },
              { label: "512M", val: 512 },
              { label: "1GB", val: 1024 },
              { label: "2GB", val: 2048 },
              { label: "4GB", val: 4096 },
            ].map((p) => (
              <button
                type="button"
                onClick={() => setRamMb(p.val)}
                class={`px-2 py-0.5 rounded text-[10px] font-mono border transition-all cursor-pointer ${
                  ramMb() === p.val
                    ? "bg-emerald-950/60 border-emerald-600 text-emerald-300"
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Limite de CPU */}
        <div class="space-y-2 border-t border-zinc-800/80 pt-3">
          <div class="flex items-center justify-between">
            <label class="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
              <Cpu size={14} class="text-sky-400" />
              Teto de Uso de CPU (Quota)
            </label>
            <span class="text-xs font-mono font-bold text-sky-400">
              {cpuPct() !== "" ? `${cpuPct()}% de 1 Núcleo` : "Sem limite (100%+)"}
            </span>
          </div>

          <div class="flex items-center gap-1.5">
            <input
              type="number"
              min="10"
              max="400"
              step="10"
              placeholder="Ex: 50 (vazio para sem limite)"
              class="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-sky-500 font-mono"
              value={cpuPct()}
              onInput={(e) => setCpuPct(e.currentTarget.value ? Number(e.currentTarget.value) : "")}
            />
            <span class="text-xs text-zinc-500 font-mono">%</span>
          </div>

          {/* Presets de CPU */}
          <div class="flex items-center gap-1.5 pt-0.5">
            <span class="text-[10px] text-zinc-500">Presets:</span>
            {[
              { label: "Livre", val: "" as const },
              { label: "25%", val: 25 },
              { label: "50%", val: 50 },
              { label: "75%", val: 75 },
              { label: "100%", val: 100 },
            ].map((p) => (
              <button
                type="button"
                onClick={() => setCpuPct(p.val)}
                class={`px-2 py-0.5 rounded text-[10px] font-mono border transition-all cursor-pointer ${
                  cpuPct() === p.val
                    ? "bg-sky-950/60 border-sky-600 text-sky-300"
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Rodapé Ações */}
        <div class="space-y-2 border-t border-zinc-800/80 pt-3">
          <label class="text-xs font-semibold text-zinc-300 flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={redeIsolada()}
              onChange={(e) => setRedeIsolada(e.currentTarget.checked)}
              class="accent-emerald-500"
            />
            Isolamento de rede no sandbox (--unshare-net)
          </label>
          <p class="text-[11px] text-zinc-500">Bloqueia acesso externo dos agentes (previne exfiltração). Deixe desligado se o agente precisa de internet.</p>
        </div>

        <div class="flex items-center justify-end gap-2 pt-4 border-t border-zinc-800">
          <Button size="sm" variant="secondary" onClick={props.onClose}>
            Cancelar
          </Button>
          <Button size="sm" variant="primary" onClick={salvar} disabled={salvando()}>
            {salvando() ? "Salvando..." : "Salvar Configuração"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
