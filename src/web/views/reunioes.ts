/**
 * View Reuniões — Boardroom / meetings.
 */

import { api, toast, icone, escapeHtml } from "../api.js";

/** Renderiza a view Reuniões */
export async function renderReunioes(): Promise<void> {
  const viewEl = document.getElementById('view-reunioes');
  if (!viewEl) return;

  viewEl.innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold flex items-center gap-2">${icone('reunioes')} Reuniões</h1>
    </div>
    <div class="card p-4 mb-6" id="reunioes-form"></div>
    <div id="reunioes-lista" class="space-y-4"></div>
  `;

  renderReunioesForm();
  await carregarReunioesLista();
}

function renderReunioesForm(): void {
  const el = document.getElementById('reunioes-form');
  if (!el) return;

  el.innerHTML = `
    <h3 class="font-semibold mb-3 flex items-center gap-2">${icone('plus')} Convocar reunião</h3>
    <form id="form-nova-reuniao" class="space-y-4" onsubmit="event.preventDefault(); criarReuniao()">
      <div>
        <label class="block text-xs text-zinc-500 mb-1">Pauta</label>
        <textarea id="reuniao-pauta" rows="3" placeholder="Descreva a pauta da reunião…" required></textarea>
      </div>
      <div>
        <label class="block text-xs text-zinc-500 mb-1">Agentes (opcional, separados por vírgula)</label>
        <input id="reuniao-agentes" placeholder="ceo-documentos,ceo-estrategia,secretario" />
      </div>
      <div class="flex gap-2">
        <button type="submit" class="btn">${icone('plus')} Convocar</button>
      </div>
    </form>
  `;
}

export async function criarReuniao(): Promise<void> {
  const pauta = (document.getElementById('reuniao-pauta') as HTMLTextAreaElement)?.value.trim();
  const agentes = (document.getElementById('reuniao-agentes') as HTMLInputElement)?.value.trim();

  if (!pauta) return;

  try {
    const res = await api<{ status?: string }>('/meetings', {
      method: 'POST',
      body: JSON.stringify({ pauta, agentes: agentes || undefined }),
    });

    if (res.status === 'iniciado') {
      toast('Reunião iniciada em background — ata em registries/meetings/', 'ok');
    }

    (document.getElementById('reuniao-pauta') as HTMLTextAreaElement)!.value = '';
    await carregarReunioesLista();
  } catch (e) {
    toast('Erro: ' + (e as Error).message, 'erro');
  }
}

interface MeetingInfo {
  id: string;
  status?: string;
  pauta?: string;
  participantes?: string[];
  criado_em?: string;
  encerrada_em?: string;
}

async function carregarReunioesLista(): Promise<void> {
  const reunioes = await api<MeetingInfo[]>('/meetings').catch(() => []);
  const el = document.getElementById('reunioes-lista');
  if (!el) return;

  if (!reunioes.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">' + icone('reunioes') + '</div><div class="empty-title">Nenhuma reunião</div><div class="empty-desc">Convoque acima ou use: <code>opencorp meeting start --pauta "..."</code></div></div>';
    return;
  }

  el.innerHTML = reunioes.map(r => `
    <div class="card p-4">
      <div class="flex items-start justify-between gap-4">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="font-mono text-sm">${escapeHtml(String(r.id))}</span>
            <span class="badge ${r.status === 'em-andamento' ? 'badge-warn' : 'badge-neutral'}">${escapeHtml(String(r.status))}</span>
          </div>
          <div class="text-sm mb-1">${escapeHtml(String(r.pauta))}</div>
          <div class="text-xs text-zinc-500">Participantes: ${escapeHtml(((r.participantes as string[]) || []).join(', '))}</div>
          <div class="text-xs text-zinc-500 font-mono mt-1">início: ${escapeHtml(String(r.criado_em).slice(0, 19).replace('T', ' '))} ${r.encerrada_em ? '· fim: ' + escapeHtml(String(r.encerrada_em).slice(0, 19).replace('T', ' ')) : ''}</div>
        </div>
        ${r.status === 'em-andamento' ? '<button class="btn btn-ghost text-sm flex-shrink-0" onclick="encerrarReuniao(\'' + escapeHtml(String(r.id)) + '\')" aria-label="Encerrar reunião">' + icone('stop') + ' Encerrar</button>' : ''}
      </div>
    </div>
  `).join('');
}

export async function encerrarReuniao(id: string): Promise<void> {
  try {
    await api('/meetings/' + id + '/stop', { method: 'POST' });
    toast('Interrupção solicitada', 'ok');
    await carregarReunioesLista();
  } catch (e) {
    toast('Erro: ' + (e as Error).message, 'erro');
  }
}