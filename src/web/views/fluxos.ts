/**
 * View Fluxos — Flows listagem e execução.
 */

import { api, toast, icone, escapeHtml } from "../api.js";

/** Renderiza a view Fluxos */
export async function renderFluxos(): Promise<void> {
  const viewEl = document.getElementById('view-fluxos');
  if (!viewEl) return;

  viewEl.innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold flex items-center gap-2">${icone('fluxos')} Fluxos</h1>
    </div>
    <div id="fluxos-lista" class="space-y-4"></div>
  `;

  await carregarFluxosLista();
}

interface FlowInfo {
  id: string;
  nome?: string;
}

async function carregarFluxosLista(): Promise<void> {
  const flows = await api<FlowInfo[]>('/flows').catch(() => []);
  const el = document.getElementById('fluxos-lista');
  if (!el) return;

  if (!flows.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">' + icone('fluxos') + '</div><div class="empty-title">Nenhum fluxo</div><div class="empty-desc">Crie com: <code>opencorp flow create <id> --nome "..."</code></div></div>';
    return;
  }

  el.innerHTML = flows.map(f => `
    <div class="card p-4">
      <div class="flex items-center justify-between gap-4">
        <div class="flex-1 min-w-0">
          <div class="font-mono text-sm">${escapeHtml(String(f.id))}</div>
          ${f.nome ? '<div class="text-xs text-zinc-400 mt-1">' + escapeHtml(String(f.nome)) + '</div>' : ''}
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <button class="btn btn-ghost text-sm" onclick="executarFlow('${escapeHtml(String(f.id))}')" aria-label="Executar">${icone('run')} Executar</button>
          <button class="btn btn-ghost text-sm" onclick="detalhesFlow('${escapeHtml(String(f.id))}')" aria-label="Detalhes">${icone('chat')} Detalhes</button>
        </div>
      </div>
    </div>
  `).join('');
}

export async function executarFlow(id: string): Promise<void> {
  const entrada = prompt('Entrada para o flow (JSON ou texto):');
  if (entrada === null) return;

  try {
    await api('/flows/' + id + '/run', { method: 'POST', body: JSON.stringify({ entrada }) });
    toast('Flow executando — veja Início → Execuções', 'ok');
  } catch (e) {
    toast('Erro: ' + (e as Error).message, 'erro');
  }
}

export async function detalhesFlow(id: string): Promise<void> {
  try {
    const flow = await api<Record<string, unknown>>('/flows/' + id);
    const el = document.getElementById('drawer-content');
    if (!el) return;

    document.getElementById('drawer-title')!.textContent = 'Flow: ' + id;
    document.getElementById('drawer')!.classList.add('open');
    document.getElementById('drawer-overlay')!.classList.add('open');
    el.innerHTML = '<pre class="text-xs whitespace-pre-wrap max-h-[70vh] overflow-auto">' + escapeHtml(JSON.stringify(flow, null, 2)) + '</pre>';
  } catch (e) {
    toast('Erro: ' + (e as Error).message, 'erro');
  }
}