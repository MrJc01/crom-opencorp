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

/**
 * Data relativa curta (pt-BR): "agora mesmo", "há 5 min", "há 3h", "há 2d".
 * Acima de uma semana cai para data local (dd/mm).
 */
export function formatarRelativa(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const seg = Math.floor((Date.now() - d.getTime()) / 1000);
    if (seg < 45) return 'agora mesmo';
    const min = Math.floor(seg / 60);
    if (min < 60) return `há ${min} min`;
    const horas = Math.floor(min / 60);
    if (horas < 24) return `há ${horas}h`;
    const dias = Math.floor(horas / 24);
    if (dias < 7) return `há ${dias}d`;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  } catch {
    return iso;
  }
}
