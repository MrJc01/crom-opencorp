/**
 * View Tasks — Kanban + Drawer de detalhes.
 */

import { api, toast, icone, escapeHtml } from "../api.js";
import { getWsAtivo, setTaskAberta } from "../state.js";
import { fecharDrawer } from "../router.js";

let taskAbertaId: string | null = null;

/** Renderiza a view Tasks (Kanban) */
export async function renderTasks(): Promise<void> {
  const tasks = await api<Record<string, unknown>[]>('/tasks').catch(() => []);
  const colunasPadrao = ['backlog', 'fazendo', 'bloqueado', 'feito'];
  const extras = [...new Set(tasks.map(t => String(t.coluna)))].filter(c => !colunasPadrao.includes(c));
  const todasColunas = [...colunasPadrao, ...extras];

  const viewEl = document.getElementById('view-tasks');
  if (!viewEl) return;

  viewEl.innerHTML = `
    <div class="flex gap-2 mb-6">
      <input id="task-titulo" placeholder="Título da task — Enter cria" class="w-80" onkeydown="if(event.key==='Enter')criarTask()"/>
      <button class="btn" onclick="criarTask()">+ Criar task</button>
    </div>
    <div id="kanban" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"></div>
  `;

  const kb = document.getElementById('kanban');
  if (!kb) return;

  for (const col of todasColunas) {
    const colTasks = tasks.filter(t => String(t.coluna) === col).sort((a, b) => Number(a.pos) - Number(b.pos));
    const div = document.createElement('div');
    div.className = 'kanban-col';
    div.innerHTML = `
      <div class="kanban-header">
        <span class="kanban-title capitalize">${escapeHtml(col)}</span>
        <span class="kanban-count">${colTasks.length}</span>
      </div>
      <div class="kanban-cards" id="kanban-${escapeHtml(col)}"></div>
    `;
    kb.appendChild(div);
    const container = div.querySelector('#kanban-' + escapeHtml(col));
    if (!container) continue;

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
      card.onclick = () => abrirDrawer(String(t.id), String(t.titulo));
      container.appendChild(card);
    }
  }
}

/** Cria nova task a partir do input */
export async function criarTask(): Promise<void> {
  const input = document.getElementById('task-titulo') as HTMLInputElement | null;
  if (!input) return;
  const titulo = input.value.trim();
  if (!titulo) return;

  await api('/tasks', { method: 'POST', body: JSON.stringify({ titulo }) });
  input.value = '';
  renderTasks();
}

/** Abre drawer de detalhes da task */
export async function abrirDrawer(id: string, titulo: string): Promise<void> {
  taskAbertaId = id;
  setTaskAberta(id);
  document.getElementById('drawer-title')!.textContent = titulo;
  document.getElementById('drawer')!.classList.add('open');
  document.getElementById('drawer-overlay')!.classList.add('open');
  await carregarDrawerConteudo(id);
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
    </div>
    <div class="border-t border-zinc-800 pt-4">
      <h3 class="font-semibold mb-2 flex items-center gap-2">${icone('chat')} Chat</h3>
      <div id="drawer-chat" class="scrollbar-thin max-h-64 overflow-y-auto space-y-2 mb-4">${renderChat(chat)}</div>
    </div>
  `;
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

  await api('/tasks/' + taskAbertaId + '/chat', { method: 'POST', body: JSON.stringify({ autor: 'humano', corpo }) });
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

  await api('/tasks/' + taskAbertaId, { method: 'PATCH', body: JSON.stringify({ coluna }) });
  renderTasks();
  await carregarDrawerConteudo(taskAbertaId);
}

/** Atualiza prioridade da task */
export async function atualizarTaskPrioridade(): Promise<void> {
  if (!taskAbertaId) return;
  const prioridade = (document.getElementById('drawer-prioridade') as HTMLSelectElement)?.value;
  if (!prioridade) return;

  await api('/tasks/' + taskAbertaId, { method: 'PATCH', body: JSON.stringify({ prioridade }) });
  renderTasks();
}

/** Atualiza responsável da task */
export async function atualizarTaskResponsavel(): Promise<void> {
  if (!taskAbertaId) return;
  const responsavel = (document.getElementById('drawer-responsavel') as HTMLInputElement)?.value;
  await api('/tasks/' + taskAbertaId, { method: 'PATCH', body: JSON.stringify({ responsavel }) });
  renderTasks();
}

/** Atualiza due date da task */
export async function atualizarTaskDue(): Promise<void> {
  if (!taskAbertaId) return;
  const due = (document.getElementById('drawer-due') as HTMLInputElement)?.value;
  await api('/tasks/' + taskAbertaId, { method: 'PATCH', body: JSON.stringify({ due: due || null }) });
}

/** Atualiza labels da task */
export async function atualizarTaskLabels(): Promise<void> {
  if (!taskAbertaId) return;
  const labels = (document.getElementById('drawer-labels') as HTMLInputElement)?.value
    .split(',').map(s => s.trim()).filter(Boolean) || [];
  await api('/tasks/' + taskAbertaId, { method: 'PATCH', body: JSON.stringify({ labels }) });
  renderTasks();
}

/** Atualiza descrição da task */
export async function atualizarTaskDescricao(): Promise<void> {
  if (!taskAbertaId) return;
  const descricao = (document.getElementById('drawer-descricao') as HTMLTextAreaElement)?.value || '';
  await api('/tasks/' + taskAbertaId, { method: 'PATCH', body: JSON.stringify({ descricao }) });
}