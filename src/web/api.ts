/**
 * Camada de API — headers, fetch wrapper, helpers de workspace.
 *
 * Importante: api() nunca faz location.reload() — em 401 ela chama
 * sairParaLogin() que limpa token+ws, fecha SSE e mostra a tela de login
 * de forma idempotente. O reload era fonte de loop em cenários onde o
 * token persistido não bate com o do servidor.
 */

import { getToken, getWsAtivo, setWorkspaces, getWorkspaces, type WorkspaceInfo } from "./state.js";
import { icone } from "./icons.js";
import { escapeHtml } from "./format.js";
import { sairParaLogin } from "./main.js";

const TOKEN_KEY = 'oc-token';
const WS_KEY = 'oc-ws';

/** Headers padrão com Authorization */
export function headers(): Record<string, string> {
  const token = getToken();
  return {
    'Authorization': `Bearer ${token}`,
    'content-type': 'application/json',
  };
}

/**
 * Fetch wrapper que injeta workspace ativo e trata 401/500.
 * Em 401: limpa credenciais, fecha SSE e mostra login (idempotente).
 * @param path Rota (ex: '/tasks', '/agents/executor-padrao/run')
 * @param opts Opções do fetch
 */
export async function api<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const ws = getWsAtivo();
  const url = path + (ws && !path.includes('workspace=')
    ? (path.includes('?') ? '&' : '?') + 'workspace=' + encodeURIComponent(ws)
    : '');

  const res = await fetch(url, { ...opts, headers: headers() });

  if (res.status === 401) {
    sairParaLogin('Sessão inválida — faça login novamente');
    throw new Error('401');
  }
  if (res.status >= 500) {
    toast(`Erro do servidor (HTTP ${res.status}) em ${path.split('?')[0]}`, 'erro');
  }
  return res.json() as Promise<T>;
}

/**
 * Query helper — alias para api() para compatibilidade com código existente.
 */
export const q = api;

/**
 * Carrega lista de workspaces e valida wsAtivo.
 * Atualiza o select no DOM.
 */
export async function carregarWorkspaces(): Promise<void> {
  try {
    const lista = await api<WorkspaceInfo[]>('/workspaces');
    const wsArray = Array.isArray(lista) ? lista : [];
    setWorkspaces(wsArray);

    const ids = wsArray.map(w => w.id);
    const wsAtivo = getWsAtivo();

    if (!ids.includes(wsAtivo)) {
      const novoWs = ids[0] || '';
      if (novoWs) localStorage.setItem(WS_KEY, novoWs);
      else localStorage.removeItem(WS_KEY);
    }

    atualizarSelectWorkspaces(wsArray);
    atualizarContexto();
  } catch {
    setWorkspaces([]);
    atualizarSelectWorkspaces([]);
    atualizarContexto();
  }
}

/** Atualiza o <select> de workspaces na sidebar */
function atualizarSelectWorkspaces(wsArray: WorkspaceInfo[]): void {
  const sel = document.getElementById('ws-select') as HTMLSelectElement | null;
  if (!sel) return;

  const wsAtivo = getWsAtivo();
  sel.innerHTML = '<option value="">— selecione —</option>' +
    wsArray.map(w => `<option value="${w.id}" ${w.id === wsAtivo ? 'selected' : ''}>${w.id}</option>`).join('');

  sel.onchange = (e: Event) => {
    const target = e.target as HTMLSelectElement;
    const novoWs = target.value;
    if (novoWs) localStorage.setItem(WS_KEY, novoWs);
    else localStorage.removeItem(WS_KEY);
    location.hash = '#/home';
  };
}

/** Atualiza o banner de contexto do workspace */
function atualizarContexto(): void {
  const banner = document.getElementById('ws-banner');
  if (!banner) return;

  const wsArray = getWorkspaces();
  const wsAtivo = getWsAtivo();

  if (!wsArray.length) {
    banner.innerHTML = `<div class="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">Nenhuma empresa (workspace) encontrada. Crie a primeira no terminal: <code class="font-mono">opencorp workspace create minha-empresa</code></div>`;
  } else if (!wsAtivo) {
    banner.innerHTML = `<div class="rounded-lg border border-blue-500/40 bg-blue-500/10 px-4 py-3 text-sm text-blue-300">Selecione uma empresa na barra lateral para carregar os dados.</div>`;
  } else {
    banner.innerHTML = '';
  }
}

/** Toast system */
let toastContainer: HTMLElement | null = null;
function getToastContainer(): HTMLElement {
  if (!toastContainer) {
    toastContainer = document.getElementById('toast-container');
  }
  return toastContainer!;
}

export function toast(mensagem: string, tipo: 'ok' | 'erro' | 'aviso' = 'ok'): void {
  const container = getToastContainer();
  if (!container) return;

  const el = document.createElement('div');
  const bg = tipo === 'ok' ? 'rgba(74,222,128,.15)' : tipo === 'erro' ? 'rgba(248,113,113,.15)' : 'rgba(251,191,36,.15)';
  const border = tipo === 'ok' ? 'var(--ok)' : tipo === 'erro' ? 'var(--err)' : 'var(--warn)';
  const iconeToast = tipo === 'ok' ? 'spark' : tipo === 'erro' ? 'close' : 'spark';

  el.style.cssText = `background:${bg};border:1px solid ${border};color:var(--text);padding:.75rem 1rem;border-radius:.5rem;box-shadow:0 10px 30px rgba(0,0,0,.4);min-width:240px;max-width:360px;display:flex;align-items:center;gap:.5rem;font-size:.8125rem;animation:slideIn .2s ease`;
  el.innerHTML = icone(iconeToast) + '<span>' + escapeHtml(mensagem) + '</span>';
  container.appendChild(el);

  setTimeout(() => {
    el.style.animation = 'slideOut .2s ease forwards';
    setTimeout(() => el.remove(), 200);
  }, 6000);
}

/** Garante keyframes do toast no head */
function ensureToastStyles(): void {
  if (document.getElementById('toast-keyframes')) return;
  const style = document.createElement('style');
  style.id = 'toast-keyframes';
  style.textContent = `
@keyframes slideIn { from { opacity: 0; transform: translateX(100%); } to { opacity: 1; transform: translateX(0); } }
@keyframes slideOut { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(100%); } }
`;
  document.head.appendChild(style);
}

ensureToastStyles();

/** Re-exporta escapeHtml e icone para compatibilidade */
export { escapeHtml } from "./format.js";
export { icone } from "./icons.js";