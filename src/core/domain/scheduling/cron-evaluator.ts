/**
 * @file src/core/domain/scheduling/cron-evaluator.ts
 * Módulo de Domínio Puro para Avaliação e Projeção de Expressões Cron e Fusos Horários.
 *
 * Princípios Arquiteturais:
 * - ZERO dependências de I/O, SQLite, timers ou rede.
 * - Funções determinísticas, puras e executadas em milissegundos.
 * - Suporte a 5 campos (minuto, hora, dia-do-mês, mês, dia-da-semana).
 * - Projeção exata em fusos horários IANA (com respeito a horários de verão/DST).
 */

import { SchedulerError } from "../../shared/errors.js";

/** Erro especializado para falhas de sintaxe ou avaliação de cron. */
export class CronExpressionError extends SchedulerError {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "CronExpressionError";
  }
}

export type CampoTipo = "minuto" | "hora" | "dia-do-mês" | "mês" | "dia-da-semana";

export interface CronFaixa {
  min: number;
  max: number;
}

export const CRON_FAIXAS: Record<CampoTipo, CronFaixa> = {
  minuto: { min: 0, max: 59 },
  hora: { min: 0, max: 23 },
  "dia-do-mês": { min: 1, max: 31 },
  mês: { min: 1, max: 12 },
  "dia-da-semana": { min: 0, max: 6 },
};

/** Fuso padrão quando nenhum está configurado ou o configurado é inválido. */
export const FUSO_PADRAO = "America/Sao_Paulo";

/** Verifica se a string representa um fuso horário IANA válido suportado pelo runtime. */
export function fusoValido(tz: string): boolean {
  if (!tz || typeof tz !== "string" || tz.trim().length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
}

/** Offset wall-clock − UTC em ms para um instante num fuso (via Intl). */
export function offsetFusoMs(tz: string, d: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });
  const p: Record<string, string> = {};
  for (const x of dtf.formatToParts(d)) p[x.type] = x.value;
  const comoUTC = Date.UTC(
    +p["year"]!,
    +p["month"]! - 1,
    +p["day"]!,
    (+p["hour"]!) % 24,
    +p["minute"]!,
    +p["second"]!
  );
  return comoUTC - d.getTime();
}

/**
 * Compila uma especificação de campo de cron em um predicado numérico rápido.
 * Suporta: *, números isolados (5), listas (1,3,5), faixas (1-5) e passos (* /10, 1-10/2).
 */
export function compilarCampoCron(spec: string, tipo: CampoTipo): (valor: number) => boolean {
  if (spec === "*") return () => true;
  const { min, max } = CRON_FAIXAS[tipo];
  const valores = new Set<number>();

  for (const parte of spec.split(",")) {
    const m = /^(?:(\d+)(?:-(\d+))?|\*)(?:\/(\d+))?$/.exec(parte.trim());
    if (!m) {
      throw new CronExpressionError(`cron inválido (${tipo}): "${parte}"`);
    }

    const passo = m[3] ? Number(m[3]) : 1;
    if (passo < 1) {
      throw new CronExpressionError(`cron inválido (${tipo}): passo ${passo}`);
    }

    const ini = m[1] === undefined ? min : Number(m[1]);
    const fim = m[1] === undefined ? max : m[2] === undefined ? ini : Number(m[2]);

    if (ini < min || fim > max || ini > fim) {
      throw new CronExpressionError(`cron inválido (${tipo}): faixa ${ini}-${fim} fora de ${min}-${max}`);
    }

    for (let v = ini; v <= fim; v += passo) {
      valores.add(v);
    }
  }

  return (v: number) => valores.has(v);
}

/**
 * Valida a sintaxe completa de uma expressão cron padrão de 5 campos.
 * Lança CronExpressionError detalhado se inválido.
 */
export function validarExpressaoCron(expressao: string): void {
  const campos = expressao.trim().split(/\s+/);
  if (campos.length !== 5) {
    throw new CronExpressionError(`cron precisa de 5 campos: "${expressao}"`);
  }
  compilarCampoCron(campos[0]!, "minuto");
  compilarCampoCron(campos[1]!, "hora");
  compilarCampoCron(campos[2]!, "dia-do-mês");
  compilarCampoCron(campos[3]!, "mês");
  compilarCampoCron(campos[4]!, "dia-da-semana");
}

/**
 * Calcula a próxima data de ocorrência de uma expressão cron em tempo local/UTC.
 * @param expressao Expressão cron de 5 campos
 * @param aPartirDe Data de referência inicial
 * @param limiteMinutos Teto de varredura (padrão: ~1 ano / 527.040 minutos)
 */
export function calcularProximoCron(
  expressao: string,
  aPartirDe: Date = new Date(),
  limiteMinutos: number = 527040
): Date {
  validarExpressaoCron(expressao);
  const campos = expressao.trim().split(/\s+/);
  const mm = compilarCampoCron(campos[0]!, "minuto");
  const hh = compilarCampoCron(campos[1]!, "hora");
  const dom = compilarCampoCron(campos[2]!, "dia-do-mês");
  const mes = compilarCampoCron(campos[3]!, "mês");
  const dow = compilarCampoCron(campos[4]!, "dia-da-semana");

  const t = new Date(aPartirDe.getTime());
  t.setSeconds(0, 0);

  for (let i = 0; i < limiteMinutos; i++) {
    t.setMinutes(t.getMinutes() + 1);
    if (
      mm(t.getMinutes()) &&
      hh(t.getHours()) &&
      dom(t.getDate()) &&
      mes(t.getMonth() + 1) &&
      dow(t.getDay())
    ) {
      return new Date(t.getTime());
    }
  }

  throw new CronExpressionError(`cron "${expressao}" não tem ocorrência em ~1 ano`);
}

/**
 * Próxima ocorrência de um cron interpretada no relógio de parede do fuso IANA especificado.
 * (ex.: "0 9 * * *" com America/Sao_Paulo = 09:00 BRT, e não 09:00 UTC).
 */
export function calcularProximoCronEmTimezone(
  expressao: string,
  timezone: string,
  aPartirDe: Date = new Date(),
  limiteMinutos: number = 527040
): Date {
  validarExpressaoCron(expressao);
  if (!fusoValido(timezone)) {
    throw new CronExpressionError(
      `fuso horário inválido: "${timezone}" (use IANA, ex.: America/Sao_Paulo)`
    );
  }

  const campos = expressao.trim().split(/\s+/);
  const mm = compilarCampoCron(campos[0]!, "minuto");
  const hh = compilarCampoCron(campos[1]!, "hora");
  const dom = compilarCampoCron(campos[2]!, "dia-do-mês");
  const mes = compilarCampoCron(campos[3]!, "mês");
  const dow = compilarCampoCron(campos[4]!, "dia-da-semana");

  let t = Math.ceil((aPartirDe.getTime() + 1) / 60000) * 60000;
  let off = offsetFusoMs(timezone, new Date(t));
  let ultimoDia: number | null = null;

  for (let i = 0; i < limiteMinutos; i++) {
    let parede = new Date(t + off);
    const dia = parede.getUTCDate();
    if (ultimoDia !== null && dia !== ultimoDia) {
      off = offsetFusoMs(timezone, new Date(t));
      parede = new Date(t + off);
    }
    ultimoDia = parede.getUTCDate();

    if (
      mm(parede.getUTCMinutes()) &&
      hh(parede.getUTCHours()) &&
      dom(parede.getUTCDate()) &&
      mes(parede.getUTCMonth() + 1) &&
      dow(parede.getUTCDay())
    ) {
      return new Date(t);
    }
    t += 60000;
  }

  throw new CronExpressionError(`cron "${expressao}" não tem ocorrência em ~1 ano`);
}

// ── Aliases de retrocompatibilidade com código legado ──────────
export const validarCron = validarExpressaoCron;
export const proximoCron = (expr: string, de: Date): Date => calcularProximoCron(expr, de);
export const proximoCronTz = (expr: string, de: Date, tz: string): Date =>
  calcularProximoCronEmTimezone(expr, tz, de);
