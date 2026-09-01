/**
 * Histórico do Secretário como popup limpo (PLANO Etapa 1b — P-29).
 *
 * Overlay puro anexado a document.body: NÃO re-renderiza a view ativa (o feed
 * segue vivo atrás). Lista agrupada Hoje/Ontem/Anteriores + busca client-side
 * (lógica compartilhada em sessoes-utils.ts). Clique numa conversa fecha o
 * popup e seleciona a sessão no Secretário (window.__secretarioSelecionarSessao).
 * Fecha em Escape (capture — não propaga para drawer/palette) e clique no overlay.
 */

import { q, icone, escapeHtml } from "./api.js";
import { estadoVazio, estadoErro, estadoCarregando } from "./estado.js";
import { agruparSessoes, dataSessao, tempoRelativo, tituloSessao, type SessaoChat } from "./sessoes-utils.js";

let popupEl: HTMLElement | null = null;
let escHandler: ((ev: KeyboardEvent) => void) | null = null;
let busca = '';

export function popupHistoricoAberto(): boolean {
  return popupEl !== null;
}

/** Fecha o popup e remove listeners — idempotente. */
export function fecharHistoricoPopup(): void {
  if (escHandler) {
    document.removeEventListener('keydown', escHandler, { capture: true });
    escHandler = null;
  }
  busca = ''; // reabrir sem filtro stale
  popupEl?.remove();
  popupEl = null;
}

/** Abre o popup de histórico de conversas (exposto como window.abrirHistoricoPopup). */
export async function abrirHistoricoPopup(): Promise<void> {
  if (popupEl) return;

  const overlay = document.createElement('div');
  overlay.className = 'hist-popup';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Histórico de conversas');
  overlay.innerHTML = `
    <div class="hist-popup-box scrollbar-thin">
      <div class="hist-popup-header">
        <h2 class="hist-popup-titulo">${icone('history')} Histórico de conversas</h2>
        <button class="hist-popup-fechar" aria-label="Fechar histórico" title="Fechar (Esc)">${icone('close')}</button>
      </div>
      <div class="hist-popup-busca">
        <span class="hist-busca-ico" aria-hidden="true">${icone('search')}</span>
        <input id="hist-busca" type="search" placeholder="Buscar conversa…" aria-label="Buscar conversa"/>
      </div>
      <div class="hist-popup-lista scrollbar-thin" id="hist-lista">${estadoCarregando()}</div>
    </div>
  `;
  document.body.appendChild(overlay);
  popupEl = overlay;

  overlay.querySelector('.hist-popup-fechar')?.addEventListener('click', () => fecharHistoricoPopup());
  // clique no overlay (fora do box) fecha — filhos têm target próprio
  overlay.addEventListener('mousedown', (ev) => {
    if (ev.target === overlay) fecharHistoricoPopup();
  });
  // capture + stopPropagation: Escape fecha SÓ o popup (drawer/palette atrás intactos)
  escHandler = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape') return;
    ev.stopPropagation();
    ev.preventDefault();
    fecharHistoricoPopup();
  };
  document.addEventListener('keydown', escHandler, { capture: true });

  const input = overlay.querySelector('#hist-busca') as HTMLInputElement | null;
  input?.addEventListener('input', () => {
    busca = input.value.toLowerCase();
    const lista = document.getElementById('hist-lista');
    if (lista && sessoesCache.length) renderLista(lista);
  });

  await carregarSessoes();
}

let sessoesCache: SessaoChat[] = [];

async function carregarSessoes(): Promise<void> {
  const lista = document.getElementById('hist-lista');
  if (!lista || !popupEl) return;

  try {
    sessoesCache = await q<SessaoChat[]>('/secretario/sessoes') ?? [];
  } catch (e) {
    if (!popupEl) return; // fechou enquanto carregava
    const msg = (e as Error).message ?? '';
    // standby do Secretário não é um erro do popup — estado vazio orientando o início
    if (msg.includes('não iniciado') || msg.includes('409')) {
      lista.innerHTML = estadoVazio('history', 'Nenhuma conversa ainda',
        'Inicie o Secretário e converse — as conversas aparecem aqui.');
      return;
    }
    lista.innerHTML = estadoErro('Não foi possível carregar o histórico de conversas.', () => {
      if (lista) lista.innerHTML = estadoCarregando();
      void carregarSessoes();
    });
    return;
  }

  if (!popupEl) return;
  if (!sessoesCache.length) {
    lista.innerHTML = estadoVazio('history', 'Nenhuma conversa ainda',
      'Pergunte qualquer coisa ao Secretário — o histórico fica aqui.');
    return;
  }
  renderLista(lista);
}

function renderLista(lista: HTMLElement): void {
  const filtradas = sessoesCache.filter((s) =>
    !s.sem_conteudo && (!busca || tituloSessao(s).toLowerCase().includes(busca)));

  if (!filtradas.length) {
    lista.innerHTML = estadoVazio('search', 'Nenhuma conversa encontrada',
      busca ? `Nada para “${escapeHtml(busca)}”.` : '');
    return;
  }

  lista.innerHTML = agruparSessoes(filtradas).map(({ grupo, itens }) => `
    <div class="sessao-grupo">${grupo}</div>
    ${itens.map((s) => `
      <button class="sessao-item" data-sessao-id="${escapeHtml(s.id)}">
        <div class="sessao-titulo">${escapeHtml(tituloSessao(s))}</div>
        <div class="sessao-data">${(() => { const d = dataSessao(s); return d ? tempoRelativo(d) : ''; })()}</div>
      </button>
    `).join('')}
  `).join('');

  lista.querySelectorAll<HTMLButtonElement>('.sessao-item').forEach((btn) => {
    btn.addEventListener('click', () => void abrirConversa(btn.dataset.sessaoId ?? ''));
  });
}

/** Fecha o popup e abre a conversa no Secretário (sem quebrar o feed ativo atrás). */
async function abrirConversa(id: string): Promise<void> {
  if (!id) return;
  fecharHistoricoPopup();
  const g = window as unknown as Record<string, unknown>;
  const selecionar = g.__secretarioSelecionarSessao as ((sid: string) => Promise<void>) | undefined;
  if (typeof selecionar === 'function') await selecionar(id);
  const { getViewAtual } = await import("./state.js");
  if (getViewAtual() !== 'secretario') {
    const { navegar } = await import("./router.js");
    navegar('secretario');
  }
}
