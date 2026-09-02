/**
 * Home — cards "Ações e avisos" (P-30):
 *  1. Feed de ações: rotinas a seguir (contagem regressiva ao vivo),
 *     executando agora e o que foi executado (no final, opacidade maior).
 *  2. Notificações não vistas: lista com marcação de lida individual/global.
 *
 * Dados: GET /schedules?workspace= (proxima_exec), GET /execucoes (ledger
 * unificado), GET /notifications?nao_lidas=1. Escopo: workspace ativo
 * (mesmo recorte dos KPIs — o feed genérico "todas as empresas" fica abaixo).
 */

import { api, icone, escapeHtml, toast } from "../api.js";
import { formatarAgenda, formatarRelativa, truncar } from "../format.js";
import { atualizarBadgeNotificacoes } from "./notificacoes.js";
import { estadoVazio } from "../estado.js";

interface AgendaJob {
  tipo: "cron" | "intervalo_min" | "data_unica";
  valor: string | number;
}

interface JobInfo {
  id: string;
  nome: string;
  agenda: AgendaJob;
  args: string[];
  workspace: string;
  ativo: boolean;
  proxima_exec: string | null;
}

interface ExecucaoInfo {
  id: string;
  agente: string;
  gatilho_tipo: string;
  gatilho_origem: string | null;
  status: string;
  inicio: string;
  duracao_ms: number | null;
  exit_code: number | null;
}

interface NotificacaoInfo {
  id: string;
  titulo: string;
  corpo: string;
  tipo: string;
  origem: string;
  lida: boolean;
  criado_em: string;
}

const MAX_A_SEGUIR = 6;
const MAX_EXECUTADAS = 8;
const MAX_NAO_VISTAS = 8;
/** Contagem < 2 min do alvo entra em modo "próxima" (pulso âmbar) */
const JANELA_PROXIMA_MS = 2 * 60 * 1000;

/** Rótulo amigável do gatilho (ledger unificado) */
function rotuloGatilho(tipo: string, origem: string | null): string {
  const o = origem ? truncar(origem, 42) : '';
  switch (tipo) {
    case 'cron': return 'rotina' + (o ? ` · ${o}` : '');
    case 'mencao': return 'menção' + (o ? ` · ${o}` : '');
    case 'manual': return o ? `manual · ${o}` : 'manual';
    case 'reuniao': return 'reunião';
    case 'fluxo': return 'fluxo' + (o ? ` · ${o}` : '');
    case 'hook': return 'hook' + (o ? ` · ${o}` : '');
    case 'dependencia': return 'dependência';
    default: return truncar(tipo || '—', 24) + (o ? ` · ${o}` : '');
  }
}

/** Contagem regressiva: "em 02:03:04" (ao vivo) ou "em 1d 03h 12m" para longe */
function formatarContagem(ms: number): string {
  if (ms <= 0) return 'agora';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  const p2 = (n: number): string => String(n).padStart(2, '0');
  if (d > 0) return `em ${d}d ${p2(h)}h ${p2(m)}m`;
  return `em ${p2(h)}:${p2(m)}:${p2(seg)}`;
}

/** Decorrido desde início: "00:05:12" / "1d 02:03:04" */
function formatarDecorrido(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  const p2 = (n: number): string => String(n).padStart(2, '0');
  if (d > 0) return `${d}d ${p2(h)}:${p2(m)}:${p2(seg)}`;
  return `${p2(h)}:${p2(m)}:${p2(seg)}`;
}

/** Badge de cor por tipo de notificação */
function badgeNotif(tipo: string): string {
  switch (tipo) {
    case 'resumo': return 'badge-pipeline';
    case 'aviso': return 'badge-warn';
    case 'erro': return 'badge-err';
    default: return 'badge-neutral';
  }
}

/* ── Esqueletos estáticos (preenchidos por carregar*) ── */

export function htmlCardAcoes(): string {
  return `
    <div class="card-header">
      <span class="font-semibold text-sm flex items-center gap-2">${icone('history')} Ações da empresa</span>
      <span class="badge badge-neutral">escopo: empresa ativa</span>
    </div>
    <div class="card-body">
      <div class="acoes-grupo-rotulo">A seguir</div>
      <div id="acoes-a-seguir" class="mb-3"></div>
      <div class="acoes-grupo-rotulo">Executando agora</div>
      <div id="acoes-executando" class="mb-3"></div>
      <div class="acoes-grupo-rotulo">Executado recentemente</div>
      <div id="acoes-executadas"></div>
    </div>
  `;
}

export function htmlCardNaoVistas(): string {
  return `
    <div class="card-header">
      <span class="font-semibold text-sm flex items-center gap-2">${icone('sino')} Não vistas</span>
      <span id="nao-vistas-badge" class="badge badge-neutral"></span>
    </div>
    <div class="card-body">
      <div id="nao-vistas-lista"></div>
      <div id="nao-vistas-acoes" class="mt-2" style="display:none">
        <button class="btn btn-ghost text-xs w-full" onclick="homeNotifTodasLidas()">${icone('check')} Marcar todas como lidas</button>
      </div>
    </div>
  `;
}

/* ── Carregadores ── */

export async function carregarCardAcoes(): Promise<void> {
  const elSeguir = document.getElementById('acoes-a-seguir');
  const elExecutando = document.getElementById('acoes-executando');
  const elExecutadas = document.getElementById('acoes-executadas');
  if (!elSeguir || !elExecutando || !elExecutadas) return;

  let jobs: JobInfo[] | null = null;
  let execs: ExecucaoInfo[] | null = null;
  try {
    // api() injeta ?workspace= do escopo ativo (mesmo recorte dos KPIs)
    const [rJobs, rExecs] = await Promise.all([
      api<JobInfo[]>('/schedules'),
      api<ExecucaoInfo[]>('/execucoes?limite=40'),
    ]);
    jobs = rJobs;
    execs = rExecs;
  } catch {
    elSeguir.innerHTML = elExecutando.innerHTML = elExecutadas.innerHTML =
      '<div class="text-xs" style="color:var(--err)">⚠ Falha ao carregar ações</div>';
    return;
  }

  // A seguir: rotinas ativas com próxima execução, mais próximas primeiro
  const aSeguir = (jobs || [])
    .filter((j) => j.ativo && j.proxima_exec)
    .sort((a, b) => String(a.proxima_exec).localeCompare(String(b.proxima_exec)))
    .slice(0, MAX_A_SEGUIR);

  elSeguir.innerHTML = aSeguir.length
    ? aSeguir.map((j) => `
      <div class="acao-item acao-pendente" title="${escapeHtml(j.nome)} · próxima execução ${escapeHtml(String(j.proxima_exec))}">
        <span class="acao-ico acao-ico-agenda">${icone('agenda')}</span>
        <div class="acao-corpo">
          <div class="acao-titulo">${escapeHtml(j.nome || j.id)}</div>
          <div class="acao-meta">${formatarAgenda(j)} · ${escapeHtml(truncar((j.args || []).join(' '), 48))}</div>
        </div>
        <span class="acao-contagem" data-contagem-fim="${escapeHtml(String(j.proxima_exec))}">…</span>
      </div>
    `).join('')
    : '<div class="acao-vazio">Nada agendado — crie rotinas em <a href="/agenda" onclick="navegar(\'agenda\')">Agenda</a>.</div>';

  const lista = execs || [];
  const agora = lista.filter((e) => e.status === 'executando');
  const feitas = lista
    .filter((e) => e.status === 'concluido' || e.status === 'falhou' || e.status === 'cancelado')
    .slice(0, MAX_EXECUTADAS);

  elExecutando.innerHTML = agora.length
    ? agora.map((e) => `
      <div class="acao-item acao-executando" title="${escapeHtml(e.id)}">
        <span class="acao-ico acao-ico-run">${icone('run')}</span>
        <div class="acao-corpo">
          <div class="acao-titulo">${escapeHtml(e.agente)} <span class="acao-dot" title="executando"></span></div>
          <div class="acao-meta">${escapeHtml(rotuloGatilho(e.gatilho_tipo, e.gatilho_origem))}</div>
        </div>
        <span class="acao-contagem" data-contagem-inicio="${escapeHtml(String(e.inicio))}">…</span>
      </div>
    `).join('')
    : '<div class="acao-vazio">Nada executando neste momento.</div>';

  // Executado: no final do card, com opacidade maior (ação que virou fato)
  elExecutadas.innerHTML = feitas.length
    ? feitas.map((e) => `
      <div class="acao-item acao-executada" title="${escapeHtml(e.id)}">
        <span class="acao-ico ${e.status === 'concluido' ? 'acao-ico-ok' : 'acao-ico-erro'}">${icone(e.status === 'concluido' ? 'check' : 'close')}</span>
        <div class="acao-corpo">
          <div class="acao-titulo">${escapeHtml(e.agente)}</div>
          <div class="acao-meta">${escapeHtml(rotuloGatilho(e.gatilho_tipo, e.gatilho_origem))} · ${formatarRelativa(e.inicio)}</div>
        </div>
        <span class="badge ${e.status === 'concluido' ? 'badge-ok' : 'badge-err'}">${escapeHtml(e.status)}${e.duracao_ms ? ' · ' + formatarDecorrido(e.duracao_ms).slice(0, 8) : ''}</span>
      </div>
    `).join('')
    : '<div class="acao-vazio">Nenhuma execução ainda — ações aparecem aqui ao acontecer.</div>';

  garantirTicker();
}

export async function carregarCardNaoVistas(): Promise<void> {
  const elLista = document.getElementById('nao-vistas-lista');
  const elBadge = document.getElementById('nao-vistas-badge');
  const elAcoes = document.getElementById('nao-vistas-acoes');
  if (!elLista || !elBadge || !elAcoes) return;

  let lista: NotificacaoInfo[] = [];
  let naoLidas = 0;
  try {
    const r = await api<{ notificacoes: NotificacaoInfo[]; resumo?: { nao_lidas?: number } }>(
      '/notifications?nao_lidas=1&limite=' + MAX_NAO_VISTAS,
    );
    lista = r.notificacoes || [];
    naoLidas = r.resumo?.nao_lidas ?? lista.length;
  } catch {
    elLista.innerHTML = '<div class="text-xs" style="color:var(--err)">⚠ Falha ao carregar notificações</div>';
    return;
  }

  elBadge.textContent = String(naoLidas);
  elBadge.className = 'badge ' + (naoLidas > 0 ? 'badge-warn' : 'badge-neutral');
  elAcoes.style.display = naoLidas > 0 ? '' : 'none';

  elLista.innerHTML = lista.length
    ? lista.slice(0, MAX_NAO_VISTAS).map((n) => `
      <div class="notif-nao-vista">
        <div class="notif-nao-vista-topo">
          <span class="badge ${badgeNotif(n.tipo)}">${escapeHtml(n.tipo)}</span>
          <span class="acao-meta">${escapeHtml(truncar(n.origem, 24))} · ${formatarRelativa(n.criado_em)}</span>
          <button class="notif-lida-btn" onclick="homeNotifLida('${escapeHtml(n.id)}')" title="Marcar como lida">${icone('check')}</button>
        </div>
        <div class="notif-nao-vista-titulo">${escapeHtml(n.titulo)}</div>
        <div class="notif-nao-vista-corpo">${escapeHtml(n.corpo)}</div>
      </div>
    `).join('')
    : estadoVazio('check', 'Nenhuma não vista', 'Os avisos dos agentes aparecem aqui antes de virarem lidos.');
}

/* ── Handlers globais (marcação de leitura) ── */

export async function homeNotifLida(id: string): Promise<void> {
  try {
    await api('/notifications/' + encodeURIComponent(id) + '/lida', { method: 'POST' });
    await Promise.all([carregarCardNaoVistas(), atualizarBadgeNotificacoes()]);
  } catch (e) {
    toast('Erro ao marcar como lida: ' + (e as Error).message, 'erro');
  }
}

export async function homeNotifTodasLidas(): Promise<void> {
  try {
    await api('/notifications/lidas', { method: 'POST' });
    await Promise.all([carregarCardNaoVistas(), atualizarBadgeNotificacoes()]);
    toast('Todas marcadas como lidas', 'ok');
  } catch (e) {
    toast('Erro: ' + (e as Error).message, 'erro');
  }
}

/* ── Ticker 1s: contagens ao vivo sem re-render (self-stopping) ── */

let ticker: ReturnType<typeof setInterval> | null = null;

function garantirTicker(): void {
  if (ticker) return;
  ticker = setInterval(() => {
    const vivos = document.querySelectorAll<HTMLElement>('[data-contagem-fim],[data-contagem-inicio]');
    if (!vivos.length) {
      if (ticker) { clearInterval(ticker); ticker = null; }
      return;
    }
    const agora = Date.now();
    vivos.forEach((el) => {
      const fim = el.dataset.contagemFim;
      const inicio = el.dataset.contagemInicio;
      if (fim) {
        const restante = new Date(fim).getTime() - agora;
        el.textContent = formatarContagem(restante);
        el.classList.toggle('proxima', restante > 0 && restante < JANELA_PROXIMA_MS);
      } else if (inicio) {
        const t = new Date(inicio).getTime();
        if (!isNaN(t)) el.textContent = formatarDecorrido(agora - t);
      }
    });
  }, 1000);
}

/* ── Refresh por SSE (com throttling) ── */

let ultimaCarga = 0;
const THROTTLE_MS = 4000;

export async function atualizarCardsHomeAcoes(): Promise<void> {
  const t = Date.now();
  if (t - ultimaCarga < THROTTLE_MS) return;
  ultimaCarga = t;
  await Promise.allSettled([carregarCardAcoes(), carregarCardNaoVistas()]);
}
