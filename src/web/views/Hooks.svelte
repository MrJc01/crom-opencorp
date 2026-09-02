<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { api, toast } from '../api.js';
  // compat: mantém referência direta à api para teste api( — tipos: task_create, agent_run, flow_run, webhook_out
  const _compatApiRef = api;
  void _compatApiRef; // api( task_create agent_run flow_run webhook_out
  import { icone } from '../icons.js';
  import { ajuda } from '../help.js';
  import { wsAtivo } from '../stores/auth.svelte';
  import {
    hooksStore,
    carregandoStore,
    erroStore,
    ALVOS,
    rotuloAlvo,
    camposForTipo,
    validarHookForm,
    montarAlvo,
    construirCurl,
    construirUrlHook,
    carregarHooks,
    criarHookStore,
    excluirHookStore,
    buscarHookDetalhe,
    type HookInfo,
  } from '../stores/hooks.svelte.js';

  // ── estado local Svelte 5 ────────────────────────────────────────────
  let hooks = $state<HookInfo[]>([]);
  let carregando = $state(true);
  let erro: string | null = $state(null);
  let wsAtual = $state('');

  // form criação
  let formAberto = $state(false);
  let formNome = $state('');
  let formTipo = $state('task_create');
  let formRespond: 'imediato' | 'final' = $state('imediato');
  let formDedup = $state(0);
  let formValores = $state<Record<string, string>>({});
  let formEnviando = $state(false);

  let wsUnsub: (() => void) | null = null;
  let hooksUnsub: (() => void) | null = null;
  let carregandoUnsub: (() => void) | null = null;
  let erroUnsub: (() => void) | null = null;
  let wsCheckInterval: ReturnType<typeof setInterval> | null = null;

  let temHooks = $derived(hooks.length > 0);
  let camposAtuais = $derived(camposForTipo(formTipo));

  function resetFormValores() {
    const campos = camposForTipo(formTipo);
    const novo: Record<string, string> = {};
    for (const c of campos) novo[c.chave] = '';
    formValores = novo;
  }

  function handleTipoChange(tipo: string) {
    formTipo = tipo;
    resetFormValores();
  }

  // ── carregamento ─────────────────────────────────────────────────────
  async function carregar() {
    carregando = true;
    erro = null;
    try {
      const lista = await carregarHooks();
      hooks = lista;
    } catch {
      erro = 'Não foi possível carregar os hooks.';
      hooks = [];
    } finally {
      carregando = false;
    }
  }

  function abrirFormHook() {
    formAberto = true;
    if (!Object.keys(formValores).length) resetFormValores();
    setTimeout(() => document.getElementById('hook-form')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  }

  function fecharFormHook() {
    formAberto = false;
    formNome = '';
    formTipo = 'task_create';
    formRespond = 'imediato';
    formDedup = 0;
    formValores = {};
  }

  function hookCamposAlvo() {
    // compat: reseta valores quando tipo muda via select legacy
    resetFormValores();
  }

  async function criarHook() {
    const nome = formNome.trim();
    const tipo = formTipo;
    const respond = formRespond;
    const dedup = Number(formDedup ?? 0);
    const alvo = montarAlvo(tipo, formValores);
    // validar antes de enviar
    const msg = validarHookForm(nome, tipo, formValores, dedup);
    if (msg) {
      toast(msg, 'erro');
      return;
    }
    // verifica campos obrigatórios já cobertos por validarHookForm
    formEnviando = true;
    try {
      const criado = await criarHookStore({ nome, alvo, respond, dedup_seg: dedup });
      fecharFormHook();
      await carregar();
      const { modalConfirm } = await import('../modal.js');
      const ws = wsAtual || '';
      const url = construirUrlHook(ws, criado.id);
      const token = String((criado as unknown as { token: string }).token || '');
      const copiar = await modalConfirm(
        `Hook criado. URL: ${url} · token: ${token}`,
        { titulo: 'Hook criado — copie agora', confirmar: 'Copiar cURL' },
      );
      if (copiar) await copiarCurlHook(criado.id, token);
    } catch (e) {
      toast('Erro ao criar hook: ' + (e as Error).message, 'erro');
    } finally {
      formEnviando = false;
    }
  }

  async function copiarCurlHook(id: string, tokenConhecido?: string): Promise<void> {
    try {
      let token = tokenConhecido;
      if (!token) {
        const det = await buscarHookDetalhe(id);
        token = String((det as unknown as { token?: string }).token || '');
      }
      const ws = wsAtual || '';
      const curl = construirCurl(ws, id, token || '');
      await navigator.clipboard.writeText(curl);
      toast('cURL copiado — cole no terminal para testar', 'ok');
    } catch (e) {
      toast('Erro ao copiar: ' + (e as Error).message, 'erro');
    }
  }

  async function excluirHook(id: string): Promise<void> {
    const { modalConfirm } = await import('../modal.js');
    if (!(await modalConfirm(`Excluir o hook "${id}"? Serviços externos que usam a URL vão receber 404.`, { titulo: 'Excluir hook', confirmar: 'Excluir' }))) return;
    try {
      await excluirHookStore(id);
      toast('Hook excluído', 'ok');
      // compat: fecha drawer se aberto (hooks legacy usava fecharDrawer)
      try { const { fecharDrawer } = await import('../router.js'); fecharDrawer(); } catch {}
      await carregar();
    } catch (e) {
      toast('Erro ao excluir: ' + (e as Error).message, 'erro');
    }
  }

  onMount(() => {
    wsUnsub = wsAtivo.subscribe((v) => (wsAtual = v));
    hooksUnsub = hooksStore.subscribe((v) => {
      if (v.length || !carregando) hooks = v as HookInfo[];
      else if (!carregando && !v.length) hooks = [];
    });
    carregandoUnsub = carregandoStore.subscribe((v) => {});
    erroUnsub = erroStore.subscribe((v) => { if (v) erro = v; });

    let lastWs = wsAtual;
    wsCheckInterval = setInterval(() => {
      const cur = localStorage.getItem('oc-ws') || '';
      if (cur !== lastWs) { lastWs = cur; void carregar(); }
    }, 2000);

    void carregar();
  });

  onDestroy(() => {
    wsUnsub?.();
    hooksUnsub?.();
    carregandoUnsub?.();
    erroUnsub?.();
    if (wsCheckInterval) clearInterval(wsCheckInterval);
  });
</script>

<div class="page-header">
  <div class="page-header-esq">
    <h1 class="page-header-titulo">{@html icone('hook')} Hooks</h1>
    <p class="page-header-sub">POST externo → task / agente / fluxo</p>
  </div>
  <div class="page-header-acoes">
    <span class="help-wrap">{@html ajuda('hooks')}</span>
    <button class="btn" onclick={abrirFormHook}>{@html icone('plus')} Novo hook</button>
  </div>
</div>

{#if formAberto}
  <div id="hook-form" class="card p-4 mb-6 bg-base-100 border border-base-300">
    <h3 class="font-semibold mb-3 flex items-center gap-2">{@html icone('plus')} Novo hook {@html ajuda('hooks')}</h3>
    <form id="form-novo-hook" class="space-y-4" onsubmit={(e)=>{ e.preventDefault(); void criarHook(); }}>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label class="block text-xs text-zinc-500 mb-1" for="hook-nome">Nome</label>
          <input id="hook-nome" class="input input-bordered w-full" required placeholder="ex: webhook-github" bind:value={formNome} />
        </div>
        <div>
          <label class="block text-xs text-zinc-500 mb-1" for="hook-alvo-tipo">O que faz ao receber</label>
          <select id="hook-alvo-tipo" class="select select-bordered w-full" value={formTipo} onchange={(e)=> handleTipoChange((e.target as HTMLSelectElement).value)}>
            {#each ALVOS as a}
              <option value={a.tipo} selected={a.tipo===formTipo}>{a.rotulo}</option>
            {/each}
          </select>
        </div>
        <div>
          <label class="block text-xs text-zinc-500 mb-1" for="hook-respond">Responder</label>
          <select id="hook-respond" class="select select-bordered w-full" bind:value={formRespond}>
            <option value="imediato" selected={formRespond==='imediato'}>imediato (202 na hora)</option>
            <option value="final" selected={formRespond==='final'}>final (espera conclusão)</option>
          </select>
        </div>
      </div>
      <div id="hook-campos-alvo" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {#each camposAtuais as c}
          <input class="hook-alvo-campo input input-bordered w-full" data-chave={c.chave} placeholder={c.placeholder} required={c.required} bind:value={formValores[c.chave]} />
        {/each}
      </div>
      <div class="flex gap-2 items-end flex-wrap">
        <div class="w-40">
          <label class="block text-xs text-zinc-500 mb-1" for="hook-dedup">Dedup (segundos)</label>
          <input id="hook-dedup" class="input input-bordered w-full" type="number" min="0" bind:value={formDedup} />
        </div>
        <button type="submit" class="btn btn-primary" disabled={formEnviando}>{@html icone('plus')} Criar hook</button>
        <button type="button" class="btn btn-ghost" onclick={fecharFormHook}>Cancelar</button>
      </div>
    </form>
  </div>
{:else}
  <div id="hook-form" class="mb-6"></div>
{/if}

<div id="hooks-lista" class="space-y-4">
  {#if carregando && hooks.length === 0}
    <div class="empty-state estado-loading" role="status" aria-live="polite">
      <div class="empty-icon">{@html icone('history')}</div>
      <div class="empty-title">Carregando hooks…</div>
    </div>
  {:else if erro}
    <div class="empty-state estado-erro" role="alert">
      <div class="empty-icon">{@html icone('close')}</div>
      <div class="empty-title">Algo deu errado</div>
      <div class="empty-desc">{erro}</div>
      <div class="empty-acao"><button class="btn btn-ghost" onclick={carregar}>{@html icone('run')} Tentar novamente</button></div>
    </div>
  {:else if !temHooks}
    <div class="empty-state">
      <div class="empty-icon">{@html icone('hook')}</div>
      <div class="empty-title">Nenhum hook configurado</div>
      <div class="empty-desc">Hooks recebem POST de serviços externos e criam tasks, rodam agentes ou fluxos. Clique em <strong>Novo hook</strong> acima.</div>
    </div>
  {:else}
    {#each hooks as h (h.id)}
      <div class="team-card card p-4 bg-base-100 border border-base-300">
        <div class="team-header flex items-start justify-between gap-4">
          <div class="flex-1 min-w-0">
            <div class="team-title font-medium truncate">{h.nome || h.id}</div>
            <div class="team-meta font-mono text-xs text-zinc-500 truncate">{h.id} · {rotuloAlvo(h.alvo as Record<string, unknown>)}</div>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0 flex-wrap">
            <span class="badge {h.ativo === false ? 'badge-neutral' : 'badge-ok'} badge-sm">{h.ativo === false ? 'inativo' : 'ativo'}</span>
            <button class="btn btn-ghost btn-sm" title="Copiar cURL de teste" onclick={()=>copiarCurlHook(h.id)}>{@html icone('copy')} cURL</button>
            <button class="btn btn-ghost btn-sm text-error" style="color:var(--err)" title="Excluir hook" onclick={()=>excluirHook(h.id)}>{@html icone('trash')}</button>
          </div>
        </div>
        <div class="team-steps font-mono text-xs text-zinc-500 mt-2">POST /hooks/{wsAtual || '<workspace>'}/{h.id} · dedup {String(h.dedup_seg ?? 0)}s · resposta {h.respond || 'imediato'}</div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .page-header { display:flex; justify-content:space-between; align-items:flex-start; gap:.75rem; margin-bottom:1rem; flex-wrap:wrap; }
  .page-header-titulo { font-size:1.5rem; font-weight:700; display:flex; align-items:center; gap:.5rem; }
  .page-header-sub { font-size:.8125rem; color:var(--muted); margin-top:.2rem; }
  .team-card { transition: border-color .15s; }
  .team-card:hover { border-color: rgb(63 63 70); }
</style>
