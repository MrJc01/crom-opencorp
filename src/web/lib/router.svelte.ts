import { writable } from 'svelte/store';

function getInitialView(): string {
  const hash = window.location.hash;
  if (hash.startsWith('#/')) return hash.replace(/^#\/?/, '').split('?')[0] || 'home';
  const p = window.location.pathname.replace(/^\//, '').split('?')[0] || 'home';
  if (p.startsWith('app/')) return 'app-detail';
  return p || 'home';
}

export const currentView = writable<string>(getInitialView());

export function goto(view: string) {
  const clean = view.replace(/^#\/?/, '').replace(/^\//, '');
  history.pushState(null, '', '/' + clean);
  currentView.set(clean || 'home');
  // Also call vanilla renderView for incremental migration
  import('../main.js').then((m) => (m as unknown as { renderView?: () => void }).renderView?.());
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    const hash = window.location.hash;
    const view = hash.startsWith('#/') ? hash.replace(/^#\/?/, '').split('?')[0] : window.location.pathname.replace(/^\//, '').split('?')[0] || 'home';
    currentView.set(view || 'home');
  });
  window.addEventListener('hashchange', () => {
    if (window.location.hash.startsWith('#/')) {
      const novo = '/' + window.location.hash.replace(/^#\/?/, '');
      history.replaceState(null, '', novo);
      const view = novo.replace(/^\//, '').split('?')[0] || 'home';
      currentView.set(view);
    }
  });
}
