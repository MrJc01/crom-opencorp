/**
 * Main entry point — Boot da aplicação web.
 * Inicializa login, workspace, SSE, router e renderiza view inicial.
 *
 * Regras de auth (single source of truth):
 *   - Há UM dono do estado de autenticação: state.token (ver state.ts).
 *   - boot() lê o token persistido UMA vez e decide entre mostrarLogin / esconderLogin.
 *   - mostrarLogin / esconderLogin são idempotentes (usam style.display inline
 *     para vencer qualquer cascade de CSS) e não disparam efeitos colaterais.
 *   - Em 401, api() chama sairParaLogin() que limpa token+ws, fecha SSE e mostra
 *     a tela de login de forma consistente. Não faz reload (evita reload loop
 *     quando o token persistido não bate com o do servidor).
 *   - SSE reconecta só com token (conectarSSE() é no-op sem token).
 */

import { icone } from "./icons.js";
import { initRouter, fecharDrawer, abrirDrawer, navegar, parseHash } from "./router.js";
import { exporAjuda } from "./help.js";
import { loadPersistedAuth, setToken, setWsAtivo, getToken, setSseConnected, setEventSource, setRefreshInterval, getRefreshInterval, getViewAtual, getEventSource, clearAuth, getWsAtivo } from "./state.js";
import { carregarWorkspaces } from "./api.js";
import { renderHome, adicionarFeedItem } from "./views/home.js";
import { renderTasks } from "./views/tasks.js";
import { renderAgenda } from "./views/agenda.js";
import { renderTeams } from "./views/teams.js";
import { renderReunioes } from "./views/reunioes.js";
import { renderFluxos } from "./views/fluxos.js";
import { renderApps } from "./views/apps.js";
import { renderAppDetail } from "./views/app-detail.js";
import { renderHistorico } from "./views/historico.js";
import { renderSecretario } from "./views/secretario.js";
import { renderConfig } from "./views/config.js";
import { abrirWizard, exporWizard } from "./views/wizard.js";
import { criarTask, enviarMsgDrawer, moverTaskColuna, atualizarTaskPrioridade, atualizarTaskResponsavel, atualizarTaskDue, atualizarTaskLabels, atualizarTaskDescricao } from "./views/tasks.js";
import { agendaEscopo, atualizarCampoAgenda, criarAgenda, executarAgendaAgora, toggleAgendaAtivo, excluirAgenda } from "./views/agenda.js";
import { executarTeam } from "./views/teams.js";
import { criarReuniao, encerrarReuniao } from "./views/reunioes.js";
import { executarFlow, detalhesFlow } from "./views/fluxos.js";
import { loadAppsList, abrirApp, fecharApp, renderWidget, enviarForm } from "./views/apps.js";
import { decidirAprovacao, promptOrdem } from "./views/home.js";

/** Configura ícones iniciais no DOM estático. Idempotente via flag de módulo. */
let iconesConfigurados = false;

export function configurarIconesIniciais(): void {
  if (iconesConfigurados) return;
  iconesConfigurados = true;
  document.getElementById('login-logo')?.insertAdjacentHTML('beforeend', icone('home', 'text-3xl'));
  document.getElementById('sidebar-logo')?.insertAdjacentHTML('beforeend', icone('home', 'mr-2') + 'opencorp');
  document.getElementById('nav-icon-home')?.insertAdjacentHTML('beforeend', icone('home'));
  document.getElementById('nav-icon-tasks')?.insertAdjacentHTML('beforeend', icone('tasks'));
  document.getElementById('nav-icon-agenda')?.insertAdjacentHTML('beforeend', icone('agenda'));
  document.getElementById('nav-icon-teams')?.insertAdjacentHTML('beforeend', icone('teams'));
  document.getElementById('nav-icon-reunioes')?.insertAdjacentHTML('beforeend', icone('reunioes'));
  document.getElementById('nav-icon-fluxos')?.insertAdjacentHTML('beforeend', icone('fluxos'));
  document.getElementById('nav-icon-apps')?.insertAdjacentHTML('beforeend', icone('apps'));
  document.getElementById('nav-icon-historico')?.insertAdjacentHTML('beforeend', icone('history'));
  document.getElementById('nav-icon-secretario')?.insertAdjacentHTML('beforeend', icone('chat'));
  document.getElementById('nav-icon-config')?.insertAdjacentHTML('beforeend', icone('gear'));
  document.getElementById('drawer-close-icon')?.insertAdjacentHTML('beforeend', icone('close'));
}

/** Marca que boot() já rodou neste módulo — protege contra dupla execução
 *  quando o módulo é carregado duas vezes via URLs diferentes (ex.: ?v=cache). */
let bootRodou = false;

/**
 * Mostra tela de login (idempotente).
 * Usa style.display inline para garantir vitória contra qualquer cascade CSS.
 * @param erro Mensagem opcional de erro para mostrar acima do input.
 */
export function mostrarLogin(erro = ''): void {
  const loginScreen = document.getElementById('login-screen');
  const app = document.getElementById('app');
  if (loginScreen) {
    loginScreen.classList.add('hidden');
    loginScreen.style.display = 'flex';
    loginScreen.classList.remove('hidden');
  }
  if (app) {
    app.classList.add('hidden');
    app.style.display = 'none';
  }
  const erroEl = document.getElementById('login-error');
  if (erroEl) {
    if (erro) {
      erroEl.textContent = erro;
      erroEl.classList.remove('hidden');
    } else {
      erroEl.classList.add('hidden');
      erroEl.textContent = '';
    }
  }
  (document.getElementById('login-token') as HTMLInputElement)?.focus();
}

/**
 * Esconde tela de login e mostra app (idempotente).
 * Usa style.display inline para garantir vitória contra qualquer cascade CSS.
 */
export function esconderLogin(): void {
  const loginScreen = document.getElementById('login-screen');
  const app = document.getElementById('app');
  if (loginScreen) {
    loginScreen.classList.add('hidden');
    loginScreen.style.display = 'none';
  }
  if (app) {
    app.classList.remove('hidden');
    app.style.display = 'block';
  }
}

/**
 * Sai do estado autenticado de forma consistente: limpa credenciais locais,
 * fecha SSE e mostra tela de login. É o ÚNICO caminho para mostrar a tela
 * de login quando havia uma sessão ativa (api() em 401 usa isto).
 */
export function sairParaLogin(mensagemErro = 'Sessão encerrada — faça login novamente'): void {
  // ORDEM IMPORTA: fecha o EventSource ANTES de clearAuth zerar o state
  // (se clearAuth rodar primeiro, a referência do ES vivo é perdida e o
  // socket fica aberto — bug "login visível com SSE conectado")
  fecharSSE();
  const prevInterval = getRefreshInterval();
  if (prevInterval) {
    clearInterval(prevInterval);
    setRefreshInterval(null);
  }
  clearAuth();
  mostrarLogin(mensagemErro);
}

/** Fecha o EventSource atual e zera o dot/texto de conexão. Idempotente. */
function fecharSSE(): void {
  const es = getEventSource();
  if (es) {
    try { es.close(); } catch { /* ignore */ }
    setEventSource(null);
  }
  setSseConnected(false);
  const dot = document.getElementById('conn-dot');
  const text = document.getElementById('conn-text');
  if (dot) dot.className = 'connection-dot disconnected';
  if (text) text.textContent = 'desconectado';
}

/** Handler do botão de login (chamado pelo onclick no HTML) */
export async function fazerLogin(): Promise<void> {
  const input = document.getElementById('login-token') as HTMLInputElement;
  const t = input.value.trim();
  if (!t) return;

  try {
    const res = await fetch('/workspaces', { headers: { 'Authorization': `Bearer ${t}` } });
    if (res.status === 401) throw new Error('401');

    setToken(t);
    // Restaura o workspace persistido se houver (não limpamos no sairParaLogin)
    const wsSalvo = localStorage.getItem('oc-ws');
    if (wsSalvo && !getWsAtivo()) setWsAtivo(wsSalvo);
    esconderLogin();
    configurarIconesIniciais();
    // ressincroniza o router com o hash atual da URL (ex.: #historico) antes do boot
    const { sincronizarComHash } = await import('./router.js');
    sincronizarComHash();
    await iniciarApp();
  } catch {
    mostrarLogin('Token inválido — veja ~/.opencorp/secrets.json');
  }
}

/** Conecta SSE para eventos em tempo real. No-op se não houver token. */
export function conectarSSE(): void {
  const token = getToken();
  if (!token) return;

  const existingEs = getEventSource();
  if (existingEs) existingEs.close();

  const es = new EventSource('/events?token=' + encodeURIComponent(token));
  setEventSource(es);

  es.onopen = () => {
    // Guard: se o token sumiu (logout/401 durante o CONNECTING), este ES é um
    // órfão — fecha e NÃO pinta "conectado" com a tela de login visível.
    if (!getToken()) {
      try { es.close(); } catch { /* ignore */ }
      setSseConnected(false);
      return;
    }
    setSseConnected(true);
    const dot = document.getElementById('conn-dot');
    const text = document.getElementById('conn-text');
    if (dot) dot.className = 'connection-dot connected';
    if (text) text.textContent = 'conectado';
  };

  es.onerror = () => {
    setSseConnected(false);
    const dot = document.getElementById('conn-dot');
    const text = document.getElementById('conn-text');
    if (dot) dot.className = 'connection-dot disconnected';
    if (text) text.textContent = 'desconectado';
  };

  es.onmessage = (e) => {
    try {
      const ev = JSON.parse(e.data);
      processarEventoSSE(ev);
    } catch {
      // ignora mensagens inválidas
    }
  };
}

/** Processa evento SSE e dispara re-render conforme view ativa */
function processarEventoSSE(ev: Record<string, unknown>): void {
  const tipo = String(ev.tipo || '');
  const view = getViewAtual();

  if (view === 'home') {
    // Feed de atividade é incremental — re-render de home apagaria o feed
    adicionarFeedItem(ev);
    return;
  }
  if (view === 'tasks' && tipo.startsWith('task.')) renderTasks();
  if (view === 'teams' && (tipo.startsWith('team.') || tipo.startsWith('task.'))) renderTeams();
  if (view === 'agenda') renderAgenda();
  if (view === 'fluxos') renderFluxos();
  if (view === 'reunioes') renderReunioes();
  if (view === 'apps') renderApps();
}

/** Inicializa a aplicação após login. Idempotente quanto ao setInterval (limpa o anterior). */
export async function iniciarApp(): Promise<void> {
  // Limpa refresh interval anterior se houver (evita acúmulo em relogin)
  const prevInterval = getRefreshInterval();
  if (prevInterval) clearInterval(prevInterval);

  // Versão real vem do server (/health lê package.json) — fonte única
  void fetch('/health')
    .then((r) => r.json())
    .then((h: { versao?: string }) => {
      const el = document.getElementById('version');
      if (el && h.versao) el.textContent = 'v' + h.versao;
    })
    .catch(() => undefined);
  await carregarWorkspaces();
  conectarSSE();
  renderView();

  // Refresh automático a cada 8s — NÃO destrutivo:
  // - pula o Secretário (estado local da conversa não pode ser resetado)
  // - pula se o usuário está digitando em algum campo (inputs recriados perderiam o rascunho)
  // - pula se o drawer está aberto (o conteúdo do drawer não é parte da view)
  const interval = setInterval(() => {
    const view = getViewAtual();
    if (view === 'secretario') return;
    const drawer = document.getElementById('drawer');
    if (drawer?.classList.contains('open')) return;
    const ativo = document.activeElement as HTMLElement | null;
    if (ativo && (ativo.tagName === 'INPUT' || ativo.tagName === 'TEXTAREA' || ativo.tagName === 'SELECT' || ativo.closest('.main, .drawer'))) return;
    void renderView();
  }, 8000);
  setRefreshInterval(interval);
}

/** Renderiza a view atual baseada no hash/estado */
export async function renderView(): Promise<void> {
  const view = getViewAtual();

  // Chip mobile: workspace atual sempre visível (clicável → abre sidebar)
  const chip = document.getElementById('ws-chip');
  if (chip) chip.textContent = getWsAtivo() || '— empresa —';

  // Atualiza classes ativas
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const navItems = document.querySelectorAll('.nav-item') as NodeListOf<HTMLElement>;
  navItems.forEach(n => n.classList.toggle('active', n.dataset.view === view));

  const viewEl = document.getElementById('view-' + view);
  if (viewEl) viewEl.classList.add('active');

  switch (view) {
    case 'home': await renderHome(); break;
    case 'tasks': await renderTasks(); break;
    case 'agenda': await renderAgenda(); break;
    case 'teams': await renderTeams(); break;
    case 'reunioes': await renderReunioes(); break;
    case 'fluxos': await renderFluxos(); break;
    case 'apps': await renderApps(); break;
    case 'app-detail': await renderAppDetail(); break;
    case 'historico': await renderHistorico(); break;
    case 'secretario': await renderSecretario(); break;
    case 'config': await renderConfig(); break;
  }
}

/** Cria novo workspace — abre o wizard com perfil editorial (4 passos) */
export function novoWorkspace(): void {
  abrirWizard();
}

/**
 * Inicialização principal — chamada ao carregar o módulo. Idempotente:
 * se for chamada duas vezes (ex.: módulo carregado por URLs distintas),
 * a segunda chamada é no-op para evitar boot duplo.
 */
export function boot(): void {
  if (bootRodou) return;
  bootRodou = true;

  initRouter();
  exporGlobais();
  exporAjuda();
  exporWizard();

  const { token, ws } = loadPersistedAuth();
  if (token) setToken(token);
  if (ws) setWsAtivo(ws);

  if (!token) {
    mostrarLogin();
    return;
  }

  esconderLogin();
  configurarIconesIniciais();
  iniciarApp();
}

/** Abre/fecha a sidebar em telas pequenas (hamburger). Sem arg = toggle. */
export function toggleSidebar(acao?: boolean): void {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!sidebar) return;
  const abrir = acao ?? !sidebar.classList.contains('open');
  sidebar.classList.toggle('open', abrir);
  backdrop?.classList.toggle('open', abrir);
}

/** Torna funções globais para onclick/HTML inline */
export function exporGlobais(): void {
  const g = window as unknown as Record<string, unknown>;
  g.navegar = navegar;
  g.parseHash = parseHash;
  g.toggleSidebar = toggleSidebar;
  g.abrirDrawer = abrirDrawer;
  g.fecharDrawer = fecharDrawer;
  g.criarTask = criarTask;
  g.enviarMsgDrawer = enviarMsgDrawer;
  g.moverTaskColuna = moverTaskColuna;
  g.atualizarTaskPrioridade = atualizarTaskPrioridade;
  g.atualizarTaskResponsavel = atualizarTaskResponsavel;
  g.atualizarTaskDue = atualizarTaskDue;
  g.atualizarTaskLabels = atualizarTaskLabels;
  g.atualizarTaskDescricao = atualizarTaskDescricao;
  g.agendaEscopo = agendaEscopo;
  g.atualizarCampoAgenda = atualizarCampoAgenda;
  g.criarAgenda = criarAgenda;
  g.executarAgendaAgora = executarAgendaAgora;
  g.toggleAgendaAtivo = toggleAgendaAtivo;
  g.excluirAgenda = excluirAgenda;
  g.executarTeam = executarTeam;
  g.criarReuniao = criarReuniao;
  g.encerrarReuniao = encerrarReuniao;
  g.executarFlow = executarFlow;
  g.detalhesFlow = detalhesFlow;
  g.loadAppsList = loadAppsList;
  g.abrirApp = abrirApp;
  g.fecharApp = fecharApp;
  g.renderWidget = renderWidget;
  g.enviarForm = enviarForm;
  g.decidirAprovacao = decidirAprovacao;
  g.promptOrdem = promptOrdem;
  g.fazerLogin = fazerLogin;
  g.novoWorkspace = novoWorkspace;
  g.abrirWizard = abrirWizard;
  g.mostrarLogin = mostrarLogin;
  g.esconderLogin = esconderLogin;
  g.sairParaLogin = sairParaLogin;
  g.configurarIconesIniciais = configurarIconesIniciais;
  g.conectarSSE = conectarSSE;
  g.iniciarApp = iniciarApp;
  g.renderView = renderView;
}

// Auto-inicialização
boot();