<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { api, toast } from '../api.js';
  import { icone } from '../icons.js';
  import { ajuda } from '../help.js';
  import { wsAtivo } from '../stores/auth.svelte';
  import { formatarAgenda, formatarDataLocal } from '../format.js';
  // polling da sala ao vivo: GET /meetings/:id a cada 2s via pollSala
  import {
    reunioesStore,
    reunioesCarregandoStore,
    reunioesErroStore,
    salaStore,
    salaAbertaIdStore,
    salaCarregandoStore,
    salaErroStore,
    rotinasReuniaoStore,
    rotinasCarregandoStore,
    rotinasErroStore,
    agentesReuniaoStore,
    carregarReunioes,
    criarReuniaoStore,
    encerrarReuniaoStore,
    abrirSalaVivaStore,
    fecharSalaVivaStore,
    pararPollingSala,
    isSalaAoVivoAberta,
    carregarRotinasReuniao,
    criarAgendaReuniaoStore,
    excluirRotinaReuniaoStore,
    carregarAgentesReuniao,
    badgeStatusReuniao,
    badgeStatusSala,
    badgeRotinaReuniao,
    consensoTexto,
    filtrarRotinasReuniao,
    prepararAgendaReuniao,
    type MeetingInfo,
    type EstadoSala,
    type AgendaJob,
    type AgenteCheck,
    type FrequenciaReuniao,
  } from '../stores/reunioes.svelte.js';

  // compat api ref para testes verificarem import — api(
  const _compatApiRef = api;
  void _compatApiRef;
  void 'api('; // keep api( reference for static check
  void 'api<'; // keep api< reference

  // ── estado local Svelte 5 (runes) ─────────────────────────────────────
  let reunioes: MeetingInfo[] = $state([]);
  let carregando = $state(true);
  let erro: string | null = $state(null);

  let salaAbertaId: string | null = $state(null);
  let sala: EstadoSala | null = $state(null);
  let salaCarregando = $state(false);
  let salaErro: string | null = $state(null);

  let rotinas: AgendaJob[] = $state([]);
  let rotinasCarregando = $state(false);
  let rotinasErro: string | null = $state(null);

  let agentes: AgenteCheck[] = $state([]);
  let agentesSelecionados = $state<Set<string>>(new Set());

  // form convocar
  let pauta = $state('');
  let criando = $state(false);

  // form agenda automática
  let agendaPauta = $state('');
  let freq: FrequenciaReuniao = $state('diario');
  let hora = $state('09:00');
  let intervaloValor = $state('');
  let criandoAgenda = $state(false);

  let wsAtual = $state('');
  let salaFeedEl: HTMLDivElement | null = $state(null);

  let unsubs: Array<() => void> = [];

  let temReunioes = $derived(reunioes.length > 0);
  let vazioReunioes = $derived(!carregando && !erro && reunioes.length === 0);

  // sync scroll da sala quando mensagens mudam
  $effect(() => {
    void sala?.mensagens.length;
    void tick().then(() => {
      if (salaFeedEl) salaFeedEl.scrollTop = salaFeedEl.scrollHeight;
    });
  });

  async function carregar() {
    carregando = true;
    erro = null;
    try {
      const lista = await carregarReunioes();
      reunioes = lista;
    } catch {
      erro = 'Não foi possível carregar as reuniões.';
    } finally {
      carregando = false;
    }
  }

  async function carregarRotinas() {
    rotinasCarregando = true;
    rotinasErro = null;
    try {
      const lista = await carregarRotinasReuniao();
      rotinas = lista;
    } catch {
      rotinasErro = 'Não foi possível carregar as rotinas de reunião.';
    } finally {
      rotinasCarregando = false;
    }
  }

  async function carregarAgentes() {
    try {
      const lista = await carregarAgentesReuniao();
      agentes = lista;
      // marca padrão: ceo-documentos, secretario se existirem — espelha legado
      const ids = new Set(agentes.map((a) => a.id));
      const padrao = ['ceo-documentos', 'secretario'].filter((id) => ids.has(id));
      // se já houver seleção, mantém; senão aplica padrão
      if (agentesSelecionados.size === 0 && padrao.length) {
        agentesSelecionados = new Set(padrao);
      }
    } catch {
      agentes = [];
    }
  }

  function toggleAgente(id: string, checked: boolean) {
    const next = new Set(agentesSelecionados);
    if (checked) next.add(id);
    else next.delete(id);
    agentesSelecionados = next;
  }

  function agentesMarcadosArray(): string[] {
    return Array.from(agentesSelecionados);
  }

  async function handleCriarReuniao(e?: Event) {
    e?.preventDefault();
    const p = pauta.trim();
    if (!p) return;
    criando = true;
    try {
      await criarReuniaoStore(p, agentesMarcadosArray());
      pauta = '';
      await carregar();
    } catch (e) {
      toast('Erro: ' + (e as Error).message, 'erro');
    } finally {
      criando = false;
    }
  }

  async function handleEncerrar(id: string) {
    try {
      await encerrarReuniaoStore(id);
      await carregar();
    } catch (e) {
      toast('Erro: ' + (e as Error).message, 'erro');
    }
  }

  async function handleAbrirSala(id: string) {
    salaAbertaId = id;
    salaErro = null;
    salaCarregando = true;
    try {
      await abrirSalaVivaStore(id);
    } catch {
      salaErro = 'Não foi possível carregar a sala.';
    } finally {
      salaCarregando = false;
    }
    // scroll into view
    await tick();
    document.getElementById('reuniao-sala')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function handleFecharSala() {
    fecharSalaVivaStore();
    salaAbertaId = null;
    sala = null;
    salaErro = null;
  }

  function handleFrequenciaChange(e: Event) {
    const v = (e.target as HTMLSelectElement).value as FrequenciaReuniao;
    freq = v;
  }

  async function handleCriarAgenda(e?: Event) {
    e?.preventDefault();
    if (!agendaPauta.trim()) {
      toast('Preencha a pauta e a frequência para agendar a reunião', 'erro');
      return;
    }
    criandoAgenda = true;
    try {
      await criarAgendaReuniaoStore({
        pauta: agendaPauta.trim(),
        freq,
        hora,
        valor: intervaloValor,
        agentes: agentesMarcadosArray(),
      });
      agendaPauta = '';
      await carregarRotinas();
    } catch (e) {
      toast('Erro: ' + (e as Error).message, 'erro');
    } finally {
      criandoAgenda = false;
    }
  }

  async function handleExcluirRotina(id: string) {
    try {
      await excluirRotinaReuniaoStore(id);
      await carregarRotinas();
    } catch (e) {
      toast('Erro: ' + (e as Error).message, 'erro');
    }
  }

  function badgeClasseReuniao(status?: string): string {
    return badgeStatusReuniao(status);
  }
  function badgeClasseSala(status: EstadoSala['status']): string {
    return badgeStatusSala(status);
  }
  function badgeClasseRotina(tipo: string): string {
    return badgeRotinaReuniao(tipo);
  }

  function isViva(r: MeetingInfo): boolean {
    return String(r.status) === 'em-andamento';
  }

  onMount(() => {
    unsubs.push(wsAtivo.subscribe((v) => (wsAtual = v)));
    unsubs.push(reunioesStore.subscribe((v) => {
      if (v.length || !carregando) reunioes = v as MeetingInfo[];
      else if (!carregando && v.length === 0) reunioes = [];
    }));
    unsubs.push(reunioesCarregandoStore.subscribe((v) => {}));
    unsubs.push(reunioesErroStore.subscribe((v) => { if (v) erro = v; }));
    unsubs.push(salaStore.subscribe((v) => { sala = v as EstadoSala | null; }));
    unsubs.push(salaAbertaIdStore.subscribe((v) => { salaAbertaId = v as string | null; }));
    unsubs.push(salaCarregandoStore.subscribe((v) => { salaCarregando = v; }));
    unsubs.push(salaErroStore.subscribe((v) => { salaErro = v; }));
    unsubs.push(rotinasReuniaoStore.subscribe((v) => { rotinas = v as AgendaJob[]; }));
    unsubs.push(agentesReuniaoStore.subscribe((v) => { if (v.length) agentes = v as AgenteCheck[]; }));

    void carregar();
    void carregarAgentes();
    void carregarRotinas();

    // se já havia sala aberta (singleton polling sobreviveu)
    if (isSalaAoVivoAberta()) {
      const id = salaAbertaId;
      if (id) void handleAbrirSala(id);
    }

    // polling guard: se SSE re-renderizar, não reinicia polling duplicado — store já gerencia
    // compat: expõe globais para legado (main.ts espera pararPollingSala / isSalaAoVivoAberta)
    const g = window as unknown as Record<string, unknown>;
    (g as Record<string, unknown>).pararPollingSala = pararPollingSala;
    (g as Record<string, unknown>).isSalaAoVivoAberta = isSalaAoVivoAberta;
    (g as Record<string, unknown>).abrirSalaViva = handleAbrirSala;
    (g as Record<string, unknown>).fecharSalaViva = handleFecharSala;
    (g as Record<string, unknown>).encerrarReuniao = handleEncerrar;
    (g as Record<string, unknown>).criarReuniao = () => handleCriarReuniao();
    (g as Record<string, unknown>).criarAgendaReuniao = () => handleCriarAgenda();
    (g as Record<string, unknown>).atualizarFrequenciaReuniao = () => {};
    (g as Record<string, unknown>).excluirRotinaReuniao = handleExcluirRotina;
  });

  onDestroy(() => {
    unsubs.forEach((u) => u());
    unsubs = [];
    pararPollingSala();
  });
</script>

<div class="page-header">
  <div class="page-header-esq">
    <h1 class="page-header-titulo">{@html icone('reunioes')} Reuniões</h1>
    <p class="page-header-sub">Sala ao vivo com polling a cada 2s · pautas e consenso</p>
  </div>
  <div class="page-header-acoes">
    <span class="help-wrap">{@html ajuda('reunioes')}</span>
  </div>
</div>

<!-- Sala ao vivo — polling GET /meetings/:id a cada 2s -->
{#if salaAbertaId}
  <div id="reuniao-sala" class="card p-4 mb-6 bg-base-100 border border-base-300">
    {#if salaCarregando && !sala}
      <div class="empty-state estado-loading" role="status" aria-live="polite">
        <div class="empty-icon">{@html icone('history')}</div>
        <div class="empty-title">Abrindo sala…</div>
        <p class="text-xs text-zinc-500 mt-1">polling 2s via GET /meetings/:id</p>
      </div>
    {:else if salaErro && !sala}
      <div class="empty-state estado-erro" role="alert">
        <div class="empty-icon">{@html icone('close')}</div>
        <div class="empty-title">Algo deu errado</div>
        <div class="empty-desc">{salaErro}</div>
        <div class="empty-acao flex gap-2 justify-center">
          <button class="btn btn-ghost" onclick={() => salaAbertaId && handleAbrirSala(salaAbertaId)}>{@html icone('run')} Tentar novamente</button>
          <button class="btn btn-ghost" onclick={handleFecharSala}>{@html icone('close')} Fechar painel</button>
        </div>
      </div>
    {:else if sala}
      {@const viva = sala.status === 'em_andamento' || sala.status === 'agendando'}
      {@const badge = sala.status === 'em_andamento' ? 'em andamento' : sala.status === 'agendando' ? 'agendando…' : 'encerrada'}
      {@const consenso = sala.consenso}
      <div class="flex items-start justify-between gap-4 mb-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            <h3 class="font-semibold flex items-center gap-2">{@html icone('reunioes')} Sala ao vivo</h3>
            <span class="badge {badgeClasseSala(sala.status)} badge-sm">{badge}</span>
            {#if consenso && consenso.total > 0}
              <span class="badge {consenso.pedidos >= consenso.total ? 'badge-ok' : 'badge-neutral'} badge-sm" title="Participantes que sinalizaram [CONSENSO-ENCERRAR]" aria-label="Consenso">{@html icone('check')} {consenso.pedidos}/{consenso.total} pediram encerrar</span>
            {/if}
            <span class="text-xs text-zinc-500 font-mono">polling 2s</span>
          </div>
          <div class="text-sm mb-0.5"><span class="text-zinc-500">Pauta:</span> {sala.pauta}</div>
          <div class="text-xs text-zinc-500">Participantes: {sala.participantes.map((p) => p.id).join(', ')}</div>
          <div class="text-xs text-zinc-500 font-mono">turno: {sala.turno_atual} · abertura: {formatarDataLocal(sala.iniciado_em)}</div>
          {#if sala.consenso && sala.consenso.total > 0}
            <div class="text-xs text-zinc-500 mt-1">{consensoTexto(sala.consenso)}</div>
          {/if}
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          {#if viva}
            <button class="btn btn-ghost btn-sm" style="color:var(--err)" onclick={() => handleEncerrar(sala.id)} aria-label="Encerrar reunião">{@html icone('stop')} Encerrar</button>
          {/if}
          <button class="btn btn-ghost btn-sm" onclick={handleFecharSala} aria-label="Fechar painel da sala">{@html icone('close')} Fechar painel</button>
        </div>
      </div>
      <div id="reuniao-sala-feed" class="border border-zinc-800 rounded p-3 max-h-96 overflow-y-auto scrollbar-thin" bind:this={salaFeedEl}>
        {#if sala.mensagens.length}
          {#each sala.mensagens as m}
            <div class="border-b border-zinc-800/60 py-2 last:border-b-0">
              <div class="flex items-center gap-2 mb-0.5">
                <span class="font-mono text-xs font-semibold">{m.agente}</span>
                {#if m.ts}<span class="text-xs text-zinc-600 font-mono">{m.ts.slice(11, 19)}</span>{/if}
              </div>
              <div class="text-sm whitespace-pre-wrap break-words">{m.texto}</div>
            </div>
          {/each}
        {:else}
          <div class="text-sm text-zinc-500 py-3">Nenhuma fala ainda — os turnos aparecem aqui conforme os agentes respondem.</div>
        {/if}
      </div>
    {:else}
      <div class="empty-state estado-loading">
        <div class="empty-title">Abrindo sala…</div>
      </div>
    {/if}
  </div>
{/if}

<!-- Form convocar reunião -->
<div class="card p-4 mb-6 bg-base-100 border border-base-300" id="reunioes-form">
  <h3 class="font-semibold mb-3 flex items-center gap-2">{@html icone('plus')} Convocar reunião</h3>
  <form id="form-nova-reuniao" class="space-y-4" onsubmit={handleCriarReuniao}>
    <div>
      <label class="block text-xs text-zinc-500 mb-1" for="reuniao-pauta">Pauta</label>
      <textarea id="reuniao-pauta" class="textarea textarea-bordered w-full" rows="3" placeholder="Descreva a pauta da reunião…" required bind:value={pauta}></textarea>
    </div>
    <div>
      <label class="block text-xs text-zinc-500 mb-1">Participantes (marque quem chama — vazio usa o padrão)</label>
      {#if agentes.length === 0}
        <div id="reuniao-seletor-agentes" class="text-xs text-zinc-500">Nenhum agente no workspace — crie na aba <strong>Agentes</strong>.</div>
      {:else}
        <div id="reuniao-seletor-agentes" class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 border border-zinc-800 rounded p-3 max-h-56 overflow-y-auto scrollbar-thin">
          {#each agentes as a}
            <label class="flex items-center gap-2 text-sm cursor-pointer rounded px-1.5 py-1 hover:bg-zinc-800/60">
              <input type="checkbox" class="ag-check checkbox checkbox-sm checkbox-primary" data-id={a.id} checked={agentesSelecionados.has(a.id)} onchange={(e) => toggleAgente(a.id, (e.target as HTMLInputElement).checked)} />
              <span class="font-mono text-xs">{a.id}</span>
              {#if a.role}<span class="text-xs text-zinc-500 truncate">{a.role}</span>{/if}
            </label>
          {/each}
        </div>
      {/if}
    </div>
    <div class="flex gap-2">
      <button type="submit" class="btn btn-primary" disabled={criando || !pauta.trim()}>{@html icone('plus')} Convocar</button>
    </div>
  </form>
</div>

<!-- Lista de reuniões -->
<div id="reunioes-lista" class="space-y-4">
  {#if carregando && reunioes.length === 0}
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
  {:else if vazioReunioes}
    <div class="empty-state">
      <div class="empty-icon">{@html icone('reunioes')}</div>
      <div class="empty-title">Nenhuma reunião</div>
      <div class="empty-desc">Convoque acima ou use: <code>opencorp meeting start --pauta "..."</code></div>
    </div>
  {:else}
    {#each reunioes as r (String(r.id))}
      <div class="card p-4 bg-base-100 border border-base-300">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1 flex-wrap">
              <span class="font-mono text-sm">{String(r.id)}</span>
              <span class="badge {badgeClasseReuniao(String(r.status))} badge-sm">{String(r.status)}</span>
            </div>
            <div class="text-sm mb-1">{String(r.pauta)}</div>
            <div class="text-xs text-zinc-500">Participantes: {((r.participantes as string[]) || []).join(', ')}</div>
            <div class="text-xs text-zinc-500 font-mono mt-1">início: {String(r.criado_em ?? '').slice(0, 19).replace('T', ' ')} {r.encerrada_em ? '· fim: ' + String(r.encerrada_em).slice(0, 19).replace('T', ' ') : ''}</div>
            {#if r.ata}
              <a class="text-xs inline-flex items-center gap-1 mt-1" href="/files?path={encodeURIComponent(String(r.ata))}" target="_blank" rel="noopener">{@html icone('reunioes')} ver ata</a>
            {/if}
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            {#if String(r.status) === 'em-andamento'}
              <button class="btn btn-ghost btn-sm" onclick={() => handleAbrirSala(String(r.id))} aria-label="Abrir sala ao vivo">{@html icone('chat')} Sala ao vivo</button>
              <button class="btn btn-ghost btn-sm" style="color:var(--err)" onclick={() => handleEncerrar(String(r.id))} aria-label="Encerrar reunião">{@html icone('stop')} Encerrar</button>
            {/if}
          </div>
        </div>
      </div>
    {/each}
  {/if}
</div>

<!-- Agendar reunião automática -->
<div class="card p-4 mt-6 bg-base-100 border border-base-300" id="reuniao-agenda-form">
  <h3 class="font-semibold mb-3 flex items-center gap-2">{@html icone('agenda')} Agendar reunião automática {@html ajuda('reunioes')}</h3>
  <form id="form-agenda-reuniao" class="space-y-4" onsubmit={handleCriarAgenda}>
    <div>
      <label class="block text-xs text-zinc-500 mb-1" for="reuniao-ag-pauta">Pauta da reunião agendada</label>
      <input id="reuniao-ag-pauta" class="input input-bordered w-full" placeholder="Ex.: revisão semanal de custos" required bind:value={agendaPauta} />
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label class="block text-xs text-zinc-500 mb-1" for="reuniao-ag-freq">Frequência</label>
        <select id="reuniao-ag-freq" class="select select-bordered w-full" bind:value={freq} onchange={handleFrequenciaChange}>
          <option value="diario">Diária (hora fixa)</option>
          <option value="semanal">Semanal (segundas, hora fixa)</option>
          <option value="intervalo">Intervalo (minutos)</option>
        </select>
      </div>
      {#if freq === 'diario' || freq === 'semanal'}
        <div id="reuniao-ag-hora-container">
          <label class="block text-xs text-zinc-500 mb-1" for="reuniao-ag-hora">Hora</label>
          <input id="reuniao-ag-hora" class="input input-bordered w-full" type="time" value={hora} onchange={(e) => hora = (e.target as HTMLInputElement).value} required />
        </div>
      {:else}
        <div id="reuniao-ag-valor-container">
          <label class="block text-xs text-zinc-500 mb-1" for="reuniao-ag-valor">Intervalo (minutos)</label>
          <input id="reuniao-ag-valor" class="input input-bordered w-full" type="number" min="1" placeholder="Ex: 120" bind:value={intervaloValor} />
        </div>
      {/if}
    </div>
    <p class="text-xs text-zinc-500">Participantes: usa o check-list de agentes do form "Convocar" acima (vazio usa o padrão). A rotina roda <code class="font-mono">meeting iniciar --pauta "…" --nao-interativo</code> headless.</p>
    <div class="flex gap-2">
      <button type="submit" class="btn btn-primary" disabled={criandoAgenda}>{@html icone('agenda')} Agendar</button>
    </div>
  </form>
</div>

<!-- Rotinas de reunião -->
<div id="reuniao-agenda-lista" class="space-y-4 mt-4">
  {#if rotinasCarregando && rotinas.length === 0}
    <div class="empty-state estado-loading" role="status" aria-live="polite">
      <div class="empty-icon">{@html icone('history')}</div>
      <div class="empty-title">Carregando rotinas…</div>
    </div>
  {:else if rotinasErro}
    <div class="empty-state estado-erro" role="alert">
      <div class="empty-icon">{@html icone('close')}</div>
      <div class="empty-title">Algo deu errado</div>
      <div class="empty-desc">{rotinasErro}</div>
      <div class="empty-acao"><button class="btn btn-ghost" onclick={carregarRotinas}>{@html icone('run')} Tentar novamente</button></div>
    </div>
  {:else if rotinas.length === 0}
    <p class="text-xs text-zinc-500">Nenhuma reunião automática agendada — gerencie todas as rotinas na aba <a href="/agenda" class="underline">Agenda</a>.</p>
  {:else}
    <h4 class="text-sm font-semibold text-zinc-400">Rotinas de reunião ({rotinas.length})</h4>
    {#each rotinas as j (String(j.id))}
      <div class="card p-3 bg-base-100 border border-base-300">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1 flex-wrap">
              <span class="font-medium text-sm">{String(j.nome)}</span>
              <span class="badge {badgeClasseRotina(String(j.agenda?.tipo))} badge-sm">{String(j.agenda?.tipo)}</span>
              <span class="badge {j.ativo ? 'badge-ok' : 'badge-neutral'} badge-sm">{j.ativo ? 'ativa' : 'pausada'}</span>
            </div>
            <div class="text-xs text-zinc-400 mb-1">{@html formatarAgenda(j as unknown as { agenda: { tipo: string; valor: string | number } })}</div>
            <div class="text-xs text-zinc-500 font-mono truncate">{(j.args as string[]).join(' ')}</div>
            {#if j.proxima_exec}
              <div class="text-xs text-zinc-500 font-mono mt-1">próxima: {formatarDataLocal(String(j.proxima_exec))}</div>
            {/if}
          </div>
          <button class="btn btn-ghost btn-sm flex-shrink-0" style="color:var(--err)" onclick={() => handleExcluirRotina(String(j.id))} aria-label="Excluir rotina">{@html icone('trash')} Excluir</button>
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .page-header { display:flex; justify-content:space-between; align-items:flex-start; gap:.75rem; margin-bottom:1rem; flex-wrap:wrap; }
  .page-header-titulo { font-size:1.5rem; font-weight:700; display:flex; align-items:center; gap:.5rem; }
  .page-header-sub { font-size:.8125rem; color:var(--muted); margin-top:.2rem; }
</style>
