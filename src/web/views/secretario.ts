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
import { getRascunho, setRascunho, limparRascunho } from "../rascunho.js";
import { parsearComposer, COMANDOS_OPCORP } from "../composer-comandos.js";
import { gatilhoComposer, paletteTecla } from "../palette.js";
import { pararPollingSala } from "./reunioes.js";
import { agruparSessoes, dataSessao, tempoRelativo, tituloSessao, type SessaoChat } from "../sessoes-utils.js";

interface SecretarioStatus {
  rodando: boolean;
  porta?: number;
  agentes?: number;
  configurado?: boolean;
}

interface MensagemChat {
  role: 'user' | 'assistant';
  content: string;
  criado_em?: string;
  /** presente → renderiza como bloco de terminal (.terminal-saida) em vez de markdown */
  terminal?: string;
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
let acoesEmAndamento = 0; // turno com ferramentas: nº de ações executadas pela secretária-exec
interface AnexoImg { nome: string; mime: string; url: string; }
let anexos: AnexoImg[] = []; // imagens anexadas no composer (data URL)

function renderAnexos(): void {
  const wrap = document.getElementById('anexos-chips');
  if (!wrap) return;
  if (!anexos.length) { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
  wrap.style.display = 'flex';
  wrap.innerHTML = anexos.map((a, i) => `
    <span class="anexo-chip">🖼 ${escapeHtml(a.nome)}
      <button onclick="window.__secretarioAnexoRemover(${i})" aria-label="Remover anexo" title="Remover">✕</button>
    </span>`).join('');
}

const SUGESTOES = [
  'O que aconteceu hoje?',
  'Como está o board?',
  'Rodar linha ceo-analise-board',
  'Qual meu custo hoje?',
];

const FOLLOWUPS = ['Detalhe o 1º ponto', 'E o que faço agora?'];

/** Superfície de chat: página do Secretário ou drawer lateral (Etapa 1). */
type Alvo = 'pagina' | 'lateral';
const ALVOS: Alvo[] = ['pagina', 'lateral'];

/** Alvos que DEVEM receber render agora: o lateral só quando o drawer está aberto
 *  (o DOM dele é estático e existe sempre; fechado, re-renderiza no abrir). */
function alvosAtivos(pedido: Alvo | 'ambos'): Alvo[] {
  if (pedido !== 'ambos') return [pedido];
  const aberto = document.getElementById('chat-drawer')?.classList.contains('open');
  return aberto ? ALVOS : ['pagina'];
}

/** Ids de DOM por superfície — ambas compartilham o MESMO estado do módulo. */
function idDe(alvo: Alvo, campo: 'feed' | 'corpo' | 'input' | 'btn' | 'titulo'): string {
  const pagina = alvo === 'pagina';
  switch (campo) {
    case 'feed': return pagina ? 'chat-mensagens' : 'lat-mensagens';
    case 'corpo': return pagina ? 'oc-feed' : 'lat-feed';
    case 'input': return pagina ? 'chat-input' : 'lat-input';
    case 'btn': return pagina ? 'btn-enviar' : 'lat-enviar';
    case 'titulo': return pagina ? 'chat-titulo' : 'lat-titulo';
  }
}

/** Auto-altura do textarea (cap 150px igual ao composer da página). */
function autoAltura(ta: HTMLTextAreaElement): void {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 150) + 'px';
}

/** Atualiza o título da conversa nas duas superfícies (quando existirem). */
function setTitulo(texto: string): void {
  for (const a of ALVOS) {
    const el = document.getElementById(idDe(a, 'titulo'));
    if (el) el.textContent = texto;
  }
}

/** Estado do botão enviar/parar de uma superfície. */
function setBotaoEnviar(alvo: Alvo, parando: boolean): void {
  const btn = document.getElementById(idDe(alvo, 'btn'));
  if (!btn) return;
  btn.innerHTML = parando ? icone('stop') : icone('run');
  btn.classList.toggle('parando', parando);
  btn.setAttribute('aria-label', parando ? 'Parar resposta' : 'Enviar mensagem');
}

/** dataSessao/tituloSessao/tempoRelativo/agruparSessoes vivem em sessoes-utils.ts (Etapa 1b) */

/** Renderiza a view Secretário */
export async function renderSecretario(aba: 'conversa' | 'reunioes' = 'conversa'): Promise<void> {
  const viewEl = document.getElementById('view-secretario');
  if (!viewEl) return;

  if (aba !== 'reunioes') {
    // saiu da aba de reuniões (voltou para a conversa) → polling da sala ao vivo morre
    pararPollingSala();
  }

  if (aba === 'reunioes') {
    // PLANO-WEB-CRUD D: reuniões moram na mesma página do Secretário (aba)
    viewEl.innerHTML = `
      ${abasSecretario('reunioes')}
      <div id="sec-tab-conversa" class="hidden"></div>
      <div id="sec-tab-reunioes"></div>
    `;
    const { renderReunioes } = await import("./reunioes.js");
    await renderReunioes();
    return;
  }

  // Estado (conversas/rascunho) SOBREVIVE à navegação — reset só em __secretarioNovaConversa
  viewEl.innerHTML = `
    ${abasSecretario('conversa')}
    <div id="sec-tab-conversa">${estadoCarregandoCustom()}</div>
    <div id="sec-tab-reunioes" class="hidden"></div>
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

/** Barra de abas Conversa | Reuniões (mesma página, PLANO-WEB-CRUD D) */
function abasSecretario(ativa: 'conversa' | 'reunioes'): string {
  const btn = (id: 'conversa' | 'reunioes', rotulo: string, icon: string): string => `
    <button class="btn ${ativa === id ? '' : 'btn-ghost'} text-sm" onclick="secretarioAba('${id}')" aria-label="Aba ${rotulo}">${icone(icon)} ${rotulo}</button>
  `;
  return `
    <div class="page-header">
      <div class="page-header-esq">
        <h1 class="page-header-titulo">${icone('chat')} Secretário</h1>
        <p class="page-header-sub">Chat da empresa · conversa e reuniões</p>
      </div>
      <div class="page-header-acoes">
        <span class="help-wrap">${ajuda('secretario')}</span>
        <div class="flex items-center gap-1 rounded-lg border border-zinc-700 p-1">
          ${btn('conversa', 'Conversa', 'chat')}
          ${btn('reunioes', 'Reuniões', 'reunioes')}
        </div>
      </div>
    </div>
  `;
}

/** Troca de aba dentro da página do Secretário */
export function secretarioAba(aba: 'conversa' | 'reunioes'): void {
  void renderSecretario(aba);
}

/** Botão de entrada do popup de histórico (Etapa 1b — P-29), reusado nos headers da página */
function btnHistorico(classe = 'btn-ghost text-xs', id = ''): string {
  return `<button class="${classe}"${id ? ` id="${id}"` : ''} onclick="abrirHistoricoPopup()" title="Histórico de conversas" aria-label="Histórico de conversas">${icone('history')}</button>`;
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
  const viewEl = document.getElementById('sec-tab-conversa');
  if (!viewEl) return;

  viewEl.innerHTML = `
    <div class="page-header">
      <div class="page-header-esq">
        <h1 class="page-header-titulo">${icone('chat')} Secretário</h1>
        <p class="page-header-sub">Chat da empresa em standby</p>
      </div>
      <div class="page-header-acoes"><span class="help-wrap">${ajuda('secretario')}</span>${btnHistorico('btn-ghost text-xs', 'btn-hist-header')}</div>
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
  const viewEl = document.getElementById('sec-tab-conversa');
  if (!viewEl) return;

  viewEl.innerHTML = `
    <div class="page-header">
      <div class="page-header-esq">
        <h1 class="page-header-titulo">${icone('chat')} Secretário</h1>
        <p class="page-header-sub">Conversa · / comandos · @ contexto · ! terminal</p>
      </div>
      <div class="page-header-acoes">
        <span class="help-wrap">${ajuda('secretario')}</span>
        ${btnHistorico('btn-ghost text-xs', 'btn-hist-header')}
        <button class="btn-ghost text-xs md:hidden" onclick="window.__secretarioToggleConv()" aria-label="Alternar lista de conversas" title="Conversas">${icone('tasks')}</button>
      </div>
    </div>
    <div class="secretario-grid" id="secretario-grid">
      <!-- Coluna esquerda: lista de conversas -->
      <div class="card flex flex-col" id="secretario-lateral">
        <div class="p-3 border-b border-zinc-800 flex items-center justify-between gap-2">
          <h3 class="font-semibold text-sm">Conversas</h3>
          <div class="flex items-center gap-1">
            ${btnHistorico()}
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
          <div class="flex items-center gap-2 flex-shrink-0">
            <label class="flex items-center gap-1 text-xs text-zinc-400">
              <select id="chat-agente" class="text-xs w-auto" onchange="window.__secretarioSetAgente(this.value)" title="secretário apenas analisa e relata; secretário-exec também executa ações">
                <option value="secretario" ${agenteSelecionado === 'secretario' ? 'selected' : ''}>secretário</option>
                <option value="secretario-exec" ${agenteSelecionado === 'secretario-exec' ? 'selected' : ''}>secretário-exec</option>
              </select>
              ${ajuda('secretario')}
            </label>
            <button class="btn-ghost text-xs" id="btn-chat-lateral" onclick="abrirChatLateral()" title="Abrir chat lateral (acompanha em qualquer página)" aria-label="Abrir chat lateral">${icone('chat')}</button>
          </div>
        </div>
        <div class="flex-1 overflow-y-auto scrollbar-thin" id="chat-mensagens">
          <div class="oc-feed" id="oc-feed"></div>
        </div>
        <button id="btn-ir-fim" class="oc-ir-fim hidden" onclick="window.__secretarioIrFim()" aria-label="Ir para o fim">↓</button>
        <div class="p-3 border-t border-zinc-800">
        <div class="composer">
          <div id="anexos-chips" class="anexos-chips" style="display:none"></div>
          <div class="composer-row2">
            <button class="btn-ghost composer-anexo" onclick="window.__secretarioAnexar()" title="Anexar imagem ou arquivo" aria-label="Anexar">📎</button>
            <input id="anexo-input" type="file" multiple accept="image/*,.txt,.md,.json,.csv,.log,.py,.js,.ts,.sh,.yaml,.yml,.html,.css" style="display:none" onchange="window.__secretarioAnexos(this.files)" />
            <textarea id="chat-input" placeholder="Pergunte qualquer coisa… (/ comandos · @ contexto · ! terminal)" rows="1" onkeydown="window.__composerTecla(event,'pagina')" oninput="window.__composerInput(this.value,'pagina')"></textarea>
            <button class="btn composer-enviar" id="btn-enviar" onclick="window.__secretarioEnviar()" aria-label="Enviar mensagem">${icone('run')}</button>
          </div>
          <div class="composer-row">
            <span class="text-xs text-zinc-500 composer-dica">secretário analisa · secretário-exec executa · / comandos · @ contexto · ! terminal · 📎 anexa</span>
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

  // Ctrl+V de imagem: itens de imagem da área de transferência viram anexos
  const chatInput = document.getElementById('chat-input');
  chatInput?.addEventListener('paste', (ev: Event) => {
    const clipboard = (ev as ClipboardEvent).clipboardData;
    if (!clipboard) return;
    const imagens = Array.from(clipboard.items).filter((i) => i.type.startsWith('image/'));
    if (!imagens.length) return; // colagem de texto segue normal
    ev.preventDefault();
    const g2 = window as unknown as Record<string, unknown>;
    imagens.forEach((item, idx) => {
      const file = item.getAsFile();
      if (!file) return;
      const nome = file.name && file.name !== 'image.png' ? file.name : `colado-${Date.now()}${idx ? '-' + idx : ''}.png`;
      const comNome = new File([file], nome, { type: item.type });
      const dt = new DataTransfer();
      dt.items.add(comNome);
      (g2.__secretarioAnexos as ((f: FileList) => void) | undefined)?.(dt.files);
    });
    toast('Imagem colada — pronta para enviar 📎', 'ok');
  });

  renderListaSessoes();
  exporHandlersChat();
  renderMensagens();
  const ta = document.getElementById('chat-input') as HTMLTextAreaElement | null;
  if (ta) {
    // restaura rascunho (fonte única compartilhada com o chat lateral)
    const rascunho = getRascunho();
    if (rascunho) {
      ta.value = rascunho;
      autoAltura(ta);
    }
    ta.focus();
  }
}

/**
 * Handlers globais do chat — registrados a partir da página OU do drawer
 * lateral (quem renderizar primeiro expõe; ambas as superfícies usam os mesmos).
 */
function exporHandlersChat(): void {
  const g = window as unknown as Record<string, unknown>;

  g.__chatRascunhoInput = (valor: string, origem: Alvo) => {
    setRascunho(valor);
    const el = document.getElementById(idDe(origem, 'input')) as HTMLTextAreaElement | null;
    if (el) autoAltura(el);
    // sincroniza a outra superfície sem disparar loop (value ≠ evento)
    const outro = document.getElementById(idDe(origem === 'pagina' ? 'lateral' : 'pagina', 'input')) as HTMLTextAreaElement | null;
    if (outro && outro.value !== valor) {
      outro.value = valor;
      autoAltura(outro);
    }
  };

  g.__chatAutoAltura = (el: HTMLTextAreaElement) => autoAltura(el);

  /** keydown do composer (ambas as superfícies): palette consome teclas; senão Enter envia */
  g.__composerTecla = (ev: KeyboardEvent, origem: Alvo) => {
    if (paletteTecla(ev)) return;
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      void enviar(origem);
    }
  };

  /** input do composer (ambas as superfícies): rascunho/sync + gatilhos / e @ da palette */
  g.__composerInput = (valor: string, origem: Alvo) => {
    (g.__chatRascunhoInput as (v: string, o: Alvo) => void)(valor, origem);
    const ta = document.getElementById(idDe(origem, 'input')) as HTMLTextAreaElement | null;
    if (ta) gatilhoComposer(valor, ta);
  };

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
    limparRascunho();
    for (const a of ALVOS) {
      const inp = document.getElementById(idDe(a, 'input')) as HTMLTextAreaElement | null;
      if (inp) { inp.value = ''; autoAltura(inp); }
    }
    document.getElementById('secretario-grid')?.classList.remove('conv-aberta');
    renderListaSessoes();
    renderMensagens();
    setTitulo('Nova conversa');
    (document.getElementById('chat-input') as HTMLTextAreaElement | null
      ?? document.getElementById('lat-input') as HTMLTextAreaElement | null)?.focus();
  };

  g.__secretarioSetAgente = (v: string) => {
    agenteSelecionado = v as 'secretario' | 'secretario-exec';
    toast(agenteSelecionado === 'secretario' ? 'secretário: analisa e relata' : 'secretário-exec: também executa ações', 'ok');
  };

  g.__secretarioAutoAltura = () => {
    const ta = document.getElementById('chat-input') as HTMLTextAreaElement | null;
    if (!ta) return;
    autoAltura(ta);
    setRascunho(ta.value);
  };

  g.__secretarioIrFim = () => {
    const el = document.getElementById('chat-mensagens');
    if (el) el.scrollTop = el.scrollHeight;
  };

  g.__secretarioEnviar = async (alvo?: Alvo) => { await enviar(alvo ?? 'pagina'); };

  g.__secretarioAnexar = () => {
    (document.getElementById('anexo-input') as HTMLInputElement)?.click();
  };

  g.__secretarioAnexos = (arquivos: FileList | null) => {
    if (!arquivos) return;
    for (const f of Array.from(arquivos)) {
      const reader = new FileReader();
      if (f.type.startsWith('image/')) {
        reader.onload = () => {
          anexos.push({ nome: f.name, mime: f.type, url: String(reader.result) });
          renderAnexos();
        };
        reader.readAsDataURL(f);
      } else {
        // arquivos de texto entram no corpo da mensagem (contexto direto para o modelo)
        reader.onload = () => {
          const conteudo = String(reader.result ?? '');
          const texto = conteudo.length > 120_000 ? conteudo.slice(0, 120_000) + '\n…(truncado)' : conteudo;
          const input = document.getElementById('chat-input') as HTMLTextAreaElement | null;
          if (input) {
            input.value = (input.value ? input.value + '\n\n' : '') + `--- arquivo: ${f.name} ---\n${texto}\n--- fim: ${f.name} ---`;
            (window as unknown as { __secretarioAutoAltura?: () => void }).__secretarioAutoAltura?.();
          }
        };
        reader.readAsText(f);
      }
    }
    (document.getElementById('anexo-input') as HTMLInputElement).value = '';
  };

  g.__secretarioAnexoRemover = (i: number) => {
    anexos.splice(i, 1);
    renderAnexos();
  };

  g.__secretarioSelecionarSessao = async (id: string) => {
    if (carregando) return;
    sessaoAtivaId = id;
    document.getElementById('secretario-grid')?.classList.remove('conv-aberta');
    await carregarMensagens(id);
    renderListaSessoes();
    renderMensagens();
    const sessao = sessoesCache.find((s) => s.id === id);
    setTitulo(tituloSessao(sessao ?? { id }));
    (document.getElementById('chat-input') as HTMLTextAreaElement | null
      ?? document.getElementById('lat-input') as HTMLTextAreaElement | null)?.focus();
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

  g.__secretarioSugestao = (texto: string, alvo: Alvo = 'pagina') => {
    const input = document.getElementById(idDe(alvo, 'input')) as HTMLTextAreaElement | null;
    if (input) input.value = texto;
    void enviar(alvo);
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
    // sessões sem nenhuma mensagem do usuário são ruído de execuções/testes — some, salvo a ativa
    (s.id === sessaoAtivaId || !s.sem_conteudo) &&
    (!busca || tituloSessao(s).toLowerCase().includes(busca)));

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

  const item = (s: SessaoChat) => `
    <button class="sessao-item ${s.id === sessaoAtivaId ? 'ativa' : ''}" onclick="window.__secretarioSelecionarSessao('${escapeHtml(s.id)}')">
      <div class="sessao-titulo">${escapeHtml(tituloSessao(s))}</div>
      <div class="sessao-data">${(() => { const d = dataSessao(s); return d ? tempoRelativo(d) : ''; })()}</div>
    </button>
  `;

  el.innerHTML = agruparSessoes(filtradas).map(({ grupo, itens }) => `
      <div class="sessao-grupo">${grupo}</div>
      ${itens.map(item).join('')}
    `).join('');
}

/** Feed de mensagens (estilo opencode: user = bloco sutil, assistant = md plano). */
function renderMensagens(alvo: Alvo | 'ambos' = 'ambos'): void {
  const alvos = alvosAtivos(alvo);
  for (const a of alvos) {
    const el = document.getElementById(idDe(a, 'corpo'));
    if (!el) continue;

    if (!mensagensCache.length) {
      el.innerHTML = `
        <div class="oc-vazio">
          <div class="oc-vazio-titulo">Pergunte qualquer coisa sobre a empresa</div>
          <div class="oc-chips">
            ${SUGESTOES.map((s) => `<button class="chip" onclick="window.__secretarioSugestao('${escapeHtml(s).replace(/'/g, '&#39;')}', '${a}')">${escapeHtml(s)}</button>`).join('')}
          </div>
        </div>
      `;
    } else {
      el.innerHTML = mensagensCache.map((m, i) => `
        <div class="oc-msg ${m.role === 'user' ? 'oc-user' : 'oc-assistant'}">
          <div class="oc-msg-corpo">${m.role === 'user'
            ? `<p class="md-p">${escapeHtml(m.content).replace(/\n/g, '<br>')}</p>`
            : m.terminal !== undefined
              ? `<pre class="terminal-saida"><code>${escapeHtml(m.terminal)}</code></pre>`
              : renderMarkdown(m.content)}</div>
          <button class="oc-copy" title="Copiar mensagem" aria-label="Copiar mensagem" onclick="window.__secretarioCopyMsg(${i}, this)">copy</button>
        </div>
      `).join('');

      // follow-ups após a última resposta do assistant
      const ultima = mensagensCache[mensagensCache.length - 1];
      if (ultima?.role === 'assistant' && !carregando) {
        el.innerHTML += `
          <div class="oc-chips oc-followups">
            ${FOLLOWUPS.map((s) => `<button class="chip" onclick="window.__secretarioSugestao('${escapeHtml(s).replace(/'/g, '&#39;')}', '${a}')">${escapeHtml(s)}</button>`).join('')}
          </div>
        `;
      }
    }
  }

  // indicador "Pensando..." só enquanto não há conteúdo parcial do assistant
  if (carregando && mensagensCache[mensagensCache.length - 1]?.role === 'user') {
    for (const a of alvos) {
      const el = document.getElementById(idDe(a, 'corpo'));
      if (!el) continue;
      el.innerHTML += `
        <div class="oc-msg oc-assistant oc-pensando">
          <div class="oc-msg-corpo">${statusPensando()}</div>
        </div>
      `;
    }
  }

  if (pertoDoFundo) {
    for (const a of alvos) {
      const container = document.getElementById(idDe(a, 'feed'));
      if (container) container.scrollTop = container.scrollHeight;
    }
  }
}

/** Texto de status quando não há conteúdo ainda (pensando / executando ações) */
function statusPensando(): string {
  return acoesEmAndamento > 0
    ? `<span class="oc-pensando-texto">⚙ Executando ações (${acoesEmAndamento})<span class="oc-dots"><i>.</i><i>.</i><i>.</i></span></span>`
    : `<span class="oc-pensando-texto">Pensando<span class="oc-dots"><i>.</i><i>.</i><i>.</i></span></span>`;
}

/** Atualiza só a última bolha assistant (streaming — sem re-render do feed inteiro), nas duas superfícies */
function atualizarUltimaBolha(): void {
  const ultima = mensagensCache[mensagensCache.length - 1];
  if (!ultima || ultima.role !== 'assistant') return;
  for (const a of alvosAtivos('ambos')) {
    const el = document.getElementById(idDe(a, 'corpo'));
    if (!el) continue;
    const bolhas = el.querySelectorAll('.oc-msg.oc-assistant .oc-msg-corpo');
    const alvo = bolhas[bolhas.length - 1] as HTMLElement | undefined;
    if (!alvo) continue;
    alvo.innerHTML = ultima.content ? renderMarkdown(ultima.content) : statusPensando();
    const container = document.getElementById(idDe(a, 'feed'));
    if (container && pertoDoFundo) container.scrollTop = container.scrollHeight;
  }
}

/** Envia mensagem — streaming SSE (delta a delta) com fallback síncrono; botão vira STOP.
 *  Pode disparar da página OU do chat lateral (mesma conversa, mesmo estado). */
async function enviar(alvo: Alvo = 'pagina'): Promise<void> {
  if (carregando) {
    // segundo clique = parar
    controller?.abort();
    return;
  }

  const input = document.getElementById(idDe(alvo, 'input')) as HTMLTextAreaElement | null;
  const btn = document.getElementById(idDe(alvo, 'btn')) as HTMLButtonElement | null;
  const texto = input?.value.trim();
  if (!texto || !input || !btn) return;

  // Composer inteligente (Etapa 2): / comando próprio resolve no front, ! vai ao
  // terminal (whitelist no server), @ vira contexto anexado ao body — sem destaque
  // visual no input nesta etapa.
  const parse = parsearComposer(texto);
  if (parse.terminal) {
    await enviarTerminalLocal(parse.terminal.comando, texto);
    return;
  }
  if (parse.comando && COMANDOS_OPCORP.some((c) => c.nome === parse.comando!.nome)) {
    await enviarComandoLocal(parse.comando);
    return;
  }

  carregando = true;
  controller = new AbortController();
  acoesEmAndamento = 0;
  setBotaoEnviar(alvo, true);

  mensagensCache.push({ role: 'user', content: texto });
  const idxAssistant = mensagensCache.push({ role: 'assistant', content: '' }) - 1;
  // limpa AMBAS as superfícies + rascunho (fonte única)
  for (const a of ALVOS) {
    const inp = document.getElementById(idDe(a, 'input')) as HTMLTextAreaElement | null;
    if (inp) { inp.value = ''; autoAltura(inp); }
  }
  limparRascunho();
  renderMensagens();
  if (!sessaoAtivaId) {
    setTitulo(texto.length > 50 ? texto.slice(0, 49) + '…' : texto);
  }

  try {
    const { headers } = await import("../api.js");
    const ws = getWsAtivo();
    const qs = ws ? '?workspace=' + encodeURIComponent(ws) : '';
    const res = await fetch('/secretario/conversa/stream' + qs, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        mensagem: parse.textoLimpo || texto,
        sessao_id: sessaoAtivaId || undefined,
        agente: agenteSelecionado,
        imagens: anexos.length ? anexos : undefined,
        contexto: parse.contexto.length ? parse.contexto : undefined,
      }),
      signal: controller.signal,
    });
    anexos = [];
    renderAnexos();
    const tipo = res.headers.get('content-type') ?? '';
    if (!res.ok || !tipo.includes('text/event-stream')) {
      // servidor antigo/erro → fallback síncrono
      if (res.ok) {
        const data = (await res.json()) as ConversaResponse;
        mensagensCache[idxAssistant].content = data.resposta;
        sessaoAtivaId = data.sessao_id;
      } else {
        const corpo = (await res.json().catch(() => ({}))) as { erro?: string };
        throw new Error(corpo.erro ?? `HTTP ${res.status}`);
      }
    } else {
      // ── parse do stream SSE ──
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fim = false;
      while (!fim) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const partes = buffer.split('\n\n');
        buffer = partes.pop() ?? '';
        for (const parte of partes) {
          let evento = 'message';
          let dados = '';
          for (const linha of parte.split('\n')) {
            if (linha.startsWith('event:')) evento = linha.slice(6).trim();
            else if (linha.startsWith('data:')) dados += linha.slice(5).trim();
          }
          if (!dados) continue;
          const payload = JSON.parse(dados) as { sessao_id?: string; delta?: string; resposta?: string; erro?: string; acoes?: number };
          if (evento === 'inicio') {
            if (payload.sessao_id) sessaoAtivaId = payload.sessao_id;
          } else if (evento === 'acao') {
            acoesEmAndamento = payload.acoes ?? acoesEmAndamento;
            atualizarUltimaBolha();
          } else if (evento === 'delta') {
            mensagensCache[idxAssistant].content += payload.delta ?? '';
            atualizarUltimaBolha();
          } else if (evento === 'fim') {
            if (payload.resposta) mensagensCache[idxAssistant].content = payload.resposta;
            if (payload.sessao_id) sessaoAtivaId = payload.sessao_id;
            fim = true;
          } else if (evento === 'erro') {
            throw new Error(payload.erro ?? 'erro no stream');
          }
        }
      }
      if (!mensagensCache[idxAssistant].content) throw new Error('resposta vazia do servidor');
    }

    const eraNova = !sessoesCache.some((s) => s.id === sessaoAtivaId);
    await carregarSessoes();
    renderListaSessoes();
    if (eraNova) {
      const sel = sessoesCache.find((s) => s.id === sessaoAtivaId);
      if (sel) setTitulo(tituloSessao(sel));
    }
  } catch (e) {
    const err = e as Error;
    if (err.name === 'AbortError') {
      toast('Interrompido — o processamento continua no servidor; reabra a conversa para ver a resposta completa', 'aviso');
      // mantém o texto parcial recebido até aqui
    } else {
      toast(err.message, 'erro');
      if (!sessaoAtivaId) mensagensCache.splice(idxAssistant - 1, 2); // remove user + assistant vazia
      else mensagensCache.splice(idxAssistant, 1); // remove assistant vazia
    }
  } finally {
    carregando = false;
    controller = null;
    setBotaoEnviar(alvo, false);
    renderMensagens();
  }
}

/** Limpa inputs + rascunho das duas superfícies (usado pelos envios locais). */
function limparComposers(): void {
  for (const a of ALVOS) {
    const inp = document.getElementById(idDe(a, 'input')) as HTMLTextAreaElement | null;
    if (inp) { inp.value = ''; autoAltura(inp); }
  }
  limparRascunho();
}

/** Resolução LOCAL de comando próprio (/status, /tasks…) — fetch na API e resposta
 *  como mensagem assistant no feed; nunca chama o servidor de conversa/LLM. */
async function enviarComandoLocal(comando: { nome: string; args: string }): Promise<void> {
  if (comando.nome === 'limpar') {
    (window as unknown as { __secretarioNovaConversa?: () => void }).__secretarioNovaConversa?.();
    return;
  }
  mensagensCache.push({ role: 'user', content: '/' + comando.nome + (comando.args ? ' ' + comando.args : '') });
  const idx = mensagensCache.push({ role: 'assistant', content: '' }) - 1;
  limparComposers();
  renderMensagens();
  try {
    mensagensCache[idx].content = await resolverComandoProprio(comando.nome);
  } catch (e) {
    mensagensCache[idx].content = '⚠ ' + (e as Error).message;
  }
  renderMensagens();
}

async function resolverComandoProprio(nome: string): Promise<string> {
  switch (nome) {
    case 'status': {
      const [st, ts] = await Promise.all([
        q<{ scheduler?: boolean; secretario?: boolean }>('/status').catch(() => null),
        q<Array<{ coluna: string }>>('/tasks').catch(() => null),
      ]);
      const porColuna = (ts ?? []).reduce<Record<string, number>>((acc, t) => {
        acc[t.coluna] = (acc[t.coluna] ?? 0) + 1;
        return acc;
      }, {});
      const total = Object.values(porColuna).reduce((a, b) => a + b, 0);
      return [
        '**Estado da empresa**',
        `- Scheduler: ${st?.scheduler ? '🟢 rodando' : '🔴 parado'}`,
        `- Secretário: ${st?.secretario ? '🟢 rodando' : '🔴 parado'}`,
        `- Tasks: ${total}` + (total ? ` — ${Object.entries(porColuna).map(([c, n]) => `${c} ${n}`).join(' · ')}` : ''),
      ].join('\n');
    }
    case 'tasks': {
      const ts = await q<Array<{ coluna: string; titulo: string }>>('/tasks');
      if (!ts.length) return 'Board vazio — nenhuma task.';
      const resto = ts.length > 8 ? `\n… +${ts.length - 8} tasks` : '';
      return '**Board de tasks**\n' + ts.slice(0, 8).map((t) => `- [${t.coluna}] ${t.titulo}`).join('\n') + resto;
    }
    case 'custos': {
      const b = await q<{
        estado?: { dia?: string; workspace_usd_hoje?: number };
        limites?: { daily_usd?: number };
      }>('/budget/status');
      const dia = b.estado?.dia ?? new Date().toISOString().slice(0, 10);
      return `**Custos de hoje** (${dia})`
        + `\n- Workspace: $${(b.estado?.workspace_usd_hoje ?? 0).toFixed(4)}`
        + (b.limites?.daily_usd ? `\n- Limite diário: $${b.limites.daily_usd}` : '');
    }
    case 'fluxos': {
      const fs = await q<Array<{ id: string; nome?: string }>>('/flows');
      if (!fs.length) return 'Nenhum flow disponível.';
      return '**Flows**\n' + fs.map((f) => `- ${f.id}${f.nome && f.nome !== f.id ? ' — ' + f.nome : ''}`).join('\n');
    }
    case 'agenda': {
      const jobs = await q<Array<{ nome: string; ativo: boolean; agenda: { tipo: string; valor: string | number } }>>('/schedules');
      if (!jobs.length) return 'Nenhuma rotina agendada.';
      return '**Rotinas agendadas**\n' + jobs
        .map((j) => `- ${j.nome} — ${j.agenda.tipo} ${j.agenda.valor} ${j.ativo ? '· ativa' : '· pausada'}`)
        .join('\n');
    }
    case 'agentes': {
      const as = await q<Array<{ id: string; role?: string }>>('/agents');
      if (!as.length) return 'Nenhum agente configurado.';
      return '**Equipe**\n' + as.map((a) => `- **${a.id}**${a.role ? ' — ' + a.role : ''}`).join('\n');
    }
    default:
      throw new Error(`comando /${nome} não suportado`);
  }
}

/** `!comando` → POST /terminal (whitelist validada no server) e saída como bloco .terminal-saida. */
async function enviarTerminalLocal(comando: string, textoBruto: string): Promise<void> {
  mensagensCache.push({ role: 'user', content: textoBruto });
  const idx = mensagensCache.push({ role: 'assistant', content: '' }) - 1;
  limparComposers();
  renderMensagens();
  try {
    const r = await api<{ saida: string; codigo: number }>('/terminal', {
      method: 'POST',
      body: JSON.stringify({ comando }),
    });
    const saida = r.saida || '(sem saída)';
    mensagensCache[idx].content = saida;
    mensagensCache[idx].terminal = `$ ${comando}\n${saida}` + (r.codigo !== 0 ? `\n[código de saída: ${r.codigo}]` : '');
  } catch (e) {
    mensagensCache[idx].content = '⚠ ' + (e as Error).message;
  }
  renderMensagens();
}

function renderErro(): void {
  const viewEl = document.getElementById('sec-tab-conversa');
  if (!viewEl) return;

  viewEl.innerHTML = `
    <div class="page-header">
      <div class="page-header-esq">
        <h1 class="page-header-titulo">${icone('chat')} Secretário</h1>
        <p class="page-header-sub">Erro ao conectar</p>
      </div>
      <div class="page-header-acoes"><span class="help-wrap">${ajuda('secretario')}</span>${btnHistorico('btn-ghost text-xs', 'btn-hist-header')}</div>
    </div>
    ${estadoErro('Não foi possível conectar ao secretário.', () => { void renderSecretario(); })}
  `;
}

/**
 * Renderiza o chat DENTRO do drawer lateral (Etapa 1.2) — mesma conversa,
 * mesmo estado, mesmo rascunho da página. Chamado a cada abrirChatLateral();
 * o DOM do drawer é estático no index.html (sobrevive à navegação).
 */
export async function renderChatLateral(): Promise<void> {
  const mensagens = document.getElementById('lat-mensagens');
  if (!mensagens) return;

  // handlers globais precisam existir mesmo sem a página ter sido aberta
  exporHandlersChat();

  try {
    const status = await q<SecretarioStatus>('/secretario/status');
    if (!status.rodando) {
      renderStandbyLateral();
      return;
    }

    // sessões: garante cache (a página pode nunca ter sido aberta)
    if (!sessoesCache.length) await carregarSessoes();
    setTitulo(sessaoAtivaId ? tituloSessao(sessoesCache.find((s) => s.id === sessaoAtivaId) ?? { id: sessaoAtivaId }) : 'Nova conversa');

    renderMensagens('lateral');

    const ta = document.getElementById('lat-input') as HTMLTextAreaElement | null;
    if (ta) {
      ta.value = getRascunho();
      autoAltura(ta);
      ta.focus();
    }
    const btn = document.getElementById('lat-enviar');
    if (btn) btn.innerHTML = carregando ? icone('stop') : icone('run');

    // listener de scroll compartilhado (uma vez por elemento)
    if (!mensagens.dataset.scrollOk) {
      mensagens.dataset.scrollOk = '1';
      mensagens.addEventListener('scroll', () => {
        pertoDoFundo = mensagens.scrollHeight - mensagens.scrollTop - mensagens.clientHeight < 80;
      });
    }
  } catch (e) {
    mensagens.innerHTML = `
      <div class="oc-feed"><div class="oc-vazio">
        <div class="oc-vazio-titulo">Erro ao conectar</div>
        <p class="text-zinc-500 text-sm">${escapeHtml((e as Error).message)}</p>
      </div></div>
    `;
  }
}

/** Standby dentro do drawer: botão Iniciar sem sair da página atual. */
function renderStandbyLateral(): void {
  const mensagens = document.getElementById('lat-mensagens');
  if (!mensagens) return;
  mensagens.innerHTML = `
    <div class="oc-feed"><div class="oc-vazio">
      <div class="oc-vazio-titulo">Secretário em standby</div>
      <button class="btn" id="lat-iniciar">${icone('run')} Iniciar secretário</button>
      <p class="text-zinc-500 text-sm mt-3">Pode demorar ~10s para subir o servidor.</p>
    </div></div>
  `;
  document.getElementById('lat-iniciar')?.addEventListener('click', async () => {
    const btn = document.getElementById('lat-iniciar') as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.innerHTML = `${icone('spark')} Iniciando…`; }
    try {
      await api('/secretario/start', { method: 'POST' });
      toast('Secretário iniciado', 'ok');
      await renderChatLateral();
      if (document.body.classList.contains('view-secretario')) void renderSecretario();
    } catch (e) {
      toast('Erro ao iniciar: ' + (e as Error).message, 'erro');
      if (btn) { btn.disabled = false; btn.innerHTML = `${icone('run')} Iniciar secretário`; }
    }
  });
}
