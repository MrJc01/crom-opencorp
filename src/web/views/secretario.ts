/**
 * View Secretário — chat estilo opencode (feed plano, composer com picker de
 * agente + stop, histórico agrupado Hoje/Ontem/Anteriores, markdown rico).
 *
 * Armadilha respeitada: a view NÃO se re-renderiza durante a conversa
 * (o refresh de 8s em main.ts já pula view 'secretario').
 */

import { api, q, toast, icone, escapeHtml } from "../api.js";
import { getWsAtivo } from "../state.js";
import { formatarDataLocal } from "../format.js";
import { estadoErro } from "../estado.js";
import { ajuda } from "../help.js";
import { renderMarkdown } from "../md.js";

interface SecretarioStatus {
  rodando: boolean;
  porta?: number;
  agentes?: number;
  configurado?: boolean;
}

interface SessaoChat {
  id: string;
  title?: string;
  created_at?: string;
  updated_at?: string;
  created?: number;
  updated?: number;
}

interface MensagemChat {
  role: 'user' | 'assistant';
  content: string;
  criado_em?: string;
}

interface ConversaResponse {
  resposta: string;
  sessao_id: string;
}

let sessoesCache: SessaoChat[] = [];
let sessaoAtivaId: string | null = null;
let mensagensCache: MensagemChat[] = [];
let agenteSelecionado: 'secretario' | 'secretario-exec' = 'secretario';
let carregando = false;
let controller: AbortController | null = null;
let busca = '';
let pertoDoFundo = true;

const SUGESTOES = [
  'O que aconteceu hoje?',
  'Como está o board?',
  'Rodar linha ceo-analise-board',
  'Qual meu custo hoje?',
];

const FOLLOWUPS = ['Detalhe o 1º ponto', 'E o que faço agora?'];

/** ISO (proxy real) ou ms (fake/proxy) → Date */
function dataSessao(s: SessaoChat): Date | null {
  const iso = s.updated_at ?? s.created_at;
  if (iso) {
    const d = new Date(iso);
    if (!isNaN(d.getTime())) return d;
  }
  const ms = s.updated ?? s.created;
  if (typeof ms === 'number') return new Date(ms);
  return null;
}

function tituloSessao(s: SessaoChat): string {
  const t = (s.title || 'Sem título').trim();
  return t.length > 50 ? t.slice(0, 49) + '…' : t;
}

/** Renderiza a view Secretário */
export async function renderSecretario(): Promise<void> {
  const viewEl = document.getElementById('view-secretario');
  if (!viewEl) return;

  // Reset estado local ao entrar na view
  sessoesCache = [];
  sessaoAtivaId = null;
  mensagensCache = [];
  agenteSelecionado = 'secretario';
  carregando = false;
  controller = null;
  busca = '';
  pertoDoFundo = true;

  viewEl.innerHTML = `
    <div class="flex items-center justify-between mb-4 gap-2">
      <h1 class="text-2xl font-bold flex items-center gap-2">${icone('chat')} Secretário ${ajuda('secretario')}</h1>
      <button class="btn-ghost text-xs md:hidden" onclick="window.__secretarioToggleConv()" aria-label="Alternar lista de conversas" title="Conversas">${icone('tasks')}</button>
    </div>
    <div id="secretario-content">${estadoCarregandoCustom()}</div>
  `;

  try {
    const status = await q<SecretarioStatus>('/secretario/status');
    if (!status.rodando) {
      renderStandby();
    } else {
      await carregarSessoes();
      renderChatLayout();
    }
  } catch (e) {
    toast('Erro ao carregar status do secretário: ' + (e as Error).message, 'erro');
    renderErro();
  }
}

function estadoCarregandoCustom(): string {
  return `
    <div class="card p-6 text-center">
      <div class="empty-icon mb-4">${icone('chat')}</div>
      <h2 class="text-xl font-semibold mb-2">Carregando status…</h2>
    </div>
  `;
}

function renderStandby(): void {
  const viewEl = document.getElementById('view-secretario');
  if (!viewEl) return;

  viewEl.innerHTML = `
    <div class="flex items-center justify-between mb-4 gap-2">
      <h1 class="text-2xl font-bold flex items-center gap-2">${icone('chat')} Secretário ${ajuda('secretario')}</h1>
    </div>
    <div class="card p-8 text-center max-w-md mx-auto">
      <div class="empty-icon mb-4">${icone('chat')}</div>
      <h2 class="text-xl font-semibold mb-2">Secretário em standby</h2>
      <p class="text-zinc-400 mb-6">O secretário ainda não foi iniciado. Clique abaixo para começar.</p>
      <button class="btn" id="btn-iniciar-secretario" onclick="window.__secretarioIniciar()">
        ${icone('run')} Iniciar secretário
      </button>
      <p class="text-zinc-500 text-sm mt-3">Pode demorar ~10s para subir o servidor.</p>
    </div>
  `;

  (window as unknown as Record<string, unknown>).__secretarioIniciar = async () => {
    const btn = document.getElementById('btn-iniciar-secretario') as HTMLButtonElement;
    if (!btn) return;

    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `${icone('spark')} Iniciando…`;

    try {
      await api('/secretario/start', { method: 'POST' });
      toast('Secretário iniciado', 'ok');
      await renderSecretario(); // recarrega a view completa
    } catch (e) {
      toast('Erro ao iniciar: ' + (e as Error).message, 'erro');
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  };
}

async function carregarSessoes(): Promise<void> {
  try {
    sessoesCache = await q<SessaoChat[]>('/secretario/sessoes');
  } catch {
    sessoesCache = [];
  }
}

function renderChatLayout(): void {
  const viewEl = document.getElementById('view-secretario');
  if (!viewEl) return;

  viewEl.innerHTML = `
    <div class="flex items-center justify-between mb-4 gap-2">
      <h1 class="text-2xl font-bold flex items-center gap-2">${icone('chat')} Secretário ${ajuda('secretario')}</h1>
      <button class="btn-ghost text-xs md:hidden" onclick="window.__secretarioToggleConv()" aria-label="Alternar lista de conversas" title="Conversas">${icone('tasks')}</button>
    </div>
    <div class="secretario-grid" id="secretario-grid">
      <!-- Coluna esquerda: lista de conversas -->
      <div class="card flex flex-col" id="secretario-lateral">
        <div class="p-3 border-b border-zinc-800 flex items-center justify-between gap-2">
          <h3 class="font-semibold text-sm">Conversas</h3>
          <div class="flex items-center gap-1">
            <button class="btn" onclick="window.__secretarioNovaConversa()" title="Nova conversa" aria-label="Nova conversa">${icone('plus')}</button>
            <button class="btn-ghost text-xs md:hidden" onclick="window.__secretarioToggleConv()" aria-label="Fechar lista">✕</button>
          </div>
        </div>
        <div class="p-2 border-b border-zinc-800">
          <input id="sessao-busca" placeholder="Buscar conversa…" oninput="window.__secretarioBusca(this.value)"/>
        </div>
        <div class="flex-1 overflow-y-auto scrollbar-thin" id="lista-sessoes"></div>
      </div>

      <!-- Coluna direita: chat -->
      <div class="card flex flex-col" id="secretario-chat">
        <div class="p-3 border-b border-zinc-800 flex items-center justify-between gap-2">
          <h3 class="font-semibold text-sm truncate" id="chat-titulo">Nova conversa</h3>
          <label class="flex items-center gap-1 text-xs text-zinc-400 flex-shrink-0">
            <select id="chat-agente" class="text-xs w-auto" onchange="window.__secretarioSetAgente(this.value)" title="secretário apenas analisa e relata; secretário-exec também executa ações">
              <option value="secretario" ${agenteSelecionado === 'secretario' ? 'selected' : ''}>secretário</option>
              <option value="secretario-exec" ${agenteSelecionado === 'secretario-exec' ? 'selected' : ''}>secretário-exec</option>
            </select>
            ${ajuda('secretario')}
          </label>
        </div>
        <div class="flex-1 overflow-y-auto scrollbar-thin" id="chat-mensagens">
          <div class="oc-feed" id="oc-feed"></div>
        </div>
        <button id="btn-ir-fim" class="oc-ir-fim hidden" onclick="window.__secretarioIrFim()" aria-label="Ir para o fim">↓</button>
        <div class="p-3 border-t border-zinc-800">
          <div class="composer">
            <textarea id="chat-input" placeholder="Pergunte qualquer coisa…" rows="1" onkeydown="if(event.key==='Enter' && !event.shiftKey){event.preventDefault(); window.__secretarioEnviar()}" oninput="window.__secretarioAutoAltura()"></textarea>
            <div class="composer-row">
              <span class="text-xs text-zinc-500 composer-dica">secretário analisa · secretário-exec executa</span>
              <button class="btn composer-enviar" id="btn-enviar" onclick="window.__secretarioEnviar()" aria-label="Enviar mensagem">${icone('run')}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const feed = document.getElementById('chat-mensagens');
  if (feed) {
    feed.addEventListener('scroll', () => {
      pertoDoFundo = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80;
      document.getElementById('btn-ir-fim')?.classList.toggle('hidden', pertoDoFundo);
    });
  }

  renderListaSessoes();
  renderMensagens();
  (document.getElementById('chat-input') as HTMLTextAreaElement)?.focus();

  const g = window as unknown as Record<string, unknown>;
  g.__secretarioToggleConv = () => {
    document.getElementById('secretario-grid')?.classList.toggle('conv-aberta');
  };

  g.__secretarioBusca = (v: string) => {
    busca = v.toLowerCase();
    renderListaSessoes();
  };

  g.__secretarioNovaConversa = () => {
    if (carregando) return;
    sessaoAtivaId = null;
    mensagensCache = [];
    document.getElementById('secretario-grid')?.classList.remove('conv-aberta');
    renderListaSessoes();
    renderMensagens();
    const titulo = document.getElementById('chat-titulo');
    if (titulo) titulo.textContent = 'Nova conversa';
    (document.getElementById('chat-input') as HTMLTextAreaElement)?.focus();
  };

  g.__secretarioSetAgente = (v: string) => {
    agenteSelecionado = v as 'secretario' | 'secretario-exec';
    toast(agenteSelecionado === 'secretario' ? 'secretário: analisa e relata' : 'secretário-exec: também executa ações', 'ok');
  };

  g.__secretarioAutoAltura = () => {
    const ta = document.getElementById('chat-input') as HTMLTextAreaElement | null;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 150) + 'px';
  };

  g.__secretarioIrFim = () => {
    const el = document.getElementById('chat-mensagens');
    if (el) el.scrollTop = el.scrollHeight;
  };

  g.__secretarioEnviar = async () => { await enviar(); };

  g.__secretarioSelecionarSessao = async (id: string) => {
    if (carregando) return;
    sessaoAtivaId = id;
    document.getElementById('secretario-grid')?.classList.remove('conv-aberta');
    await carregarMensagens(id);
    renderListaSessoes();
    renderMensagens();
    const sessao = sessoesCache.find((s) => s.id === id);
    const titulo = document.getElementById('chat-titulo');
    if (titulo) titulo.textContent = tituloSessao(sessao ?? { id });
    (document.getElementById('chat-input') as HTMLTextAreaElement)?.focus();
  };

  g.__secretarioCopyMsg = (idx: number, btn: HTMLButtonElement) => {
    const m = mensagensCache[idx];
    if (!m) return;
    void navigator.clipboard.writeText(m.content).then(() => {
      const original = btn.textContent;
      btn.textContent = '✓';
      setTimeout(() => { btn.textContent = original ?? 'copy'; }, 1200);
    });
  };

  g.__secretarioSugestao = (texto: string) => {
    const input = document.getElementById('chat-input') as HTMLTextAreaElement | null;
    if (input) input.value = texto;
    void enviar();
  };
}

async function carregarMensagens(sessaoId: string): Promise<void> {
  try {
    const msgs = await q<MensagemChat[]>(`/secretario/sessoes/${encodeURIComponent(sessaoId)}/mensagens`);
    mensagensCache = msgs || [];
  } catch {
    mensagensCache = [];
  }
}

/** Lista de sessões agrupada Hoje/Ontem/Anteriores + busca client-side */
function renderListaSessoes(): void {
  const el = document.getElementById('lista-sessoes');
  if (!el) return;

  const filtradas = sessoesCache.filter((s) =>
    !busca || tituloSessao(s).toLowerCase().includes(busca));

  if (!filtradas.length) {
    el.innerHTML = `
      <div class="p-4 text-center text-zinc-500 text-sm">
        ${sessoesCache.length ? 'Nenhuma conversa encontrada.' : 'Nenhuma conversa ainda.'}
        <br><br>
        <button class="btn-ghost text-xs" onclick="window.__secretarioNovaConversa()">Iniciar primeira conversa</button>
      </div>
    `;
    return;
  }

  const grupos: Record<string, SessaoChat[]> = { 'Hoje': [], 'Ontem': [], 'Anteriores': [] };
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const ontem = new Date(hoje); ontem.setDate(ontem.getDate() - 1);

  const ts = (s: SessaoChat): number => dataSessao(s)?.getTime() ?? 0;
  const ordenadas = [...filtradas].sort((a, b) => ts(b) - ts(a));

  for (const s of ordenadas) {
    const d = dataSessao(s);
    if (!d) { grupos['Anteriores']!.push(s); continue; }
    if (d >= hoje) grupos['Hoje']!.push(s);
    else if (d >= ontem) grupos['Ontem']!.push(s);
    else grupos['Anteriores']!.push(s);
  }

  const item = (s: SessaoChat) => `
    <button class="sessao-item ${s.id === sessaoAtivaId ? 'ativa' : ''}" onclick="window.__secretarioSelecionarSessao('${escapeHtml(s.id)}')">
      <div class="sessao-titulo">${escapeHtml(tituloSessao(s))}</div>
      <div class="sessao-data">${(() => { const d = dataSessao(s); return d ? formatarDataLocal(d.toISOString()) : ''; })()}</div>
    </button>
  `;

  el.innerHTML = (['Hoje', 'Ontem', 'Anteriores'] as const)
    .filter((k) => grupos[k]!.length)
    .map((k) => `
      <div class="sessao-grupo">${k}</div>
      ${grupos[k]!.map(item).join('')}
    `).join('');
}

/** Feed de mensagens (estilo opencode: user = bloco sutil, assistant = md plano) */
function renderMensagens(): void {
  const el = document.getElementById('oc-feed');
  if (!el) return;

  if (!mensagensCache.length) {
    el.innerHTML = `
      <div class="oc-vazio">
        <div class="oc-vazio-titulo">Pergunte qualquer coisa sobre a empresa</div>
        <div class="oc-chips">
          ${SUGESTOES.map((s) => `<button class="chip" onclick="window.__secretarioSugestao('${escapeHtml(s).replace(/'/g, '&#39;')}')">${escapeHtml(s)}</button>`).join('')}
        </div>
      </div>
    `;
    return;
  }

  el.innerHTML = mensagensCache.map((m, i) => `
    <div class="oc-msg ${m.role === 'user' ? 'oc-user' : 'oc-assistant'}">
      <div class="oc-msg-corpo">${m.role === 'user' ? `<p class="md-p">${escapeHtml(m.content).replace(/\n/g, '<br>')}</p>` : renderMarkdown(m.content)}</div>
      <button class="oc-copy" title="Copiar mensagem" aria-label="Copiar mensagem" onclick="window.__secretarioCopyMsg(${i}, this)">copy</button>
    </div>
  `).join('');

  // follow-ups após a última resposta do assistant
  const ultima = mensagensCache[mensagensCache.length - 1];
  if (ultima?.role === 'assistant' && !carregando) {
    el.innerHTML += `
      <div class="oc-chips oc-followups">
        ${FOLLOWUPS.map((s) => `<button class="chip" onclick="window.__secretarioSugestao('${escapeHtml(s).replace(/'/g, '&#39;')}')">${escapeHtml(s)}</button>`).join('')}
      </div>
    `;
  }

  if (carregando) {
    el.innerHTML += `
      <div class="oc-msg oc-assistant oc-pensando">
        <div class="oc-msg-corpo"><span class="oc-pensando-texto">Pensando<span class="oc-dots"><i>.</i><i>.</i><i>.</i></span></span></div>
      </div>
    `;
  }

  const container = document.getElementById('chat-mensagens');
  if (container && pertoDoFundo) container.scrollTop = container.scrollHeight;
}

/** Envia mensagem — botão vira STOP durante a espera (AbortController) */
async function enviar(): Promise<void> {
  if (carregando) {
    // segundo clique = parar
    controller?.abort();
    return;
  }

  const input = document.getElementById('chat-input') as HTMLTextAreaElement | null;
  const btn = document.getElementById('btn-enviar') as HTMLButtonElement | null;
  const texto = input?.value.trim();
  if (!texto || !input || !btn) return;

  carregando = true;
  controller = new AbortController();
  btn.innerHTML = icone('stop');
  btn.classList.add('parando');
  btn.setAttribute('aria-label', 'Parar resposta');

  mensagensCache.push({ role: 'user', content: texto });
  input.value = '';
  input.style.height = 'auto';
  renderMensagens();
  if (!sessaoAtivaId) {
    const titulo = document.getElementById('chat-titulo');
    if (titulo) titulo.textContent = texto.length > 50 ? texto.slice(0, 49) + '…' : texto;
  }

  try {
    const { headers } = await import("../api.js");
    const ws = getWsAtivo();
    const res = await fetch('/secretario/conversa' + (ws ? '?workspace=' + encodeURIComponent(ws) : ''), {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ mensagem: texto, sessao_id: sessaoAtivaId || undefined, agente: agenteSelecionado }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const corpo = (await res.json().catch(() => ({}))) as { erro?: string };
      throw new Error(corpo.erro ?? `HTTP ${res.status}`);
    }
    const data = (await res.json()) as ConversaResponse;
    mensagensCache.push({ role: 'assistant', content: data.resposta });
    const eraNova = !sessaoAtivaId;
    sessaoAtivaId = data.sessao_id;

    await carregarSessoes();
    renderListaSessoes();
    if (eraNova) {
      const sel = sessoesCache.find((s) => s.id === sessaoAtivaId);
      const titulo = document.getElementById('chat-titulo');
      if (titulo && sel) titulo.textContent = tituloSessao(sel);
    }
  } catch (e) {
    const err = e as Error;
    if (err.name === 'AbortError') {
      toast('Interrompido — se a resposta terminou no servidor, ela aparece ao reabrir a conversa', 'aviso');
      if (sessaoAtivaId) await carregarMensagens(sessaoAtivaId);
    } else {
      toast(err.message, 'erro');
      // remove a msg do usuário se falhou de verdade (sem resposta no server)
      if (!sessaoAtivaId) mensagensCache.pop();
    }
  } finally {
    carregando = false;
    controller = null;
    btn.innerHTML = icone('run');
    btn.classList.remove('parando');
    btn.setAttribute('aria-label', 'Enviar mensagem');
    renderMensagens();
  }
}

function renderErro(): void {
  const viewEl = document.getElementById('view-secretario');
  if (!viewEl) return;

  viewEl.innerHTML = `
    <div class="flex items-center justify-between mb-4 gap-2">
      <h1 class="text-2xl font-bold flex items-center gap-2">${icone('chat')} Secretário ${ajuda('secretario')}</h1>
    </div>
    ${estadoErro('Não foi possível conectar ao secretário.', () => { void renderSecretario(); })}
  `;
}
