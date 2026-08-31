/**
 * View Histórico — timeline unificada via GET /historico (server-side merge).
 * Filtros: tipo + agente + limite. Guard de primeiro render (sem flicker no refresh de 8s).
 */

import { q, icone, escapeHtml } from "../api.js";
import { formatarDataLocal } from "../format.js";
import { estadoVazio, estadoErro, estadoCarregando } from "../estado.js";
import { ajuda } from "../help.js";

interface ItemHistorico {
  id: string;
  tipo: 'execucao' | 'task' | 'rotina' | 'conversa';
  titulo: string;
  agente: string;
  quando: string | null;
  status?: string;
}

interface AgenteInfo {
  id: string;
}

interface FiltrosHistorico {
  tipo: 'tudo' | 'execucao' | 'task' | 'rotina' | 'conversa';
  agente: string;
  limite: number;
}

const filtros: FiltrosHistorico = { tipo: 'tudo', agente: '', limite: 100 };
let carregouAgentes = false;

function corDoTipo(tipo: ItemHistorico['tipo'], status?: string): string {
  if (tipo === 'execucao') return 'var(--accent)';
  if (tipo === 'task') {
    if (status === 'feito') return 'var(--ok)';
    if (status === 'fazendo') return 'var(--warn)';
    return 'var(--ok)';
  }
  if (tipo === 'conversa') return 'var(--ok)';
  return 'var(--warn)'; // rotina
}

function labelDoTipo(tipo: ItemHistorico['tipo']): string {
  switch (tipo) {
    case 'execucao': return 'Execução';
    case 'task': return 'Task';
    case 'rotina': return 'Rotina';
    case 'conversa': return 'Conversa';
  }
}

function cabecalho(): string {
  const opcoesTipo: Array<[FiltrosHistorico['tipo'], string]> = [
    ['tudo', 'Tudo'], ['execucao', 'Execuções'], ['task', 'Tasks'], ['rotina', 'Rotinas'], ['conversa', 'Conversas'],
  ];
  return `
    <div class="flex items-center justify-between mb-6 gap-2 flex-wrap">
      <h1 class="text-2xl font-bold flex items-center gap-2">${icone('history')} Histórico ${ajuda('historico')}</h1>
      <div class="flex items-center gap-2 flex-wrap">
        <div class="flex rounded-lg border border-zinc-700" role="group" aria-label="Filtro por tipo">
          ${opcoesTipo.map(([v, label]) => `<button class="btn-ghost text-xs px-3 py-1 ${filtros.tipo === v ? 'bg-blue-600 text-white' : ''}" onclick="window.__historicoSetFiltro('${v}')">${label}</button>`).join('')}
        </div>
        <select id="historico-agente" class="btn-ghost text-xs" onchange="window.__historicoSetAgente(this.value)" title="Filtrar por agente">
          <option value="">— agente —</option>
          <option value="secretario" ${filtros.agente === 'secretario' ? 'selected' : ''}>secretário</option>
          <option value="secretario-exec" ${filtros.agente === 'secretario-exec' ? 'selected' : ''}>secretário-exec</option>
        </select>
        <select class="btn-ghost text-xs" onchange="window.__historicoSetLimite(Number(this.value))" aria-label="Limite">
          <option value="50" ${filtros.limite === 50 ? 'selected' : ''}>50</option>
          <option value="100" ${filtros.limite === 100 ? 'selected' : ''}>100</option>
          <option value="200" ${filtros.limite === 200 ? 'selected' : ''}>200</option>
        </select>
      </div>
    </div>
  `;
}

/** Renderiza a view Histórico */
export async function renderHistorico(): Promise<void> {
  const viewEl = document.getElementById('view-historico');
  if (!viewEl) return;

  // guard: refresh de 8s não reseta a timeline — só o primeiro render monta o esqueleto
  const primeiroRender = !viewEl.innerHTML.trim();
  if (primeiroRender) {
    viewEl.innerHTML = cabecalho() + estadoCarregando();
  }

  // popula select de agentes (uma vez)
  if (!carregouAgentes) {
    carregouAgentes = true;
    try {
      const agentes = await q<AgenteInfo[]>('/agents');
      const select = document.getElementById('historico-agente') as HTMLSelectElement | null;
      if (select) {
        const extras = (agentes ?? [])
          .filter((a) => a.id && a.id !== 'secretario' && a.id !== 'secretario-exec')
          .map((a) => `<option value="${escapeHtml(a.id)}" ${filtros.agente === a.id ? 'selected' : ''}>${escapeHtml(a.id)}</option>`)
          .join('');
        select.insertAdjacentHTML('beforeend', extras);
        select.value = filtros.agente;
      }
    } catch {
      /* select fica com as opções padrão */
    }
  }

  await carregarERender();
}

async function carregarERender(): Promise<void> {
  const viewEl = document.getElementById('view-historico');
  if (!viewEl) return;

  const containerAntigo = document.getElementById('historico-lista');
  if (!containerAntigo) {
    viewEl.innerHTML = cabecalho() + '<div id="historico-lista">' + estadoCarregando() + '</div>';
  } else {
    containerAntigo.innerHTML = estadoCarregando();
  }

  let itens: ItemHistorico[] | null = null;
  try {
    const params = new URLSearchParams();
    if (filtros.tipo !== 'tudo') params.set('tipo', filtros.tipo);
    if (filtros.agente) params.set('agente', filtros.agente);
    params.set('limite', String(filtros.limite));
    itens = await q<ItemHistorico[]>('/historico?' + params.toString());
  } catch {
    itens = null;
  }

  const lista = document.getElementById('historico-lista');
  if (!lista) return;

  if (!itens) {
    viewEl.innerHTML = cabecalho() + estadoErro('Não foi possível carregar o histórico.', () => { void renderHistorico(); });
    return;
  }

  if (!itens.length) {
    lista.innerHTML = estadoVazio('history', 'Nada registrado ainda', 'Execuções, tasks, rotinas e conversas aparecem aqui conforme a empresa opera.');
    return;
  }

  lista.innerHTML = `<div class="hist-acordeao">${itens.map((e, i) => `    <div class="acc-item" data-idx="${i}">
      <button class="acc-header" onclick="window.__histToggle(${i})" aria-expanded="false">
        <span class="acc-dot" style="background: ${corDoTipo(e.tipo, e.status)}"></span>
        <span class="acc-titulo">
          <span class="acc-titulo-texto">${escapeHtml(e.titulo)}</span>
          <span class="acc-sub">${labelDoTipo(e.tipo)}${e.agente ? ' · ' + escapeHtml(e.agente) : ''}${e.status ? ' · ' + escapeHtml(e.status) : ''}</span>
        </span>
        <span class="acc-quando">${e.quando ? formatarDataLocal(e.quando) : '—'}</span>
        <span class="acc-seta">▾</span>
      </button>
      <div class="acc-body" id="acc-body-${i}" hidden></div>
    </div>
  `).join('')}</div>`;
  itensAtuais = itens;
  detalhesBuscados.clear();
}

let itensAtuais: ItemHistorico[] = [];
const detalhesBuscados = new Set<number>();

(window as unknown as Record<string, unknown>).__histToggle = async (i: number) => {
  const item = document.querySelector(`.acc-item[data-idx="${i}"]`);
  if (!item) return;
  const body = item.querySelector('.acc-body') as HTMLElement | null;
  const seta = item.querySelector('.acc-seta') as HTMLElement | null;
  const aberto = body ? !body.hidden : false;
  if (body) body.hidden = aberto;
  item.classList.toggle('aberto', !aberto);
  if (seta) seta.textContent = aberto ? '▾' : '▴';
  if (aberto || !itensAtuais[i] || detalhesBuscados.has(i)) return;
  detalhesBuscados.add(i);
  if (body) body.innerHTML = '<div class="acc-loading">carregando detalhes…</div>';
  body!.innerHTML = await detalhesDoItem(itensAtuais[i]);
};

async function detalhesDoItem(e: ItemHistorico): Promise<string> {
  const { renderMarkdown } = await import('../md.js');
  const esc = (v: unknown): string => escapeHtml(String(v ?? ''));
  try {
    if (e.tipo === 'execucao') {
      const { log } = await q<{ log: string }>('/sessions/' + encodeURIComponent(e.id) + '/log');
      const tail = (log || '').split('\n').slice(-40).join('\n');
      return `<div class="acc-grid">
        <div><span class="acc-k">execução</span> <span class="acc-v mono">${esc(e.id)}</span></div>
        <div><span class="acc-k">agente</span> <span class="acc-v">${esc(e.agente || '—')}</span></div>
        <div><span class="acc-k">status</span> <span class="acc-v">${esc(e.status || '—')}</span></div>
      </div>
      <pre class="acc-log">${escapeHtml(tail || '(log vazio)')}</pre>`;
    }
    if (e.tipo === 'task') {
      const t = await q<Record<string, unknown>>('/tasks/' + encodeURIComponent(e.id));
      return `<div class="acc-grid">
        <div><span class="acc-k">coluna</span> <span class="acc-v">${esc(t.coluna)}</span></div>
        <div><span class="acc-k">responsável</span> <span class="acc-v">${esc(String(t.responsavel || '—')).replace('agente:', '')}</span></div>
        <div><span class="acc-k">prioridade</span> <span class="acc-v">${esc(t.prioridade)}</span></div>
        <div><span class="acc-k">labels</span> <span class="acc-v">${esc(((t.labels as string[]) || []).join(', ') || '—')}</span></div>
        <div><span class="acc-k">due</span> <span class="acc-v">${esc(t.due || '—')}</span></div>
      </div>
      ${t.descricao ? `<div class="acc-desc">${renderMarkdown(String(t.descricao))}</div>` : ''}
      <button class="btn-ghost text-xs" onclick="navegar('tasks');setTimeout(()=>abrirDrawer('${escapeHtml(e.id)}',''),300)">abrir no board →</button>`;
    }
    if (e.tipo === 'rotina') {
      const j = await q<Record<string, unknown>>('/schedules/' + encodeURIComponent(e.id));
      const runs = await q<Array<Record<string, unknown>>>('/schedules/' + encodeURIComponent(e.id) + '/runs?limite=5').catch(() => []);
      const agendaTxt = j.agenda_tipo === 'cron' ? 'cron ' + esc(j.agenda_valor) : j.agenda_tipo === 'intervalo_min' ? 'cada ' + esc(j.agenda_valor) + ' min' : 'em ' + esc(j.agenda_valor);
      return `<div class="acc-grid">
        <div><span class="acc-k">agenda</span> <span class="acc-v mono">${agendaTxt}</span></div>
        <div><span class="acc-k">workspace</span> <span class="acc-v">${esc(j.workspace || '—')}</span></div>
        <div><span class="acc-k">próxima</span> <span class="acc-v">${j.proxima_exec ? formatarDataLocal(String(j.proxima_exec)) : '—'}</span></div>
        <div><span class="acc-k">estado</span> <span class="acc-v">${Number(j.ativo) === 1 ? 'ativa' : 'pausada'}</span></div>
      </div>
      <div class="acc-k" style="margin-top:.4rem">comando</div>
      <pre class="acc-log">${escapeHtml(String(j.args_raw || (Array.isArray(j.args) ? (j.args as string[]).join(' ') : '')))}</pre>
      ${runs.length ? `<div class="acc-k" style="margin-top:.5rem">últimas execuções</div>` + runs.map((r) => `
        <div class="acc-run ${r.pulado ? 'pulou' : ''}">
          <span class="mono">${esc(String(r.iniciado_em ?? '')).slice(0, 16).replace('T', ' ')}</span>
          <span>${r.pulado ? '⏭ pulado' : r.erro ? '✗ ' + esc(String(r.erro)).slice(0, 60) : '✓ ' + esc(String(r.resultado)).slice(0, 60)}</span>
        </div>`).join('') : ''}`;
    }
    if (e.tipo === 'conversa') {
      const msgs = await q<Array<{ role: string; content: string }>>('/secretario/sessoes/' + encodeURIComponent(e.id) + '/mensagens');
      return `<div class="acc-conversa">
        ${msgs.map((m) => `
          <div class="acc-msg ${m.role === 'user' ? 'acc-user' : 'acc-assist'}">
            <span class="acc-role">${m.role === 'user' ? 'você' : 'secretária'}</span>
            <div class="acc-msg-texto">${renderMarkdown(m.content)}</div>
          </div>`).join('')}
      </div>
      <button class="btn-ghost text-xs" onclick="navegar('secretario')">abrir no secretário →</button>`;
    }
    return '<div class="acc-loading">tipo desconhecido</div>';
  } catch (erro) {
    return `<div class="acc-loading">não foi possível carregar detalhes: ${esc((erro as Error).message)}</div>`;
  }
}

(window as unknown as Record<string, unknown>).__historicoSetFiltro = (f: string) => {
  filtros.tipo = f as FiltrosHistorico['tipo'];
  void carregarERender();
};
(window as unknown as Record<string, unknown>).__historicoSetAgente = (a: string) => {
  filtros.agente = a;
  void carregarERender();
};
(window as unknown as Record<string, unknown>).__historicoSetLimite = (l: number) => {
  filtros.limite = l;
  void carregarERender();
};
