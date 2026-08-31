/**
 * View Home — HUB da empresa (estilo Linear/Vercel):
 * header com workspace + saúde dos daemons, KPIs de operação, aprovações,
 * linhas de pensamento executáveis, feed ao vivo e atalhos de sistema.
 */

import { api, toast, icone, escapeHtml } from "../api.js";
import { getWsAtivo, getWorkspaces, getViewAtual } from "../state.js";
import { formatarDataLocal } from "../format.js";
import { estadoVazio, estadoErro, estadoCarregando } from "../estado.js";
import { ajuda } from "../help.js";

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

interface BudgetStatus {
  estado?: {
    workspace_usd_hoje?: number;
  };
}

interface TaskInfo {
  coluna?: string;
  criado_em?: string;
}

interface FlowInfo {
  id: string;
  nome?: string;
}

interface StatusAgregado {
  scheduler?: boolean;
  secretario?: boolean;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** Renderiza a view Home (hub) */
export async function renderHome(): Promise<void> {
  const viewEl = document.getElementById('view-home');
  if (!viewEl) return;

  // Loading apenas no primeiro render (evita piscar no refresh de 8s)
  if (!viewEl.innerHTML.trim()) viewEl.innerHTML = estadoCarregando('Carregando hub…');

  const [status, sessions, aprovs, budget, tasks, flows] = await Promise.all([
    api<StatusAgregado>('/status').catch(() => null),
    api<SessionInfo[]>('/sessions').catch(() => null),
    api<ApprovalInfo[]>('/approvals').catch(() => null),
    api<BudgetStatus>('/budget/status').catch(() => null),
    api<TaskInfo[]>('/tasks').catch(() => null),
    api<FlowInfo[]>('/flows').catch(() => null),
  ]);

  const tudoFalhou = !sessions && !aprovs && !budget && !tasks && !flows;
  const wsAtivo = getWsAtivo();

  if (tudoFalhou) {
    viewEl.innerHTML = wsAtivo
      ? estadoErro('Não foi possível carregar os dados da empresa.', () => { void renderHome(); })
      : estadoVazio('home', 'Selecione uma empresa', 'Escolha um workspace na barra lateral para ver os dados dela aqui.');
    return;
  }

  const pendentes = (aprovs || []).filter((a) => a.status === 'pendente');
  const agora = Date.now();
  const tasksAbertas = (tasks || []).filter((t) => String(t.coluna) !== 'feito').length;
  const feitas7d = (tasks || []).filter((t) => {
    if (String(t.coluna) !== 'feito' || !t.criado_em) return false;
    return agora - new Date(t.criado_em).getTime() <= 7 * DIA_MS;
  }).length;
  const sessions24h = (sessions || []).filter((s) => {
    const quando = s.inicio || s.criado_em;
    return quando && agora - new Date(quando).getTime() <= DIA_MS;
  });
  const ok24h = sessions24h.filter((s) => String(s.status) === 'concluido').length;
  const taxa24h = sessions24h.length ? Math.round((ok24h / sessions24h.length) * 100) : null;
  const custoHoje = budget?.estado?.workspace_usd_hoje ?? 0;
  const wss = getWorkspaces();
  const flowsLista = (flows || []).slice(0, 4);

  viewEl.innerHTML = `
    <div class="hub-header card p-4 mb-5">
      <div class="hub-header-esq">
        <button class="hub-ws" onclick="toggleSidebar(true)" title="Trocar empresa">
          ${icone('home')} <span class="font-mono font-semibold">${escapeHtml(wsAtivo || '— empresa —')}</span> <span class="hub-ws-count">${wss.length ? wss.length + ' empresa(s)' : ''}</span>
        </button>
        ${saudeHtml(status)}
      </div>
      <div class="hub-acoes">
        <button class="btn" onclick="navegar('tasks');setTimeout(()=>document.getElementById('task-titulo')?.focus(),100)">${icone('plus')} Nova task</button>
        <button class="btn" onclick="promptOrdem()">${icone('run')} Run agente</button>
        <button class="btn btn-ghost" onclick="abrirWizard()">${icone('spark')} Criar empresa</button>
      </div>
    </div>

    <div class="zona-rotulo">Operação hoje ${ajuda('feed')}</div>
    <div class="kpi-grid">
      <div class="kpi-card" onclick="navegar('tasks')" style="cursor:pointer">
        <div class="kpi-value">${tasksAbertas}</div>
        <div class="kpi-label">Tasks abertas ${ajuda('tasks')}</div>
      </div>
      <div class="kpi-card" onclick="navegar('tasks')" style="cursor:pointer">
        <div class="kpi-value">${feitas7d}</div>
        <div class="kpi-label">Feitas em 7 dias</div>
      </div>
      <div class="kpi-card" onclick="navegar('historico')" style="cursor:pointer">
        <div class="kpi-value">${taxa24h === null ? '—' : taxa24h + '%'}</div>
        <div class="kpi-label">Taxa ok 24h ${ajuda('execucoes')}</div>
      </div>
      <div class="kpi-card" onclick="navegar('config')" style="cursor:pointer">
        <div class="kpi-value">US$ ${custoHoje.toFixed(2)}</div>
        <div class="kpi-label">Custo hoje ${ajuda('budget')}</div>
      </div>
    </div>

    <div class="zona-rotulo">Aprovações ${ajuda('hitl')}</div>
    <section class="card p-4 mb-5" id="aprovs-pendentes"></section>

    <div class="zona-rotulo">Linhas de pensamento ${ajuda('flows')}</div>
    <section class="card p-4 mb-5" id="hub-flows"></section>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <section class="card p-4">
        <h2 class="font-semibold mb-3 flex items-center gap-2 text-sm uppercase tracking-wide text-zinc-400">${icone('spark')} Feed ao vivo <span class="badge badge-neutral">todas as empresas</span> ${ajuda('feed')}</h2>
        <div id="feed-atividade" class="scrollbar-thin max-h-96 overflow-y-auto"></div>
      </section>
      <section class="card p-4">
        <h2 class="font-semibold mb-3 flex items-center gap-2 text-sm uppercase tracking-wide text-zinc-400">${icone('gear')} Sistema ${ajuda('config')}</h2>
        <div class="hub-sistema">
          <button class="hub-card" onclick="navegar('config')">
            ${icone('gear')} <span><b>Config</b><small>preferências, orçamento, segurança</small></span>
          </button>
          <button class="hub-card" onclick="navegar('config');setTimeout(()=>window.__cfgAba?.('secrets'),350)">
            ${icone('key')} <span><b>Secrets</b><small>credenciais — valores nunca exibidos</small></span>
          </button>
          <button class="hub-card" onclick="navegar('config');setTimeout(()=>window.__cfgAba?.('ferramentas'),350)">
            ${icone('apps')} <span><b>Ferramentas</b><small>specs em .opencorp/tools</small></span>
          </button>
          <div class="hub-card hub-card-static" title="Rode no terminal">
            ${icone('shield')} <span><b>Doutor</b><small><code>opencorp doctor</code> no CLI</small></span>
          </div>
        </div>
      </section>
    </div>
  `;

  renderFeedAtividade();
  renderAprovsPendentes(pendentes);
  renderFlowsHub(flowsLista, (flows || []).length);
}

/** Dot de saúde do header: verde (tudo ok), âmbar (parcial), vermelho (parado), cinza (desconhecido) */
function saudeHtml(status: StatusAgregado | null): string {
  if (!status || (status.scheduler === undefined && status.secretario === undefined)) {
    return `<span class="hub-saude" title="Saúde desconhecida"><span class="hub-dot" style="background:#737373"></span> daemon: —</span>`;
  }
  const { scheduler, secretario } = status;
  const ok = scheduler && secretario;
  const cor = ok ? 'var(--ok)' : (scheduler || secretario) ? 'var(--warn)' : 'var(--err)';
  const rotulo = ok ? 'daemons ok' : scheduler ? 'secretário parado' : secretario ? 'scheduler parado' : 'daemons parados';
  const detalhe = `scheduler: ${scheduler ? 'rodando' : 'parado'} · secretário: ${secretario ? 'rodando' : 'parado'}`;
  return `<span class="hub-saude" title="${detalhe}"><span class="hub-dot" style="background:${cor}"></span> ${rotulo}</span>`;
}

function renderAprovsPendentes(aprovs: ApprovalInfo[]): void {
  const el = document.getElementById('aprovs-pendentes');
  if (!el) return;

  if (!aprovs.length) {
    el.innerHTML = estadoVazio('chat', 'Nenhuma aprovação pendente', 'Ações sensíveis (git push, npm publish…) pausam aqui esperando você.');
    return;
  }

  el.innerHTML = aprovs.map((a) => `
    <div class="approval-row">
      <div>
        <div class="font-mono text-xs">${String(a.id).slice(-8)}</div>
        <div class="text-xs text-zinc-400">${escapeHtml(String(a.padrao || a.pattern || '—'))}</div>
      </div>
      <div class="approval-actions">
        <button class="btn btn-ghost" onclick="decidirAprovacao('${escapeHtml(String(a.id))}', true)">${icone('check')} Aprovar</button>
        <button class="btn" style="background:var(--err)" onclick="decidirAprovacao('${escapeHtml(String(a.id))}', false)">${icone('close')} Rejeitar</button>
      </div>
    </div>
  `).join('');
}

function renderFlowsHub(flows: FlowInfo[], total: number): void {
  const el = document.getElementById('hub-flows');
  if (!el) return;

  if (!flows.length) {
    el.innerHTML = `
      <div class="flex items-center justify-between gap-2 mb-2">
        <span class="text-sm text-zinc-400">O CEO analisa o board e abre tasks sozinho com elas.</span>
        <a class="btn-ghost text-xs" onclick="navegar('fluxos')" href="#/fluxos">ver fluxos →</a>
      </div>
      ${estadoVazio('fluxos', 'Nenhum fluxo no workspace', 'Crie com <code>opencorp flow create</code> ou instale as linhas de pensamento padrão.')}`;
    return;
  }

  el.innerHTML = `
    <div class="flex items-center justify-between gap-2 mb-2">
      <span class="text-sm text-zinc-400">Executáveis a um clique:</span>
      <a class="btn-ghost text-xs" onclick="navegar('fluxos')" href="#/fluxos">ver todas (${total}) →</a>
    </div>
    <div class="hub-flows-lista">
      ${flows.map((f) => `
        <div class="hub-flow">
          <div class="min-w-0">
            <div class="font-mono text-sm truncate">${escapeHtml(String(f.id))}</div>
            ${f.nome ? `<div class="text-xs text-zinc-500 truncate">${escapeHtml(String(f.nome))}</div>` : ''}
          </div>
          <button class="btn btn-ghost text-xs flex-shrink-0" onclick="rodarFlowHub('${escapeHtml(String(f.id))}')">${icone('run')} Rodar agora</button>
        </div>
      `).join('')}
    </div>
  `;
}

/** Roda um flow da home pedindo entrada via modal (igual #fluxos) */
export async function rodarFlowHub(id: string): Promise<void> {
  const { modalPrompt } = await import("../modal.js");
  const entrada = await modalPrompt({
    titulo: 'Executar flow ' + id,
    label: 'Entrada (texto livre ou vazio):',
    multiline: true,
  });
  if (entrada === null) return;
  try {
    await api('/flows/' + encodeURIComponent(id) + '/run', { method: 'POST', body: JSON.stringify({ entrada }) });
    toast('Flow executando — acompanhe no Feed e no Histórico', 'ok');
  } catch (e) {
    toast('Erro: ' + (e as Error).message, 'erro');
  }
}

/** Placeholder inicial do feed (SSE preenche dinamicamente) */
function renderFeedAtividade(): void {
  const el = document.getElementById('feed-atividade');
  if (el && !el.innerHTML) {
    el.innerHTML = estadoVazio('spark', 'Aguardando eventos…', 'Atividade aparecerá aqui conforme tasks, sessões, hooks e teams gerarem eventos.');
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
  const texto = JSON.stringify(ev).slice(0, 120);

  const div = document.createElement('div');
  div.className = 'feed-item';
  div.innerHTML = '<span class="feed-icon ' + iconClass + '">' + icone(icon) + '</span><div class="feed-text"><div>' + escapeHtml(texto) + '</div><div class="meta">' + ts + '</div></div>';
  el.prepend(div);

  while (el.children.length > 30) el.removeChild(el.lastChild!);
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
