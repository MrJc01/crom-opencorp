/**
 * View Tasks — Kanban + Drawer de detalhes.
 */

import { api, toast, icone, escapeHtml } from "../api.js";
import { getWsAtivo, setTaskAberta } from "../state.js";
import { fecharDrawer } from "../router.js";
import { estadoVazio, estadoErro, estadoCarregando } from "../estado.js";
import { ajuda } from "../help.js";

let taskAbertaId: string | null = null;
let arrastouAgora = false;

const AJUDA_COLUNA: Record<string, string> = {
  backlog: 'Tasks na fila — ninguém pegou ainda.',
  fazendo: 'Em execução por um agente neste momento.',
  bloqueado: 'Paradas: falta algo (dependência, aprovação HITL, erro).',
  feito: 'Concluídas. Histórico fica em Histórico.',
};

/** Renderiza a view Tasks (Kanban) */
export async function renderTasks(): Promise<void> {
  const viewEl = document.getElementById('view-tasks');
  if (!viewEl) return;

  // Loading apenas no primeiro render (evita piscar no refresh de 8s)
  if (!viewEl.innerHTML.trim()) {
    viewEl.innerHTML = estadoCarregando('Carregando tasks…');
  }

  let tasks: Record<string, unknown>[] | null;
  try {
    tasks = await api<Record<string, unknown>[]>('/tasks');
  } catch {
    tasks = null;
  }

  if (!tasks) {
    viewEl.innerHTML = estadoErro('Não foi possível carregar o task board.', () => { void renderTasks(); });
    return;
  }

  const colunasPadrao = ['backlog', 'fazendo', 'bloqueado', 'feito'];
  const extras = [...new Set(tasks.map(t => String(t.coluna)))].filter(c => !colunasPadrao.includes(c));
  const todasColunas = [...colunasPadrao, ...extras];

  viewEl.innerHTML = `
    <div class="flex flex-wrap items-center gap-2 mb-6">
      <input id="task-titulo" placeholder="Título da task — Enter cria" class="flex-1 min-w-0 max-w-80" onkeydown="if(event.key==='Enter')criarTask()"/>
      <button class="btn" onclick="criarTask()">+ Criar task</button>
      <span class="help-wrap">${ajuda('tasks')}</span>
    </div>
    ${tasks.length === 0
      ? estadoVazio('tasks', 'Nenhuma task na empresa', 'Crie a primeira no campo acima — os agentes assumem tasks do board automaticamente conforme a rotina.')
      : `<div id="kanban" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"></div>`}
  `;

  const kb = document.getElementById('kanban');
  if (!kb) return;

  for (const col of todasColunas) {
    const colTasks = tasks.filter(t => String(t.coluna) === col).sort((a, b) => Number(a.pos) - Number(b.pos));
    const div = document.createElement('div');
    div.className = 'kanban-col';
    div.innerHTML = `
      <div class="kanban-header">
        <span class="kanban-title capitalize">${escapeHtml(col)}${AJUDA_COLUNA[col] ? ajudaKanban(col) : ''}</span>
        <span class="kanban-count">${colTasks.length}</span>
      </div>
      <div class="kanban-cards scrollbar-thin" id="kanban-${escapeHtml(col)}"></div>
    `;
    kb.appendChild(div);
    const container = div.querySelector('#kanban-' + escapeHtml(col));
    if (!container) continue;
    configurarDropColuna(container as HTMLElement, kb, col);

    for (const t of colTasks) {
      const card = document.createElement('div');
      card.className = 'task-card' + ((t.bloqueado_por as string[] | undefined)?.length ? ' locked' : '');
      const prioClass = t.prioridade === 'alta' ? 'alta' : t.prioridade === 'baixa' ? 'baixa' : 'media';
      card.innerHTML = `
        <div class="task-title">${escapeHtml(String(t.titulo))}</div>
        <div class="task-meta">
          <span class="font-mono">${escapeHtml(String(t.responsavel || '—'))}</span>
          ${t.prioridade !== 'media' ? `<span class="task-priority ${prioClass}">${escapeHtml(String(t.prioridade))}</span>` : ''}
          ${(t.labels as string[] | undefined)?.length ? (t.labels as string[]).map(l => `<span class="badge badge-neutral">${escapeHtml(l)}</span>`).join('') : ''}
        </div>
      `;
      card.onclick = () => {
        if (!arrastouAgora) abrirDrawer(String(t.id), String(t.titulo));
      };
      configurarDragCard(card, String(t.id), col);
      container.appendChild(card);
    }
  }
}

/** "?" explicando uma coluna do kanban (texto fixo por coluna) */
function ajudaKanban(col: string): string {
  return ajuda('kanban-' + col, AJUDA_COLUNA[col] ?? '');
}

/** Torna um card arrastável entre colunas do kanban */
function configurarDragCard(card: HTMLElement, taskId: string, coluna: string): void {
  card.draggable = true;
  card.dataset.taskId = taskId;
  card.dataset.colunaAtual = coluna;

  card.addEventListener('dragstart', ev => {
    arrastouAgora = false;
    if (ev.dataTransfer) {
      ev.dataTransfer.setData('text/plain', taskId);
      ev.dataTransfer.effectAllowed = 'move';
    }
    card.classList.add('arrastando');
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('arrastando');
    arrastouAgora = true;
    setTimeout(() => { arrastouAgora = false; }, 150);
  });
}

/** Liga os handlers de drop numa coluna do kanban */
function configurarDropColuna(container: HTMLElement, kb: HTMLElement, coluna: string): void {
  container.addEventListener('dragover', ev => {
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
    container.classList.add('drag-over');
  });

  container.addEventListener('dragleave', ev => {
    if (!container.contains(ev.relatedTarget as Node)) container.classList.remove('drag-over');
  });

  container.addEventListener('drop', ev => {
    ev.preventDefault();
    container.classList.remove('drag-over');
    const taskId = ev.dataTransfer?.getData('text/plain');
    if (!taskId) return;
    const cardEl = kb.querySelector('.task-card[data-task-id="' + taskId.replace(/"/g, '\\"') + '"]') as HTMLElement | null;
    if (!cardEl || cardEl.dataset.colunaAtual === coluna) return;
    cardEl.dataset.colunaAtual = coluna;
    void moverTaskColunaDireto(taskId, coluna);
  });
}

/** Move task solta pelo drag-and-drop (PATCH coluna — mesmo contrato do drawer) */
export async function moverTaskColunaDireto(id: string, coluna: string): Promise<void> {
  await api('/tasks/' + id, { method: 'PATCH', body: JSON.stringify({ coluna }) }).catch(() => undefined);
  renderTasks();
}

/** Cria nova task a partir do input */
export async function criarTask(): Promise<void> {
  const input = document.getElementById('task-titulo') as HTMLInputElement | null;
  if (!input) return;
  const titulo = input.value.trim();
  if (!titulo) return;

  try {
    await api('/tasks', { method: 'POST', body: JSON.stringify({ titulo }) });
    input.value = '';
    renderTasks();
  } catch {
    // mantém o texto digitado em caso de falha (não finge sucesso)
  }
}

/** Abre drawer de detalhes da task — versão canônica vive no router.ts; mantém taskAbertaId local p/ chat/patch */
export async function abrirDrawer(id: string, titulo: string): Promise<void> {
  taskAbertaId = id;
  setTaskAberta(id);
  const { abrirDrawer } = await import("../router.js");
  await abrirDrawer(id, titulo);
}

/** Carrega conteúdo do drawer (detalhes + chat) */
export async function carregarDrawerConteudo(id: string): Promise<void> {
  const [task, chat, colunasExtras] = await Promise.all([
    api<Record<string, unknown>>('/tasks/' + id).catch(() => null),
    api<Record<string, unknown>[]>('/tasks/' + id + '/chat').catch(() => []),
    api<string[]>('/tasks/colunas').catch(() => []),
  ]);

  if (!task) { fecharDrawer(); return; }

  const colunas = ['backlog', 'fazendo', 'bloqueado', 'feito', ...new Set(colunasExtras)];
  const bloqueada = task.bloqueada === true || ((task.bloqueado_por as string[] | undefined)?.length ?? 0) > 0;

  const contentEl = document.getElementById('drawer-content');
  if (!contentEl) return;

  contentEl.innerHTML = `
    <div class="space-y-4">
      <div class="task-detail-field">
        <span class="task-detail-label">ID</span>
        <span class="task-detail-value mono">${escapeHtml(String(task.id))}</span>
      </div>
      <div class="task-detail-field">
        <span class="task-detail-label">Coluna</span>
        <select id="drawer-coluna" class="task-detail-value" onchange="moverTaskColuna()">
          ${colunas.map(c => `<option value="${escapeHtml(c)}" ${c === task.coluna ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
        </select>
      </div>
      <div class="task-detail-field">
        <span class="task-detail-label">Prioridade</span>
        <select id="drawer-prioridade" class="task-detail-value" onchange="atualizarTaskPrioridade()">
          <option value="baixa" ${task.prioridade === 'baixa' ? 'selected' : ''}>Baixa</option>
          <option value="media" ${task.prioridade === 'media' ? 'selected' : ''}>Média</option>
          <option value="alta" ${task.prioridade === 'alta' ? 'selected' : ''}>Alta</option>
        </select>
      </div>
      <div class="task-detail-field">
        <span class="task-detail-label">Responsável</span>
        <input id="drawer-responsavel" class="task-detail-value" value="${escapeHtml(String(task.responsavel || ''))}" onblur="atualizarTaskResponsavel()"/>
      </div>
      <div class="task-detail-field">
        <span class="task-detail-label">Due</span>
        <input id="drawer-due" type="date" class="task-detail-value" value="${task.due ? String(task.due).slice(0, 10) : ''}" onchange="atualizarTaskDue()"/>
      </div>
      <div class="task-detail-field">
        <span class="task-detail-label">Labels</span>
        <input id="drawer-labels" class="task-detail-value" value="${((task.labels as string[] | undefined) || []).join(', ')}" onblur="atualizarTaskLabels()"/>
      </div>
      <div class="task-detail-field">
        <span class="task-detail-label">Bloqueada por</span>
        <span class="task-detail-value mono">${((task.bloqueado_por as string[] | undefined) || []).join(', ') || '—'}</span>
      </div>
      <div class="task-detail-field">
        <span class="task-detail-label">Lock</span>
        <span class="task-detail-value">${bloqueada ? '<span class="badge badge-err">BLOQUEADA</span>' : '<span class="badge badge-ok">Livre</span>'}</span>
      </div>
      <div class="task-detail-field">
        <span class="task-detail-label">Descrição</span>
        <textarea id="drawer-descricao" class="task-detail-value" rows="3" onblur="atualizarTaskDescricao()">${escapeHtml(String(task.descricao || ''))}</textarea>
      </div>
      <div class="flex justify-end pt-1 border-t border-zinc-800 mt-2">
        <button class="btn btn-ghost text-error" onclick="excluirTask()">${icone('trash')} Excluir task</button>
      </div>
    </div>
    <div class="border-t border-zinc-800 pt-4">
      <h3 class="font-semibold mb-2 flex items-center gap-2">${icone('chat')} Chat</h3>
      <div id="drawer-chat" class="scrollbar-thin max-h-64 overflow-y-auto space-y-2 mb-4">${renderChat(chat)}</div>
    </div>
    <div id="drawer-console-wrap" class="border-t border-zinc-800 pt-4">
      <h3 class="font-semibold mb-2 flex items-center gap-2">${icone('run')} Execução ao vivo</h3>
      <div id="drawer-console" class="drawer-console"><div class="dc-status"><span class="dc-dot"></span>verificando…</div></div>
    </div>
  `;
  // console ao vivo: mostra o output do agente enquanto ele trabalha
  const responsavel = String(task.responsavel || '').replace(/^agente:/, '');
  if (responsavel) iniciarConsoleAoVivo(responsavel);
}

/** Timer do console ao vivo — um só, recriado a cada drawer aberto */
let consoleTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Console ao vivo do drawer — polls a execução EM CURSO do agente responsável
 * e mostra o tail do log em tempo real (o que o agente está gerando agora).
 * Auto-encerra quando o drawer fecha.
 */
function iniciarConsoleAoVivo(agente: string): void {
  if (consoleTimer) { clearInterval(consoleTimer); consoleTimer = null; }
  const container = document.getElementById('drawer-console');
  if (!container) return;

  const tick = async (): Promise<void> => {
    const drawer = document.getElementById('drawer');
    if (!drawer?.classList.contains('open')) {
      if (consoleTimer) { clearInterval(consoleTimer); consoleTimer = null; }
      return; // fechou — para o poller
    }
    try {
      const execs = await api<Array<{ id: string; agente?: string; status: string; inicio?: string }>>(
        '/sessions?agent=' + encodeURIComponent(agente),
      ).catch(() => []);
      const rodando = (execs ?? []).find((e) => e.status === 'executando');
      if (!rodando) {
        container.innerHTML = '<div class="dc-status" style="color:var(--muted)">nenhuma execução ativa deste agente agora</div>';
        return;
      }
      const inicioMs = rodando.inicio ? Date.parse(rodando.inicio) : 0;
      const decorrido = inicioMs ? Math.max(1, Math.round((Date.now() - inicioMs) / 1000)) : 0;
      const { log } = await api<{ log: string }>('/sessions/' + encodeURIComponent(rodando.id) + '/log');
      const tail = (log || '').split('\n').slice(-22).join('\n');
      container.innerHTML = `
        <div class="dc-status"><span class="dc-dot"></span>executando há ${decorrido}s · ${escapeHtml(rodando.id)}</div>
        <pre>${escapeHtml(tail)}</pre>`;
      container.scrollTop = container.scrollHeight;
    } catch {
      container.innerHTML = '<div class="dc-status" style="color:var(--muted)">sem acesso ao log agora</div>';
    }
  };

  void tick();
  consoleTimer = setInterval(() => { void tick(); }, 3000);
}

function renderChat(msgs: Record<string, unknown>[]): string {
  if (!Array.isArray(msgs) || !msgs.length) return '<div class="text-zinc-500 text-sm text-center py-4">Sem mensagens</div>';
  return msgs.map(m => `
    <div class="chat-msg">
      <div class="chat-header">
        <span class="chat-author ${m.autor === 'humano' ? 'humano' : String(m.autor).startsWith('agente:') ? 'agente' : 'sistema'}">${escapeHtml(String(m.autor))}</span>
        <span class="chat-time">${String(m.criado_em || '').slice(11, 16)}</span>
        ${(m.menciona as string[] | undefined)?.length ? `<span class="chat-mentions">${(m.menciona as string[]).map(x => '@' + x.replace('agente:', '')).join(' ')}</span>` : ''}
      </div>
      <div class="chat-body">${escapeHtml(String(m.corpo))}</div>
    </div>
  `).join('');
}

/** Envia mensagem no chat do drawer */
export async function enviarMsgDrawer(): Promise<void> {
  const input = document.getElementById('drawer-chat-input') as HTMLInputElement | null;
  if (!input) return;

  const corpo = input.value.trim();
  if (!corpo || !taskAbertaId) return;

  await api('/tasks/' + taskAbertaId + '/chat', { method: 'POST', body: JSON.stringify({ autor: 'humano', corpo }) }).catch(() => undefined);
  input.value = '';

  const chat = await api<Record<string, unknown>[]>('/tasks/' + taskAbertaId + '/chat');
  const chatEl = document.getElementById('drawer-chat');
  if (chatEl) {
    chatEl.innerHTML = renderChat(chat);
    chatEl.scrollTop = chatEl.scrollHeight;
  }
}

/** Move task para outra coluna */
export async function moverTaskColuna(): Promise<void> {
  if (!taskAbertaId) return;
  const coluna = (document.getElementById('drawer-coluna') as HTMLSelectElement)?.value;
  if (!coluna) return;

  await api('/tasks/' + taskAbertaId, { method: 'PATCH', body: JSON.stringify({ coluna }) }).catch(() => undefined);
  renderTasks();
  await carregarDrawerConteudo(taskAbertaId);
}

/** Atualiza prioridade da task */
export async function atualizarTaskPrioridade(): Promise<void> {
  if (!taskAbertaId) return;
  const prioridade = (document.getElementById('drawer-prioridade') as HTMLSelectElement)?.value;
  if (!prioridade) return;

  await api('/tasks/' + taskAbertaId, { method: 'PATCH', body: JSON.stringify({ prioridade }) }).catch(() => undefined);
  renderTasks();
}

/** Atualiza responsável da task */
export async function atualizarTaskResponsavel(): Promise<void> {
  if (!taskAbertaId) return;
  const responsavel = (document.getElementById('drawer-responsavel') as HTMLInputElement)?.value;
  await api('/tasks/' + taskAbertaId, { method: 'PATCH', body: JSON.stringify({ responsavel }) }).catch(() => undefined);
  renderTasks();
}

/** Atualiza due date da task */
export async function atualizarTaskDue(): Promise<void> {
  if (!taskAbertaId) return;
  const due = (document.getElementById('drawer-due') as HTMLInputElement)?.value;
  await api('/tasks/' + taskAbertaId, { method: 'PATCH', body: JSON.stringify({ due: due || null }) }).catch(() => undefined);
}

/** Atualiza labels da task */
export async function atualizarTaskLabels(): Promise<void> {
  if (!taskAbertaId) return;
  const labels = (document.getElementById('drawer-labels') as HTMLInputElement)?.value
    .split(',').map(s => s.trim()).filter(Boolean) || [];
  await api('/tasks/' + taskAbertaId, { method: 'PATCH', body: JSON.stringify({ labels }) }).catch(() => undefined);
  renderTasks();
}

/** Atualiza descrição da task */
export async function atualizarTaskDescricao(): Promise<void> {
  if (!taskAbertaId) return;
  const descricao = (document.getElementById('drawer-descricao') as HTMLTextAreaElement)?.value || '';
  await api('/tasks/' + taskAbertaId, { method: 'PATCH', body: JSON.stringify({ descricao }) }).catch(() => undefined);
}

/** Exclui uma task (com confirmação) — por padrão a aberta no drawer; menu de
 *  contexto (right-click) passa o id do card diretamente. */
export async function excluirTask(id?: string): Promise<void> {
  const alvo = id ?? taskAbertaId;
  if (!alvo) return;
  const { modalConfirm } = await import("../modal.js");
  if (!(await modalConfirm(`Excluir a task ${escapeHtml(alvo)}? Esta ação não pode ser desfeita.`, { titulo: 'Excluir task', confirmar: 'Excluir' }))) return;

  try {
    await api('/tasks/' + alvo, { method: 'DELETE' });
    toast('Task excluída', 'ok');
    fecharDrawer();
    renderTasks();
  } catch (e) {
    toast('Erro ao excluir: ' + (e as Error).message, 'erro');
  }
}