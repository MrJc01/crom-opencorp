/**
 * View Teams — Lista de teams com execução.
 */

import { api, toast, icone, escapeHtml } from "../api.js";
import { badgeTeamPadrao } from "../format.js";
import { estadoVazio, estadoErro, estadoCarregando } from "../estado.js";
import { ajuda } from "../help.js";

/** Renderiza a view Teams */
export async function renderTeams(): Promise<void> {
  const viewEl = document.getElementById('view-teams');
  if (!viewEl) return;

  if (!viewEl.innerHTML.trim()) {
    viewEl.innerHTML = `<h1 class="text-2xl font-bold flex items-center gap-2 mb-6">${icone('teams')} Teams</h1>` + estadoCarregando();
  }

  let teams: Record<string, unknown>[] | null;
  try {
    teams = await api<Record<string, unknown>[]>('/teams');
  } catch {
    teams = null;
  }

  if (!teams) {
    viewEl.innerHTML = `<h1 class="text-2xl font-bold flex items-center gap-2 mb-6">${icone('teams')} Teams</h1>` +
      estadoErro('Não foi possível carregar os teams.', () => { void renderTeams(); });
    return;
  }

  viewEl.innerHTML = `
    <div class="flex items-center justify-between mb-6 gap-2">
      <h1 class="text-2xl font-bold flex items-center gap-2">${icone('teams')} Teams ${ajuda('teams')}</h1>
      <div class="flex items-center gap-2">
        <button class="btn" onclick="abrirFormTeam()">${icone('plus')} Novo team</button>
        <a href="/doc" target="_blank" class="btn btn-ghost text-sm">Ver spec no /doc</a>
      </div>
    </div>
    <div id="team-form" class="mb-6"></div>
    <div id="teams-lista" class="space-y-4"></div>
  `;

  const el = document.getElementById('teams-lista');
  if (!el) return;

  if (!teams.length) {
    el.innerHTML = estadoVazio('teams', 'Nenhum team configurado', 'Clique em <strong>Novo team</strong> acima (pipeline, fanout, review ou debate).');
    return;
  }

  el.innerHTML = teams.map(t => `
    <div class="team-card">
      <div class="team-header">
        <div>
          <div class="team-title">${escapeHtml(String(t.titulo || t.id))}</div>
          <div class="team-meta">${escapeHtml(String(t.id))}</div>
        </div>
        <div class="flex items-center gap-2">
          <span class="badge ${badgeTeamPadrao(String(t.padrao || ''))}">${escapeHtml(String(t.padrao || '—'))}</span>
          <button class="btn" onclick="executarTeam('${escapeHtml(String(t.id))}')" id="btn-run-${escapeHtml(String(t.id))}">${icone('run')} Executar</button>
        </div>
      </div>
      <div class="team-steps">${typeof t.passos === "number" ? `${t.passos} passo(s)` : `${((t.passos as unknown[]) || []).length} passo(s)`}</div>
    </div>
  `).join('');
}

/** ── Criação de team (gera spec do teamSchema e faz POST /teams) ── */

interface PassoUi {
  agente: string;
  ordem: string;
}

export function abrirFormTeam(): void {
  const el = document.getElementById('team-form');
  if (!el) return;

  el.innerHTML = `
    <div class="card p-4">
      <h3 class="font-semibold mb-3 flex items-center gap-2">${icone('plus')} Novo team ${ajuda('teams')}</h3>
      <form id="form-novo-team" class="space-y-4" onsubmit="event.preventDefault(); criarTeam()">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label class="block text-xs text-zinc-500 mb-1">ID (kebab-case)</label>
            <input id="team-id" required placeholder="ex: publicacao-review" pattern="[a-z0-9]+(-[a-z0-9]+)*" />
          </div>
          <div>
            <label class="block text-xs text-zinc-500 mb-1">Título</label>
            <input id="team-titulo" required placeholder="ex: Publicação com revisão" />
          </div>
          <div>
            <label class="block text-xs text-zinc-500 mb-1">Padrão</label>
            <select id="team-padrao" onchange="teamCamposPadrao()">
              <option value="pipeline">pipeline (sequência)</option>
              <option value="fanout">fanout (paralelo + síntese)</option>
              <option value="review">review (executor + revisor)</option>
              <option value="debate">debate (proponentes + moderador)</option>
            </select>
          </div>
        </div>
        <div id="team-campos" class="space-y-3"></div>
        <div class="flex gap-2">
          <button type="submit" class="btn">${icone('plus')} Criar team</button>
          <button type="button" class="btn btn-ghost" onclick="fecharFormTeam()">Cancelar</button>
        </div>
      </form>
    </div>
  `;
  teamCamposPadrao();
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function fecharFormTeam(): void {
  const el = document.getElementById('team-form');
  if (el) el.innerHTML = '';
}

/** Renderiza os campos conforme o padrão escolhido */
export function teamCamposPadrao(): void {
  const padrao = (document.getElementById('team-padrao') as HTMLSelectElement)?.value ?? 'pipeline';
  const campos = document.getElementById('team-campos');
  if (!campos) return;

  const linhaPasso = (rotulo: string, extra = ''): string => `
    <div class="border border-zinc-800 rounded p-3 space-y-2 team-passo">
      <div class="flex items-center gap-2">
        <span class="text-xs text-zinc-500">${rotulo}</span>
        ${extra.includes('remover') ? '<button type="button" class="btn-ghost text-xs ml-auto" onclick="this.closest(\'.team-passo\').remove()" title="Remover">✕</button>' : ''}
      </div>
      <input class="team-agente" placeholder="id do agente (ex: editor)" />
      <input class="team-ordem" placeholder="ordem para o agente (aceita {{entrada}})" />
    </div>
  `;

  if (padrao === 'pipeline') {
    campos.innerHTML = `
      <div class="flex items-center justify-between mb-1">
        <label class="text-xs text-zinc-500">Passos (executam em sequência)</label>
        <button type="button" class="btn btn-ghost text-xs" onclick="addPassoTeam('passo')">${icone('plus')} passo</button>
      </div>
      <div id="team-passos" class="space-y-3">${linhaPasso('passo 1')}</div>`;
  } else if (padrao === 'fanout') {
    campos.innerHTML = `
      <div class="flex items-center justify-between mb-1">
        <label class="text-xs text-zinc-500">Agentes em paralelo</label>
        <button type="button" class="btn btn-ghost text-xs" onclick="addPassoTeam('paralelo')">${icone('plus')} agente</button>
      </div>
      <div id="team-paralelos" class="space-y-3">${linhaPasso('paralelo 1')}</div>
      <label class="text-xs text-zinc-500 block mt-3">Síntese final</label>
      ${linhaPasso('síntese')}`;
  } else if (padrao === 'review') {
    campos.innerHTML = `
      <label class="text-xs text-zinc-500 block mb-1">Executor</label>${linhaPasso('executor')}
      <label class="text-xs text-zinc-500 block mb-1 mt-3">Revisor</label>${linhaPasso('revisor')}`;
  } else {
    campos.innerHTML = `
      <div class="flex items-center justify-between mb-1">
        <label class="text-xs text-zinc-500">Proponentes</label>
        <button type="button" class="btn btn-ghost text-xs" onclick="addPassoTeam('proponente')">${icone('plus')} proponente</button>
      </div>
      <div id="team-proponentes" class="space-y-3">${linhaPasso('proponente 1')}</div>
      <label class="text-xs text-zinc-500 block mb-1 mt-3">Moderador</label>
      <input class="team-moderador" placeholder="id do agente moderador (ex: secretario)" />
      <label class="text-xs text-zinc-500 block mb-1 mt-3">Turnos (1-5)</label>
      <input id="team-turnos" type="number" min="1" max="5" value="2" />`;
  }
}

/** Adiciona um passo à lista do padrão atual */
export function addPassoTeam(lista: 'passo' | 'paralelo' | 'proponente'): void {
  const container = document.getElementById(`team-${lista}s`);
  if (!container) return;
  const linha = document.createElement('div');
  linha.className = 'border border-zinc-800 rounded p-3 space-y-2 team-passo';
  linha.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="text-xs text-zinc-500">${lista} ${container.childElementCount + 1}</span>
      <button type="button" class="btn-ghost text-xs ml-auto" onclick="this.closest('.team-passo').remove()" title="Remover">✕</button>
    </div>
    <input class="team-agente" placeholder="id do agente" />
    <input class="team-ordem" placeholder="ordem para o agente (aceita {{entrada}})" />
  `;
  container.appendChild(linha);
}

interface PassoSpec {
  agente: string;
  ordem: string;
}

const passoDe = (linha: Element): PassoSpec | null => {
  const agente = (linha.querySelector('.team-agente') as HTMLInputElement)?.value.trim() ?? '';
  const ordem = (linha.querySelector('.team-ordem') as HTMLInputElement)?.value.trim() ?? 'Analise a entrada e contribua.';
  return agente ? { agente, ordem } : null;
};

const passosDe = (id: string): PassoSpec[] =>
  Array.from(document.querySelectorAll(`#${id} .team-passo`))
    .map(passoDe)
    .filter((p): p is PassoSpec => p !== null);

export async function criarTeam(): Promise<void> {
  const id = (document.getElementById('team-id') as HTMLInputElement)?.value.trim();
  const titulo = (document.getElementById('team-titulo') as HTMLInputElement)?.value.trim();
  const padrao = (document.getElementById('team-padrao') as HTMLSelectElement)?.value ?? 'pipeline';
  if (!id || !titulo) return;

  const spec: Record<string, unknown> = { id, titulo, padrao };

  if (padrao === 'pipeline') {
    const passos = passosDe('team-passos');
    if (!passos.length) { toast('Pipeline precisa de ao menos 1 passo com agente', 'erro'); return; }
    spec.passos = passos;
  } else if (padrao === 'fanout') {
    const paralelos = passosDe('team-paralelos');
    const sintese = document.querySelector('#team-campos .team-passo:last-of-type') ? passoDe(document.querySelector('#team-campos .team-passo:last-of-type')!) : null;
    if (!paralelos.length) { toast('Fanout precisa de ao menos 1 agente paralelo', 'erro'); return; }
    spec.paralelos = paralelos;
    if (sintese) spec.sintese = sintese;
  } else if (padrao === 'review') {
    const todos = passosDe('team-campos');
    if (todos.length < 2) { toast('Review precisa de executor e revisor', 'erro'); return; }
    spec.executor = todos[0];
    spec.revisor = todos[1];
  } else {
    const proponentes = passosDe('team-proponentes');
    const moderador = (document.querySelector('.team-moderador') as HTMLInputElement)?.value.trim();
    const turnos = Number((document.getElementById('team-turnos') as HTMLInputElement)?.value ?? 2);
    if (!proponentes.length || !moderador) { toast('Debate precisa de proponentes e moderador', 'erro'); return; }
    spec.proponentes = proponentes;
    spec.moderador = { agente: moderador };
    spec.turnos = Math.min(Math.max(turnos, 1), 5);
  }

  try {
    await api('/teams', { method: 'POST', body: JSON.stringify(spec) });
    toast(`Team "${id}" criado`, 'ok');
    fecharFormTeam();
    await renderTeams();
  } catch (e) {
    toast('Erro ao criar team: ' + (e as Error).message, 'erro');
  }
}

/** Executa um team */
export async function executarTeam(id: string): Promise<void> {
  const { modalPrompt, modalConfirm } = await import("../modal.js");
  const btn = document.getElementById('btn-run-' + id) as HTMLButtonElement | null;
  const entrada = await modalPrompt({
    titulo: 'Executar team ' + id,
    label: 'Entrada para o team:',
    multiline: true,
    obrigatorio: true,
  });
  if (!entrada) return;

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = icone('pause') + ' Rodando…';
  }

  try {
    const res = await api<{ task_id?: string; taskId?: string; status?: string }>('/teams/' + id + '/run', {
      method: 'POST',
      body: JSON.stringify({ entrada }),
    });

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = icone('run') + ' Executar';
    }

    const taskId = res.task_id || res.taskId;
    const status = res.status || 'desconhecido';

    if (await modalConfirm(`Orquestração concluída — task ${taskId} em ${status}. Ver no Kanban?`, { confirmar: 'Ver no Kanban' })) {
      const { navegar } = await import("../router.js");
      const { abrirDrawer } = await import("./tasks.js");
      navegar('tasks');
      setTimeout(() => {
        abrirDrawer(String(taskId), '');
      }, 300);
    }
  } catch (e) {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = icone('run') + ' Executar';
    }
    toast('Erro: ' + (e as Error).message, 'erro');
  }
}