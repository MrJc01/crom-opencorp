<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { api, toast } from '../api.js';
  import { icone } from '../icons.js';
  import { ajuda } from '../help.js';
  import { wsAtivo } from '../stores/auth.svelte';
  import {
    agentesStore,
    carregandoStore,
    erroStore,
    badgeCategoria,
    rotuloPermissao,
    isSistema,
    filtrarAtivos,
    filtrarDesativados,
    validarIdAgente,
    montarPayloadAgenteSalvar,
    carregarAgentes,
    toggleAgenteAtivoStore,
    semearCatalogoStore,
    chamarAgenteStore,
    carregarAgenteDetalhe,
    salvarAgenteStore,
    criarAgenteStore,
    excluirAgenteStore,
    type AgenteResumo,
  } from '../stores/agentes.svelte.js';

  // compat: mantém referência direta à api para casos que exigem raw api()
  void api;

  // ── estado local Svelte 5 ──────────────────────────────────────────────
  let agentes: AgenteResumo[] = $state([]);
  let carregando = $state(true);
  let erro: string | null = $state(null);
  let wsAtual = $state('');

  // semear
  let semeando = $state(false);

  // criar form (clone)
  let formMostrando = $state(false);
  let novoId = $state('');
  let novoFrom = $state('executor-padrao');
  let novoModel = $state('');

  // drawer edição
  let drawerOpen = $state(false);
  let agenteEditId: string | null = $state(null);
  let drawerLoading = $state(false);
  let editRole = $state('');
  let editModel = $state('');
  let editPermissions = $state('level-1');
  let editTools = $state('');
  let editBudget = $state('0');
  let editTurns = $state('20');
  let salvando = $state(false);

  // toggle loading por id
  let toggling = $state<Set<string>>(new Set());

  let ativos = $derived(filtrarAtivos(agentes));
  let desativados = $derived(filtrarDesativados(agentes));
  let temAgentes = $derived(agentes.length > 0);

  let unsubs: Array<() => void> = [];
  let wsCheckInterval: ReturnType<typeof setInterval> | null = null;

  // ── carregamento ───────────────────────────────────────────────────────
  async function carregar() {
    carregando = true;
    erro = null;
    try {
      const lista = await carregarAgentes();
      agentes = lista;
    } catch {
      erro = 'Não foi possível carregar os agentes.';
      agentes = [];
    } finally {
      carregando = false;
    }
  }

  async function handleToggle(id: string, checked: boolean) {
    if (isSistema(id)) return;
    toggling = new Set([...toggling, id]);
    try {
      await toggleAgenteAtivoStore(id, checked);
      agentes = [...agentes.map((a) => (a.id === id ? { ...a, ativo: checked } : a))];
      // reconcilia com servidor
      await carregar();
      toast(`Agente "${id}" ${checked ? 'ativado' : 'desativado'}`, 'ok');
    } catch (e) {
      toast('Erro: ' + (e as Error).message, 'erro');
    } finally {
      const next = new Set(toggling);
      next.delete(id);
      toggling = next;
    }
  }

  async function handleSemear() {
    semeando = true;
    try {
      const r = await semearCatalogoStore();
      toast(`Catálogo semeado: ${r.criados.length} criado(s), ${r.existentes.length} já existente(s)`, 'ok');
      await carregar();
    } catch (e) {
      toast('Erro: ' + (e as Error).message, 'erro');
    } finally {
      semeando = false;
    }
  }

  async function handleChamar(id: string) {
    const { modalPrompt } = await import('../modal.js');
    const ordem = await modalPrompt({
      titulo: 'Chamar ' + id,
      label: 'Ordem para o agente:',
      multiline: true,
      obrigatorio: true,
    });
    if (!ordem) return;
    try {
      await chamarAgenteStore(id, ordem);
      toast(`"${id}" executando — acompanhe no Histórico`, 'ok');
    } catch (e) {
      toast('Erro: ' + (e as Error).message, 'erro');
    }
  }

  async function handleEditar(id: string) {
    drawerOpen = true;
    agenteEditId = id;
    drawerLoading = true;
    editRole = '';
    editModel = '';
    editPermissions = 'level-1';
    editTools = '';
    editBudget = '0';
    editTurns = '20';
    // compat com router drawer global
    document.getElementById('drawer')?.classList.add('open');
    document.getElementById('drawer-overlay')?.classList.add('open');
    try {
      const a = await carregarAgenteDetalhe(id);
      if (!a) {
        toast('Não foi possível carregar o agente ' + id, 'erro');
        fecharDrawer();
        return;
      }
      const budget = (a.budget as { daily_usd?: number; max_turns?: number }) || {};
      editRole = String(a.role ?? '');
      editModel = String(a.model ?? '');
      editPermissions = String(a.permissions ?? 'level-1');
      editTools = ((a.tools as string[]) || []).join(', ');
      editBudget = String(budget.daily_usd ?? 0);
      editTurns = String(budget.max_turns ?? 20);
      // compat: abre drawer legado via router
      try {
        const { abrirDrawer } = await import('../router.js');
        // evita conflito: usamos nosso drawer; ainda registra id aberto
        void abrirDrawer;
      } catch {}
    } catch {
      toast('Não foi possível carregar o agente ' + id, 'erro');
      fecharDrawer();
    } finally {
      drawerLoading = false;
    }
  }

  function fecharDrawer() {
    drawerOpen = false;
    agenteEditId = null;
    drawerLoading = false;
    document.getElementById('drawer')?.classList.remove('open');
    document.getElementById('drawer-overlay')?.classList.remove('open');
    document.getElementById('drawer-content')?.replaceChildren();
  }

  async function handleSalvarAgente() {
    if (!agenteEditId) return;
    salvando = true;
    const patch = montarPayloadAgenteSalvar(editRole, editModel, editPermissions, editTools, Number(editBudget), Number(editTurns));
    try {
      await salvarAgenteStore(agenteEditId, patch);
      toast(`Agente "${agenteEditId}" salvo`, 'ok');
      fecharDrawer();
      await carregar();
    } catch (e) {
      toast('Erro ao salvar: ' + (e as Error).message, 'erro');
    } finally {
      salvando = false;
    }
  }

  function abrirForm() {
    formMostrando = true;
    // scroll suave para form
    setTimeout(() => document.getElementById('agente-form')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  }

  function fecharForm() {
    formMostrando = false;
    novoId = '';
    novoFrom = 'executor-padrao';
    novoModel = '';
  }

  async function handleCriar() {
    const id = novoId.trim().toLowerCase();
    const from = novoFrom.trim() || 'executor-padrao';
    const model = novoModel.trim();
    if (!id) return;
    if (!validarIdAgente(id)) {
      toast('ID inválido — use kebab-case (ex: editor-noturno)', 'erro');
      return;
    }
    try {
      await criarAgenteStore(id, from, model || undefined);
      toast(`Agente "${id}" criado (clone de ${from}) — ajuste o prompt com agent edit`, 'ok');
      fecharForm();
      await carregar();
    } catch (e) {
      toast('Erro ao criar: ' + (e as Error).message, 'erro');
    }
  }

  async function handleExcluir(id: string) {
    const { modalConfirm } = await import('../modal.js');
    if (!(await modalConfirm(`Excluir o agente "${id}"? O arquivo .md e a cópia do OpenCode são removidos.`, { titulo: 'Excluir agente', confirmar: 'Excluir' }))) return;
    try {
      await excluirAgenteStore(id);
      toast('Agente excluído', 'ok');
      await carregar();
    } catch (e) {
      toast((e as Error).message || 'Erro ao excluir', 'erro');
    }
  }

  function onKeyDownDrawer(e: KeyboardEvent) {
    if (e.key === 'Escape' && drawerOpen) fecharDrawer();
  }

  onMount(() => {
    void carregar();
    unsubs.push(wsAtivo.subscribe((v) => (wsAtual = v)));
    unsubs.push(agentesStore.subscribe((v) => {
      if (v.length || !carregando) agentes = v as AgenteResumo[];
    }));
    unsubs.push(carregandoStore.subscribe(() => {}));
    unsubs.push(erroStore.subscribe((v) => { if (v) erro = v; }));

    let lastWs = wsAtual;
    wsCheckInterval = setInterval(() => {
      const cur = localStorage.getItem('oc-ws') || '';
      if (cur !== lastWs) { lastWs = cur; void carregar(); }
    }, 2000);

    document.addEventListener('keydown', onKeyDownDrawer);
    return () => document.removeEventListener('keydown', onKeyDownDrawer);
  });

  onDestroy(() => {
    unsubs.forEach((u) => u());
    if (wsCheckInterval) clearInterval(wsCheckInterval);
    document.removeEventListener('keydown', onKeyDownDrawer);
  });
</script>

<div class="page-header">
  <div class="page-header-esq">
    <h1 class="page-header-titulo">{@html icone('teams')} Agentes</h1>
    <p class="page-header-sub">Ativos e catálogo · habilite conforme a empresa</p>
  </div>
  <div class="page-header-acoes">
    <span class="help-wrap">{@html ajuda('agentes')}</span>
    <button
      class="btn btn-ghost"
      id="btn-semear-catalogo"
      onclick={handleSemear}
      disabled={semeando}
      title="Adicionar agentes prontos do catálogo (vendas, marketing…)"
    >{@html icone('plus')} {semeando ? 'Semeando…' : 'Semear catálogo'}</button>
    <button class="btn" onclick={abrirForm}>{@html icone('plus')} Novo agente</button>
  </div>
</div>

<div id="agente-form" class="mb-6">
  {#if formMostrando}
    <div class="card p-4 bg-base-100 border border-base-300">
      <h3 class="font-semibold mb-3 flex items-center gap-2">{@html icone('plus')} Novo agente (clone de base) {@html ajuda('agentes')}</h3>
      <form id="form-novo-agente" class="space-y-4" onsubmit={(e) => { e.preventDefault(); void handleCriar(); }}>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label class="block text-xs text-zinc-500 mb-1" for="novo-agente-id">ID (kebab-case)</label>
            <input id="novo-agente-id" required placeholder="ex: editor-noturno" pattern="[a-z0-9]+(-[a-z0-9]+)*" class="input input-bordered w-full text-sm" bind:value={novoId} />
          </div>
            <div>
              <label class="block text-xs text-zinc-500 mb-1" for="novo-agente-from">Clonar de</label>
              <input id="novo-agente-from" placeholder="id do agente base" class="input input-bordered w-full text-sm" bind:value={novoFrom} />
            <p class="text-xs text-zinc-500 mt-1">O clone <strong>herda o estado ativo/desativado</strong> do base — catálogo (ex.: agente-vendas) nasce desativado; ative com o toggle depois.</p>
          </div>
          <div>
            <label class="block text-xs text-zinc-500 mb-1" for="novo-agente-model">Modelo (opcional)</label>
            <input id="novo-agente-model" placeholder="provider/model" class="input input-bordered w-full text-sm" bind:value={novoModel} />
          </div>
        </div>
        <div class="flex gap-2">
          <button type="submit" class="btn btn-sm">{@html icone('plus')} Criar agente</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick={fecharForm}>Cancelar</button>
        </div>
      </form>
    </div>
  {/if}
</div>

{#if carregando && agentes.length === 0}
  <div class="empty-state estado-loading" role="status" aria-live="polite">
    <div class="empty-icon">{@html icone('history')}</div>
    <div class="empty-title">Carregando agentes…</div>
  </div>
{:else if erro}
  <div class="empty-state estado-erro" role="alert">
    <div class="empty-icon">{@html icone('close')}</div>
    <div class="empty-title">Algo deu errado</div>
    <div class="empty-desc">{erro}</div>
    <div class="empty-acao"><button class="btn btn-ghost" onclick={carregar}>{@html icone('run')} Tentar novamente</button></div>
  </div>
{:else}
  {#if !temAgentes}
    <h2 class="text-sm font-semibold uppercase tracking-wide text-zinc-400 mb-3">Ativos</h2>
    <div id="agentes-ativos" class="mb-8">
      <div class="empty-state">
        <div class="empty-icon">{@html icone('teams')}</div>
        <div class="empty-title">Nenhum agente nesta empresa</div>
        <div class="empty-desc">Todo workspace novo nasce com agentes do template (executor-padrao, secretario…). Crie variações com <strong>Novo agente</strong> ou use <strong>Semear catálogo</strong>.</div>
      </div>
    </div>
    <h2 class="text-sm font-semibold uppercase tracking-wide text-zinc-400 mb-3">Catálogo (desativados)</h2>
    <div id="agentes-catalogo" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      <div class="text-xs text-zinc-500 col-span-full">Catálogo vazio — use <strong>Semear catálogo</strong> para adicionar agentes prontos (vendas, marketing, financeiro, suporte, jurídico, ops).</div>
    </div>
  {:else}
    <h2 class="text-sm font-semibold uppercase tracking-wide text-zinc-400 mb-3">Ativos</h2>
    <div id="agentes-ativos" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
      {#if ativos.length}
        {#each ativos as a (a.id)}
          {@const desativado = a.ativo === false}
          {@const sistema = isSistema(a.id)}
          <div class="card p-4 flex flex-col gap-2 bg-base-100 border border-base-300 {desativado ? 'opacity-60' : ''}" data-agente-card={a.id}>
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="font-mono text-sm truncate" title={a.id}>{a.id}</div>
                <div class="text-xs text-zinc-400 truncate">{a.role || '—'}{#if sistema} · <span class="badge badge-pipeline badge-sm">sistema</span>{/if}</div>
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                {#if desativado}
                  <span class="badge badge-neutral badge-sm">desativado</span>
                {:else}
                  <span class="badge {badgeCategoria(String(a.category))} badge-sm">{String(a.category || 'custom')}</span>
                {/if}
                <label class="toggle" title={sistema ? 'Agente de sistema — não pode ser desativado' : desativado ? 'Ativar agente' : 'Desativar agente'}>
                  <input
                    type="checkbox"
                    data-toggle-agente={a.id}
                    checked={!desativado}
                    disabled={sistema || toggling.has(a.id)}
                    onchange={(e) => handleToggle(a.id, (e.target as HTMLInputElement).checked)}
                  />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
            <div class="text-xs text-zinc-500 space-y-1 flex-1">
              <div class="truncate font-mono" title={a.model}>{a.model}</div>
              <div>{String(a.permissions)} · {rotuloPermissao(String(a.permissions))}</div>
              <div>orçamento: US$ {Number(a.budget_daily_usd ?? 0).toFixed(2)}/dia</div>
            </div>
            <div class="flex items-center gap-2 pt-1 border-t border-base-300">
              <button class="btn btn-sm flex-1" onclick={() => handleChamar(a.id)} title="Executar ordem">{@html icone('run')} Chamar</button>
              <button class="btn btn-ghost btn-sm" onclick={() => handleEditar(a.id)} title="Editar config">{@html icone('gear')}</button>
              <button class="btn btn-ghost btn-sm text-error" onclick={() => handleExcluir(a.id)} title="Excluir">{@html icone('trash')}</button>
            </div>
          </div>
        {/each}
      {:else}
        <div class="text-xs text-zinc-500 col-span-full">Nenhum agente ativo — ative pelo toggle no catálogo abaixo.</div>
      {/if}
    </div>

    <h2 class="text-sm font-semibold uppercase tracking-wide text-zinc-400 mb-3">Catálogo (desativados)</h2>
    <div id="agentes-catalogo" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {#if desativados.length}
        {#each desativados as a (a.id)}
          {@const desativado = true}
          {@const sistema = isSistema(a.id)}
          <div class="card p-4 flex flex-col gap-2 bg-base-100 border border-base-300 opacity-60" data-agente-card={a.id}>
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="font-mono text-sm truncate" title={a.id}>{a.id}</div>
                <div class="text-xs text-zinc-400 truncate">{a.role || '—'}{#if sistema} · <span class="badge badge-pipeline badge-sm">sistema</span>{/if}</div>
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                <span class="badge badge-neutral badge-sm">desativado</span>
                <label class="toggle" title={sistema ? 'Agente de sistema — não pode ser desativado' : 'Ativar agente'}>
                  <input
                    type="checkbox"
                    data-toggle-agente={a.id}
                    checked={false}
                    disabled={sistema || toggling.has(a.id)}
                    onchange={(e) => handleToggle(a.id, (e.target as HTMLInputElement).checked)}
                  />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
            <div class="text-xs text-zinc-500 space-y-1 flex-1">
              <div class="truncate font-mono" title={a.model}>{a.model}</div>
              <div>{String(a.permissions)} · {rotuloPermissao(String(a.permissions))}</div>
              <div>orçamento: US$ {Number(a.budget_daily_usd ?? 0).toFixed(2)}/dia</div>
            </div>
            <div class="flex items-center gap-2 pt-1 border-t border-base-300">
              <button class="btn btn-sm flex-1" onclick={() => handleChamar(a.id)} title="Executar ordem">{@html icone('run')} Chamar</button>
              <button class="btn btn-ghost btn-sm" onclick={() => handleEditar(a.id)} title="Editar config">{@html icone('gear')}</button>
              <button class="btn btn-ghost btn-sm text-error" onclick={() => handleExcluir(a.id)} title="Excluir">{@html icone('trash')}</button>
            </div>
          </div>
        {/each}
      {:else}
        <div class="text-xs text-zinc-500 col-span-full">Todo o catálogo está ativo. Use <strong>Semear catálogo</strong> para adicionar agentes prontos de áreas (vendas, marketing, financeiro, suporte, jurídico, ops).</div>
      {/if}
    </div>
  {/if}
{/if}

{#if drawerOpen}
  <div class="drawer-overlay open" onclick={fecharDrawer} role="presentation"></div>
  <div class="drawer open" role="dialog" aria-modal="true" aria-label="Editar agente">
    <div class="drawer-header flex items-center justify-between p-3 border-b border-base-300">
      <span class="drawer-title font-semibold">Agente: {agenteEditId}</span>
      <button class="drawer-close btn btn-ghost btn-xs" onclick={fecharDrawer} aria-label="Fechar">{@html icone('close')}</button>
    </div>
    <div class="drawer-content p-4 space-y-4 overflow-auto max-h-[80vh]" id="drawer-content">
      {#if drawerLoading}
        <div class="empty-state estado-loading"><div class="empty-icon">{@html icone('history')}</div><div class="empty-title">Carregando…</div></div>
      {:else}
        <div class="space-y-4">
          <div class="task-detail-field">
            <span class="task-detail-label block text-xs text-zinc-500 mb-1">ID</span>
            <span class="task-detail-value mono font-mono text-sm">{agenteEditId}</span>
          </div>
          <div class="task-detail-field">
            <span class="task-detail-label block text-xs text-zinc-500 mb-1">Papel (role)</span>
            <input id="ag-role" class="input input-bordered w-full text-sm" bind:value={editRole} />
          </div>
          <div class="task-detail-field">
            <span class="task-detail-label block text-xs text-zinc-500 mb-1">Modelo</span>
            <input id="ag-model" class="input input-bordered w-full text-sm" placeholder="provider/model" bind:value={editModel} />
          </div>
          <div class="task-detail-field">
            <span class="task-detail-label block text-xs text-zinc-500 mb-1">Permissões</span>
            <select id="ag-permissions" class="select select-bordered w-full text-sm" bind:value={editPermissions}>
              <option value="level-1" selected={editPermissions === 'level-1'}>level-1 — só leitura</option>
              <option value="level-2" selected={editPermissions === 'level-2'}>level-2 — bash local</option>
              <option value="level-3" selected={editPermissions === 'level-3'}>level-3 — rede + HITL</option>
            </select>
          </div>
          <div class="task-detail-field">
            <span class="task-detail-label block text-xs text-zinc-500 mb-1">Tools (vírgula)</span>
            <input id="ag-tools" class="input input-bordered w-full text-sm" bind:value={editTools} />
          </div>
          <div class="task-detail-field">
            <span class="task-detail-label block text-xs text-zinc-500 mb-1">Orçamento diário (US$)</span>
            <input id="ag-budget" type="number" step="0.01" min="0" class="input input-bordered w-full text-sm" bind:value={editBudget} />
          </div>
          <div class="task-detail-field">
            <span class="task-detail-label block text-xs text-zinc-500 mb-1">Máx. turnos</span>
            <input id="ag-turns" type="number" min="1" class="input input-bordered w-full text-sm" bind:value={editTurns} />
          </div>
          <div class="flex gap-2 justify-end border-t border-base-300 pt-3">
            <button class="btn btn-sm" disabled={salvando} onclick={handleSalvarAgente}>{@html icone('check')} {salvando ? 'Salvando…' : 'Salvar'}</button>
            <button class="btn btn-ghost btn-sm" onclick={fecharDrawer}>Cancelar</button>
          </div>
          <div class="text-xs text-zinc-500">O prompt do agente não é editado aqui — use <code class="font-mono">opencorp agent edit {agenteEditId}</code>.</div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .page-header { display:flex; justify-content:space-between; align-items:flex-start; gap:.75rem; margin-bottom:1rem; flex-wrap:wrap; }
  .page-header-titulo { font-size:1.5rem; font-weight:700; display:flex; align-items:center; gap:.5rem; }
  .page-header-sub { font-size:.8125rem; color:var(--muted); margin-top:.2rem; }
  .page-header-acoes { display:flex; align-items:center; gap:.5rem; flex-wrap:wrap; }
</style>
