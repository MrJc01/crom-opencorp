/**
 * Utilitários de sessões do Secretário — compartilhados entre a lista lateral
 * da página (views/secretario.ts) e o popup de histórico (historico-popup.ts).
 * Extraído da Etapa 1b (P-29) para evitar duplicação da lógica de agrupamento.
 */

export interface SessaoChat {
  id: string;
  title?: string;
  titulo_real?: string;
  sem_conteudo?: boolean;
  created_at?: string;
  updated_at?: string;
  created?: number;
  updated?: number;
}

/** ISO (proxy real) ou ms (fake/proxy) → Date */
export function dataSessao(s: SessaoChat): Date | null {
  const iso = s.updated_at ?? s.created_at;
  if (iso) {
    const d = new Date(iso);
    if (!isNaN(d.getTime())) return d;
  }
  const ms = s.updated ?? s.created;
  if (typeof ms === 'number') return new Date(ms);
  return null;
}

/** Título REAL (1ª mensagem do usuário) tem prioridade — "New session - <ts>" não diz nada */
export function tituloSessao(s: SessaoChat): string {
  const t = (s.titulo_real || s.title || 'Sem título').trim();
  return t.length > 60 ? t.slice(0, 59) + '…' : t;
}

/** Tempo relativo curto: agora · 5min · 2h · ontem 14:22 · 28/08 */
export function tempoRelativo(d: Date): string {
  const diffMin = Math.round((Date.now() - d.getTime()) / 60_000);
  if (diffMin < 2) return 'agora';
  if (diffMin < 60) return `${diffMin}min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const ontem = new Date(); ontem.setDate(ontem.getDate() - 1); ontem.setHours(0, 0, 0, 0);
  if (d >= ontem) return `ontem ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export interface GrupoSessoes<S extends SessaoChat> {
  grupo: 'Hoje' | 'Ontem' | 'Anteriores';
  itens: S[];
}

/** Agrupa sessões por dia (Hoje/Ontem/Anteriores), mais recentes primeiro, sem grupos vazios. */
export function agruparSessoes<S extends SessaoChat>(sessoes: S[]): GrupoSessoes<S>[] {
  const baldes: Record<'Hoje' | 'Ontem' | 'Anteriores', S[]> = { 'Hoje': [], 'Ontem': [], 'Anteriores': [] };
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const ontem = new Date(hoje); ontem.setDate(ontem.getDate() - 1);

  const ts = (s: S): number => dataSessao(s)?.getTime() ?? 0;
  const ordenadas = [...sessoes].sort((a, b) => ts(b) - ts(a));

  for (const s of ordenadas) {
    const d = dataSessao(s);
    if (!d) { baldes['Anteriores'].push(s); continue; }
    if (d >= hoje) baldes['Hoje'].push(s);
    else if (d >= ontem) baldes['Ontem'].push(s);
    else baldes['Anteriores'].push(s);
  }

  return (['Hoje', 'Ontem', 'Anteriores'] as const)
    .filter((k) => baldes[k].length)
    .map((k) => ({ grupo: k, itens: baldes[k] }));
}
