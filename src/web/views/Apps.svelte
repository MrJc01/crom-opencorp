<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { api, toast } from '../api.js';
  import { icone } from '../icons.js';
  import { ajuda } from '../help.js';
  import { wsAtivo } from '../stores/auth.svelte';
  // mantém referência direta à api para compat (api('/apps') e /apps/<id>/spec)
  const _compatApiRef = api;
  void _compatApiRef;
  import {
    appsStore,
    appSpecStore,
    perfisStore,
    carregandoStore,
    erroStore,
    perfisCarregandoStore,
    perfisErroStore,
    CAMPOS_APP,
    ROTULO_TIPO,
    TIPOS,
    BANNER_CARTAO,
    APP_PERFIL_NOME_REGEX,
    filtrarPerfis,
    agruparPerfis,
    validarIdPerfil,
    validarPerfilCampos,
    montarPayloadPerfil,
    contarMetrica,
    contagemGrafico,
    agruparKanban,
    carregarApps,
    carregarAppSpec,
    carregarPerfis,
    salvarPerfil,
    excluirPerfil,
    buscarDadosWidget,
    enviarFormWidget,
    type AppInfo,
    type AppSpec,
    type WidgetSpec,
    type SecretInfoLista,
  } from '../stores/apps.svelte.js';

  // ── estado local Svelte 5 ─────────────────────────────────────────────
  let apps = $state<AppInfo[]>([]);
  let carregando = $state(true);
  let erro: string | null = $state(null);
  let wsAtual = $state('');
  let aba: 'apps' | 'perfis' = $state('apps');

  // detalhe do app
  let appAberto = $state<AppSpec | null>(null);
  let appAbertoId = $state<string | null>(null);
  let widgetsDados = $state<Record<string, unknown>>({});
  let widgetsLoading = $state<Record<string, boolean>>({});
  let appCarregando = $state(false);

  // perfis
  let perfisRaw = $state<SecretInfoLista[]>([]);
  let perfisCarregando = $state(false);
  let perfisErro = $state<string | null>(null);

  // form perfil
  let formMostrando = $state(false);
  let formTipo = $state('vps');
  let formId = $state('');
  let formEditando = $state(false);
  let formValores = $state<Record<string, string>>({});
  let formSalvando = $state(false);

  // envio de formulário de widget (feedback por widget id)
  let widgetEnviando = $state<Record<string, boolean>>({});
  let widgetEnviado = $state<Record<string, boolean>>({});

  let unsubs: Array<() => void> = [];
  let wsCheckInterval: ReturnType<typeof setInterval> | null = null;

  const temApps = $derived(apps.length > 0);
  const perfisFiltrados = $derived(filtrarPerfis(perfisRaw));
  const perfisAgrupados = $derived(agruparPerfis(perfisFiltrados));

  // ── carregamento ───────────────────────────────────────────────────────
  async function carregarAppsLista() {
    carregando = true;
    erro = null;
    try {
      const lista = await carregarApps();
      apps = lista;
    } catch {
      erro = 'Não foi possível carregar os mini-apps.';
      apps = [];
    } finally {
      carregando = false;
    }
  }

  async function handleCarregarPerfis() {
    perfisCarregando = true;
    perfisErro = null;
    try {
      const lista = await carregarPerfis();
      perfisRaw = lista;
    } catch {
      perfisErro = 'Não foi possível carregar os perfis de app.';
      try { perfisRaw = []; } catch {}
    } finally {
      perfisCarregando = false;
    }
  }

  function trocarAba(id: 'apps' | 'perfis') {
    aba = id;
    if (id === 'perfis') void handleCarregarPerfis();
  }

  async function abrirApp(id: string) {
    appCarregando = true;
    try {
      const spec = await carregarAppSpec(id);
      appAberto = spec;
      appAbertoId = id;
      widgetsDados = {};
      widgetsLoading = {};
      // busca dados de cada widget
      for (const pagina of spec.paginas || []) {
        for (const w of pagina.widgets || []) {
          if (!w.fonte?.rota) continue;
          widgetsLoading[w.id] = true;
          try {
            const d = await buscarDadosWidget(w.fonte.rota);
            widgetsDados[w.id] = d;
          } finally {
            widgetsLoading[w.id] = false;
          }
        }
      }
      await tick();
    } catch {
      // mantém lista visível em caso de erro
      appAberto = null;
      appAbertoId = null;
    } finally {
      appCarregando = false;
    }
  }

  function fecharApp() {
    appAberto = null;
    appAbertoId = null;
    widgetsDados = {};
    widgetsLoading = {};
  }

  // ── widgets helpers para template ──────────────────────────────────────
  function linhasDe(w: WidgetSpec): Array<Record<string, unknown>> {
    const d = widgetsDados[w.id];
    return (Array.isArray(d) ? d : []) as Array<Record<string, unknown>>;
  }

  function metricaValor(w: WidgetSpec): number {
    const d = widgetsDados[w.id];
    return contarMetrica(d);
  }

  function graficoContagem(w: WidgetSpec): Array<{ k: string; v: number }> {
    const linhas = linhasDe(w).slice(0, 50);
    const campo = w.fonte?.campo_valor || 'status';
    const cont = contagemGrafico(linhas, campo);
    return Object.entries(cont).map(([k, v]) => ({ k, v }));
  }

  function kanbanGrupos(w: WidgetSpec): Array<{ coluna: string; itens: Array<Record<string, unknown>> }> {
    const linhas = linhasDe(w);
    const grupos = agruparKanban(linhas);
    return Object.entries(grupos).map(([coluna, itens]) => ({ coluna, itens }));
  }

  async function handleEnviarForm(w: WidgetSpec) {
    const campos = w.acao?.campos || [{ nome: 'titulo' }];
    const corpo: Record<string, string> = {};
    for (const c of campos) {
      const key = `widget-${w.id}-${c.nome}`;
      const el = document.getElementById(key) as HTMLInputElement | null;
      corpo[c.nome] = el?.value?.trim() ?? '';
    }
    const rota = w.fonte?.rota || '/tasks';
    widgetEnviando[w.id] = true;
    try {
      await enviarFormWidget(rota, corpo);
      widgetEnviado[w.id] = true;
      toast('Enviado', 'ok');
      setTimeout(() => (widgetEnviado[w.id] = false), 2000);
      // limpa inputs
      for (const c of campos) {
        const el = document.getElementById(`widget-${w.id}-${c.nome}`) as HTMLInputElement | null;
        if (el) el.value = '';
      }
    } catch (e) {
      toast('Erro: ' + (e as Error).message, 'erro');
    } finally {
      widgetEnviando[w.id] = false;
    }
  }

  // ── perfis form ────────────────────────────────────────────────────────
  function novoPerfil() {
    formTipo = 'vps';
    formId = '';
    formEditando = false;
    formValores = {};
    for (const c of CAMPOS_APP[formTipo] ?? []) formValores[c.nome] = '';
    formMostrando = true;
  }

  function editarPerfil(nome: string) {
    const partes = String(nome).split(':');
    formTipo = partes[1] ?? 'custom';
    formId = partes.slice(2).join(':');
    formEditando = true;
    formValores = {};
    for (const c of CAMPOS_APP[formTipo] ?? []) formValores[c.nome] = '';
    formMostrando = true;
  }

  function trocarTipoPerfil() {
    formValores = {};
    for (const c of CAMPOS_APP[formTipo] ?? []) formValores[c.nome] = '';
  }

  function voltarPerfis() {
    formMostrando = false;
    void handleCarregarPerfis();
  }

  async function handleSalvarPerfil() {
    const id = formId.trim().toLowerCase();
    const tipo = formTipo;
    const msg = validarPerfilCampos(tipo, id, formValores);
    if (msg) {
      toast(msg, 'erro');
      return;
    }
    formSalvando = true;
    try {
      await salvarPerfil(tipo, id, formValores);
      toast(`Perfil "app:${tipo}:${id}" salvo`, 'ok');
      formMostrando = false;
      perfisRaw = [...perfisRaw]; // trigger derived
      await handleCarregarPerfis();
    } catch {
      // api já deu toast
    } finally {
      formSalvando = false;
    }
  }

  async function handleExcluirPerfil(nome: string) {
    const { modalConfirm } = await import('../modal.js');
    if (!(await modalConfirm(`Excluir o perfil "${nome}"? Os agentes perdem o acesso imediatamente.`, { confirmar: 'Excluir' }))) return;
    try {
      await excluirPerfil(nome);
      toast(`Perfil "${nome}" removido`, 'ok');
      await handleCarregarPerfis();
    } catch {
      // api já deu toast
    }
  }

  onMount(() => {
    void carregarAppsLista();
    unsubs.push(wsAtivo.subscribe((v) => (wsAtual = v)));
    unsubs.push(appsStore.subscribe((v) => { if (v.length || !carregando) apps = v as AppInfo[]; }));
    unsubs.push(appSpecStore.subscribe((v) => { if (v) appAberto = v as AppSpec; }));
    unsubs.push(perfisStore.subscribe((v) => { if (Array.isArray(v)) perfisRaw = v as SecretInfoLista[]; }));
    unsubs.push(carregandoStore.subscribe((v) => { /* sync */ }));
    unsubs.push(erroStore.subscribe((v) => { if (v) erro = v; }));
    unsubs.push(perfisCarregandoStore.subscribe((v) => (perfisCarregando = v)));
    unsubs.push(perfisErroStore.subscribe((v) => { if (v) perfisErro = v; }));

    let lastWs = wsAtual;
    wsCheckInterval = setInterval(() => {
      const cur = localStorage.getItem('oc-ws') || '';
      if (cur !== lastWs) { lastWs = cur; void carregarAppsLista(); }
    }, 2000);
  });

  onDestroy(() => {
    unsubs.forEach((u) => u());
    if (wsCheckInterval) clearInterval(wsCheckInterval);
  });
</script>

<div class="page-header">
  <div class="page-header-esq">
    <h1 class="page-header-titulo">{@html icone('apps')} Apps</h1>
    <p class="page-header-sub">Mini-apps e perfis de credenciais</p>
  </div>
  <div class="page-header-acoes"><span class="help-wrap">{@html ajuda('apps')}</span></div>
</div>

<div id="apps-tabs" class="mb-4 flex items-center gap-1 rounded-lg border border-zinc-700 p-1 w-fit" role="tablist" aria-label="Abas Apps">
  <button
    role="tab"
    class="btn btn-sm {aba === 'apps' ? '' : 'btn-ghost'}"
    aria-selected={aba === 'apps'}
    onclick={() => trocarAba('apps')}
  >Apps</button>
  <button
    role="tab"
    class="btn btn-sm {aba === 'perfis' ? '' : 'btn-ghost'}"
    aria-selected={aba === 'perfis'}
    onclick={() => trocarAba('perfis')}
  >Configurar apps</button>
</div>

{#if aba === 'apps'}
  <div id="apps-painel-apps">
    {#if appAberto}
      <div id="app-view">
        <div class="flex items-center gap-3 mb-6">
          <button class="btn btn-ghost btn-sm" onclick={fecharApp}>← Voltar</button>
          <h2 class="font-semibold">{appAberto.titulo}</h2>
          {#if appCarregando}<span class="text-xs text-zinc-500">carregando…</span>{/if}
        </div>
        <div class="widget-grid space-y-6" id="widgets-container">
          {#each appAberto.paginas as pagina}
            {#if appAberto.paginas.length > 1}
              <h3 class="text-sm text-zinc-500 mb-2">{pagina.titulo}</h3>
            {/if}
            <div class="widget-grid grid grid-cols-1 md:grid-cols-2 gap-4">
              {#each pagina.widgets as w (w.id)}
                <div class="widget-card card p-4 bg-base-100 border border-base-300">
                  <h4 class="widget-title font-medium text-sm mb-3">{w.titulo}</h4>
                  {#if widgetsLoading[w.id]}
                    <div class="text-xs text-zinc-500">Carregando…</div>
                  {:else if w.tipo === 'metrica'}
                    <div class="widget-metric text-3xl font-bold">{metricaValor(w)}</div>
                  {:else if w.tipo === 'grafico'}
                    {@const cont = graficoContagem(w)}
                    {@const max = Math.max(1, ...cont.map(c=>c.v), 1)}
                    {#if cont.length}
                      {#each cont as item}
                        <div class="flex items-center gap-2 mb-2">
                          <span class="text-xs w-24 truncate">{item.k}</span>
                          <div style="width:{(item.v/max)*100}%" class="widget-chart-bar h-2 bg-blue-600 rounded"></div>
                          <span class="text-xs">{item.v}</span>
                        </div>
                      {/each}
                    {:else}
                      <div class="text-zinc-500 text-xs">Sem dados</div>
                    {/if}
                  {:else if w.tipo === 'tabela'}
                    {@const linhas = linhasDe(w).slice(0, 10)}
                    {@const rot = w.fonte?.rotulo_campo || 'id'}
                    {@const val = w.fonte?.campo_valor || 'status'}
                    {#if linhas.length}
                      <table class="widget-table w-full text-sm">
                        <tbody>
                          {#each linhas as row}
                            <tr class="border-b border-base-300">
                              <td class="font-mono text-xs truncate max-w-[150px] py-1">{String((row as any)[rot] ?? '').slice(0, 30)}</td>
                              <td class="text-xs text-zinc-500 py-1">{String((row as any)[val] ?? '')}</td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                    {:else}
                      <div class="text-zinc-500 text-xs">Sem dados</div>
                    {/if}
                  {:else if w.tipo === 'kanban'}
                    {@const grupos = kanbanGrupos(w)}
                    {#if grupos.length}
                      {#each grupos as g}
                        <div class="mb-2">
                          <div class="text-xs text-zinc-500 capitalize">{g.coluna} ({g.itens.length})</div>
                          {#each g.itens as t}
                            <div class="text-xs bg-zinc-800 rounded p-1 mb-1 truncate">{String((t as any).titulo || '')}</div>
                          {/each}
                        </div>
                      {/each}
                    {:else}
                      <div class="text-zinc-500 text-xs">Sem dados</div>
                    {/if}
                  {:else if w.tipo === 'markdown'}
                    <div class="text-xs whitespace-pre-wrap">{w.texto || ''}</div>
                  {:else if w.tipo === 'lista_tarefas'}
                    {@const linhasLT = linhasDe(w)}
                    {#if linhasLT.length}
                      {#each linhasLT as t}
                        <label class="flex items-center gap-2 text-xs mb-1">
                          <input type="checkbox" checked={(t as any).coluna === 'feito'} disabled /> {String((t as any).titulo || '')}
                        </label>
                      {/each}
                    {:else}
                      <div class="text-zinc-500 text-xs">Sem dados</div>
                    {/if}
                  {:else if w.tipo === 'formulario'}
                    {@const campos = w.acao?.campos || [{ nome: 'titulo' }]}
                    <div class="space-y-2">
                      {#each campos as c}
                        <input id="widget-{w.id}-{c.nome}" class="input input-bordered input-sm w-full text-sm" placeholder={String(c.rotulo || c.nome)} data-campo={c.nome} />
                      {/each}
                      <button class="btn btn-sm btn-primary" disabled={!!widgetEnviando[w.id]} onclick={() => handleEnviarForm(w)}>
                        {#if widgetEnviado[w.id]}Enviado {@html icone('spark')}{:else if w.acao?.tipo === 'post_rota'}Enviar{:else}Executar{/if}
                      </button>
                    </div>
                  {:else}
                    <div class="text-xs text-zinc-500">Tipo desconhecido: {w.tipo}</div>
                  {/if}
                </div>
              {/each}
            </div>
          {/each}
        </div>
      </div>
    {:else}
      <div id="apps-lista" class="apps-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {#if carregando}
          <div class="empty-state estado-loading col-span-full" role="status" aria-live="polite">
            <div class="empty-icon">{@html icone('history')}</div>
            <div class="empty-title">Carregando apps…</div>
          </div>
        {:else if erro}
          <div class="empty-state estado-erro col-span-full" role="alert">
            <div class="empty-icon">{@html icone('close')}</div>
            <div class="empty-title">Algo deu errado</div>
            <div class="empty-desc">{erro}</div>
            <div class="empty-acao"><button class="btn btn-ghost btn-sm" onclick={carregarAppsLista}>{@html icone('run')} Tentar novamente</button></div>
          </div>
        {:else if !temApps}
          <div class="col-span-full">
            <div class="empty-state">
              <div class="empty-icon">{@html icone('apps')}</div>
              <div class="empty-title">Nenhum mini-app</div>
              <div class="empty-desc">Instale com: <code>opencorp app seed painel-tarefas</code> ou crie via <code>POST /apps</code>.</div>
            </div>
          </div>
        {:else}
          {#each apps as a (a.id)}
            <button class="app-card card p-4 bg-base-100 border border-base-300 text-left hover:border-zinc-600 transition-colors" onclick={() => abrirApp(a.id)}>
              <div class="app-title font-medium text-sm">{a.titulo}</div>
              <div class="app-meta text-xs text-zinc-500 mt-1">{a.id} · {a.widgets} widget(s)</div>
            </button>
          {/each}
        {/if}
      </div>
      <div id="app-view" class="hidden"></div>
    {/if}
  </div>
{:else}
  <div id="apps-painel-perfis">
    {#if formMostrando}
      <section class="card p-4 bg-base-100 border border-base-300">
        <div class="flex items-center gap-3 mb-4">
          <button class="btn btn-ghost btn-sm" onclick={voltarPerfis}>← Voltar</button>
          <h2 class="font-semibold">{formEditando ? 'Editar' : 'Novo'} perfil de app</h2>
        </div>
        {#if formTipo === 'cartao'}
          <div class="rounded-lg border px-4 py-3 text-sm mb-3" id="app-perfil-banner-cartao" style="border-color:var(--err);color:var(--err);background:rgba(248,113,113,.08)">{BANNER_CARTAO}</div>
        {/if}
        <div class="flex gap-2 mb-3 flex-wrap">
          <select id="app-perfil-tipo" class="select select-bordered select-sm" bind:value={formTipo} disabled={formEditando} onchange={trocarTipoPerfil}>
            {#each TIPOS as t}
              <option value={t} selected={t===formTipo}>{ROTULO_TIPO[t] ?? t}</option>
            {/each}
          </select>
          <input id="app-perfil-id" class="input input-bordered input-sm flex-1 min-w-40" placeholder="id (ex.: servidor-1)" bind:value={formId} readonly={formEditando} class:opacity-60={formEditando} />
        </div>
        {#each (CAMPOS_APP[formTipo] ?? CAMPOS_APP.custom) as c}
          <div class="cfg-campo mb-3">
            <div class="cfg-campo-topo flex items-center gap-2 mb-1">
              <span class="cfg-label text-sm font-medium">{c.rotulo}{c.obrigatorio ? ' *' : ''}</span>
              {#if c.segredo}<span class="badge badge-neutral badge-sm">segredo</span>{/if}
            </div>
            {#if c.dica}<span class="cfg-dica text-xs text-zinc-500 block mb-1">{c.dica}</span>{/if}
            <div class="cfg-linha">
              {#if c.opcoes}
                <select id="app-perfil-campo-{c.nome}" class="select select-bordered select-sm w-full" bind:value={formValores[c.nome]}>
                  {#each c.opcoes as o}<option value={o}>{o}</option>{/each}
                </select>
              {:else if c.textarea}
                <textarea id="app-perfil-campo-{c.nome}" rows="4" class="textarea textarea-bordered w-full text-sm" placeholder={c.rotulo} bind:value={formValores[c.nome]}></textarea>
              {:else}
                <input id="app-perfil-campo-{c.nome}" type={c.numero ? 'number' : c.segredo ? 'password' : 'text'} autocomplete={c.segredo ? 'new-password' : 'off'} class="input input-bordered input-sm w-full" placeholder={c.rotulo} bind:value={formValores[c.nome]} />
              {/if}
            </div>
          </div>
        {/each}
        <div class="text-xs text-zinc-500 mt-3">Como o agente usa: <code>referencie nas ordens: OPENCORP_SECRET app:{formTipo}:&lt;id&gt;</code></div>
        <p class="cfg-dica text-xs text-zinc-500 mt-1">Salvar substitui todos os valores do perfil. Campos vazios são salvos como "" — o valor nunca volta para a tela.</p>
        <button class="btn btn-primary btn-sm mt-3" id="app-perfil-salvar" disabled={formSalvando} onclick={handleSalvarPerfil}>Salvar perfil</button>
      </section>
    {:else}
      <section class="card p-4 bg-base-100 border border-base-300">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 class="font-semibold text-sm uppercase tracking-wide text-zinc-400 flex items-center gap-1">Perfis de apps <span class="help-wrap">{@html ajuda('apps-perfis')}</span></h2>
          <button class="btn btn-sm" id="app-perfil-novo" onclick={novoPerfil}>+ Novo perfil</button>
        </div>
        {#if perfisCarregando && perfisRaw.length === 0}
          <div class="empty-state estado-loading" role="status" aria-live="polite">
            <div class="empty-icon">{@html icone('history')}</div>
            <div class="empty-title">Carregando perfis…</div>
          </div>
        {:else if perfisErro}
          <div class="empty-state estado-erro" role="alert">
            <div class="empty-icon">{@html icone('close')}</div>
            <div class="empty-title">Algo deu errado</div>
            <div class="empty-desc">{perfisErro}</div>
            <div class="empty-acao"><button class="btn btn-ghost btn-sm" onclick={handleCarregarPerfis}>{@html icone('run')} Tentar novamente</button></div>
          </div>
        {:else if perfisFiltrados.length}
          {#each [...perfisAgrupados.entries()].sort((a,b)=>a[0].localeCompare(b[0])) as [tipo, lista]}
            <div class="cfg-dica mb-1 mt-3 uppercase tracking-wide text-xs text-zinc-500">{ROTULO_TIPO[tipo] ?? tipo} ({lista.length})</div>
            {#each lista as p (p.nome)}
              <div class="secret-row flex items-center gap-2 py-2 border-b border-base-300 last:border-0" data-perfil={p.nome}>
                <span class="badge badge-pipeline badge-sm">{p.tipo}</span>
                <span class="font-mono text-sm">{p.id}</span>
                <span class="flex-1"></span>
                <span class="badge badge-success badge-sm">definido</span>
                <button class="btn-ghost btn-xs text-xs" aria-label="Editar {p.nome}" onclick={() => editarPerfil(p.nome)}>{@html icone('gear')}</button>
                <button class="btn-ghost btn-xs text-xs" style="color:var(--err)" aria-label="Excluir {p.nome}" onclick={() => handleExcluirPerfil(p.nome)}>{@html icone('trash')}</button>
              </div>
            {/each}
          {/each}
          <div class="rounded-lg border px-4 py-3 text-sm mt-3" data-banner-cartao style="border-color:var(--err);color:var(--err);background:rgba(248,113,113,.08)">{BANNER_CARTAO}</div>
        {:else}
          <div class="empty-state">
            <div class="empty-icon">{@html icone('key')}</div>
            <div class="empty-title">Nenhum perfil de app</div>
            <div class="empty-desc">Credenciais de VPS, WordPress, MercadoPago e outras informações ficam aqui — gravadas em ~/.opencorp/secrets.json e nunca exibidas.</div>
          </div>
          <div class="rounded-lg border px-4 py-3 text-sm mt-3" data-banner-cartao style="border-color:var(--err);color:var(--err);background:rgba(248,113,113,.08)">{BANNER_CARTAO}</div>
        {/if}
      </section>
    {/if}
  </div>
{/if}

<style>
  .page-header { display:flex; justify-content:space-between; align-items:flex-start; gap:.75rem; margin-bottom:1rem; flex-wrap:wrap; }
  .page-header-titulo { font-size:1.5rem; font-weight:700; display:flex; align-items:center; gap:.5rem; }
  .page-header-sub { font-size:.8125rem; color:var(--muted); margin-top:.2rem; }
  .apps-grid { min-height: 120px; }
  .widget-card { min-height: 120px; }
</style>
