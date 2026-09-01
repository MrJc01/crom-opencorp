/**
 * Hash router — navegação SPA via window.location.hash.
 */

import { setViewAtual, setTaskAberta } from "./state.js";
import { renderView } from "./main.js";
import { fecharChatLateral } from "./chat-lateral.js";

/**
 * Navega para uma view/hash.
 * @param hash Hash sem # nem #/ (ex: 'home', 'tasks', 'app/meu-app')
 */
export function navegar(hash: string): void {
  const limpo = hash.replace(/^#\/?/, '');
  fecharDrawerSeAberto();
  if (limpo.startsWith('app/')) {
    setViewAtual('app-detail');
  } else {
    setViewAtual(limpo || 'home');
  }
  // Formato canônico: #/view (ex.: #/home, #/tasks, #/app/meu-app)
  window.location.hash = '/' + limpo;
  renderView();
}

/** Fecha o drawer de task se estiver aberto (evita overlay órfão ao trocar de view). */
function fecharDrawerSeAberto(): void {
  const drawer = document.getElementById('drawer');
  if (drawer?.classList.contains('open')) fecharDrawer();
}

/**
 * Parseia o hash atual e retorna a view correspondente.
 */
export function parseHash(): string {
  const h = window.location.hash.replace(/^#\/?/, '');
  if (!h) return 'home';
  if (h.startsWith('app/')) return 'app-detail';
  return h;
}

/** Inicializa listener de hashchange */
export function initRouter(): void {
  window.addEventListener('hashchange', () => {
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