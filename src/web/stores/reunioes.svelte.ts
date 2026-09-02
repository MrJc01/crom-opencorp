/**
 * Store Reuniões — Svelte 5 (writable) + helpers puros.
 * Migração de src/web/views/reunioes.ts (Etapa 6) — reuniões com polling.
 * Mantém mesma lógica: convocação, listagem, sala ao vivo (polling 2s), agenda.
 * API via src/web/api.ts · Tailwind intacto.
 */
import { writable, derived } from 'svelte/store';

// ── Tipos ───────────────────────────────────────────────────────────────
export interface MeetingInfo {
  id: string;
  status?: string;
  pauta?: string;
  participantes?: string[];
  criado_em?: string;
  encerrada_em?: string;
  ata?: string | null;
  [k: string]: unknown;
}

export interface EstadoSala {
  id: string;
  status: 'agendando' | 'em_andamento' | 'encerrada';
  pauta: string;
  participantes: Array<{ id: string; ativo: boolean }>;
  turno_atual: number;
  mensagens: Array<{ agente: string; texto: string; ts: string }>;
  consenso: { pedidos: number; total: number };
  iniciado_em: string;
  encerrada_em?: string | null;
}

export interface AgendaJob {
  id: string;
  nome: string;
  agenda: { tipo: string; valor: string | number };
  args: string[];
  workspace: string;
  ativo: boolean;
  proxima_exec?: string;
  ultima_exec?: string;
  [k: string]: unknown;
}

export interface AgenteCheck {
  id: string;
  role?: string;
  category?: string;
}

export type FrequenciaReuniao = 'diario' | 'semanal' | 'intervalo';

// ── Stores ──────────────────────────────────────────────────────────────
export const reunioesStore = writable<MeetingInfo[]>([]);
export const reunioesCarregandoStore = writable<boolean>(false);
export const reunioesErroStore = writable<string | null>(null);
export const salaStore = writable<EstadoSala | null>(null);
export const salaAbertaIdStore = writable<string | null>(null);
export const salaCarregandoStore = writable<boolean>(false);
export const salaErroStore = writable<string | null>(null);
export const rotinasReuniaoStore = writable<AgendaJob[]>([]);
export const rotinasCarregandoStore = writable<boolean>(false);
export const rotinasErroStore = writable<string | null>(null);
export const agentesReuniaoStore = writable<AgenteCheck[]>([]);

// derived
export const reunioesAtivas = derived(reunioesStore, ($l) => $l.filter((r) => String(r.status) === 'em-andamento'));
export const reunioesEncerradas = derived(reunioesStore, ($l) => $l.filter((r) => String(r.status) !== 'em-andamento'));
export const temReunioes = derived(reunioesStore, ($l) => $l.length > 0);
export const rotinasFiltradas = derived(rotinasReuniaoStore, ($l) => filtrarRotinasReuniao($l as AgendaJob[]));

// ── Helpers puros (testáveis) ───────────────────────────────────────────
export function badgeStatusReuniao(status?: string): string {
  const s = String(status ?? '');
  if (s === 'em-andamento' || s === 'em_andamento') return 'badge-warn';
  if (s === 'agendando') return 'badge-warn';
  if (s === 'encerrada') return 'badge-neutral';
  return 'badge-neutral';
}

export function badgeStatusSala(status: EstadoSala['status']): string {
  if (status === 'em_andamento') return 'badge-warn';
  if (status === 'agendando') return 'badge-warn';
  return 'badge-neutral';
}

export function badgeRotinaReuniao(tipo: string): string {
  switch (tipo) {
    case 'cron': return 'badge-pipeline';
    case 'intervalo_min': return 'badge-review';
    default: return 'badge-warn';
  }
}

export function isVivaStatus(status: string): boolean {
  return status === 'em_andamento' || status === 'agendando' || status === 'em-andamento';
}

export function filtrarRotinasReuniao(jobs: AgendaJob[]): AgendaJob[] {
  return (jobs ?? []).filter((j) => Array.isArray(j.args) && j.args[0] === 'meeting');
}

export function construirNomeRotina(pauta: string, suffix?: string): string {
  const slug = pauta.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'auto';
  const suf = suffix ?? Date.now().toString(36).slice(-4);
  return `reuniao-${slug}-${suf}`;
}

export function construirArgsReuniao(pauta: string, agentes: string[]): string[] {
  const args = ['meeting', 'iniciar', '--pauta', pauta, '--nao-interativo'];
  if (agentes.length) args.push('--agentes', agentes.join(','));
  return args;
}

export function prepararAgendaReuniao(freq: string, hora: string, valor: string): { agenda_tipo: string; agenda_valor: string } | { erro: string } {
  if (freq === 'intervalo') {
    const n = Number(valor);
    if (!Number.isFinite(n) || n < 1) return { erro: 'Informe o intervalo em minutos (≥ 1)' };
    return { agenda_tipo: 'intervalo_min', agenda_valor: String(n) };
  }
  // diario / semanal → cron
  const [hStr, mStr] = (hora ?? '').split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return { erro: 'Informe a hora da reunião' };
  const cron = `${m} ${h} * * ${freq === 'semanal' ? '1' : '*'}`;
  return { agenda_tipo: 'cron', agenda_valor: cron };
}

export function validarPauta(pauta: string): string | null {
  if (!pauta.trim()) return 'Pauta é obrigatória';
  return null;
}

export function validarAgendaReuniaoForm(pauta: string, freq: string, hora: string, valor: string): string | null {
  const e = validarPauta(pauta);
  if (e) return e;
  if (!freq) return 'Frequência é obrigatória';
  const prep = prepararAgendaReuniao(freq, hora, valor);
  if ('erro' in prep) return prep.erro;
  return null;
}

export function consensoTexto(consenso: { pedidos: number; total: number }): string {
  if (!consenso || consenso.total <= 0) return '';
  return `${consenso.pedidos}/${consenso.total} pediram encerrar`;
}

export function intervaloPollingMs(): number {
  return 2000;
}

// ── Estado polling singleton (sobrevive a re-renders) ───────────────────
let salaAbertaIdInternal: string | null = null;
let timerSala: ReturnType<typeof setInterval> | null = null;

export function isSalaAoVivoAberta(): boolean {
  return salaAbertaIdInternal !== null;
}

export function getSalaAbertaId(): string | null {
  return salaAbertaIdInternal;
}

export function pararPollingSala(): void {
  if (timerSala) {
    clearInterval(timerSala);
    timerSala = null;
  }
}

export function fecharSalaVivaStore(): void {
  salaAbertaIdInternal = null;
  salaAbertaIdStore.set(null);
  pararPollingSala();
  salaStore.set(null);
  salaErroStore.set(null);
}

// ── API helpers ─────────────────────────────────────────────────────────
export async function carregarReunioes(): Promise<MeetingInfo[]> {
  const { api } = await import('../api.js');
  reunioesCarregandoStore.set(true);
  reunioesErroStore.set(null);
  try {
    const lista = await api<MeetingInfo[]>('/meetings');
    const arr = Array.isArray(lista) ? lista : [];
    reunioesStore.set(arr);
    return arr;
  } catch (e) {
    const msg = (e as Error)?.message ?? 'Não foi possível carregar as reuniões.';
    reunioesErroStore.set(msg);
    throw e;
  } finally {
    reunioesCarregandoStore.set(false);
  }
}

export async function criarReuniaoStore(pauta: string, agentes: string[]): Promise<{ status?: string; id?: string }> {
  const { api } = await import('../api.js');
  const { toast } = await import('../api.js');
  const v = validarPauta(pauta);
  if (v) {
    toast(v, 'erro');
    throw new Error(v);
  }
  const body: Record<string, unknown> = { pauta, agentes: agentes.length ? agentes.join(',') : undefined };
  // remove undefined
  if (!agentes.length) delete (body as Record<string, unknown>).agentes;
  const res = await api<{ status?: string; id?: string }>('/meetings', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (res.status === 'iniciado') {
    toast(`Reunião ${res.id ?? ''} iniciada em background — acompanhe na Sala ao vivo`, 'ok');
  }
  await carregarReunioes().catch(() => {});
  return res;
}

export async function encerrarReuniaoStore(id: string): Promise<void> {
  const { api } = await import('../api.js');
  const { toast } = await import('../api.js');
  const { modalConfirm } = await import('../modal.js');
  if (!(await modalConfirm(`Encerrar a reunião ${id}? Os turnos param entre falas e a ata é gerada.`, { confirmar: 'Encerrar' }))) return;
  await api(`/meetings/${encodeURIComponent(id)}/stop`, { method: 'POST' });
  toast('Interrupção solicitada — a sala encerra entre turnos', 'ok');
  await carregarReunioes().catch(() => {});
  // se era a sala aberta, força poll
  if (salaAbertaIdInternal === id) {
    await pollSalaOnce();
  }
}

export async function fetchSala(id: string): Promise<EstadoSala> {
  const { api } = await import('../api.js');
  return api<EstadoSala>('/meetings/' + encodeURIComponent(id));
}

export async function pollSalaOnce(): Promise<EstadoSala | null> {
  const id = salaAbertaIdInternal;
  if (!id) return null;
  salaCarregandoStore.set(true);
  salaErroStore.set(null);
  try {
    const estado = await fetchSala(id);
    // guard: painel trocado durante fetch
    if (salaAbertaIdInternal !== id) return null;
    if (!estado) {
      salaErroStore.set('Não foi possível carregar a sala.');
      return null;
    }
    salaStore.set(estado);
    salaErroStore.set(null);
    return estado;
  } catch {
    salaErroStore.set('Não foi possível carregar a sala (pode não ter existido ou falhar ao iniciar).');
    return null;
  } finally {
    salaCarregandoStore.set(false);
  }
}

export async function abrirSalaVivaStore(id: string): Promise<void> {
  salaAbertaIdInternal = id;
  salaAbertaIdStore.set(id);
  pararPollingSala();
  salaCarregandoStore.set(true);
  salaErroStore.set(null);
  await pollSalaOnce();
  pararPollingSala();
  timerSala = setInterval(() => { void pollSalaOnce(); }, intervaloPollingMs());
}

export async function carregarAgentesReuniao(): Promise<AgenteCheck[]> {
  const { api } = await import('../api.js');
  try {
    const agentes = await api<AgenteCheck[]>('/agents');
    const lista = Array.isArray(agentes) ? agentes : [];
    agentesReuniaoStore.set(lista);
    return lista;
  } catch {
    agentesReuniaoStore.set([]);
    return [];
  }
}

export async function carregarRotinasReuniao(): Promise<AgendaJob[]> {
  const { q } = await import('../api.js');
  rotinasCarregandoStore.set(true);
  rotinasErroStore.set(null);
  try {
    const jobs = await q<AgendaJob[]>('/schedules');
    const lista = Array.isArray(jobs) ? jobs : [];
    const rotinas = filtrarRotinasReuniao(lista);
    rotinasReuniaoStore.set(rotinas);
    return rotinas;
  } catch (e) {
    const msg = (e as Error)?.message ?? 'Não foi possível carregar as rotinas de reunião.';
    rotinasErroStore.set(msg);
    throw e;
  } finally {
    rotinasCarregandoStore.set(false);
  }
}

export async function criarAgendaReuniaoStore(opts: { pauta: string; freq: string; hora: string; valor: string; agentes: string[] }): Promise<void> {
  const { api } = await import('../api.js');
  const { toast } = await import('../api.js');
  const { getWsAtivo } = await import('../state.js');
  const v = validarAgendaReuniaoForm(opts.pauta, opts.freq, opts.hora, opts.valor);
  if (v) {
    toast(v, 'erro');
    throw new Error(v);
  }
  const prep = prepararAgendaReuniao(opts.freq, opts.hora, opts.valor) as { agenda_tipo: string; agenda_valor: string };
  const args = construirArgsReuniao(opts.pauta, opts.agentes);
  const nome = construirNomeRotina(opts.pauta);
  await api('/schedules', {
    method: 'POST',
    body: JSON.stringify({
      nome,
      agenda_tipo: prep.agenda_tipo,
      agenda_valor: prep.agenda_valor,
      args,
      workspace: getWsAtivo() || undefined,
    }),
  });
  toast('Reunião agendada — veja na aba Agenda', 'ok');
  await carregarRotinasReuniao().catch(() => {});
}

export async function excluirRotinaReuniaoStore(id: string): Promise<void> {
  const { api } = await import('../api.js');
  const { toast } = await import('../api.js');
  const { modalConfirm } = await import('../modal.js');
  if (!(await modalConfirm('Excluir esta rotina de reunião?', { confirmar: 'Excluir' }))) return;
  await api('/schedules/' + encodeURIComponent(id), { method: 'DELETE' });
  toast('Rotina excluída', 'ok');
  await carregarRotinasReuniao().catch(() => {});
}
