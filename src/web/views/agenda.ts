/**
 * View Agenda — Scheduler / rotinas agendadas.
 */

import { api, q, toast, icone, escapeHtml } from "../api.js";
import { getWsAtivo, getAgendaEscopoAtual, setAgendaEscopoAtual } from "../state.js";
import type { AgendaJob as ScheduleJob } from "../state.js";
import { formatarAgenda, badgeTipo, formatarDataLocal } from "../format.js";
import { estadoVazio, estadoErro, estadoCarregando } from "../estado.js";
import { ajuda } from "../help.js";

/** Renderiza a view Agenda */
export async function renderAgenda(): Promise<void> {
  const wsAtivo = getWsAtivo();

  const viewEl = document.getElementById('view-agenda');
  if (!viewEl) return;

  if (!viewEl.innerHTML.trim()) {
    viewEl.innerHTML = `<h1 class="text-2xl font-bold flex items-center gap-2 mb-6">${icone('agenda')} Agenda</h1>` + estadoCarregando();
  }

  viewEl.innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold flex items-center gap-2">${icone('agenda')} Agenda ${ajuda('agenda')}</h1>
      <div class="flex items-center gap-1 rounded-lg border border-zinc-700 p-1" role="group" aria-label="Escopo da agenda">
        <button id="agenda-escopo-ws" class="btn text-xs" onclick="agendaEscopo('ws')">só ${escapeHtml(wsAtivo || 'esta empresa')}</button>
        <button id="agenda-escopo-todas" class="btn text-xs" onclick="agendaEscopo('todas')">todas as empresas</button>
      </div>
    </div>
    <div id="agenda-status" class="card p-4 mb-6"></div>
    <div id="agenda-lista" class="space-y-4">${estadoCarregando()}</div>
    <div class="card p-4 mt-6" id="agenda-form"></div>
  `;

  const escopo = getAgendaEscopoAtual();
  await carregarAgendaStatus();
  marcarEscopoAtivo(escopo);
  await carregarAgendaLista();
  renderAgendaForm();
}

/** Alterna escopo da agenda (ws | todas) */
export function agendaEscopo(escopo: 'ws' | 'todas'): void {
  setAgendaEscopoAtual(escopo);
  marcarEscopoAtivo(escopo);
  carregarAgendaLista();
}

/** Marca visualmente o escopo ativo */
function marcarEscopoAtivo(escopo: 'ws' | 'todas'): void {
  const ws = document.getElementById('agenda-escopo-ws') as HTMLButtonElement | null;
  const todas = document.getElementById('agenda-escopo-todas') as HTMLButtonElement | null;
  if (!ws || !todas) return;

  ws.style.background = escopo === 'ws' ? '#3b82f6' : 'transparent';
  todas.style.background = escopo === 'todas' ? '#3b82f6' : 'transparent';
}

async function carregarAgendaStatus(): Promise<void> {
  const el = document.getElementById('agenda-status');
  if (!el) return;

  el.innerHTML = `
    <div class="flex items-start gap-3">
      <div class="flex-1">
        <p class="text-sm text-zinc-400">O daemon do scheduler executa os jobs a cada 30s. ${ajuda('scheduler')}</p>
        <p class="text-sm text-zinc-400 mt-1">Inicie com: <code class="font-mono bg-zinc-800 px-1.5 py-0.5 rounded">opencorp scheduler start</code></p>
      </div>
    </div>
  `;
}


async function carregarAgendaLista(): Promise<void> {
  const escopo = getAgendaEscopoAtual();
  let jobs: ScheduleJob[] | null;
  try {
    jobs = escopo === 'todas'
      ? await api<ScheduleJob[]>('/schedules?all=1')
      : await q<ScheduleJob[]>('/schedules');
  } catch {
    jobs = null;
  }

  const el = document.getElementById('agenda-lista');
  if (!el) return;

  if (!jobs) {
    el.innerHTML = estadoErro('Não foi possível carregar as rotinas.', () => { void carregarAgendaLista(); });
    return;
  }

  if (!jobs.length) {
    el.innerHTML = estadoVazio('agenda', escopo === 'todas' ? 'Nenhuma rotina agendada em nenhuma empresa' : 'Nenhuma rotina nesta empresa', 'A empresa opera sozinha quando você agenda a primeira rotina.');
    return;
  }

  el.innerHTML = jobs.map(j => `
    <div class="card p-4">
      <div class="flex items-start justify-between gap-4">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="font-medium truncate">${escapeHtml(String(j.nome))}</span>
            <span class="badge ${badgeTipo(String(j.agenda?.tipo))}">${escapeHtml(String(j.agenda?.tipo))}</span>
            <span class="badge ${j.ativo ? 'badge-ok' : 'badge-neutral'}">${j.ativo ? 'ativo' : 'pausado'}</span>
          </div>
          <div class="text-sm text-zinc-400 mb-1">${formatarAgenda(j)}</div>
          <div class="text-xs text-zinc-500 font-mono truncate">${escapeHtml((j.args as string[] || []).join(' '))}</div>
          <div class="text-xs text-zinc-500 font-mono mt-1">workspace: ${escapeHtml(String(j.workspace))}</div>
          ${j.proxima_exec ? '<div class="text-xs text-zinc-500 font-mono mt-1">próxima: ' + formatarDataLocal(String(j.proxima_exec)) + '</div>' : ''}
          ${j.ultima_exec
            ? '<div class="text-xs text-zinc-500 font-mono">última: ' + formatarDataLocal(String(j.ultima_exec)) + '</div>'
            : '<div class="text-xs mt-1" style="color:var(--warn)">⚠ nunca rodou</div>'}
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <button class="btn btn-ghost text-sm" onclick="executarAgendaAgora('${escapeHtml(String(j.id))}')" aria-label="Executar agora">${icone('run')} Agora</button>
          <button class="btn btn-ghost text-sm" onclick="editarAgenda('${escapeHtml(String(j.id))}')" aria-label="Editar">${icone('gear')} Editar</button>
          <button class="btn btn-ghost text-sm" onclick="toggleAgendaAtivo('${escapeHtml(String(j.id))}', ${j.ativo})" aria-label="${j.ativo ? 'Pausar' : 'Retomar'}">${j.ativo ? icone('pause') : icone('run')} ${j.ativo ? 'Pausar' : 'Retomar'}</button>
          <button class="btn btn-ghost text-sm" style="color:var(--err)" onclick="excluirAgenda('${escapeHtml(String(j.id))}')" aria-label="Excluir">${icone('trash')}</button>
        </div>
      </div>
    </div>
  `).join('');
}

/** Renderiza (ou reseta) o form de nova rotina — "Cancelar" chama esta função */
export function renderAgendaForm(): void {
  const el = document.getElementById('agenda-form');
  if (!el) return;

  el.innerHTML = `
    <h3 class="font-semibold mb-3 flex items-center gap-2">${icone('plus')} Nova rotina ${ajuda('agenda')}</h3>
    <form id="form-nova-agenda" class="space-y-4" onsubmit="event.preventDefault(); criarAgenda()">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-xs text-zinc-500 mb-1">Nome</label>
          <input id="agenda-nome" required placeholder="Ex: checar-fila" />
        </div>
        <div>
          <label class="block text-xs text-zinc-500 mb-1">Tipo</label>
          <select id="agenda-tipo" onchange="atualizarCampoAgenda()">
            <option value="intervalo_min">Intervalo (minutos)</option>
            <option value="cron">Cron (5 campos)</option>
            <option value="data_unica">Data única</option>
          </select>
        </div>
      </div>
      <div id="agenda-valor-container">
        <label class="block text-xs text-zinc-500 mb-1">Valor</label>
        <input id="agenda-valor" type="number" min="1" placeholder="Ex: 30" required />
      </div>
      <div>
        <label class="block text-xs text-zinc-500 mb-1">Comando (args)</label>
        <input id="agenda-args" placeholder='task create --titulo "Checar fila"' required />
      </div>
      <div class="flex gap-2">
        <button type="submit" class="btn">${icone('plus')} Criar</button>
        <button type="button" class="btn btn-ghost" onclick="renderAgendaForm()">Cancelar</button>
      </div>
    </form>
  `;
}

/** Atualiza campo de valor conforme tipo selecionado (reusável no form de edição) */
export function atualizarCampoAgenda(containerId = 'agenda-valor-container', valorInicial = ''): void {
  const tipo = (document.getElementById(containerId === 'agenda-valor-container' ? 'agenda-tipo' : 'agenda-edit-tipo') as HTMLSelectElement)?.value;
  const container = document.getElementById(containerId);
  if (!container) return;

  const idCampo = containerId === 'agenda-valor-container' ? 'agenda-valor' : 'agenda-edit-valor';
  if (tipo === 'intervalo_min') {
    container.innerHTML = `<label class="block text-xs text-zinc-500 mb-1">Valor (minutos)</label><input id="${idCampo}" type="number" min="1" placeholder="Ex: 30" required value="${escapeHtml(valorInicial)}" />`;
  } else if (tipo === 'cron') {
    container.innerHTML = `<label class="block text-xs text-zinc-500 mb-1">Expressão cron</label><input id="${idCampo}" type="text" placeholder="*/5 * * * *" required value="${escapeHtml(valorInicial)}" />`;
  } else if (tipo === 'data_unica') {
    container.innerHTML = `<label class="block text-xs text-zinc-500 mb-1">Data/hora (ISO)</label><input id="${idCampo}" type="datetime-local" required value="${escapeHtml(valorInicial)}" />`;
  }
}

export async function criarAgenda(): Promise<void> {
  const nome = (document.getElementById('agenda-nome') as HTMLInputElement)?.value.trim();
  const tipo = (document.getElementById('agenda-tipo') as HTMLSelectElement)?.value;
  let valor = (document.getElementById('agenda-valor') as HTMLInputElement)?.value;
  const args = (document.getElementById('agenda-args') as HTMLInputElement)?.value.trim().split(/\s+/).filter(Boolean) || [];

  if (!nome || !valor || !args.length) return;

  if (tipo === 'data_unica') {
    valor = new Date(valor).toISOString();
  } else if (tipo === 'intervalo_min') {
    valor = String(Number(valor));
  }

  try {
    await api('/schedules', {
      method: 'POST',
      body: JSON.stringify({
        nome,
        agenda_tipo: tipo,
        agenda_valor: String(valor),
        args,
        workspace: getWsAtivo() || undefined,
      }),
    });
    toast('Rotina criada', 'ok');
    await carregarAgendaLista();
    renderAgendaForm();
  } catch (e) {
    toast('Erro: ' + (e as Error).message, 'erro');
  }
}

export async function executarAgendaAgora(id: string): Promise<void> {
  try {
    const res = await api<{ resultado?: string }>('/schedules/' + id + '/run', { method: 'POST' });
    toast('Executado: ' + (res.resultado || 'ok'), 'ok');
    await carregarAgendaLista();
  } catch (e) {
    toast('Erro: ' + (e as Error).message, 'erro');
  }
}

export async function toggleAgendaAtivo(id: string, ativo: boolean): Promise<void> {
  try {
    await api('/schedules/' + id, { method: 'PATCH', body: JSON.stringify({ ativo: !ativo }) });
    toast(ativo ? 'Pausado' : 'Retomado', 'ok');
    await carregarAgendaLista();
  } catch (e) {
    toast('Erro: ' + (e as Error).message, 'erro');
  }
}

export async function excluirAgenda(id: string): Promise<void> {
  const { modalConfirm } = await import("../modal.js");
  if (!(await modalConfirm('Excluir esta rotina?', { confirmar: 'Excluir' }))) return;
  try {
    await api('/schedules/' + id, { method: 'DELETE' });
    toast('Excluído', 'ok');
    await carregarAgendaLista();
  } catch (e) {
    toast('Erro: ' + (e as Error).message, 'erro');
  }
}

/** Abre o form de edição pré-preenchido com o job atual (PLANO-WEB-CRUD B1) */
export async function editarAgenda(id: string): Promise<void> {
  let j: ScheduleJob | null = null;
  try {
    j = await api<ScheduleJob>('/schedules/' + encodeURIComponent(id));
  } catch {
    j = null;
  }
  if (!j) { toast('Não foi possível carregar a rotina ' + id, 'erro'); return; }

  const el = document.getElementById('agenda-form');
  if (!el) return;

  const tipo = String(j.agenda?.tipo ?? 'intervalo_min');
  let valor = String(j.agenda?.valor ?? '');
  if (tipo === 'data_unica' && valor) {
    const d = new Date(valor);
    if (!Number.isNaN(d.getTime())) {
      // datetime-local interpreta hora LOCAL — formatar no fuso (evita drift cumulativo, auditoria #3)
      const p2 = (n: number): string => String(n).padStart(2, '0');
      valor = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
    }
  }

  el.innerHTML = `
    <h3 class="font-semibold mb-3 flex items-center gap-2">${icone('gear')} Editar rotina <span class="font-mono text-xs text-zinc-500">${escapeHtml(id)}</span></h3>
    <form id="form-editar-agenda" class="space-y-4" onsubmit="event.preventDefault(); salvarEdicaoAgenda('${escapeHtml(id)}')">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-xs text-zinc-500 mb-1">Nome</label>
          <input id="agenda-edit-nome" required value="${escapeHtml(String(j.nome))}" />
        </div>
        <div>
          <label class="block text-xs text-zinc-500 mb-1">Tipo</label>
          <select id="agenda-edit-tipo" onchange="atualizarCampoAgenda('agenda-edit-valor-container')">
            <option value="intervalo_min" ${tipo === 'intervalo_min' ? 'selected' : ''}>Intervalo (minutos)</option>
            <option value="cron" ${tipo === 'cron' ? 'selected' : ''}>Cron (5 campos)</option>
            <option value="data_unica" ${tipo === 'data_unica' ? 'selected' : ''}>Data única</option>
          </select>
        </div>
      </div>
      <div id="agenda-edit-valor-container"></div>
      <div>
        <label class="block text-xs text-zinc-500 mb-1">Comando (args)</label>
        <input id="agenda-edit-args" value="${escapeHtml((j.args as string[] || []).join(' '))}" required />
      </div>
      <div class="flex gap-2">
        <button type="submit" class="btn">${icone('check')} Salvar</button>
        <button type="button" class="btn btn-ghost" onclick="renderAgendaForm()">Cancelar</button>
      </div>
    </form>
  `;
  atualizarCampoAgenda('agenda-edit-valor-container', valor);
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/** Salva a edição da rotina (PATCH pleno) */
export async function salvarEdicaoAgenda(id: string): Promise<void> {
  const nome = (document.getElementById('agenda-edit-nome') as HTMLInputElement)?.value.trim();
  const tipo = (document.getElementById('agenda-edit-tipo') as HTMLSelectElement)?.value;
  let valor = (document.getElementById('agenda-edit-valor') as HTMLInputElement)?.value ?? '';
  const argsStr = (document.getElementById('agenda-edit-args') as HTMLInputElement)?.value.trim() ?? '';

  if (!nome || !valor || !argsStr) return;
  if (tipo === 'data_unica') {
    valor = new Date(valor).toISOString();
  } else if (tipo === 'intervalo_min') {
    valor = String(Number(valor));
  }

  try {
    await api('/schedules/' + encodeURIComponent(id), {
      method: 'PATCH',
      body: JSON.stringify({ nome, agenda_tipo: tipo, agenda_valor: valor, args: argsStr.split(/\s+/).filter(Boolean) }),
    });
    toast('Rotina atualizada', 'ok');
    renderAgendaForm();
    await carregarAgendaLista();
  } catch (e) {
    toast('Erro: ' + (e as Error).message, 'erro');
  }
}