/**
 * Hash router — navegação SPA via window.location.hash.
 */

import { setViewAtual, setTaskAberta } from "./state.js";
import { renderView } from "./main.js";

/**
 * Navega para uma view/hash.
 * @param hash Hash sem # (ex: 'home', 'tasks', 'app/meu-app')
 */
export function navegar(hash: string): void {
  if (hash.startsWith('app/')) {
    setViewAtual('app-detail');
  } else {
    setViewAtual(hash.replace('#/', '') || 'home');
  }
  window.location.hash = hash;
  renderView();
}

/**
 * Parseia o hash atual e retorna a view correspondente.
 */
export function parseHash(): string {
  const h = window.location.hash.slice(1);
  if (!h) return 'home';
  if (h.startsWith('app/')) return 'app-detail';
  if (h === 'historico') return 'historico';
  if (h === 'secretario') return 'secretario';
  return h;
}

/** Inicializa listener de hashchange */
export function initRouter(): void {
  window.addEventListener('hashchange', () => {
    const h = parseHash();
    if (h.startsWith('app/')) setViewAtual('app-detail');
    else if (h === 'historico' || h === 'secretario') setViewAtual(h);
    else setViewAtual(h);
    renderView();
  });

  sincronizarComHash();

  // ESC para fechar drawer
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      const drawer = document.getElementById('drawer');
      if (drawer?.classList.contains('open')) {
        fecharDrawer();
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