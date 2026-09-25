import React, { useState, useEffect, useCallback, type FC } from "react";
import { Clock, Sliders, Code2 } from "lucide-react";
import { descreverCron, PRESETS_CRON, DIAS_SEMANA } from "../../../lib/cron-helper.js";

export interface CronBuilderProps {
  value: string;
  onChange: (cron: string) => void;
  className?: string;
}

export const CronBuilder: FC<CronBuilderProps> = ({
  value,
  onChange,
  className = "",
}) => {
  const [modoAba, setModoAba] = useState<"visual" | "cron">("visual");

  // Estados do modo visual
  const [freqTipo, setFreqTipo] = useState<"minutos" | "hora" | "diario" | "semanal" | "mensal">("minutos");
  const [intervaloMinutos, setIntervaloMinutos] = useState(15);
  const [minutoHora, setMinutoHora] = useState(0);
  const [horaDiaria, setHoraDiaria] = useState("09:00");
  const [diasSemana, setDiasSemana] = useState<string[]>(["1"]);
  const [diaMes, setDiaMes] = useState(1);

  // Inicializar / Sincronizar modo visual a partir do cron recebido
  useEffect(() => {
    const cron = (value || "").trim();
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
  }, [value]);

  // Atualiza cron quando usuário mexe nos controles visuais
  const sincronizarVisualParaCron = useCallback(
    (
      tipo = freqTipo,
      intervMin = intervaloMinutos,
      minH = minutoHora,
      horaD = horaDiaria,
      dSem = diasSemana,
      dM = diaMes
    ) => {
      let expressao = "0 * * * *";
      const [hStr, mStr] = horaD.split(":");
      const h = parseInt(hStr || "9", 10);
      const m = parseInt(mStr || "0", 10);

      switch (tipo) {
        case "minutos":
          expressao = `*/${intervMin} * * * *`;
          break;
        case "hora":
          expressao = `${minH} * * * *`;
          break;
        case "diario":
          expressao = `${m} ${h} * * *`;
          break;
        case "semanal": {
          const dias = dSem.length > 0 ? dSem.join(",") : "1";
          expressao = `${m} ${h} * * ${dias}`;
          break;
        }
        case "mensal":
          expressao = `${m} ${h} ${dM} * *`;
          break;
      }

      onChange(expressao);
    },
    [freqTipo, intervaloMinutos, minutoHora, horaDiaria, diasSemana, diaMes, onChange]
  );

  const handleMudarTipoFreq = (novoTipo: "minutos" | "hora" | "diario" | "semanal" | "mensal") => {
    setFreqTipo(novoTipo);
    sincronizarVisualParaCron(novoTipo);
  };

  const toggleDiaSemana = (id: string) => {
    let novaLista = [...diasSemana];
    if (novaLista.includes(id)) {
      if (novaLista.length > 1) {
        novaLista = novaLista.filter((d) => d !== id);
      }
    } else {
      novaLista.push(id);
    }
    setDiasSemana(novaLista);
    sincronizarVisualParaCron(freqTipo, intervaloMinutos, minutoHora, horaDiaria, novaLista, diaMes);
  };

  const selecionarPresetDias = (tipo: "uteis" | "todos" | "fimdesemana") => {
    let novaLista: string[] = ["1"];
    if (tipo === "uteis") novaLista = ["1", "2", "3", "4", "5"];
    if (tipo === "todos") novaLista = ["1", "2", "3", "4", "5", "6", "0"];
    if (tipo === "fimdesemana") novaLista = ["6", "0"];
    setDiasSemana(novaLista);
    sincronizarVisualParaCron(freqTipo, intervaloMinutos, minutoHora, horaDiaria, novaLista, diaMes);
  };

  return (
    <div className={`space-y-3 select-none ${className}`}>
      {/* Seletor de Aba: Visual vs Cron */}
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold text-zinc-300">
          Frequência de Execução *
        </label>
        <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded-lg border border-zinc-800 text-[11px]">
          <button
            type="button"
            onClick={() => setModoAba("visual")}
            className={`px-2 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
              modoAba === "visual"
                ? "bg-sky-950/80 text-sky-300 border border-sky-500/50 font-semibold"
                : "bg-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Sliders size={12} />
            <span>Visual / Amigável</span>
          </button>
          <button
            type="button"
            onClick={() => setModoAba("cron")}
            className={`px-2 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
              modoAba === "cron"
                ? "bg-sky-950/80 text-sky-300 border border-sky-500/50 font-semibold"
                : "bg-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Code2 size={12} />
            <span>Código Cron</span>
          </button>
        </div>
      </div>

      {/* MODO 1: Visual / Amigável */}
      {modoAba === "visual" && (
        <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3.5">
          {/* Tipos de Frequência */}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => handleMudarTipoFreq("minutos")}
              className={`p-1.5 rounded-lg border text-center transition-colors cursor-pointer ${
                freqTipo === "minutos"
                  ? "bg-sky-950/60 border-sky-500/60 text-sky-300 font-bold"
                  : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700"
              }`}
            >
              Minutos
            </button>
            <button
              type="button"
              onClick={() => handleMudarTipoFreq("hora")}
              className={`p-1.5 rounded-lg border text-center transition-colors cursor-pointer ${
                freqTipo === "hora"
                  ? "bg-sky-950/60 border-sky-500/60 text-sky-300 font-bold"
                  : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700"
              }`}
            >
              A cada Hora
            </button>
            <button
              type="button"
              onClick={() => handleMudarTipoFreq("diario")}
              className={`p-1.5 rounded-lg border text-center transition-colors cursor-pointer ${
                freqTipo === "diario"
                  ? "bg-sky-950/60 border-sky-500/60 text-sky-300 font-bold"
                  : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700"
              }`}
            >
              Diariamente
            </button>
            <button
              type="button"
              onClick={() => handleMudarTipoFreq("semanal")}
              className={`p-1.5 rounded-lg border text-center transition-colors cursor-pointer ${
                freqTipo === "semanal"
                  ? "bg-sky-950/60 border-sky-500/60 text-sky-300 font-bold"
                  : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700"
              }`}
            >
              Semanalmente
            </button>
            <button
              type="button"
              onClick={() => handleMudarTipoFreq("mensal")}
              className={`p-1.5 rounded-lg border text-center transition-colors cursor-pointer ${
                freqTipo === "mensal"
                  ? "bg-sky-950/60 border-sky-500/60 text-sky-300 font-bold"
                  : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700"
              }`}
            >
              Mensalmente
            </button>
          </div>

          {/* 1. Minutos */}
          {freqTipo === "minutos" && (
            <div className="space-y-1.5">
              <label className="block text-[11px] text-zinc-400 font-medium">Intervalo de Minutos</label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {[5, 10, 15, 20, 30, 45].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setIntervaloMinutos(m);
                      sincronizarVisualParaCron(freqTipo, m, minutoHora, horaDiaria, diasSemana, diaMes);
                    }}
                    className={`px-2.5 py-1 rounded-md text-xs border transition-colors cursor-pointer ${
                      intervaloMinutos === m
                        ? "bg-sky-950 border-sky-500 text-sky-300 font-bold"
                        : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700"
                    }`}
                  >
                    {m} min
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 2. A cada Hora */}
          {freqTipo === "hora" && (
            <div className="space-y-1.5">
              <label className="block text-[11px] text-zinc-400 font-medium">Executar no minuto da hora</label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {[0, 15, 30, 45].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setMinutoHora(m);
                      sincronizarVisualParaCron(freqTipo, intervaloMinutos, m, horaDiaria, diasSemana, diaMes);
                    }}
                    className={`px-2.5 py-1 rounded-md text-xs border transition-colors cursor-pointer ${
                      minutoHora === m
                        ? "bg-sky-950 border-sky-500 text-sky-300 font-bold"
                        : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700"
                    }`}
                  >
                    :{m.toString().padStart(2, "0")}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 3. Diariamente */}
          {freqTipo === "diario" && (
            <div className="space-y-1.5">
              <label className="block text-[11px] text-zinc-400 font-medium">Horário da Execução Diária</label>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={horaDiaria}
                  onChange={(e) => {
                    setHoraDiaria(e.target.value);
                    sincronizarVisualParaCron(freqTipo, intervaloMinutos, minutoHora, e.target.value, diasSemana, diaMes);
                  }}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-100 font-mono focus:outline-none focus:border-sky-500 cursor-pointer"
                />
                <span className="text-[11px] text-zinc-500">Todo dia neste horário</span>
              </div>
            </div>
          )}

          {/* 4. Semanalmente */}
          {freqTipo === "semanal" && (
            <div className="space-y-2.5">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] text-zinc-400 font-medium">Dias da Semana</label>
                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                    <button type="button" onClick={() => selecionarPresetDias("uteis")} className="hover:text-sky-400 cursor-pointer">Seg-Sex</button>
                    <span>·</span>
                    <button type="button" onClick={() => selecionarPresetDias("todos")} className="hover:text-sky-400 cursor-pointer">Todos</button>
                    <span>·</span>
                    <button type="button" onClick={() => selecionarPresetDias("fimdesemana")} className="hover:text-sky-400 cursor-pointer">Sáb-Dom</button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {DIAS_SEMANA.map((d) => {
                    const ativo = diasSemana.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => toggleDiaSemana(d.id)}
                        className={`py-1.5 rounded text-center text-xs border transition-colors cursor-pointer ${
                          ativo
                            ? "bg-sky-950 border-sky-500 text-sky-300 font-bold"
                            : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                        }`}
                        title={d.nome}
                      >
                        {d.rotulo}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 font-medium mb-1">Horário da Execução</label>
                <input
                  type="time"
                  value={horaDiaria}
                  onChange={(e) => {
                    setHoraDiaria(e.target.value);
                    sincronizarVisualParaCron(freqTipo, intervaloMinutos, minutoHora, e.target.value, diasSemana, diaMes);
                  }}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-100 font-mono focus:outline-none focus:border-sky-500 cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* 5. Mensalmente */}
          {freqTipo === "mensal" && (
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] text-zinc-400 font-medium mb-1">Dia do Mês</label>
                <select
                  value={diaMes}
                  onChange={(e) => {
                    const novoDia = parseInt(e.target.value, 10);
                    setDiaMes(novoDia);
                    sincronizarVisualParaCron(freqTipo, intervaloMinutos, minutoHora, horaDiaria, diasSemana, novoDia);
                  }}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-sky-500 cursor-pointer"
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      Dia {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 font-medium mb-1">Horário</label>
                <input
                  type="time"
                  value={horaDiaria}
                  onChange={(e) => {
                    setHoraDiaria(e.target.value);
                    sincronizarVisualParaCron(freqTipo, intervaloMinutos, minutoHora, e.target.value, diasSemana, diaMes);
                  }}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-100 font-mono focus:outline-none focus:border-sky-500 cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODO 2: Código Cron Avançado */}
      {modoAba === "cron" && (
        <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
          <div>
            <label className="block text-[11px] text-zinc-400 font-medium mb-1">
              Expressão Cron (5 campos)
            </label>
            <input
              type="text"
              placeholder="0 * * * *"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-sky-500"
            />
            <span className="text-[10px] text-zinc-500 font-mono mt-1 block">
              Formato: <code>minuto hora dia_mês mês dia_semana</code>
            </span>
          </div>

          {/* Atalhos Rápidos */}
          <div>
            <label className="block text-[10px] uppercase font-bold text-zinc-500 tracking-wider mb-1.5 font-mono">
              Presets Rápidos
            </label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {PRESETS_CRON.map((p) => (
                <button
                  key={p.cron}
                  type="button"
                  onClick={() => onChange(p.cron)}
                  className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800/80 hover:border-zinc-700 text-[10px] text-zinc-300 font-mono transition-colors cursor-pointer"
                >
                  {p.rotulo}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Card Resumo / Tradução Amigável */}
      <div className="p-2.5 rounded-lg bg-sky-950/20 border border-sky-800/30 text-xs flex items-center justify-between gap-2 shadow-xs">
        <div className="flex items-center gap-2 min-w-0">
          <Clock size={13} className="text-sky-400 shrink-0" />
          <span className="font-semibold text-sky-200 truncate">
            {descreverCron(value)}
          </span>
        </div>
        <span className="text-[10px] font-mono bg-sky-950/80 text-sky-400 px-2 py-0.5 rounded border border-sky-800/60 shrink-0">
          {value || "0 * * * *"}
        </span>
      </div>
    </div>
  );
};
