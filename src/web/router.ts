/**
 * History router — URLs amigáveis sem # (ex.: /secretario?sessao=...).
 * Mantém compatibilidade com hash antigo #/ para links antigos.
 */

import { setViewAtual, setTaskAberta } from "./state.js";
import { renderView } from "./main.js";
import { fecharChatLateral } from "./chat-lateral.js";

/**
 * Navega para uma view.
 * @param hash View sem # nem / (ex: 'home', 'tasks', 'app/meu-app')
 */
export function navegar(hash: string): void {
  const limpo = hash.replace(/^#\/?/, '').replace(/^\//, '');
  fecharDrawerSeAberto();
  if (limpo.startsWith('app/')) {
    setViewAtual('app-detail');
  } else {
    setViewAtual(limpo || 'home');
  }
  const url = '/' + limpo;
  // preserva query atual se for navegação para mesma view com sessao
  if (window.location.pathname !== url || window.location.search) {
    history.pushState(null, '', url);
  }
  renderView();
}

/** Fecha o drawer de task se estiver aberto (evita overlay órfão ao trocar de view). */
function fecharDrawerSeAberto(): void {
  const drawer = document.getElementById('drawer');
  if (drawer?.classList.contains('open')) fecharDrawer();
}

/** Extrai caminho da URL limpa (/secretario) com fallback para hash antigo (#/secretario) */
function caminhoAtual(): string {
  const hash = window.location.hash;
  if (hash.startsWith('#/')) return hash.replace(/^#\/?/, '').split('?')[0] ?? '';
  const p = window.location.pathname.replace(/^\//, '').split('?')[0] ?? '';
  return p;
}
function queryAtual(): string {
  if (window.location.hash.includes('?')) return window.location.hash.split('?')[1] ?? '';
  return window.location.search.replace(/^\?/, '');
}

/**
 * Parseia o hash/path atual e retorna a view correspondente.
 * Params (ex.: /secretario?sessao=ses_x) são ignorados aqui —
 * cada view lê os seus via parametroHash().
 */
export function parseHash(): string {
  const h = caminhoAtual();
  if (!h) return 'home';
  if (h.startsWith('app/')) return 'app-detail';
  return h;
}

/** Valor de ?nome= na URL atual (ex.: 'sessao' em /secretario?sessao=ses_x) — suporta hash e history */
export function parametroHash(nome: string): string | null {
  const q = queryAtual();
  return new URLSearchParams(q).get(nome);
}

/** Inicializa listener de navegação (history + hash fallback) */
export function initRouter(): void {
  window.addEventListener('popstate', () => {
    fecharDrawerSeAberto();
    const h = parseHash();
    if (h.startsWith('app/')) setViewAtual('app-detail');
    else setViewAtual(h);
    renderView();
  });
  window.addEventListener('hashchange', () => {
    // compat: links antigos #/ -> converte para URL limpa sem recarregar
    if (window.location.hash.startsWith('#/')) {
      const novo = '/' + window.location.hash.replace(/^#\/?/, '');
      history.replaceState(null, '', novo);
    }
    fecharDrawerSeAberto();
    const h = parseHash();
    if (h.startsWith('app/')) setViewAtual('app-detail');
    else setViewAtual(h);
    renderView();
  });

  sincronizarComHash();

  // ESC fecha o drawer de task OU o chat lateral (o que estiver aberto)
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      const drawer = document.getElementById('drawer');
      if (drawer?.classList.contains('open')) {
        fecharDrawer();
      } else if (document.getElementById('chat-drawer')?.classList.contains('open')) {
        fecharChatLateral();
      }
    }
  });
}

/** Alinha a view ativa com o hash atual da URL (usado no boot e pós-login). */
export function sincronizarComHash(): void {
  const h = parseHash();
  if (h.startsWith('app/')) setViewAtual('app-detail');
  else setViewAtual(h);
}

/** Abre o drawer de detalhes da task */
export async function abrirDrawer(id: string, titulo: string): Promise<void> {
  const { carregarDrawerConteudo } = await import("./views/tasks.js");

  // drawer de task e chat lateral são mutuamente exclusivos (mesmo lado da tela)
  fecharChatLateral();

  setTaskAberta(id);
  document.getElementById('drawer-title')!.textContent = titulo;
  document.getElementById('drawer')!.classList.add('open');
  document.getElementById('drawer-overlay')!.classList.add('open');
  await carregarDrawerConteudo(id);
}

/** Fecha o drawer */
export function fecharDrawer(): void {
  setTaskAberta(null);
  document.getElementById('drawer')!.classList.remove('open');
  document.getElementById('drawer-overlay')!.classList.remove('open');
  document.getElementById('drawer-content')!.innerHTML = '';
}