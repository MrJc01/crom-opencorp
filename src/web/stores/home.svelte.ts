/**
 * Store Home — HUB da empresa (migração Svelte 5 de src/web/views/home.ts)
 * Centraliza KPIs, aprovações, fluxos, feed e helpers puros.
 * Mantém a mesma lógica de allSettled e cálculos de KPIs do legado.
 */
import { writable, derived } from 'svelte/store';

// ── Tipos ────────────────────────────────────────────────────────────────
export interface BudgetStatus {
  estado?: { workspace_usd_hoje?: number; dia?: string };
  limites?: { daily_usd?: number };
}
export interface StatusAgregado {
  scheduler?: boolean;
  secretario?: boolean;
}
export interface NotificacoesResposta {
  resumo?: { nao_lidas?: number; total?: number };
}
export interface TaskInfo {
  id?: string;
  titulo?: string;
  coluna?: string;
  due?: string | null;
  [k: string]: unknown;
}
export interface FlowInfo {
  id: string;
  nome?: string;
  [k: string]: unknown;
}
export interface ApprovalInfo {
  id: string;
  padrao?: string;
  pattern?: string;
  status?: string;
  [k: string]: unknown;
}

export interface HomeDados {
  status: StatusAgregado | null;
  aprovs: ApprovalInfo[] | null;
  budget: BudgetStatus | null;
  tasks: TaskInfo[] | null;
  flows: FlowInfo[] | null;
  notif: NotificacoesResposta | null;
}

// ── Helpers puros (testáveis) ───────────────────────────────────────────
/** Data local de hoje como AAAA-MM-DD — compara com o prefixo do campo `due` */
export function hojeIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dia}`;
}

/** Quantas tasks estão vencidas (coluna != feito e due < hoje) */
export function contarTasksVencidas(tasks: TaskInfo[] | null, hoje?: string): number {
  if (!tasks) return 0;
  const h = hoje ?? hojeIso();
  return tasks.filter(
    (t) => String(t.coluna) !== 'feito' && typeof t.due === 'string' && (t.due as string).slice(0, 10) < h,
  ).length;
}

/** Filtra aprovações pendentes */
export function filtrarAprovsPendentes(aprovs: ApprovalInfo[] | null): ApprovalInfo[] {
  if (!aprovs) return [];
  return aprovs.filter((a) => String(a.status) === 'pendente');
}

/** Total de fluxos ativos (shape sem status — todo flow listado é ativo) */
export function fluxosAtivosCount(flows: FlowInfo[] | null): number | null {
  if (flows === null) return null;
  return flows.length;
}

/** Dot verde/vermelho/cinza do card de saúde — retorna cor CSS */
export function corDotSaude(v: boolean | undefined): string {
  if (v === undefined) return '#737373';
  return v ? 'var(--ok)' : 'var(--err)';
}

/** Verifica se todas as APIs falharam (estado de erro global) */
export function isTudoFalhou(d: HomeDados): boolean {
  return !d.status && !d.aprovs && !d.budget && !d.tasks && !d.flows && !d.notif;
}

/** Helpers de feed — mapeia tipo → ícone e classe (puro) */
export function feedIconMeta(tipo: string): { icon: string; iconClass: string } {
  let icon = 'tasks';
  let iconClass = 'task';
  if (tipo.startsWith('sessao')) { icon = 'run'; iconClass = 'sessao'; }
  else if (tipo.startsWith('hook')) { icon = 'spark'; iconClass = 'hook'; }
  else if (tipo.startsWith('team')) { icon = 'teams'; iconClass = 'team'; }
  return { icon, iconClass };
}

// ── Stores ───────────────────────────────────────────────────────────────
export const homeStatusStore = writable<StatusAgregado | null>(null);
export const homeAprovsStore = writable<ApprovalInfo[] | null>(null);
export const homeBudgetStore = writable<BudgetStatus | null>(null);
export const homeTasksStore = writable<TaskInfo[] | null>(null);
export const homeFlowsStore = writable<FlowInfo[] | null>(null);
export const homeNotifStore = writable<NotificacoesResposta | null>(null);

export const homeCarregandoStore = writable<boolean>(false);
export const homeErroStore = writable<string | null>(null);
export const homeFeedStore = writable<Record<string, unknown>[]>([]);

// derived KPIs
export const kpiVencidasStore = derived(homeTasksStore, ($tasks) => $tasks ? contarTasksVencidas($tasks) : null);
export const kpiNaoLidasStore = derived(homeNotifStore, ($n) => $n?.resumo?.nao_lidas ?? null);
export const aprovsPendentesStore = derived(homeAprovsStore, ($a) => filtrarAprovsPendentes($a));
export const fluxosAtivosStore = derived(homeFlowsStore, ($f) => fluxosAtivosCount($f));

// ── API helpers ─────────────────────────────────────────────────────────
/** Carrega todos os KPIs em allSettled (API que falha vira null sem derrubar os outros) */
export async function carregarHome(): Promise<HomeDados> {
  const { api } = await import('../api.js');
  homeCarregandoStore.set(true);
  homeErroStore.set(null);
  const [rStatus, rAprovs, rBudget, rTasks, rFlows, rNotif] = await Promise.allSettled([
    api<StatusAgregado>('/status'),
    api<ApprovalInfo[]>('/approvals'),
    api<BudgetStatus>('/budget/status'),
    api<TaskInfo[]>('/tasks'),
    api<FlowInfo[]>('/flows'),
    api<NotificacoesResposta>('/notifications'),
  ]);
  const ok = <T>(r: PromiseSettledResult<T>): T | null => (r.status === 'fulfilled' ? r.value : null);
  const dados: HomeDados = {
    status: ok(rStatus),
    aprovs: ok(rAprovs),
    budget: ok(rBudget),
    tasks: ok(rTasks),
    flows: ok(rFlows),
    notif: ok(rNotif),
  };
  homeStatusStore.set(dados.status);
  homeAprovsStore.set(dados.aprovs);
  homeBudgetStore.set(dados.budget);
  homeTasksStore.set(dados.tasks);
  homeFlowsStore.set(dados.flows);
  homeNotifStore.set(dados.notif);
  const tudoFalhou = isTudoFalhou(dados);
  if (tudoFalhou) homeErroStore.set('Não foi possível carregar os dados da empresa.');
  homeCarregandoStore.set(false);
  return dados;
}

export async function decidirAprovacaoStore(id: string, ok: boolean): Promise<void> {
  const { api } = await import('../api.js');
  const { toast } = await import('../api.js');
  await api('/approvals/' + encodeURIComponent(id) + (ok ? '/approve' : '/reject'), {
    method: 'POST',
    body: JSON.stringify({ motivo: 'web' }),
  });
  toast(ok ? 'Aprovação registrada' : 'Aprovação rejeitada', ok ? 'ok' : 'aviso');
  await carregarHome();
}

export async function rodarFlowHome(id: string, entrada: string): Promise<void> {
  const { api } = await import('../api.js');
  const { toast } = await import('../api.js');
  await api('/flows/' + encodeURIComponent(id) + '/run', {
    method: 'POST',
    body: JSON.stringify({ entrada }),
  });
  toast('Flow executando — acompanhe no Feed e no Histórico', 'ok');
}

export function adicionarFeedItemStore(ev: Record<string, unknown>): void {
  homeFeedStore.update((prev) => {
    const next = [ev, ...prev];
    return next.slice(0, 30);
  });
}

export function limparFeedStore(): void {
  homeFeedStore.set([]);
}

export async function executarTerminalHomeStore(comando: string): Promise<{ saida: string; codigo: number }> {
  const { api } = await import('../api.js');
  return api<{ saida: string; codigo: number }>('/terminal', {
    method: 'POST',
    body: JSON.stringify({ comando }),
  });
}
