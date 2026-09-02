<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { api, q } from '../api.js';
  import { icone } from '../icons.js';
  import { ajuda } from '../help.js';
  import { formatarDataLocal } from '../format.js';
  import { escapeHtml } from '../format.js';
  import {
    historicoItensStore,
    historicoCarregandoStore,
    historicoErroStore,
    historicoFiltrosStore,
    agentesStore,
    carregarHistorico,
    carregarAgentes,
    TIPOS_HISTORICO,
    OPCOES_TIPO,
    LIMITES_HISTORICO,
    FILTROS_PADRAO,
    labelGatilho,
    corDoTipo,
    labelDoTipo,
    construirParamsHistorico,
    type ItemHistorico,
    type FiltrosHistorico,
    type TipoFiltro,
    type AgenteInfo,
  } from '../stores/historico.svelte.js';
  import { navegar } from '../router.js';

  // ── estado local Svelte 5 (runes) ──────────────────────────────────────
  let itens: ItemHistorico[] = $state([]);
  let carregando = $state(true);
  let erro: string | null = $state(null);
  let filtros: FiltrosHistorico = $state({ ...FILTROS_PADRAO });
  let agentes: AgenteInfo[] = $state([]);

  // acordeão: índice aberto + detalhes carregados
  let abertoIdx: number | null = $state(null);
  let detalhesCache = $state<Map<number, string>>(new Map());
  let detalhesCarregando = $state<Set<number>>(new Set());
  let detalhesJaBuscados = $state<Set<number>>(new Set());

  let temItens = $derived(itens.length > 0);

  let unsubs: Array<() => void> = [];

  // ── carregamento ───────────────────────────────────────────────────────
  async function carregar() {
    carregando = true;
    erro = null;
    try {
      const lista = await carregarHistorico(filtros);
      itens = lista;
      // limpa estado de acordeão ao trocar filtro
      abertoIdx = null;
      detalhesCache = new Map();
      detalhesCarregando = new Set();
      detalhesJaBuscados = new Set();
    } catch (e) {
      erro = (e as Error)?.message ?? 'Não foi possível carregar o histórico.';
    } finally {
      carregando = false;
    }
  }

  async function carregarListaAgentes() {
    try {
      const lista = await carregarAgentes();
      agentes = lista;
    } catch {
      agentes = [];
    }
  }

  function setFiltro(tipo: string) {
    filtros = { ...filtros, tipo: tipo as TipoFiltro };
    historicoFiltrosStore.set({ ...filtros });
    void carregar();
  }

  function setAgente(agente: string) {
    filtros = { ...filtros, agente };
    historicoFiltrosStore.set({ ...filtros });
    void carregar();
  }

  function setLimite(limite: number) {
    filtros = { ...filtros, limite };
    historicoFiltrosStore.set({ ...filtros });
    void carregar();
  }

  async function toggleItem(i: number) {
    const jaAberto = abertoIdx === i;
    if (jaAberto) {
      abertoIdx = null;
      return;
    }
    abertoIdx = i;
    if (detalhesJaBuscados.has(i) || detalhesCarregando.has(i)) return;
    const item = itens[i];
    if (!item) return;
    detalhesJaBuscados = new Set([...detalhesJaBuscados, i]);
    detalhesCarregando = new Set([...detalhesCarregando, i]);
    try {
      const html = await detalhesDoItem(item);
      const novo = new Map(detalhesCache);
      novo.set(i, html);
      detalhesCache = novo;
    } catch (e) {
      const novo = new Map(detalhesCache);
      novo.set(i, `<div class="acc-loading">não foi possível carregar detalhes: ${escapeHtml((e as Error).message)}</div>`);
      detalhesCache = novo;
    } finally {
      const novoSet = new Set(detalhesCarregando);
      novoSet.delete(i);
      detalhesCarregando = novoSet;
    }
  }

  async function detalhesDoItem(e: ItemHistorico): Promise<string> {
    const { renderMarkdown } = await import('../md.js');
    const esc = (v: unknown): string => escapeHtml(String(v ?? ''));
    if (e.tipo === 'execucao') {
      const { log } = await q<{ log: string }>('/sessions/' + encodeURIComponent(e.id) + '/log');
      const tail = (log || '').split('\n').slice(-40).join('\n');
      return `<div class="acc-grid">
        <div><span class="acc-k">execução</span> <span class="acc-v mono">${esc(e.id)}</span></div>
        <div><span class="acc-k">agente</span> <span class="acc-v">${esc(e.agente || '—')}</span></div>
        <div><span class="acc-k">status</span> <span class="acc-v">${esc(e.status || '—')}</span></div>
        ${e.gatilho ? `<div><span class="acc-k">gatilho</span> <span class="acc-v">${esc(labelGatilho(e.gatilho))}</span></div>` : ''}
      </div>
      <pre class="acc-log">${escapeHtml(tail || '(log vazio)')}</pre>`;
    }
    if (e.tipo === 'task') {
      const t = await q<Record<string, unknown>>('/tasks/' + encodeURIComponent(e.id));
      return `<div class="acc-grid">
        <div><span class="acc-k">coluna</span> <span class="acc-v">${esc(t.coluna)}</span></div>
        <div><span class="acc-k">responsável</span> <span class="acc-v">${esc(String(t.responsavel || '—')).replace('agente:', '')}</span></div>
        <div><span class="acc-k">prioridade</span> <span class="acc-v">${esc(t.prioridade)}</span></div>
        <div><span class="acc-k">labels</span> <span class="acc-v">${esc(((t.labels as string[]) || []).join(', ') || '—')}</span></div>
        <div><span class="acc-k">due</span> <span class="acc-v">${esc(t.due || '—')}</span></div>
      </div>
      ${t.descricao ? `<div class="acc-desc">${renderMarkdown(String(t.descricao))}</div>` : ''}
      <button class="btn-ghost text-xs" onclick="window.__navegarTasks('${escapeHtml(e.id)}')">abrir no board →</button>`;
    }
    if (e.tipo === 'rotina') {
      const j = await q<Record<string, unknown>>('/schedules/' + encodeURIComponent(e.id));
      const runs = await q<Array<Record<string, unknown>>>('/schedules/' + encodeURIComponent(e.id) + '/runs?limite=5').catch(() => []);
      const agendaTxt = j.agenda_tipo === 'cron' ? 'cron ' + esc(j.agenda_valor) : j.agenda_tipo === 'intervalo_min' ? 'cada ' + esc(j.agenda_valor) + ' min' : 'em ' + esc(j.agenda_valor);
      return `<div class="acc-grid">
        <div><span class="acc-k">agenda</span> <span class="acc-v mono">${agendaTxt}</span></div>
        <div><span class="acc-k">workspace</span> <span class="acc-v">${esc(j.workspace || '—')}</span></div>
        <div><span class="acc-k">próxima</span> <span class="acc-v">${j.proxima_exec ? formatarDataLocal(String(j.proxima_exec)) : '—'}</span></div>
        <div><span class="acc-k">estado</span> <span class="acc-v">${Number(j.ativo) === 1 ? 'ativa' : 'pausada'}</span></div>
      </div>
      <div class="acc-k" style="margin-top:.4rem">comando</div>
      <pre class="acc-log">${escapeHtml(String(j.args_raw || (Array.isArray(j.args) ? (j.args as string[]).join(' ') : '')))}</pre>
      ${runs.length ? `<div class="acc-k" style="margin-top:.5rem">últimas execuções</div>` + runs.map((r) => `
        <div class="acc-run ${r.pulado ? 'pulou' : ''}">
          <span class="mono">${esc(String(r.iniciado_em ?? '')).slice(0, 16).replace('T', ' ')}</span>
          <span>${r.pulado ? '⏭ pulado' : r.erro ? '✗ ' + esc(String(r.erro)).slice(0, 60) : '✓ ' + esc(String(r.resultado)).slice(0, 60)}</span>
        </div>`).join('') : ''}`;
    }
    if (e.tipo === 'conversa') {
      const msgs = await q<Array<{ role: string; content: string }>>('/secretario/sessoes/' + encodeURIComponent(e.id) + '/mensagens');
      return `<div class="acc-conversa">
        ${msgs.map((m) => `
          <div class="acc-msg ${m.role === 'user' ? 'acc-user' : 'acc-assist'}">
            <span class="acc-role">${m.role === 'user' ? 'você' : 'secretária'}</span>
            <div class="acc-msg-texto">${renderMarkdown(m.content)}</div>
          </div>`).join('')}
      </div>
      <button class="btn-ghost text-xs" onclick="window.__navegarSecretario()">abrir no secretário →</button>`;
    }
    return '<div class="acc-loading">tipo desconhecido</div>';
  }

  // agentes extras para select (além dos padrões)
  let opcoesAgente = $derived(() => {
    const base = ['secretario', 'secretario-exec'];
    const extras = agentes
      .map((a) => a.id)
      .filter((id) => id && !base.includes(id));
    return [...base, ...extras];
  });

  onMount(() => {
    // compat global para detalhes que usam window.__navegarTasks
    (window as unknown as Record<string, unknown>).__navegarTasks = (id: string) => {
      navegar('tasks');
      setTimeout(() => {
        import('../router.js').then(({ abrirDrawer }) => {
          void abrirDrawer(String(id), '');
        });
      }, 300);
    };
    (window as unknown as Record<string, unknown>).__navegarSecretario = () => {
      navegar('secretario');
    };

    unsubs.push(historicoItensStore.subscribe((v) => { if (v.length || !carregando) itens = v as ItemHistorico[]; }));
    unsubs.push(historicoCarregandoStore.subscribe((v) => {}));
    unsubs.push(historicoErroStore.subscribe((v) => { if (v) erro = v; }));
    unsubs.push(historicoFiltrosStore.subscribe((v) => { filtros = v as FiltrosHistorico; }));
    unsubs.push(agentesStore.subscribe((v) => { if (v.length) agentes = v as AgenteInfo[]; }));

    void carregarListaAgentes();
    void carregar();
  });

  onDestroy(() => {
    unsubs.forEach((u) => u());
  });
</script>

<div class="page-header">
  <div class="page-header-esq">
    <h1 class="page-header-titulo">{@html icone('history')} Histórico</h1>
    <p class="page-header-sub">Execuções · tasks · rotinas · conversas</p>
  </div>
  <div class="page-header-acoes flex-wrap">
    <span class="help-wrap">{@html ajuda('historico')}</span>
    <div class="flex rounded-lg border border-zinc-700" role="group" aria-label="Filtro por tipo">
      {#each OPCOES_TIPO as [v, label]}
        <button
          class="btn-ghost text-xs px-3 py-1 {filtros.tipo === v ? 'bg-blue-600 text-white' : ''}"
          onclick={() => setFiltro(v)}
          aria-pressed={filtros.tipo === v}
        >{label}</button>
      {/each}
    </div>
    <select
      id="historico-agente"
      class="btn-ghost text-xs"
      value={filtros.agente}
      onchange={(e) => setAgente((e.target as HTMLSelectElement).value)}
      title="Filtrar por agente"
    >
      <option value="">— agente —</option>
      {#each opcoesAgente() as ag}
        <option value={ag} selected={filtros.agente === ag}>{ag}</option>
      {/each}
    </select>
    <select
      class="btn-ghost text-xs"
      value={String(filtros.limite)}
      onchange={(e) => setLimite(Number((e.target as HTMLSelectElement).value))}
      aria-label="Limite"
    >
      {#each LIMITES_HISTORICO as lim}
        <option value={String(lim)} selected={filtros.limite === lim}>{lim}</option>
      {/each}
    </select>
  </div>
</div>

<div id="historico-lista">
  {#if carregando && !temItens && !erro}
    <div class="empty-state estado-loading" role="status" aria-live="polite">
      <div class="empty-icon">{@html icone('history')}</div>
      <div class="empty-title">Carregando…</div>
    </div>
  {:else if erro}
    <div class="empty-state estado-erro" role="alert">
      <div class="empty-icon">{@html icone('close')}</div>
      <div class="empty-title">Algo deu errado</div>
      <div class="empty-desc">{erro}</div>
      <div class="empty-acao">
        <button class="btn btn-ghost" onclick={carregar}>{@html icone('run')} Tentar novamente</button>
      </div>
    </div>
  {:else if !temItens}
    <div class="empty-state">
      <div class="empty-icon">{@html icone('history')}</div>
      <div class="empty-title">Nada registrado ainda</div>
      <div class="empty-desc">Execuções, tasks, rotinas e conversas aparecem aqui conforme a empresa opera.</div>
    </div>
  {:else}
    <div class="hist-acordeao">
      {#each itens as e, i (e.id + '-' + i)}
        <div class="acc-item card border border-base-300 bg-base-100 mb-2" class:aberto={abertoIdx === i} data-idx={i}>
          <button
            class="acc-header flex items-center gap-3 w-full text-left p-3"
            onclick={() => toggleItem(i)}
            aria-expanded={abertoIdx === i}
          >
            <span class="acc-dot w-2.5 h-2.5 rounded-full flex-shrink-0" style="background: {corDoTipo(e.tipo, e.status)}"></span>
            <span class="badge badge-sm badge-ghost hidden sm:inline-flex">{labelDoTipo(e.tipo)}</span>
            <span class="acc-titulo flex-1 min-w-0">
              <span class="acc-titulo-texto block truncate text-sm font-medium">{e.titulo}</span>
              <span class="acc-sub block text-xs text-zinc-500 truncate">{labelDoTipo(e.tipo)}{e.agente ? ' · ' + e.agente : ''}{e.status ? ' · ' + e.status : ''}{e.tipo === 'execucao' && e.gatilho ? ' · gatilho: ' + labelGatilho(e.gatilho) : ''}</span>
            </span>
            <span class="acc-quando text-xs text-zinc-500 font-mono flex-shrink-0">{e.quando ? formatarDataLocal(e.quando) : '—'}</span>
            <span class="acc-seta text-xs text-zinc-500">{abertoIdx === i ? '▴' : '▾'}</span>
          </button>
          {#if abertoIdx === i}
            <div class="acc-body p-3 border-t border-base-300 bg-base-200/30" id="acc-body-{i}">
              {#if detalhesCarregando.has(i)}
                <div class="acc-loading text-sm text-zinc-500">carregando detalhes…</div>
              {:else if detalhesCache.has(i)}
                {@html detalhesCache.get(i) ?? ''}
              {:else}
                <div class="acc-loading text-sm text-zinc-500">carregando detalhes…</div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .page-header { display:flex; justify-content:space-between; align-items:flex-start; gap:.75rem; margin-bottom:1rem; flex-wrap:wrap; }
  .page-header-titulo { font-size:1.5rem; font-weight:700; display:flex; align-items:center; gap:.5rem; }
  .page-header-sub { font-size:.8125rem; color:var(--muted); margin-top:.2rem; }
  .page-header-acoes { display:flex; align-items:center; gap:.5rem; flex-wrap:wrap; }
  .hist-acordeao { display:flex; flex-direction:column; }
  .acc-header:hover { background: rgba(255,255,255,0.03); }
  .acc-grid { display:grid; gap:.35rem; font-size:.78rem; }
  .acc-k { color: var(--muted); font-size:.72rem; text-transform:uppercase; letter-spacing:.04em; }
  .acc-v { font-size:.8125rem; }
  .acc-log { background:#0f0f0f; border:1px solid #222; border-radius:.4rem; padding:.5rem .6rem; font-size:.75rem; white-space:pre-wrap; max-height:18rem; overflow:auto; }
  .acc-desc { margin-top:.5rem; }
  .acc-run { display:flex; gap:.5rem; font-size:.75rem; padding:.2rem 0; border-top:1px solid #222; }
  .acc-run.pulou { color: var(--muted); }
  .acc-conversa { display:flex; flex-direction:column; gap:.5rem; }
  .acc-msg { border-radius:.5rem; padding:.5rem .6rem; border:1px solid #222; }
  .acc-user { background: rgba(59,130,246,.08); border-color: rgba(59,130,246,.2); }
  .acc-assist { background:#0f0f0f; }
  .acc-role { font-size:.7rem; color: var(--muted); text-transform:uppercase; }
  .acc-msg-texto { font-size:.8125rem; margin-top:.15rem; }
</style>
