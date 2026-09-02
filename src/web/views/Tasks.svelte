<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { api, toast } from '../api.js';
  import { escapeHtml } from '../format.js';
  import { icone } from '../icons.js';
  import { ajuda } from '../help.js';
  import { wsAtivo } from '../stores/auth.svelte';
  import {
    tasksStore,
    carregandoStore,
    erroStore,
    COLUNAS_PADRAO,
    AJUDA_COLUNA,
    colunasDe,
    tarefasPorColuna,
    carregarTasks,
    criarTaskStore,
    moverTaskColunaStore,
  } from '../stores/tasks.svelte';

  type Task = Record<string, unknown>;
  type ChatMsg = Record<string, unknown>;

  // --- estado local Svelte 5 (runes) ---
  let tasks = $state<Task[]>([]);
  let carregando = $state(true);
  let erro: string | null = $state(null);
  let novoTitulo = $state('');
  let dragId: string | null = $state(null);
  let dragOverColuna: string | null = $state(null);
  let arrastouAgora = $state(false);

  // drawer
  let drawerOpen = $state(false);
  let taskAbertaId: string | null = $state(null);
  let taskAbertaTitulo = $state('');
  let drawerTask: Task | null = $state(null);
  let drawerChat: ChatMsg[] = $state([]);
  let drawerColunas: string[] = $state([...COLUNAS_PADRAO]);
  let chatInput = $state('');
  let drawerLoading = $state(false);
  let consoleLog = $state('verificando…');
  let consoleStatus = $state('verificando…');
  let consoleDecor = $state(0);
  let wsAtual = $state('');

  // derive
  let colunas = $derived(colunasDe(tasks as any));
  let temTasks = $derived(tasks.length > 0);

  let wsUnsub: (() => void) | null = null;
  let tasksUnsub: (() => void) | null = null;
  let carregandoUnsub: (() => void) | null = null;
  let erroUnsub: (() => void) | null = null;
  let consoleTimer: ReturnType<typeof setInterval> | null = null;

  function ajudaKanban(col: string): string {
    return ajuda('kanban-' + col, AJUDA_COLUNA[col] ?? '');
  }

  async function carregar() {
    carregando = true;
    erro = null;
    try {
      const data = await api<Task[]>('/tasks');
      tasks = Array.isArray(data) ? data : [];
      tasksStore.set(tasks as any);
    } catch {
      erro = 'Não foi possível carregar o task board.';
      erroStore.set(erro);
    } finally {
      carregando = false;
      carregandoStore.set(false);
    }
  }

  async function handleCriarTask() {
    const t = novoTitulo.trim();
    if (!t) return;
    try {
      await api('/tasks', { method: 'POST', body: JSON.stringify({ titulo: t }) });
      novoTitulo = '';
      await carregar();
    } catch {
      // mantém texto digitado em caso de falha
    }
  }

  function handleKeydownCriar(e: KeyboardEvent) {
    if (e.key === 'Enter') handleCriarTask();
  }

  async function moverTaskColunaDireto(id: string, coluna: string) {
    // otimista local
    tasks = tasks.map((t) => (String(t.id) === id ? { ...t, coluna } : t));
    try {
      await api('/tasks/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ coluna }) });
    } catch {}
    await carregar();
  }

  // drag handlers
  function onDragStart(e: DragEvent, id: string) {
    dragId = id;
    arrastouAgora = false;
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', id);
      e.dataTransfer.effectAllowed = 'move';
    }
    (e.currentTarget as HTMLElement).classList.add('arrastando');
  }
  function onDragEnd(e: DragEvent) {
    (e.currentTarget as HTMLElement).classList.remove('arrastando');
    arrastouAgora = true;
    setTimeout(() => (arrastouAgora = false), 150);
    dragId = null;
    dragOverColuna = null;
  }
  function onDragOver(e: DragEvent, col: string) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    dragOverColuna = col;
  }
  function onDragLeave(e: DragEvent, col: string) {
    // só limpa se sair do container
    const related = e.relatedTarget as Node | null;
    const target = e.currentTarget as HTMLElement;
    if (!related || !target.contains(related)) {
      if (dragOverColuna === col) dragOverColuna = null;
    }
  }
  async function onDrop(e: DragEvent, coluna: string) {
    e.preventDefault();
    dragOverColuna = null;
    const tid = e.dataTransfer?.getData('text/plain') || dragId;
    if (!tid) return;
    const card = tasks.find((t) => String(t.id) === tid);
    if (!card || String(card.coluna) === coluna) return;
    await moverTaskColunaDireto(tid, coluna);
  }

  function abrirDrawer(id: string, titulo: string) {
    if (arrastouAgora) return;
    taskAbertaId = id;
    taskAbertaTitulo = titulo;
    drawerOpen = true;
    // fechar chat lateral se houver (compat com router.ts)
    try { (window as any).fecharChatLateral?.(); } catch {}
    document.getElementById('drawer')?.classList.add('open');
    void carregarDrawerConteudo(id);
  }

  function fecharDrawerLocal() {
    drawerOpen = false;
    taskAbertaId = null;
    drawerTask = null;
    drawerChat = [];
    consoleLog = 'verificando…';
    if (consoleTimer) { clearInterval(consoleTimer); consoleTimer = null; }
    document.getElementById('drawer')?.classList.remove('open');
    document.getElementById('drawer-overlay')?.classList.remove('open');
    // também limpa via ids legados
    document.getElementById('drawer-content')?.replaceChildren();
  }

  async function carregarDrawerConteudo(id: string) {
    drawerLoading = true;
    try {
      const [task, chat, colunasExtras] = await Promise.all([
        api<Task>('/tasks/' + encodeURIComponent(id)).catch(() => null),
        api<ChatMsg[]>('/tasks/' + encodeURIComponent(id) + '/chat').catch(() => []),
        api<string[]>('/tasks/colunas').catch(() => []),
      ]);
      if (!task) { fecharDrawerLocal(); return; }
      drawerTask = task;
      drawerChat = Array.isArray(chat) ? chat : [];
      drawerColunas = [...COLUNAS_PADRAO, ...new Set(colunasExtras as string[])];
      // sync stores legacy compat
      try { const { setTaskAberta } = await import('../state.js'); setTaskAberta(id); } catch {}
      const responsavel = String((task as any).responsavel || '').replace(/^agente:/, '');
      if (responsavel) iniciarConsoleAoVivo(responsavel);
      else { consoleStatus = 'nenhuma execução ativa deste agente agora'; consoleLog = ''; }
    } finally {
      drawerLoading = false;
    }
  }

  function iniciarConsoleAoVivo(agente: string) {
    if (consoleTimer) { clearInterval(consoleTimer); consoleTimer = null; }
    const tick = async () => {
      if (!drawerOpen) { if (consoleTimer) { clearInterval(consoleTimer); consoleTimer = null; } return; }
      try {
        const execs = await api<Array<{ id: string; agente?: string; status: string; inicio?: string }>>(
          '/sessions?agent=' + encodeURIComponent(agente)
        ).catch(() => []);
        const rodando = (execs ?? []).find((e) => e.status === 'executando');
        if (!rodando) {
          consoleStatus = 'nenhuma execução ativa deste agente agora';
          consoleLog = '';
          return;
        }
        const inicioMs = rodando.inicio ? Date.parse(rodando.inicio) : 0;
        const decorrido = inicioMs ? Math.max(1, Math.round((Date.now() - inicioMs) / 1000)) : 0;
        consoleDecor = decorrido;
        consoleStatus = `executando há ${decorrido}s · ${rodando.id}`;
        const { log } = await api<{ log: string }>('/sessions/' + encodeURIComponent(rodando.id) + '/log');
        consoleLog = (log || '').split('\n').slice(-22).join('\n');
      } catch {
        consoleStatus = 'sem acesso ao log agora';
      }
    };
    void tick();
    consoleTimer = setInterval(() => { void tick(); }, 3000);
  }

  async function enviarMsgDrawer() {
    if (!taskAbertaId) return;
    const corpo = chatInput.trim();
    if (!corpo) return;
    await api('/tasks/' + encodeURIComponent(taskAbertaId) + '/chat', {
      method: 'POST',
      body: JSON.stringify({ autor: 'humano', corpo }),
    }).catch(() => undefined);
    chatInput = '';
    const chat = await api<ChatMsg[]>('/tasks/' + encodeURIComponent(taskAbertaId) + '/chat').catch(() => []);
    drawerChat = Array.isArray(chat) ? chat : [];
  }

  async function moverTaskColuna() {
    if (!taskAbertaId || !drawerTask) return;
    const sel = document.getElementById('drawer-coluna') as HTMLSelectElement | null;
    const coluna = sel?.value;
    if (!coluna) return;
    await api('/tasks/' + encodeURIComponent(taskAbertaId), { method: 'PATCH', body: JSON.stringify({ coluna }) }).catch(() => undefined);
    await carregar();
    if (taskAbertaId) await carregarDrawerConteudo(taskAbertaId);
  }

  async function atualizarTaskPrioridade() {
    if (!taskAbertaId) return;
    const prioridade = (document.getElementById('drawer-prioridade') as HTMLSelectElement)?.value;
    if (!prioridade) return;
    await api('/tasks/' + encodeURIComponent(taskAbertaId), { method: 'PATCH', body: JSON.stringify({ prioridade }) }).catch(() => undefined);
    await carregar();
  }
  async function atualizarTaskResponsavel() {
    if (!taskAbertaId) return;
    const responsavel = (document.getElementById('drawer-responsavel') as HTMLInputElement)?.value;
    await api('/tasks/' + encodeURIComponent(taskAbertaId), { method: 'PATCH', body: JSON.stringify({ responsavel }) }).catch(() => undefined);
    await carregar();
  }
  async function atualizarTaskDue() {
    if (!taskAbertaId) return;
    const due = (document.getElementById('drawer-due') as HTMLInputElement)?.value;
    await api('/tasks/' + encodeURIComponent(taskAbertaId), { method: 'PATCH', body: JSON.stringify({ due: due || null }) }).catch(() => undefined);
  }
  async function atualizarTaskLabels() {
    if (!taskAbertaId) return;
    const labels = (document.getElementById('drawer-labels') as HTMLInputElement)?.value.split(',').map(s=>s.trim()).filter(Boolean) || [];
    await api('/tasks/' + encodeURIComponent(taskAbertaId), { method: 'PATCH', body: JSON.stringify({ labels }) }).catch(() => undefined);
    await carregar();
  }
  async function atualizarTaskDescricao() {
    if (!taskAbertaId) return;
    const descricao = (document.getElementById('drawer-descricao') as HTMLTextAreaElement)?.value || '';
    await api('/tasks/' + encodeURIComponent(taskAbertaId), { method: 'PATCH', body: JSON.stringify({ descricao }) }).catch(() => undefined);
  }

  async function excluirTask(id?: string) {
    const alvo = id ?? taskAbertaId;
    if (!alvo) return;
    const { modalConfirm } = await import('../modal.js');
    if (!(await modalConfirm(`Excluir a task ${escapeHtml(alvo)}? Esta ação não pode ser desfeita.`, { titulo: 'Excluir task', confirmar: 'Excluir' }))) return;
    try {
      await api('/tasks/' + encodeURIComponent(alvo), { method: 'DELETE' });
      toast('Task excluída', 'ok');
      fecharDrawerLocal();
      await carregar();
    } catch (e) {
      toast('Erro ao excluir: ' + (e as Error).message, 'erro');
    }
  }

  function onKeyDownDrawer(e: KeyboardEvent) {
    if (e.key === 'Escape' && drawerOpen) fecharDrawerLocal();
  }

  onMount(() => {
    carregar();
    // subscreve wsAtivo (stores) — requisito "Use os stores"
    wsUnsub = wsAtivo.subscribe((v) => {
      wsAtual = v;
      // recarrega quando workspace muda (evita piscar no primeiro subscribe com valor inicial)
    });
    // escuta mudança real de ws via store antiga também (compat)
    let lastWs = wsAtual;
    const intervalWsCheck = setInterval(() => {
      const cur = localStorage.getItem('oc-ws') || '';
      if (cur !== lastWs) { lastWs = cur; carregar(); }
    }, 2000);

    // keeper para sync com tasksStore (se outra view atualizar)
    tasksUnsub = tasksStore.subscribe((v) => {
      if (v.length && !carregando) tasks = v as any;
    });
    carregandoUnsub = carregandoStore.subscribe((v) => {});
    erroUnsub = erroStore.subscribe((v) => {});

    document.addEventListener('keydown', onKeyDownDrawer);
    return () => {
      clearInterval(intervalWsCheck);
      document.removeEventListener('keydown', onKeyDownDrawer);
    };
  });

  onDestroy(() => {
    wsUnsub?.();
    tasksUnsub?.();
    carregandoUnsub?.();
    erroUnsub?.();
    if (consoleTimer) clearInterval(consoleTimer);
  });

  // helpers de render
  function tasksDaColuna(col: string): Task[] {
    return tarefasPorColuna(tasks as any, col) as any;
  }
  function isBloqueada(t: Task): boolean {
    return (t.bloqueada as boolean) === true || ((t.bloqueado_por as string[] | undefined)?.length ?? 0) > 0;
  }
</script>

<div class="page-header">
  <div class="page-header-esq">
    <h1 class="page-header-titulo">{@html icone('tasks')} Tasks</h1>
    <p class="page-header-sub">Kanban · backlog → fazendo → bloqueado → feito</p>
  </div>
  <div class="page-header-acoes">
    <input
      id="task-titulo"
      placeholder="Título da task — Enter cria"
      class="input input-bordered flex-1 min-w-0 max-w-80"
      bind:value={novoTitulo}
      onkeydown={handleKeydownCriar}
      aria-label="Título da nova task"
    />
    <button class="btn" onclick={handleCriarTask}>+ Criar task</button>
    <span class="help-wrap">{@html ajuda('tasks')}</span>
  </div>
</div>

{#if carregando && tasks.length === 0}
  <div class="empty-state estado-loading" role="status" aria-live="polite">
    <div class="empty-icon">{@html icone('history')}</div>
    <div class="empty-title">Carregando tasks…</div>
  </div>
{:else if erro}
  <div class="empty-state estado-erro" role="alert">
    <div class="empty-icon">{@html icone('close')}</div>
    <div class="empty-title">Algo deu errado</div>
    <div class="empty-desc">{erro}</div>
    <div class="empty-acao"><button class="btn btn-ghost" onclick={carregar}>{@html icone('run')} Tentar novamente</button></div>
  </div>
{:else if !temTasks}
  <div class="empty-state">
    <div class="empty-icon">{@html icone('tasks')}</div>
    <div class="empty-title">Nenhuma task na empresa</div>
    <div class="empty-desc">Crie a primeira no campo acima — os agentes assumem tasks do board automaticamente conforme a rotina.</div>
  </div>
{:else}
  <div id="kanban" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    {#each colunas as col (col)}
      {@const lista = tasksDaColuna(col)}
      <div class="kanban-col">
        <div class="kanban-header">
          <span class="kanban-title capitalize">{col}{@html (AJUDA_COLUNA[col] ? ajudaKanban(col) : '')}</span>
          <span class="kanban-count">{lista.length}</span>
        </div>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="kanban-cards scrollbar-thin"
          class:drag-over={dragOverColuna === col}
          ondragover={(e)=>onDragOver(e, col)}
          ondragleave={(e)=>onDragLeave(e, col)}
          ondrop={(e)=>onDrop(e, col)}
        >
          {#each lista as t (String(t.id))}
            {@const bloqueada = isBloqueada(t)}
            {@const prio = String(t.prioridade ?? 'media')}
            {@const prioClass = prio === 'alta' ? 'alta' : prio === 'baixa' ? 'baixa' : 'media'}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="task-card"
              class:locked={bloqueada}
              draggable="true"
              data-task-id={String(t.id)}
              onclick={()=> abrirDrawer(String(t.id), String(t.titulo))}
              ondragstart={(e)=>onDragStart(e, String(t.id))}
              ondragend={onDragEnd}
            >
              <div class="task-title">{String(t.titulo)}</div>
              <div class="task-meta">
                <span class="font-mono">{String(t.responsavel || '—')}</span>
                {#if prio !== 'media'}
                  <span class="task-priority {prioClass}">{prio}</span>
                {/if}
                {#each ((t.labels as string[]) ?? []) as label}
                  <span class="badge badge-neutral">{label}</span>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>
{/if}

{#if drawerOpen}
  <!-- overlay -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="drawer-overlay open" onclick={fecharDrawerLocal}></div>
  <div class="drawer open" role="dialog" aria-modal="true" aria-label="Detalhes da task">
    <div class="drawer-header">
      <span class="drawer-title">{taskAbertaTitulo}</span>
      <button class="drawer-close" onclick={fecharDrawerLocal} aria-label="Fechar">{@html icone('close')}</button>
    </div>
    <div class="drawer-content" id="drawer-content">
      {#if drawerLoading}
        <div class="empty-state estado-loading"><div class="empty-icon">{@html icone('history')}</div><div class="empty-title">Carregando…</div></div>
      {:else if drawerTask}
        <div class="space-y-4">
          <div class="task-detail-field">
            <span class="task-detail-label">ID</span>
            <span class="task-detail-value mono">{String(drawerTask.id)}</span>
          </div>
          <div class="task-detail-field">
            <span class="task-detail-label">Coluna</span>
            <select id="drawer-coluna" class="select select-bordered w-full" value={String(drawerTask.coluna)} onchange={moverTaskColuna}>
              {#each drawerColunas as c}
                <option value={c} selected={c === String(drawerTask.coluna)}>{c}</option>
              {/each}
            </select>
          </div>
          <div class="task-detail-field">
            <span class="task-detail-label">Prioridade</span>
            <select id="drawer-prioridade" class="select select-bordered w-full" value={String(drawerTask.prioridade ?? 'media')} onchange={atualizarTaskPrioridade}>
              <option value="baixa" selected={String(drawerTask.prioridade)==='baixa'}>Baixa</option>
              <option value="media" selected={String(drawerTask.prioridade)==='media'}>Média</option>
              <option value="alta" selected={String(drawerTask.prioridade)==='alta'}>Alta</option>
            </select>
          </div>
          <div class="task-detail-field">
            <span class="task-detail-label">Responsável</span>
            <input id="drawer-responsavel" class="input input-bordered w-full" value={String(drawerTask.responsavel || '')} onblur={atualizarTaskResponsavel} />
          </div>
          <div class="task-detail-field">
            <span class="task-detail-label">Due</span>
            <input id="drawer-due" type="date" class="input input-bordered w-full" value={drawerTask.due ? String(drawerTask.due).slice(0,10) : ''} onchange={atualizarTaskDue} />
          </div>
          <div class="task-detail-field">
            <span class="task-detail-label">Labels</span>
            <input id="drawer-labels" class="input input-bordered w-full" value={((drawerTask.labels as string[] | undefined) || []).join(', ')} onblur={atualizarTaskLabels} />
          </div>
          <div class="task-detail-field">
            <span class="task-detail-label">Bloqueada por</span>
            <span class="task-detail-value mono">{((drawerTask.bloqueado_por as string[] | undefined) || []).join(', ') || '—'}</span>
          </div>
          <div class="task-detail-field">
            <span class="task-detail-label">Lock</span>
            <span class="task-detail-value">
              {#if (drawerTask.bloqueada === true) || ((drawerTask.bloqueado_por as string[] | undefined)?.length ?? 0) > 0}
                <span class="badge badge-err">BLOQUEADA</span>
              {:else}
                <span class="badge badge-ok">Livre</span>
              {/if}
            </span>
          </div>
          <div class="task-detail-field">
            <span class="task-detail-label">Descrição</span>
            <textarea id="drawer-descricao" class="textarea textarea-bordered w-full" rows={3} onblur={atualizarTaskDescricao}>{String(drawerTask.descricao || '')}</textarea>
          </div>
          <div class="flex justify-end pt-1 border-t border-zinc-800 mt-2">
            <button class="btn btn-ghost text-error" onclick={()=>excluirTask()}>{@html icone('trash')} Excluir task</button>
          </div>
        </div>

        <div class="border-t border-zinc-800 pt-4">
          <h3 class="font-semibold mb-2 flex items-center gap-2">{@html icone('chat')} Chat</h3>
          <div id="drawer-chat" class="scrollbar-thin max-h-64 overflow-y-auto space-y-2 mb-4">
            {#if drawerChat.length === 0}
              <div class="text-zinc-500 text-sm text-center py-4">Sem mensagens</div>
            {:else}
              {#each drawerChat as m}
                {@const autor = String(m.autor)}
                {@const isHumano = autor === 'humano'}
                {@const isAgente = autor.startsWith('agente:')}
                <div class="chat-msg">
                  <div class="chat-header">
                    <span class="chat-author {isHumano ? 'humano' : isAgente ? 'agente' : 'sistema'}">{autor}</span>
                    <span class="chat-time">{String(m.criado_em || '').slice(11,16)}</span>
                    {#if ((m.menciona as string[] | undefined)?.length)}
                      <span class="chat-mentions">{(m.menciona as string[]).map((x)=>'@'+x.replace('agente:','')).join(' ')}</span>
                    {/if}
                  </div>
                  <div class="chat-body">{String(m.corpo)}</div>
                </div>
              {/each}
            {/if}
          </div>
          <div class="chat-input-area">
            <input id="drawer-chat-input" class="input input-bordered flex-1" placeholder="Mensagem — Enter envia" bind:value={chatInput} onkeydown={(e)=>{ if(e.key==='Enter') enviarMsgDrawer(); }} />
            <button class="btn" onclick={enviarMsgDrawer}>Enviar</button>
          </div>
        </div>

        <div id="drawer-console-wrap" class="border-t border-zinc-800 pt-4">
          <h3 class="font-semibold mb-2 flex items-center gap-2">{@html icone('run')} Execução ao vivo</h3>
          <div id="drawer-console" class="drawer-console">
            <div class="dc-status"><span class="dc-dot"></span>{consoleStatus}</div>
            <pre>{consoleLog}</pre>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* usa Tailwind/DaisyUI global; nada extra — classes legacy já definidas em app.css/legacy.css */
  .drag-over {
    outline: 2px dashed var(--accent);
    outline-offset: -4px;
    border-radius: 0.375rem;
  }
</style>
