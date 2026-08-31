/**
 * Estado global da aplicação tipado.
 * Centraliza todo o estado mutável para facilitar debugging e testes.
 */

export interface WorkspaceInfo {
  id: string;
  path?: string;
}

export interface AgendaJob {
  id: string;
  nome: string;
  agenda: {
    tipo: string;
    valor: string | number;
  };
  args: string[];
  workspace: string;
  ativo: boolean;
  proxima_exec?: string;
  ultima_exec?: string;
}

export interface SessionInfo {
  id?: string;
  exec_id?: string;
  agente?: string;
  status?: string;
  inicio?: string;
  criado_em?: string;
}

export interface TaskInfo {
  id?: string;
  titulo?: string;
  coluna?: string;
  responsavel?: string;
  criado_em?: string;
}

export interface FlowInfo {
  id: string;
  nome?: string;
}

export interface ApprovalInfo {
  id: string;
  padrao?: string;
  pattern?: string;
  status?: string;
}

export interface AgentInfo {
  id: string;
  category?: string;
  categoria?: string;
  model?: string;
  modelo?: string;
}

export interface TeamInfo {
  id: string;
  titulo?: string;
  padrao?: string;
  passos?: unknown[];
}

export interface AppInfo {
  id: string;
  titulo: string;
  widgets: number;
}

export interface WidgetSpec {
  id: string;
  titulo: string;
  tipo: string;
  fonte?: { rota?: string; rotulo_campo?: string; campo_valor?: string };
  acao?: { tipo?: string; campos?: Array<{ nome: string; rotulo?: string }> };
  texto?: string;
  paginas?: unknown[];
}

export interface AppSpec {
  id: string;
  titulo: string;
  paginas: Array<{
    titulo?: string;
    widgets: WidgetSpec[];
  }>;
}

export interface ChatMessage {
  autor: string;
  corpo: string;
  criado_em?: string;
  menciona?: string[];
  tipo?: string;
  refs?: string[];
}

export interface AgendaEscopo {
  tipo: 'ws' | 'todas';
}

export interface ViewState {
  /** Token de autenticação atual */
  token: string | null;
  /** Workspace ativo (id) */
  wsAtivo: string;
  /** Lista de workspaces disponíveis */
  workspaces: WorkspaceInfo[];
  /** View atual (hash route) */
  viewAtual: string;
  /** Task aberta no drawer (id) */
  taskAberta: string | null;
  /** Escopo da agenda (ws | todas) */
  agendaEscopoAtual: 'ws' | 'todas';
  /** Conexão SSE ativa */
  sseConnected: boolean;
  /** Intervalo de refresh automático */
  refreshInterval: ReturnType<typeof setInterval> | null;
  /** EventSource instance */
  eventSource: EventSource | null;
}

/** Estado inicial */
const initialState: ViewState = {
  token: null,
  wsAtivo: '',
  workspaces: [],
  viewAtual: 'home',
  taskAberta: null,
  agendaEscopoAtual: 'ws',
  sseConnected: false,
  refreshInterval: null,
  eventSource: null,
};

/** Estado mutável (singleton) — token/ws hidratados do localStorage no LOAD do módulo.
 *  Views com IIFE de importação (ex.: cache de agentes em fluxos.ts) disparam fetches
 *  ANTES do boot de main.ts; sem hidratação, esses requests saem sem Authorization →
 *  401 → sairParaLogin() limpava a sessão inteira (race de login do painel/e2e).
 *  try/catch: em Node (testes) não há localStorage — cai no estado inicial. */
let state: ViewState = (() => {
  try {
    const { token, ws } = loadPersistedAuth();
    return { ...initialState, token, wsAtivo: ws };
  } catch {
    return { ...initialState };
  }
})();

/** Listeners de mudança de estado */
const listeners: Set<() => void> = new Set();

/**
 * Notifica listeners de mudança.
 */
function notify(): void {
  for (const fn of listeners) fn();
}

/**
 * Subscreve a mudanças de estado.
 * @returns Função para cancelar a subscrição.
 */
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** === Getters === */

export function getToken(): string | null {
  return state.token;
}

export function getWsAtivo(): string {
  return state.wsAtivo;
}

export function getWorkspaces(): WorkspaceInfo[] {
  return state.workspaces;
}

export function getViewAtual(): string {
  return state.viewAtual;
}

export function getTaskAberta(): string | null {
  return state.taskAberta;
}

export function getAgendaEscopoAtual(): 'ws' | 'todas' {
  return state.agendaEscopoAtual;
}

export function isSseConnected(): boolean {
  return state.sseConnected;
}

export function getRefreshInterval(): ReturnType<typeof setInterval> | null {
  return state.refreshInterval;
}

export function getEventSource(): EventSource | null {
  return state.eventSource;
}

/** === Setters === */

export function setToken(token: string | null): void {
  state.token = token;
  if (token) localStorage.setItem('oc-token', token);
  else localStorage.removeItem('oc-token');
  notify();
}

export function setWsAtivo(ws: string): void {
  state.wsAtivo = ws;
  if (ws) localStorage.setItem('oc-ws', ws);
  else localStorage.removeItem('oc-ws');
  notify();
}

export function setWorkspaces(ws: WorkspaceInfo[]): void {
  state.workspaces = ws;
  notify();
}

export function setViewAtual(view: string): void {
  state.viewAtual = view;
  notify();
}

export function setTaskAberta(id: string | null): void {
  state.taskAberta = id;
  notify();
}

export function setAgendaEscopoAtual(escopo: 'ws' | 'todas'): void {
  state.agendaEscopoAtual = escopo;
  notify();
}

export function setSseConnected(connected: boolean): void {
  state.sseConnected = connected;
  notify();
}

export function setRefreshInterval(interval: ReturnType<typeof setInterval> | null): void {
  state.refreshInterval = interval;
}

export function setEventSource(es: EventSource | null): void {
  state.eventSource = es;
}

/** === Helpers compostos === */

export function loadPersistedAuth(): { token: string | null; ws: string } {
  const token = localStorage.getItem('oc-token');
  const ws = localStorage.getItem('oc-ws') || '';
  return { token, ws };
}

export function clearAuth(): void {
  localStorage.removeItem('oc-token');
  localStorage.removeItem('oc-ws');
  // Fecha o EventSource vivo antes de descartar a referência (evita socket
  // órfão que segue aberto e reconecta com o login na tela)
  if (state.eventSource) {
    try { state.eventSource.close(); } catch { /* ignore */ }
  }
  state = { ...initialState };
  notify();
}

export function resetState(): void {
  state = { ...initialState };
  notify();
}