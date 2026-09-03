import { type Component, createSignal, createEffect, For, Show } from "solid-js";
import { Clock, Sliders, Code2, Sparkles, Check } from "lucide-solid";
import { descreverCron, PRESETS_CRON, DIAS_SEMANA } from "../lib/cron-helper";

export interface CronBuilderProps {
  value: string;
  onChange: (cron: string) => void;
}

export const CronBuilder: Component<CronBuilderProps> = (props) => {
  const [modoAba, setModoAba] = createSignal<"visual" | "cron">("visual");

  // Estados do modo visual
  const [freqTipo, setFreqTipo] = createSignal<"minutos" | "hora" | "diario" | "semanal" | "mensal">("hora");
  const [intervaloMinutos, setIntervaloMinutos] = createSignal(15);
  const [minutoHora, setMinutoHora] = createSignal(0);
  const [horaDiaria, setHoraDiaria] = createSignal("09:00");
  const [diasSemana, setDiasSemana] = createSignal<string[]>(["1"]);
  const [diaMes, setDiaMes] = createSignal(1);

  // Inicializar modo visual a partir do cron recebido
  createEffect(() => {
    const cron = (props.value || "").trim();
    if (!cron) return;

    const partes = cron.split(/\s+/);
    if (partes.length === 5) {
      const [min, hora, dMes, mes, dSem] = partes;

      if (min.startsWith("*/") && hora === "*" && dMes === "*" && mes === "*" && dSem === "*") {
        setFreqTipo("minutos");
        const v = parseInt(min.slice(2), 10);
        if (!isNaN(v)) setIntervaloMinutos(v);
        return;
      }

      if (/^\d+$/.test(min) && hora === "*" && dMes === "*" && mes === "*" && dSem === "*") {
        setFreqTipo("hora");
        setMinutoHora(parseInt(min, 10));
        return;
      }

      if (/^\d+$/.test(hora) && /^\d+$/.test(min) && dMes === "*" && mes === "*" && dSem === "*") {
        setFreqTipo("diario");
        setHoraDiaria(`${hora.padStart(2, "0")}:${min.padStart(2, "0")}`);
        return;
      }

      if (/^\d+$/.test(hora) && /^\d+$/.test(min) && dMes === "*" && mes === "*" && dSem !== "*") {
        setFreqTipo("semanal");
        setHoraDiaria(`${hora.padStart(2, "0")}:${min.padStart(2, "0")}`);
        if (dSem === "1-5") {
          setDiasSemana(["1", "2", "3", "4", "5"]);
        } else if (dSem === "0,6" || dSem === "6,0") {
          setDiasSemana(["6", "0"]);
        } else {
          setDiasSemana(dSem.split(","));
        }
        return;
      }

      if (/^\d+$/.test(hora) && /^\d+$/.test(min) && /^\d+$/.test(dMes) && mes === "*" && dSem === "*") {
        setFreqTipo("mensal");
        setHoraDiaria(`${hora.padStart(2, "0")}:${min.padStart(2, "0")}`);
        setDiaMes(parseInt(dMes, 10));
        return;
      }
    }
  });

  // Atualiza cron quando usuário mexe nos controles visuais
  const sincronizarVisualParaCron = () => {
    let expressao = "0 * * * *";
    const [hStr, mStr] = horaDiaria().split(":");
    const h = parseInt(hStr || "9", 10);
    const m = parseInt(mStr || "0", 10);

    switch (freqTipo()) {
      case "minutos":
        expressao = `*/${intervaloMinutos()} * * * *`;
        break;
      case "hora":
        expressao = `${minutoHora()} * * * *`;
        break;
      case "diario":
        expressao = `${m} ${h} * * *`;
        break;
      case "semanal": {
        const dias = diasSemana().length > 0 ? diasSemana().join(",") : "1";
        expressao = `${m} ${h} * * ${dias}`;
        break;
      }
      case "mensal":
        expressao = `${m} ${h} ${diaMes()} * *`;
        break;
    }

    props.onChange(expressao);
  };

  const toggleDiaSemana = (id: string) => {
    const lista = diasSemana();
    if (lista.includes(id)) {
      if (lista.length > 1) {
        setDiasSemana(lista.filter((d) => d !== id));
      }
    } else {
      setDiasSemana([...lista, id]);
    }
    sincronizarVisualParaCron();
  };

  const selecionarPresetDias = (tipo: "uteis" | "todos" | "fimdesemana") => {
    if (tipo === "uteis") setDiasSemana(["1", "2", "3", "4", "5"]);
    if (tipo === "todos") setDiasSemana(["1", "2", "3", "4", "5", "6", "0"]);
    if (tipo === "fimdesemana") setDiasSemana(["6", "0"]);
    sincronizarVisualParaCron();
  };

  return (
    <div class="space-y-3">
      {/* Seletor de Aba: Visual vs Cron */}
      <div class="flex items-center justify-between">
        <label class="block text-xs font-semibold text-zinc-300">
          Frequência de Execução *
        </label>
        <div class="flex items-center gap-1 bg-zinc-950 p-0.5 rounded-lg border border-zinc-800 text-[11px]">
          <button
            type="button"
            onClick={() => setModoAba("visual")}
            class={`px-2 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
              modoAba() === "visual"
                ? "!bg-emerald-950/80 text-emerald-300 border border-emerald-500/50 font-semibold"
                : "!bg-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Sliders size={12} />
            <span>Visual / Amigável</span>
          </button>
          <button
            type="button"
            onClick={() => setModoAba("cron")}
            class={`px-2 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
              modoAba() === "cron"
                ? "!bg-emerald-950/80 text-emerald-300 border border-emerald-500/50 font-semibold"
                : "!bg-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Code2 size={12} />
            <span>Código Cron</span>
          </button>
        </div>
      </div>

      {/* MODO 1: Visual / Amigável */}
      <Show when={modoAba() === "visual"}>
        <div class="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3.5">
          {/* Tipos de Frequência */}
          <div class="grid grid-cols-3 sm:grid-cols-5 gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => { setFreqTipo("minutos"); sincronizarVisualParaCron(); }}
              class={`p-1.5 rounded-lg border text-center transition-colors cursor-pointer ${
                freqTipo() === "minutos"
                  ? "bg-emerald-950/60 border-emerald-500/60 text-emerald-300 font-bold"
                  : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700"
              }`}
            >
              Minutos
            </button>
            <button
              type="button"
              onClick={() => { setFreqTipo("hora"); sincronizarVisualParaCron(); }}
              class={`p-1.5 rounded-lg border text-center transition-colors cursor-pointer ${
                freqTipo() === "hora"
                  ? "bg-emerald-950/60 border-emerald-500/60 text-emerald-300 font-bold"
                  : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700"
              }`}
            >
              A cada Hora
            </button>
            <button
              type="button"
              onClick={() => { setFreqTipo("diario"); sincronizarVisualParaCron(); }}
              class={`p-1.5 rounded-lg border text-center transition-colors cursor-pointer ${
                freqTipo() === "diario"
                  ? "bg-emerald-950/60 border-emerald-500/60 text-emerald-300 font-bold"
                  : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700"
              }`}
            >
              Diariamente
            </button>
            <button
              type="button"
              onClick={() => { setFreqTipo("semanal"); sincronizarVisualParaCron(); }}
              class={`p-1.5 rounded-lg border text-center transition-colors cursor-pointer ${
                freqTipo() === "semanal"
                  ? "bg-emerald-950/60 border-emerald-500/60 text-emerald-300 font-bold"
                  : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700"
              }`}
            >
              Semanalmente
            </button>
            <button
              type="button"
              onClick={() => { setFreqTipo("mensal"); sincronizarVisualParaCron(); }}
              class={`p-1.5 rounded-lg border text-center transition-colors cursor-pointer ${
                freqTipo() === "mensal"
                  ? "bg-emerald-950/60 border-emerald-500/60 text-emerald-300 font-bold"
                  : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700"
              }`}
            >
              Mensalmente
            </button>
          </div>

          {/* 1. Minutos */}
          <Show when={freqTipo() === "minutos"}>
            <div class="space-y-1.5">
              <label class="block text-[11px] text-zinc-400 font-medium">Intervalo de Minutos</label>
              <div class="flex items-center gap-1.5 flex-wrap">
                <For each={[5, 10, 15, 20, 30, 45]}>
                  {(m) => (
                    <button
                      type="button"
                      onClick={() => { setIntervaloMinutos(m); sincronizarVisualParaCron(); }}
                      class={`px-2.5 py-1 rounded-md text-xs border transition-colors cursor-pointer ${
                        intervaloMinutos() === m
                          ? "bg-emerald-950 border-emerald-500 text-emerald-300 font-bold"
                          : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700"
                      }`}
                    >
                      {m} min
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* 2. A cada Hora */}
          <Show when={freqTipo() === "hora"}>
            <div class="space-y-1.5">
              <label class="block text-[11px] text-zinc-400 font-medium">Executar no minuto da hora</label>
              <div class="flex items-center gap-1.5 flex-wrap">
                <For each={[0, 15, 30, 45]}>
                  {(m) => (
                    <button
                      type="button"
                      onClick={() => { setMinutoHora(m); sincronizarVisualParaCron(); }}
                      class={`px-2.5 py-1 rounded-md text-xs border transition-colors cursor-pointer ${
                        minutoHora() === m
                          ? "bg-emerald-950 border-emerald-500 text-emerald-300 font-bold"
                          : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700"
                      }`}
                    >
                      :{m.toString().padStart(2, "0")}
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* 3. Diariamente */}
          <Show when={freqTipo() === "diario"}>
            <div class="space-y-1.5">
              <label class="block text-[11px] text-zinc-400 font-medium">Horário da Execução Diária</label>
              <div class="flex items-center gap-2">
                <input
                  type="time"
                  value={horaDiaria()}
                  onInput={(e) => { setHoraDiaria(e.currentTarget.value); sincronizarVisualParaCron(); }}
                  class="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500/50 cursor-pointer"
                />
                <span class="text-[11px] text-zinc-500">Todo dia neste horário</span>
              </div>
            </div>
          </Show>

          {/* 4. Semanalmente */}
          <Show when={freqTipo() === "semanal"}>
            <div class="space-y-2.5">
              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="block text-[11px] text-zinc-400 font-medium">Dias da Semana</label>
                  <div class="flex items-center gap-1.5 text-[10px] text-zinc-500">
                    <button type="button" onClick={() => selecionarPresetDias("uteis")} class="hover:text-emerald-400 cursor-pointer">Seg-Sex</button>
                    <span>·</span>
                    <button type="button" onClick={() => selecionarPresetDias("todos")} class="hover:text-emerald-400 cursor-pointer">Todos</button>
                    <span>·</span>
                    <button type="button" onClick={() => selecionarPresetDias("fimdesemana")} class="hover:text-emerald-400 cursor-pointer">Sáb-Dom</button>
                  </div>
                </div>
                <div class="grid grid-cols-7 gap-1">
                  <For each={DIAS_SEMANA}>
                    {(d) => {
                      const ativo = () => diasSemana().includes(d.id);
                      return (
                        <button
                          type="button"
                          onClick={() => toggleDiaSemana(d.id)}
                          class={`py-1.5 rounded text-center text-xs border transition-colors cursor-pointer ${
                            ativo()
                              ? "bg-emerald-950 border-emerald-500 text-emerald-300 font-bold"
                              : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                          }`}
                          title={d.nome}
                        >
                          {d.rotulo}
                        </button>
                      );
                    }}
                  </For>
                </div>
              </div>

              <div>
                <label class="block text-[11px] text-zinc-400 font-medium mb-1">Horário da Execução</label>
                <input
                  type="time"
                  value={horaDiaria()}
                  onInput={(e) => { setHoraDiaria(e.currentTarget.value); sincronizarVisualParaCron(); }}
                  class="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500/50 cursor-pointer"
                />
              </div>
            </div>
          </Show>

          {/* 5. Mensalmente */}
          <Show when={freqTipo() === "mensal"}>
            <div class="grid grid-cols-2 gap-2.5">
              <div>
                <label class="block text-[11px] text-zinc-400 font-medium mb-1">Dia do Mês</label>
                <select
                  value={diaMes()}
                  onChange={(e) => { setDiaMes(parseInt(e.currentTarget.value, 10)); sincronizarVisualParaCron(); }}
                  class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/50 cursor-pointer"
                >
                  <For each={Array.from({ length: 31 }, (_, i) => i + 1)}>
                    {(d) => <option value={d}>Dia {d}</option>}
                  </For>
                </select>
              </div>

              <div>
                <label class="block text-[11px] text-zinc-400 font-medium mb-1">Horário</label>
                <input
                  type="time"
                  value={horaDiaria()}
                  onInput={(e) => { setHoraDiaria(e.currentTarget.value); sincronizarVisualParaCron(); }}
                  class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500/50 cursor-pointer"
                />
              </div>
            </div>
          </Show>
        </div>
      </Show>

      {/* MODO 2: Código Cron Avançado */}
      <Show when={modoAba() === "cron"}>
        <div class="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
          <div>
            <label class="block text-[11px] text-zinc-400 font-medium mb-1">
              Expressão Cron (5 campos)
            </label>
            <input
              type="text"
              placeholder="0 * * * *"
              value={props.value}
              onInput={(e) => props.onChange(e.currentTarget.value)}
              class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50"
            />
            <span class="text-[10px] text-zinc-500 font-mono mt-1 block">
              Formato: <code>minuto hora dia_mês mês dia_semana</code>
            </span>
          </div>

          {/* Atalhos Rápidos */}
          <div>
            <label class="block text-[10px] uppercase font-bold text-zinc-500 tracking-wider mb-1.5 font-mono">
              Presets Rápidos
            </label>
            <div class="flex items-center gap-1.5 flex-wrap">
              <For each={PRESETS_CRON}>
                {(p) => (
                  <button
                    type="button"
                    onClick={() => props.onChange(p.cron)}
                    class="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800/80 hover:border-zinc-700 text-[10px] text-zinc-300 font-mono transition-colors cursor-pointer"
                  >
                    {p.rotulo}
                  </button>
                )}
              </For>
            </div>
          </div>
        </div>
      </Show>

      {/* Card Resumo / Tradução Amigável */}
      <div class="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-800/30 text-xs flex items-center justify-between gap-2 shadow-xs">
        <div class="flex items-center gap-2 min-w-0">
          <Clock size={13} class="text-emerald-400 flex-shrink-0" />
          <span class="font-semibold text-emerald-200 truncate">
            {descreverCron(props.value)}
          </span>
        </div>
        <span class="text-[10px] font-mono bg-emerald-950/80 text-emerald-400 px-2 py-0.5 rounded border border-emerald-800/60 flex-shrink-0">
          {props.value || "0 * * * *"}
        </span>
      </div>
    </div>
  );
};
