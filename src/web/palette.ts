/**
 * Palette do composer (PLANO-PAINEL-V2 Etapa 2.2/2.3):
 *  - `/` como 1º char → palette de comandos (COMANDOS_OPCORP, filtro pelo digitado)
 *  - `@` (início ou pós-espaço) → menu de contexto com 3 fontes:
 *    arquivos do workspace (GET /files), agentes (GET /agents), tasks (GET /tasks).
 *
 * Menu único (singleton em <body>, position:fixed, z-index acima do drawer),
 * posicionado com posicaoMenu (flip nas bordas). ↑↓ navegam, Enter/click
 * inserem, Escape fecha; clique fora fecha.
 */

import { q } from "./api.js";
import { posicaoMenu } from "./ui/primitivas.js";
import { COMANDOS_OPCORP } from "./composer-comandos.js";

interface ItemMenu {
  tipo: 'comando' | 'arquivo' | 'agente' | 'task';
  valor: string;
  rotulo: string;
  descricao?: string;
}

const RE_COMANDO = /^\/([A-Za-z0-9._-]*)$/;
const RE_CONTEXTO_VIVO = /(^|\s)@([A-Za-z0-9._-]*)$/;
const LARGURA_MENU = 320;
const ALTURA_ITEM = 38;
const MAX_ITENS = 8;
const CAP_FONTE = 3;

let menuEl: HTMLDivElement | null = null;
let itensMenu: ItemMenu[] = [];
let ativa = 0;
let alvo: HTMLTextAreaElement | null = null;
let seqAbertura = 0;

/** Cache de sessão p/ o @ menu — fetch 1×; reabrir revalida em background. */
interface FontesContexto {
  arquivos: string[];
  agentes: string[];
  tasks: Array<{ id: string; titulo: string }>;
}
let cacheContexto: FontesContexto | null = null;

/** Teclas consumidas pela palette (quando aberta). true = evento tratado. */
export function paletteTecla(ev: KeyboardEvent): boolean {
  if (!menuEl) return false;
  switch (ev.key) {
    case 'ArrowDown':
      ev.preventDefault();
      ev.stopPropagation();
      if (itensMenu.length) { ativa = (ativa + 1) % itensMenu.length; renderItens(); }
      return true;
    case 'ArrowUp':
      ev.preventDefault();
      ev.stopPropagation();
      if (itensMenu.length) { ativa = (ativa - 1 + itensMenu.length) % itensMenu.length; renderItens(); }
      return true;
    case 'Enter':
    case 'Tab':
      ev.preventDefault();
      ev.stopPropagation();
      if (itensMenu.length) selecionar(ativa);
      else fecharPalette();
      return true;
    case 'Escape':
      ev.preventDefault();
      ev.stopPropagation();
      fecharPalette();
      return true;
    default:
      return false;
  }
}

/** Gatilho: chamado a cada input do composer. Abre/atualiza/fecha a palette. */
export function gatilhoComposer(texto: string, ta: HTMLTextAreaElement): void {
  const mc = RE_COMANDO.exec(texto);
  if (mc) {
    void abrirComandos(mc[1] ?? '', ta);
    return;
  }
  const mx = RE_CONTEXTO_VIVO.exec(texto);
  if (mx) {
    void abrirContexto(mx[2] ?? '', ta);
    return;
  }
  fecharPalette();
}

export function fecharPalette(): void {
  seqAbertura++;
  alvo = null;
  itensMenu = [];
  if (menuEl) {
    menuEl.remove();
    menuEl = null;
  }
  document.removeEventListener('mousedown', aoFora);
}

function aoFora(ev: MouseEvent): void {
  const t = ev.target as Node | null;
  if (!menuEl) return;
  if (t && (menuEl.contains(t) || (alvo && alvo.contains(t)))) return;
  fecharPalette();
}

async function abrirComandos(filtro: string, ta: HTMLTextAreaElement): Promise<void> {
  const f = filtro.toLowerCase();
  const itens: ItemMenu[] = COMANDOS_OPCORP
    .filter((c) => c.nome.startsWith(f))
    .map((c) => ({
      tipo: 'comando' as const,
      valor: c.nome,
      rotulo: '/' + c.nome,
      descricao: c.exemplo && c.exemplo !== '/' + c.nome ? `${c.descricao} · ex.: ${c.exemplo}` : c.descricao,
    }));
  abrirMenu(itens, ta);
}

async function abrirContexto(filtro: string, ta: HTMLTextAreaElement): Promise<void> {
  const meuSeq = ++seqAbertura;
  if (!cacheContexto) {
    itensMenu = [];
    abrirMenu(itensMenu, ta, 'carregando contexto…');
    cacheContexto = await buscarFontesContexto().catch(() => ({ arquivos: [], agentes: [], tasks: [] }));
  } else {
    void buscarFontesContexto().then((nova) => { cacheContexto = nova; }).catch(() => undefined);
  }
  if (meuSeq !== seqAbertura || !menuEl) return; // fechou/trocou enquanto buscava

  const f = filtro.toLowerCase();
  const itens: ItemMenu[] = [
    ...cacheContexto.arquivos.filter((a) => a.toLowerCase().includes(f)).slice(0, CAP_FONTE)
      .map((n) => ({ tipo: 'arquivo' as const, valor: n, rotulo: n, descricao: 'arquivo do workspace' })),
    ...cacheContexto.agentes.filter((a) => a.toLowerCase().includes(f)).slice(0, CAP_FONTE)
      .map((id) => ({ tipo: 'agente' as const, valor: id, rotulo: '@' + id, descricao: 'agente da equipe' })),
    ...cacheContexto.tasks
      .filter((t) => t.id.toLowerCase().includes(f) || t.titulo.toLowerCase().includes(f))
      .slice(0, CAP_FONTE)
      .map((t) => ({ tipo: 'task' as const, valor: t.id, rotulo: `${t.id} — ${t.titulo}`, descricao: 'task do board' })),
  ].slice(0, MAX_ITENS);

  if (menuEl.dataset.para !== idDeTextarea(ta)) return; // menu pertence a outro composer
  abrirMenu(itens, ta);
}

async function buscarFontesContexto(): Promise<FontesContexto> {
  const [files, agentes, tasks] = await Promise.all([
    q<{ itens?: Array<{ nome?: string }> }>('/files').catch(() => ({ itens: [] })),
    q<Array<{ id?: string }>>('/agents').catch(() => []),
    q<Array<{ id?: string; titulo?: string }>>('/tasks').catch(() => []),
  ]);
  return {
    arquivos: (files.itens ?? []).map((i) => String(i.nome ?? '')).filter(Boolean),
    // agentes desativados ficam fora do @ (mencionar dispara execução — guard Etapa 5)
    agentes: (Array.isArray(agentes) ? agentes : [])
      .filter((a) => (a as { ativo?: boolean }).ativo !== false)
      .map((a) => String(a.id ?? ''))
      .filter(Boolean),
    tasks: (Array.isArray(tasks) ? tasks : [])
      .filter((t) => t.id)
      .map((t) => ({ id: String(t.id), titulo: String(t.titulo ?? '') })),
  };
}

function idDeTextarea(ta: HTMLTextAreaElement): string {
  return ta.id || String([...document.querySelectorAll('textarea')].indexOf(ta));
}

function abrirMenu(itens: ItemMenu[], ta: HTMLTextAreaElement, aviso?: string): void {
  const novo = !menuEl;
  if (!menuEl) {
    menuEl = document.createElement('div');
    menuEl.className = 'palette-menu';
    menuEl.setAttribute('role', 'listbox');
    document.body.appendChild(menuEl);
  }
  alvo = ta;
  itensMenu = itens;
  ativa = 0;
  menuEl.dataset.para = idDeTextarea(ta);
  if (aviso && !itens.length) {
    menuEl.innerHTML = '';
    const vazio = document.createElement('div');
    vazio.className = 'palette-vazio';
    vazio.textContent = aviso;
    menuEl.appendChild(vazio);
  } else {
    renderItens();
  }
  posicionar();
  if (novo) document.addEventListener('mousedown', aoFora);
}

function posicionar(): void {
  if (!menuEl || !alvo) return;
  const rect = alvo.getBoundingClientRect();
  const itens = itensMenu.length ? itensMenu.length : 1;
  const altura = Math.min(itens, MAX_ITENS) * ALTURA_ITEM + 12;
  const pos = posicaoMenu(rect.left, rect.bottom + 4, LARGURA_MENU, altura, window.innerWidth, window.innerHeight);
  menuEl.style.left = pos.left + 'px';
  menuEl.style.top = pos.top + 'px';
}

function renderItens(): void {
  if (!menuEl) return;
  menuEl.innerHTML = '';
  let secaoAnterior: string | null = null;
  itensMenu.forEach((item, i) => {
    if (item.tipo !== 'comando' && item.tipo !== secaoAnterior) {
      secaoAnterior = item.tipo;
      const rot = document.createElement('div');
      rot.className = 'palette-rotulo';
      rot.textContent = item.tipo === 'arquivo' ? 'Arquivos' : item.tipo === 'agente' ? 'Agentes' : 'Tasks';
      menuEl!.appendChild(rot);
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'palette-item' + (i === ativa ? ' ativa' : '');
    btn.setAttribute('role', 'option');
    btn.setAttribute('aria-selected', String(i === ativa));
    btn.dataset.tipo = item.tipo;
    btn.dataset.valor = item.valor;
    btn.textContent = item.rotulo;
    if (item.descricao) {
      const desc = document.createElement('span');
      desc.className = 'palette-desc';
      desc.textContent = item.descricao;
      btn.appendChild(desc);
    }
    btn.addEventListener('click', () => selecionar(i));
    btn.addEventListener('mousemove', () => {
      if (ativa !== i) { ativa = i; renderItens(); }
    });
    menuEl!.appendChild(btn);
  });
}

/** Insere a seleção no composer (substitui o token em edição) e fecha. */
function selecionar(i: number): void {
  const item = itensMenu[i];
  const ta = alvo;
  fecharPalette();
  if (!item || !ta) return;

  if (item.tipo === 'comando') {
    ta.value = '/' + item.valor + ' ';
  } else {
    const m = RE_CONTEXTO_VIVO.exec(ta.value);
    const prefixo = m ? ta.value.slice(0, m.index + m[1]!.length) : ta.value.replace(/\s+$/, '') + ' ';
    ta.value = prefixo + '@' + item.valor + ' ';
  }
  ta.focus();
  // input sintético: reusa o handler inline (rascunho/altura/sync entre superfícies)
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}
