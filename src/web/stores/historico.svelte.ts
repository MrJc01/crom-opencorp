/**
 * Store Histórico — Svelte 5 (writable) + helpers puros da timeline.
 * Mantém a API via src/web/api.ts e expõe helpers testáveis.
 * Espelha src/web/views/historico.ts (timeline unificada via GET /historico).
 */
import { writable } from 'svelte/store';

export type TipoHistorico = 'execucao' | 'task' | 'rotina' | 'conversa';
export type TipoFiltro = 'tudo' | TipoHistorico;

export interface ItemHistorico {
  id: string;
  tipo: TipoHistorico;
  titulo: string;
  agente: string;
  quando: string | null;
  status?: string;
  gatilho?: { tipo: string; origem: string } | null;
}

export interface FiltrosHistorico {
  tipo: TipoFiltro;
  agente: string;
  limite: number;
}

export interface AgenteInfo {
  id: string;
}

export const TIPOS_HISTORICO: readonly TipoFiltro[] = ['tudo', 'execucao', 'task', 'rotina', 'conversa'] as const;
export const OPCOES_TIPO: Array<[TipoFiltro, string]> = [
  ['tudo', 'Tudo'],
  ['execucao', 'Execuções'],
  ['task', 'Tasks'],
  ['rotina', 'Rotinas'],
  ['conversa', 'Conversas'],
];
export const LIMITES_HISTORICO = [50, 100, 200] as const;
export const FILTROS_PADRAO: FiltrosHistorico = { tipo: 'tudo', agente: '', limite: 100 };

export const historicoItensStore = writable<ItemHistorico[]>([]);
export const historicoCarregandoStore = writable<boolean>(false);
export const historicoErroStore = writable<string | null>(null);
export const historicoFiltrosStore = writable<FiltrosHistorico>({ ...FILTROS_PADRAO });
export const agentesStore = writable<AgenteInfo[]>([]);

// ── helpers puros ────────────────────────────────────────────────────────

export function labelGatilho(g: { tipo: string; origem: string } | null | undefined): string {
  if (!g) return '';
  return `${g.tipo}${g.origem ? ':' + g.origem : ''}`;
}

export function corDoTipo(tipo: TipoHistorico, status?: string): string {
  if (tipo === 'execucao') return 'var(--accent)';
  if (tipo === 'task') {
    if (status === 'feito') return 'var(--ok)';
    if (status === 'fazendo') return 'var(--warn)';
    return 'var(--ok)';
  }
  if (tipo === 'conversa') return 'var(--ok)';
  return 'var(--warn)'; // rotina
}

export function labelDoTipo(tipo: TipoHistorico): string {
  switch (tipo) {
    case 'execucao': return 'Execução';
    case 'task': return 'Task';
    case 'rotina': return 'Rotina';
    case 'conversa': return 'Conversa';
  }
}

/** Constrói querystring para GET /historico a partir dos filtros (sem efeitos colaterais) */
export function construirParamsHistorico(filtros: FiltrosHistorico): string {
  const params = new URLSearchParams();
  if (filtros.tipo !== 'tudo') params.set('tipo', filtros.tipo);
  if (filtros.agente) params.set('agente', filtros.agente);
  params.set('limite', String(filtros.limite));
  return params.toString();
}

/** Validação pura dos filtros — retorna mensagem de erro ou null se válido */
export function validarFiltrosHistorico(f: FiltrosHistorico): string | null {
  if (!TIPOS_HISTORICO.includes(f.tipo)) return 'Tipo de filtro inválido';
  if (!LIMITES_HISTORICO.includes(f.limite as typeof LIMITES_HISTORICO[number])) return 'Limite inválido';
  return null;
}

/** Formata subtítulo do item (tipo · agente · status · gatilho) — puro, sem HTML escape aqui */
export function subtituloItem(e: ItemHistorico): string {
  const partes: string[] = [labelDoTipo(e.tipo)];
  if (e.agente) partes.push(e.agente);
  if (e.status) partes.push(e.status);
  if (e.tipo === 'execucao' && e.gatilho) partes.push('gatilho: ' + labelGatilho(e.gatilho));
  return partes.join(' · ');
}

// ── API loaders ──────────────────────────────────────────────────────────

export async function carregarHistorico(filtros: FiltrosHistorico = FILTROS_PADRAO): Promise<ItemHistorico[]> {
  const { q } = await import('../api.js');
  historicoCarregandoStore.set(true);
  historicoErroStore.set(null);
  try {
    const params = construirParamsHistorico(filtros);
    const itens = await q<ItemHistorico[]>('/historico?' + params);
    const lista = Array.isArray(itens) ? itens : [];
    historicoItensStore.set(lista);
    historicoFiltrosStore.set({ ...filtros });
    return lista;
  } catch (e) {
    const msg = (e as Error)?.message ?? 'Não foi possível carregar o histórico.';
    historicoErroStore.set(msg);
    throw e;
  } finally {
    historicoCarregandoStore.set(false);
  }
}

export async function carregarAgentes(): Promise<AgenteInfo[]> {
  const { q } = await import('../api.js');
  try {
    const agentes = await q<AgenteInfo[]>('/agents');
    const lista = Array.isArray(agentes) ? agentes : [];
    agentesStore.set(lista);
    return lista;
  } catch {
    agentesStore.set([]);
    return [];
  }
}

/** Busca detalhes de um item específico — retorna HTML/string cru conforme tipo (usa api) */
export async function fetchDetalheExecucao(id: string): Promise<{ log: string }> {
  const { q } = await import('../api.js');
  return q<{ log: string }>('/sessions/' + encodeURIComponent(id) + '/log');
}

export async function fetchDetalheTask(id: string): Promise<Record<string, unknown>> {
  const { q } = await import('../api.js');
  return q<Record<string, unknown>>('/tasks/' + encodeURIComponent(id));
}

export async function fetchDetalheRotina(id: string): Promise<{ rotina: Record<string, unknown>; runs: Array<Record<string, unknown>> }> {
  const { q } = await import('../api.js');
  const j = await q<Record<string, unknown>>('/schedules/' + encodeURIComponent(id));
  const runs = await q<Array<Record<string, unknown>>>('/schedules/' + encodeURIComponent(id) + '/runs?limite=5').catch(() => []);
  return { rotina: j, runs };
}

export async function fetchDetalheConversa(id: string): Promise<Array<{ role: string; content: string }>> {
  const { q } = await import('../api.js');
  return q<Array<{ role: string; content: string }>>('/secretario/sessoes/' + encodeURIComponent(id) + '/mensagens');
}
