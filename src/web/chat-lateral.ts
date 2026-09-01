/**
 * Chat lateral global (PLANO-PAINEL-V2 — Etapa 1.2/1.4).
 *
 * Drawer direito disponível em TODAS as páginas, com a MESMA conversa do
 * Secretário (estado compartilhado em views/secretario.ts). Sobrevive à
 * navegação (DOM estático no index.html) e abre em tela cheia no mobile.
 */

const ABERTO = 'chat-lateral-aberto';

/** Abre o chat lateral (fecha o drawer de task se estiver aberto). */
export function abrirChatLateral(): void {
  const painel = document.getElementById('chat-drawer');
  if (!painel) return;
  if (document.getElementById('drawer')?.classList.contains('open')) {
    void import('./router.js').then((r) => r.fecharDrawer());
  }
  painel.classList.add('open');
  document.getElementById('chat-drawer-overlay')?.classList.add('open');
  document.body.classList.add(ABERTO);
  void import('./views/secretario.js').then((m) => m.renderChatLateral());
}

/** Fecha o chat lateral. */
export function fecharChatLateral(): void {
  document.getElementById('chat-drawer')?.classList.remove('open');
  document.getElementById('chat-drawer-overlay')?.classList.remove('open');
  document.body.classList.remove(ABERTO);
}

/** Alterna o chat lateral (usado pelo botão floating). */
export function alternarChatLateral(): void {
  if (document.getElementById('chat-drawer')?.classList.contains('open')) fecharChatLateral();
  else abrirChatLateral();
}
