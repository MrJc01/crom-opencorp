/**
 * Utilitários para interpretação, tradução e montagem de expressões Cron
 */

export const DIAS_SEMANA = [
  { id: "1", rotulo: "Seg", nome: "Segunda-feira" },
  { id: "2", rotulo: "Ter", nome: "Terça-feira" },
  { id: "3", rotulo: "Qua", nome: "Quarta-feira" },
  { id: "4", rotulo: "Qui", nome: "Quinta-feira" },
  { id: "5", rotulo: "Sex", nome: "Sexta-feira" },
  { id: "6", rotulo: "Sáb", nome: "Sábado" },
  { id: "0", rotulo: "Dom", nome: "Domingo" },
];

export const MAPA_DIAS: Record<string, string> = {
  "0": "Domingo",
  "1": "Segunda-feira",
  "2": "Terça-feira",
  "3": "Quarta-feira",
  "4": "Quinta-feira",
  "5": "Sexta-feira",
  "6": "Sábado",
  "7": "Domingo",
};

/**
 * Traduz uma expressão cron (5 campos) para texto humano em Português
 */
export function descreverCron(cron: string): string {
  if (!cron || typeof cron !== "string") return "Cron indefinido";
  const partes = cron.trim().split(/\s+/);
  if (partes.length !== 5) return cron;

  const [min, hora, diaMes, mes, diaSemana] = partes;

  // 1. Minutos
  if (min === "*" && hora === "*" && diaMes === "*" && mes === "*" && diaSemana === "*") {
    return "A cada minuto";
  }
  if (min.startsWith("*/") && hora === "*" && diaMes === "*" && mes === "*" && diaSemana === "*") {
    const m = min.slice(2);
    return `A cada ${m} minuto${m === "1" ? "" : "s"}`;
  }

  // 2. Horas
  if (/^\d+$/.test(min) && hora === "*" && diaMes === "*" && mes === "*" && diaSemana === "*") {
    return min === "0" ? "A cada hora (no minuto 00)" : `A cada hora (no minuto :${min.padStart(2, "0")})`;
  }
  if (min === "0" && hora.startsWith("*/") && diaMes === "*" && mes === "*" && diaSemana === "*") {
    const h = hora.slice(2);
    return `A cada ${h} hora${h === "1" ? "" : "s"}`;
  }

  const horaFormatada = /^\d+$/.test(hora) && /^\d+$/.test(min)
    ? `${hora.padStart(2, "0")}:${min.padStart(2, "0")}`
    : null;

  // 3. Diariamente
  if (horaFormatada && diaMes === "*" && mes === "*" && diaSemana === "*") {
    return `Diariamente às ${horaFormatada}`;
  }

  // 4. Semanalmente
  if (horaFormatada && diaMes === "*" && mes === "*" && diaSemana !== "*") {
    if (diaSemana === "1-5") return `Segunda a Sexta às ${horaFormatada}`;
    if (diaSemana === "0,6" || diaSemana === "6,0") return `Sábados e Domingos às ${horaFormatada}`;
    const dias = diaSemana.split(",").map(d => MAPA_DIAS[d] || `Dia ${d}`).join(", ");
    return `Semanalmente (${dias}) às ${horaFormatada}`;
  }

  // 5. Mensalmente
  if (horaFormatada && diaMes !== "*" && mes === "*" && diaSemana === "*") {
    return `Mensalmente no dia ${diaMes} às ${horaFormatada}`;
  }

  return `Personalizado (${cron})`;
}

/**
 * Presets comuns de cron para seleção rápida
 */
export const PRESETS_CRON = [
  { rotulo: "A cada 15 minutos", cron: "*/15 * * * *" },
  { rotulo: "A cada 30 minutos", cron: "*/30 * * * *" },
  { rotulo: "A cada hora", cron: "0 * * * *" },
  { rotulo: "Todo dia às 08:00", cron: "0 8 * * *" },
  { rotulo: "Todo dia às 18:00", cron: "0 18 * * *" },
  { rotulo: "Segunda a Sexta às 09:00", cron: "0 9 * * 1-5" },
  { rotulo: "Toda Segunda às 09:00", cron: "0 9 * * 1" },
  { rotulo: "Dia 1 do mês às 00:00", cron: "0 0 1 * *" },
];
