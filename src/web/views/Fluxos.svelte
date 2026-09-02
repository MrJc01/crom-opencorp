<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { api, q, toast } from '../api.js';
  import { icone } from '../icons.js';
  import { ajuda } from '../help.js';
  import { escapeHtml } from '../format.js';
  import { wsAtivo } from '../stores/auth.svelte';
  import {
    fluxosStore,
    teamsStore,
    carregandoStore,
    erroStore,
    agentesCacheStore,
    TIPOS_EDITAVEIS,
    sequenciaDeFlow,
    brutoParaUi,
    montarGrafoPipeline,
    type TemplateFlow,
    type FlowInfo,
    type TeamLegado,
    type NoFlowUi,
  } from '../stores/fluxos.svelte.js';

  // ── estado local Svelte 5 ──────────────────────────
  let fluxos = $state<FlowInfo[]>([]);
  let teams = $state<TeamLegado[]>([]);
  let carregando = $state(true);
  let erro: string | null = $state(null);
  let wsAtual = $state('');

  let agentesCache = $state<Array<{ id: string }>>([]);

  // form
  let templateFlow = $state<TemplateFlow>('pipeline');
  let flowEmEdicao: string | null = $state(null);
  let formAberto = $state(false);
  let flowId = $state('');
  let flowNome = $state('');

  // pipeline
  let passosPipeline = $state<NoFlowUi[]>([
    { tipo: 'agente', agente: '', ordem: '', titulo: '', categoria: '' },
  ]);

  // fanout
  let paralelos = $state<Array<{ agente: string; ordem: string }>>([
    { agente: '', ordem: '' },
    { agente: '', ordem: '' },
  ]);
  let sintese = $state<{ agente: string; ordem: string } | null>({ agente: '', ordem: '' });
  let usarSintese = $state(true);

  // review
  let executor = $state({ agente: '', ordem: '' });
  let revisor = $state({ agente: '', ordem: '' });
  let turnos = $state(2);

  // debate
  let proponentes = $state<Array<{ agente: string; ordem: string }>>([
    { agente: '', ordem: '' },
    { agente: '', ordem: '' },
  ]);
  let moderador = $state('');

  // drawer detalhes
  let drawerOpen = $state(false);
  let drawerFlowId = $state<string | null>(null);
  let drawerFlowJson: Record<string, unknown> | null = $state(null);
  let drawerUltima: Record<string, unknown> | null = $state(null);
  let drawerLoading = $state(false);

  let temFluxos = $derived(fluxos.length > 0);
  let temTeams = $derived(teams.length > 0);

  let unsubs: Array<() => void> = [];
  let wsCheckInterval: ReturnType<typeof setInterval> | null = null;

  // ── carregamento ───────────────────────────────────
  async function carregarFluxosLista() {
    carregando = true;
    erro = null;
    try {
      const data = await api<FlowInfo[]>('/flows');
      fluxos = Array.isArray(data) ? data : [];
      fluxosStore.set(fluxos);
      erroStore.set(null);
    } catch {
      erro = 'Não foi possível carregar os fluxos.';
      erroStore.set(erro);
      fluxos = [];
    } finally {
      carregando = false;
      carregandoStore.set(false);
    }
  }

  async function carregarTimesLegados() {
    try {
      const data = await api<TeamLegado[]>('/teams');
      teams = Array.isArray(data) ? data : [];
      teamsStore.set(teams);
    } catch {
      teams = [];
      teamsStore.set([]);
    }
  }

  async function carregarAgentesCache() {
    try {
      const data = await q<Array<{ id: string }>>('/agents');
      agentesCache = Array.isArray(data) ? data : [];
      agentesCacheStore.set(agentesCache);
    } catch {
      agentesCache = [];
    }
  }

  async function recarregarTudo() {
    await Promise.all([carregarTimesLegados(), carregarFluxosLista()]);
  }

  async function migrarTeams() {
    try {
      const res = await api<{ criados: string[]; pulados: Array<{ id: string; motivo: string }> }>('/flows/migrate-teams', { method: 'POST' });
      const partes: string[] = [];
      if (res.criados.length) partes.push(`${res.criados.length} migrado(s): ${res.criados.join(', ')}`);
      if (res.pulados.length) partes.push(`${res.pulados.length} pulado(s) (${res.pulados.map((p) => p.id).join(', ')})`);
      toast(partes.length ? partes.join(' · ') : 'Nada a migrar', res.criados.length ? 'ok' : 'aviso');
      await recarregarTudo();
    } catch (e) {
      toast('Erro ao migrar: ' + (e as Error).message, 'erro');
    }
  }

  // ── form helpers ───────────────────────────────────
  function resetForm() {
    flowId = '';
    flowNome = '';
    passosPipeline = [{ tipo: 'agente', agente: '', ordem: '', titulo: '', categoria: '' }];
    paralelos = [{ agente: '', ordem: '' }, { agente: '', ordem: '' }];
    sintese = { agente: '', ordem: '' };
    usarSintese = true;
    executor = { agente: '', ordem: '' };
    revisor = { agente: '', ordem: '' };
    turnos = 2;
    proponentes = [{ agente: '', ordem: '' }, { agente: '', ordem: '' }];
    moderador = '';
  }

  function abrirFormFlow(template: TemplateFlow = 'pipeline') {
    flowEmEdicao = null;
    templateFlow = template;
    resetForm();
    formAberto = true;
    tick().then(() => {
      document.getElementById('flow-form-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  function fecharFormFlow() {
    flowEmEdicao = null;
    formAberto = false;
    resetForm();
  }

  function addPassoFlow() {
    passosPipeline = [...passosPipeline, { tipo: 'agente', agente: '', ordem: '', titulo: '', categoria: '' }];
  }

  function removerPassoFlow(idx: number) {
    passosPipeline = passosPipeline.filter((_, i) => i !== idx);
    if (!passosPipeline.length) passosPipeline = [{ tipo: 'agente', agente: '', ordem: '', titulo: '', categoria: '' }];
  }

  function atualizarTipoPasso(idx: number, tipo: NoFlowUi['tipo']) {
    passosPipeline[idx]!.tipo = tipo;
    // limpa campos irrelevantes
    if (tipo === 'agente') {
      passosPipeline[idx]!.titulo = '';
      passosPipeline[idx]!.categoria = '';
    } else if (tipo === 'task_create') {
      passosPipeline[idx]!.agente = '';
      passosPipeline[idx]!.ordem = '';
      passosPipeline[idx]!.categoria = '';
    } else {
      passosPipeline[idx]!.agente = '';
      passosPipeline[idx]!.ordem = '';
      passosPipeline[idx]!.titulo = '';
    }
    passosPipeline = [...passosPipeline];
  }

  function addPassoTemplate(container: 'paralelos' | 'proponentes') {
    if (container === 'paralelos') paralelos = [...paralelos, { agente: '', ordem: '' }];
    else proponentes = [...proponentes, { agente: '', ordem: '' }];
  }

  function removerPassoTemplate(container: 'paralelos' | 'proponentes', idx: number) {
    if (container === 'paralelos') paralelos = paralelos.filter((_, i) => i !== idx);
    else proponentes = proponentes.filter((_, i) => i !== idx);
  }

  // ── criar / editar / excluir ───────────────────────
  async function criarFlow() {
    const id = flowId.trim();
    const nome = flowNome.trim();
    if (!id || !nome) {
      toast('ID e nome são obrigatórios', 'erro');
      return;
    }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
      toast('ID deve ser kebab-case (ex: ciclo-publicacao)', 'erro');
      return;
    }

    let grafo: { nos: Array<{ id: string; tipo: string; config: Record<string, unknown> }>; arestas: Array<{ de: string; para: string }> } | null = null;

    if (templateFlow === 'pipeline') {
      const montado = montarGrafoPipeline(passosPipeline);
      if (!montado) {
        toast('Preencha todos os passos (agente+ordem / título / categoria)', 'erro');
        return;
      }
      grafo = montado as any;
    } else if (templateFlow === 'fanout') {
      const filtrados = paralelos.filter((p) => p.agente.trim());
      if (filtrados.length < 2) { toast('Fanout precisa de 2+ agentes em paralelo', 'erro'); return; }
      const sint = usarSintese && sintese?.agente.trim() ? { agente: sintese.agente.trim(), ordem: sintese.ordem.trim() || 'Contribua com a entrada.' } : undefined;
      grafo = {
        nos: [
          { id: 'gatilho', tipo: 'manual', config: {} },
          { id: 'fanout', tipo: 'fanout', config: { paralelos: filtrados.map((p) => ({ agente: p.agente.trim(), ordem: p.ordem.trim() || 'Contribua com a entrada.' })), ...(sint ? { sintese: sint } : {}) } },
        ],
        arestas: [{ de: 'gatilho', para: 'fanout' }],
      };
    } else if (templateFlow === 'review') {
      if (!executor.agente.trim() || !revisor.agente.trim()) { toast('Review precisa de executor e revisor', 'erro'); return; }
      const t = Math.min(Math.max(Number(turnos), 1), 5);
      grafo = {
        nos: [
          { id: 'gatilho', tipo: 'manual', config: {} },
          { id: 'review', tipo: 'review', config: { executor: { agente: executor.agente.trim(), ordem: executor.ordem.trim() || 'Contribua com a entrada.' }, revisor: { agente: revisor.agente.trim(), ordem: revisor.ordem.trim() || 'Contribua com a entrada.' }, turnos: t } },
        ],
        arestas: [{ de: 'gatilho', para: 'review' }],
      };
    } else {
      const filtrados = proponentes.filter((p) => p.agente.trim());
      if (filtrados.length < 2) { toast('Debate precisa de 2+ proponentes', 'erro'); return; }
      if (!moderador.trim()) { toast('Debate precisa de um moderador', 'erro'); return; }
      grafo = {
        nos: [
          { id: 'gatilho', tipo: 'manual', config: {} },
          { id: 'debate', tipo: 'debate', config: { proponentes: filtrados.map((p) => ({ agente: p.agente.trim(), ordem: p.ordem.trim() || 'Contribua com a entrada.' })), moderador: { agente: moderador.trim() } } },
        ],
        arestas: [{ de: 'gatilho', para: 'debate' }],
      };
    }

    try {
      await q('/flows', { method: 'POST', body: JSON.stringify({ id, nome, ...grafo }) });
      toast(`Fluxo "${id}" criado (${templateFlow})`, 'ok');
      fecharFormFlow();
      await carregarFluxosLista();
    } catch (e) {
      toast('Erro ao criar fluxo: ' + (e as Error).message, 'erro');
    }
  }

  async function editarFlow(id: string) {
    interface FlowBrutoLoose { nome?: string; nos: Array<{ id: string; tipo: string; config: Record<string, unknown> }>; arestas: Array<{ de: string; para: string }> }
    let flow: FlowBrutoLoose | null = null;
    try {
      flow = await api<FlowBrutoLoose>('/flows/' + encodeURIComponent(id));
    } catch {
      toast('Não foi possível carregar o fluxo ' + id, 'erro');
      return;
    }
    if (!flow) return;
    const nos = flow.nos ?? [];
    const editavel = nos.every((n) => TIPOS_EDITAVEIS.has(String(n.tipo)));
    if (!editavel) {
      const { modalConfirm } = await import('../modal.js');
      await modalConfirm(
        `O fluxo "${id}" tem nós avançados (condição/decisão/webhook) que este editor simples não edita sem risco de perder o grafo. Edite via opencorp flow edit ${escapeHtml(id)} (abre o JSON com validação).`,
        { titulo: 'Editor simples não suporta este fluxo', confirmar: 'Entendi' },
      );
      return;
    }
    flowEmEdicao = id;
    templateFlow = 'pipeline';
    flowId = id;
    flowNome = String(flow.nome ?? id);
    const seq = sequenciaDeFlow(nos as any, flow.arestas ?? []);
    if (!seq.length) {
      passosPipeline = [{ tipo: 'agente', agente: '', ordem: '', titulo: '', categoria: '' }];
    } else {
      passosPipeline = seq.map((n) => brutoParaUi(n as any));
    }
    formAberto = true;
    await tick();
    document.getElementById('flow-form-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function salvarEdicaoFlow() {
    if (!flowEmEdicao) return;
    const nome = flowNome.trim();
    if (!nome) { toast('Nome é obrigatório', 'erro'); return; }
    const montado = montarGrafoPipeline(passosPipeline);
    if (!montado) { toast('Preencha todos os passos corretamente', 'erro'); return; }
    try {
      await api('/flows/' + encodeURIComponent(flowEmEdicao), { method: 'PUT', body: JSON.stringify({ id: flowEmEdicao, nome, ...montado }) });
      toast(`Fluxo "${flowEmEdicao}" salvo`, 'ok');
      fecharFormFlow();
      await carregarFluxosLista();
    } catch (e) {
      toast('Erro ao salvar fluxo: ' + (e as Error).message, 'erro');
    }
  }

  async function excluirFlow(id: string) {
    const { modalConfirm } = await import('../modal.js');
    if (!(await modalConfirm(`Excluir o fluxo "${escapeHtml(id)}"? Execuções passadas continuam no Histórico.`, { titulo: 'Excluir fluxo', confirmar: 'Excluir' }))) return;
    try {
      await api('/flows/' + encodeURIComponent(id), { method: 'DELETE' });
      toast('Fluxo excluído', 'ok');
      await carregarFluxosLista();
    } catch (e) {
      toast('Erro ao excluir: ' + (e as Error).message, 'erro');
    }
  }

  async function executarFlow(id: string) {
    const { modalPrompt } = await import('../modal.js');
    const entrada = await modalPrompt({ titulo: 'Executar flow ' + id, label: 'Entrada (JSON ou texto):', multiline: true });
    if (entrada === null) return;
    try {
      await api('/flows/' + encodeURIComponent(id) + '/run', { method: 'POST', body: JSON.stringify({ entrada }) });
      toast('Flow executando — veja Início → Execuções', 'ok');
    } catch (e) {
      toast('Erro: ' + (e as Error).message, 'erro');
    }
  }

  async function detalhesFlow(id: string) {
    drawerOpen = true;
    drawerFlowId = id;
    drawerLoading = true;
    drawerFlowJson = null;
    drawerUltima = null;
    // compat: também abre drawer legado se existir
    document.getElementById('drawer')?.classList.add('open');
    document.getElementById('drawer-overlay')?.classList.add('open');
    try {
      const flow = await api<Record<string, unknown>>('/flows/' + encodeURIComponent(id));
      drawerFlowJson = flow;
      try {
        const ultima = await api<Record<string, unknown> | null>('/flows/' + encodeURIComponent(id) + '/status');
        drawerUltima = ultima;
      } catch { drawerUltima = null; }
      const el = document.getElementById('drawer-content');
      if (el) {
        // mantém compat com fluxos.ts que escrevia direto no drawer legado
        const status = drawerUltima ? String((drawerUltima as any).status ?? '?') : null;
        const nos = ((drawerUltima as any)?.nos as Array<{ id: string; status: string }>) || [];
        let blocoExec = '';
        if (drawerUltima) {
          const falhou = status === 'falhou';
          const linhaNos = nos.map((n) => `${n.status === 'ok' ? '✓' : n.status === 'falhou' ? '✗' : '·'} ${n.id} (${n.status})`).join('<br>');
          blocoExec = `<div class="mt-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs"><div class="flex items-center justify-between gap-2"><span><strong>última execução</strong> — <span class="font-mono">${escapeHtml(String((drawerUltima as any).execId))}</span> · ${escapeHtml(status!)}</span>${falhou ? `<button class="btn btn-ghost text-xs" data-retomar="${escapeHtml(id)}" data-exec="${escapeHtml(String((drawerUltima as any).execId))}">Retomar do último nó ok</button>` : ''}</div><div class="mt-2 text-zinc-500">${linhaNos}</div></div>`;
        }
        document.getElementById('drawer-title')!.textContent = 'Flow: ' + id;
      }
    } catch (e) {
      toast('Erro: ' + (e as Error).message, 'erro');
    } finally {
      drawerLoading = false;
    }
  }

  function fecharDrawerLocal() {
    drawerOpen = false;
    drawerFlowId = null;
    drawerFlowJson = null;
    drawerUltima = null;
    document.getElementById('drawer')?.classList.remove('open');
    document.getElementById('drawer-overlay')?.classList.remove('open');
    document.getElementById('drawer-content')?.replaceChildren();
  }

  async function retomarFlow(id: string, execId: string) {
    try {
      await api('/flows/' + encodeURIComponent(id) + '/resume', { method: 'POST', body: JSON.stringify({ exec_id: execId }) });
      toast('Retomando execução ' + execId + ' — nós concluídos serão preservados', 'ok');
    } catch (e) {
      toast('Erro: ' + (e as Error).message, 'erro');
    }
  }

  function onKeyDownDrawer(e: KeyboardEvent) {
    if (e.key === 'Escape' && drawerOpen) fecharDrawerLocal();
  }

  onMount(() => {
    void carregarAgentesCache();
    void recarregarTudo();

    unsubs.push(wsAtivo.subscribe((v) => { wsAtual = v; }));
    // polling leve para detectar troca de workspace via localStorage (compat com Tasks.svelte)
    let lastWs = wsAtual;
    wsCheckInterval = setInterval(() => {
      const cur = localStorage.getItem('oc-ws') || '';
      if (cur !== lastWs) { lastWs = cur; void recarregarTudo(); }
    }, 2000);

    unsubs.push(fluxosStore.subscribe((v) => { if (v.length && !carregando) fluxos = v as any; }));
    unsubs.push(teamsStore.subscribe((v) => { if (v.length) teams = v as any; }));
    unsubs.push(agentesCacheStore.subscribe((v) => { if (v.length) agentesCache = v as any; }));

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
    <h1 class="page-header-titulo">{@html icone('fluxos')} Fluxos</h1>
    <p class="page-header-sub">Pipeline · fanout · review · debate</p>
  </div>
  <div class="page-header-acoes">
    <span class="help-wrap">{@html ajuda('flows')}</span>
    <div class="flex items-center gap-1 rounded-lg border border-zinc-700 p-1" role="group" aria-label="Novo fluxo por template">
      <button class="btn text-xs" class:btn-ghost={templateFlow !== 'pipeline' || formAberto} onclick={() => abrirFormFlow('pipeline')}>{@html icone('plus')} Pipeline</button>
      <button class="btn text-xs" class:btn-ghost={templateFlow !== 'fanout' || !formAberto} onclick={() => abrirFormFlow('fanout')}>{@html icone('plus')} Fanout</button>
      <button class="btn text-xs" class:btn-ghost={templateFlow !== 'review' || !formAberto} onclick={() => abrirFormFlow('review')}>{@html icone('plus')} Review</button>
      <button class="btn text-xs" class:btn-ghost={templateFlow !== 'debate' || !formAberto} onclick={() => abrirFormFlow('debate')}>{@html icone('plus')} Debate</button>
    </div>
  </div>
</div>

<!-- Form -->
<div id="flow-form-anchor" class="mb-6">
  {#if formAberto}
    <div class="card p-4 bg-base-100 border border-base-300">
      <h3 class="font-semibold mb-3 flex items-center gap-2">
        {#if flowEmEdicao}
          {@html icone('gear')} Editar fluxo <span class="font-mono text-xs text-zinc-500">{flowEmEdicao}</span>
        {:else}
          {@html icone('plus')} Novo fluxo <span class="badge badge-pipeline badge-sm">{templateFlow}</span> {@html ajuda('flows')}
        {/if}
      </h3>
      <form class="space-y-4" onsubmit={(e) => { e.preventDefault(); if (flowEmEdicao) void salvarEdicaoFlow(); else void criarFlow(); }}>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs text-zinc-500 mb-1" for="flow-id">ID (kebab-case)</label>
            <input id="flow-id" required placeholder="ex: ciclo-publicacao" pattern="[a-z0-9]+(-[a-z0-9]+)*" class="input input-bordered w-full text-sm" bind:value={flowId} readonly={!!flowEmEdicao} class:opacity-60={!!flowEmEdicao} />
          </div>
          <div>
            <label class="block text-xs text-zinc-500 mb-1" for="flow-nome">Nome</label>
            <input id="flow-nome" required placeholder="ex: Ciclo de publicação" class="input input-bordered w-full text-sm" bind:value={flowNome} />
          </div>
        </div>

        <div id="flow-campos-template" class="space-y-3">
          {#if templateFlow === 'pipeline' || flowEmEdicao}
            <div class="flex items-center justify-between mb-2">
              <label class="text-xs text-zinc-500">Passos (executam em sequência após o gatilho manual)</label>
              <button type="button" class="btn btn-ghost btn-xs" onclick={addPassoFlow}>{@html icone('plus')} passo</button>
            </div>
            <div id="flow-passos" class="space-y-3">
              {#each passosPipeline as passo, idx (idx)}
                <div class="border border-zinc-800 rounded p-3 space-y-2 flow-passo bg-base-200/50">
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-zinc-500 font-mono">#{idx + 1}</span>
                    <select class="select select-bordered select-sm w-auto text-xs" bind:value={passosPipeline[idx].tipo} onchange={() => atualizarTipoPasso(idx, passosPipeline[idx].tipo as any)}>
                      <option value="agente">agente (executa ordem)</option>
                      <option value="task_create">task (cria no board)</option>
                      <option value="registro">registro (grava documento)</option>
                      <option value="saida">saída (grava + encerra)</option>
                    </select>
                    <button type="button" class="btn-ghost text-xs ml-auto" onclick={() => removerPassoFlow(idx)} title="Remover passo" aria-label="Remover passo">✕</button>
                  </div>
                  <div class="flow-campos grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {#if passo.tipo === 'agente'}
                      {#if agentesCache.length}
                        <select class="select select-bordered select-sm w-full text-xs flow-agente" bind:value={passosPipeline[idx].agente}>
                          <option value="">— agente —</option>
                          {#each agentesCache as a}
                            <option value={a.id}>{a.id}</option>
                          {/each}
                        </select>
                      {:else}
                        <input class="input input-bordered input-sm w-full text-xs flow-agente" placeholder="id do agente (ex: editor)" bind:value={passosPipeline[idx].agente} />
                      {/if}
                      <input class="input input-bordered input-sm w-full text-xs flow-ordem" placeholder="ordem para o agente (aceita {{entrada}})" bind:value={passosPipeline[idx].ordem} />
                    {:else if passo.tipo === 'task_create'}
                      <input class="input input-bordered input-sm w-full text-xs flow-titulo sm:col-span-2" placeholder="título da task" bind:value={passosPipeline[idx].titulo} />
                    {:else}
                      <input class="input input-bordered input-sm w-full text-xs flow-categoria" placeholder="categoria do registro (ex: documentos)" bind:value={passosPipeline[idx].categoria} />
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {:else if templateFlow === 'fanout'}
            <div class="flex items-center justify-between mb-2">
              <label class="text-xs text-zinc-500">Agentes em paralelo (2+)</label>
              <button type="button" class="btn btn-ghost btn-xs" onclick={() => addPassoTemplate('paralelos')}>{@html icone('plus')} agente</button>
            </div>
            <div id="ft-paralelos" class="space-y-3">
              {#each paralelos as p, idx (idx)}
                <div class="border border-zinc-800 rounded p-3 space-y-2 flow-team-passo bg-base-200/50">
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-zinc-500">paralelo {idx + 1}</span>
                    <button type="button" class="btn-ghost text-xs ml-auto" onclick={() => removerPassoTemplate('paralelos', idx)} title="Remover">✕</button>
                  </div>
                  <input class="input input-bordered input-sm w-full text-xs ft-agente" placeholder="id do agente" bind:value={paralelos[idx].agente} />
                  <input class="input input-bordered input-sm w-full text-xs ft-ordem" placeholder="ordem (aceita {{entrada}})" bind:value={paralelos[idx].ordem} />
                </div>
              {/each}
            </div>
            <label class="flex items-center gap-2 text-xs text-zinc-500 mt-3">
              <input type="checkbox" class="checkbox checkbox-xs" bind:checked={usarSintese} /> Síntese final (agrega saídas)
            </label>
            {#if usarSintese}
              <div class="border border-zinc-800 rounded p-3 space-y-2 ft-sintese flow-team-passo bg-base-200/50">
                <div class="text-xs text-zinc-500">síntese</div>
                <input class="input input-bordered input-sm w-full text-xs ft-agente" placeholder="id do agente síntese" bind:value={sintese.agente} />
                <input class="input input-bordered input-sm w-full text-xs ft-ordem" placeholder="ordem da síntese" bind:value={sintese.ordem} />
              </div>
            {/if}
          {:else if templateFlow === 'review'}
            <label class="text-xs text-zinc-500 block mb-1">Executor (faz)</label>
            <div class="border border-zinc-800 rounded p-3 space-y-2 ft-executor flow-team-passo bg-base-200/50">
              <input class="input input-bordered input-sm w-full text-xs ft-agente" placeholder="id do agente executor" bind:value={executor.agente} />
              <input class="input input-bordered input-sm w-full text-xs ft-ordem" placeholder="ordem do executor" bind:value={executor.ordem} />
            </div>
            <label class="text-xs text-zinc-500 block mb-1 mt-3">Revisor (aprova com "APROVADO" ou pede "AJUSTES: ...")</label>
            <div class="border border-zinc-800 rounded p-3 space-y-2 ft-revisor flow-team-passo bg-base-200/50">
              <input class="input input-bordered input-sm w-full text-xs ft-agente" placeholder="id do agente revisor" bind:value={revisor.agente} />
              <input class="input input-bordered input-sm w-full text-xs ft-ordem" placeholder="ordem do revisor" bind:value={revisor.ordem} />
            </div>
            <div class="w-40 mt-3">
              <label class="block text-xs text-zinc-500 mb-1" for="ft-turnos">Turnos máximos (1-5)</label>
              <input id="ft-turnos" type="number" min="1" max="5" class="input input-bordered input-sm w-full" bind:value={turnos} />
            </div>
          {:else}
            <div class="flex items-center justify-between mb-2">
              <label class="text-xs text-zinc-500">Proponentes (2+)</label>
              <button type="button" class="btn btn-ghost btn-xs" onclick={() => addPassoTemplate('proponentes')}>{@html icone('plus')} proponente</button>
            </div>
            <div id="ft-proponentes" class="space-y-3">
              {#each proponentes as p, idx (idx)}
                <div class="border border-zinc-800 rounded p-3 space-y-2 flow-team-passo bg-base-200/50">
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-zinc-500">proponente {idx + 1}</span>
                    <button type="button" class="btn-ghost text-xs ml-auto" onclick={() => removerPassoTemplate('proponentes', idx)} title="Remover">✕</button>
                  </div>
                  <input class="input input-bordered input-sm w-full text-xs ft-agente" placeholder="id do agente" bind:value={proponentes[idx].agente} />
                  <input class="input input-bordered input-sm w-full text-xs ft-ordem" placeholder="ordem (aceita {{entrada}})" bind:value={proponentes[idx].ordem} />
                </div>
              {/each}
            </div>
            <label class="text-xs text-zinc-500 block mb-1 mt-3" for="ft-moderador">Moderador (decide com "DECISÃO: ...")</label>
            <input id="ft-moderador" class="input input-bordered input-sm w-full text-xs" placeholder="id do agente moderador (ex: secretario)" bind:value={moderador} />
          {/if}
        </div>

        <div class="flex gap-2">
          <button type="submit" class="btn btn-primary btn-sm">
            {#if flowEmEdicao}{@html icone('check')} Salvar fluxo{:else}{@html icone('plus')} Criar fluxo{/if}
          </button>
          <button type="button" class="btn btn-ghost btn-sm" onclick={fecharFormFlow}>Cancelar</button>
        </div>
      </form>
    </div>
  {/if}
</div>

<!-- Times legados -->
<div id="times-legados" class="mb-6">
  {#if temTeams}
    <div class="card p-4 border-dashed bg-base-100 border border-base-300">
      <div class="flex items-center justify-between gap-4 flex-wrap">
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold flex items-center gap-2">{@html icone('teams')} Times legados ({teams.length}) {@html ajuda('teams')}</h3>
          <p class="text-xs text-zinc-500 mt-1">Times e fluxos são o mesmo motor agora — migre para editar e acompanhar como fluxo (o arquivo original fica preservado).</p>
        </div>
        <button class="btn btn-sm" onclick={migrarTeams}>{@html icone('check')} Migrar todos para fluxos</button>
      </div>
      <div class="mt-3 space-y-2">
        {#each teams as t}
          <div class="flex items-center justify-between gap-2 text-sm border border-zinc-800 rounded p-2">
            <span class="font-mono text-xs">{t.id} <span class="text-zinc-500">· {t.padrao} · {t.passos} passo(s)</span></span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<!-- Lista de fluxos -->
<div id="fluxos-lista" class="space-y-4">
  {#if carregando && !temFluxos}
    <div class="empty-state estado-loading" role="status" aria-live="polite">
      <div class="empty-icon">{@html icone('history')}</div>
      <div class="empty-title">Carregando fluxos…</div>
    </div>
  {:else if erro}
    <div class="empty-state estado-erro" role="alert">
      <div class="empty-icon">{@html icone('close')}</div>
      <div class="empty-title">Algo deu errado</div>
      <div class="empty-desc">{erro}</div>
      <div class="empty-acao"><button class="btn btn-ghost btn-sm" onclick={carregarFluxosLista}>{@html icone('run')} Tentar novamente</button></div>
    </div>
  {:else if !temFluxos}
    <div class="empty-state">
      <div class="empty-icon">{@html icone('fluxos')}</div>
      <div class="empty-title">Nenhum fluxo</div>
      <div class="empty-desc">Escolha um template acima (Pipeline, Fanout, Review ou Debate), ou use <code class="font-mono text-xs">opencorp flow create &lt;id&gt; --nome "..."</code></div>
    </div>
  {:else}
    {#each fluxos as f (f.id)}
      <div class="card p-4 bg-base-100 border border-base-300">
        <div class="flex items-center justify-between gap-4">
          <div class="flex-1 min-w-0">
            <div class="font-mono text-sm">{f.id}</div>
            {#if f.nome}<div class="text-xs text-zinc-400 mt-1">{f.nome}</div>{/if}
          </div>
          <div class="flex items-center gap-2 flex-shrink-0 flex-wrap">
            <button class="btn btn-ghost btn-sm text-xs" onclick={() => executarFlow(f.id)} aria-label="Executar">{@html icone('run')} Executar</button>
            <button class="btn btn-ghost btn-sm text-xs" onclick={() => detalhesFlow(f.id)} aria-label="Detalhes">{@html icone('chat')} Detalhes</button>
            <button class="btn btn-ghost btn-sm text-xs" onclick={() => editarFlow(f.id)} aria-label="Editar">{@html icone('gear')} Editar</button>
            <button class="btn btn-ghost btn-sm text-xs" style="color:var(--err)" onclick={() => excluirFlow(f.id)} aria-label="Excluir">{@html icone('trash')}</button>
          </div>
        </div>
      </div>
    {/each}
  {/if}
</div>

<!-- Drawer detalhes (Svelte) + compat com drawer legado global -->
{#if drawerOpen}
  <div class="drawer-overlay open" onclick={fecharDrawerLocal} role="presentation"></div>
  <div class="drawer open" role="dialog" aria-modal="true" aria-label="Detalhes do fluxo">
    <div class="drawer-header flex items-center justify-between p-3 border-b border-zinc-800">
      <span class="drawer-title font-semibold">Flow: {drawerFlowId}</span>
      <button class="drawer-close btn btn-ghost btn-xs" onclick={fecharDrawerLocal} aria-label="Fechar">{@html icone('close')}</button>
    </div>
    <div class="drawer-content p-4 space-y-3 overflow-auto max-h-[80vh]">
      {#if drawerLoading}
        <div class="empty-state estado-loading"><div class="empty-icon">{@html icone('history')}</div><div class="empty-title">Carregando…</div></div>
      {:else}
        {#if drawerFlowJson}
          <pre class="text-xs whitespace-pre-wrap max-h-[45vh] overflow-auto bg-base-200 p-3 rounded border border-base-300">{JSON.stringify(drawerFlowJson, null, 2)}</pre>
        {/if}
        {#if drawerUltima}
          {@const status = String((drawerUltima as any).status ?? '?')}
          {@const nos = ((drawerUltima as any).nos as Array<{ id: string; tipo?: string; status: string }>) || []}
          {@const execId = String((drawerUltima as any).execId ?? '')}
          {@const falhou = status === 'falhou'}
          <div class="mt-3 p-3 rounded-lg border border-base-300 bg-base-200 text-xs">
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <span><strong>última execução</strong> — <span class="font-mono">{execId}</span> · {status}</span>
              {#if falhou}
                <button class="btn btn-ghost btn-xs" onclick={() => retomarFlow(drawerFlowId!, execId)}>Retomar do último nó ok</button>
              {/if}
            </div>
            <div class="mt-2 text-zinc-500 space-y-1">
              {#each nos as n}
                <div>{n.status === 'ok' ? '✓' : n.status === 'falhou' ? '✗' : '·'} {n.id} ({n.status})</div>
              {/each}
            </div>
          </div>
        {/if}
      {/if}
    </div>
  </div>
{/if}

<style>
  .page-header { display:flex; justify-content:space-between; align-items:flex-start; gap:.75rem; margin-bottom:1rem; flex-wrap:wrap; }
  .page-header-titulo { font-size:1.5rem; font-weight:700; display:flex; align-items:center; gap:.5rem; }
  .page-header-sub { font-size:.8125rem; color:var(--muted); margin-top:.2rem; }
</style>
