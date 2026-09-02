<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { api, toast, headers } from '../api.js';
  import { getWsAtivo } from '../state.js';
  import { wsAtivo } from '../stores/auth.svelte';
  import { escapeHtml } from '../format.js';
  import { icone } from '../icons.js';
  import { ajuda } from '../help.js';
  import { renderMarkdown } from '../md.js';
  import { setRascunho, getRascunho } from '../rascunho.js';
  import { abrirChatLateral } from '../chat-lateral.js';
  import { modalConfirm } from '../modal.js';
  import {
    esMarkdown,
    modoPadrao,
    modoValido,
    ordenarNos,
    soOpencorp,
    ignorarNo,
    filtrarCaminhos,
    rotuloTab,
    nomeProximoTerminal as nomeProximoTerminalPure,
    MAX_TERMINAIS,
    MAX_CONTEUDO,
    MAX_TABS_RESTAURADAS,
    MAX_RESULTADOS_BUSCA,
    MAX_DIRS_INDICE,
    MAX_NOS_INDICE,
    registrarAbrirArquivo,
    type NoArvoreWeb,
    type TabArquivo,
    type TabTerminal,
    type ModoVer,
  } from '../stores/workspace.svelte.js';

  // ── estado reativo (Svelte 5 runes) ────────────────────────────────────
  let arvore = $state<NoArvoreWeb[] | null>(null);
  let arvoreTruncada = $state(false);
  let erroArvore = $state<string | null>(null);
  let expandidos = $state<Set<string>>(new Set());
  const listaCache = new Map<string, NoArvoreWeb[]>();
  let todosOsCaminhos = $state<Set<string>>(new Set());
  let indiceCompleto = $state(false);
  let indiceEmAndamento = $state(false);

  let tabsArquivo = $state<TabArquivo[]>([]);
  let tabAtiva = $state<string | null>(null);
  let tabsWs = $state<string | null>(null);

  let terminais = $state<TabTerminal[]>([]);
  let terminalAtivo = $state<string | null>(null);

  let buscaValor = $state('');
  let buscaResultados = $state<string[]>([]);
  let buscaAtiva = $state(0);
  let buscaUltimoFiltro = $state('');

  let carregandoArvore = $state(false);
  let editorFoco = $state(false);

  let wsAtual = $state('');

  // derive
  let tabAtual = $derived(tabsArquivo.find((t) => t.caminho === tabAtiva) ?? null);
  let temTabs = $derived(tabsArquivo.length > 0);
  let buscaAberta = $derived(buscaValor.trim().length >= 2);

  let unsubs: Array<() => void> = [];
  let timerRascunho: ReturnType<typeof setTimeout> | undefined;
  let termLogEl: HTMLPreElement | null = $state(null);

  // ── helpers de persistência ────────────────────────────────────────────
  function chaveTabs(): string {
    return 'oc-ws-tabs:' + (getWsAtivo() || '');
  }
  function chaveRascunhos(): string {
    return 'oc-ws-drafts:' + (getWsAtivo() || '');
  }
  function persistirTabs(): void {
    try {
      const salvas = { tabs: tabsArquivo.map((t) => ({ p: t.caminho, m: t.modo })), ativa: tabAtiva };
      localStorage.setItem(chaveTabs(), JSON.stringify(salvas));
    } catch {}
  }
  function lerTabsSalvas(): { tabs: Array<string | { p: string; m?: ModoVer }>; ativa: string | null } | null {
    try {
      const bruto = JSON.parse(localStorage.getItem(chaveTabs()) ?? 'null');
      if (!bruto || !Array.isArray(bruto.tabs)) return null;
      return bruto;
    } catch { return null; }
  }
  function lerRascunhos(): Record<string, { c: string; t: number }> {
    try {
      const r = JSON.parse(localStorage.getItem(chaveRascunhos()) ?? '{}');
      return r && typeof r === 'object' ? r : {};
    } catch { return {}; }
  }
  function persistirRascunhos(): void {
    try {
      const rascunhos = lerRascunhos();
      const vivos: Record<string, { c: string; t: number }> = {};
      for (const t of tabsArquivo) if (t.editado !== t.original) vivos[t.caminho] = { c: t.editado, t: Date.now() };
      localStorage.setItem(chaveRascunhos(), JSON.stringify({ ...rascunhos, ...vivos }));
    } catch {}
  }
  function apagarRascunho(caminho: string): void {
    try {
      const r = lerRascunhos();
      if (!(caminho in r)) return;
      delete r[caminho];
      localStorage.setItem(chaveRascunhos(), JSON.stringify(r));
    } catch {}
  }

  // ── flush (PUT /files) ─────────────────────────────────────────────────
  function urlArquivo(caminho: string): string {
    const ws = getWsAtivo();
    const base = '/files?path=' + encodeURIComponent(caminho);
    return ws ? base + '&workspace=' + encodeURIComponent(ws) : base;
  }
  async function putConteudo(tab: TabArquivo, keepalive: boolean): Promise<void> {
    if (new TextEncoder().encode(tab.editado).length > MAX_CONTEUDO) throw new Error('conteúdo excede 1MB');
    const res = await fetch(urlArquivo(tab.caminho), {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ conteudo: tab.editado }),
      ...(keepalive ? { keepalive: true } : {}),
    } as RequestInit);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    tab.original = tab.editado;
    apagarRascunho(tab.caminho);
  }
  function tabsSujas(): TabArquivo[] {
    return tabsArquivo.filter((t) => t.editado !== t.original);
  }
  async function flushSujo(keepalive: boolean): Promise<void> {
    if (tabsWs !== (getWsAtivo() || null)) return;
    const sujas = tabsSujas();
    if (!sujas.length) return;
    await Promise.allSettled(sujas.map((t) => putConteudo(t, keepalive)));
  }

  // ── helpers árvore ─────────────────────────────────────────────────────
  function semearIndice(nos: NoArvoreWeb[]): void {
    for (const n of nos) {
      if (n.tipo === 'arquivo') {
        const s = new Set(todosOsCaminhos);
        s.add(n.caminho);
        todosOsCaminhos = s;
      }
      if (n.filhos?.length) semearIndice(n.filhos);
    }
  }
  function buscarNo(nos: NoArvoreWeb[], caminho: string): NoArvoreWeb | null {
    for (const n of nos) {
      if (n.caminho === caminho) return n;
      if (n.filhos?.length) {
        const achou = buscarNo(n.filhos, caminho);
        if (achou) return achou;
      }
    }
    return null;
  }
  function filhosDe(no: NoArvoreWeb): NoArvoreWeb[] | null {
    if (listaCache.has(no.caminho)) return listaCache.get(no.caminho) ?? null;
    if (no.filhos?.length) return no.filhos;
    return null;
  }
  async function garantirFilhos(caminho: string): Promise<void> {
    if (listaCache.has(caminho)) return;
    const noPai = arvore ? buscarNo(arvore, caminho) : null;
    if (noPai?.filhos?.length) {
      listaCache.set(caminho, ordenarNos(noPai.filhos));
      semearIndice(noPai.filhos);
      arvore = [...(arvore ?? [])];
      return;
    }
    try {
      const r = await api<{ tipo: string; itens?: Array<{ nome: string; tipo: string; tamanho?: number }> }>(`/files?path=${encodeURIComponent(caminho)}`);
      if (r.tipo !== 'dir' || !Array.isArray(r.itens)) {
        listaCache.set(caminho, []);
      } else {
        const nos: NoArvoreWeb[] = r.itens
          .filter((it) => !ignorarNo(it.nome, caminho))
          .map((it) => ({
            nome: it.nome,
            caminho: caminho ? `${caminho}/${it.nome}` : it.nome,
            tipo: it.tipo === 'dir' ? ('dir' as const) : ('arquivo' as const),
            tamanho: it.tamanho,
            filhos: [],
          }));
        const ord = ordenarNos(nos);
        listaCache.set(caminho, ord);
        const s = new Set(todosOsCaminhos);
        for (const n of ord) if (n.tipo === 'arquivo') s.add(n.caminho);
        todosOsCaminhos = s;
      }
    } catch {
      listaCache.set(caminho, []);
    }
    if (expandidos.has(caminho)) arvore = [...(arvore ?? [])];
  }

  async function carregarArvore(): Promise<void> {
    // troca de workspace reinicia cache se necessário
    const wsNow = getWsAtivo() || null;
    if (tabsWs !== wsNow) {
      // handled in onMount ws watcher, but safe here
    }
    carregandoArvore = true;
    erroArvore = null;
    try {
      const r = await api<{ tipo: string; arvore: NoArvoreWeb[]; truncado: boolean }>('/files/tree?profundidade=6');
      let nova = Array.isArray(r?.arvore) ? r.arvore : [];
      arvoreTruncada = false;
      if (r?.truncado) {
        const raiz = await api<{ tipo: string; itens?: Array<{ nome: string; tipo: string; tamanho?: number }> }>('/files').catch(() => null);
        if (raiz?.tipo === 'dir' && Array.isArray(raiz.itens) && raiz.itens.length) {
          nova = ordenarNos(
            raiz.itens
              .filter((it) => !ignorarNo(it.nome, ''))
              .map((it) => ({
                nome: it.nome,
                caminho: it.nome,
                tipo: it.tipo === 'dir' ? ('dir' as const) : ('arquivo' as const),
                tamanho: it.tamanho,
                filhos: [],
              })),
          );
        } else {
          arvoreTruncada = true;
        }
      }
      arvore = nova;
      semearIndice(nova);
    } catch (e) {
      erroArvore = (e as Error).message;
    } finally {
      carregandoArvore = false;
    }
  }

  function alternarDir(caminho: string): void {
    if (!caminho) return;
    const novo = new Set(expandidos);
    if (novo.has(caminho)) novo.delete(caminho);
    else {
      novo.add(caminho);
      void garantirFilhos(caminho);
    }
    expandidos = novo;
  }

  // ── arquivo (tabs) ─────────────────────────────────────────────────────
  async function abrirArquivo(caminho: string): Promise<void> {
    if (!caminho) return;
    const existente = tabsArquivo.find((t) => t.caminho === caminho);
    if (existente) {
      tabAtiva = caminho;
      persistirTabs();
      await tick();
      return;
    }
    try {
      const r = await api<{ tipo: string; conteudo?: string | null; motivo?: string }>(`/files?path=${encodeURIComponent(caminho)}`);
      if (r.tipo !== 'arquivo' || typeof r.conteudo !== 'string') {
        toast(r.motivo ?? 'Não foi possível abrir o arquivo', 'aviso');
        return;
      }
      const nome = caminho.split('/').pop() ?? caminho;
      const tab: TabArquivo = { caminho, nome, original: r.conteudo, editado: r.conteudo, modo: modoPadrao(nome) };
      const rascunho = lerRascunhos()[caminho];
      if (rascunho && typeof rascunho.c === 'string' && rascunho.c !== tab.original) tab.editado = rascunho.c;
      else apagarRascunho(caminho);
      tabsArquivo = [...tabsArquivo, tab];
      tabAtiva = caminho;
      persistirTabs();
    } catch {}
  }

  export function enviarComoContextoLocal(caminho: string): void {
    setRascunho('@' + caminho);
    abrirChatLateral();
    const ta = document.getElementById('lat-input') as HTMLTextAreaElement | null;
    if (ta) ta.value = getRascunho();
  }

  async function fecharTab(caminho: string): Promise<void> {
    const idx = tabsArquivo.findIndex((t) => t.caminho === caminho);
    if (idx < 0) return;
    const tab = tabsArquivo[idx]!;
    if (tab.editado !== tab.original) {
      const ok = await modalConfirm(`Há alterações não salvas em <code>${escapeHtml(tab.nome)}</code>. Fechar mesmo assim?`, { titulo: 'Descartar alterações?', confirmar: 'Fechar' });
      if (!ok) return;
    }
    const nova = [...tabsArquivo];
    nova.splice(idx, 1);
    tabsArquivo = nova;
    apagarRascunho(caminho);
    if (tabAtiva === caminho) tabAtiva = tabsArquivo[Math.min(idx, tabsArquivo.length - 1)]?.caminho ?? null;
    persistirTabs();
  }

  function trocarModo(modo: ModoVer): void {
    const idx = tabsArquivo.findIndex((t) => t.caminho === tabAtiva);
    if (idx < 0) return;
    const copy = [...tabsArquivo];
    copy[idx] = { ...copy[idx]!, modo };
    tabsArquivo = copy;
    persistirTabs();
  }

  function editarAtivo(valor: string): void {
    const idx = tabsArquivo.findIndex((t) => t.caminho === tabAtiva);
    if (idx < 0) return;
    const copy = [...tabsArquivo];
    copy[idx] = { ...copy[idx]!, editado: valor };
    tabsArquivo = copy;
    agendarRascunho();
  }

  function teclaEditor(ev: KeyboardEvent): void {
    if (ev.key !== 'Tab') return;
    ev.preventDefault();
    const ta = ev.target as HTMLTextAreaElement;
    const ini = ta.selectionStart;
    const fim = ta.selectionEnd;
    ta.value = ta.value.slice(0, ini) + '  ' + ta.value.slice(fim);
    ta.selectionStart = ta.selectionEnd = ini + 2;
    editarAtivo(ta.value);
  }

  let timerRascDebounce: ReturnType<typeof setTimeout> | undefined;
  function agendarRascunho(): void {
    if (timerRascDebounce) clearTimeout(timerRascDebounce);
    timerRascDebounce = setTimeout(() => {
      timerRascDebounce = undefined;
      persistirRascunhos();
    }, 500);
  }

  async function salvarAtivo(): Promise<void> {
    const tab = tabsArquivo.find((t) => t.caminho === tabAtiva);
    if (!tab || tab.editado === tab.original) return;
    if (new TextEncoder().encode(tab.editado).length > MAX_CONTEUDO) {
      toast('Conteúdo excede 1MB — reduza antes de salvar', 'erro');
      return;
    }
    try {
      await putConteudo(tab, false);
      // força reatividade: atualiza referência
      tabsArquivo = [...tabsArquivo];
      toast(`Salvo: ${tab.nome}`, 'ok');
    } catch {
      toast('Não foi possível salvar — o conteúdo continua no rascunho local', 'erro');
    }
  }

  async function restaurarTabs(): Promise<void> {
    const salvas = lerTabsSalvas();
    if (!salvas?.tabs.length) return;
    const caminhos = salvas.tabs
      .map((t) => (typeof t === 'string' ? { p: t, m: undefined } : { p: t.p, m: t.m }))
      .filter((t) => typeof t.p === 'string' && t.p)
      .slice(0, MAX_TABS_RESTAURADAS);
    const rascunhos = lerRascunhos();
    const usuarioJaAtivou = tabAtiva !== null;
    const resultados = await Promise.allSettled(
      caminhos.map(async ({ p, m }) => {
        const r = await api<{ tipo: string; conteudo?: string | null }>(`/files?path=${encodeURIComponent(p)}`);
        if (r.tipo !== 'arquivo' || typeof r.conteudo !== 'string') return null;
        const nome = p.split('/').pop() ?? p;
        const tab: TabArquivo = { caminho: p, nome, original: r.conteudo, editado: r.conteudo, modo: modoValido(m) ? (m as ModoVer) : modoPadrao(nome) };
        const rc = rascunhos[p];
        if (rc && typeof rc.c === 'string' && rc.c !== tab.original) tab.editado = rc.c;
        else apagarRascunho(p);
        return tab;
      }),
    );
    let nova = [...tabsArquivo];
    for (const r of resultados) {
      if (r.status === 'fulfilled' && r.value && !nova.some((t) => t.caminho === r.value!.caminho)) nova.push(r.value);
    }
    if (!nova.length) return;
    tabsArquivo = nova;
    if (!usuarioJaAtivou) {
      tabAtiva = salvas.ativa && tabsArquivo.some((t) => t.caminho === salvas.ativa) ? salvas.ativa : tabsArquivo[tabsArquivo.length - 1]!.caminho;
    }
    persistirTabs();
  }

  // ── Busca rápida ───────────────────────────────────────────────────────
  async function construirIndice(): Promise<void> {
    if (indiceCompleto || indiceEmAndamento) return;
    indiceEmAndamento = true;
    const fila: string[] = [''];
    let dirsVisitados = 0;
    const ac = new Set(todosOsCaminhos);
    while (fila.length && dirsVisitados < MAX_DIRS_INDICE && ac.size < MAX_NOS_INDICE) {
      const dir = fila.shift()!;
      dirsVisitados++;
      try {
        const rota = dir ? `/files?path=${encodeURIComponent(dir)}` : '/files';
        const r = await api<{ tipo: string; itens?: Array<{ nome: string; tipo: string }> }>(rota);
        if (r.tipo !== 'dir' || !Array.isArray(r.itens)) continue;
        for (const it of r.itens) {
          const caminho = dir ? `${dir}/${it.nome}` : it.nome;
          if (it.tipo === 'dir') {
            if (!ignorarNo(it.nome, dir)) fila.push(caminho);
          } else ac.add(caminho);
        }
      } catch {}
    }
    todosOsCaminhos = ac;
    indiceCompleto = true;
    indiceEmAndamento = false;
    if (buscaUltimoFiltro.trim().length >= 2) filtrarEBuscar(buscaUltimoFiltro);
  }

  function filtrarEBuscar(valor: string): void {
    buscaUltimoFiltro = valor;
    buscaValor = valor;
    const res = filtrarCaminhos(todosOsCaminhos, valor, MAX_RESULTADOS_BUSCA);
    buscaResultados = res;
    buscaAtiva = 0;
    if (!indiceCompleto && valor.trim().length >= 2) void construirIndice();
  }

  async function abrirDaBusca(caminho: string): Promise<void> {
    if (!caminho) return;
    buscaValor = '';
    buscaResultados = [];
    await abrirArquivo(caminho);
  }

  function teclaBusca(ev: KeyboardEvent): void {
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      if (buscaResultados.length) buscaAtiva = (buscaAtiva + 1) % buscaResultados.length;
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (buscaResultados.length) buscaAtiva = (buscaAtiva - 1 + buscaResultados.length) % buscaResultados.length;
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      const alvo = buscaResultados[buscaAtiva] ?? buscaResultados[0];
      if (alvo) void abrirDaBusca(alvo);
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      buscaValor = '';
      buscaResultados = [];
      (ev.target as HTMLInputElement).blur();
    }
  }

  // ── Terminais ──────────────────────────────────────────────────────────
  function carregarTerminais(): void {
    if (terminais.length) return;
    try {
      const nomes = JSON.parse(localStorage.getItem('oc-terminal-tabs') ?? '[]') as unknown;
      if (Array.isArray(nomes)) {
        const lista: TabTerminal[] = [];
        for (const n of nomes) if (typeof n === 'string' && n) lista.push({ nome: n, log: '', historico: [], histIdx: -1 });
        terminais = lista;
        terminalAtivo = lista[lista.length - 1]?.nome ?? null;
      }
    } catch {}
  }
  function persistirTerminais(): void {
    try { localStorage.setItem('oc-terminal-tabs', JSON.stringify(terminais.map((t) => t.nome))); } catch {}
  }
  function criarTerminal(): void {
    if (terminais.length >= MAX_TERMINAIS) { toast(`Máximo de ${MAX_TERMINAIS} terminais`, 'aviso'); return; }
    const nome = nomeProximoTerminalPure(terminais as unknown as TabTerminal[]);
    terminais = [...terminais, { nome, log: '', historico: [], histIdx: -1 }];
    terminalAtivo = nome;
    persistirTerminais();
  }
  function limparTerminal(): void {
    const idx = terminais.findIndex((x) => x.nome === terminalAtivo);
    if (idx < 0) return;
    const copy = [...terminais];
    copy[idx] = { ...copy[idx]!, log: '' };
    terminais = copy;
  }
  function teclaTerminal(ev: KeyboardEvent): void {
    const t = terminais.find((x) => x.nome === terminalAtivo);
    const input = document.getElementById('ws-term-cmd') as HTMLInputElement | null;
    if (!t || !input) return;
    if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (!t.historico.length) return;
      const novoIdx = Math.max(0, t.histIdx < 0 ? t.historico.length - 1 : t.histIdx - 1);
      const copy = [...terminais]; const ti = copy.findIndex((x) => x.nome === terminalAtivo); copy[ti] = { ...copy[ti]!, histIdx: novoIdx }; terminais = copy;
      input.value = t.historico[novoIdx] ?? '';
    } else if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      if (t.histIdx < 0) return;
      const novoIdx = Math.min(t.historico.length, t.histIdx + 1);
      const copy = [...terminais]; const ti = copy.findIndex((x) => x.nome === terminalAtivo); copy[ti] = { ...copy[ti]!, histIdx: novoIdx }; terminais = copy;
      input.value = novoIdx === t.historico.length ? '' : t.historico[novoIdx] ?? '';
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      void rodarTerminal();
    }
  }
  async function rodarTerminal(): Promise<void> {
    const idx = terminais.findIndex((x) => x.nome === terminalAtivo);
    const input = document.getElementById('ws-term-cmd') as HTMLInputElement | null;
    if (idx < 0 || !input) return;
    const comando = input.value.trim();
    if (!comando) return;
    const copy = [...terminais];
    const t = { ...copy[idx]!, historico: [...copy[idx]!.historico, comando], histIdx: copy[idx]!.historico.length + 1, log: copy[idx]!.log + `ws$ ${comando}\n` };
    copy[idx] = t;
    terminais = copy;
    input.value = '';
    await tick();
    if (termLogEl) termLogEl.scrollTop = termLogEl.scrollHeight;
    try {
      const r = await api<{ saida: string; codigo: number }>('/terminal', { method: 'POST', body: JSON.stringify({ comando }) });
      const copy2 = [...terminais]; const t2 = copy2[idx]!; copy2[idx] = { ...t2, log: t2.log + (r.saida ? r.saida + '\n' : '') + `[${r.codigo === 0 ? 'ok' : 'código ' + r.codigo}]\n` }; terminais = copy2;
    } catch (e) {
      const copy2 = [...terminais]; const t2 = copy2[idx]!; copy2[idx] = { ...t2, log: t2.log + `erro: ${(e as Error).message}\n` }; terminais = copy2;
    }
    await tick();
    if (termLogEl) termLogEl.scrollTop = termLogEl.scrollHeight;
  }

  // ── lifecycle / globais ────────────────────────────────────────────────
  let listeners: Array<() => void> = [];

  onMount(() => {
    // registrar para menu-contexto
    registrarAbrirArquivo((p) => abrirArquivo(p));

    carregarTerminais();
    tabsWs = getWsAtivo() || null;
    wsAtual = tabsWs ?? '';

    const unsub = wsAtivo.subscribe((v) => {
      if (wsAtual !== v) {
        wsAtual = v;
        // troca de workspace: reseta estado por ws
        if (tabsWs !== (v || null)) {
          tabsArquivo = [];
          tabAtiva = null;
          tabsWs = v || null;
          listaCache.clear();
          todosOsCaminhos = new Set();
          indiceCompleto = false;
          expandidos = new Set();
          void carregarArvore();
          void restaurarTabs();
        }
      }
    });
    unsubs.push(unsub);

    void carregarArvore();
    void restaurarTabs();

    const onKeyCtrlS = (ev: KeyboardEvent) => {
      if (!(ev.ctrlKey || ev.metaKey) || ev.key.toLowerCase() !== 's') return;
      // só quando Workspace está visível (ou sempre que houver tab suja? mantém compat)
      ev.preventDefault();
      void salvarAtivo();
    };
    const onKeyCtrlP = (ev: KeyboardEvent) => {
      if (!(ev.ctrlKey || ev.metaKey) || ev.key.toLowerCase() !== 'p') return;
      ev.preventDefault();
      document.getElementById('ws-busca')?.focus();
    };
    document.addEventListener('keydown', onKeyCtrlS);
    document.addEventListener('keydown', onKeyCtrlP);
    listeners.push(() => document.removeEventListener('keydown', onKeyCtrlS));
    listeners.push(() => document.removeEventListener('keydown', onKeyCtrlP));

    const onHash = () => {
      if (!tabsSujas().length) return;
      persistirRascunhos();
      void flushSujo(false);
    };
    const flushDescarga = () => { persistirRascunhos(); void flushSujo(true); };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('pagehide', flushDescarga);
    const onVis = () => { if (document.visibilityState === 'hidden') flushDescarga(); };
    document.addEventListener('visibilitychange', onVis);
    listeners.push(() => window.removeEventListener('hashchange', onHash));
    listeners.push(() => window.removeEventListener('pagehide', flushDescarga));
    listeners.push(() => document.removeEventListener('visibilitychange', onVis));

    // compat window globals legado
    const g = window as unknown as Record<string, unknown>;
    const prevAtualizar = g.__workspaceAtualizar;
    const prevDir = g.__workspaceDir;
    const prevArquivo = g.__workspaceArquivo;
    (g as any).__workspaceAtualizar = () => void carregarArvore();
    (g as any).__workspaceDir = (btn: HTMLElement) => alternarDir(btn.dataset.path ?? '');
    (g as any).__workspaceArquivo = (btn: HTMLElement) => void abrirArquivo(btn.dataset.path ?? '');

    return () => {
      // cleanup globals (restaura se havia)
      if (prevAtualizar) g.__workspaceAtualizar = prevAtualizar; else delete g.__workspaceAtualizar;
      if (prevDir) g.__workspaceDir = prevDir; else delete g.__workspaceDir;
      if (prevArquivo) g.__workspaceArquivo = prevArquivo; else delete g.__workspaceArquivo;
    };
  });

  onDestroy(() => {
    unsubs.forEach((u) => u());
    listeners.forEach((fn) => fn());
    registrarAbrirArquivo(null);
    if (timerRascDebounce) clearTimeout(timerRascDebounce);
  });

  // atualiza indicadores sujos sem perder foco — reatividade já cuida

  // helper para renderização da árvore recursiva (usado no markup)
  function isExpanded(caminho: string): boolean { return expandidos.has(caminho); }
</script>

<div class="page-header flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
  <div class="page-header-esq min-w-0 flex-1">
    <h1 class="page-header-titulo text-xl font-bold flex items-center gap-2">{@html icone('folder')} Workspace</h1>
    <p class="page-header-sub text-sm text-zinc-400">Editor VS Code · Ctrl+P busca · Ctrl+S salva · terminais (máx {MAX_TERMINAIS})</p>
  </div>
  <div class="flex items-center gap-2">
    <span class="help-wrap">{@html ajuda('workspace-view')}</span>
  </div>
</div>

<div class="vs-root flex items-stretch gap-0 h-[calc(100dvh-3.5rem-0.5rem-2px)] min-h-[480px] bg-[var(--card)] border border-[var(--border)] rounded-lg overflow-hidden max-sm:flex-col-reverse max-sm:h-auto">
  <!-- Principal: editor + terminais -->
  <div class="vs-principal flex-1 min-w-0 flex flex-col bg-[var(--bg)]">
    <!-- Tabs de arquivos -->
    <div class="vs-tabs flex gap-px overflow-x-auto border-b border-[var(--border)] bg-[#141414] min-h-[2.35rem] px-1 pt-1 shrink-0 scrollbar-none" role="tablist">
      {#each tabsArquivo as tab (tab.caminho)}
        {@const ativa = tab.caminho === tabAtiva}
        <button
          type="button"
          role="tab"
          aria-selected={ativa}
          class="ui-tab inline-flex items-center gap-1 whitespace-nowrap text-[0.78rem] px-2.5 py-1.5 rounded-t-md border {ativa ? 'bg-[var(--bg)] text-[var(--text)] border-[var(--border)] border-b-0 font-medium' : 'bg-transparent text-[var(--muted)] border-transparent hover:bg-[#1e1e1e] hover:text-[var(--text)]'} max-w-[220px] overflow-hidden text-ellipsis"
          onclick={() => { tabAtiva = tab.caminho; persistirTabs(); }}
          onauxclick={(e) => { if ((e as MouseEvent).button === 1) { e.preventDefault(); void fecharTab(tab.caminho); } }}
          title={tab.caminho}
        >
          <span class="truncate">{rotuloTab(tab)}</span>
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <span
            class="ui-tab-fechar ml-1 text-[var(--muted)] px-1 rounded hover:text-[var(--err)] hover:bg-[#2a2a2a] font-semibold"
            title="Fechar aba"
            onclick={(ev) => { ev.stopPropagation(); void fecharTab(tab.caminho); }}
            onkeydown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.stopPropagation(); void fecharTab(tab.caminho); } }}
          >×</span>
        </button>
      {:else}
        <span class="text-[0.62rem] tracking-[0.12em] text-[#6f6f6f] self-center px-2 py-1">WORKSPACE</span>
      {/each}
    </div>

    <!-- Corpo do arquivo -->
    <div id="ws-arq-corpo" class="vs-corpo flex-1 min-h-0 flex flex-col bg-[var(--bg)]">
      {#if !tabAtual}
        <div class="empty-state flex-1 flex flex-col items-center justify-center text-center p-8 text-[var(--muted)]">
          <div class="empty-icon mb-3 opacity-50 flex justify-center">{@html icone('file')}</div>
          <div class="empty-title font-semibold text-[var(--text)] mb-1">Nenhum arquivo aberto</div>
          <div class="empty-desc text-sm max-w-[420px]">Abra um arquivo na árvore à direita ou busque pelo nome (Ctrl+P). As alterações não salvas sobrevivem à navegação e à recarga da página.</div>
        </div>
      {:else}
        {@const md = esMarkdown(tabAtual.nome)}
        {@const suja = tabAtual.editado !== tabAtual.original}
        <div class="ws-arq-header shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--border)] flex-wrap bg-[var(--bg)]">
          <span class="ws-arq-nome font-mono text-[0.78rem] text-[var(--muted)] truncate min-w-0 flex items-center gap-1" title={tabAtual.caminho}>
            {#if suja}<span class="ws-dirty text-[var(--warn)]">●</span>{/if}
            {tabAtual.caminho}
          </span>
          <div class="flex items-center gap-1 shrink-0">
            {#if md}
              <button type="button" class="btn btn-ghost ws-btn-mini px-2.5 py-1 text-xs min-h-0 border {tabAtual.modo==='editor' ? 'bg-[#262626] border-[var(--border)]' : 'border-transparent'}" onclick={() => trocarModo('editor' as ModoVer)}>Editor</button>
              <button type="button" class="btn btn-ghost ws-btn-mini px-2.5 py-1 text-xs min-h-0 border {tabAtual.modo==='preview' ? 'bg-[#262626] border-[var(--border)]' : 'border-transparent'}" onclick={() => trocarModo('preview' as ModoVer)}>Preview</button>
              <button type="button" class="btn btn-ghost ws-btn-mini px-2.5 py-1 text-xs min-h-0 border {tabAtual.modo==='split' ? 'bg-[#262626] border-[var(--border)]' : 'border-transparent'}" onclick={() => trocarModo('split' as ModoVer)}>Lado a lado</button>
            {:else}
              <button type="button" class="btn btn-ghost ws-btn-mini px-2.5 py-1 text-xs min-h-0 border {tabAtual.modo==='editor' ? 'bg-[#262626] border-[var(--border)]' : 'border-transparent'}" onclick={() => trocarModo('editor' as ModoVer)}>Editor</button>
              <button type="button" class="btn btn-ghost ws-btn-mini px-2.5 py-1 text-xs min-h-0 border {tabAtual.modo==='preview' ? 'bg-[#262626] border-[var(--border)]' : 'border-transparent'}" onclick={() => trocarModo('preview' as ModoVer)}>Preview</button>
            {/if}
            <button type="button" class="btn ws-btn-mini px-2.5 py-1 text-xs min-h-0" onclick={() => void salvarAtivo()} disabled={!suja} title="Salvar (Ctrl+S)">{@html icone('check')} Salvar</button>
          </div>
        </div>
        <div id="ws-arq-corpo-int" class="flex flex-col flex-1 min-h-0">
          {#if tabAtual.modo === 'split' && md}
            <div class="ws-split grid grid-cols-1 lg:grid-cols-2 flex-1 min-h-0">
              <textarea id="ws-editor" class="ws-editor w-full flex-1 min-h-[220px] bg-[var(--bg)] text-[var(--text)] border-0 outline-none resize-none p-4 font-mono text-[0.8125rem] leading-relaxed border-r border-[var(--border)] max-lg:border-r-0 max-lg:border-b" spellcheck="false" value={tabAtual.editado} oninput={(e) => editarAtivo((e.target as HTMLTextAreaElement).value)} onkeydown={teclaEditor}></textarea>
              <div class="ws-preview p-4 overflow-y-auto flex-1 text-sm leading-relaxed scrollbar-none">{@html renderMarkdown(tabAtual.editado)}</div>
            </div>
          {:else if tabAtual.modo === 'preview'}
            <div class="ws-preview p-4 overflow-y-auto flex-1 text-sm leading-relaxed scrollbar-none">
              {#if md}
                {@html renderMarkdown(tabAtual.editado)}
              {:else}
                <pre class="ws-preview-pre whitespace-pre-wrap break-words font-mono text-[0.78rem] text-[var(--muted)]">{tabAtual.editado}</pre>
              {/if}
            </div>
          {:else}
            <textarea id="ws-editor" class="ws-editor w-full flex-1 min-h-[220px] bg-[var(--bg)] text-[var(--text)] border-0 outline-none resize-none p-4 font-mono text-[0.8125rem] leading-relaxed" spellcheck="false" value={tabAtual.editado} oninput={(e) => editarAtivo((e.target as HTMLTextAreaElement).value)} onkeydown={teclaEditor}></textarea>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Terminais -->
    <div class="vs-term shrink-0 border-t border-[var(--border)] bg-[#141414]">
      <div class="vs-term-topo flex items-center justify-between gap-2 px-3 py-1.5">
        <span class="vs-term-titulo text-[0.62rem] font-semibold tracking-[0.1em] text-[var(--muted)] inline-flex items-center gap-1">{@html icone('run')} TERMINAL</span>
        <div class="flex gap-1">
          <button class="btn btn-ghost ws-btn-mini px-2 py-1 text-xs min-h-0" onclick={limparTerminal} title="Limpar o log do terminal ativo">Limpar</button>
          <button class="btn btn-ghost ws-btn-mini px-2 py-1 text-xs min-h-0" onclick={criarTerminal} disabled={terminais.length >= MAX_TERMINAIS} title="Novo terminal (máx {MAX_TERMINAIS})">{@html icone('plus')} terminal</button>
        </div>
      </div>
      <div class="vs-tabs vs-tabs-term flex gap-px overflow-x-auto border-b border-[var(--border)] bg-[#141414] min-h-[2.1rem] px-1 pt-1 scrollbar-none" role="tablist">
        {#each terminais as t (t.nome)}
          {@const ativo = t.nome === terminalAtivo}
          <button type="button" role="tab" aria-selected={ativo} class="ui-tab text-xs px-2 py-1 rounded-t-md border {ativo ? 'bg-[var(--bg)] border-[var(--border)] border-b-0' : 'bg-transparent border-transparent text-[var(--muted)] hover:bg-[#1e1e1e]'}" onclick={() => { terminalAtivo = t.nome; }}>{t.nome}</button>
        {/each}
      </div>
      <div class="vs-term-corpo px-3 pb-3">
        {#if terminais.length === 0}
          <div class="empty-state text-center py-4 text-[var(--muted)]">
            <div class="empty-icon flex justify-center mb-1">{@html icone('run')}</div>
            <div class="empty-title text-sm font-medium text-[var(--text)]">Nenhum terminal</div>
            <div class="empty-desc text-xs">Abra com "+ terminal". Comandos passam pela whitelist do opencorp (sem flags nem paths).</div>
          </div>
        {:else}
          {@const tAtivo = terminais.find((x) => x.nome === terminalAtivo)}
          <pre bind:this={termLogEl} class="terminal-log m-0 bg-[var(--bg)] border border-[var(--border)] rounded-lg p-2.5 font-mono text-[0.72rem] leading-relaxed text-[#a1a1aa] whitespace-pre-wrap break-words h-[150px] overflow-y-auto scrollbar-none">{tAtivo?.log ?? ''}</pre>
          <div class="ws-term-input flex items-center gap-2 mt-2">
            <span class="ws-term-prompt font-mono text-xs text-[var(--ok)] shrink-0">ws$</span>
            <input id="ws-term-cmd" class="ws-term-campo flex-1 bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-[var(--text)] font-mono text-sm min-w-0 focus:border-[var(--accent)] outline-none" placeholder="comando opencorp (whitelist) — ex.: tasks list" autocomplete="off" onkeydown={teclaTerminal} />
            <button class="btn ws-btn-mini px-2.5 py-1 text-xs min-h-0" onclick={() => void rodarTerminal()}>{@html icone('run')} Rodar</button>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Lateral direita: explorador -->
  <aside class="vs-lateral w-[300px] shrink-0 flex flex-col bg-[#141414] border-l border-[var(--border)] min-h-0 max-lg:w-full max-lg:border-l-0 max-lg:border-t max-lg:max-h-[46dvh]">
    <div class="vs-lateral-topo flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]">
      <span class="vs-lateral-rotulo text-[0.65rem] font-semibold tracking-[0.08em] text-[var(--muted)] flex-1">EXPLORADOR</span>
      <span class="text-xs text-zinc-500">{#if arvoreTruncada}árvore truncada{/if}</span>
      <button class="btn btn-ghost ws-btn-mini px-2 py-1 text-xs min-h-0" onclick={() => void carregarArvore()} title="Recarregar árvore de arquivos">{@html icone('run')} Atualizar</button>
    </div>
    <div class="vs-busca relative p-2 border-b border-[var(--border)]">
      <input id="ws-busca" class="ws-busca-campo w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-[var(--text)] text-[0.78rem] outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_2px_rgba(37,99,235,.2)]" placeholder="Buscar arquivo… (Ctrl+P)" autocomplete="off" spellcheck="false" bind:value={buscaValor} oninput={(e) => filtrarEBuscar((e.target as HTMLInputElement).value)} onkeydown={teclaBusca} />
      <div id="ws-busca-resultados" class="absolute left-1 right-1 top-[calc(100%-0.15rem)] z-30 bg-[#1c1c1c] border border-[#404040] rounded-lg shadow-xl p-1 max-h-[320px] overflow-y-auto {buscaAberta ? 'block' : 'hidden'}" class:block={buscaAberta} class:hidden={!buscaAberta}>
        {#if buscaValor.trim().length >= 2}
          {#if buscaResultados.length === 0}
            <div class="vs-busca-vazio px-2 py-2 text-[var(--muted)] text-xs text-center">{!indiceCompleto ? 'indexando o workspace…' : 'nenhum arquivo encontrado'}</div>
          {:else}
            {#each buscaResultados as p, i}
              {@const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''}
              {@const nome = p.split('/').pop() ?? p}
              <button type="button" class="vs-busca-item flex items-baseline gap-2 w-full text-left bg-transparent border-0 text-[var(--text)] px-2 py-1.5 rounded-md text-[0.78rem] cursor-pointer hover:bg-[#262626] {i===buscaAtiva ? 'bg-[#262626]' : ''}" onclick={() => void abrirDaBusca(p)}>
                <span class="vs-busca-nome font-medium whitespace-nowrap">{nome}</span><span class="vs-busca-dir text-[var(--muted)] text-[0.66rem] font-mono overflow-hidden text-ellipsis whitespace-nowrap direction-rtl text-left">{dir}</span>
              </button>
            {/each}
            {#if !indiceCompleto}<div class="vs-busca-mais px-2 py-1 text-[var(--muted)] text-xs">indexando o workspace…</div>{/if}
          {/if}
        {/if}
      </div>
    </div>
    <div id="ws-arvore" class="vs-arvore flex-1 min-h-0 overflow-y-auto p-1 scrollbar-none">
      {#if erroArvore}
        <div class="empty-state estado-erro text-center p-4" role="alert">
          <div class="empty-icon flex justify-center mb-1">{@html icone('close')}</div>
          <div class="empty-title text-sm font-semibold">Algo deu errado</div>
          <div class="empty-desc text-xs text-[var(--muted)]">{erroArvore}</div>
          <div class="empty-acao mt-2"><button class="btn btn-ghost text-xs" onclick={() => void carregarArvore()}>{@html icone('run')} Tentar novamente</button></div>
        </div>
      {:else if carregandoArvore && !arvore}
        <div class="empty-state estado-loading text-center p-4" role="status" aria-live="polite">
          <div class="empty-icon flex justify-center mb-1 animate-pulse">{@html icone('history')}</div>
          <div class="empty-title text-sm">Carregando arquivos…</div>
        </div>
      {:else if arvore}
        {#if soOpencorp(arvore)}
          <div class="ws-dica text-[0.6875rem] text-[var(--muted)] px-2 py-1 leading-relaxed">Nada fora de <code class="font-mono">.opencorp</code> ainda — agentes, ferramentas e registros da empresa vivem lá.</div>
        {/if}
        {#each arvore as no (no.caminho)}
          {@render noRow(no, 0)}
        {/each}
      {/if}
    </div>
    <div class="vs-lateral-pe p-2 border-t border-[var(--border)] opacity-85 text-xs">{@html ajuda('workspace-view')}</div>
  </aside>
</div>

{#snippet noRow(no: NoArvoreWeb, nivel: number)}
  {@const recuo = `padding-left:${8 + nivel * 14}px`}
  {#if no.tipo === 'dir'}
    {@const aberto = isExpanded(no.caminho)}
    {@const filhos = filhosDe(no)}
    <button type="button" class="tree-dir flex items-center justify-start gap-1 w-full min-w-0 text-left bg-transparent border-0 text-[var(--text)] px-2 py-1 rounded-md text-[0.8125rem] leading-relaxed cursor-pointer whitespace-nowrap overflow-hidden hover:bg-[#262626]" data-path={no.caminho} style={recuo} onclick={() => alternarDir(no.caminho)} title={no.caminho}>
      <span class="tree-chev w-4 shrink-0 inline-block text-center text-[var(--muted)]">{aberto ? '▾' : '▸'}</span>{@html icone('folder', 'tree-ico text-[var(--muted)] w-[15px] h-[15px]')}<span class="tree-nome overflow-hidden text-ellipsis">{no.nome}</span>
    </button>
    {#if aberto}
      {#if filhos}
        {#each filhos as f (f.caminho)}
          {@render noRow(f, nivel + 1)}
        {/each}
      {:else}
        <div class="tree-carregando text-[var(--muted)] text-xs px-2 py-1" style={recuo}>carregando…</div>
      {/if}
    {/if}
  {:else}
    <button type="button" class="tree-arquivo flex items-center justify-start gap-1 w-full min-w-0 text-left bg-transparent border-0 text-[var(--text)] px-2 py-1 rounded-md text-[0.8125rem] leading-relaxed cursor-context-menu whitespace-nowrap overflow-hidden hover:bg-[#262626]" data-path={no.caminho} style={recuo} onclick={() => void abrirArquivo(no.caminho)} title={no.caminho}>
      {@html icone('file', 'tree-ico text-[var(--muted)] w-[15px] h-[15px]')}<span class="tree-nome overflow-hidden text-ellipsis">{no.nome}</span>
    </button>
  {/if}
{/snippet}

<style>
  /* complementa Tailwind para classes legadas (vs-*) — mantém compat com legacy.css */
  .scrollbar-none { scrollbar-width: none; -ms-overflow-style: none; }
  .scrollbar-none::-webkit-scrollbar { display: none; }
</style>
