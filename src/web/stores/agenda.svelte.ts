/**
 * Store Agenda — Svelte 5 (writable) + helpers puros para CRUD de rotinas agendadas.
 * Mantém a API via src/web/api.ts e expõe helpers testáveis.
 */
import { writable, derived } from 'svelte/store';

export interface AgendaJob {
  id: string;
  nome: string;
  agenda: {
    tipo: string;
    valor: string | number;
  };
  args: string[];
  workspace: string;
  ativo: boolean;
  proxima_exec?: string;
  ultima_exec?: string;
  [k: string]: unknown;
}

export type AgendaEscopo = 'ws' | 'todas';
export type AgendaTipo = 'intervalo_min' | 'cron' | 'data_unica';

export const TIPOS_AGENDA: readonly AgendaTipo[] = ['intervalo_min', 'cron', 'data_unica'] as const;

export const agendaJobsStore = writable<AgendaJob[]>([]);
export const agendaCarregandoStore = writable<boolean>(false);
export const agendaErroStore = writable<string | null>(null);
export const agendaEscopoStore = writable<AgendaEscopo>('ws');

// derived helpers
export const jobsAtivos = derived(agendaJobsStore, ($jobs) => $jobs.filter((j) => j.ativo));
export const jobsPausados = derived(agendaJobsStore, ($jobs) => $jobs.filter((j) => !j.ativo));

/** Converte valor bruto do input para payload da API */
export function prepararValorParaApi(tipo: string, valor: string): string {
  const v = valor.trim();
  if (tipo === 'data_unica') {
    if (!v) return v;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return v;
    return d.toISOString();
  }
  if (tipo === 'intervalo_min') {
    return String(Number(v));
  }
  return v;
}

/** Converte valor armazenado (ISO / string) para valor de input datetime-local ou texto */
export function valorParaInput(tipo: string, valor: string | number): string {
  const s = String(valor ?? '');
  if (!s) return '';
  if (tipo === 'data_unica') {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    const p2 = (n: number): string => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
  }
  return s;
}

/** Separa string de args em array (espaços) */
export function parseArgsString(argsStr: string): string[] {
  return argsStr.trim().split(/\s+/).filter(Boolean);
}

/** Retorna classe de badge por tipo (espelha src/web/format.ts#badgeTipo) */
export function badgeTipoAgenda(tipo: string): string {
  switch (tipo) {
    case 'cron': return 'badge-pipeline';
    case 'intervalo_min': return 'badge-review';
    case 'data_unica': return 'badge-warn';
    default: return 'badge-neutral';
  }
}

/** Validação pura usada no form */
export function validarAgendaForm(nome: string, valor: string, argsStr: string): string | null {
  if (!nome.trim()) return 'Nome é obrigatório';
  if (!valor.trim()) return 'Valor é obrigatório';
  if (!parseArgsString(argsStr).length) return 'Comando (args) é obrigatório';
  if (String(valor).trim() === '0') return 'Valor deve ser > 0';
  return null;
}

/** Carrega lista de rotinas conforme escopo e atualiza stores */
export async function carregarAgenda(escopo: AgendaEscopo = 'ws'): Promise<AgendaJob[]> {
  const { api, q } = await import('../api.js');
  agendaCarregandoStore.set(true);
  agendaErroStore.set(null);
  try {
    const jobs: AgendaJob[] = escopo === 'todas'
      ? await api<AgendaJob[]>('/schedules?all=1')
      : await q<AgendaJob[]>('/schedules');
    const lista = Array.isArray(jobs) ? jobs : [];
    agendaJobsStore.set(lista);
    agendaEscopoStore.set(escopo);
    return lista;
  } catch (e) {
    const msg = (e as Error)?.message ?? 'Não foi possível carregar as rotinas.';
    agendaErroStore.set(msg);
    throw e;
  } finally {
    agendaCarregandoStore.set(false);
  }
}

export async function criarAgendaStore(payload: { nome: string; agenda_tipo: string; agenda_valor: string; args: string[]; workspace?: string }): Promise<void> {
  const { api } = await import('../api.js');
  await api('/schedules', { method: 'POST', body: JSON.stringify(payload) });
  // recarrega escopo atual
  const { get } = await import('svelte/store');
  const escopo = get(agendaEscopoStore);
  await carregarAgenda(escopo);
}

export async function atualizarAgendaStore(id: string, patch: Record<string, unknown>): Promise<void> {
  const { api } = await import('../api.js');
  await api('/schedules/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(patch) });
  const { get } = await import('svelte/store');
  const escopo = get(agendaEscopoStore);
  await carregarAgenda(escopo);
}

export async function toggleAgendaAtivoStore(id: string, ativo: boolean): Promise<void> {
  await atualizarAgendaStore(id, { ativo: !ativo });
}

export async function executarAgendaAgoraStore(id: string): Promise<{ resultado?: string }> {
  const { api } = await import('../api.js');
  const res = await api<{ resultado?: string }>('/schedules/' + id + '/run', { method: 'POST' });
  const { get } = await import('svelte/store');
  const escopo = get(agendaEscopoStore);
  await carregarAgenda(escopo);
  return res;
}

export async function excluirAgendaStore(id: string): Promise<void> {
  const { api } = await import('../api.js');
  await api('/schedules/' + id, { method: 'DELETE' });
  const { get } = await import('svelte/store');
  const escopo = get(agendaEscopoStore);
  await carregarAgenda(escopo);
}

export async function buscarAgendaPorId(id: string): Promise<AgendaJob | null> {
  const { api } = await import('../api.js');
  try {
    const j = await api<AgendaJob>('/schedules/' + encodeURIComponent(id));
    return j;
  } catch {
    return null;
  }
}
