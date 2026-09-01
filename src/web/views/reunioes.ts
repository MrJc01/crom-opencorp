/**
 * Reuniões v2 (Etapa 6) — aba do Secretário com:
 *  - form de convocação (pauta + check-list de agentes) preservado;
 *  - painel "Sala ao vivo": feed em tempo real via POLLING de GET /meetings/:id
 *    (2s — NÃO usa SSE, que re-renderiza a view inteira), indicador de consenso,
 *    Encerrar (modal) e Fechar; sobrevive a re-renders via estado do módulo;
 *  - bloco "Agendar reunião automática" (POST /schedules com comando headless
 *    `meeting iniciar --nao-interativo`) + lista de rotinas de reunião;
 *  - cards com badge de status e botão "Sala ao vivo" para reuniões ativas.
 */

import { api, q, toast, icone, escapeHtml } from "../api.js";
import { getWsAtivo } from "../state.js";
import type { AgendaJob } from "../state.js";
import { estadoVazio, estadoErro, estadoCarregando } from "../estado.js";
import { ajuda } from "../help.js";
import { htmlSeletorAgentes, agentesMarcados } from "../seletor-agentes.js";
import { formatarAgenda, formatarDataLocal } from "../format.js";

interface EstadoSala {
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

/** Estado do painel ao vivo vive no módulo (singleton): sobrevive a re-renders
 *  de SSE/refresh — mesmo padrão do chat do Secretário. */
let salaAbertaId: string | null = null;
let timerSala: ReturnType<typeof setInterval> | null = null;

/** Para o polling da sala ao vivo — chamado ao sair da aba/view. */
export function pararPollingSala(): void {
  if (timerSala) {
    clearInterval(timerSala);
    timerSala = null;
  }
}

/** Painel da sala ao vivo está aberto (usado pelo SSE guard em main.ts). */
export function isSalaAoVivoAberta(): boolean {
  return salaAbertaId !== null;
}

/** Renderiza o painel de reuniões dentro do contêiner da aba do Secretário */
export async function renderReunioes(): Promise<void> {
  const viewEl = document.getElementById('sec-tab-reunioes');
  if (!viewEl) return;

  pararPollingSala();
  viewEl.innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold flex items-center gap-2">${icone('reunioes')} Reuniões ${ajuda('reunioes')}</h1>
    </div>
    <div id="reuniao-sala" class="card p-4 mb-6 ${salaAbertaId ? '' : 'hidden'}"></div>
    <div class="card p-4 mb-6" id="reunioes-form">${estadoCarregando()}</div>
    <div id="reunioes-lista" class="space-y-4">${estadoCarregando()}</div>
    <div class="card p-4 mt-6" id="reuniao-agenda-form"></div>
    <div id="reuniao-agenda-lista" class="space-y-4 mt-4"></div>
  `;

  await renderReunioesForm();
  await carregarReunioesLista();
  renderAgendaReuniaoForm();
  await carregarRotinasReuniao();
  if (salaAbertaId) await abrirSalaViva(salaAbertaId);
}

async function renderReunioesForm(): Promise<void> {
  const el = document.getElementById('reunioes-form');
  if (!el) return;

  const seletor = await htmlSeletorAgentes('reuniao-seletor-agentes', ['ceo-documentos', 'secretario']);

  el.innerHTML = `
    <h3 class="font-semibold mb-3 flex items-center gap-2">${icone('plus')} Convocar reunião</h3>
    <form id="form-nova-reuniao" class="space-y-4" onsubmit="event.preventDefault(); criarReuniao()">
      <div>
        <label class="block text-xs text-zinc-500 mb-1">Pauta</label>
        <textarea id="reuniao-pauta" rows="3" placeholder="Descreva a pauta da reunião…" required></textarea>
      </div>
      <div>
        <label class="block text-xs text-zinc-500 mb-1">Participantes (marque quem chama — vazio usa o padrão)</label>
        ${seletor}
      </div>
      <div class="flex gap-2">
        <button type="submit" class="btn">${icone('plus')} Convocar</button>
      </div>
    </form>
  `;
}

export async function criarReuniao(): Promise<void> {
  const pauta = (document.getElementById('reuniao-pauta') as HTMLTextAreaElement)?.value.trim();
  if (!pauta) return;
  const participantes = agentesMarcados('reuniao-seletor-agentes');

  try {
    const res = await api<{ status?: string; id?: string }>('/meetings', {
      method: 'POST',
      body: JSON.stringify({ pauta, agentes: participantes.length ? participantes.join(',') : undefined }),
    });

    if (res.status === 'iniciado') {
      toast(`Reunião ${res.id ?? ''} iniciada em background — acompanhe na Sala ao vivo`, 'ok');
    }

    (document.getElementById('reuniao-pauta') as HTMLTextAreaElement)!.value = '';
    await carregarReunioesLista();
  } catch (e) {
    toast('Erro: ' + (e as Error).message, 'erro');
  }
}

interface MeetingInfo {
  id: string;
  status?: string;
  pauta?: string;
  participantes?: string[];
  criado_em?: string;
  encerrada_em?: string;
  ata?: string | null;
}

async function carregarReunioesLista(): Promise<void> {
  let reunioes: MeetingInfo[] | null;
  try {
    reunioes = await api<MeetingInfo[]>('/meetings');
  } catch {
    reunioes = null;
  }
  const el = document.getElementById('reunioes-lista');
  if (!el) return;

  if (!reunioes) {
    el.innerHTML = estadoErro('Não foi possível carregar as reuniões.', () => { void carregarReunioesLista(); });
    return;
  }

  if (!reunioes.length) {
    el.innerHTML = estadoVazio('reunioes', 'Nenhuma reunião', 'Convoque acima ou use: <code>opencorp meeting start --pauta "..."</code>');
    return;
  }

  el.innerHTML = reunioes.map(r => `
    <div class="card p-4">
      <div class="flex items-start justify-between gap-4">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            <span class="font-mono text-sm">${escapeHtml(String(r.id))}</span>
            <span class="badge ${r.status === 'em-andamento' ? 'badge-warn' : 'badge-neutral'}">${escapeHtml(String(r.status))}</span>
          </div>
          <div class="text-sm mb-1">${escapeHtml(String(r.pauta))}</div>
          <div class="text-xs text-zinc-500">Participantes: ${escapeHtml(((r.participantes as string[]) || []).join(', '))}</div>
          <div class="text-xs text-zinc-500 font-mono mt-1">início: ${escapeHtml(String(r.criado_em).slice(0, 19).replace('T', ' '))} ${r.encerrada_em ? '· fim: ' + escapeHtml(String(r.encerrada_em).slice(0, 19).replace('T', ' ')) : ''}</div>
          ${r.ata ? `<a class="text-xs inline-flex items-center gap-1 mt-1" href="/files?path=${encodeURIComponent(String(r.ata))}" target="_blank" rel="noopener">${icone('reunioes')} ver ata</a>` : ''}
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          ${r.status === 'em-andamento' ? `<button class="btn btn-ghost text-sm" onclick="abrirSalaViva('${escapeHtml(String(r.id))}')" aria-label="Abrir sala ao vivo">${icone('chat')} Sala ao vivo</button>` : ''}
          ${r.status === 'em-andamento' ? `<button class="btn btn-ghost text-sm" style="color:var(--err)" onclick="encerrarReuniao('${escapeHtml(String(r.id))}')" aria-label="Encerrar reunião">${icone('stop')} Encerrar</button>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

export async function encerrarReuniao(id: string): Promise<void> {
  const { modalConfirm } = await import("../modal.js");
  if (!(await modalConfirm(`Encerrar a reunião ${id}? Os turnos param entre falas e a ata é gerada.`, { confirmar: 'Encerrar' }))) return;
  try {
    await api(`/meetings/${encodeURIComponent(id)}/stop`, { method: 'POST' });
    toast('Interrupção solicitada — a sala encerra entre turnos', 'ok');
    await carregarReunioesLista();
    if (salaAbertaId === id) void pollSala();
  } catch (e) {
    toast('Erro: ' + (e as Error).message, 'erro');
  }
}

// ── Sala ao vivo (Etapa 6.4) — polling GET /meetings/:id a cada 2s ─────────

export async function abrirSalaViva(id: string): Promise<void> {
  salaAbertaId = id;
  pararPollingSala();
  const el = document.getElementById('reuniao-sala');
  if (!el) return;
  el.classList.remove('hidden');
  el.innerHTML = estadoCarregando('Abrindo sala…');
  await pollSala();
  pararPollingSala();
  timerSala = setInterval(() => { void pollSala(); }, 2000);
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function fecharSalaViva(): void {
  salaAbertaId = null;
  pararPollingSala();
  const el = document.getElementById('reuniao-sala');
  if (el) {
    el.classList.add('hidden');
    el.innerHTML = '';
  }
}

async function pollSala(): Promise<void> {
  const id = salaAbertaId;
  if (!id) return;
  const el = document.getElementById('reuniao-sala');
  if (!el) { fecharSalaViva(); return; }

  let estado: EstadoSala | null = null;
  try {
    estado = await api<EstadoSala>('/meetings/' + encodeURIComponent(id));
  } catch {
    estado = null;
  }

  if (salaAbertaId !== id) return; // painel fechado/trocado durante o fetch
  if (!estado) {
    pararPollingSala();
    el.innerHTML = estadoErro('Não foi possível carregar a sala (pode não ter existido ou falhar ao iniciar).', () => { void abrirSalaViva(id); })
      + `<div class="mt-3"><button class="btn btn-ghost text-sm" onclick="fecharSalaViva()">${icone('close')} Fechar painel</button></div>`;
    return;
  }
  renderSala(el, estado);
}

function renderSala(el: HTMLElement, estado: EstadoSala): void {
  const viva = estado.status === 'em_andamento' || estado.status === 'agendando';
  const badge = estado.status === 'em_andamento'
    ? '<span class="badge badge-warn">em andamento</span>'
    : estado.status === 'agendando'
      ? '<span class="badge badge-warn">agendando…</span>'
      : '<span class="badge badge-neutral">encerrada</span>';
  const consenso = estado.consenso;
  const consensoHtml = consenso.total > 0
    ? `<span class="badge ${consenso.pedidos >= consenso.total ? 'badge-ok' : 'badge-neutral'}" title="Participantes que sinalizaram [CONSENSO-ENCERRAR]" aria-label="Consenso">${icone('check')} ${consenso.pedidos}/${consenso.total} pediram encerrar</span>`
    : '';
  const participantes = estado.participantes.map(p => escapeHtml(p.id)).join(', ');
  const feed = estado.mensagens.length
    ? estado.mensagens.map(m => `
        <div class="border-b border-zinc-800/60 py-2 last:border-b-0">
          <div class="flex items-center gap-2 mb-0.5">
            <span class="font-mono text-xs font-semibold">${escapeHtml(m.agente)}</span>
            ${m.ts ? `<span class="text-xs text-zinc-600 font-mono">${escapeHtml(m.ts.slice(11, 19))}</span>` : ''}
          </div>
          <div class="text-sm whitespace-pre-wrap break-words">${escapeHtml(m.texto)}</div>
        </div>
      `).join('')
    : `<div class="text-sm text-zinc-500 py-3">Nenhuma fala ainda — os turnos aparecem aqui conforme os agentes respondem.</div>`;

  el.innerHTML = `
    <div class="flex items-start justify-between gap-4 mb-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2 mb-1 flex-wrap">
          <h3 class="font-semibold flex items-center gap-2">${icone('reunioes')} Sala ao vivo</h3>
          ${badge}
          ${consensoHtml}
        </div>
        <div class="text-sm mb-0.5"><span class="text-zinc-500">Pauta:</span> ${escapeHtml(estado.pauta)}</div>
        <div class="text-xs text-zinc-500">Participantes: ${participantes}</div>
        <div class="text-xs text-zinc-500 font-mono">turno: ${estado.turno_atual} · abertura: ${escapeHtml(formatarDataLocal(estado.iniciado_em))}</div>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        ${viva ? `<button class="btn btn-ghost text-sm" style="color:var(--err)" onclick="encerrarReuniao('${escapeHtml(estado.id)}')" aria-label="Encerrar reunião">${icone('stop')} Encerrar</button>` : ''}
        <button class="btn btn-ghost text-sm" onclick="fecharSalaViva()" aria-label="Fechar painel da sala">${icone('close')} Fechar painel</button>
      </div>
    </div>
    <div id="reuniao-sala-feed" class="border border-zinc-800 rounded p-3 max-h-96 overflow-y-auto scrollbar-thin">${feed}</div>
  `;

  const feedEl = document.getElementById('reuniao-sala-feed');
  if (feedEl) feedEl.scrollTop = feedEl.scrollHeight;
}

// ── Agendamento de reunião automática (Etapa 6.3) ──────────────────────────

function renderAgendaReuniaoForm(): void {
  const el = document.getElementById('reuniao-agenda-form');
  if (!el) return;

  el.innerHTML = `
    <h3 class="font-semibold mb-3 flex items-center gap-2">${icone('agenda')} Agendar reunião automática ${ajuda('reunioes')}</h3>
    <form id="form-agenda-reuniao" class="space-y-4" onsubmit="event.preventDefault(); criarAgendaReuniao()">
      <div>
        <label class="block text-xs text-zinc-500 mb-1">Pauta da reunião agendada</label>
        <input id="reuniao-ag-pauta" placeholder="Ex.: revisão semanal de custos" required />
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-xs text-zinc-500 mb-1">Frequência</label>
          <select id="reuniao-ag-freq" onchange="atualizarFrequenciaReuniao()">
            <option value="diario">Diária (hora fixa)</option>
            <option value="semanal">Semanal (segundas, hora fixa)</option>
            <option value="intervalo">Intervalo (minutos)</option>
          </select>
        </div>
        <div id="reuniao-ag-hora-container">
          <label class="block text-xs text-zinc-500 mb-1">Hora</label>
          <input id="reuniao-ag-hora" type="time" value="09:00" required />
        </div>
        <div id="reuniao-ag-valor-container" class="hidden">
          <label class="block text-xs text-zinc-500 mb-1">Intervalo (minutos)</label>
          <input id="reuniao-ag-valor" type="number" min="1" placeholder="Ex: 120" />
        </div>
      </div>
      <p class="text-xs text-zinc-500">Participantes: usa o check-list de agentes do form "Convocar" acima (vazio usa o padrão). A rotina roda <code class="font-mono">meeting iniciar --pauta "…" --nao-interativo</code> headless.</p>
      <div class="flex gap-2">
        <button type="submit" class="btn">${icone('agenda')} Agendar</button>
      </div>
    </form>
  `;
}

export function atualizarFrequenciaReuniao(): void {
  const freq = (document.getElementById('reuniao-ag-freq') as HTMLSelectElement)?.value;
  const hora = document.getElementById('reuniao-ag-hora-container');
  const valor = document.getElementById('reuniao-ag-valor-container');
  if (!hora || !valor) return;
  const porHora = freq === 'diario' || freq === 'semanal';
  hora.classList.toggle('hidden', !porHora);
  valor.classList.toggle('hidden', porHora);
}

export async function criarAgendaReuniao(): Promise<void> {
  const pauta = (document.getElementById('reuniao-ag-pauta') as HTMLInputElement)?.value.trim();
  const freq = (document.getElementById('reuniao-ag-freq') as HTMLSelectElement)?.value;
  if (!pauta || !freq) { toast('Preencha a pauta e a frequência para agendar a reunião', 'erro'); return; }

  let agenda_tipo = 'cron';
  let agenda_valor = '';
  if (freq === 'intervalo') {
    const valor = Number((document.getElementById('reuniao-ag-valor') as HTMLInputElement)?.value);
    if (!Number.isFinite(valor) || valor < 1) {
      toast('Informe o intervalo em minutos (≥ 1)', 'erro');
      return;
    }
    agenda_tipo = 'intervalo_min';
    agenda_valor = String(valor);
  } else {
    const hora = (document.getElementById('reuniao-ag-hora') as HTMLInputElement)?.value ?? '';
    const [h, m] = hora.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) {
      toast('Informe a hora da reunião', 'erro');
      return;
    }
    agenda_valor = `${m} ${h} * * ${freq === 'semanal' ? '1' : '*'}`;
  }

  // args como ARRAY: sem shell, a pauta com espaços chega intacta ao CLI headless
  const agentes = agentesMarcados('reuniao-seletor-agentes');
  const args = ['meeting', 'iniciar', '--pauta', pauta, '--nao-interativo'];
  if (agentes.length) args.push('--agentes', agentes.join(','));
  const nome = `reuniao-${pauta.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'auto'}-${Date.now().toString(36).slice(-4)}`;

  try {
    await api('/schedules', {
      method: 'POST',
      body: JSON.stringify({
        nome,
        agenda_tipo,
        agenda_valor,
        args,
        workspace: getWsAtivo() || undefined,
      }),
    });
    toast('Reunião agendada — veja na aba Agenda', 'ok');
    (document.getElementById('reuniao-ag-pauta') as HTMLInputElement)!.value = '';
    await carregarRotinasReuniao();
  } catch (e) {
    toast('Erro: ' + (e as Error).message, 'erro');
  }
}

async function carregarRotinasReuniao(): Promise<void> {
  const el = document.getElementById('reuniao-agenda-lista');
  if (!el) return;

  let jobs: AgendaJob[] | null;
  try {
    jobs = await q<AgendaJob[]>('/schedules');
  } catch {
    jobs = null;
  }

  if (!jobs) {
    el.innerHTML = estadoErro('Não foi possível carregar as rotinas de reunião.', () => { void carregarRotinasReuniao(); });
    return;
  }

  const rotinas = jobs.filter(j => Array.isArray(j.args) && j.args[0] === 'meeting');
  if (!rotinas.length) {
    el.innerHTML = '<p class="text-xs text-zinc-500">Nenhuma reunião automática agendada — gerencie todas as rotinas na aba <a href="#/agenda" class="underline">Agenda</a>.</p>';
    return;
  }

  el.innerHTML = `
    <h4 class="text-sm font-semibold text-zinc-400">Rotinas de reunião (${rotinas.length})</h4>
  ` + rotinas.map(j => `
    <div class="card p-3">
      <div class="flex items-start justify-between gap-4">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            <span class="font-medium text-sm">${escapeHtml(String(j.nome))}</span>
            <span class="badge ${badgeRotina(j)}">${escapeHtml(String(j.agenda?.tipo))}</span>
            <span class="badge ${j.ativo ? 'badge-ok' : 'badge-neutral'}">${j.ativo ? 'ativa' : 'pausada'}</span>
          </div>
          <div class="text-xs text-zinc-400 mb-1">${formatarAgenda(j)}</div>
          <div class="text-xs text-zinc-500 font-mono truncate">${escapeHtml((j.args as string[]).join(' '))}</div>
          ${j.proxima_exec ? `<div class="text-xs text-zinc-500 font-mono mt-1">próxima: ${escapeHtml(formatarDataLocal(String(j.proxima_exec)))}</div>` : ''}
        </div>
        <button class="btn btn-ghost text-sm flex-shrink-0" style="color:var(--err)" onclick="excluirRotinaReuniao('${escapeHtml(String(j.id))}')" aria-label="Excluir rotina">${icone('trash')} Excluir</button>
      </div>
    </div>
  `).join('');
}

function badgeRotina(j: AgendaJob): string {
  const tipo = String(j.agenda?.tipo);
  if (tipo === 'cron') return 'badge-pipeline';
  if (tipo === 'intervalo_min') return 'badge-review';
  return 'badge-warn';
}

export async function excluirRotinaReuniao(id: string): Promise<void> {
  const { modalConfirm } = await import("../modal.js");
  if (!(await modalConfirm('Excluir esta rotina de reunião?', { confirmar: 'Excluir' }))) return;
  try {
    await api('/schedules/' + encodeURIComponent(id), { method: 'DELETE' });
    toast('Rotina excluída', 'ok');
    await carregarRotinasReuniao();
  } catch (e) {
    toast('Erro: ' + (e as Error).message, 'erro');
  }
}
