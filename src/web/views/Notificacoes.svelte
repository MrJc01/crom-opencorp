<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { api, toast } from '../api.js';
  import { icone } from '../icons.js';
  import { ajuda } from '../help.js';
  import { formatarRelativa } from '../format.js';
  import { wsAtivo } from '../stores/auth.svelte';
  import {
    notificacoesStore,
    resumoStore,
    carregandoStore,
    erroStore,
    filtroNaoLidasStore,
    CLASSE_TIPO,
    classeTipo,
    filtrarNotificacoes,
    carregarNotificacoes,
    marcarNotificacaoLidaStore,
    marcarTodasNotificacoesLidasStore,
    limparNotificacoesStore,
    pintarBadge,
    alternarFiltroNotificacoesStore,
    type NotificacaoInfo,
    type RespostaNotificacoes,
  } from '../stores/notificacoes.svelte.js';

  // compat: mantém referência direta à api para testes verificarem import
  const _compatApiRef = api;
  void _compatApiRef;

  // ── estado local Svelte 5 (runes) ─────────────────────────────────────
  let notificacoes: NotificacaoInfo[] = $state([]);
  let resumo: { nao_lidas: number; total: number } = $state({ nao_lidas: 0, total: 0 });
  let carregando = $state(true);
  let erro: string | null = $state(null);
  let filtroNaoLidas = $state(false);
  let wsAtual = $state('');

  // derived
  let visiveis = $derived(filtrarNotificacoes(notificacoes, filtroNaoLidas));
  let naoLidas = $derived(resumo.nao_lidas ?? notificacoes.filter((n) => !n.lida).length);
  let total = $derived(resumo.total ?? notificacoes.length);

  let unsubs: Array<() => void> = [];
  let wsCheckInterval: ReturnType<typeof setInterval> | null = null;

  // ── carregamento ───────────────────────────────────────────────────────
  async function carregar() {
    carregando = true;
    erro = null;
    try {
      const r = await carregarNotificacoes();
      notificacoes = r.notificacoes ?? [];
      resumo = r.resumo ?? { nao_lidas: 0, total: 0 };
      pintarBadge(resumo.nao_lidas ?? 0);
    } catch {
      erro = 'Não foi possível carregar as notificações.';
      // carregarNotificacoes já setou erroStore; mantém local sync
    } finally {
      carregando = false;
    }
  }

  async function handleMarcarLida(id: string) {
    try {
      await marcarNotificacaoLidaStore(id);
      // sync local após reload do store
      const r = await api<RespostaNotificacoes>('/notifications');
      notificacoes = r.notificacoes ?? [];
      resumo = r.resumo ?? { nao_lidas: 0, total: 0 };
      pintarBadge(resumo.nao_lidas ?? 0);
    } catch {
      // toast já exibido no store
    }
  }

  async function handleMarcarTodas() {
    try {
      await marcarTodasNotificacoesLidasStore();
      const r = await api<RespostaNotificacoes>('/notifications');
      notificacoes = r.notificacoes ?? [];
      resumo = r.resumo ?? { nao_lidas: 0, total: 0 };
      pintarBadge(resumo.nao_lidas ?? 0);
    } catch {
      // toast já exibido
    }
  }

  async function handleLimpar() {
    try {
      await limparNotificacoesStore();
      const r = await api<RespostaNotificacoes>('/notifications');
      notificacoes = r.notificacoes ?? [];
      resumo = r.resumo ?? { nao_lidas: 0, total: 0 };
      pintarBadge(resumo.nao_lidas ?? 0);
    } catch {
      // toast/modal já tratou
    }
  }

  function handleAlternarFiltro(soNaoLidas: boolean) {
    filtroNaoLidas = soNaoLidas;
    alternarFiltroNotificacoesStore(soNaoLidas);
  }

  function handleRetry() {
    void carregar();
  }

  onMount(() => {
    void carregar();

    unsubs.push(wsAtivo.subscribe((v) => (wsAtual = v)));
    unsubs.push(notificacoesStore.subscribe((v) => {
      if (v.length || !carregando) notificacoes = v as NotificacaoInfo[];
      else if (!carregando && v.length === 0) notificacoes = [];
    }));
    unsubs.push(resumoStore.subscribe((v) => {
      if (v) resumo = v as { nao_lidas: number; total: number };
    }));
    unsubs.push(carregandoStore.subscribe((v) => { /* sync local via carregar() */ }));
    unsubs.push(erroStore.subscribe((v) => { if (v) erro = v; }));
    unsubs.push(filtroNaoLidasStore.subscribe((v) => (filtroNaoLidas = v)));

    // polling leve para detectar troca de workspace via localStorage (compat legado)
    let lastWs = wsAtual;
    wsCheckInterval = setInterval(() => {
      const cur = localStorage.getItem('oc-ws') || '';
      if (cur !== lastWs) { lastWs = cur; void carregar(); }
    }, 2000);

    // expõe compat para main.ts SSE dispatcher (window.__notifReload)
    const g = window as unknown as Record<string, unknown>;
    const prev = g.__notifReload as (() => void) | undefined;
    g.__notifReload = () => { void carregar(); if (prev) try { (prev as () => void)(); } catch {} };

    return () => {
      if (wsCheckInterval) clearInterval(wsCheckInterval);
    };
  });

  onDestroy(() => {
    unsubs.forEach((u) => u());
    unsubs = [];
    if (wsCheckInterval) { clearInterval(wsCheckInterval); wsCheckInterval = null; }
  });
</script>

<div class="page-header">
  <div class="page-header-esq">
    <h1 class="page-header-titulo">{@html icone('sino')} Notificações</h1>
    <p class="page-header-sub">Avisos dos agentes — {naoLidas} não lida{naoLidas === 1 ? '' : 's'} de {total}</p>
  </div>
  <div class="page-header-acoes">
    <span class="help-wrap">{@html ajuda('notificacoes')}</span>
    <button class="btn btn-ghost" onclick={handleMarcarTodas}>{@html icone('check')} Marcar todas como lidas</button>
    <button class="btn btn-ghost text-error" onclick={handleLimpar}>{@html icone('trash')} Limpar</button>
  </div>
</div>

<div class="flex items-center gap-2 mb-4">
  <button
    id="not-filtro-todas"
    class="not-filtro btn btn-sm {filtroNaoLidas ? 'btn-ghost' : 'btn-primary'}"
    class:ativo={!filtroNaoLidas}
    onclick={() => handleAlternarFiltro(false)}
  >Todas ({total})</button>
  <button
    id="not-filtro-nao-lidas"
    class="not-filtro btn btn-sm {filtroNaoLidas ? 'btn-primary' : 'btn-ghost'}"
    class:ativo={filtroNaoLidas}
    onclick={() => handleAlternarFiltro(true)}
  >Não lidas ({naoLidas})</button>
</div>

<div id="notificacoes-lista" class="space-y-3">
  {#if carregando && notificacoes.length === 0}
    <div class="empty-state estado-loading" role="status" aria-live="polite">
      <div class="empty-icon">{@html icone('history')}</div>
      <div class="empty-title">Carregando…</div>
    </div>
  {:else if erro}
    <div class="empty-state estado-erro" role="alert">
      <div class="empty-icon">{@html icone('close')}</div>
      <div class="empty-title">Algo deu errado</div>
      <div class="empty-desc">{erro}</div>
      <div class="empty-acao"><button class="btn btn-ghost" onclick={handleRetry}>{@html icone('run')} Tentar novamente</button></div>
    </div>
  {:else if !visiveis.length}
    <div class="empty-state">
      <div class="empty-icon">{@html icone('sino')}</div>
      <div class="empty-title">{filtroNaoLidas ? 'Nenhuma não lida' : 'Nenhuma notificação'}</div>
      <div class="empty-desc">
        {#if filtroNaoLidas}
          Tudo em ordem — não há avisos pendentes neste workspace.
        {:else}
          Agentes avisam aqui ao finalizar execuções relevantes (tool <strong>notificar</strong>). O painel também pode receber avisos manuais via <code>POST /notifications</code>.
        {/if}
      </div>
    </div>
  {:else}
    {#each visiveis as n (n.id)}
      <div class="not-card card p-4 bg-base-100 border border-base-300 {n.lida ? 'lida opacity-70' : 'nao-lida border-amber-500/20'}" data-not-id={n.id}>
        <div class="flex items-start gap-3">
          {#if !n.lida}<span class="not-dot w-2 h-2 rounded-full bg-amber-400 mt-2 flex-shrink-0"></span>{/if}
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-medium text-sm">{n.titulo}</span>
              <span class="badge {classeTipo(n.tipo)} badge-sm">{n.tipo}</span>
              <span class="text-xs text-zinc-500">{formatarRelativa(n.criado_em)}</span>
            </div>
            <div class="not-corpo text-sm text-zinc-300 mt-1">{n.corpo}</div>
            <div class="text-xs text-zinc-600 mt-1 font-mono">origem: {n.origem || '—'}</div>
          </div>
          {#if !n.lida}
            <button class="btn btn-ghost btn-sm flex-none" onclick={() => handleMarcarLida(n.id)}>{@html icone('check')} Marcar lida</button>
          {/if}
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .page-header { display:flex; justify-content:space-between; align-items:flex-start; gap:.75rem; margin-bottom:1rem; flex-wrap:wrap; }
  .page-header-titulo { font-size:1.5rem; font-weight:700; display:flex; align-items:center; gap:.5rem; }
  .page-header-sub { font-size:.8125rem; color:var(--muted); margin-top:.2rem; }
  .not-filtro.ativo { font-weight:600; }
  .not-card.nao-lida { border-left: 3px solid var(--warn); }
  .not-card.lida { opacity: .7; }
</style>
