/**
 * Reuniões — painel hospedado DENTRO da página do Secretário (aba "Reuniões")
 * (PLANO-WEB-CRUD D: proposta do dono). `#/reunioes` renderiza o Secretário com
 * esta aba ativa. Form de convocação com check-list de agentes (seletor-agentes).
 */

import { api, toast, icone, escapeHtml } from "../api.js";
import { estadoVazio, estadoErro, estadoCarregando } from "../estado.js";
import { ajuda } from "../help.js";
import { htmlSeletorAgentes, agentesMarcados } from "../seletor-agentes.js";

/** Renderiza o painel de reuniões dentro do contêiner da aba do Secretário */
export async function renderReunioes(): Promise<void> {
  const viewEl = document.getElementById('sec-tab-reunioes');
  if (!viewEl) return;

  viewEl.innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold flex items-center gap-2">${icone('reunioes')} Reuniões ${ajuda('reunioes')}</h1>
    </div>
    <div class="card p-4 mb-6" id="reunioes-form">${estadoCarregando()}</div>
    <div id="reunioes-lista" class="space-y-4">${estadoCarregando()}</div>
  `;

  await renderReunioesForm();
  await carregarReunioesLista();
}

async function renderReunioesForm(): Promise<void> {
  const el = document.getElementById('reunioes-form');
  if (!el) return;

  const seletor = await htmlSeletorAgentes('reuniao-seletor-agentes', ['ceo-documentos', 'secretario']);

  el.innerHTML = `
    <h3 class="font-semibold mb-3 flex items-center gap-2">${icone('plus')} Convocar reunião</h3>
    <form id="form-nova-reuniao" class="space-y-4" onsubmit="event.preventDefault(); criarReuniao()">
      <div>
        <label class="block text-xs text-zinc-500 mb-1">Pauta</label>
        <textarea id="reuniao-pauta" rows="3" placeholder="Descreva a pauta da reunião…" required></textarea>
      </div>
      <div>
        <label class="block text-xs text-zinc-500 mb-1">Participantes (marque quem chama — vazio usa o padrão)</label>
        ${seletor}
      </div>
      <div class="flex gap-2">
        <button type="submit" class="btn">${icone('plus')} Convocar</button>
      </div>
    </form>
  `;
}

export async function criarReuniao(): Promise<void> {
  const pauta = (document.getElementById('reuniao-pauta') as HTMLTextAreaElement)?.value.trim();
  if (!pauta) return;
  const participantes = agentesMarcados('reuniao-seletor-agentes');

  try {
    const res = await api<{ status?: string }>('/meetings', {
      method: 'POST',
      body: JSON.stringify({ pauta, agentes: participantes.length ? participantes.join(',') : undefined }),
    });

    if (res.status === 'iniciado') {
      toast('Reunião iniciada em background — a ata aparece no registro quando terminar', 'ok');
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
  ata?: string | null;
}

async function carregarReunioesLista(): Promise<void> {
  let reunioes: MeetingInfo[] | null;
  try {
    reunioes = await api<MeetingInfo[]>('/meetings');
  } catch {
    reunioes = null;
  }
  const el = document.getElementById('reunioes-lista');
  if (!el) return;

  if (!reunioes) {
    el.innerHTML = estadoErro('Não foi possível carregar as reuniões.', () => { void carregarReunioesLista(); });
    return;
  }

  if (!reunioes.length) {
    el.innerHTML = estadoVazio('reunioes', 'Nenhuma reunião', 'Convoque acima ou use: <code>opencorp meeting start --pauta "..."</code>');
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
          ${r.ata ? `<a class="text-xs inline-flex items-center gap-1 mt-1" href="/files?path=${encodeURIComponent(String(r.ata))}" target="_blank" rel="noopener">${icone('reunioes')} ver ata</a>` : ''}
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
