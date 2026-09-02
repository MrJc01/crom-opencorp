/**
 * View Workspace — estilo VS Code (PLANO-PAINEL-V2 Etapa 3 · P-08, P-09, P-10).
 *
 * Layout "editor de código": À ESQUERDA o editor com TABS de arquivos abertos
 * (criarTabs; ● = não salvo, × fecha, middle-click fecha); À DIREITA a barra
 * lateral do explorador com BUSCA RÁPIDA (índice recursivo de todos os
 * arquivos — abre qualquer arquivo digitando parte do caminho, Ctrl+P) e a
 * ÁRVORE (raiz via GET /files/tree; expandir busca filhos AO VIVO via
 * GET /files?path=dir — profundidade infinita, cache em memória). Abaixo do
 * editor, painel de TERMINAIS (tabs criadas pelo usuário, máx 4, nomes em
 * localStorage oc-terminal-tabs; POST /terminal one-shot, histórico ↑↓).
 *
 * SALVAMENTO: PUT /files (só arquivos existentes, cap 1MB) pelo botão ou
 * Ctrl+S. O que NÃO ESTÁ SALVO nunca se perde:
 *  - ao digitar, rascunho vai para localStorage (debounce 500ms) e volta ao
 *    reabrir/reegarregar (restauração marca a tab como suja);
 *  - ao TROCAR de view (hashchange) as tabs sujas são gravadas no server;
 *  - ao SAIR/ocultar a página (pagehide/visibilitychange) o flush usa
 *    fetch keepalive — sobrevive ao encerramento da página.
 *
 * Estado (tabs, árvore, expansões, índice de busca, logs de terminal) vive em
 * memória do módulo por workspace — sobrevive à navegação SPA (padrão
 * secretario.ts). A view não re-renderiza via SSE nem no refresh de 8s.
 */

import { api, toast, icone, escapeHtml, headers } from "../api.js";
import { getWsAtivo } from "../state.js";
import { estadoVazio, estadoCarregando, estadoErro } from "../estado.js";
import { ajuda } from "../help.js";
import { renderMarkdown } from "../md.js";
import { criarTabs, type Aba } from "../ui/primitivas.js";
import { setRascunho, getRascunho } from "../rascunho.js";
import { abrirChatLateral } from "../chat-lateral.js";
import { modalConfirm } from "../modal.js";

interface NoArvoreWeb {
  nome: string;
  caminho: string;
  tipo: 'dir' | 'arquivo';
  tamanho?: number;
  filhos?: NoArvoreWeb[];
}

type ModoVer = 'editor' | 'preview' | 'split';

/** Tab de arquivo aberto — conteudo: original (server) × editado (rascunho). */
interface TabArquivo {
  caminho: string;
  nome: string;
  original: string;
  editado: string;
  modo: ModoVer;
}

/** Tab de terminal — log e histórico ↑↓ vivem só em memória. */
interface TabTerminal {
  nome: string;
  log: string;
  historico: string[];
  histIdx: number;
}

/** Persistência da barra de tabs (caminhos + modo por arquivo). */
interface TabsSalvas {
  tabs: Array<string | { p: string; m?: ModoVer }>;
  ativa: string | null;
}

const CHAVE_TERM = 'oc-terminal-tabs';
const MAX_TERMINAIS = 4;
const MAX_CONTEUDO = 1024 * 1024; // 1MB — espelha o cap do PUT /files
const MAX_RASCUNHO_BYTES = 280 * 1024; // quota do localStorage — arquivos maiores só no flush
const MAX_TABS_RESTAURADAS = 20;
const MAX_RESULTADOS_BUSCA = 12;
const MAX_NOS_INDICE = 4000;
const MAX_DIRS_INDICE = 600;

/** Mesmo conjunto do server (ARVORE_IGNORAR_DIRS) + logs de sessão. */
const DIRS_IGNORADOS = new Set(['node_modules', '.git', 'dist', 'web-dist', '__pycache__']);

// ── Estado do módulo (sobrevive à navegação; por workspace) ─────────────────
let arvore: NoArvoreWeb[] | null = null;
let arvoreTruncada = false;
let erroArvore: string | null = null;
let expandidos = new Set<string>();
/** Filhos já carregados por dir (lazy, profundidade infinita). */
const listaCache = new Map<string, NoArvoreWeb[]>();
/** Índice global de caminhos p/ a busca rápida (semeado pela árvore + buscas). */
const todosOsCaminhos = new Set<string>();
let indiceCompleto = false;
let indiceEmAndamento = false;

let tabsArquivo: TabArquivo[] = [];
let tabAtiva: string | null = null;
/** Workspace ao qual as tabs pertencem — troca de ws reinicia as tabs. */
let tabsWs: string | null = null;

let terminais: TabTerminal[] = [];
let terminalAtivo: string | null = null;

// Busca rápida
let buscaResultados: string[] = [];
let buscaAtiva = 0;
let buscaUltimoFiltro = '';

// ── Helpers puros ───────────────────────────────────────────────────────────

/** .md → Preview por padrão; demais → Editor. "Lado a lado" só existe p/ .md. */
function esMarkdown(nome: string): boolean {
  return nome.toLowerCase().endsWith('.md');
}

function modoPadrao(nome: string): ModoVer {
  return esMarkdown(nome) ? 'preview' : 'editor';
}

function modoValido(m: unknown): m is ModoVer {
  return m === 'editor' || m === 'preview' || m === 'split';
}

function nomeProximoTerminal(): string {
  const usados = new Set(terminais.map(t => t.nome));
  let i = 1;
  while (usados.has('term-' + i)) i++;
  return 'term-' + i;
}

/** Ignora ruído comum (espelha o server) — dir "logs" só dentro de .opencorp. */
function ignorarNo(nome: string, pai: string): boolean {
  if (DIRS_IGNORADOS.has(nome)) return true;
  if (nome === 'logs' && pai === '.opencorp') return true;
  return false;
}

function ordenarNos(nos: NoArvoreWeb[]): NoArvoreWeb[] {
  return [...nos].sort((a, b) => {
    if (a.tipo !== b.tipo) return a.tipo === 'dir' ? -1 : 1;
    return a.nome.localeCompare(b.nome);
  });
}

/** Dica de workspace vazio: nada além do diretório .opencorp no topo. */
function soOpencorp(nos: NoArvoreWeb[]): boolean {
  return nos.length === 0 || nos.every(n => n.caminho === '.opencorp' || n.caminho.startsWith('.opencorp/'));
}

// ── Persistência (localStorage por workspace) ───────────────────────────────

function chaveTabs(): string {
  return 'oc-ws-tabs:' + (getWsAtivo() || '');
}

function chaveRascunhos(): string {
  return 'oc-ws-drafts:' + (getWsAtivo() || '');
}

function persistirTabs(): void {
  try {
    const salvas: TabsSalvas = {
      tabs: tabsArquivo.map(t => ({ p: t.caminho, m: t.modo })),
      ativa: tabAtiva,
    };
    localStorage.setItem(chaveTabs(), JSON.stringify(salvas));
  } catch { /* memória basta */ }
}

function lerTabsSalvas(): TabsSalvas | null {
  try {
    const bruto = JSON.parse(localStorage.getItem(chaveTabs()) ?? 'null') as TabsSalvas | null;
    if (!bruto || !Array.isArray(bruto.tabs)) return null;
    return bruto;
  } catch { return null; }
}

interface Rascunho {
  c: string;
  t: number;
}

function lerRascunhos(): Record<string, Rascunho> {
  try {
    const r = JSON.parse(localStorage.getItem(chaveRascunhos()) ?? '{}') as Record<string, Rascunho>;
    return r && typeof r === 'object' ? r : {};
  } catch { return {}; }
}

/** Grava o conteúdo sujo de todas as tabs (rascunho por caminho). */
function persistirRascunhos(): void {
  try {
    const rascunhos = lerRascunhos();
    const vivos: Record<string, Rascunho> = {};
    for (const t of tabsArquivo) {
      if (t.editado === t.original) continue;
      vivos[t.caminho] = { c: t.editado, t: Date.now() };
    }
    // rascunhos de tabs fechadas nesta sessão são removidos (fecharTab apaga);
    // os de outras sessões permanecem até serem aplicados no abrir.
    localStorage.setItem(chaveRascunhos(), JSON.stringify({ ...rascunhos, ...vivos }));
  } catch { /* quota — o flush keepalive cobre */ }
}

function apagarRascunho(caminho: string): void {
  try {
    const rascunhos = lerRascunhos();
    if (!(caminho in rascunhos)) return;
    delete rascunhos[caminho];
    localStorage.setItem(chaveRascunhos(), JSON.stringify(rascunhos));
  } catch { /* ok */ }
}

// ── Flush (gravação do que não está salvo) ──────────────────────────────────

function urlArquivo(caminho: string): string {
  const ws = getWsAtivo();
  const base = '/files?path=' + encodeURIComponent(caminho);
  return ws ? base + '&workspace=' + encodeURIComponent(ws) : base;
}

async function putConteudo(tab: TabArquivo, keepalive: boolean): Promise<void> {
  if (new TextEncoder().encode(tab.editado).length > MAX_CONTEUDO) {
    throw new Error('conteúdo excede 1MB');
  }
  const res = await fetch(urlArquivo(tab.caminho), {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ conteudo: tab.editado }),
    ...(keepalive ? { keepalive: true } : {}),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  tab.original = tab.editado;
  apagarRascunho(tab.caminho);
}

function tabsSujas(): TabArquivo[] {
  return tabsArquivo.filter(t => t.editado !== t.original);
}

/**
 * Grava TODAS as tabs sujas no server. Chamado ao trocar de view (keepalive
 * false — a página segue viva) e ao sair/ocultar a página (keepalive true —
 * a requisição sobrevive ao unload). Silencioso: falhas ficam no rascunho.
 */
async function flushSujo(keepalive: boolean): Promise<void> {
  if (tabsWs !== (getWsAtivo() || null)) return; // tabs de outro ws — nada a fazer
  const sujas = tabsSujas();
  if (!sujas.length) return;
  await Promise.allSettled(sujas.map(t => putConteudo(t, keepalive)));
  if (document.getElementById('view-workspace')?.classList.contains('active')) {
    renderTabsArquivo();
    const tab = tabsArquivo.find(t => t.caminho === tabAtiva);
    if (tab) atualizarIndicadoresSujeira(tab);
  }
}

// ── Handlers globais (window.__workspace*) — instalados 1× por boot ─────────

let handlersInstalados = false;

function exporHandlers(): void {
  if (handlersInstalados) return;
  handlersInstalados = true;
  const g = window as unknown as Record<string, unknown>;
  g.__workspaceAtualizar = () => void carregarArvore();
  g.__workspaceDir = (btn: HTMLElement) => alternarDir(btn);
  g.__workspaceArquivo = (btn: HTMLElement) => void abrirArquivo(btn);
  g.__workspaceModo = (btn: HTMLElement) => trocarModo(btn);
  g.__workspaceEditar = (valor: string) => editarAtivo(valor);
  g.__workspaceSalvar = () => void salvarAtivo();
  g.__workspaceFecharTab = (caminho: string) => void fecharTab(caminho);
  g.__workspaceTermCriar = () => criarTerminal();
  g.__workspaceTermLimpar = () => limparTerminal();
  g.__workspaceTermRodar = () => void rodarTerminal();
  g.__workspaceTermTecla = (ev: KeyboardEvent) => teclaTerminal(ev);
  g.__workspaceEditorTecla = (ev: KeyboardEvent) => teclaEditor(ev);
  g.__workspaceBuscaInput = (valor: string) => filtrarEBuscar(valor);
  g.__workspaceBuscaTecla = (ev: KeyboardEvent) => teclaBusca(ev);
  g.__workspaceBuscaAbrir = (btn: HTMLElement) => void abrirDaBusca(btn.dataset.caminho ?? '');

  // Ctrl+S salva a tab ativa enquanto a view Workspace está na tela
  document.addEventListener('keydown', (ev: KeyboardEvent) => {
    if (!(ev.ctrlKey || ev.metaKey) || ev.key.toLowerCase() !== 's') return;
    if (!document.getElementById('view-workspace')?.classList.contains('active')) return;
    ev.preventDefault();
    void salvarAtivo();
  });

  // Ctrl+P abre a busca rápida de arquivos (padrão VS Code)
  document.addEventListener('keydown', (ev: KeyboardEvent) => {
    if (!(ev.ctrlKey || ev.metaKey) || ev.key.toLowerCase() !== 'p') return;
    if (!document.getElementById('view-workspace')?.classList.contains('active')) return;
    ev.preventDefault();
    document.getElementById('ws-busca')?.focus();
  });

  // Troca de view: grava o que não está salvo (página segue viva)
  window.addEventListener('hashchange', () => {
    if (!tabsSujas().length) return;
    persistirRascunhos();
    void flushSujo(false);
  });

  // Recarga/fechamento da página ou aba oculta: flush com keepalive —
  // a requisição é entregue mesmo com a página encerrando. O rascunho em
  // localStorage (síncrono) é a segunda rede de proteção.
  const flushDescarga = (): void => {
    persistirRascunhos();
    void flushSujo(true);
  };
  window.addEventListener('pagehide', flushDescarga);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushDescarga();
  });
}

// ── Render da view ──────────────────────────────────────────────────────────

/** Renderiza a view Workspace (idempotente: reconstrói do estado do módulo). */
export async function renderWorkspace(): Promise<void> {
  const viewEl = document.getElementById('view-workspace');
  if (!viewEl) return;

  exporHandlers();
  carregarTerminais();

  // troca de workspace reinicia tabs (rascunhos/tabs são por workspace)
  if (tabsWs !== (getWsAtivo() || null)) {
    tabsArquivo = [];
    tabAtiva = null;
    tabsWs = getWsAtivo() || null;
    listaCache.clear();
    todosOsCaminhos.clear();
    indiceCompleto = false;
    expandidos = new Set();
  }

  viewEl.innerHTML = `
    <div class="vs-root">
      <div class="vs-principal">
        <div id="ws-tabs-arq" class="vs-tabs scrollbar-none" role="tablist"></div>
        <div id="ws-arq-corpo" class="vs-corpo"></div>
        <div class="vs-term">
          <div class="vs-term-topo">
            <span class="vs-term-titulo">${icone('run')} TERMINAL</span>
            <div class="flex gap-1">
              <button class="btn btn-ghost ws-btn-mini" onclick="window.__workspaceTermLimpar()" title="Limpar o log do terminal ativo">Limpar</button>
              <button class="btn btn-ghost ws-btn-mini" id="ws-btn-term-novo" onclick="window.__workspaceTermCriar()" title="Novo terminal (máx ${MAX_TERMINAIS})">${icone('plus')} terminal</button>
            </div>
          </div>
          <div id="ws-tabs-term" class="vs-tabs vs-tabs-term scrollbar-none"></div>
          <div id="ws-term-corpo" class="vs-term-corpo"></div>
        </div>
      </div>
      <aside class="vs-lateral">
        <div class="vs-lateral-topo">
          <span class="vs-lateral-rotulo">EXPLORADOR</span>
          <span class="text-xs text-zinc-500" id="ws-truncado"></span>
          <button class="btn btn-ghost ws-btn-mini" onclick="window.__workspaceAtualizar()" title="Recarregar árvore de arquivos">${icone('run')} Atualizar</button>
        </div>
        <div class="vs-busca">
          <input id="ws-busca" class="ws-busca-campo" placeholder="Buscar arquivo… (Ctrl+P)" autocomplete="off" spellcheck="false"
                 oninput="window.__workspaceBuscaInput(this.value)" onkeydown="window.__workspaceBuscaTecla(event)"/>
          <div id="ws-busca-resultados"></div>
        </div>
        <div id="ws-arvore" class="vs-arvore scrollbar-none">${estadoCarregando('Carregando arquivos…')}</div>
        <div class="vs-lateral-pe">${ajuda('workspace-view')}</div>
      </aside>
    </div>
  `;

  renderTabsArquivo();
  renderArquivoAtivo();
  renderTerminais();
  void restaurarTabs();
  await carregarArvore();
}

// ── Árvore de arquivos (raiz via /files/tree, expansão via /files) ──────────

async function carregarArvore(): Promise<void> {
  erroArvore = null;
  try {
    const r = await api<{ tipo: string; arvore: NoArvoreWeb[]; truncado: boolean }>('/files/tree?profundidade=6');
    arvore = Array.isArray(r?.arvore) ? r.arvore : [];
    arvoreTruncada = false;
    if (r?.truncado) {
      // cap de nós do server cortou a varredura (workspaces grandes): a raiz
      // pode ter ficado sem irmãos do .opencorp → reconstrói a raiz com a
      // listagem ao vivo; níveis abaixo já são lazy (busca ao expandir)
      const raiz = await api<{ tipo: string; itens?: Array<{ nome: string; tipo: string; tamanho?: number }> }>('/files').catch(() => null);
      if (raiz?.tipo === 'dir' && Array.isArray(raiz.itens) && raiz.itens.length) {
        arvore = ordenarNos(raiz.itens
          .filter(it => !ignorarNo(it.nome, ''))
          .map(it => ({
            nome: it.nome,
            caminho: it.nome,
            tipo: it.tipo === 'dir' ? ('dir' as const) : ('arquivo' as const),
            tamanho: it.tamanho,
            filhos: [],
          })));
      } else {
        arvoreTruncada = true; // sem listagem da raiz — mantém o aviso
      }
    }
    semearIndice(arvore);
  } catch (e) {
    erroArvore = (e as Error).message;
  }
  renderArvore();
}

/** Semeia o índice da busca rápida com os caminhos já conhecidos da árvore. */
function semearIndice(nos: NoArvoreWeb[]): void {
  for (const n of nos) {
    if (n.tipo === 'arquivo') todosOsCaminhos.add(n.caminho);
    if (n.filhos?.length) semearIndice(n.filhos);
  }
}

/** Busca o nó de um caminho dentro da árvore carregada (null se não achar). */
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

/** Filhos de um dir: cache → filhos do tree endpoint → fetch ao vivo. */
async function garantirFilhos(caminho: string): Promise<void> {
  if (listaCache.has(caminho)) {
    renderArvore();
    return;
  }
  const noPai = arvore ? buscarNo(arvore, caminho) : null;
  if (noPai?.filhos?.length) {
    // o tree endpoint já trouxe este nível completo — só confia nele
    listaCache.set(caminho, ordenarNos(noPai.filhos));
    semearIndice(noPai.filhos);
    renderArvore();
    return;
  }
  try {
    const r = await api<{ tipo: string; itens?: Array<{ nome: string; tipo: string; tamanho?: number }> }>(`/files?path=${encodeURIComponent(caminho)}`);
    if (r.tipo !== 'dir' || !Array.isArray(r.itens)) {
      listaCache.set(caminho, []);
    } else {
      const nos: NoArvoreWeb[] = r.itens
        .filter(it => !ignorarNo(it.nome, caminho))
        .map(it => ({
          nome: it.nome,
          caminho: caminho ? `${caminho}/${it.nome}` : it.nome,
          tipo: it.tipo === 'dir' ? ('dir' as const) : ('arquivo' as const),
          tamanho: it.tamanho,
          filhos: [],
        }));
      listaCache.set(caminho, ordenarNos(nos));
      for (const n of nos) if (n.tipo === 'arquivo') todosOsCaminhos.add(n.caminho);
    }
  } catch {
    listaCache.set(caminho, []); // sem permissão/sumiu — expande vazio
  }
  if (expandidos.has(caminho)) renderArvore();
}

function filhosDe(no: NoArvoreWeb): NoArvoreWeb[] | null {
  if (listaCache.has(no.caminho)) return listaCache.get(no.caminho) ?? null;
  if (no.filhos?.length) return no.filhos;
  return null; // precisa de fetch (garantirFilhos cuida)
}

function renderArvore(): void {
  const el = document.getElementById('ws-arvore');
  if (!el) return;
  if (erroArvore) {
    el.innerHTML = estadoErro(erroArvore, () => void carregarArvore());
    return;
  }
  if (!arvore) {
    el.innerHTML = estadoCarregando('Carregando arquivos…');
    return;
  }
  const truncEl = document.getElementById('ws-truncado');
  if (truncEl) truncEl.textContent = arvoreTruncada ? 'árvore truncada' : '';
  if (soOpencorp(arvore)) {
    const dica = `<div class="ws-dica">Nada fora de <code>.opencorp</code> ainda — agentes, ferramentas e registros da empresa vivem lá.</div>`;
    el.innerHTML = dica + arvore.map(n => htmlNo(n, 0)).join('');
    return;
  }
  el.innerHTML = arvore.map(n => htmlNo(n, 0)).join('');
}

function htmlNo(no: NoArvoreWeb, nivel: number): string {
  const recuo = `padding-left:${8 + nivel * 14}px`;
  if (no.tipo === 'dir') {
    const aberto = expandidos.has(no.caminho);
    const filhos = filhosDe(no);
    let filhosHtml = '';
    if (aberto) {
      filhosHtml = filhos
        ? filhos.map(f => htmlNo(f, nivel + 1)).join('')
        : `<div class="tree-carregando" style="${recuo}">carregando…</div>`;
    }
    return `
      <button type="button" class="tree-dir${aberto ? ' tree-aberto' : ''}" data-path="${escapeHtml(no.caminho)}" style="${recuo}" onclick="window.__workspaceDir(this)" title="${escapeHtml(no.caminho)}">
        <span class="tree-chev">${aberto ? '▾' : '▸'}</span>${icone('folder', 'tree-ico')}<span class="tree-nome">${escapeHtml(no.nome)}</span>
      </button>${filhosHtml}`;
  }
  return `
    <button type="button" class="tree-arquivo" data-path="${escapeHtml(no.caminho)}" style="${recuo}" onclick="window.__workspaceArquivo(this)" title="${escapeHtml(no.caminho)}">
      ${icone('file', 'tree-ico')}<span class="tree-nome">${escapeHtml(no.nome)}</span>
    </button>`;
}

function alternarDir(btn: HTMLElement): void {
  const caminho = btn.dataset.path ?? '';
  if (!caminho) return;
  if (expandidos.has(caminho)) {
    expandidos.delete(caminho);
    renderArvore();
    return;
  }
  expandidos.add(caminho);
  renderArvore(); // pinta ▾ + "carregando…" na hora
  void garantirFilhos(caminho);
}

/** Abre arquivo numa tab (reusa a existente; conteúdo vem do GET /files). */
export async function abrirArquivo(alvo: HTMLElement | string): Promise<void> {
  const caminho = typeof alvo === 'string' ? alvo : (alvo.dataset.path ?? '');
  if (!caminho) return;
  const existente = tabsArquivo.find(t => t.caminho === caminho);
  if (existente) {
    tabAtiva = caminho;
    renderTabsArquivo();
    renderArquivoAtivo();
    persistirTabs();
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
    // rascunho de sessão anterior (não salvo antes de um reload) volta como sujo
    const rascunho = lerRascunhos()[caminho];
    if (rascunho && typeof rascunho.c === 'string' && rascunho.c !== tab.original) {
      tab.editado = rascunho.c;
    } else {
      apagarRascunho(caminho); // já está no server — limpa resíduo
    }
    tabsArquivo.push(tab);
    tabAtiva = caminho;
    renderTabsArquivo();
    renderArquivoAtivo();
    persistirTabs();
  } catch { /* api() já toastou o erro */ }
}

/** Right-click de arquivo (menu-contexto): manda o caminho como contexto @. */
export function enviarComoContexto(caminho: string): void {
  setRascunho('@' + caminho);
  abrirChatLateral();
  // sync direto: o standby do secretário não repinta o input com o rascunho
  const ta = document.getElementById('lat-input') as HTMLTextAreaElement | null;
  if (ta) ta.value = getRascunho();
}

// ── Busca rápida (abrir qualquer arquivo digitando parte do caminho) ────────

/**
 * Varre o workspace inteiro via GET /files (BFS) — uma vez por sessão.
 * Sem cap de profundidade: é o que garante "abrir QUALQUER arquivo".
 */
async function construirIndice(): Promise<void> {
  if (indiceCompleto || indiceEmAndamento) return;
  indiceEmAndamento = true;
  const fila: string[] = [''];
  let dirsVisitados = 0;
  while (fila.length && dirsVisitados < MAX_DIRS_INDICE && todosOsCaminhos.size < MAX_NOS_INDICE) {
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
        } else {
          todosOsCaminhos.add(caminho);
        }
      }
    } catch { /* ramo inacessível — segue */ }
  }
  indiceCompleto = true;
  indiceEmAndamento = false;
  // re-filtra com o índice completo (o resultado anterior pode ter sido vazio)
  if (buscaUltimoFiltro.trim().length >= 2) filtrarEBuscar(buscaUltimoFiltro);
  else renderBusca();
}

function filtrarEBuscar(valor: string): void {
  buscaUltimoFiltro = valor;
  const f = valor.trim().toLowerCase();
  if (f.length < 2) {
    buscaResultados = [];
    renderBusca();
    return;
  }
  buscaResultados = [...todosOsCaminhos]
    .filter(p => p.toLowerCase().includes(f))
    .sort((a, b) => a.length - b.length || a.localeCompare(b))
    .slice(0, MAX_RESULTADOS_BUSCA);
  buscaAtiva = 0;
  renderBusca();
  if (!indiceCompleto) void construirIndice();
}

function renderBusca(): void {
  const caixa = document.getElementById('ws-busca-resultados');
  if (!caixa) return;
  const input = document.getElementById('ws-busca') as HTMLInputElement | null;
  const f = (input?.value ?? '').trim();
  if (f.length < 2) {
    caixa.innerHTML = '';
    caixa.classList.remove('aberta');
    return;
  }
  const buscando = !indiceCompleto;
  if (!buscaResultados.length) {
    caixa.innerHTML = `<div class="vs-busca-vazio">${buscando ? 'indexando o workspace…' : 'nenhum arquivo encontrado'}</div>`;
    caixa.classList.add('aberta');
    return;
  }
  caixa.innerHTML = buscaResultados
    .map((p, i) => {
      const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
      const nome = p.split('/').pop() ?? p;
      return `<button type="button" class="vs-busca-item${i === buscaAtiva ? ' ativa' : ''}" data-caminho="${escapeHtml(p)}" onclick="window.__workspaceBuscaAbrir(this)">
        <span class="vs-busca-nome">${escapeHtml(nome)}</span><span class="vs-busca-dir">${escapeHtml(dir)}</span>
      </button>`;
    })
    .join('') + (buscando ? '<div class="vs-busca-mais">indexando o workspace…</div>' : '');
  caixa.classList.add('aberta');
  caixa.querySelector('.vs-busca-item.ativa')?.scrollIntoView({ block: 'nearest' });
}

async function abrirDaBusca(caminho: string): Promise<void> {
  if (!caminho) return;
  const input = document.getElementById('ws-busca') as HTMLInputElement | null;
  if (input) input.value = '';
  buscaResultados = [];
  renderBusca();
  await abrirArquivo(caminho);
}

function teclaBusca(ev: KeyboardEvent): void {
  const input = ev.target as HTMLInputElement;
  if (ev.key === 'ArrowDown') {
    ev.preventDefault();
    if (buscaResultados.length) {
      buscaAtiva = (buscaAtiva + 1) % buscaResultados.length;
      renderBusca();
    }
  } else if (ev.key === 'ArrowUp') {
    ev.preventDefault();
    if (buscaResultados.length) {
      buscaAtiva = (buscaAtiva - 1 + buscaResultados.length) % buscaResultados.length;
      renderBusca();
    }
  } else if (ev.key === 'Enter') {
    ev.preventDefault();
    const alvo = buscaResultados[buscaAtiva] ?? buscaResultados[0];
    if (alvo) void abrirDaBusca(alvo);
  } else if (ev.key === 'Escape') {
    ev.preventDefault();
    input.value = '';
    buscaResultados = [];
    renderBusca();
    input.blur();
  }
}

// ── Tabs de arquivos + modos de ver ─────────────────────────────────────────

function rotuloTab(t: TabArquivo): string {
  return (t.editado !== t.original ? '● ' : '') + t.nome;
}

function renderTabsArquivo(): void {
  const bar = document.getElementById('ws-tabs-arq');
  if (!bar) return;
  const abas: Aba[] = tabsArquivo.map(t => ({ id: t.caminho, rotulo: rotuloTab(t) }));
  const trocar = criarTabs(bar, abas, (id) => {
    tabAtiva = id;
    renderArquivoAtivo();
    persistirTabs();
  }, tabAtiva ?? undefined);
  // fechar (× / middle-click) por tab — anexado ao botão criado pela primitiva (mesma ordem)
  const botoes = Array.from(bar.querySelectorAll('.ui-tab')) as HTMLButtonElement[];
  botoes.forEach((b, i) => {
    const caminho = abas[i]?.id;
    if (!caminho) return;
    b.onauxclick = (ev) => {
      if ((ev as MouseEvent).button === 1) {
        ev.preventDefault();
        void fecharTab(caminho);
      }
    };
    const x = document.createElement('span');
    x.className = 'ui-tab-fechar';
    x.textContent = '×';
    x.title = 'Fechar aba';
    x.onclick = (ev) => {
      ev.stopPropagation();
      void fecharTab(caminho);
    };
    b.appendChild(x);
  });
}

async function fecharTab(caminho: string): Promise<void> {
  const idx = tabsArquivo.findIndex(t => t.caminho === caminho);
  if (idx < 0) return;
  const tab = tabsArquivo[idx]!;
  if (tab.editado !== tab.original) {
    const ok = await modalConfirm(`Há alterações não salvas em <code>${escapeHtml(tab.nome)}</code>. Fechar mesmo assim?`, { titulo: 'Descartar alterações?', confirmar: 'Fechar' });
    if (!ok) return;
  }
  tabsArquivo.splice(idx, 1);
  apagarRascunho(caminho);
  if (tabAtiva === caminho) {
    tabAtiva = tabsArquivo[Math.min(idx, tabsArquivo.length - 1)]?.caminho ?? null;
  }
  renderTabsArquivo();
  renderArquivoAtivo();
  persistirTabs();
}

function atualizarIndicadoresSujeira(tab: TabArquivo): void {
  const suja = tab.editado !== tab.original;
  const btn = document.getElementById('ws-btn-salvar') as HTMLButtonElement | null;
  if (btn) btn.disabled = !suja;
  const nomeEl = document.getElementById('ws-arq-nome');
  if (nomeEl) nomeEl.innerHTML = (suja ? '<span class="ws-dirty">●</span> ' : '') + escapeHtml(tab.caminho);
}

function renderArquivoAtivo(): void {
  const corpo = document.getElementById('ws-arq-corpo');
  if (!corpo) return;
  const tab = tabsArquivo.find(t => t.caminho === tabAtiva);
  if (!tab) {
    corpo.innerHTML = estadoVazio('file', 'Nenhum arquivo aberto', 'Abra um arquivo na árvore à direita ou busque pelo nome (Ctrl+P). As alterações não salvas sobrevivem à navegação e à recarga da página.');
    return;
  }
  const md = esMarkdown(tab.nome);
  const suja = tab.editado !== tab.original;
  const modos: Array<[ModoVer, string]> = md
    ? [['editor', 'Editor'], ['preview', 'Preview'], ['split', 'Lado a lado']]
    : [['editor', 'Editor'], ['preview', 'Preview']];
  corpo.innerHTML = `
    <div class="ws-arq-header">
      <span class="ws-arq-nome" id="ws-arq-nome" title="${escapeHtml(tab.caminho)}">${suja ? '<span class="ws-dirty">●</span> ' : ''}${escapeHtml(tab.caminho)}</span>
      <div class="flex items-center gap-1">
        ${modos.map(([m, rot]) => `<button type="button" class="btn btn-ghost ws-btn-mini ws-modo${tab.modo === m ? ' ws-modo-ativa' : ''}" data-modo="${m}" onclick="window.__workspaceModo(this)">${rot}</button>`).join('')}
        <button type="button" class="btn ws-btn-mini" id="ws-btn-salvar" onclick="window.__workspaceSalvar()" title="Salvar (Ctrl+S)"${suja ? '' : ' disabled'}>${icone('check')} Salvar</button>
      </div>
    </div>
    <div id="ws-arq-corpo-int">${corpoInterno(tab)}</div>
  `;
  // conteúdo entra via .value (nunca interpolação HTML) — textos do usuário
  const ta = document.getElementById('ws-editor') as HTMLTextAreaElement | null;
  if (ta) ta.value = tab.editado;
}

/** Corpo por modo: editor (textarea), preview (md→markdown, resto→<pre>) ou split (só .md). */
function corpoInterno(tab: TabArquivo): string {
  const md = esMarkdown(tab.nome);
  if (tab.modo === 'split' && md) {
    return `
      <div class="ws-split">
        <textarea id="ws-editor" class="ws-editor" spellcheck="false" oninput="window.__workspaceEditar(this.value)" onkeydown="window.__workspaceEditorTecla(event)"></textarea>
        <div class="ws-preview scrollbar-none">${renderMarkdown(tab.editado)}</div>
      </div>`;
  }
  if (tab.modo === 'preview') {
    const interno = md ? renderMarkdown(tab.editado) : `<pre class="ws-preview-pre">${escapeHtml(tab.editado)}</pre>`;
    return `<div class="ws-preview scrollbar-none">${interno}</div>`;
  }
  return `<textarea id="ws-editor" class="ws-editor" spellcheck="false" oninput="window.__workspaceEditar(this.value)" onkeydown="window.__workspaceEditorTecla(event)"></textarea>`;
}

function trocarModo(btn: HTMLElement): void {
  const tab = tabsArquivo.find(t => t.caminho === tabAtiva);
  const modo = btn.dataset.modo as ModoVer | undefined;
  if (!tab || !modo) return;
  tab.modo = modo;
  renderArquivoAtivo();
  persistirTabs();
}

/** Keystroke do editor — atualiza estado + indicadores sujos sem perder foco. */
function editarAtivo(valor: string): void {
  const tab = tabsArquivo.find(t => t.caminho === tabAtiva);
  if (!tab) return;
  tab.editado = valor;
  atualizarIndicadoresSujeira(tab);
  renderTabsArquivo();
  agendarRascunho();
}

/** Tab no editor insere 2 espaços (sem perder foco). */
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

// rascunho vai para o localStorage logo após digitar (debounce 500ms)
let timerRascunho: ReturnType<typeof setTimeout> | undefined;

function agendarRascunho(): void {
  if (timerRascunho) clearTimeout(timerRascunho);
  timerRascunho = setTimeout(() => {
    timerRascunho = undefined;
    persistirRascunhos();
  }, 500);
}

async function salvarAtivo(): Promise<void> {
  const tab = tabsArquivo.find(t => t.caminho === tabAtiva);
  if (!tab) return;
  if (tab.editado === tab.original) return;
  if (new TextEncoder().encode(tab.editado).length > MAX_CONTEUDO) {
    toast('Conteúdo excede 1MB — reduza antes de salvar', 'erro');
    return;
  }
  const btn = document.getElementById('ws-btn-salvar') as HTMLButtonElement | null;
  if (btn) btn.disabled = true;
  try {
    await putConteudo(tab, false);
    toast(`Salvo: ${tab.nome}`, 'ok');
    renderTabsArquivo();
    atualizarIndicadoresSujeira(tab);
  } catch {
    if (btn) btn.disabled = false; // api()/fetch já sinalizaram o motivo
    toast('Não foi possível salvar — o conteúdo continua no rascunho local', 'erro');
  }
}

// ── Restauração pós-recarga (tabs abertas + rascunhos não salvos) ───────────

async function restaurarTabs(): Promise<void> {
  const salvas = lerTabsSalvas();
  if (!salvas?.tabs.length) return;
  const caminhos = salvas.tabs
    .map(t => (typeof t === 'string' ? { p: t, m: undefined } : { p: t.p, m: t.m }))
    .filter(t => typeof t.p === 'string' && t.p)
    .slice(0, MAX_TABS_RESTAURADAS);
  const rascunhos = lerRascunhos();
  // se o usuário já abriu/ativou uma tab enquanto a restauração voava, ela vence
  const usuarioJaAtivou = tabAtiva !== null;
  const resultados = await Promise.allSettled(caminhos.map(async ({ p, m }) => {
    const r = await api<{ tipo: string; conteudo?: string | null }>(`/files?path=${encodeURIComponent(p)}`);
    if (r.tipo !== 'arquivo' || typeof r.conteudo !== 'string') return null;
    const nome = p.split('/').pop() ?? p;
    const tab: TabArquivo = { caminho: p, nome, original: r.conteudo, editado: r.conteudo, modo: modoValido(m) ? m : modoPadrao(nome) };
    const rascunho = rascunhos[p];
    if (rascunho && typeof rascunho.c === 'string' && rascunho.c !== tab.original) {
      tab.editado = rascunho.c; // edição não salva antes da recarga — volta suja
    } else {
      apagarRascunho(p);
    }
    return tab;
  }));
  for (const r of resultados) {
    // pode ter sido aberta à mão durante a restauração — não duplica
    if (r.status === 'fulfilled' && r.value && !tabsArquivo.some(t => t.caminho === r.value!.caminho)) {
      tabsArquivo.push(r.value);
    }
  }
  if (!tabsArquivo.length) return;
  if (!usuarioJaAtivou) {
    tabAtiva = salvas.ativa && tabsArquivo.some(t => t.caminho === salvas.ativa)
      ? salvas.ativa
      : tabsArquivo[tabsArquivo.length - 1]!.caminho;
  }
  renderTabsArquivo();
  if (!usuarioJaAtivou) renderArquivoAtivo();
}

// ── Terminais (one-shot via POST /terminal — whitelist do server) ────────────

function carregarTerminais(): void {
  if (terminais.length) return;
  try {
    const nomes = JSON.parse(localStorage.getItem(CHAVE_TERM) ?? '[]') as unknown;
    if (Array.isArray(nomes)) {
      for (const n of nomes) {
        if (typeof n === 'string' && n) terminais.push({ nome: n, log: '', historico: [], histIdx: -1 });
      }
    }
  } catch { /* localStorage indisponível — segue sem terminais persistidos */ }
  terminalAtivo = terminais[terminais.length - 1]?.nome ?? null;
}

function persistirTerminais(): void {
  try {
    localStorage.setItem(CHAVE_TERM, JSON.stringify(terminais.map(t => t.nome)));
  } catch { /* memória basta */ }
}

function criarTerminal(): void {
  if (terminais.length >= MAX_TERMINAIS) {
    toast(`Máximo de ${MAX_TERMINAIS} terminais`, 'aviso');
    return;
  }
  const nome = nomeProximoTerminal();
  terminais.push({ nome, log: '', historico: [], histIdx: -1 });
  terminalAtivo = nome;
  persistirTerminais();
  renderTerminais();
}

function limparTerminal(): void {
  const t = terminais.find(x => x.nome === terminalAtivo);
  if (!t) return;
  t.log = '';
  atualizarLogTerminal();
}

function renderTerminais(): void {
  const bar = document.getElementById('ws-tabs-term');
  const corpo = document.getElementById('ws-term-corpo');
  if (!bar || !corpo) return;
  const abas: Aba[] = terminais.map(t => ({ id: t.nome, rotulo: t.nome }));
  criarTabs(bar, abas, (id) => {
    terminalAtivo = id;
    renderTerminalAtivo();
  }, terminalAtivo ?? undefined);
  const btnNovo = document.getElementById('ws-btn-term-novo') as HTMLButtonElement | null;
  if (btnNovo) btnNovo.disabled = terminais.length >= MAX_TERMINAIS;
  if (!terminais.length) {
    corpo.innerHTML = estadoVazio('run', 'Nenhum terminal', 'Abra com "+ terminal". Comandos passam pela whitelist do opencorp (sem flags nem paths).');
    return;
  }
  renderTerminalAtivo();
}

function renderTerminalAtivo(): void {
  const corpo = document.getElementById('ws-term-corpo');
  if (!corpo) return;
  const t = terminais.find(x => x.nome === terminalAtivo);
  if (!t) {
    corpo.innerHTML = '';
    return;
  }
  corpo.innerHTML = `
    <pre class="terminal-log scrollbar-none" id="ws-term-log"></pre>
    <div class="ws-term-input">
      <span class="ws-term-prompt">ws$</span>
      <input id="ws-term-cmd" class="ws-term-campo" placeholder="comando opencorp (whitelist) — ex.: tasks list" autocomplete="off" onkeydown="window.__workspaceTermTecla(event)"/>
      <button class="btn ws-btn-mini" id="ws-term-rodar" onclick="window.__workspaceTermRodar()">${icone('run')} Rodar</button>
    </div>
  `;
  atualizarLogTerminal();
}

function atualizarLogTerminal(): void {
  const logEl = document.getElementById('ws-term-log');
  const t = terminais.find(x => x.nome === terminalAtivo);
  if (!logEl || !t) return;
  logEl.textContent = t.log;
  logEl.scrollTop = logEl.scrollHeight;
}

/** ↑↓ navega o histórico do tab; Enter roda. */
function teclaTerminal(ev: KeyboardEvent): void {
  const t = terminais.find(x => x.nome === terminalAtivo);
  const input = document.getElementById('ws-term-cmd') as HTMLInputElement | null;
  if (!t || !input) return;
  if (ev.key === 'ArrowUp') {
    ev.preventDefault();
    if (t.historico.length === 0) return;
    t.histIdx = Math.max(0, t.histIdx < 0 ? t.historico.length - 1 : t.histIdx - 1);
    input.value = t.historico[t.histIdx] ?? '';
  } else if (ev.key === 'ArrowDown') {
    ev.preventDefault();
    if (t.histIdx < 0) return;
    t.histIdx = Math.min(t.historico.length, t.histIdx + 1);
    input.value = t.histIdx === t.historico.length ? '' : t.historico[t.histIdx] ?? '';
  } else if (ev.key === 'Enter') {
    ev.preventDefault();
    void rodarTerminal();
  }
}

async function rodarTerminal(): Promise<void> {
  const t = terminais.find(x => x.nome === terminalAtivo);
  const input = document.getElementById('ws-term-cmd') as HTMLInputElement | null;
  if (!t || !input) return;
  const comando = input.value.trim();
  if (!comando) return;
  t.historico.push(comando);
  t.histIdx = t.historico.length;
  input.value = '';
  t.log += `ws$ ${comando}\n`;
  atualizarLogTerminal();
  try {
    const r = await api<{ saida: string; codigo: number }>('/terminal', {
      method: 'POST',
      body: JSON.stringify({ comando }),
    });
    t.log += (r.saida ? r.saida + '\n' : '') + `[${r.codigo === 0 ? 'ok' : 'código ' + r.codigo}]\n`;
  } catch (e) {
    t.log += `erro: ${(e as Error).message}\n`;
  }
  atualizarLogTerminal();
}
