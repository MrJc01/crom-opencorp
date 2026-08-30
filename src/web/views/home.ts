/**
 * View Home — Dashboard principal com KPIs, feed, execuções, aprovações, agentes.
 */

import { api, toast, icone, escapeHtml } from "../api.js";
import { getWsAtivo, getWorkspaces, getViewAtual } from "../state.js";
import { formatarDataLocal } from "../format.js";

interface SessionInfo {
  id?: string;
  exec_id?: string;
  agente?: string;
  status?: string;
  inicio?: string;
  criado_em?: string;
}

interface ApprovalInfo {
  id: string;
  padrao?: string;
  pattern?: string;
  status?: string;
}

interface AgentInfo {
  id: string;
  category?: string;
  categoria?: string;
  model?: string;
  modelo?: string;
}

interface BudgetStatus {
  estado?: {
    workspace_usd_hoje?: number;
  };
}

interface TaskInfo {
  coluna?: string;
}

/** Renderiza a view Home */
export async function renderHome(): Promise<void> {
  const [execs, aprovs, agents, budget, tasks] = await Promise.all([
    api<SessionInfo[]>('/sessions').catch(() => []),
    api<ApprovalInfo[]>('/approvals').catch(() => []),
    api<AgentInfo[]>('/agents').catch(() => []),
    api<BudgetStatus>('/budget/status').catch(() => null),
    api<TaskInfo[]>('/tasks').catch(() => []),
  ]);

  const pendentes = (aprovs || []).filter((a) => a.status === 'pendente');
  const tasksAbertas = (tasks || []).filter((t) => !['feito'].includes(String(t.coluna))).length;
  const custoHoje = budget?.estado?.workspace_usd_hoje ?? 0;
  const wsAtivo = getWsAtivo();
  const wss = getWorkspaces();

  const viewEl = document.getElementById('view-home');
  if (!viewEl) return;

  viewEl.innerHTML = `
    <div class="hero">
      <h1 class="hero-title">Bem-vindo ao opencorp</h1>
      <p class="hero-subtitle">Empresa ativa: <strong class="text-white font-mono">${escapeHtml(wsAtivo || '— nenhuma selecionada')}</strong>${wss.length ? ` <span class="text-zinc-500">· ${wss.length} empresa(s)</span>` : ''}</p>
      <div class="hero-actions">
        <button class="btn" onclick="navegar('tasks');setTimeout(()=>document.getElementById('task-titulo')?.focus(),100)">${icone('plus')} Nova task</button>
        <button class="btn" onclick="promptOrdem()">${icone('run')} Run agente</button>
        <button class="btn btn-ghost" onclick="navegar('teams')">${icone('teams')} Criar team</button>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card" onclick="navegar('tasks')" style="cursor:pointer">
        <div class="kpi-value">${tasksAbertas}</div>
        <div class="kpi-label">Tasks abertas</div>
      </div>
      <div class="kpi-card" onclick="navegar('home')" style="cursor:pointer">
        <div class="kpi-value">${(execs || []).length}</div>
        <div class="kpi-label">Execuções totais</div>
      </div>
      <div class="kpi-card" onclick="navegar('home')" style="cursor:pointer">
        <div class="kpi-value">${pendentes.length}</div>
        <div class="kpi-label">Approvals pendentes</div>
      </div>
      <div class="kpi-card" onclick="navegar('home')" style="cursor:pointer">
        <div class="kpi-value">US$ ${custoHoje.toFixed(2)}</div>
        <div class="kpi-label">Custo hoje</div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <section class="card p-4">
        <h2 class="font-semibold mb-3 flex items-center gap-2">${icone('spark')} Atividade ao vivo <span class="badge badge-neutral">todas as empresas</span></h2>
        <div id="feed-atividade" class="scrollbar-thin max-h-96 overflow-y-auto"></div>
      </section>
      <section class="card p-4 space-y-6">
        <div>
          <h3 class="font-semibold mb-2 flex items-center gap-2">${icone('run')} Execuções recentes <span class="badge badge-neutral">todas as empresas</span></h3>
          <div id="execs-recentes" class="scrollbar-thin max-h-64 overflow-y-auto"></div>
        </div>
        <div>
          <h3 class="font-semibold mb-2 flex items-center gap-2">${icone('chat')} Aprovações pendentes <span class="badge badge-neutral">${wsAtivo ? 'empresa: ' + escapeHtml(wsAtivo) : '—'}</span></h3>
          <div id="aprovs-pendentes"></div>
        </div>
        <div>
          <h3 class="font-semibold mb-2 flex items-center gap-2">${icone('teams')} Agentes</h3>
          <div id="agentes-lista"></div>
        </div>
      </section>
    </div>
  `;

  renderFeedAtividade();
  renderExecsRecentes(execs);
  renderAprovsPendentes(pendentes);
  renderAgentesLista(agents);
}

/** Placeholder inicial do feed (SSE preenche dinamicamente) */
function renderFeedAtividade(): void {
  const el = document.getElementById('feed-atividade');
  if (el && !el.innerHTML) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">' + icone('spark') + '</div><div class="empty-title">Aguardando eventos…</div><div class="empty-desc">Atividade aparecerá aqui conforme tasks, sessões, hooks e teams gerarem eventos.</div></div>';
  }
}

/** Adiciona item ao feed de atividade (chamado pelo SSE) */
export function adicionarFeedItem(ev: Record<string, unknown>): void {
  const el = document.getElementById('feed-atividade');
  if (!el) return;

  if (el.querySelector('.empty-state')) el.innerHTML = '';

  const tipo = String(ev.tipo || 'desconhecido');
  let icon = 'tasks', iconClass = 'task';
  if (tipo.startsWith('sessao')) { icon = 'run'; iconClass = 'sessao'; }
  else if (tipo.startsWith('hook')) { icon = 'spark'; iconClass = 'hook'; }
  else if (tipo.startsWith('team')) { icon = 'teams'; iconClass = 'team'; }

  const ts = formatarDataLocal(new Date().toISOString());
  let texto = JSON.stringify(ev).slice(0, 120);

  const div = document.createElement('div');
  div.className = 'feed-item';
  div.innerHTML = '<span class="feed-icon ' + iconClass + '">' + icone(icon) + '</span><div class="feed-text"><div>' + escapeHtml(texto) + '</div><div class="meta">' + ts + '</div></div>';
  el.prepend(div);

  while (el.children.length > 30) el.removeChild(el.lastChild!);
}

function renderExecsRecentes(execs: SessionInfo[]): void {
  const el = document.getElementById('execs-recentes');
  if (!el) return;

  const list = (execs || []).slice(0, 8);
  if (!list.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">' + icone('run') + '</div><div class="empty-title">Nenhuma execução ainda</div><div class="empty-desc">Rode <code>opencorp run "..."</code> no CLI ou clique em <button class="btn" onclick="promptOrdem()">' + icone('run') + ' Run agente</button>.</div></div>';
    return;
  }

  el.innerHTML = list.map((e) => `
    <div class="session-row">
      <span class="session-id">${String(e.id || e.exec_id || '').slice(0, 12)}</span>
      <span class="flex-1 truncate">${escapeHtml(String(e.agente || '—'))}</span>
      <span class="badge ${String(e.status).includes('falhou') ? 'badge-err' : 'badge-ok'}">${escapeHtml(String(e.status || '—'))}</span>
      <span class="font-mono text-xs text-zinc-500">${String(e.inicio || e.criado_em || '').slice(0, 19).replace('T', ' ')}</span>
    </div>
  `).join('');
}

function renderAprovsPendentes(aprovs: ApprovalInfo[]): void {
  const el = document.getElementById('aprovs-pendentes');
  if (!el) return;

  if (!aprovs.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">' + icone('chat') + '</div><div class="empty-title">Nenhuma aprovação pendente</div></div>';
    return;
  }

  el.innerHTML = aprovs.map(a => `
    <div class="approval-row">
      <div>
        <div class="font-mono text-xs">${String(a.id).slice(-8)}</div>
        <div class="text-xs text-zinc-500">${escapeHtml(String(a.padrao || a.pattern || '—'))}</div>
      </div>
      <div class="approval-actions">
        <button class="btn btn-ghost" onclick="decidirAprovacao('${escapeHtml(String(a.id))}', true)">${icone('spark')} Aprovar</button>
        <button class="btn" style="background:var(--err)" onclick="decidirAprovacao('${escapeHtml(String(a.id))}', false)">${icone('close')} Rejeitar</button>
      </div>
    </div>
  `).join('');
}

function renderAgentesLista(agents: AgentInfo[]): void {
  const el = document.getElementById('agentes-lista');
  if (!el) return;

  const list = agents || [];
  if (!list.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">' + icone('teams') + '</div><div class="empty-title">Nenhum agente</div><div class="empty-desc">Crie agentes com <code>opencorp agent create</code> ou via API.</div></div>';
    return;
  }

  el.innerHTML = list.map(a => `
    <div class="session-row">
      <span class="session-id">${escapeHtml(String(a.id))}</span>
      <span class="flex-1 truncate">${escapeHtml(String(a.category || a.categoria || '—'))}</span>
      <span class="font-mono text-xs text-zinc-500">${escapeHtml(String(a.model || a.modelo || '—'))}</span>
    </div>
  `).join('');
}

export async function decidirAprovacao(id: string, ok: boolean): Promise<void> {
  await api('/approvals/' + id + (ok ? '/approve' : '/reject'), { method: 'POST', body: JSON.stringify({ motivo: 'web' }) });
  toast(ok ? 'Aprovação registrada' : 'Aprovação rejeitada', ok ? 'ok' : 'aviso');
  if (getViewAtual() === 'home') renderHome();
}

export async function promptOrdem(): Promise<void> {
  const { modalPrompt } = await import("../modal.js");
  const ordem = await modalPrompt({
    titulo: 'Executar agente',
    label: 'Ordem para executor-padrao:',
    multiline: true,
    obrigatorio: true,
  });
  if (!ordem) return;
  try {
    const wsAtivo = getWsAtivo();
    const r = await fetch('/agents/executor-padrao/run' + (wsAtivo ? '?workspace=' + wsAtivo : ''), {
      method: 'POST', headers: { 'Authorization': `Bearer ${localStorage.getItem('oc-token')}`, 'content-type': 'application/json' }, body: JSON.stringify({ ordem })
    });
    if (r.status === 202) toast('Iniciado (202)');
    else toast('HTTP ' + r.status + ' — ' + await r.text(), 'erro');
  } catch (e) { toast('Erro: ' + (e as Error).message, 'erro'); }
}