/**
 * Store Notificações — Svelte 5 (writable) + helpers puros.
 * Migração de src/web/views/notificacoes.ts (Etapa 7 / P-24)
 * Mantém a mesma lógica de badge, filtro e CRUD via src/web/api.ts.
 */
import { writable, derived, get } from 'svelte/store';

// ── Tipos ───────────────────────────────────────────────────────────────
export interface NotificacaoInfo {
  id: string;
  titulo: string;
  corpo: string;
  tipo: string;
  origem: string;
  lida: boolean;
  criado_em: string;
}

export interface RespostaNotificacoes {
  notificacoes: NotificacaoInfo[];
  resumo: { nao_lidas: number; total: number };
}

// ── Constantes ──────────────────────────────────────────────────────────
export const CLASSE_TIPO: Record<string, string> = {
  resumo: 'badge-ok',
  aviso: 'badge-warn',
  erro: 'badge-err',
  info: 'badge-neutral',
};

// ── Helpers puros (testáveis) ───────────────────────────────────────────
export function classeTipo(tipo: string): string {
  return CLASSE_TIPO[tipo] ?? 'badge-neutral';
}

export function filtrarNotificacoes(
  lista: NotificacaoInfo[],
  soNaoLidas: boolean,
): NotificacaoInfo[] {
  if (!soNaoLidas) return lista;
  return lista.filter((n) => !n.lida);
}

export function contarNaoLidas(lista: NotificacaoInfo[]): number {
  return lista.filter((n) => !n.lida).length;
}

// ── Stores ──────────────────────────────────────────────────────────────
export const notificacoesStore = writable<NotificacaoInfo[]>([]);
export const resumoStore = writable<{ nao_lidas: number; total: number }>({
  nao_lidas: 0,
  total: 0,
});
export const carregandoStore = writable<boolean>(false);
export const erroStore = writable<string | null>(null);
export const filtroNaoLidasStore = writable<boolean>(false);

// derived
export const notificacoesVisiveisStore = derived(
  [notificacoesStore, filtroNaoLidasStore],
  ([$lista, $filtro]) => filtrarNotificacoes($lista, $filtro),
);
export const naoLidasStore = derived(notificacoesStore, ($lista) =>
  contarNaoLidas($lista),
);
export const totalStore = derived(notificacoesStore, ($lista) => $lista.length);
export const resumoNaoLidasStore = derived(resumoStore, ($r) => $r.nao_lidas);
export const resumoTotalStore = derived(resumoStore, ($r) => $r.total);

// ── Badge helpers (mantêm compat com main.ts SSE) ──────────────────────
export function pintarBadge(naoLidas: number): void {
  if (typeof document === 'undefined') return;
  const badge = document.getElementById('nav-badge-notificacoes');
  if (!badge) return;
  badge.textContent = String(naoLidas);
  badge.classList.toggle('hidden', naoLidas === 0);
}

export async function atualizarBadgeNotificacoes(): Promise<void> {
  try {
    const { api } = await import('../api.js');
    const r = await api<RespostaNotificacoes>('/notifications');
    pintarBadge(r.resumo?.nao_lidas ?? 0);
  } catch {
    /* silencioso — badge é cosmético */
  }
}

export function incrementarBadgeNotificacoes(): void {
  if (typeof document === 'undefined') return;
  const badge = document.getElementById('nav-badge-notificacoes');
  if (!badge) return;
  const atual = Number(badge.textContent ?? '0');
  pintarBadge((Number.isFinite(atual) ? atual : 0) + 1);
}

// ── API helpers ─────────────────────────────────────────────────────────
export async function carregarNotificacoes(): Promise<RespostaNotificacoes> {
  const { api } = await import('../api.js');
  carregandoStore.set(true);
  erroStore.set(null);
  try {
    const r = await api<RespostaNotificacoes>('/notifications');
    const lista = Array.isArray(r.notificacoes) ? r.notificacoes : [];
    const resumo = r.resumo ?? {
      nao_lidas: contarNaoLidas(lista),
      total: lista.length,
    };
    notificacoesStore.set(lista);
    resumoStore.set({
      nao_lidas: resumo.nao_lidas ?? contarNaoLidas(lista),
      total: resumo.total ?? lista.length,
    });
    pintarBadge(resumo.nao_lidas ?? contarNaoLidas(lista));
    return { notificacoes: lista, resumo: { nao_lidas: resumo.nao_lidas ?? 0, total: resumo.total ?? lista.length } };
  } catch (e) {
    const msg = (e as Error)?.message ?? 'Não foi possível carregar as notificações.';
    erroStore.set(msg);
    throw e;
  } finally {
    carregandoStore.set(false);
  }
}

export async function marcarNotificacaoLidaStore(id: string): Promise<void> {
  const { api } = await import('../api.js');
  const { toast } = await import('../api.js');
  try {
    await api('/notifications/' + encodeURIComponent(id) + '/lida', {
      method: 'POST',
    });
    await carregarNotificacoes();
  } catch (e) {
    toast('Erro ao marcar como lida: ' + (e as Error).message, 'erro');
    throw e;
  }
}

export async function marcarTodasNotificacoesLidasStore(): Promise<void> {
  const { api } = await import('../api.js');
  const { toast } = await import('../api.js');
  try {
    await api('/notifications/lidas', { method: 'POST' });
    toast('Notificações marcadas como lidas', 'ok');
    await carregarNotificacoes();
  } catch (e) {
    toast('Erro ao marcar todas: ' + (e as Error).message, 'erro');
    throw e;
  }
}

export async function limparNotificacoesStore(): Promise<void> {
  const { api } = await import('../api.js');
  const { toast } = await import('../api.js');
  const { getWsAtivo } = await import('../state.js');
  const { modalConfirm } = await import('../modal.js');
  const { escapeHtml } = await import('../format.js');
  const ws = getWsAtivo() || 'workspace';
  if (
    !(await modalConfirm(
      `Apagar TODAS as notificações de "${escapeHtml(ws)}"? Essa ação não volta atrás.`,
      { titulo: 'Limpar notificações', confirmar: 'Limpar' },
    ))
  )
    return;
  try {
    await api('/notifications', { method: 'DELETE' });
    toast('Notificações apagadas', 'ok');
    await carregarNotificacoes();
  } catch (e) {
    toast('Erro ao limpar: ' + (e as Error).message, 'erro');
    throw e;
  }
}

export function alternarFiltroNotificacoesStore(soNaoLidas: boolean): void {
  filtroNaoLidasStore.set(soNaoLidas);
}
