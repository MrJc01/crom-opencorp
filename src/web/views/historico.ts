/**
 * View Histórico — Timeline unificada de execuções, tasks e rotinas.
 */

import { api, q, toast, icone, escapeHtml } from "../api.js";
import { getWsAtivo } from "../state.js";
import { formatarDataLocal, mesclarHistorico, type EventoHistorico, type SessionInfo, type TaskInfo, type ScheduleJob } from "../format.js";
import { estadoVazio, estadoErro, estadoCarregando } from "../estado.js";
import { ajuda } from "../help.js";

function corDoTipo(tipo: EventoHistorico['tipo'], status?: string): string {
  if (tipo === 'execucao') return 'var(--accent)';
  if (tipo === 'task') {
    if (status === 'feito') return 'var(--ok)';
    if (status === 'fazendo') return 'var(--warn)';
    return 'var(--ok)';
  }
  return 'var(--warn)'; // rotina
}

function labelDoTipo(tipo: EventoHistorico['tipo']): string {
  switch (tipo) {
    case 'execucao': return 'Execução';
    case 'task': return 'Task';
    case 'rotina': return 'Rotina';
  }
}

/** Renderiza a view Histórico */
export async function renderHistorico(): Promise<void> {
  const viewEl = document.getElementById('view-historico');
  if (!viewEl) return;

  // Estado local para filtros
  let filtroAtual: 'execucao' | 'task' | 'rotina' | 'tudo' = 'tudo';
  let limiteAtual = 100;

  async function carregarERender(): Promise<void> {
    try {
      const [sessions, tasks, jobs] = await Promise.all([
        q<SessionInfo[]>('/sessions').catch(() => []),
        q<TaskInfo[]>('/tasks').catch(() => []),
        q<ScheduleJob[]>('/schedules').catch(() => []),
      ]);

      const filtroApi = filtroAtual === 'tudo' ? undefined : filtroAtual;
      const eventos = mesclarHistorico(sessions, tasks, jobs, { filtro: filtroApi, limite: limiteAtual });

      renderTimeline(eventos);
    } catch (erro) {
      if (viewEl) {
        viewEl.innerHTML = `
          <div class="flex items-center justify-between mb-6">
            <h1 class="text-2xl font-bold flex items-center gap-2">${icone('history')} Histórico ${ajuda('historico')}</h1>
          </div>
        ` + estadoErro('Não foi possível carregar o histórico: ' + (erro instanceof Error ? erro.message : String(erro)), () => { void renderHistorico(); });
      }
    }
  }

  function renderTimeline(eventos: EventoHistorico[]): void {
    const el = viewEl;
    if (!el) return;

    if (!eventos.length) {
      el.innerHTML = `
        <div class="flex items-center justify-between mb-6">
          <h1 class="text-2xl font-bold flex items-center gap-2">${icone('history')} Histórico ${ajuda('historico')}</h1>
          <div class="flex items-center gap-2">
            <div class="flex rounded-lg border border-zinc-700" role="group" aria-label="Filtro por tipo">
              <button class="btn-ghost text-xs px-3 py-1 ${filtroAtual === 'tudo' ? 'bg-blue-600 text-white' : ''}" onclick="window.__historicoSetFiltro('tudo')">Tudo</button>
              <button class="btn-ghost text-xs px-3 py-1 ${filtroAtual === 'execucao' ? 'bg-blue-600 text-white' : ''}" onclick="window.__historicoSetFiltro('execucao')">Execuções</button>
              <button class="btn-ghost text-xs px-3 py-1 ${filtroAtual === 'task' ? 'bg-blue-600 text-white' : ''}" onclick="window.__historicoSetFiltro('task')">Tasks</button>
              <button class="btn-ghost text-xs px-3 py-1 ${filtroAtual === 'rotina' ? 'bg-blue-600 text-white' : ''}" onclick="window.__historicoSetFiltro('rotina')">Rotinas</button>
            </div>
            <select class="btn-ghost text-xs" onchange="window.__historicoSetLimite(Number(this.value))" value="${limiteAtual}">
              <option value="50">50</option>
              <option value="100" ${limiteAtual === 100 ? 'selected' : ''}>100</option>
              <option value="200" ${limiteAtual === 200 ? 'selected' : ''}>200</option>
            </select>
          </div>
        </div>
        ${estadoVazio('history', 'Nada registrado ainda', 'As execuções, tasks e rotinas aparecem aqui conforme a empresa opera.')}
      `;
      return;
    }

    el.innerHTML = `
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold flex items-center gap-2">${icone('history')} Histórico ${ajuda('historico')}</h1>
        <div class="flex items-center gap-2">
          <div class="flex rounded-lg border border-zinc-700" role="group" aria-label="Filtro por tipo">
            <button class="btn-ghost text-xs px-3 py-1 ${filtroAtual === 'tudo' ? 'bg-blue-600 text-white' : ''}" onclick="window.__historicoSetFiltro('tudo')">Tudo</button>
            <button class="btn-ghost text-xs px-3 py-1 ${filtroAtual === 'execucao' ? 'bg-blue-600 text-white' : ''}" onclick="window.__historicoSetFiltro('execucao')">Execuções</button>
            <button class="btn-ghost text-xs px-3 py-1 ${filtroAtual === 'task' ? 'bg-blue-600 text-white' : ''}" onclick="window.__historicoSetFiltro('task')">Tasks</button>
            <button class="btn-ghost text-xs px-3 py-1 ${filtroAtual === 'rotina' ? 'bg-blue-600 text-white' : ''}" onclick="window.__historicoSetFiltro('rotina')">Rotinas</button>
          </div>
          <select class="btn-ghost text-xs" onchange="window.__historicoSetLimite(Number(this.value))" value="${limiteAtual}">
            <option value="50">50</option>
            <option value="100" ${limiteAtual === 100 ? 'selected' : ''}>100</option>
            <option value="200" ${limiteAtual === 200 ? 'selected' : ''}>200</option>
          </select>
        </div>
      </div>
      <div class="timeline" id="timeline-container"></div>
    `;

    const container = document.getElementById('timeline-container');
    if (!container) return;

    container.innerHTML = eventos.map((e) => `
      <div class="timeline-item">
        <div class="timeline-dot" style="background: ${corDoTipo(e.tipo, e.status)}"></div>
        <div class="timeline-content">
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="font-medium truncate">${escapeHtml(e.titulo)}</span>
                <span class="badge badge-neutral text-xs">${labelDoTipo(e.tipo)}</span>
                ${e.status ? `<span class="badge badge-neutral text-xs">${escapeHtml(e.status)}</span>` : ''}
              </div>
              <div class="text-xs text-zinc-400 font-mono">${escapeHtml(e.detalhe)}</div>
            </div>
            <div class="text-xs text-zinc-500 font-mono whitespace-nowrap flex-shrink-0">${formatarDataLocal(e.quando)}</div>
          </div>
        </div>
      </div>
    `).join('');
  }

  viewEl.innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold flex items-center gap-2">${icone('history')} Histórico ${ajuda('historico')}</h1>
      <div class="flex items-center gap-2">
        <div class="flex rounded-lg border border-zinc-700" role="group" aria-label="Filtro por tipo">
          <button class="btn-ghost text-xs px-3 py-1 bg-blue-600 text-white" onclick="window.__historicoSetFiltro('tudo')">Tudo</button>
          <button class="btn-ghost text-xs px-3 py-1" onclick="window.__historicoSetFiltro('execucao')">Execuções</button>
          <button class="btn-ghost text-xs px-3 py-1" onclick="window.__historicoSetFiltro('task')">Tasks</button>
          <button class="btn-ghost text-xs px-3 py-1" onclick="window.__historicoSetFiltro('rotina')">Rotinas</button>
        </div>
        <select class="btn-ghost text-xs" onchange="window.__historicoSetLimite(Number(this.value))" value="${limiteAtual}">
          <option value="50">50</option>
          <option value="100" selected>100</option>
          <option value="200">200</option>
        </select>
      </div>
    </div>
    ${estadoCarregando()}
  `;

  await carregarERender();

  // Expor handlers globais
  (window as unknown as Record<string, unknown>).__historicoSetFiltro = (f: string) => {
    filtroAtual = f as 'execucao' | 'task' | 'rotina' | 'tudo';
    carregarERender();
  };
  (window as unknown as Record<string, unknown>).__historicoSetLimite = (l: number) => {
    limiteAtual = l;
    carregarERender();
  };
}