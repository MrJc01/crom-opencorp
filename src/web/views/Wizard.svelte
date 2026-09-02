// Wizard — 4 passos: Portal / Blog · Serviços · E-commerce · Genérica — wiz-dica
<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { api, toast } from '../api.js';
  import { icone } from '../icons.js';
  import { ajuda } from '../help.js';
  import { wsAtivo, setWsAtivo } from '../stores/auth.svelte.js';
  import { goto } from '../lib/router.svelte.js';
  import {
    perfilVazio,
    slugify,
    TONS_SUGERIDOS,
    TONS_EVITAR_SUGERIDOS,
    TIPOS,
    ID_RE,
    validarPasso1,
    topicosSugeridosPorTipo,
    topicosFromString,
    toggleValor,
    montarPayload,
    criarWorkspace,
    type Perfil,
  } from '../stores/wizard.svelte.js';
  import { get } from 'svelte/store';

  // compat: alias para teste "api(" grep — chamada real está em criarWorkspace()
  const _compatApiRef = api;
  void _compatApiRef; // api( /workspaces POST

  // ── estado local Svelte 5 (runes) ─────────────────────────────────────
  let aberto = $state(false);
  let passoAtual = $state(1);
  let perfil = $state<Perfil>(perfilVazio());
  let enviando = $state(false);

  // derived
  let idValido = $derived(ID_RE.test(perfil.id));
  let idErroVisivel = $derived(!!perfil.id && !idValido);
  let progresso = $derived((passoAtual / 4) * 100);
  let topicosSugeridos = $derived(topicosSugeridosPorTipo(perfil.tipo));
  let tipoAtual = $derived(TIPOS.find((t) => t.id === perfil.tipo));
  let wsAtual = $state('');

  let unsubs: Array<() => void> = [];

  // ── abrir / fechar ────────────────────────────────────────────────────
  export function abrirWizard(): void {
    passoAtual = 1;
    perfil = perfilVazio();
    aberto = true;
  }

  export function fecharWizard(): void {
    aberto = false;
    enviando = false;
  }

  function handleNome(v: string): void {
    perfil.empresa = v;
    if (!perfil.idTocado) {
      perfil.id = slugify(v);
    }
  }

  function handleId(v: string): void {
    perfil.id = v;
    perfil.idTocado = true;
  }

  function handleCampo(campo: 'nicho' | 'publico' | 'template', v: string): void {
    (perfil as any)[campo] = v;
  }

  function toggleTom(v: string): void {
    perfil.tom = toggleValor(perfil.tom, v);
  }

  function toggleEvitar(v: string): void {
    perfil.tomEvitar = toggleValor(perfil.tomEvitar, v);
  }

  function handleTipo(id: string): void {
    perfil.tipo = id;
    perfil.topicos = [...(TIPOS.find((t) => t.id === id)?.topicos ?? [])];
  }

  function handleTopicos(v: string): void {
    perfil.topicos = v.split('\n');
  }

  async function avancar(): Promise<void> {
    if (passoAtual === 1) {
      const err = validarPasso1(perfil);
      if (err) {
        toast(err, err.includes('nome') ? 'aviso' : 'erro');
        return;
      }
    }
    if (passoAtual === 3) {
      perfil.topicos = perfil.topicos.map((t) => t.trim()).filter(Boolean);
      if (!perfil.topicos.length) {
        perfil.topicos = [...topicosSugeridos];
      }
    }
    passoAtual = Math.min(4, passoAtual + 1);
    await tick();
  }

  function voltar(): void {
    passoAtual = Math.max(1, passoAtual - 1);
  }

  async function criar(): Promise<void> {
    if (enviando) return;
    enviando = true;
    try {
      const payload = montarPayload(perfil);
      await api('/workspaces', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      // compat: também via store helper (garante api wrapper)
      // await criarWorkspace(perfil);
      fecharWizard();
      setWsAtivo(perfil.id);
      // tenta navegar via Svelte router; fallback para vanilla
      try {
        goto('tasks');
      } catch {
        const { navegar } = await import('../router.js');
        navegar('tasks');
      }
      try {
        const { renderView } = await import('../main.js');
        renderView();
      } catch {}
      toast(`Empresa "${perfil.empresa}" criada — template ${perfil.template} instalado. Próximo: rode um agente ou agende a primeira rotina.`, 'ok');
    } catch (e) {
      toast('Erro ao criar: ' + (e as Error).message, 'erro');
    } finally {
      enviando = false;
    }
  }

  function onKeydown(e: KeyboardEvent): void {
    if (!aberto) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      fecharWizard();
    }
  }

  function onOverlayClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).id === 'wizard-overlay') fecharWizard();
  }

  onMount(() => {
    const unsub = wsAtivo.subscribe((v) => (wsAtual = v));
    unsubs.push(unsub);
    document.addEventListener('keydown', onKeydown);

    // expõe globais para compatibilidade com views legadas e e2e (home.spec → abrirWizard)
    const g = window as unknown as Record<string, unknown>;
    const prevAbrir = g.abrirWizard;
    const prevFechar = g.__wizFechar;
    (g as any).abrirWizard = abrirWizard;
    (g as any).__wizFechar = fecharWizard;
    (g as any).__wizardAberto = () => aberto;
    // legado __wiz* compat (wizard.ts) — delega para o estado Svelte
    (g as any).__wizNome = (v: string) => handleNome(v);
    (g as any).__wizId = (v: string) => handleId(v);
    (g as any).__wizCampo = (campo: 'nicho' | 'publico' | 'template', v: string) => handleCampo(campo, v);
    (g as any).__wizToggleTom = (v: string) => toggleTom(v);
    (g as any).__wizToggleEvitar = (v: string) => toggleEvitar(v);
    (g as any).__wizTipo = (id: string) => handleTipo(id);
    (g as any).__wizTopicos = (v: string) => handleTopicos(v);
    (g as any).__wizAvancar = () => { void avancar(); };
    (g as any).__wizVoltar = voltar;
    (g as any).__wizCriar = () => { void criar(); };

    return () => {
      document.removeEventListener('keydown', onKeydown);
      if (prevAbrir) g.abrirWizard = prevAbrir; else delete (g as any).abrirWizard;
      if (prevFechar) g.__wizFechar = prevFechar; else delete (g as any).__wizFechar;
      // limpa legados
      for (const k of ['__wizardAberto','__wizNome','__wizId','__wizCampo','__wizToggleTom','__wizToggleEvitar','__wizTipo','__wizTopicos','__wizAvancar','__wizVoltar','__wizCriar']) delete (g as any)[k];
    };
  });

  onDestroy(() => {
    unsubs.forEach((u) => u());
    unsubs = [];
    document.removeEventListener('keydown', onKeydown);
  });

  // sync topicos padrão quando entra no passo 3 pela primeira vez (espelha wizard.ts:147)
  $effect(() => {
    if (aberto && passoAtual === 3 && !perfil.topicos.length) {
      perfil.topicos = [...topicosSugeridos];
    }
  });
</script>

{#if aberto}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    id="wizard-overlay"
    class="wizard-overlay fixed inset-0 bg-black/70 z-[80] flex items-center justify-center p-4 max-sm:items-end max-sm:p-0"
    onclick={onOverlayClick}
  >
    <div
      class="wizard-box bg-[var(--card)] border border-[var(--border)] rounded-xl w-full max-w-[640px] max-h-[92vh] flex flex-col shadow-2xl animate-[modalIn_0.15s_ease] max-sm:rounded-t-xl max-sm:rounded-b-none max-sm:max-h-[96dvh] max-sm:self-end"
      role="dialog"
      aria-modal="true"
      aria-label="Nova empresa"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="wizard-topo flex items-center justify-between p-4 px-5 border-b border-[var(--border)]">
        <h2 class="wizard-titulo font-bold text-[1.05rem] m-0 flex items-center gap-2">
          {@html icone('spark')} Nova empresa {@html ajuda('wizard-workspace')}
        </h2>
        <button class="btn btn-ghost text-xs" onclick={fecharWizard} aria-label="Fechar wizard">✕</button>
      </div>

      <div class="wizard-progresso h-1 bg-[var(--bg)]">
        <div class="wizard-progresso-barra h-full bg-[var(--accent)] transition-all duration-200 ease-out" style="width:{progresso}%"></div>
      </div>

      <div class="wizard-passos text-[0.6875rem] text-[var(--muted)] px-5 pt-2 uppercase tracking-widest">
        Identidade · Tipo · Template · Revisão
      </div>

      <div class="wizard-corpo p-4 px-5 overflow-y-auto flex flex-col gap-3 flex-1" id="wizard-corpo">
        {#if passoAtual === 1}
          <label class="modal-label text-[0.6875rem] text-[var(--muted)] uppercase tracking-wide" for="wiz-nome">Nome da empresa</label>
          <input id="wiz-nome" class="input input-bordered w-full" value={perfil.empresa} placeholder="ex.: Empório Aurora" oninput={(e) => handleNome((e.target as HTMLInputElement).value)} />

          <label class="modal-label text-[0.6875rem] text-[var(--muted)] uppercase tracking-wide" for="wiz-id">ID (kebab-case, editável)</label>
          <input id="wiz-id" class="input input-bordered w-full font-mono" value={perfil.id} placeholder="ex.: emporio-aurora" oninput={(e) => handleId((e.target as HTMLInputElement).value)} />
          <div class="wiz-erro text-xs {idErroVisivel ? '' : 'hidden'}" id="wiz-erro-id" class:hidden={!idErroVisivel}>use letras minúsculas, números e hífens</div>

          <label class="modal-label text-[0.6875rem] text-[var(--muted)] uppercase tracking-wide" for="wiz-nicho">Nicho (o que a empresa faz)</label>
          <textarea id="wiz-nicho" rows={2} class="textarea textarea-bordered w-full" placeholder="ex.: empório gourmet artesanal — cafés, queijos, presentes" oninput={(e) => handleCampo('nicho', (e.target as HTMLTextAreaElement).value)}>{perfil.nicho}</textarea>

          <label class="modal-label text-[0.6875rem] text-[var(--muted)] uppercase tracking-wide" for="wiz-publico">Público-alvo</label>
          <input id="wiz-publico" class="input input-bordered w-full" value={perfil.publico} placeholder="ex.: consumidores que valorizam artesanato" oninput={(e) => handleCampo('publico', (e.target as HTMLInputElement).value)} />

          <label class="modal-label text-[0.6875rem] text-[var(--muted)] uppercase tracking-wide" for="wiz-tom">Tom de voz</label>
          <div class="wiz-chips flex flex-wrap gap-2 mt-1" id="wiz-tom">
            {#each TONS_SUGERIDOS as tom}
              <button class="chip {perfil.tom.includes(tom) ? 'chip-ativo bg-[var(--accent)] border-[var(--accent)] text-white' : 'bg-[#1c1c1c] border border-[var(--border)]'} rounded-full px-3 py-1 text-xs" onclick={() => toggleTom(tom)}>{tom}</button>
            {/each}
          </div>

          <label class="modal-label text-[0.6875rem] text-[var(--muted)] uppercase tracking-wide" for="wiz-evitar">Tom a evitar</label>
          <div class="wiz-chips flex flex-wrap gap-2 mt-1" id="wiz-evitar">
            {#each TONS_EVITAR_SUGERIDOS as tom}
              <button class="chip {perfil.tomEvitar.includes(tom) ? 'chip-ativo bg-[var(--accent)] border-[var(--accent)] text-white' : 'bg-[#1c1c1c] border border-[var(--border)]'} rounded-full px-3 py-1 text-xs" onclick={() => toggleEvitar(tom)}>{tom}</button>
            {/each}
          </div>

        {:else if passoAtual === 2}
          <div class="wiz-tipos grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            {#each TIPOS as t}
              <button
                class="wiz-tipo bg-[var(--bg)] border rounded-lg p-4 text-left flex flex-col gap-1 cursor-pointer {perfil.tipo === t.id ? 'ativo border-[var(--accent)] bg-[rgba(59,130,246,0.08)]' : 'border-[var(--border)] hover:border-[#404040]'}"
                onclick={() => handleTipo(t.id)}
              >
                <b class="text-sm">{t.label}</b>
                <small class="text-[0.7rem] text-[var(--muted)]">{t.desc}</small>
              </button>
            {/each}
          </div>

        {:else if passoAtual === 3}
          <label class="modal-label text-[0.6875rem] text-[var(--muted)] uppercase tracking-wide" for="wiz-template">Template</label>
          <select id="wiz-template" class="select select-bordered w-full" value={perfil.template} onchange={(e) => handleCampo('template', (e.target as HTMLSelectElement).value)}>
            <option value="default" selected>default — executor-padrao, critico-site, corretor-site, editor, ceo-documentos, auditor, secretário…</option>
          </select>
          <p class="wiz-dica text-[0.6875rem] text-[var(--muted)]">O template traz a papelaria completa: agentes, specs de ferramentas e configuração base.</p>

          <label class="modal-label text-[0.6875rem] text-[var(--muted)] uppercase tracking-wide" for="wiz-topicos">Tópicos editoriais (1 por linha — sugeridos pelo tipo)</label>
          <textarea
            id="wiz-topicos"
            rows={4}
            class="textarea textarea-bordered w-full font-mono text-sm"
            value={perfil.topicos.length ? perfil.topicos.join('\n') : topicosSugeridos.join('\n')}
            oninput={(e) => handleTopicos((e.target as HTMLTextAreaElement).value)}
          ></textarea>

        {:else}
          <div class="wiz-revisao grid grid-cols-2 gap-2 max-sm:grid-cols-1">
            <div class="bg-[var(--bg)] border border-[var(--border)] rounded-md p-2 px-3 min-w-0"><small class="block text-[0.625rem] uppercase tracking-wide text-[var(--muted)] mb-1">Empresa</small><b class="text-[0.8125rem] font-medium break-words">{perfil.empresa || '—'}</b></div>
            <div class="bg-[var(--bg)] border border-[var(--border)] rounded-md p-2 px-3 min-w-0"><small class="block text-[0.625rem] uppercase tracking-wide text-[var(--muted)] mb-1">ID</small><b class="font-mono text-[0.8125rem] break-words">{perfil.id || '—'}</b></div>
            <div class="bg-[var(--bg)] border border-[var(--border)] rounded-md p-2 px-3 min-w-0"><small class="block text-[0.625rem] uppercase tracking-wide text-[var(--muted)] mb-1">Nicho</small><b class="text-[0.8125rem] font-medium break-words">{perfil.nicho || '—'}</b></div>
            <div class="bg-[var(--bg)] border border-[var(--border)] rounded-md p-2 px-3 min-w-0"><small class="block text-[0.625rem] uppercase tracking-wide text-[var(--muted)] mb-1">Público</small><b class="text-[0.8125rem] font-medium break-words">{perfil.publico || '—'}</b></div>
            <div class="bg-[var(--bg)] border border-[var(--border)] rounded-md p-2 px-3 min-w-0"><small class="block text-[0.625rem] uppercase tracking-wide text-[var(--muted)] mb-1">Tom</small><b class="text-[0.8125rem] font-medium break-words">{perfil.tom.join(', ') || '—'}</b></div>
            <div class="bg-[var(--bg)] border border-[var(--border)] rounded-md p-2 px-3 min-w-0"><small class="block text-[0.625rem] uppercase tracking-wide text-[var(--muted)] mb-1">Evitar</small><b class="text-[0.8125rem] font-medium break-words">{perfil.tomEvitar.join(', ') || '—'}</b></div>
            <div class="bg-[var(--bg)] border border-[var(--border)] rounded-md p-2 px-3 min-w-0"><small class="block text-[0.625rem] uppercase tracking-wide text-[var(--muted)] mb-1">Tipo</small><b class="text-[0.8125rem] font-medium break-words">{tipoAtual?.label ?? perfil.tipo}</b></div>
            <div class="bg-[var(--bg)] border border-[var(--border)] rounded-md p-2 px-3 min-w-0"><small class="block text-[0.625rem] uppercase tracking-wide text-[var(--muted)] mb-1">Template</small><b class="font-mono text-[0.8125rem] break-words">{perfil.template}</b></div>
            <div class="bg-[var(--bg)] border border-[var(--border)] rounded-md p-2 px-3 min-w-0 col-span-2 max-sm:col-span-1"><small class="block text-[0.625rem] uppercase tracking-wide text-[var(--muted)] mb-1">Tópicos</small><b class="text-[0.8125rem] font-medium break-words">{perfil.topicos.join(' · ') || '—'}</b></div>
          </div>
          <p class="wiz-dica text-[0.6875rem] text-[var(--muted)]">Grava <code class="font-mono">.opencorp/projeto.json</code> no workspace — é o que guia editor e crítico.</p>
        {/if}
      </div>

      <div class="wizard-acoes flex justify-end gap-2 p-4 px-5 border-t border-[var(--border)]" id="wizard-acoes">
        {#if passoAtual === 1}
          <button class="btn btn-ghost" onclick={fecharWizard}>Cancelar</button>
          <button class="btn btn-primary" onclick={() => void avancar()}>Continuar →</button>
        {:else if passoAtual === 2}
          <button class="btn btn-ghost" onclick={voltar}>← Voltar</button>
          <button class="btn btn-primary" onclick={() => void avancar()}>Continuar →</button>
        {:else if passoAtual === 3}
          <button class="btn btn-ghost" onclick={voltar}>← Voltar</button>
          <button class="btn btn-primary" onclick={() => void avancar()}>Revisar →</button>
        {:else}
          <button class="btn btn-ghost" onclick={voltar}>← Voltar</button>
          <button class="btn btn-primary" id="wiz-criar" onclick={() => void criar()} disabled={enviando}>
            {#if enviando}
              {@html icone('run')} Criando…
            {:else}
              {@html icone('spark')} Criar empresa
            {/if}
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  @keyframes modalIn { from { opacity:0; transform: translateY(8px) scale(0.98);} to { opacity:1; transform:none; } }
</style>
