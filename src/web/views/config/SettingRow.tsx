import {
  type Component,
  createSignal,
  createEffect,
  Show,
  For,
  type Accessor,
} from "solid-js";
import { Check, Save } from "lucide-solid";
import { Button } from "../../ui/Button";
import { type EntradaSettingsRow } from "./tabs/types";

export interface SettingRowProps {
  chave: string;
  label: string;
  descricao: string;
  tipo?: "text" | "number" | "bool" | "textarea" | "select";
  opcoes?: Array<{ valor: string; label: string }>;
  step?: string;
  min?: string;
  todasEntradas: Accessor<EntradaSettingsRow[]>;
  onSalvar: (chave: string, valor: unknown) => Promise<void>;
  salvando?: Accessor<boolean>;
}

export const SettingRow: Component<SettingRowProps> = (props) => {
  const item = () => props.todasEntradas().find((e) => e.chave === props.chave);
  const valorAtual = () => {
    const it = item();
    if (!it) return "";
    if (props.tipo === "textarea" && Array.isArray(it.valor)) {
      return it.valor.join("\n");
    }
    return (it.valor as any) ?? "";
  };
  const [val, setVal] = createSignal<any>(valorAtual());
  const [modificado, setModificado] = createSignal(false);

  createEffect(() => {
    if (!modificado()) {
      setVal(valorAtual());
    }
  });

  const origem = () => item()?.origem || "default";

  const handleSalvar = async () => {
    let finalVal: any = val();
    if (props.tipo === "number") {
      finalVal = Number(finalVal);
    } else if (props.tipo === "textarea") {
      finalVal = String(finalVal)
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    await props.onSalvar(props.chave, finalVal);
    setModificado(false);
  };

  const badgeClass = () => {
    const o = origem();
    if (o === "workspace") return "text-purple-400 bg-purple-950/40 border-purple-800/40";
    if (o === "global") return "text-cyan-400 bg-cyan-950/40 border-cyan-800/40";
    return "text-zinc-400 bg-zinc-800/40 border-zinc-700/40";
  };

  return (
    <div class="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-transparent">
      <div class="space-y-0.5 max-w-md sm:max-w-lg">
        <div class="flex items-center gap-2">
          <span class="text-xs font-medium text-zinc-200">{props.label}</span>
          <span class={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${badgeClass()}`}>
            {origem()}
          </span>
        </div>
        <p class="text-[11px] text-zinc-500 leading-relaxed">{props.descricao}</p>
        <span class="text-[10px] font-mono text-zinc-600 block">{props.chave}</span>
      </div>

      <div class="flex items-center gap-2 shrink-0 self-start sm:self-center">
        <Show when={props.tipo === "bool"}>
          <button
            type="button"
            class={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              Boolean(val()) ? "bg-zinc-200" : "bg-zinc-800"
            }`}
            onClick={async () => {
              const novo = !Boolean(val());
              setVal(novo);
              await props.onSalvar(props.chave, novo);
            }}
          >
            <span
              class={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-zinc-950 shadow-sm ring-0 transition duration-200 ease-in-out ${
                Boolean(val()) ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </Show>

        <Show when={props.tipo === "select"}>
          <select
            value={String(val())}
            onChange={(e) => {
              setVal(e.currentTarget.value);
              void props.onSalvar(props.chave, e.currentTarget.value);
            }}
            class="bg-zinc-900/80 border border-zinc-800 rounded-md px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600"
          >
            <For each={props.opcoes || []}>
              {(op) => <option value={op.valor}>{op.label}</option>}
            </For>
          </select>
        </Show>

        <Show when={props.tipo === "number"}>
          <div class="flex items-center gap-1.5">
            <input
              type="number"
              step={props.step || "1"}
              min={props.min}
              value={val() ?? ""}
              onInput={(e) => {
                setVal(e.currentTarget.value);
                setModificado(true);
              }}
              class="w-24 bg-zinc-900/80 border border-zinc-800 rounded-md px-2 py-1 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-600 text-right"
            />
            <Show when={modificado()}>
              <Button size="xs" variant="secondary" onClick={handleSalvar} loading={props.salvando?.() ?? false}>
                <Check size={11} />
              </Button>
            </Show>
          </div>
        </Show>

        <Show when={!props.tipo || props.tipo === "text"}>
          <div class="flex items-center gap-1.5">
            <input
              type="text"
              value={val() ?? ""}
              onInput={(e) => {
                setVal(e.currentTarget.value);
                setModificado(true);
              }}
              class="w-48 sm:w-64 bg-zinc-900/80 border border-zinc-800 rounded-md px-2 py-1 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-600"
            />
            <Show when={modificado()}>
              <Button size="xs" variant="secondary" onClick={handleSalvar} loading={props.salvando?.() ?? false}>
                <Check size={11} />
              </Button>
            </Show>
          </div>
        </Show>

        <Show when={props.tipo === "textarea"}>
          <div class="space-y-1.5 w-full sm:w-80">
            <textarea
              rows={3}
              value={val() ?? ""}
              onInput={(e) => {
                setVal(e.currentTarget.value);
                setModificado(true);
              }}
              class="w-full bg-zinc-900/80 border border-zinc-800 rounded-md p-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-600 leading-relaxed"
            />
            <Show when={modificado()}>
              <div class="flex justify-end">
                <Button size="xs" variant="secondary" onClick={handleSalvar} loading={props.salvando?.() ?? false}>
                  <Save size={11} class="mr-1" /> Salvar
                </Button>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
};
