/**
 * View Home — HUB da empresa (PLANO-COMPLETO Etapa 9 / P-17, estrutura Preline):
 * page-header → KPIs de infos importantes → barra de comando → Secretário
 * (/ comandos, @ contexto, ! terminal) → sistema/atalhos → aprovações →
 * fluxos → feed ao vivo (SSE incremental).
 */

import { api, toast, icone, escapeHtml } from "../api.js";
import { getWsAtivo, getWorkspaces, getViewAtual } from "../state.js";
import type { TaskInfo, FlowInfo, ApprovalInfo } from "../state.js";
import { formatarDataLocal } from "../format.js";
import { estadoVazio, estadoErro, estadoCarregando } from "../estado.js";
import { ajuda } from "../help.js";
import { parsearComposer, COMANDOS_OPCORP } from "../composer-comandos.js";
import { setRascunho } from "../rascunho.js";
import { gatilhoComposer, paletteTecla, fecharPalette } from "../palette.js";
import { renderMarkdown } from "../md.js";
import { resolverComandoProprio } from "./secretario.js";

interface BudgetStatus {
  estado?: {
    workspace_usd_hoje?: number;
  };
  limites?: {
    daily_usd?: number;
  };
}

interface StatusAgregado {
  scheduler?: boolean;
  secretario?: boolean;
}

interface NotificacoesResposta {
  resumo?: {
    nao_lidas?: number;
    total?: number;
  };
}

/** Data local de hoje como AAAA-MM-DD — compara com o prefixo do campo `due` */
function hojeIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dia}`;
}

/** Dot verde/vermelho/cinza do card de saúde */
function dotSaude(v: boolean | undefined): string {
  const cor = v === undefined ? '#737373' : v ? 'var(--ok)' : 'var(--err)';
  return `<span class="hub-dot" style="background:${cor}"></span>`;
}

/** Renderiza a view Home (hub) */
export async function renderHome(): Promise<void> {
  const viewEl = document.getElementById('view-home');
  if (!viewEl) return;

  // Loading apenas no primeiro render (evita piscar no refresh de 8s)
  if (!viewEl.innerHTML.trim()) viewEl.innerHTML = estadoCarregando('Carregando hub…');

  // Etapa 9: allSettled — API que falha vira card "—" sem derrubar os outros
  const [rStatus, rAprovs, rBudget, rTasks, rFlows, rNotif] = await Promise.allSettled([
    api<StatusAgregado>('/status'),
    api<ApprovalInfo[]>('/approvals'),
    api<BudgetStatus>('/budget/status'),
    api<TaskInfo[]>('/tasks'),
    api<FlowInfo[]>('/flows'),
    api<NotificacoesResposta>('/notifications'),
  ]);
  const ok = <T>(r: PromiseSettledResult<T>): T | null => (r.status === 'fulfilled' ? r.value : null);

  const status = ok(rStatus);
  const aprovs = ok(rAprovs);
  const budget = ok(rBudget);
  const tasks = ok(rTasks);
  const flows = ok(rFlows);
  const notif = ok(rNotif);

  const tudoFalhou = !status && !aprovs && !budget && !tasks && !flows && !notif;
  const wsAtivo = getWsAtivo();

  if (tudoFalhou) {
    viewEl.innerHTML = wsAtivo
      ? estadoErro('Não foi possível carregar os dados da empresa.', () => { void renderHome(); })
      : estadoVazio('home', 'Selecione uma empresa', 'Escolha um workspace na barra lateral para ver os dados dela aqui.');
    return;
  }

  const pendentes = (aprovs || []).filter((a) => a.status === 'pendente');
  const hoje = hojeIso();
  const tasksVencidas = (tasks || []).filter(
    (t) => String(t.coluna) !== 'feito' && typeof t.due === 'string' && t.due.slice(0, 10) < hoje,
  ).length;
  const custoHoje = budget?.estado?.workspace_usd_hoje ?? 0;
  const custoTeto = budget?.limites?.daily_usd ?? 0;
  // O shape do GET /flows ({id, nome, nos, arestas}) não tem status — todo flow
  // listado é executável ("ativo"); se a API falhar, o card mostra "—".
  const fluxosAtivos = flows ? flows.length : null;
  const naoLidas = notif?.resumo?.nao_lidas ?? 0;
  const wss = getWorkspaces();
  const flowsLista = (flows || []).slice(0, 4);

  // ── KPIs (Etapa 9.1) ──
  const kpiCards = `
    <div class="kpi-card" data-kpi="tasks-vencidas" onclick="navegar('tasks')" style="cursor:pointer" title="Tasks com prazo vencido e fora de 'feito'">
      <div class="kpi-value">${tasks ? tasksVencidas : '—'}</div>
      <div class="kpi-label">Tasks vencidas ${ajuda('tasks')}</div>
    </div>
    <div class="kpi-card" data-kpi="custos" onclick="navegar('config')" style="cursor:pointer" title="Consumo do workspace hoje">
      <div class="kpi-value">${budget ? '$' + custoHoje.toFixed(2) : '—'}</div>
      <div class="kpi-label">Custos do dia${budget && custoTeto > 0 ? ' · teto $' + custoTeto.toFixed(2) : ''} ${ajuda('budget')}</div>
    </div>
    <div class="kpi-card" id="kpi-saude" data-kpi="saude" onclick="navegar('agenda')" style="cursor:pointer" title="scheduler: ${status ? (status.scheduler ? 'rodando' : 'parado') : 'desconhecido'} · secretário: ${status ? (status.secretario ? 'rodando' : 'parado') : 'desconhecido'}">
      <div class="kpi-value" style="display:flex;align-items:center;gap:.4rem;min-height:2.4rem">
        ${status ? dotSaude(status.scheduler) + dotSaude(status.secretario) : '<span class="text-zinc-500">—</span>'}
      </div>
      <div class="kpi-label">${
        status && status.scheduler !== undefined && status.secretario !== undefined
          ? `scheduler ${status.scheduler ? 'ok' : 'parado'} / secretário ${status.secretario ? 'ok' : 'parado'}`
          : 'saúde desconhecida'
      } ${ajuda('agenda')}</div>
    </div>
    <div class="kpi-card" data-kpi="fluxos" onclick="navegar('fluxos')" style="cursor:pointer" title="Linhas de pensamento definidas no workspace">
      <div class="kpi-value">${fluxosAtivos === null ? '—' : fluxosAtivos}</div>
      <div class="kpi-label">Fluxos ativos ${ajuda('flows')}</div>
    </div>
    <div class="kpi-card" data-kpi="notificacoes" onclick="navegar('notificacoes')" style="cursor:pointer;${naoLidas > 0 ? 'border-color:rgba(251,191,36,.55);background:rgba(251,191,36,.06)' : ''}" title="Avisos dos agentes não lidos">
      <div class="kpi-value"${naoLidas > 0 ? ' style="color:var(--warn)"' : ''}>${notif ? naoLidas : '—'}</div>
      <div class="kpi-label">Notificações não lidas ${ajuda('notificacoes')}</div>
    </div>
  `;

  viewEl.innerHTML = `
    <div class="page-header">
      <div class="page-header-esq">
        <h1 class="page-header-titulo">${icone('home')} Início</h1>
        <p class="page-header-sub">Visão geral da empresa · ${escapeHtml(wsAtivo || 'selecione uma empresa')}</p>
      </div>
      <div class="page-header-acoes">
        <span class="help-wrap">${ajuda('home')}</span>
        <button class="btn" onclick="navegar('tasks');setTimeout(()=>document.getElementById('task-titulo')?.focus(),100)">${icone('plus')} Nova task</button>
        <button class="btn btn-ghost" onclick="abrirWizard()">${icone('spark')} Criar empresa</button>
      </div>
    </div>
    <div class="hub-header card p-4 mb-5">
      <div class="hub-header-esq">
        <button class="hub-ws" onclick="toggleSidebar(true)" title="Trocar empresa">
          ${icone('home')} <span class="font-mono font-semibold">${escapeHtml(wsAtivo || '— empresa —')}</span> <span class="hub-ws-count">${wss.length ? wss.length + ' empresa(s)' : ''}</span>
        </button>
      </div>
      <div class="hub-acoes">
        <button class="btn" onclick="navegar('tasks');setTimeout(()=>document.getElementById('task-titulo')?.focus(),100)">${icone('plus')} Nova task</button>
        <button class="btn" onclick="promptOrdem()">${icone('run')} Run agente</button>
        <button class="btn btn-ghost" onclick="abrirWizard()">${icone('spark')} Criar empresa</button>
      </div>
    </div>

    <div class="zona-rotulo">Informações importantes ${ajuda('home')}</div>
    <div class="kpi-grid mb-5">${kpiCards}</div>

    <div class="zona-rotulo">Comando ao Secretário ${ajuda('home-comando')}</div>
    <section class="card p-4 mb-5">
      <div class="flex items-stretch gap-2">
        <textarea id="home-comando" rows="1" placeholder="Envie um comando ao Secretário — / comandos, @ contexto, ! terminal…" onkeydown="window.__homeComandoTecla(event)" oninput="window.__homeComandoInput(this.value)"></textarea>
        <button class="btn flex-shrink-0" onclick="window.__homeComandoEnviar()" title="Enviar ao Secretário (ou executar / e !)" aria-label="Enviar comando">${icone('run')}</button>
      </div>
      <div id="home-comando-resultado" class="mt-3" style="display:none"></div>
    </section>

    <div class="zona-rotulo">Sistema e atalhos ${ajuda('config')}</div>
    <section class="card p-4 mb-5">
      <div class="hub-sistema">
        <button class="hub-card" onclick="navegar('config')">
          ${icone('gear')} <span><b>Config</b><small>preferências, orçamento, segurança</small></span>
        </button>
        <button class="hub-card" onclick="navegar('config');setTimeout(()=>window.__cfgAba?.('secrets'),350)">
          ${icone('key')} <span><b>Secrets</b><small>credenciais — valores nunca exibidos</small></span>
        </button>
        <button class="hub-card" onclick="navegar('config');setTimeout(()=>window.__cfgAba?.('ferramentas'),350)">
          ${icone('apps')} <span><b>Ferramentas</b><small>specs em .opencorp/tools</small></span>
        </button>
        <div class="hub-card hub-card-static" title="Rode no terminal">
          ${icone('shield')} <span><b>Doutor</b><small><code>opencorp doctor</code> no CLI</small></span>
        </div>
      </div>
    </section>

    <div class="zona-rotulo">Aprovações ${ajuda('hitl')}</div>
    <section class="card p-4 mb-5" id="aprovs-pendentes"></section>

    <div class="zona-rotulo">Linhas de pensamento ${ajuda('flows')}</div>
    <section class="card p-4 mb-5" id="hub-flows"></section>

    <div class="zona-rotulo">Feed ao vivo <span class="badge badge-neutral">todas as empresas</span> ${ajuda('feed')}</div>
    <section class="card p-4">
      <div id="feed-atividade" class="scrollbar-thin max-h-96 overflow-y-auto"></div>
    </section>
  `;

  exporHandlersHome();
  renderFeedAtividade();
  renderAprovsPendentes(pendentes);
  renderFlowsHub(flowsLista, (flows || []).length);
}

/** Handlers globais da barra de comando da home (palette / @ plugada no input) */
function exporHandlersHome(): void {
  const g = window as unknown as Record<string, unknown>;
  g.__homeComandoTecla = (ev: KeyboardEvent) => {
    if (paletteTecla(ev)) return; // palette aberta consome ↑↓/Enter/Tab/Escape
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      void enviarComandoHome();
    }
  };
  g.__homeComandoInput = (valor: string) => {
    const ta = document.getElementById('home-comando') as HTMLTextAreaElement | null;
    if (ta) gatilhoComposer(valor, ta);
  };
  g.__homeComandoEnviar = () => { void enviarComandoHome(); };
}

/** Enter/botão da barra de comando da home (Etapa 9.2):
 *  ! → terminal inline · /opencorp → resposta inline · texto → Secretário via rascunho. */
async function enviarComandoHome(): Promise<void> {
  const input = document.getElementById('home-comando') as HTMLTextAreaElement | null;
  if (!input) return;
  const texto = input.value.trim();
  if (!texto) return;
  const resultado = document.getElementById('home-comando-resultado');
  const parse = parsearComposer(texto);

  if (parse.terminal) {
    fecharPalette();
    input.value = '';
    await executarTerminalHome(parse.terminal.comando, resultado);
    return;
  }

  if (parse.comando && COMANDOS_OPCORP.some((c) => c.nome === parse.comando!.nome)) {
    fecharPalette();
    input.value = '';
    await executarComandoHome(parse.comando, resultado);
    return;
  }

  // Texto normal (ou /comando passthrough do opencode) → leva ao Secretário:
  // o rascunho é a fonte única (rascunho.ts) — renderChatLayout restaura o texto
  // e foca o input; o usuário aperta Enter lá (sem duplicar streaming na home).
  fecharPalette();
  setRascunho(parse.textoLimpo || texto);
  input.value = '';
  const { navegar } = await import("../router.js");
  navegar('secretario');
  toast('Comando levado ao Secretário — aperte Enter para enviar', 'ok');
}

/** `!comando` → POST /terminal (whitelist validada no server) e saída inline. */
async function executarTerminalHome(comando: string, resultado: HTMLElement | null): Promise<void> {
  if (!resultado) return;
  resultado.style.display = '';
  resultado.innerHTML = `<pre class="terminal-saida">${escapeHtml('$ ' + comando)}\n…executando</pre>`;
  try {
    const r = await api<{ saida: string; codigo: number }>('/terminal', {
      method: 'POST',
      body: JSON.stringify({ comando }),
    });
    const saida = r.saida || '(sem saída)';
    resultado.innerHTML = `<pre class="terminal-saida">${escapeHtml('$ ' + comando + '\n' + saida)}${r.codigo !== 0 ? escapeHtml('\n[código de saída: ' + r.codigo + ']') : ''}</pre>`;
    toast(r.codigo === 0 ? 'Terminal executado' : `Terminal encerrou com código ${r.codigo}`, r.codigo === 0 ? 'ok' : 'aviso');
  } catch (e) {
    resultado.innerHTML = `<pre class="terminal-saida">${escapeHtml('$ ' + comando + '\n⚠ ' + (e as Error).message)}</pre>`;
    toast('Erro: ' + (e as Error).message, 'erro');
  }
}

/** `/comando` próprio do opencorp — resolve localmente (mesma lógica do Secretário) e mostra inline. */
async function executarComandoHome(comando: { nome: string; args: string }, resultado: HTMLElement | null): Promise<void> {
  if (!resultado) return;
  if (comando.nome === 'limpar') {
    // da home não há conversa visível: limpa o rascunho e leva ao Secretário
    setRascunho('');
    const { navegar } = await import("../router.js");
    navegar('secretario');
    toast('Nova conversa pronta no Secretário', 'ok');
    return;
  }
  resultado.style.display = '';
  resultado.innerHTML = `<div class="text-sm text-zinc-400">/${escapeHtml(comando.nome)} — carregando…</div>`;
  try {
    const md = await resolverComandoProprio(comando.nome);
    resultado.innerHTML = `<div class="border border-zinc-800 rounded-lg p-3 text-sm">${renderMarkdown(md)}</div>`;
  } catch (e) {
    resultado.innerHTML = `<div class="text-sm" style="color:var(--err)">⚠ ${escapeHtml((e as Error).message)}</div>`;
  }
}

function renderAprovsPendentes(aprovs: ApprovalInfo[]): void {
  const el = document.getElementById('aprovs-pendentes');
  if (!el) return;

  if (!aprovs.length) {
    el.innerHTML = estadoVazio('chat', 'Nenhuma aprovação pendente', 'Ações sensíveis (git push, npm publish…) pausam aqui esperando você.');
    return;
  }

  el.innerHTML = aprovs.map((a) => `
    <div class="approval-row">
      <div>
        <div class="font-mono text-xs">${String(a.id).slice(-8)}</div>
        <div class="text-xs text-zinc-400">${escapeHtml(String(a.padrao || a.pattern || '—'))}</div>
      </div>
      <div class="approval-actions">
        <button class="btn btn-ghost" onclick="decidirAprovacao('${escapeHtml(String(a.id))}', true)">${icone('check')} Aprovar</button>
        <button class="btn" style="background:var(--err)" onclick="decidirAprovacao('${escapeHtml(String(a.id))}', false)">${icone('close')} Rejeitar</button>
      </div>
    </div>
  `).join('');
}

function renderFlowsHub(flows: FlowInfo[], total: number): void {
  const el = document.getElementById('hub-flows');
  if (!el) return;

  if (!flows.length) {
    el.innerHTML = `
      <div class="flex items-center justify-between gap-2 mb-2">
        <span class="text-sm text-zinc-400">O CEO analisa o board e abre tasks sozinho com elas.</span>
        <a class="btn-ghost text-xs" onclick="navegar('fluxos')" href="#/fluxos">ver fluxos →</a>
      </div>
      ${estadoVazio('fluxos', 'Nenhum fluxo no workspace', 'Crie com <code>opencorp flow create</code> ou instale as linhas de pensamento padrão.')}`;
    return;
  }

  el.innerHTML = `
    <div class="flex items-center justify-between gap-2 mb-2">
      <span class="text-sm text-zinc-400">Executáveis a um clique:</span>
      <a class="btn-ghost text-xs" onclick="navegar('fluxos')" href="#/fluxos">ver todas (${total}) →</a>
    </div>
    <div class="hub-flows-lista">
      ${flows.map((f) => `
        <div class="hub-flow">
          <div class="min-w-0">
            <div class="font-mono text-sm truncate">${escapeHtml(String(f.id))}</div>
            ${f.nome ? `<div class="text-xs text-zinc-500 truncate">${escapeHtml(String(f.nome))}</div>` : ''}
          </div>
          <button class="btn btn-ghost text-xs flex-shrink-0" onclick="rodarFlowHub('${escapeHtml(String(f.id))}')">${icone('run')} Rodar agora</button>
        </div>
      `).join('')}
    </div>
  `;
}

/** Roda um flow da home pedindo entrada via modal (igual #fluxos) */
export async function rodarFlowHub(id: string): Promise<void> {
  const { modalPrompt } = await import("../modal.js");
  const entrada = await modalPrompt({
    titulo: 'Executar flow ' + id,
    label: 'Entrada (texto livre ou vazio):',
    multiline: true,
  });
  if (entrada === null) return;
  try {
    await api('/flows/' + encodeURIComponent(id) + '/run', { method: 'POST', body: JSON.stringify({ entrada }) });
    toast('Flow executando — acompanhe no Feed e no Histórico', 'ok');
  } catch (e) {
    toast('Erro: ' + (e as Error).message, 'erro');
  }
}

/** Placeholder inicial do feed (SSE preenche dinamicamente) */
function renderFeedAtividade(): void {
  const el = document.getElementById('feed-atividade');
  if (el && !el.innerHTML) {
    el.innerHTML = estadoVazio('spark', 'Aguardando eventos…', 'Atividade aparecerá aqui conforme tasks, sessões, hooks e teams gerarem eventos.');
  }
}

/** Adiciona item ao feed de atividade (chamado pelo SSE) */
export function adicionarFeedItem(ev: Record<string, unknown>): void {
  const el = document.getElementById('feed-atividade');
  if (!el) return;

  if (el.querySelector('.empty-state')) el.innerHTML = '';

  const tipo = String(ev.tipo || 'desconhecido');
  let icon = 'tasks', iconClass = 'task';
  if (tipo.startsWith('sessao')) { icon = 'run'; iconClass = 'sessao'; }
  else if (tipo.startsWith('hook')) { icon = 'spark'; iconClass = 'hook'; }
  else if (tipo.startsWith('team')) { icon = 'teams'; iconClass = 'team'; }

  const ts = formatarDataLocal(new Date().toISOString());
  const texto = JSON.stringify(ev).slice(0, 120);

  const div = document.createElement('div');
  div.className = 'feed-item';
  div.innerHTML = '<span class="feed-icon ' + iconClass + '">' + icone(icon) + '</span><div class="feed-text"><div>' + escapeHtml(texto) + '</div><div class="meta">' + ts + '</div></div>';
  el.prepend(div);

  while (el.children.length > 30) el.removeChild(el.lastChild!);
}

export async function decidirAprovacao(id: string, ok: boolean): Promise<void> {
  await api('/approvals/' + id + (ok ? '/approve' : '/reject'), { method: 'POST', body: JSON.stringify({ motivo: 'web' }) });
  toast(ok ? 'Aprovação registrada' : 'Aprovação rejeitada', ok ? 'ok' : 'aviso');
  if (getViewAtual() === 'home') renderHome();
}

export async function promptOrdem(): Promise<void> {
  // PLANO-WEB-CRUD C5/E2: a home não chama mais agente fixo — leva à view Agentes,
  // onde cada card tem "Chamar" (POST /agents/:id/run) e o seletor visual.
  const { navegar } = await import("../router.js");
  navegar('agentes');
  toast('Escolha o agente e clique em Chamar', 'ok');
}
