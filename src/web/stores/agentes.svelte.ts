/**
 * Store Agentes — Svelte 5 (writable) + helpers puros.
 * Mantém API via src/web/api.ts e expõe helpers testáveis.
 * Espelha contratos de src/web/views/agentes.ts (badgeCategoria, rotuloPermissao, toggle, semear, run, crud).
 */
import { writable, derived } from 'svelte/store';

export interface AgenteResumo {
  id: string;
  role: string;
  category: string;
  model: string;
  permissions: string;
  budget_daily_usd: number;
  ativo?: boolean;
  [k: string]: unknown;
}

export interface AgenteDetalhe {
  id: string;
  role?: string;
  category?: string;
  model?: string;
  permissions?: string;
  tools?: string[];
  budget?: { daily_usd?: number; max_turns?: number };
  budget_daily_usd?: number;
  budget_max_turns?: number;
  ativo?: boolean;
  [k: string]: unknown;
}

// ── helpers puros ──────────────────────────────────────────────────────────

export function badgeCategoria(c: string): string {
  if (c === 'ceo') return 'badge-review';
  if (c === 'secretario') return 'badge-fanout';
  if (c === 'operario') return 'badge-pipeline';
  return 'badge-neutral';
}

export function rotuloPermissao(p: string): string {
  if (p === 'level-1') return 'só leitura';
  if (p === 'level-2') return 'bash local';
  return 'rede + HITL';
}

export function isSistema(id: string): boolean {
  return id === 'secretario' || id === 'secretario-exec';
}

export function validarIdAgente(id: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id);
}

export function filtrarAtivos(agentes: AgenteResumo[]): AgenteResumo[] {
  return agentes.filter((a) => a.ativo !== false);
}

export function filtrarDesativados(agentes: AgenteResumo[]): AgenteResumo[] {
  return agentes.filter((a) => a.ativo === false);
}

export function montarPayloadAgenteSalvar(
  role: string,
  model: string,
  permissions: string,
  toolsCsv: string,
  daily: number,
  turns: number,
): Record<string, unknown> {
  const tools = toolsCsv.split(',').map((s) => s.trim()).filter(Boolean);
  return {
    role: role.trim(),
    model: model.trim(),
    permissions,
    tools,
    budget_daily_usd: Number.isFinite(daily) ? daily : 0,
    budget_max_turns: Number.isFinite(turns) ? turns : 20,
  };
}

// ── stores ─────────────────────────────────────────────────────────────────
export const agentesStore = writable<AgenteResumo[]>([]);
export const carregandoStore = writable<boolean>(false);
export const erroStore = writable<string | null>(null);

// derived
export const agentesAtivos = derived(agentesStore, ($a) => filtrarAtivos($a));
export const agentesCatalogo = derived(agentesStore, ($a) => filtrarDesativados($a));
export const temAgentes = derived(agentesStore, ($a) => $a.length > 0);

// ── API wrappers ───────────────────────────────────────────────────────────

export async function carregarAgentes(): Promise<AgenteResumo[]> {
  const { api } = await import('../api.js');
  carregandoStore.set(true);
  erroStore.set(null);
  try {
    const data = await api<AgenteResumo[]>('/agents');
    const lista = Array.isArray(data) ? data : [];
    agentesStore.set(lista);
    return lista;
  } catch (e) {
    const msg = (e as Error)?.message ?? 'Não foi possível carregar os agentes.';
    erroStore.set(msg);
    throw e;
  } finally {
    carregandoStore.set(false);
  }
}

export async function toggleAgenteAtivoStore(id: string, ativo: boolean): Promise<void> {
  const { api } = await import('../api.js');
  await api('/agents/' + encodeURIComponent(id), {
    method: 'PUT',
    body: JSON.stringify({ ativo }),
  });
  // atualiza local otimista e reconcilia
  agentesStore.update((list) => list.map((a) => (a.id === id ? { ...a, ativo } : a)));
  await carregarAgentes().catch(() => {});
}

export async function semearCatalogoStore(): Promise<{ criados: string[]; existentes: string[] }> {
  const { api } = await import('../api.js');
  const r = await api<{ criados: string[]; existentes: string[] }>('/agents/semear-catalogo', { method: 'POST' });
  await carregarAgentes().catch(() => {});
  return r;
}

export async function chamarAgenteStore(id: string, ordem: string): Promise<void> {
  const { api } = await import('../api.js');
  await api('/agents/' + encodeURIComponent(id) + '/run', {
    method: 'POST',
    body: JSON.stringify({ ordem }),
  });
}

export async function carregarAgenteDetalhe(id: string): Promise<Record<string, unknown> | null> {
  const { api } = await import('../api.js');
  try {
    const a = await api<Record<string, unknown>>('/agents/' + encodeURIComponent(id));
    return a;
  } catch {
    return null;
  }
}

export async function salvarAgenteStore(id: string, patch: Record<string, unknown>): Promise<void> {
  const { api } = await import('../api.js');
  await api('/agents/' + encodeURIComponent(id), {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
  await carregarAgentes().catch(() => {});
}

export async function criarAgenteStore(id: string, from: string, model?: string): Promise<void> {
  const { api } = await import('../api.js');
  await api('/agents', {
    method: 'POST',
    body: JSON.stringify({ id, from, model: model || undefined }),
  });
  await carregarAgentes().catch(() => {});
}

export async function excluirAgenteStore(id: string): Promise<void> {
  const { api } = await import('../api.js');
  await api('/agents/' + encodeURIComponent(id), { method: 'DELETE' });
  // remove local otimista
  agentesStore.update((list) => list.filter((a) => a.id !== id));
  await carregarAgentes().catch(() => {});
}
