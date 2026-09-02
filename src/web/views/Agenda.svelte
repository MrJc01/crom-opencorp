<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { api, toast } from '../api.js';
  // mantém referência direta à api para compat (api())
  import { icone } from '../icons.js';
  import { ajuda } from '../help.js';
  import { wsAtivo } from '../stores/auth.svelte';
  import { formatarAgenda, badgeTipo, formatarDataLocal } from '../format.js';
  import {
    agendaJobsStore,
    agendaCarregandoStore,
    agendaErroStore,
    agendaEscopoStore,
    carregarAgenda,
    criarAgendaStore,
    atualizarAgendaStore,
    toggleAgendaAtivoStore,
    executarAgendaAgoraStore,
    excluirAgendaStore,
    buscarAgendaPorId,
    prepararValorParaApi,
    valorParaInput,
    parseArgsString,
    type AgendaJob,
    type AgendaEscopo,
    type AgendaTipo
  } from '../stores/agenda.svelte';

  // --- estado local Svelte 5 ---
  let jobs: AgendaJob[] = $state([]);
  let carregando = $state(true);
  let erro: string | null = $state(null);
  let escopo: AgendaEscopo = $state('ws');
  let wsAtual = $state('');

  // form criação / edição
  let formNome = $state('');
  let formTipo: AgendaTipo = $state('intervalo_min');
  let formValor = $state('');
  let formArgs = $state('');
  let editingId: string | null = $state(null);
  let formSubmitting = $state(false);

  let wsUnsub: (() => void) | null = null;
  let jobsUnsub: (() => void) | null = null;
  let carregandoUnsub: (() => void) | null = null;
  let erroUnsub: (() => void) | null = null;
  let escopoUnsub: (() => void) | null = null;

  let formEl: HTMLElement | null = $state(null);

  let temJobs = $derived(jobs.length > 0);

  async function carregar() {
    carregando = true;
    erro = null;
    try {
      const lista = await carregarAgenda(escopo);
      jobs = lista;
    } catch {
      erro = 'Não foi possível carregar as rotinas.';
    } finally {
      carregando = false;
    }
  }

  function trocarEscopo(novo: AgendaEscopo) {
    escopo = novo;
    agendaEscopoStore.set(novo);
    void carregar();
  }

  async function handleCriarOuSalvar() {
    const nome = formNome.trim();
    const valorBruto = formValor.trim();
    const argsArr = parseArgsString(formArgs);
    if (!nome || !valorBruto || !argsArr.length) return;
    const agenda_valor = prepararValorParaApi(formTipo, valorBruto);
    formSubmitting = true;
    try {
      if (editingId) {
        await atualizarAgendaStore(editingId, {
          nome,
          agenda_tipo: formTipo,
          agenda_valor,
          args: argsArr,
        });
        toast('Rotina atualizada', 'ok');
        resetForm();
      } else {
        await criarAgendaStore({
          nome,
          agenda_tipo: formTipo,
          agenda_valor,
          args: argsArr,
          workspace: wsAtual || undefined,
        });
        toast('Rotina criada', 'ok');
        resetForm();
      }
      await carregar();
    } catch (e) {
      toast('Erro: ' + (e as Error).message, 'erro');
    } finally {
      formSubmitting = false;
    }
  }

  function resetForm() {
    editingId = null;
    formNome = '';
    formTipo = 'intervalo_min';
    formValor = '';
    formArgs = '';
  }

  async function handleEditar(id: string) {
    let j: AgendaJob | null = null;
    try {
      j = await buscarAgendaPorId(id);
    } catch {
      j = null;
    }
    if (!j) {
      toast('Não foi possível carregar a rotina ' + id, 'erro');
      return;
    }
    editingId = id;
    formNome = String(j.nome);
    const tipo = String(j.agenda?.tipo ?? 'intervalo_min') as AgendaTipo;
    formTipo = (['intervalo_min','cron','data_unica'] as const).includes(tipo) ? tipo : 'intervalo_min';
    formValor = valorParaInput(formTipo, String(j.agenda?.valor ?? ''));
    formArgs = (j.args as string[] || []).join(' ');
    // scroll into form
    setTimeout(() => formEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  }

  async function handleExecutarAgora(id: string) {
    try {
      const res = await executarAgendaAgoraStore(id);
      toast('Executado: ' + (res?.resultado || 'ok'), 'ok');
      await carregar();
    } catch (e) {
      toast('Erro: ' + (e as Error).message, 'erro');
    }
  }

  async function handleToggleAtivo(id: string, ativo: boolean) {
    try {
      await toggleAgendaAtivoStore(id, ativo);
      toast(ativo ? 'Pausado' : 'Retomado', 'ok');
      await carregar();
    } catch (e) {
      toast('Erro: ' + (e as Error).message, 'erro');
    }
  }

  async function handleExcluir(id: string) {
    const { modalConfirm } = await import('../modal.js');
    if (!(await modalConfirm('Excluir esta rotina?', { confirmar: 'Excluir' }))) return;
    try {
      await excluirAgendaStore(id);
      toast('Excluído', 'ok');
      // se estava editando esta, reseta
      if (editingId === id) resetForm();
      await carregar();
    } catch (e) {
      toast('Erro: ' + (e as Error).message, 'erro');
    }
  }

  function handleTipoChange(e: Event) {
    const v = (e.target as HTMLSelectElement).value as AgendaTipo;
    formTipo = v;
    // não limpa valor, deixa usuário ajustar
  }

  function handleKeydownForm(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
      // permite submit via Enter se não for textarea
    }
  }

  onMount(() => {
    wsUnsub = wsAtivo.subscribe((v) => {
      wsAtual = v;
    });
    jobsUnsub = agendaJobsStore.subscribe((v) => {
      if (v.length || !carregando) jobs = v as AgendaJob[];
      else if (!carregando && !v.length) jobs = [];
    });
    carregandoUnsub = agendaCarregandoStore.subscribe((v) => {
      // sync local only on initial; keep explicit carregando control via carregar()
    });
    erroUnsub = agendaErroStore.subscribe((v) => {
      if (v) erro = v;
    });
    escopoUnsub = agendaEscopoStore.subscribe((v) => {
      escopo = v;
    });
    void carregar();
  });

  onDestroy(() => {
    wsUnsub?.();
    jobsUnsub?.();
    carregandoUnsub?.();
    erroUnsub?.();
    escopoUnsub?.();
  });

  // helpers de render agenda
  function badgeClasseTipo(tipo: string): string {
    return badgeTipo(String(tipo));
  }
</script>

<div class="page-header">
  <div class="page-header-esq">
    <h1 class="page-header-titulo">{@html icone('agenda')} Agenda</h1>
    <p class="page-header-sub">Rotinas · cron / intervalo / data única</p>
  </div>
  <div class="page-header-acoes">
    <span class="help-wrap">{@html ajuda('agenda')}</span>
    <div class="flex items-center gap-1 rounded-lg border border-zinc-700 p-1" role="group" aria-label="Escopo da agenda">
      <button
        id="agenda-escopo-ws"
        class="btn text-xs {escopo === 'ws' ? 'btn-primary' : 'btn-ghost'}"
        onclick={() => trocarEscopo('ws')}
        aria-pressed={escopo === 'ws'}
      >só {wsAtual || 'esta empresa'}</button>
      <button
        id="agenda-escopo-todas"
        class="btn text-xs {escopo === 'todas' ? 'btn-primary' : 'btn-ghost'}"
        onclick={() => trocarEscopo('todas')}
        aria-pressed={escopo === 'todas'}
      >todas as empresas</button>
    </div>
  </div>
</div>

<div id="agenda-status" class="card p-4 mb-6 bg-base-100 border border-base-300">
  <div class="flex items-start gap-3">
    <div class="flex-1">
      <p class="text-sm text-zinc-400">O daemon do scheduler executa os jobs a cada 30s. {@html ajuda('scheduler')}</p>
      <p class="text-sm text-zinc-400 mt-1">Inicie com: <code class="font-mono bg-zinc-800 px-1.5 py-0.5 rounded">opencorp scheduler start</code></p>
    </div>
  </div>
</div>

<div id="agenda-lista" class="space-y-4">
  {#if carregando && jobs.length === 0}
    <div class="empty-state estado-loading" role="status" aria-live="polite">
      <div class="empty-icon">{@html icone('history')}</div>
      <div class="empty-title">Carregando…</div>
    </div>
  {:else if erro}
    <div class="empty-state estado-erro" role="alert">
      <div class="empty-icon">{@html icone('close')}</div>
      <div class="empty-title">Algo deu errado</div>
      <div class="empty-desc">{erro}</div>
      <div class="empty-acao"><button class="btn btn-ghost" onclick={carregar}>{@html icone('run')} Tentar novamente</button></div>
    </div>
  {:else if !temJobs}
    <div class="empty-state">
      <div class="empty-icon">{@html icone('agenda')}</div>
      <div class="empty-title">{escopo === 'todas' ? 'Nenhuma rotina agendada em nenhuma empresa' : 'Nenhuma rotina nesta empresa'}</div>
      <div class="empty-desc">A empresa opera sozinha quando você agenda a primeira rotina.</div>
    </div>
  {:else}
    {#each jobs as j (String(j.id))}
      <div class="card p-4 bg-base-100 border border-base-300">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1 flex-wrap">
              <span class="font-medium truncate">{String(j.nome)}</span>
              <span class="badge {badgeClasseTipo(String(j.agenda?.tipo))} badge-sm">{String(j.agenda?.tipo)}</span>
              <span class="badge {j.ativo ? 'badge-ok' : 'badge-neutral'} badge-sm">{j.ativo ? 'ativo' : 'pausado'}</span>
            </div>
            <div class="text-sm text-zinc-400 mb-1">{@html formatarAgenda(j as any)}</div>
            <div class="text-xs text-zinc-500 font-mono truncate">{(j.args as string[] || []).join(' ')}</div>
            <div class="text-xs text-zinc-500 font-mono mt-1">workspace: {String(j.workspace)}</div>
            {#if j.proxima_exec}
              <div class="text-xs text-zinc-500 font-mono mt-1">próxima: {formatarDataLocal(String(j.proxima_exec))}</div>
            {/if}
            {#if j.ultima_exec}
              <div class="text-xs text-zinc-500 font-mono">última: {formatarDataLocal(String(j.ultima_exec))}</div>
            {:else}
              <div class="text-xs mt-1" style="color:var(--warn)">⚠ nunca rodou</div>
            {/if}
          </div>
          <div class="flex items-center gap-2 flex-shrink-0 flex-wrap">
            <button class="btn btn-ghost btn-sm" onclick={() => handleExecutarAgora(String(j.id))} aria-label="Executar agora">{@html icone('run')} Agora</button>
            <button class="btn btn-ghost btn-sm" onclick={() => handleEditar(String(j.id))} aria-label="Editar">{@html icone('gear')} Editar</button>
            <button class="btn btn-ghost btn-sm" onclick={() => handleToggleAtivo(String(j.id), Boolean(j.ativo))} aria-label={j.ativo ? 'Pausar' : 'Retomar'}>{#if j.ativo}{@html icone('pause')} Pausar{:else}{@html icone('run')} Retomar{/if}</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--err)" onclick={() => handleExcluir(String(j.id))} aria-label="Excluir">{@html icone('trash')}</button>
          </div>
        </div>
      </div>
    {/each}
  {/if}
</div>

<div class="card p-4 mt-6 bg-base-100 border border-base-300" id="agenda-form" bind:this={formEl}>
  <h3 class="font-semibold mb-3 flex items-center gap-2">
    {#if editingId}
      {@html icone('gear')} Editar rotina <span class="font-mono text-xs text-zinc-500">{editingId}</span>
    {:else}
      {@html icone('plus')} Nova rotina {@html ajuda('agenda')}
    {/if}
  </h3>
  <form id={editingId ? 'form-editar-agenda' : 'form-nova-agenda'} class="space-y-4" onsubmit={(e)=>{ e.preventDefault(); void handleCriarOuSalvar(); }} onkeydown={handleKeydownForm}>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label class="block text-xs text-zinc-500 mb-1" for={editingId ? 'agenda-edit-nome' : 'agenda-nome'}>Nome</label>
        <input id={editingId ? 'agenda-edit-nome' : 'agenda-nome'} class="input input-bordered w-full" required placeholder="Ex: checar-fila" bind:value={formNome} />
      </div>
      <div>
        <label class="block text-xs text-zinc-500 mb-1" for={editingId ? 'agenda-edit-tipo' : 'agenda-tipo'}>Tipo</label>
        <select id={editingId ? 'agenda-edit-tipo' : 'agenda-tipo'} class="select select-bordered w-full" bind:value={formTipo} onchange={handleTipoChange}>
          <option value="intervalo_min">Intervalo (minutos)</option>
          <option value="cron">Cron (5 campos)</option>
          <option value="data_unica">Data única</option>
        </select>
      </div>
    </div>
    <div id={editingId ? 'agenda-edit-valor-container' : 'agenda-valor-container'}>
      {#if formTipo === 'intervalo_min'}
        <label class="block text-xs text-zinc-500 mb-1" for={editingId ? 'agenda-edit-valor' : 'agenda-valor'}>Valor (minutos)</label>
        <input id={editingId ? 'agenda-edit-valor' : 'agenda-valor'} class="input input-bordered w-full" type="number" min="1" placeholder="Ex: 30" required bind:value={formValor} />
      {:else if formTipo === 'cron'}
        <label class="block text-xs text-zinc-500 mb-1" for={editingId ? 'agenda-edit-valor' : 'agenda-valor'}>Expressão cron</label>
        <input id={editingId ? 'agenda-edit-valor' : 'agenda-valor'} class="input input-bordered w-full" type="text" placeholder="*/5 * * * *" required bind:value={formValor} />
      {:else if formTipo === 'data_unica'}
        <label class="block text-xs text-zinc-500 mb-1" for={editingId ? 'agenda-edit-valor' : 'agenda-valor'}>Data/hora (ISO)</label>
        <input id={editingId ? 'agenda-edit-valor' : 'agenda-valor'} class="input input-bordered w-full" type="datetime-local" required bind:value={formValor} />
      {/if}
    </div>
    <div>
      <label class="block text-xs text-zinc-500 mb-1" for={editingId ? 'agenda-edit-args' : 'agenda-args'}>Comando (args)</label>
      <input id={editingId ? 'agenda-edit-args' : 'agenda-args'} class="input input-bordered w-full" placeholder='task create --titulo "Checar fila"' required bind:value={formArgs} />
    </div>
    <div class="flex gap-2">
      <button type="submit" class="btn btn-primary" disabled={formSubmitting}>
        {#if editingId}
          {@html icone('check')} Salvar
        {:else}
          {@html icone('plus')} Criar
        {/if}
      </button>
      <button type="button" class="btn btn-ghost" onclick={resetForm}>Cancelar</button>
    </div>
  </form>
</div>

<style>
  .page-header { display:flex; justify-content:space-between; align-items:flex-start; gap:.75rem; margin-bottom:1rem; flex-wrap:wrap; }
  .page-header-titulo { font-size:1.5rem; font-weight:700; display:flex; align-items:center; gap:.5rem; }
  .page-header-sub { font-size:.8125rem; color:var(--muted); margin-top:.2rem; }
</style>
