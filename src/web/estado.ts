/**
 * Helpers de estado padronizados para views — princípio 3 do design system:
 * toda view tem 3 estados (carregando / vazio / erro) com a MESMA cara.
 * Retornam HTML string para innerHTML; reusam as classes .empty-state do index.html.
 */

import { icone } from "./icons.js";

/** Instala (uma vez) o global de retry do estado de erro */
function garantirRetryGlobal(): void {
  const g = window as unknown as Record<string, unknown>;
  if (!g.__estadoRetry) g.__estadoRetry = () => undefined;
}

/**
 * Estado de carregamento — use antes do primeiro render da view
 * (se a view já tem conteúdo, evite trocar por loading para não piscar no refresh de 8s).
 */
export function estadoCarregando(msg = 'Carregando…'): string {
  return `
    <div class="empty-state estado-loading" role="status" aria-live="polite">
      <div class="empty-icon">${icone('history')}</div>
      <div class="empty-title">${escapeTexto(msg)}</div>
    </div>
  `;
}

/**
 * Estado vazio — ícone + título + texto explicativo + ação opcional (HTML cru, ex.: botão).
 */
export function estadoVazio(
  nomeIcone: string,
  titulo: string,
  texto = '',
  acaoHtml = '',
): string {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icone(nomeIcone)}</div>
      <div class="empty-title">${escapeTexto(titulo)}</div>
      ${texto ? `<div class="empty-desc">${texto}</div>` : ''}
      ${acaoHtml ? `<div class="empty-acao">${acaoHtml}</div>` : ''}
    </div>
  `;
}

/**
 * Estado de erro — mensagem humana + botão "Tentar novamente" que chama retryFn.
 * Só um estado de erro visível por vez (global único de retry).
 */
export function estadoErro(msg: string, retryFn?: () => void): string {
  garantirRetryGlobal();
  if (retryFn) {
    (window as unknown as Record<string, unknown>).__estadoRetry = retryFn;
  }
  const btn = retryFn
    ? `<div class="empty-acao"><button class="btn btn-ghost" onclick="window.__estadoRetry()">${icone('run')} Tentar novamente</button></div>`
    : '';
  return `
    <div class="empty-state estado-erro" role="alert">
      <div class="empty-icon">${icone('close')}</div>
      <div class="empty-title">Algo deu errado</div>
      <div class="empty-desc">${escapeTexto(msg)}</div>
      ${btn}
    </div>
  `;
}

/** Escapa texto simples (menos custoso que importar format em toda view já que helpers podem receber HTML no texto) */
function escapeTexto(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
