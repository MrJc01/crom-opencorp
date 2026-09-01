/**
 * View Workspace — estilo VS Code (PLANO-PAINEL-V2 Etapa 3 · P-08, P-09, P-10).
 *
 * Coluna esquerda: árvore de arquivos (GET /files/tree; dirs ▸/▾, arquivos com
 * ícone; clique abre tab de arquivo / alterna dir; expansão em memória).
 * Coluna direita: tabs de arquivos (criarTabs) com 3 modos — Editor (textarea
 * mono), Preview (renderMarkdown p/ .md, <pre> p/ demais; padrão p/ .md é
 * Preview) e "Lado a lado" (só .md) — + Salvar (PUT /files, dirty ● na tab,
 * Ctrl+S com o editor em foco). Abaixo, tabs de TERMINAIS (criarTabs; criados
 * pelo usuário, máx 4, nomes persistidos em localStorage oc-terminal-tabs):
 * input + Rodar → POST /terminal (whitelist/sanitização do server valem) e a
 * saída APENDE no log do tab com status (ok/código/erro). Histórico ↑↓ por tab.
 *
 * Estado (tabs abertos, conteúdo editado, expansão da árvore, logs e histórico
 * de terminal) vive em memória do módulo — sobrevive à navegação (padrão
 * secretario.ts). A view NÃO re-renderiza via SSE (main.ts não lista
 * 'workspace' em processarEventoSSE) nem no refresh de 8s (guard do secretário);
 * recarga explícita só pelo botão "Atualizar".
 */

import { api, toast, icone, escapeHtml } from "../api.js";
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

const CHAVE_TERM = 'oc-terminal-tabs';
const MAX_TERMINAIS = 4;
const MAX_CONTEUDO = 1024 * 1024; // 1MB — espelha o cap do PUT /files

// ── Estado do módulo (sobrevive à navegação) ────────────────────────────────
let arvore: NoArvoreWeb[] | null = null;
let arvoreTruncada = false;
let erroArvore: string | null = null;
let expandidos = new Set<string>();
let tabsArquivo: TabArquivo[] = [];
let tabAtiva: string | null = null;
let terminais: TabTerminal[] = [];
let terminalAtivo: string | null = null;

// ── Helpers puros ───────────────────────────────────────────────────────────

/** .md → Preview por padrão; demais → Editor. "Lado a lado" só existe p/ .md. */
function esMarkdown(nome: string): boolean {
  return nome.toLowerCase().endsWith('.md');
}

function modoPadrao(nome: string): ModoVer {
  return esMarkdown(nome) ? 'preview' : 'editor';
}

function nomeProximoTerminal(): string {
  const usados = new Set(terminais.map(t => t.nome));
  let i = 1;
  while (usados.has('term-' + i)) i++;
  return 'term-' + i;
}

/** Dica de workspace vazio: nada além do diretório .opencorp no topo. */
function soOpencorp(nos: NoArvoreWeb[]): boolean {
  return nos.length === 0 || nos.every(n => n.caminho === '.opencorp' || n.caminho.startsWith('.opencorp/'));
}

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
  // Ctrl+S salva quando o editor tem foco (atalho único por boot)
  document.addEventListener('keydown', (ev: KeyboardEvent) => {
    if (!(ev.ctrlKey || ev.metaKey) || ev.key.toLowerCase() !== 's') return;
    const ativo = document.activeElement as HTMLElement | null;
    if (!ativo || ativo.id !== 'ws-editor') return;
    ev.preventDefault();
    void salvarAtivo();
  });
}

// ── Render da view ──────────────────────────────────────────────────────────

/** Renderiza a view Workspace (idempotente: reconstrói do estado do módulo). */
export async function renderWorkspace(): Promise<void> {
  const viewEl = document.getElementById('view-workspace');
  if (!viewEl) return;

  exporHandlers();
  carregarTerminais();

  viewEl.innerHTML = `
    <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
      <h1 class="text-2xl font-bold flex items-center gap-2">${icone('folder')} Workspace ${ajuda('workspace-view')}</h1>
      <div class="flex items-center gap-2">
        <span class="text-xs" id="ws-truncado"></span>
        <button class="btn btn-ghost" onclick="window.__workspaceAtualizar()" title="Recarregar árvore de arquivos">${icone('run')} Atualizar</button>
      </div>
    </div>
    <div class="ws-grid">
      <aside class="ws-painel ws-painel-arvore scrollbar-none" id="ws-arvore">${estadoCarregando('Carregando arquivos…')}</aside>
      <div class="ws-direita">
        <div class="ws-painel ws-painel-editor">
          <div id="ws-tabs-arq" class="ws-tabs-bar scrollbar-none"></div>
          <div id="ws-arq-corpo"></div>
        </div>
        <div class="ws-painel ws-painel-term">
          <div class="flex items-center justify-between mb-1 gap-2 flex-wrap">
            <h2 class="text-sm font-semibold text-zinc-400 flex items-center gap-1">${icone('run')} Terminais</h2>
            <div class="flex gap-1">
              <button class="btn btn-ghost ws-btn-mini" onclick="window.__workspaceTermLimpar()" title="Limpar o log do terminal ativo">Limpar</button>
              <button class="btn btn-ghost ws-btn-mini" id="ws-btn-term-novo" onclick="window.__workspaceTermCriar()" title="Novo terminal (máx ${MAX_TERMINAIS})">${icone('plus')} terminal</button>
            </div>
          </div>
          <div id="ws-tabs-term" class="ws-tabs-bar scrollbar-none"></div>
          <div id="ws-term-corpo"></div>
        </div>
      </div>
    </div>
  `;

  renderTabsArquivo();
  renderArquivoAtivo();
  renderTerminais();
  await carregarArvore();
}

// ── Árvore de arquivos ──────────────────────────────────────────────────────

async function carregarArvore(): Promise<void> {
  erroArvore = null;
  try {
    const r = await api<{ tipo: string; arvore: NoArvoreWeb[]; truncado: boolean }>('/files/tree?profundidade=4');
    arvore = Array.isArray(r?.arvore) ? r.arvore : [];
    arvoreTruncada = !!r?.truncado;
  } catch (e) {
    erroArvore = (e as Error).message;
  }
  renderArvore();
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
  if (truncEl) truncEl.textContent = arvoreTruncada ? 'árvore truncada (cap de nós)' : '';
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
    const filhos = aberto && no.filhos?.length ? no.filhos.map(f => htmlNo(f, nivel + 1)).join('') : '';
    return `
      <button type="button" class="tree-dir${aberto ? ' tree-aberto' : ''}" data-path="${escapeHtml(no.caminho)}" style="${recuo}" onclick="window.__workspaceDir(this)" title="${escapeHtml(no.caminho)}">
        <span class="tree-chev">${aberto ? '▾' : '▸'}</span>${icone('folder', 'tree-ico')}<span class="tree-nome">${escapeHtml(no.nome)}</span>
      </button>${filhos}`;
  }
  return `
    <button type="button" class="tree-arquivo" data-path="${escapeHtml(no.caminho)}" style="${recuo}" onclick="window.__workspaceArquivo(this)" title="${escapeHtml(no.caminho)}">
      ${icone('file', 'tree-ico')}<span class="tree-nome">${escapeHtml(no.nome)}</span>
    </button>`;
}

function alternarDir(btn: HTMLElement): void {
  const caminho = btn.dataset.path ?? '';
  if (!caminho) return;
  if (expandidos.has(caminho)) expandidos.delete(caminho);
  else expandidos.add(caminho);
  renderArvore();
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
    return;
  }
  try {
    const r = await api<{ tipo: string; conteudo?: string | null; motivo?: string }>(`/files?path=${encodeURIComponent(caminho)}`);
    if (r.tipo !== 'arquivo' || typeof r.conteudo !== 'string') {
      toast(r.motivo ?? 'Não foi possível abrir o arquivo', 'aviso');
      return;
    }
    const nome = caminho.split('/').pop() ?? caminho;
    tabsArquivo.push({ caminho, nome, original: r.conteudo, editado: r.conteudo, modo: modoPadrao(nome) });
    tabAtiva = caminho;
    renderTabsArquivo();
    renderArquivoAtivo();
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
  }, tabAtiva ?? undefined);
  // fechar (×) por tab — anexado ao botão criado pela primitiva (mesma ordem)
  const botoes = Array.from(bar.querySelectorAll('.ui-tab')) as HTMLButtonElement[];
  botoes.forEach((b, i) => {
    const x = document.createElement('span');
    x.className = 'ui-tab-fechar';
    x.textContent = '×';
    x.title = 'Fechar aba';
    x.onclick = (ev) => {
      ev.stopPropagation();
      const caminho = abas[i]?.id;
      if (caminho) void fecharTab(caminho);
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
  if (tabAtiva === caminho) {
    tabAtiva = tabsArquivo[Math.min(idx, tabsArquivo.length - 1)]?.caminho ?? null;
  }
  renderTabsArquivo();
  renderArquivoAtivo();
}

function renderArquivoAtivo(): void {
  const corpo = document.getElementById('ws-arq-corpo');
  if (!corpo) return;
  const tab = tabsArquivo.find(t => t.caminho === tabAtiva);
  if (!tab) {
    corpo.innerHTML = estadoVazio('file', 'Nenhum arquivo aberto', 'Abra um arquivo na árvore à esquerda. A edição sobrevive à navegação; salve com Ctrl+S ou no botão.');
    return;
  }
  const md = esMarkdown(tab.nome);
  const suja = tab.editado !== tab.original;
  const modos: Array<[ModoVer, string]> = md
    ? [['editor', 'Editor'], ['preview', 'Preview'], ['split', 'Lado a lado']]
    : [['editor', 'Editor'], ['preview', 'Preview']];
  corpo.innerHTML = `
    <div class="ws-arq-header">
      <span class="ws-arq-nome" id="ws-arq-nome" title="${escapeHtml(tab.caminho)}">${suja ? '<span class="ws-dirty">●</span> ' : ''}${escapeHtml(tab.nome)}</span>
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
        <textarea id="ws-editor" class="ws-editor" spellcheck="false" oninput="window.__workspaceEditar(this.value)"></textarea>
        <div class="ws-preview scrollbar-none">${renderMarkdown(tab.editado)}</div>
      </div>`;
  }
  if (tab.modo === 'preview') {
    const interno = md ? renderMarkdown(tab.editado) : `<pre class="ws-preview-pre">${escapeHtml(tab.editado)}</pre>`;
    return `<div class="ws-preview scrollbar-none">${interno}</div>`;
  }
  return `<textarea id="ws-editor" class="ws-editor" spellcheck="false" oninput="window.__workspaceEditar(this.value)"></textarea>`;
}

function trocarModo(btn: HTMLElement): void {
  const tab = tabsArquivo.find(t => t.caminho === tabAtiva);
  const modo = btn.dataset.modo as ModoVer | undefined;
  if (!tab || !modo) return;
  tab.modo = modo;
  renderArquivoAtivo();
}

/** Keystroke do editor — atualiza estado + indicadores sujos sem perder foco. */
function editarAtivo(valor: string): void {
  const tab = tabsArquivo.find(t => t.caminho === tabAtiva);
  if (!tab) return;
  tab.editado = valor;
  const suja = tab.editado !== tab.original;
  const btn = document.getElementById('ws-btn-salvar') as HTMLButtonElement | null;
  if (btn) btn.disabled = !suja;
  const nomeEl = document.getElementById('ws-arq-nome');
  if (nomeEl) nomeEl.innerHTML = (suja ? '<span class="ws-dirty">●</span> ' : '') + escapeHtml(tab.nome);
  renderTabsArquivo();
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
    await api(`/files?path=${encodeURIComponent(tab.caminho)}`, {
      method: 'PUT',
      body: JSON.stringify({ conteudo: tab.editado }),
    });
    tab.original = tab.editado;
    toast(`Salvo: ${tab.nome}`, 'ok');
    renderTabsArquivo();
    renderArquivoAtivo();
  } catch {
    if (btn) btn.disabled = false; // api() já toastou o motivo
  }
}

// ── Terminais (one-shot via POST /terminal — whitelist do server) ────────────

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
