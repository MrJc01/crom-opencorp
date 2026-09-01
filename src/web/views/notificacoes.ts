/**
 * View Notificações — feed de avisos dos agentes (Etapa 7 / P-24).
 * Store: <ws>/.opencorp/notifications.json · criação: tool `notificar` / POST /notifications.
 * Badge no navbar (#nav-badge-notificacoes) atualiza no boot, no render e via SSE
 * ('notificacao.nova' → incrementarBadgeNotificacoes em main.ts).
 */

import { api, toast, icone, escapeHtml } from "../api.js";
import { getWsAtivo } from "../state.js";
import { estadoVazio, estadoErro, estadoCarregando } from "../estado.js";
import { ajuda } from "../help.js";
import { formatarRelativa } from "../format.js";

interface NotificacaoInfo {
  id: string;
  titulo: string;
  corpo: string;
  tipo: string;
  origem: string;
  lida: boolean;
  criado_em: string;
}

interface RespostaNotificacoes {
  notificacoes: NotificacaoInfo[];
  resumo: { nao_lidas: number; total: number };
}

/** Estilo do badge por tipo de notificação */
const CLASSE_TIPO: Record<string, string> = {
  resumo: 'badge-ok',
  aviso: 'badge-warn',
  erro: 'badge-err',
  info: 'badge-neutral',
};

/** Filtro atual (persistido só em memória — reinicia no reload, como os outros) */
let filtroNaoLidas = false;

/** Atualiza o badge do navbar a partir do resumo do GET (sem fetch extra) */
function pintarBadge(naoLidas: number): void {
  const badge = document.getElementById('nav-badge-notificacoes');
  if (!badge) return;
  badge.textContent = String(naoLidas);
  badge.classList.toggle('hidden', naoLidas === 0);
}

/** Busca o resumo e atualiza o badge — chamado no boot (iniciarApp). */
export async function atualizarBadgeNotificacoes(): Promise<void> {
  try {
    const r = await api<RespostaNotificacoes>('/notifications');
    pintarBadge(r.resumo?.nao_lidas ?? 0);
  } catch {
    /* silencioso — badge é cosmético */
  }
}

/** Incrementa o badge em +1 sem fetch (chamado pelo SSE 'notificacao.nova'). */
export function incrementarBadgeNotificacoes(): void {
  const badge = document.getElementById('nav-badge-notificacoes');
  if (!badge) return;
  const atual = Number(badge.textContent ?? '0');
  pintarBadge((Number.isFinite(atual) ? atual : 0) + 1);
}

/** Renderiza a view Notificações */
export async function renderNotificacoes(): Promise<void> {
  const viewEl = document.getElementById('view-notificacoes');
  if (!viewEl) return;

  if (!viewEl.innerHTML.trim()) {
    viewEl.innerHTML = `<div class="page-header"><div class="page-header-esq"><h1 class="page-header-titulo">${icone('sino')} Notificações</h1><p class="page-header-sub">Avisos dos agentes</p></div></div>` + estadoCarregando();
  }

  let resposta: RespostaNotificacoes | null;
  try {
    resposta = await api<RespostaNotificacoes>('/notifications');
  } catch {
    resposta = null;
  }

  if (!resposta) {
    viewEl.innerHTML = `<div class="page-header"><div class="page-header-esq"><h1 class="page-header-titulo">${icone('sino')} Notificações</h1><p class="page-header-sub">Avisos dos agentes</p></div><div class="page-header-acoes"><span class="help-wrap">${ajuda('notificacoes')}</span></div></div>` +
      estadoErro('Não foi possível carregar as notificações.', () => { void renderNotificacoes(); });
    return;
  }

  const todas = resposta.notificacoes ?? [];
  const naoLidas = resposta.resumo?.nao_lidas ?? 0;
  pintarBadge(naoLidas);
  const visiveis = filtroNaoLidas ? todas.filter((n) => !n.lida) : todas;

  viewEl.innerHTML = `
    <div class="page-header">
      <div class="page-header-esq">
        <h1 class="page-header-titulo">${icone('sino')} Notificações</h1>
        <p class="page-header-sub">Avisos dos agentes — ${naoLidas} não lida${naoLidas === 1 ? '' : 's'} de ${todas.length}</p>
      </div>
      <div class="page-header-acoes">
        <span class="help-wrap">${ajuda('notificacoes')}</span>
        <button class="btn btn-ghost" onclick="marcarTodasNotificacoesLidas()">${icone('check')} Marcar todas como lidas</button>
        <button class="btn btn-ghost text-error" onclick="limparNotificacoes()">${icone('trash')} Limpar</button>
      </div>
    </div>
    <div class="flex items-center gap-2 mb-4">
      <button id="not-filtro-todas" class="not-filtro ${filtroNaoLidas ? '' : 'ativo'}" onclick="alternarFiltroNotificacoes(false)">Todas (${todas.length})</button>
      <button id="not-filtro-nao-lidas" class="not-filtro ${filtroNaoLidas ? 'ativo' : ''}" onclick="alternarFiltroNotificacoes(true)">Não lidas (${naoLidas})</button>
    </div>
    <div id="notificacoes-lista" class="space-y-3"></div>
  `;

  const el = document.getElementById('notificacoes-lista');
  if (!el) return;

  if (!visiveis.length) {
    el.innerHTML = estadoVazio(
      'sino',
      filtroNaoLidas ? 'Nenhuma não lida' : 'Nenhuma notificação',
      filtroNaoLidas
        ? 'Tudo em ordem — não há avisos pendentes neste workspace.'
        : 'Agentes avisam aqui ao finalizar execuções relevantes (tool <strong>notificar</strong>). O painel também pode receber avisos manuais via <code>POST /notifications</code>.',
    );
    return;
  }

  el.innerHTML = visiveis.map((n) => `
    <div class="not-card ${n.lida ? 'lida' : 'nao-lida'}" data-not-id="${escapeHtml(n.id)}">
      <div class="flex items-start gap-3">
        ${n.lida ? '' : '<span class="not-dot"></span>'}
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-medium text-sm">${escapeHtml(n.titulo)}</span>
            <span class="badge ${CLASSE_TIPO[n.tipo] ?? 'badge-neutral'}">${escapeHtml(n.tipo)}</span>
            <span class="text-xs text-zinc-500">${formatarRelativa(n.criado_em)}</span>
          </div>
          <div class="not-corpo text-sm text-zinc-300 mt-1">${escapeHtml(n.corpo)}</div>
          <div class="text-xs text-zinc-600 mt-1 font-mono">origem: ${escapeHtml(n.origem || '—')}</div>
        </div>
        ${n.lida ? '' : `<button class="btn btn-ghost flex-none" onclick="marcarNotificacaoLida('${escapeHtml(n.id)}')">${icone('check')} Marcar lida</button>`}
      </div>
    </div>
  `).join('');
}

/** Marca UMA notificação como lida e re-renderiza (badge incluído) */
export async function marcarNotificacaoLida(id: string): Promise<void> {
  try {
    await api('/notifications/' + encodeURIComponent(id) + '/lida', { method: 'POST' });
    await renderNotificacoes();
  } catch (e) {
    toast('Erro ao marcar como lida: ' + (e as Error).message, 'erro');
  }
}

/** Marca TODAS como lidas e re-renderiza */
export async function marcarTodasNotificacoesLidas(): Promise<void> {
  try {
    await api('/notifications/lidas', { method: 'POST' });
    toast('Notificações marcadas como lidas', 'ok');
    await renderNotificacoes();
  } catch (e) {
    toast('Erro ao marcar todas: ' + (e as Error).message, 'erro');
  }
}

/** Limpa todas as notificações do workspace (com confirmação) */
export async function limparNotificacoes(): Promise<void> {
  const { modalConfirm } = await import("../modal.js");
  if (!(await modalConfirm(`Apagar TODAS as notificações de "${escapeHtml(getWsAtivo() || 'workspace')}"? Essa ação não volta atrás.`, { titulo: 'Limpar notificações', confirmar: 'Limpar' }))) return;
  try {
    await api('/notifications', { method: 'DELETE' });
    toast('Notificações apagadas', 'ok');
    await renderNotificacoes();
  } catch (e) {
    toast('Erro ao limpar: ' + (e as Error).message, 'erro');
  }
}

/** Alterna o filtro Todas / Não lidas */
export function alternarFiltroNotificacoes(soNaoLidas: boolean): void {
  filtroNaoLidas = soNaoLidas;
  void renderNotificacoes();
}
