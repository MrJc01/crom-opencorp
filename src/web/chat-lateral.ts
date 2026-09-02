/**
 * Chat lateral global (PLANO-PAINEL-V2 — Etapa 1.2/1.4).
 *
 * Drawer direito disponível em TODAS as páginas, com a MESMA conversa do
 * Secretário (estado compartilhado em views/secretario.ts). Sobrevive à
 * navegação (DOM estático no index.html) e abre em tela cheia no mobile.
 *
 * FIX "chat lateral bugado":
 * 1. renderStandbyLateral() (views/secretario.ts) substitui o innerHTML de
 *    #lat-mensagens e DESTRÓI o contêiner estático #lat-feed. Depois disso o
 *    drawer nunca mais renderiza mensagens — nem ao concluir "Iniciar
 *    secretário" (renderMensagens('lateral') não encontra #lat-feed e pula),
 *    nem ao enviar: o drawer fica eternamente no texto de standby. Aqui o
 *    contêiner é recriado antes de cada render e vigiado durante o início.
 * 2. No caminho de standby o ícone do botão Enviar (#lat-enviar) nunca é
 *    pintado (renderChatLateral retorna antes de setá-lo) — botão vazio.
 * 3. Foco preso em elemento invisível ao fechar + aria-hidden inconsistente.
 */

import { headers } from './api.js';
import { icone } from './icons.js';

const ABERTO = 'chat-lateral-aberto';

/** Markup estático do contêiner do feed (igual ao index.html). */
const FEED_LATERAL_HTML = '<div class="oc-feed" id="lat-feed"></div>';

/** Garante que o contêiner estático do feed existe (renderStandbyLateral o destrói). */
function garantirFeedLateral(): void {
  const mensagens = document.getElementById('lat-mensagens');
  if (!mensagens || document.getElementById('lat-feed')) return;
  mensagens.innerHTML = FEED_LATERAL_HTML;
}

/**
 * Vigia o clique em "Iniciar secretário" DENTRO do drawer: o handler de
 * views/secretario.ts conclui o start e chama renderChatLateral(), mas o feed
 * destruído pelo standby faz o render pular o drawer. Quando o status passar
 * a "rodando", recria o feed e pede um novo render.
 */
function vigiarInicioNoDrawer(): void {
  const mensagens = document.getElementById('lat-mensagens');
  if (!mensagens || mensagens.dataset.vigiaIniciar) return;
  mensagens.dataset.vigiaIniciar = '1';
  mensagens.addEventListener('click', (ev) => {
    if (!(ev.target as HTMLElement | null)?.closest?.('#lat-iniciar')) return;
    const inicio = Date.now();
    const relogio = setInterval(() => {
      const painel = document.getElementById('chat-drawer');
      if (!painel?.classList.contains('open') || document.getElementById('lat-feed')) {
        clearInterval(relogio);
        return;
      }
      void (async () => {
        try {
          const res = await fetch('/secretario/status', { headers: headers() });
          if (!res.ok) return;
          const st = (await res.json()) as { rodando?: boolean };
          if (st.rodando) {
            clearInterval(relogio);
            garantirFeedLateral();
            void import('./views/secretario.js').then((m) => m.renderChatLateral());
          }
        } catch { /* rede/fora do ar: tenta de novo até esgotar */ }
      })();
      if (Date.now() - inicio > 30_000) clearInterval(relogio);
    }, 800);
  });
}

/** Pinta o ícone do botão Enviar se algum caminho o deixou vazio (standby). */
function garantirIconeEnviar(): void {
  const btn = document.getElementById('lat-enviar');
  if (btn && !btn.innerHTML.trim()) btn.innerHTML = icone('run');
}

/** Abre o chat lateral (fecha o drawer de task se estiver aberto). */
export function abrirChatLateral(): void {
  const painel = document.getElementById('chat-drawer');
  if (!painel) return;
  if (document.getElementById('drawer')?.classList.contains('open')) {
    void import('./router.js').then((r) => r.fecharDrawer());
  }
  garantirFeedLateral();
  garantirIconeEnviar();
  painel.classList.add('open');
  painel.removeAttribute('aria-hidden');
  document.getElementById('chat-drawer-overlay')?.classList.add('open');
  document.body.classList.add(ABERTO);
  vigiarInicioNoDrawer();
  void import('./views/secretario.js').then((m) => m.renderChatLateral());
}

/** Fecha o chat lateral. */
export function fecharChatLateral(): void {
  const painel = document.getElementById('chat-drawer');
  // devolve o foco antes de esconder (visibility:hidden não tira o foco sozinho)
  if (painel?.contains(document.activeElement)) (document.activeElement as HTMLElement | null)?.blur?.();
  painel?.classList.remove('open');
  painel?.setAttribute('aria-hidden', 'true');
  document.getElementById('chat-drawer-overlay')?.classList.remove('open');
  document.body.classList.remove(ABERTO);
}

/** Alterna o chat lateral (usado pelo botão floating). */
export function alternarChatLateral(): void {
  if (document.getElementById('chat-drawer')?.classList.contains('open')) fecharChatLateral();
  else abrirChatLateral();
}
