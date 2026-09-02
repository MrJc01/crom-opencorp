<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { api, toast } from '../api.js';
  import { icone } from '../icons.js';
  import { ajuda } from '../help.js';
  import { escapeHtml } from '../format.js';
  import { formatarDataLocal } from '../format.js';
  import { renderMarkdown } from '../md.js';
  import { wsAtivo } from '../stores/auth.svelte.js';
  import { workspaces as wsStore } from '../stores/workspaces.svelte.js';
  import { parsearComposer, COMANDOS_OPCORP } from '../composer-comandos.js';
  import { setRascunho } from '../rascunho.js';
  import { gatilhoComposer, paletteTecla, fecharPalette } from '../palette.js';
  import { goto } from '../lib/router.svelte';
  import {
    hojeIso,
    contarTasksVencidas,
    filtrarAprovsPendentes,
    fluxosAtivosCount,
    corDotSaude,
    isTudoFalhou,
    homeStatusStore,
    homeAprovsStore,
    homeBudgetStore,
    homeTasksStore,
    homeFlowsStore,
    homeNotifStore,
    homeCarregandoStore,
    homeErroStore,
    homeFeedStore,
    carregarHome,
    decidirAprovacaoStore,
    rodarFlowHome,
    adicionarFeedItemStore,
  } from '../stores/home.svelte.js';
  import { get } from 'svelte/store';

  // ── estado local Svelte 5 (runes) ────────────────────────────────────
  let statusDados = $state<Record<string, unknown> | null>(null);
  let aprovsDados = $state<Record<string, unknown>[] | null>(null);
  let budgetDados = $state<Record<string, unknown> | null>(null);
  let tasksDados = $state<Record<string, unknown>[] | null>(null);
  let flowsDados = $state<Record<string, unknown>[] | null>(null);
  let notifDados = $state<Record<string, unknown> | null>(null);

  let carregando = $state(true);
  let erroMsg: string | null = $state(null);
  let tudoFalhou = $state(false);

  let wsAtual = $state('');
  let wss: Array<{ id: string }> = $state([]);

  // KPIs derived
  let hoje = $derived(hojeIso());
  let tasksVencidas = $derived(tasksDados ? contarTasksVencidas(tasksDados as any, hoje) : null);
  let pendentes = $derived(filtrarAprovsPendentes(aprovsDados as any));
  let fluxosAtivos = $derived(fluxosAtivosCount(flowsDados as any));
  let naoLidas = $derived(((notifDados as any)?.resumo?.nao_lidas ?? null) as number | null);
  let custoHoje = $derived(((budgetDados as any)?.estado?.workspace_usd_hoje ?? 0) as number);
  let custoTeto = $derived(((budgetDados as any)?.limites?.daily_usd ?? 0) as number);
  let flowsLista = $derived(((flowsDados as any) || []).slice(0, 4) as Array<{ id: string; nome?: string }>);
  let totalFlows = $derived(((flowsDados as any) || []).length as number);

  // comando
  let comandoTexto = $state('');
  let comandoResultado = $state<string | null>(null);
  let comandoResultadoIsHtml = $state(false);
  let comandoTerminalSaida = $state('');

  // acoes / notificacoes cards
  let acoesASeguir: Array<{ id: string; nome: string; agenda: { tipo: string; valor: string | number }; args: string[]; proxima_exec: string | null }> = $state([]);
  let acoesExecutando: Array<{ id: string; agente: string; gatilho_tipo: string; gatilho_origem: string | null; status: string; inicio: string }> = $state([]);
  let acoesExecutadas: Array<{ id: string; agente: string; gatilho_tipo: string; gatilho_origem: string | null; status: string; inicio: string; duracao_ms: number | null }> = $state([]);
  let acoesErro: string | null = $state(null);
  let naoVistasLista: Array<{ id: string; titulo: string; corpo: string; tipo: string; origem: string; lida: boolean; criado_em: string }> = $state([]);
  let naoVistasBadge: number | null = $state(null);
  let naoVistasErro: string | null = $state(null);

  // feed
  let feedItens = $state<Record<string, unknown>[]>([]);

  let unsubs: Array<() => void> = [];
  let wsCheckInterval: ReturnType<typeof setInterval> | null = null;
  let tickerInterval: ReturnType<typeof setInterval> | null = null;

  // ── carregamento ─────────────────────────────────────────────────────
  async function carregar() {
    carregando = true;
    erroMsg = null;
    try {
      const dados = await carregarHome();
      statusDados = dados.status as any;
      aprovsDados = dados.aprovs as any;
      budgetDados = dados.budget as any;
      tasksDados = dados.tasks as any;
      flowsDados = dados.flows as any;
      notifDados = dados.notif as any;
      tudoFalhou = isTudoFalhou(dados as any);
      if (tudoFalhou && !wsAtual) {
        erroMsg = 'Selecione uma empresa';
      } else if (tudoFalhou) {
        erroMsg = 'Não foi possível carregar os dados da empresa.';
      }
    } catch {
      erroMsg = 'Não foi possível carregar os dados da empresa.';
    } finally {
      carregando = false;
    }
    void carregarCardsAcoes();
  }

  async function carregarCardsAcoes(): Promise<void> {
    // acoes: schedules + execucoes
    try {
      const [jobs, execs] = await Promise.all([
        api<Array<{ id: string; nome: string; agenda: { tipo: string; valor: string | number }; args: string[]; workspace: string; ativo: boolean; proxima_exec: string | null }>>('/schedules'),
        api<Array<{ id: string; agente: string; gatilho_tipo: string; gatilho_origem: string | null; status: string; inicio: string; duracao_ms: number | null }>>('/execucoes?limite=40'),
      ]);
      acoesASeguir = (jobs || [])
        .filter((j) => j.ativo && j.proxima_exec)
        .sort((a, b) => String(a.proxima_exec).localeCompare(String(b.proxima_exec)))
        .slice(0, 6);
      const lista = execs || [];
      acoesExecutando = lista.filter((e) => e.status === 'executando');
      acoesExecutadas = lista.filter((e) => e.status === 'concluido' || e.status === 'falhou' || e.status === 'cancelado').slice(0, 8);
      acoesErro = null;
    } catch {
      acoesErro = 'Falha ao carregar ações';
    }
    try {
      const r = await api<{ notificacoes: Array<{ id: string; titulo: string; corpo: string; tipo: string; origem: string; lida: boolean; criado_em: string }>; resumo?: { nao_lidas?: number } }>('/notifications?nao_lidas=1&limite=8');
      naoVistasLista = r.notificacoes || [];
      naoVistasBadge = r.resumo?.nao_lidas ?? naoVistasLista.length;
      naoVistasErro = null;
    } catch {
      naoVistasErro = 'Falha ao carregar notificações';
    }
    garantirTicker();
  }

  function garantirTicker(): void {
    if (tickerInterval) return;
    tickerInterval = setInterval(() => {
      // força re-render do $derived via hojeIso tick (atualiza contagens ao vivo)
      // ticker real de DOM query é evitado em Svelte — usamos reatividade
      // mas mantemos intervalo para atualizar contagem regressiva
      // trigger via dummy state
      hoje = hojeIso();
    }, 1000);
  }

  // ── handlers de navegação ────────────────────────────────────────────
  function navegar(view: string): void {
    goto(view);
  }

  function abrirWizard(): void {
    // compat com legacy global
    const g = window as unknown as Record<string, unknown>;
    const fn = g.abrirWizard as (() => void) | undefined;
    if (fn) fn();
    else goto('workspace');
  }

  function toggleSidebar(open: boolean): void {
    const g = window as unknown as Record<string, unknown>;
    const fn = g.toggleSidebar as ((b: boolean) => void) | undefined;
    if (fn) fn(open);
  }

  // ── comando ao secretário ────────────────────────────────────────────
  function onComandoKeydown(e: KeyboardEvent): void {
    if (paletteTecla(e)) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void enviarComando();
    }
  }

  function onComandoInput(e: Event): void {
    const ta = e.target as HTMLTextAreaElement;
    comandoTexto = ta.value;
    gatilhoComposer(ta.value, ta);
  }

  async function enviarComando(): Promise<void> {
    const texto = comandoTexto.trim();
    if (!texto) return;
    const parse = parsearComposer(texto);
    if (parse.terminal) {
      fecharPalette();
      comandoTexto = '';
      await executarTerminal(parse.terminal.comando);
      return;
    }
    if (parse.comando && COMANDOS_OPCORP.some((c) => c.nome === parse.comando!.nome)) {
      fecharPalette();
      comandoTexto = '';
      await executarComandoLocal(parse.comando);
      return;
    }
    fecharPalette();
    setRascunho(parse.textoLimpo || texto);
    comandoTexto = '';
    goto('secretario');
    toast('Comando levado ao Secretário — aperte Enter para enviar', 'ok');
  }

  async function executarTerminal(comando: string): Promise<void> {
    comandoResultado = `<pre class="terminal-saida">${escapeHtml('$ ' + comando)}\n…executando</pre>`;
    comandoResultadoIsHtml = true;
    try {
      const r = await api<{ saida: string; codigo: number }>('/terminal', {
        method: 'POST',
        body: JSON.stringify({ comando }),
      });
      const saida = r.saida || '(sem saída)';
      comandoResultado = `<pre class="terminal-saida">${escapeHtml('$ ' + comando + '\n' + saida)}${r.codigo !== 0 ? escapeHtml('\n[código de saída: ' + r.codigo + ']') : ''}</pre>`;
      comandoResultadoIsHtml = true;
      toast(r.codigo === 0 ? 'Terminal executado' : `Terminal encerrou com código ${r.codigo}`, r.codigo === 0 ? 'ok' : 'aviso');
    } catch (e) {
      comandoResultado = `<pre class="terminal-saida">${escapeHtml('$ ' + comando + '\n⚠ ' + (e as Error).message)}</pre>`;
      comandoResultadoIsHtml = true;
      toast('Erro: ' + (e as Error).message, 'erro');
    }
  }

  async function executarComandoLocal(comando: { nome: string; args: string }): Promise<void> {
    if (comando.nome === 'limpar') {
      setRascunho('');
      goto('secretario');
      toast('Nova conversa pronta no Secretário', 'ok');
      return;
    }
    comandoResultado = `<div class="text-sm text-zinc-400">/${escapeHtml(comando.nome)} — carregando…</div>`;
    comandoResultadoIsHtml = true;
    try {
      const { resolverComandoProprio } = await import('./secretario.js');
      const md = await resolverComandoProprio(comando.nome);
      comandoResultado = `<div class="border border-zinc-800 rounded-lg p-3 text-sm">${renderMarkdown(md)}</div>`;
      comandoResultadoIsHtml = true;
    } catch (e) {
      comandoResultado = `<div class="text-sm" style="color:var(--err)">⚠ ${escapeHtml((e as Error).message)}</div>`;
      comandoResultadoIsHtml = true;
    }
  }

  // ── aprovações / flows ───────────────────────────────────────────────
  async function onDecidirAprovacao(id: string, ok: boolean): Promise<void> {
    await decidirAprovacaoStore(id, ok);
    // sync local
    await carregar();
  }

  async function onRodarFlow(id: string): Promise<void> {
    const { modalPrompt } = await import('../modal.js');
    const entrada = await modalPrompt({
      titulo: 'Executar flow ' + id,
      label: 'Entrada (texto livre ou vazio):',
      multiline: true,
    });
    if (entrada === null) return;
    try {
      await rodarFlowHome(id, entrada);
      toast('Flow executando — acompanhe no Feed e no Histórico', 'ok');
    } catch (e) {
      toast('Erro: ' + (e as Error).message, 'erro');
    }
  }

  async function promptOrdem(): Promise<void> {
    goto('agentes');
    toast('Escolha o agente e clique em Chamar', 'ok');
  }

  async function marcarNotifLida(id: string): Promise<void> {
    try {
      await api('/notifications/' + encodeURIComponent(id) + '/lida', { method: 'POST' });
      await carregarCardsAcoes();
    } catch (e) {
      toast('Erro ao marcar como lida: ' + (e as Error).message, 'erro');
    }
  }

  async function marcarTodasLidas(): Promise<void> {
    try {
      await api('/notifications/lidas', { method: 'POST' });
      await carregarCardsAcoes();
      toast('Todas marcadas como lidas', 'ok');
    } catch (e) {
      toast('Erro: ' + (e as Error).message, 'erro');
    }
  }

  // ── lifecycle ────────────────────────────────────────────────────────
  onMount(() => {
    void carregar();

    unsubs.push(wsAtivo.subscribe((v) => {
      wsAtual = v;
    }));
    unsubs.push(wsStore.subscribe((v) => {
      wss = v as any;
    }));
    // sync com stores reativas do home
    unsubs.push(homeStatusStore.subscribe((v) => { if (v) statusDados = v as any; }));
    unsubs.push(homeAprovsStore.subscribe((v) => { if (v) aprovsDados = v as any; }));
    unsubs.push(homeBudgetStore.subscribe((v) => { if (v) budgetDados = v as any; }));
    unsubs.push(homeTasksStore.subscribe((v) => { if (v) tasksDados = v as any; }));
    unsubs.push(homeFlowsStore.subscribe((v) => { if (v) flowsDados = v as any; }));
    unsubs.push(homeNotifStore.subscribe((v) => { if (v) notifDados = v as any; }));
    unsubs.push(homeFeedStore.subscribe((v) => { feedItens = v; }));

    // SSE global hook (main.ts processaEventoSSE chama adicionarFeedItem original)
    // Expõe compat para legacy SSE dispatcher
    const g = window as unknown as Record<string, unknown>;
    const prev = g.__homeFeedPush as ((ev: Record<string, unknown>) => void) | undefined;
    g.__homeFeedPush = (ev: Record<string, unknown>) => {
      adicionarFeedItemStore(ev);
      if (prev) try { prev(ev); } catch {}
    };

    // polling leve para detectar troca de workspace via localStorage (compat Tasks.svelte)
    let lastWs = wsAtual;
    wsCheckInterval = setInterval(() => {
      const cur = localStorage.getItem('oc-ws') || '';
      if (cur !== lastWs) { lastWs = cur; void carregar(); }
    }, 2000);

    return () => {
      if (wsCheckInterval) clearInterval(wsCheckInterval);
    };
  });

  onDestroy(() => {
    unsubs.forEach((u) => u());
    unsubs = [];
    if (wsCheckInterval) { clearInterval(wsCheckInterval); wsCheckInterval = null; }
    if (tickerInterval) { clearInterval(tickerInterval); tickerInterval = null; }
  });

  function formatConta(ms: number): string {
    if (ms <= 0) return 'agora';
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const seg = s % 60;
    const p2 = (n: number) => String(n).padStart(2, '0');
    if (d > 0) return `em ${d}d ${p2(h)}h ${p2(m)}m`;
    return `em ${p2(h)}:${p2(m)}:${p2(seg)}`;
  }
  function formatDecor(ms: number): string {
    const s = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const seg = s % 60;
    const p2 = (n: number) => String(n).padStart(2, '0');
    if (d > 0) return `${d}d ${p2(h)}:${p2(m)}:${p2(seg)}`;
    return `${p2(h)}:${p2(m)}:${p2(seg)}`;
  }
</script>

<div class="page-header">
  <div class="page-header-esq">
    <h1 class="page-header-titulo">{@html icone('home')} Início</h1>
    <p class="page-header-sub">Visão geral da empresa · {wsAtual || 'selecione uma empresa'}</p>
  </div>
  <div class="page-header-acoes">
    <span class="help-wrap">{@html ajuda('home')}</span>
    <button class="btn" onclick={() => navegar('tasks')}>{@html icone('plus')} Nova task</button>
    <button class="btn btn-ghost" onclick={abrirWizard}>{@html icone('spark')} Criar empresa</button>
  </div>
</div>

<div class="hub-header card p-4 mb-5 flex items-center justify-between gap-3 flex-wrap">
  <div class="hub-header-esq">
    <button class="hub-ws btn btn-ghost btn-sm" onclick={() => toggleSidebar(true)} title="Trocar empresa">
      {@html icone('home')} <span class="font-mono font-semibold">{wsAtual || '— empresa —'}</span> <span class="hub-ws-count text-xs text-zinc-500">{wss.length ? wss.length + ' empresa(s)' : ''}</span>
    </button>
  </div>
  <div class="hub-acoes flex items-center gap-2 flex-wrap">
    <button class="btn btn-sm" onclick={() => navegar('tasks')}>{@html icone('plus')} Nova task</button>
    <button class="btn btn-sm" onclick={promptOrdem}>{@html icone('run')} Run agente</button>
    <button class="btn btn-ghost btn-sm" onclick={abrirWizard}>{@html icone('spark')} Criar empresa</button>
  </div>
</div>

{#if carregando && !statusDados && !budgetDados && !tasksDados}
  <div class="empty-state estado-loading" role="status" aria-live="polite">
    <div class="empty-icon">{@html icone('history')}</div>
    <div class="empty-title">Carregando hub…</div>
  </div>
{:else if tudoFalhou}
  {#if !wsAtual}
    <div class="empty-state">
      <div class="empty-icon">{@html icone('home')}</div>
      <div class="empty-title">Selecione uma empresa</div>
      <div class="empty-desc">Escolha um workspace na barra lateral para ver os dados dela aqui.</div>
    </div>
  {:else}
    <div class="empty-state estado-erro" role="alert">
      <div class="empty-icon">{@html icone('close')}</div>
      <div class="empty-title">Algo deu errado</div>
      <div class="empty-desc">Não foi possível carregar os dados da empresa.</div>
      <div class="empty-acao"><button class="btn btn-ghost" onclick={carregar}>{@html icone('run')} Tentar novamente</button></div>
    </div>
  {/if}
{:else}
  <div class="zona-rotulo text-xs uppercase tracking-wide text-zinc-500 mb-2 flex items-center gap-2">Informações importantes {@html ajuda('home')}</div>
  <div class="kpi-grid mb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
    <div class="kpi-card card p-3 border border-base-300" data-kpi="tasks-vencidas" onclick={() => navegar('tasks')} role="button" tabindex="0" onkeydown={(e)=> e.key==='Enter' && navegar('tasks')} title="Tasks com prazo vencido e fora de 'feito'">
      <div class="kpi-value text-2xl font-bold">{tasksDados ? tasksVencidas : '—'}</div>
      <div class="kpi-label text-xs text-zinc-500">Tasks vencidas {@html ajuda('tasks')}</div>
    </div>
    <div class="kpi-card card p-3 border border-base-300" data-kpi="custos" onclick={() => navegar('config')} role="button" tabindex="0" onkeydown={(e)=> e.key==='Enter' && navegar('config')} title="Consumo do workspace hoje">
      <div class="kpi-value text-2xl font-bold">{budgetDados ? '$' + custoHoje.toFixed(2) : '—'}</div>
      <div class="kpi-label text-xs text-zinc-500">Custos do dia{#if budgetDados && custoTeto > 0} · teto ${custoTeto.toFixed(2)}{/if} {@html ajuda('budget')}</div>
    </div>
    <div class="kpi-card card p-3 border border-base-300" id="kpi-saude" data-kpi="saude" onclick={() => navegar('agenda')} role="button" tabindex="0" onkeydown={(e)=> e.key==='Enter' && navegar('agenda')} title="scheduler: {statusDados ? ((statusDados as any).scheduler ? 'rodando' : 'parado') : 'desconhecido'} · secretário: {statusDados ? ((statusDados as any).secretario ? 'rodando' : 'parado') : 'desconhecido'}">
      <div class="kpi-value text-2xl font-bold" style="display:flex;align-items:center;gap:.4rem;min-height:2.4rem">
        {#if statusDados}
          <span class="hub-dot inline-block w-3 h-3 rounded-full" style="background:{corDotSaude((statusDados as any).scheduler)}"></span>
          <span class="hub-dot inline-block w-3 h-3 rounded-full" style="background:{corDotSaude((statusDados as any).secretario)}"></span>
        {:else}
          <span class="text-zinc-500">—</span>
        {/if}
      </div>
      <div class="kpi-label text-xs text-zinc-500">
        {#if statusDados && (statusDados as any).scheduler !== undefined && (statusDados as any).secretario !== undefined}
          scheduler {(statusDados as any).scheduler ? 'ok' : 'parado'} / secretário {(statusDados as any).secretario ? 'ok' : 'parado'}
        {:else}
          saúde desconhecida
        {/if}
        {@html ajuda('agenda')}
      </div>
    </div>
    <div class="kpi-card card p-3 border border-base-300" data-kpi="fluxos" onclick={() => navegar('fluxos')} role="button" tabindex="0" onkeydown={(e)=> e.key==='Enter' && navegar('fluxos')} title="Linhas de pensamento definidas no workspace">
      <div class="kpi-value text-2xl font-bold">{fluxosAtivos === null ? '—' : fluxosAtivos}</div>
      <div class="kpi-label text-xs text-zinc-500">Fluxos ativos {@html ajuda('flows')}</div>
    </div>
    <div class="kpi-card card p-3 border border-base-300" data-kpi="notificacoes" onclick={() => navegar('notificacoes')} role="button" tabindex="0" onkeydown={(e)=> e.key==='Enter' && navegar('notificacoes')} style={naoLidas !== null && naoLidas > 0 ? 'border-color:rgba(251,191,36,.55);background:rgba(251,191,36,.06)' : ''} title="Avisos dos agentes não lidos">
      <div class="kpi-value text-2xl font-bold" style={naoLidas !== null && naoLidas > 0 ? 'color:var(--warn)' : ''}>{notifDados ? naoLidas : '—'}</div>
      <div class="kpi-label text-xs text-zinc-500">Notificações não lidas {@html ajuda('notificacoes')}</div>
    </div>
  </div>

  <div class="zona-rotulo text-xs uppercase tracking-wide text-zinc-500 mb-2 flex items-center gap-2">Ações e avisos {@html ajuda('feed')}</div>
  <div class="home-grid mb-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
    <section class="card p-4 border border-base-300" id="card-acoes">
      <div class="card-header flex items-center justify-between mb-2">
        <span class="font-semibold text-sm flex items-center gap-2">{@html icone('history')} Ações da empresa</span>
        <span class="badge badge-neutral badge-sm">escopo: empresa ativa</span>
      </div>
      <div class="card-body space-y-3">
        {#if acoesErro}
          <div class="text-xs" style="color:var(--err)">⚠ {acoesErro}</div>
        {:else}
          <div class="acoes-grupo-rotulo text-xs text-zinc-500 uppercase">A seguir</div>
          <div id="acoes-a-seguir" class="mb-3 space-y-1">
            {#if acoesASeguir.length}
              {#each acoesASeguir as j (j.id)}
                <div class="acao-item acao-pendente flex items-center gap-2 p-2 rounded border border-base-300" title="{j.nome} · próxima execução {j.proxima_exec}">
                  <span class="acao-ico acao-ico-agenda">{@html icone('agenda')}</span>
                  <div class="acao-corpo flex-1 min-w-0">
                    <div class="acao-titulo text-sm truncate">{j.nome || j.id}</div>
                    <div class="acao-meta text-xs text-zinc-500 truncate">{j.agenda?.tipo} {j.agenda?.valor} · {(j.args || []).join(' ').slice(0,48)}</div>
                  </div>
                  <span class="acao-contagem text-xs font-mono badge badge-neutral badge-sm" data-contagem-fim={String(j.proxima_exec)}>{formatConta(new Date(String(j.proxima_exec)).getTime() - Date.now())}</span>
                </div>
              {/each}
            {:else}
              <div class="acao-vazio text-xs text-zinc-500">Nada agendado — crie rotinas em <a class="link" onclick={() => navegar('agenda')} href="/agenda">Agenda</a>.</div>
            {/if}
          </div>
          <div class="acoes-grupo-rotulo text-xs text-zinc-500 uppercase">Executando agora</div>
          <div id="acoes-executando" class="mb-3 space-y-1">
            {#if acoesExecutando.length}
              {#each acoesExecutando as e (e.id)}
                <div class="acao-item acao-executando flex items-center gap-2 p-2 rounded border border-base-300">
                  <span class="acao-ico acao-ico-run">{@html icone('run')}</span>
                  <div class="acao-corpo flex-1 min-w-0">
                    <div class="acao-titulo text-sm">{e.agente} <span class="acao-dot inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="executando"></span></div>
                    <div class="acao-meta text-xs text-zinc-500">{e.gatilho_tipo}{e.gatilho_origem ? ' · ' + e.gatilho_origem.slice(0,42) : ''}</div>
                  </div>
                  <span class="acao-contagem text-xs font-mono badge badge-neutral badge-sm" data-contagem-inicio={String(e.inicio)}>{formatDecor(Date.now() - new Date(String(e.inicio)).getTime())}</span>
                </div>
              {/each}
            {:else}
              <div class="acao-vazio text-xs text-zinc-500">Nada executando neste momento.</div>
            {/if}
          </div>
          <div class="acoes-grupo-rotulo text-xs text-zinc-500 uppercase">Executado recentemente</div>
          <div id="acoes-executadas" class="space-y-1">
            {#if acoesExecutadas.length}
              {#each acoesExecutadas as e (e.id)}
                <div class="acao-item acao-executada flex items-center gap-2 p-2 rounded border border-base-300 opacity-80">
                  <span class="acao-ico {e.status === 'concluido' ? 'acao-ico-ok text-green-500' : 'acao-ico-erro text-red-500'}">{@html icone(e.status === 'concluido' ? 'check' : 'close')}</span>
                  <div class="acao-corpo flex-1 min-w-0">
                    <div class="acao-titulo text-sm">{e.agente}</div>
                    <div class="acao-meta text-xs text-zinc-500">{e.gatilho_tipo}{e.gatilho_origem ? ' · ' + e.gatilho_origem.slice(0,42) : ''} · {formatarDataLocal(e.inicio)}</div>
                  </div>
                  <span class="badge {e.status === 'concluido' ? 'badge-ok badge-success' : 'badge-err badge-error'} badge-sm">{e.status}{e.duracao_ms ? ' · ' + formatDecor(e.duracao_ms).slice(0,8) : ''}</span>
                </div>
              {/each}
            {:else}
              <div class="acao-vazio text-xs text-zinc-500">Nenhuma execução ainda — ações aparecem aqui ao acontecer.</div>
            {/if}
          </div>
        {/if}
      </div>
    </section>
    <section class="card p-4 border border-base-300" id="card-nao-vistas">
      <div class="card-header flex items-center justify-between mb-2">
        <span class="font-semibold text-sm flex items-center gap-2">{@html icone('sino')} Não vistas</span>
        <span id="nao-vistas-badge" class="badge {naoVistasBadge !== null && naoVistasBadge > 0 ? 'badge-warn' : 'badge-neutral'} badge-sm">{naoVistasBadge ?? ''}</span>
      </div>
      <div class="card-body">
        {#if naoVistasErro}
          <div class="text-xs" style="color:var(--err)">⚠ {naoVistasErro}</div>
        {:else if naoVistasLista.length}
          <div id="nao-vistas-lista" class="space-y-2">
            {#each naoVistasLista as n (n.id)}
              <div class="notif-nao-vista p-2 rounded border border-base-300">
                <div class="notif-nao-vista-topo flex items-center gap-2 text-xs">
                  <span class="badge badge-neutral badge-sm">{n.tipo}</span>
                  <span class="acao-meta text-zinc-500 truncate flex-1">{n.origem.slice(0,24)} · {formatarDataLocal(n.criado_em)}</span>
                  <button class="notif-lida-btn btn btn-ghost btn-xs" onclick={() => marcarNotifLida(n.id)} title="Marcar como lida">{@html icone('check')}</button>
                </div>
                <div class="notif-nao-vista-titulo text-sm font-medium mt-1">{n.titulo}</div>
                <div class="notif-nao-vista-corpo text-xs text-zinc-400">{n.corpo}</div>
              </div>
            {/each}
          </div>
          {#if (naoVistasBadge ?? 0) > 0}
            <div id="nao-vistas-acoes" class="mt-2">
              <button class="btn btn-ghost btn-sm text-xs w-full" onclick={marcarTodasLidas}>{@html icone('check')} Marcar todas como lidas</button>
            </div>
          {/if}
        {:else}
          <div class="empty-state py-4">
            <div class="empty-icon">{@html icone('check')}</div>
            <div class="empty-title text-sm">Nenhuma não vista</div>
            <div class="empty-desc text-xs text-zinc-500">Os avisos dos agentes aparecem aqui antes de virarem lidos.</div>
          </div>
        {/if}
      </div>
    </section>
  </div>

  <div class="zona-rotulo text-xs uppercase tracking-wide text-zinc-500 mb-2 flex items-center gap-2">Comando ao Secretário {@html ajuda('home-comando')}</div>
  <section class="card p-4 mb-5 border border-base-300">
    <div class="flex items-stretch gap-2">
      <textarea
        id="home-comando"
        rows="1"
        placeholder="Envie um comando ao Secretário — / comandos, @ contexto, ! terminal…"
        class="textarea textarea-bordered flex-1"
        bind:value={comandoTexto}
        onkeydown={onComandoKeydown}
        oninput={onComandoInput}
        aria-label="Comando ao Secretário"
      ></textarea>
      <button class="btn flex-shrink-0" onclick={enviarComando} title="Enviar ao Secretário (ou executar / e !)" aria-label="Enviar comando">{@html icone('run')}</button>
    </div>
    {#if comandoResultado}
      <div id="home-comando-resultado" class="mt-3">
        {#if comandoResultadoIsHtml}
          {@html comandoResultado}
        {:else}
          <div class="text-sm">{comandoResultado}</div>
        {/if}
      </div>
    {/if}
  </section>

  <div class="zona-rotulo text-xs uppercase tracking-wide text-zinc-500 mb-2 flex items-center gap-2">Sistema e atalhos {@html ajuda('config')}</div>
  <section class="card p-4 mb-5 border border-base-300">
    <div class="hub-sistema grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <button class="hub-card card p-3 border border-base-300 flex items-center gap-3 text-left hover:bg-base-200" onclick={() => navegar('config')}>
        {@html icone('gear')} <span><b class="block text-sm">Config</b><small class="text-xs text-zinc-500">preferências, orçamento, segurança</small></span>
      </button>
      <button class="hub-card card p-3 border border-base-300 flex items-center gap-3 text-left hover:bg-base-200" onclick={() => { navegar('config'); setTimeout(()=> (window as unknown as Record<string, unknown>).__cfgAba && ((window as unknown as Record<string, unknown>).__cfgAba as (s:string)=>void)('secrets'),350)}}>
        {@html icone('key')} <span><b class="block text-sm">Secrets</b><small class="text-xs text-zinc-500">credenciais — valores nunca exibidos</small></span>
      </button>
      <button class="hub-card card p-3 border border-base-300 flex items-center gap-3 text-left hover:bg-base-200" onclick={() => { navegar('config'); setTimeout(()=> (window as unknown as Record<string, unknown>).__cfgAba && ((window as unknown as Record<string, unknown>).__cfgAba as (s:string)=>void)('ferramentas'),350)}}>
        {@html icone('apps')} <span><b class="block text-sm">Ferramentas</b><small class="text-xs text-zinc-500">specs em .opencorp/tools</small></span>
      </button>
      <div class="hub-card hub-card-static card p-3 border border-base-300 flex items-center gap-3" title="Rode no terminal">
        {@html icone('shield')} <span><b class="block text-sm">Doutor</b><small class="text-xs text-zinc-500"><code class="font-mono">opencorp doctor</code> no CLI</small></span>
      </div>
    </div>
  </section>

  <div class="zona-rotulo text-xs uppercase tracking-wide text-zinc-500 mb-2 flex items-center gap-2">Aprovações {@html ajuda('hitl')}</div>
  <section class="card p-4 mb-5 border border-base-300" id="aprovs-pendentes">
    {#if pendentes.length === 0}
      <div class="empty-state py-4">
        <div class="empty-icon">{@html icone('chat')}</div>
        <div class="empty-title text-sm">Nenhuma aprovação pendente</div>
        <div class="empty-desc text-xs text-zinc-500">Ações sensíveis (git push, npm publish…) pausam aqui esperando você.</div>
      </div>
    {:else}
      {#each pendentes as a (a.id)}
        <div class="approval-row flex items-center justify-between gap-3 p-2 border border-base-300 rounded mb-2">
          <div class="min-w-0">
            <div class="font-mono text-xs">{String(a.id).slice(-8)}</div>
            <div class="text-xs text-zinc-400 truncate">{String(a.padrao || a.pattern || '—')}</div>
          </div>
          <div class="approval-actions flex gap-2">
            <button class="btn btn-ghost btn-sm" onclick={() => onDecidirAprovacao(String(a.id), true)}>{@html icone('check')} Aprovar</button>
            <button class="btn btn-sm" style="background:var(--err); color:#fff" onclick={() => onDecidirAprovacao(String(a.id), false)}>{@html icone('close')} Rejeitar</button>
          </div>
        </div>
      {/each}
    {/if}
  </section>

  <div class="zona-rotulo text-xs uppercase tracking-wide text-zinc-500 mb-2 flex items-center gap-2">Linhas de pensamento {@html ajuda('flows')}</div>
  <section class="card p-4 mb-5 border border-base-300" id="hub-flows">
    {#if flowsLista.length === 0}
      <div class="flex items-center justify-between gap-2 mb-2">
        <span class="text-sm text-zinc-400">O CEO analisa o board e abre tasks sozinho com elas.</span>
        <a class="btn btn-ghost btn-xs" onclick={() => navegar('fluxos')} href="/fluxos">ver fluxos →</a>
      </div>
      <div class="empty-state py-4">
        <div class="empty-icon">{@html icone('fluxos')}</div>
        <div class="empty-title text-sm">Nenhum fluxo no workspace</div>
        <div class="empty-desc text-xs text-zinc-500">Crie com <code class="font-mono">opencorp flow create</code> ou instale as linhas de pensamento padrão.</div>
      </div>
    {:else}
      <div class="flex items-center justify-between gap-2 mb-2">
        <span class="text-sm text-zinc-400">Executáveis a um clique:</span>
        <a class="btn btn-ghost btn-xs" onclick={() => navegar('fluxos')} href="/fluxos">ver todas ({totalFlows}) →</a>
      </div>
      <div class="hub-flows-lista space-y-2">
        {#each flowsLista as f (f.id)}
          <div class="hub-flow flex items-center justify-between gap-3 p-2 border border-base-300 rounded">
            <div class="min-w-0">
              <div class="font-mono text-sm truncate">{String(f.id)}</div>
              {#if f.nome}<div class="text-xs text-zinc-500 truncate">{String(f.nome)}</div>{/if}
            </div>
            <button class="btn btn-ghost btn-xs flex-shrink-0" onclick={() => onRodarFlow(String(f.id))}>{@html icone('run')} Rodar agora</button>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <div class="zona-rotulo text-xs uppercase tracking-wide text-zinc-500 mb-2 flex items-center gap-2">Feed ao vivo <span class="badge badge-neutral badge-sm">todas as empresas</span> {@html ajuda('feed')}</div>
  <section class="card p-4 border border-base-300">
    <div id="feed-atividade" class="scrollbar-thin max-h-96 overflow-y-auto space-y-1">
      {#if feedItens.length === 0}
        <div class="empty-state py-4">
          <div class="empty-icon">{@html icone('spark')}</div>
          <div class="empty-title text-sm">Aguardando eventos…</div>
          <div class="empty-desc text-xs text-zinc-500">Atividade aparecerá aqui conforme tasks, sessões, hooks e teams gerarem eventos.</div>
        </div>
      {:else}
        {#each feedItens as ev, i (i)}
          {@const tipo = String((ev as any).tipo || 'desconhecido')}
          {@const meta = feedIconMeta(tipo)}
          <div class="feed-item flex gap-2 p-2 rounded border border-base-300">
            <span class="feed-icon {meta.iconClass}">{@html icone(meta.icon)}</span>
            <div class="feed-text flex-1 min-w-0">
              <div class="text-xs truncate">{JSON.stringify(ev).slice(0,120)}</div>
              <div class="meta text-[10px] text-zinc-500">{formatarDataLocal(new Date().toISOString())}</div>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </section>
{/if}

<style>
  .page-header { display:flex; justify-content:space-between; align-items:flex-start; gap:.75rem; margin-bottom:1rem; flex-wrap:wrap; }
  .page-header-titulo { font-size:1.5rem; font-weight:700; display:flex; align-items:center; gap:.5rem; }
  .page-header-sub { font-size:.8125rem; color:var(--muted); margin-top:.2rem; }
  .zona-rotulo { font-weight:600; }
  .hub-dot { display:inline-block; }
</style>
