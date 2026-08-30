/**
 * View Teams — Lista de teams com execução.
 */

import { api, toast, icone, escapeHtml } from "../api.js";
import { badgeTeamPadrao } from "../format.js";

/** Renderiza a view Teams */
export async function renderTeams(): Promise<void> {
  const teams = await api<Record<string, unknown>[]>('/teams').catch(() => []);

  const viewEl = document.getElementById('view-teams');
  if (!viewEl) return;

  viewEl.innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold flex items-center gap-2">${icone('teams')} Teams</h1>
      <a href="/doc" target="_blank" class="btn btn-ghost text-sm">Ver spec no /doc</a>
    </div>
    <div id="teams-lista" class="space-y-4"></div>
  `;

  const el = document.getElementById('teams-lista');
  if (!el) return;

  if (!teams.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${icone('teams')}</div>
        <div class="empty-title">Nenhum team configurado</div>
        <div class="empty-desc">Crie um team via <code>POST /teams</code> com spec (pipeline, fanout, review ou debate).<br>Ex: <code>{"id":"meu-team","padrao":"pipeline","passos":[{"agente":"executor-padrao"}]}</code></div>
      </div>
    `;
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
      <div class="team-steps">${((t.passos as unknown[]) || []).length} passo(s)</div>
    </div>
  `).join('');
}

/** Executa um team */
export async function executarTeam(id: string): Promise<void> {
  const btn = document.getElementById('btn-run-' + id) as HTMLButtonElement | null;
  const entrada = prompt('Entrada para o team:');
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

    if (confirm(`Orquestração concluída — task ${taskId} em ${status}\n\nVer no Kanban?`)) {
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