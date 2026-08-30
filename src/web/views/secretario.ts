/**
 * View Secretário — Chat estilo opencode (2 colunas).
 */

import { api, q, toast, icone, escapeHtml } from "../api.js";
import { formatarDataLocal } from "../format.js";

interface SecretarioStatus {
  rodando: boolean;
  porta?: number;
  agentes?: number;
}

interface SessaoChat {
  id: string;
  title?: string;
  created_at?: string;
  updated_at?: string;
}

interface MensagemChat {
  role: 'user' | 'assistant';
  content: string;
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

  viewEl.innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold flex items-center gap-2">${icone('chat')} Secretário</h1>
    </div>
    <div id="secretario-content" class="card p-6 text-center">
      <div class="empty-icon mb-4">${icone('chat')}</div>
      <h2 class="text-xl font-semibold mb-2">Carregando status…</h2>
    </div>
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

function renderStandby(): void {
  const viewEl = document.getElementById('view-secretario');
  if (!viewEl) return;

  viewEl.innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold flex items-center gap-2">${icone('chat')} Secretário</h1>
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
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold flex items-center gap-2">${icone('chat')} Secretário</h1>
      <div class="flex items-center gap-2">
        <span class="text-xs text-zinc-500 font-mono">${sessoesCache.length} conversa(s)</span>
        <button class="btn-ghost text-xs" onclick="window.__secretarioNovaConversa()">${icone('plus')} Nova</button>
      </div>
    </div>
    <div class="grid md:grid-cols-[260px_1fr] gap-4 h-[85vh]">
      <!-- Coluna esquerda: lista de conversas -->
      <div class="card flex flex-col" id="secretario-lateral">
        <div class="p-3 border-b border-zinc-800">
          <h3 class="font-semibold text-sm">Conversas</h3>
        </div>
        <div class="flex-1 overflow-y-auto" id="lista-sessoes"></div>
      </div>

      <!-- Coluna direita: chat -->
      <div class="card flex flex-col" id="secretario-chat">
        <div class="p-3 border-b border-zinc-800 flex items-center justify-between">
          <h3 class="font-semibold" id="chat-titulo">Selecione uma conversa</h3>
          <select id="chat-agente" class="text-xs" onchange="window.__secretarioSetAgente(this.value)">
            <option value="secretario" ${agenteSelecionado === 'secretario' ? 'selected' : ''}>secretário — apenas analisa</option>
            <option value="secretario-exec" ${agenteSelecionado === 'secretario-exec' ? 'selected' : ''}>secretário-exec — pode executar</option>
          </select>
        </div>
        <div class="flex-1 overflow-y-auto p-4 space-y-4" id="chat-mensagens"></div>
        <div class="p-3 border-t border-zinc-800 chat-input-area" id="chat-input-area" style="display:none;">
          <textarea id="chat-input" placeholder="Digite sua mensagem…" rows="2" onkeydown="if(event.key==='Enter' && !event.shiftKey){event.preventDefault(); window.__secretarioEnviar()}"></textarea>
          <button class="btn" onclick="window.__secretarioEnviar()" id="btn-enviar">${icone('run')}</button>
        </div>
        <div class="p-3 border-t border-zinc-800 text-center text-zinc-500 text-sm" id="chat-vazio">
          Selecione uma conversa ao lado ou clique em <button class="btn-ghost text-xs" onclick="window.__secretarioNovaConversa()">Nova conversa</button> para começar.
        </div>
      </div>
    </div>
  `;

  renderListaSessoes();
  renderMensagens();

  (window as unknown as Record<string, unknown>).__secretarioNovaConversa = () => {
    sessaoAtivaId = null;
    mensagensCache = [];
    renderListaSessoes();
    renderMensagens();
    const inputArea = document.getElementById('chat-input-area');
    const vazio = document.getElementById('chat-vazio');
    if (inputArea) inputArea.style.display = 'flex';
    if (vazio) vazio.style.display = 'none';
    (document.getElementById('chat-titulo') as HTMLElement).textContent = 'Nova conversa';
    (document.getElementById('chat-input') as HTMLTextAreaElement)?.focus();
  };

  (window as unknown as Record<string, unknown>).__secretarioSetAgente = (v: string) => {
    agenteSelecionado = v as 'secretario' | 'secretario-exec';
  };

  (window as unknown as Record<string, unknown>).__secretarioEnviar = async () => {
    if (carregando) return;

    const input = document.getElementById('chat-input') as HTMLTextAreaElement;
    const btn = document.getElementById('btn-enviar') as HTMLButtonElement;
    const texto = input?.value.trim();
    if (!texto) return;

    carregando = true;
    input.disabled = true;
    btn.disabled = true;
    btn.innerHTML = `${icone('spark')} Pensando…`;

    // Adiciona mensagem do usuário imediatamente
    mensagensCache.push({ role: 'user', content: texto });
    renderMensagens();
    input.value = '';

    try {
      const res = await api<ConversaResponse>('/secretario/conversa', {
        method: 'POST',
        body: JSON.stringify({
          mensagem: texto,
          sessao_id: sessaoAtivaId || undefined,
          agente: agenteSelecionado,
        }),
      });

      mensagensCache.push({ role: 'assistant', content: res.resposta });
      sessaoAtivaId = res.sessao_id;

      // Recarrega lista de sessões para atualizar títulos
      await carregarSessoes();
      renderListaSessoes();
    } catch (e) {
      const err = e as Error;
      let msg = err.message;
      // Tenta extrair mensagem do servidor se for resposta JSON
      try {
        const parsed = JSON.parse(err.message);
        if (parsed.message) msg = parsed.message;
      } catch {
        // ignora
      }
      toast(msg, 'erro');
      // Remove a mensagem do usuário se falhou
      mensagensCache.pop();
    } finally {
      carregando = false;
      input.disabled = false;
      btn.disabled = false;
      btn.innerHTML = icone('run');
      renderMensagens();
    }
  };
}

function renderListaSessoes(): void {
  const el = document.getElementById('lista-sessoes');
  if (!el) return;

  if (!sessoesCache.length) {
    el.innerHTML = `
      <div class="p-4 text-center text-zinc-500 text-sm">
        Nenhuma conversa ainda.
        <br><br>
        <button class="btn-ghost text-xs" onclick="window.__secretarioNovaConversa()">Iniciar primeira conversa</button>
      </div>
    `;
    return;
  }

  el.innerHTML = sessoesCache.map((s) => `
    <button class="w-full text-left p-3 hover:bg-zinc-800 ${s.id === sessaoAtivaId ? 'bg-blue-600/20' : ''} transition-colors" onclick="window.__secretarioSelecionarSessao('${escapeHtml(s.id)}')">
      <div class="font-medium text-sm truncate">${escapeHtml(s.title || 'Sem título')}</div>
      <div class="text-xs text-zinc-500 font-mono mt-1">${s.updated_at ? formatarDataLocal(s.updated_at) : s.created_at ? formatarDataLocal(s.created_at) : ''}</div>
    </button>
  `).join('');

  (window as unknown as Record<string, unknown>).__secretarioSelecionarSessao = async (id: string) => {
    sessaoAtivaId = id;
    await carregarMensagens(id);
    renderListaSessoes();
    renderMensagens();
    const inputArea = document.getElementById('chat-input-area');
    const vazio = document.getElementById('chat-vazio');
    if (inputArea) inputArea.style.display = 'flex';
    if (vazio) vazio.style.display = 'none';
    const sessao = sessoesCache.find(s => s.id === id);
    (document.getElementById('chat-titulo') as HTMLElement).textContent = sessao?.title || 'Conversa';
    (document.getElementById('chat-input') as HTMLTextAreaElement)?.focus();
  };
}

async function carregarMensagens(sessaoId: string): Promise<void> {
  try {
    const msgs = await q<MensagemChat[]>(`/secretario/sessoes/${sessaoId}/mensagens`);
    mensagensCache = msgs || [];
  } catch {
    mensagensCache = [];
  }
}

function renderMensagens(): void {
  const el = document.getElementById('chat-mensagens');
  const vazio = document.getElementById('chat-vazio');
  const inputArea = document.getElementById('chat-input-area');

  if (!el) return;

  if (!sessaoAtivaId || !mensagensCache.length) {
    el.innerHTML = '';
    if (vazio) vazio.style.display = 'block';
    if (inputArea) inputArea.style.display = 'none';
    return;
  }

  if (vazio) vazio.style.display = 'none';
  if (inputArea) inputArea.style.display = 'flex';

  el.innerHTML = mensagensCache.map((m) => `
    <div class="chat-msg ${m.role === 'user' ? 'flex-row-reverse' : ''}">
      <div class="max-w-[80%] ${m.role === 'user' ? 'text-right' : ''}">
        <div class="inline-block px-3 py-2 rounded-2xl ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-100'}">
          ${formatarMensagem(m.content)}
        </div>
      </div>
    </div>
  `).join('');

  // Scroll para baixo
  el.scrollTop = el.scrollHeight;
}

function formatarMensagem(texto: string): string {
  // Escape HTML primeiro
  let r = escapeHtml(texto);
  // Converte `code` para <code>
  r = r.replace(/`([^`\n]+)`/g, '<code class="font-mono bg-zinc-900 px-1 rounded">$1</code>');
  // Preserva quebras de linha
  r = r.replace(/\n/g, '<br>');
  return r;
}

function renderErro(): void {
  const viewEl = document.getElementById('view-secretario');
  if (!viewEl) return;

  viewEl.innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold flex items-center gap-2">${icone('chat')} Secretário</h1>
    </div>
    <div class="card p-8 text-center">
      <div class="empty-icon mb-4">${icone('chat')}</div>
      <h2 class="text-xl font-semibold mb-2">Erro ao carregar</h2>
      <p class="text-zinc-400">Não foi possível conectar ao secretário.</p>
      <button class="btn mt-4" onclick="renderSecretario()">${icone('run')} Tentar novamente</button>
    </div>
  `;
}