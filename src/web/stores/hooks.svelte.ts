/**
 * Store Hooks — Svelte 5 (writable) + helpers puros.
 * Mantém API via src/web/api.ts e expõe helpers testáveis.
 * Espelha src/web/views/hooks.ts (CRUD de webhooks de entrada).
 */
import { writable, derived } from 'svelte/store';

export interface HookInfo {
  id: string;
  nome: string;
  ativo: boolean;
  respond: string;
  dedup_seg: number;
  metodos: string[];
  alvo: Record<string, unknown>;
  criado_em?: string;
  url?: string;
  token?: string;
}

export interface CampoAlvo {
  chave: string;
  placeholder: string;
  required: boolean;
}

export interface AlvoDef {
  tipo: string;
  rotulo: string;
  campos: CampoAlvo[];
}

export const ALVOS: AlvoDef[] = [
  {
    tipo: 'task_create',
    rotulo: 'criar task',
    campos: [
      { chave: 'titulo', placeholder: 'título da task (aceita {{payload.corpo.x}})', required: true },
      { chave: 'responsavel', placeholder: 'responsável opcional (agente:id)', required: false },
    ],
  },
  {
    tipo: 'agent_run',
    rotulo: 'rodar agente',
    campos: [
      { chave: 'agente', placeholder: 'id do agente (ex: executor-padrao)', required: true },
      { chave: 'ordem', placeholder: 'ordem para o agente (aceita {{payload}})', required: true },
    ],
  },
  {
    tipo: 'flow_run',
    rotulo: 'rodar fluxo',
    campos: [
      { chave: 'flow', placeholder: 'id do fluxo', required: true },
      { chave: 'entrada', placeholder: 'entrada do fluxo (aceita {{payload}})', required: true },
    ],
  },
  {
    tipo: 'webhook_out',
    rotulo: 'webhook de saída',
    campos: [
      { chave: 'url', placeholder: 'https://…', required: true },
      { chave: 'metodo', placeholder: 'método (padrão POST)', required: false },
    ],
  },
];

export const TIPOS_ALVO = ALVOS.map((a) => a.tipo);

// ── stores ─────────────────────────────────────────────────────────────────
export const hooksStore = writable<HookInfo[]>([]);
export const carregandoStore = writable<boolean>(false);
export const erroStore = writable<string | null>(null);

// derived
export const temHooks = derived(hooksStore, ($h) => $h.length > 0);
export const hooksAtivos = derived(hooksStore, ($h) => $h.filter((h) => h.ativo !== false));
export const hooksInativos = derived(hooksStore, ($h) => $h.filter((h) => h.ativo === false));

// ── helpers puros ──────────────────────────────────────────────────────────

export function rotuloAlvo(alvo: Record<string, unknown>): string {
  const def = ALVOS.find((a) => a.tipo === alvo?.tipo);
  let detalhe = '';
  if (alvo.tipo === 'agent_run') detalhe = String(alvo.agente || '');
  else if (alvo.tipo === 'flow_run') detalhe = String(alvo.flow || '');
  else if (alvo.tipo === 'task_create') detalhe = String(alvo.titulo || '');
  else detalhe = String(alvo.url || '');
  return `${def?.rotulo ?? String(alvo?.tipo || '—')}${detalhe ? ' · ' + detalhe : ''}`;
}

export function camposForTipo(tipo: string): CampoAlvo[] {
  return ALVOS.find((a) => a.tipo === tipo)?.campos ?? [];
}

export function tiposAlvo(): string[] {
  return [...TIPOS_ALVO];
}

export function validarHookForm(
  nome: string,
  tipo: string,
  valores: Record<string, string>,
  dedup?: number,
): string | null {
  if (!nome.trim()) return 'Nome é obrigatório';
  if (!TIPOS_ALVO.includes(tipo)) return 'Tipo de alvo inválido';
  const campos = camposForTipo(tipo);
  for (const c of campos) {
    if (c.required && !(valores[c.chave] ?? '').trim()) return `Campo obrigatório: ${c.chave}`;
  }
  if (tipo === 'webhook_out') {
    const url = (valores.url ?? '').trim();
    if (url && !/^https?:\/\/.+/.test(url)) return 'URL inválida — deve começar com http:// ou https://';
  }
  if (dedup !== undefined && dedup !== null) {
    const n = Number(dedup);
    if (Number.isNaN(n) || n < 0) return 'Dedup deve ser >= 0';
  }
  return null;
}

export function montarAlvo(tipo: string, valores: Record<string, string>): Record<string, unknown> {
  const alvo: Record<string, unknown> = { tipo };
  for (const [k, v] of Object.entries(valores)) {
    const val = (v ?? '').trim();
    if (val) alvo[k] = val;
  }
  return alvo;
}

export function construirUrlHook(ws: string, id: string, origin?: string): string {
  const base = origin ?? (typeof location !== 'undefined' ? location.origin : '');
  const wsPart = ws || '<workspace>';
  return `${base}/hooks/${wsPart}/${id}`;
}

export function construirCurl(ws: string, id: string, token: string, origin?: string): string {
  const base = origin ?? (typeof location !== 'undefined' ? location.origin : '');
  const wsPart = ws || '';
  return `curl -X POST ${base}/hooks/${wsPart}/${id} -H "x-opencorp-token: ${token}" -H "content-type: application/json" -d '{"exemplo":"valor"}'`;
}

// ── API wrappers ───────────────────────────────────────────────────────────

export async function carregarHooks(): Promise<HookInfo[]> {
  const { api } = await import('../api.js');
  carregandoStore.set(true);
  erroStore.set(null);
  try {
    const data = await api<HookInfo[]>('/hooks');
    const lista = Array.isArray(data) ? data : [];
    hooksStore.set(lista);
    return lista;
  } catch (e) {
    const msg = (e as Error)?.message ?? 'Não foi possível carregar os hooks.';
    erroStore.set(msg);
    throw e;
  } finally {
    carregandoStore.set(false);
  }
}

export async function buscarHookDetalhe(id: string): Promise<HookInfo> {
  const { api } = await import('../api.js');
  const det = await api<HookInfo>('/hooks/' + encodeURIComponent(id));
  return det;
}

export async function criarHookStore(payload: {
  nome: string;
  alvo: Record<string, unknown>;
  respond: string;
  dedup_seg: number;
}): Promise<HookInfo> {
  const { api } = await import('../api.js');
  const criado = await api<HookInfo>('/hooks', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  await carregarHooks();
  return criado;
}

export async function excluirHookStore(id: string): Promise<void> {
  const { api } = await import('../api.js');
  await api('/hooks/' + encodeURIComponent(id), { method: 'DELETE' });
  hooksStore.update((list) => list.filter((h) => h.id !== id));
}
