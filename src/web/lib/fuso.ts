import { createSignal } from "solid-js";
import { fetchApi } from "./context";

/**
 * Fuso horário configurado (scheduler.timezone global com override por
 * workspace). Centraliza a formatação de datas da web para que o horário
 * exibido seja sempre o do relógio configurado — e não o do navegador.
 */

export const FUSO_PADRAO_WEB = "America/Sao_Paulo";

const [fuso, setFusoSignal] = createSignal<string>(
  Intl.DateTimeFormat().resolvedOptions().timeZone || FUSO_PADRAO_WEB
);

export { fuso };

export function fusoValidoWeb(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Carrega scheduler.timezone mesclado (global + workspace ativo). */
export async function carregarFuso(): Promise<void> {
  try {
    const entradas = await fetchApi<Array<{ chave: string; valor: unknown }>>("/settings?escopo=workspace");
    const achada = Array.isArray(entradas)
      ? entradas.find((e) => e.chave === "scheduler.timezone")
      : undefined;
    const tz = typeof achada?.valor === "string" ? achada.valor.trim() : "";
    if (tz && fusoValidoWeb(tz)) setFusoSignal(tz);
  } catch {
    /* mantém o fuso do navegador */
  }
}

/** "2026-09-12T19:18:00.000Z" → "12/09/2026, 19:18:00" no fuso configurado. */
export function fmtDataHora(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { timeZone: fuso() });
}

/** Só a hora ("19:18:29") no fuso configurado. */
export function fmtHora(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { timeZone: fuso() });
}

/** "há 2h05" / "em 25min" — distância humana até agora. */
export function distanciaHumana(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = d.getTime() - Date.now();
  const m = Math.floor(Math.abs(diffMs) / 60000);
  if (m < 1) return "agora mesmo";
  const h = Math.floor(m / 60);
  const resto = m % 60;
  const quantia = h > 0 ? `${h}h${resto ? ` ${String(resto).padStart(2, "0")}min` : ""}` : `${m}min`;
  return diffMs < 0 ? `há ${quantia}` : `em ${quantia}`;
}

/** true se o instante já passou (para badge "atrasada"). */
export function jaPassou(iso?: string | null): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t < Date.now();
}
