/**
 * Formatters puros para a UI — sem efeitos colaterais, testáveis isoladamente.
 */

/**
 * Escapa HTML para prevenir XSS.
 */
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Formata a agenda de um job para exibição.
 */
export function formatarAgenda(job: { agenda: { tipo: string; valor: string | number } }): string {
  if (job.agenda.tipo === 'intervalo_min') {
    return 'cada ' + job.agenda.valor + ' min';
  }
  if (job.agenda.tipo === 'cron') {
    return 'cron: <code class="font-mono text-xs">' + escapeHtml(String(job.agenda.valor)) + '</code>';
  }
  return 'em: <code class="font-mono text-xs">' + escapeHtml(String(job.agenda.valor)) + '</code>';
}

/**
 * Retorna a classe CSS do badge conforme o tipo de agenda.
 */
export function badgeTipo(tipo: string): string {
  switch (tipo) {
    case 'cron': return 'badge-pipeline';
    case 'intervalo_min': return 'badge-review';
    case 'data_unica': return 'badge-warn';
    default: return 'badge-neutral';
  }
}

/**
 * Retorna a classe CSS do badge conforme o padrão do team.
 */
export function badgeTeamPadrao(p: string): string {
  switch (p) {
    case 'pipeline': return 'badge-pipeline';
    case 'fanout': return 'badge-fanout';
    case 'review': return 'badge-review';
    case 'debate': return 'badge-debate';
    default: return 'badge-neutral';
  }
}

/**
 * Formata data ISO para exibição local (dd/mm/aaaa hh:mm).
 */
export function formatarDataLocal(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/**
 * Formata apenas hora (hh:mm:ss) de ISO.
 */
export function formatarHora(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

/**
 * Trunca string com reticências.
 */
export function truncar(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

export interface EventoHistorico {
  quando: string;
  tipo: 'execucao' | 'task' | 'rotina';
  titulo: string;
  detalhe: string;
  status?: string;
}

export interface SessionInfo {
  id?: string;
  exec_id?: string;
  agente?: string;
  status?: string;
  inicio?: string;
  criado_em?: string;
  duracao?: number;
}

export interface TaskInfo {
  id?: string;
  titulo?: string;
  coluna?: string;
  responsavel?: string;
}

export interface ScheduleJob {
  id: string;
  nome: string;
  agenda: { tipo: string; valor: string | number };
  args: string[];
  workspace: string;
  ativo: boolean;
  proxima_exec?: string;
  ultima_exec?: string;
}

function formatarAgendaSimples(job: ScheduleJob): string {
  if (job.agenda.tipo === 'intervalo_min') return `cada ${job.agenda.valor} min`;
  if (job.agenda.tipo === 'cron') return `cron: ${String(job.agenda.valor)}`;
  return `em: ${String(job.agenda.valor)}`;
}

/**
 * Mescla sessions, tasks e schedules em uma timeline única ordenada por data desc.
 * Função pura para testes.
 */
export function mesclarHistorico(
  sessions: SessionInfo[],
  tasks: TaskInfo[],
  jobs: ScheduleJob[],
  opcoes: { filtro?: 'execucao' | 'task' | 'rotina'; limite?: number } = {}
): EventoHistorico[] {
  const { filtro, limite = 200 } = opcoes;
  const eventos: EventoHistorico[] = [];

  // Sessions → execuções
  for (const s of sessions || []) {
    const quando = s.inicio || s.criado_em;
    if (!quando) continue;
    eventos.push({
      quando,
      tipo: 'execucao',
      titulo: `${s.agente || 'agente'} — ${truncar(String(s.id || s.exec_id || ''), 20)}`,
      detalhe: `id ${String(s.id || s.exec_id || '').slice(0, 12)} · duração ${s.duracao ?? '?'}s`,
      status: s.status,
    });
  }

  // Tasks
  for (const t of tasks || []) {
    const quando = (t as Record<string, unknown>).criado_em as string || new Date().toISOString();
    eventos.push({
      quando,
      tipo: 'task',
      titulo: String(t.titulo || '—'),
      detalhe: `${String(t.coluna || '—')} · ${String(t.responsavel || '—')}`,
      status: String(t.coluna || ''),
    });
  }

  // Schedules (rotinas) — só com ultima_exec
  for (const j of jobs || []) {
    if (!j.ultima_exec) continue;
    eventos.push({
      quando: j.ultima_exec,
      tipo: 'rotina',
      titulo: j.nome,
      detalhe: `${formatarAgendaSimples(j)} · ${j.workspace}`,
      status: j.ativo ? 'ativo' : 'pausado',
    });
  }

  // Ordena por quando desc
  eventos.sort((a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime());

  // Filtro por tipo
  if (filtro) {
    return eventos.filter((e) => e.tipo === filtro).slice(0, limite);
  }

  return eventos.slice(0, limite);
}