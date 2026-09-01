/**
 * View Agentes — os "funcionários" da empresa (PLANO-WEB-CRUD C + PLANO-PAINEL-V2 Etapa 5).
 * Seções Ativos × Catálogo (desativados) + toggle por card + Semear catálogo +
 * Chamar (run) + Editar (drawer) + Criar (clone) + Excluir (guarda 409).
 */

import { api, toast, icone, escapeHtml } from "../api.js";
import { estadoVazio, estadoErro, estadoCarregando } from "../estado.js";
import { ajuda } from "../help.js";
import { fecharDrawer } from "../router.js";

interface AgenteResumoUi {
  id: string;
  role: string;
  category: string;
  model: string;
  permissions: string;
  budget_daily_usd: number;
  ativo?: boolean;
}

const badgeCategoria = (c: string): string =>
  c === 'ceo' ? 'badge-review' : c === 'secretario' ? 'badge-fanout' : c === 'operario' ? 'badge-pipeline' : 'badge-neutral';

const rotuloPermissao = (p: string): string =>
  p === 'level-1' ? 'só leitura' : p === 'level-2' ? 'bash local' : 'rede + HITL';

function cardAgente(a: AgenteResumoUi): string {
  const desativado = a.ativo === false;
  const sistema = a.id === 'secretario' || a.id === 'secretario-exec';
  return `
    <div class="card p-4 flex flex-col gap-2${desativado ? ' opacity-60' : ''}" data-agente-card="${escapeHtml(a.id)}">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="font-mono text-sm truncate" title="${escapeHtml(a.id)}">${escapeHtml(a.id)}</div>
          <div class="text-xs text-zinc-400 truncate">${escapeHtml(a.role || '—')}${sistema ? ' · <span class=\\"badge badge-pipeline\\">sistema</span>' : ''}</div>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          ${desativado
            ? '<span class="badge badge-neutral">desativado</span>'
            : `<span class="badge ${badgeCategoria(String(a.category))}">${escapeHtml(String(a.category || 'custom'))}</span>`}
          <label class="toggle" title="${sistema ? 'Agente de sistema — não pode ser desativado' : desativado ? 'Ativar agente' : 'Desativar agente'}">
            <input type="checkbox" data-toggle-agente="${escapeHtml(a.id)}" ${desativado ? '' : 'checked'} ${sistema ? 'disabled' : ''}
              onchange="toggleAgenteAtivo('${escapeHtml(a.id)}', this)" />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
      <div class="text-xs text-zinc-500 space-y-1 flex-1">
        <div class="truncate font-mono" title="${escapeHtml(a.model)}">${escapeHtml(a.model)}</div>
        <div>${escapeHtml(String(a.permissions))} · ${rotuloPermissao(String(a.permissions))}</div>
        <div>orçamento: US$ ${escapeHtml(Number(a.budget_daily_usd ?? 0).toFixed(2))}/dia</div>
      </div>
      <div class="flex items-center gap-2 pt-1 border-t border-zinc-800">
        <button class="btn btn-sm flex-1" onclick="chamarAgente('${escapeHtml(a.id)}')" title="Executar ordem">${icone('run')} Chamar</button>
        <button class="btn btn-ghost btn-sm" onclick="editarAgente('${escapeHtml(a.id)}')" title="Editar config">${icone('gear')}</button>
        <button class="btn btn-ghost btn-sm text-error" onclick="excluirAgente('${escapeHtml(a.id)}')" title="Excluir">${icone('trash')}</button>
      </div>
    </div>
  `;
}

/** Renderiza a view Agentes */
export async function renderAgentes(): Promise<void> {
  const viewEl = document.getElementById('view-agentes');
  if (!viewEl) return;

  if (!viewEl.innerHTML.trim()) {
    viewEl.innerHTML = `<div class="page-header"><div class="page-header-esq"><h1 class="page-header-titulo">${icone('teams')} Agentes</h1><p class="page-header-sub">Equipe da empresa</p></div></div>` + estadoCarregando();
  }

  let agentes: AgenteResumoUi[] | null;
  try {
    agentes = await api<AgenteResumoUi[]>('/agents');
  } catch {
    agentes = null;
  }

  if (!agentes) {
    viewEl.innerHTML = `<div class="page-header"><div class="page-header-esq"><h1 class="page-header-titulo">${icone('teams')} Agentes</h1><p class="page-header-sub">Equipe da empresa</p></div><div class="page-header-acoes"><span class="help-wrap">${ajuda('agentes')}</span></div></div>` +
      estadoErro('Não foi possível carregar os agentes.', () => { void renderAgentes(); });
    return;
  }

  viewEl.innerHTML = `
    <div class="page-header">
      <div class="page-header-esq">
        <h1 class="page-header-titulo">${icone('teams')} Agentes</h1>
        <p class="page-header-sub">Ativos e catálogo · habilite conforme a empresa</p>
      </div>
      <div class="page-header-acoes">
        <span class="help-wrap">${ajuda('agentes')}</span>
        <button class="btn btn-ghost" id="btn-semear-catalogo" onclick="semearCatalogoAgentes()" title="Adicionar agentes prontos do catálogo (vendas, marketing…)">${icone('plus')} Semear catálogo</button>
        <button class="btn" onclick="abrirFormAgente()">${icone('plus')} Novo agente</button>
      </div>
    </div>
    <div id="agente-form" class="mb-6"></div>
    <h2 class="text-sm font-semibold uppercase tracking-wide text-zinc-400 mb-3">Ativos</h2>
    <div id="agentes-ativos" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-8"></div>
    <h2 class="text-sm font-semibold uppercase tracking-wide text-zinc-400 mb-3">Catálogo (desativados)</h2>
    <div id="agentes-catalogo" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"></div>
  `;

  if (!agentes.length) {
    document.getElementById('agentes-ativos')!.innerHTML = estadoVazio('agentes', 'Nenhum agente nesta empresa', 'Todo workspace novo nasce com agentes do template (executor-padrao, secretario…). Crie variações com <strong>Novo agente</strong> ou use <strong>Semear catálogo</strong>.');
    document.getElementById('agentes-catalogo')!.innerHTML = '<div class="text-xs text-zinc-500 col-span-full">Catálogo vazio — use <strong>Semear catálogo</strong> para adicionar agentes prontos (vendas, marketing, financeiro, suporte, jurídico, ops).</div>';
    return;
  }

  const ativos = agentes.filter(a => a.ativo !== false);
  const desativados = agentes.filter(a => a.ativo === false);

  document.getElementById('agentes-ativos')!.innerHTML = ativos.length
    ? ativos.map(cardAgente).join('')
    : '<div class="text-xs text-zinc-500 col-span-full">Nenhum agente ativo — ative pelo toggle no catálogo abaixo.</div>';
  document.getElementById('agentes-catalogo')!.innerHTML = desativados.length
    ? desativados.map(cardAgente).join('')
    : '<div class="text-xs text-zinc-500 col-span-full">Todo o catálogo está ativo. Use <strong>Semear catálogo</strong> para adicionar agentes prontos de áreas (vendas, marketing, financeiro, suporte, jurídico, ops).</div>';
}

/** Etapa 5 — ativa/desativa agente (PUT /agents/:id {ativo}); idempotente e com loading no próprio toggle */
export async function toggleAgenteAtivo(id: string, input: HTMLInputElement): Promise<void> {
  const ativo = input.checked;
  input.disabled = true;
  try {
    await api('/agents/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify({ ativo }) });
    toast(`Agente "${id}" ${ativo ? 'ativado' : 'desativado'}`, 'ok');
    renderAgentes();
  } catch (e) {
    input.checked = ativo;
    toast('Erro: ' + (e as Error).message, 'erro');
  } finally {
    input.disabled = false;
  }
}

/** Etapa 5 — semeia o catálogo no workspace (POST /agents/semear-catalogo, idempotente) */
export async function semearCatalogoAgentes(): Promise<void> {
  const btn = document.getElementById('btn-semear-catalogo') as HTMLButtonElement | null;
  if (btn) btn.disabled = true;
  try {
    const r = await api<{ criados: string[]; existentes: string[] }>('/agents/semear-catalogo', { method: 'POST' });
    toast(`Catálogo semeado: ${r.criados.length} criado(s), ${r.existentes.length} já existente(s)`, 'ok');
    renderAgentes();
  } catch (e) {
    toast('Erro: ' + (e as Error).message, 'erro');
  } finally {
    if (btn) btn.disabled = false;
  }
}

/** Chama um agente com ordem digitada (POST /agents/:id/run) */
export async function chamarAgente(id: string): Promise<void> {
  const { modalPrompt } = await import("../modal.js");
  const ordem = await modalPrompt({
    titulo: 'Chamar ' + id,
    label: 'Ordem para o agente:',
    multiline: true,
    obrigatorio: true,
  });
  if (!ordem) return;
  try {
    await api('/agents/' + encodeURIComponent(id) + '/run', { method: 'POST', body: JSON.stringify({ ordem }) });
    toast(`"${id}" executando — acompanhe no Histórico`, 'ok');
  } catch (e) {
    toast('Erro: ' + (e as Error).message, 'erro');
  }
}

/** Drawer com form de edição (model, permissões, orçamento, tools) — PUT /agents/:id */
export async function editarAgente(id: string): Promise<void> {
  let a: Record<string, unknown> | null = null;
  try {
    a = await api<Record<string, unknown>>('/agents/' + encodeURIComponent(id));
  } catch {
    a = null;
  }
  if (!a) { toast('Não foi possível carregar o agente ' + id, 'erro'); return; }

  const { abrirDrawer } = await import("../router.js");
  await abrirDrawer(id, 'Agente: ' + id);

  const contentEl = document.getElementById('drawer-content');
  if (!contentEl) return;
  const budget = (a.budget as { daily_usd?: number; max_turns?: number }) || {};

  contentEl.innerHTML = `
    <div class="space-y-4">
      <div class="task-detail-field"><span class="task-detail-label">ID</span><span class="task-detail-value mono">${escapeHtml(id)}</span></div>
      <div class="task-detail-field"><span class="task-detail-label">Papel (role)</span><input id="ag-role" class="task-detail-value" value="${escapeHtml(String(a.role ?? ''))}"/></div>
      <div class="task-detail-field"><span class="task-detail-label">Modelo</span><input id="ag-model" class="task-detail-value" value="${escapeHtml(String(a.model ?? ''))}" placeholder="provider/model"/></div>
      <div class="task-detail-field"><span class="task-detail-label">Permissões</span>
        <select id="ag-permissions" class="task-detail-value">
          <option value="level-1" ${a.permissions === 'level-1' ? 'selected' : ''}>level-1 — só leitura</option>
          <option value="level-2" ${a.permissions === 'level-2' ? 'selected' : ''}>level-2 — bash local</option>
          <option value="level-3" ${a.permissions === 'level-3' ? 'selected' : ''}>level-3 — rede + HITL</option>
        </select>
      </div>
      <div class="task-detail-field"><span class="task-detail-label">Tools (vírgula)</span><input id="ag-tools" class="task-detail-value" value="${escapeHtml(((a.tools as string[]) || []).join(', '))}"/></div>
      <div class="task-detail-field"><span class="task-detail-label">Orçamento diário (US$)</span><input id="ag-budget" type="number" step="0.01" min="0" class="task-detail-value" value="${escapeHtml(String(budget.daily_usd ?? 0))}"/></div>
      <div class="task-detail-field"><span class="task-detail-label">Máx. turnos</span><input id="ag-turns" type="number" min="1" class="task-detail-value" value="${escapeHtml(String(budget.max_turns ?? 20))}"/></div>
      <div class="flex gap-2 justify-end border-t border-zinc-800 pt-3">
        <button class="btn" onclick="salvarAgente('${escapeHtml(id)}')">${icone('check')} Salvar</button>
      </div>
      <div class="text-xs text-zinc-500">O prompt do agente não é editado aqui — use <code>opencorp agent edit ${escapeHtml(id)}</code>.</div>
    </div>
  `;
}

/** Salva a edição (PUT /agents/:id) */
export async function salvarAgente(id: string): Promise<void> {
  const role = (document.getElementById('ag-role') as HTMLInputElement)?.value.trim();
  const model = (document.getElementById('ag-model') as HTMLInputElement)?.value.trim();
  const permissions = (document.getElementById('ag-permissions') as HTMLSelectElement)?.value;
  const tools = ((document.getElementById('ag-tools') as HTMLInputElement)?.value ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const daily = Number((document.getElementById('ag-budget') as HTMLInputElement)?.value ?? 0);
  const turns = Number((document.getElementById('ag-turns') as HTMLInputElement)?.value ?? 20);

  try {
    await api('/agents/' + encodeURIComponent(id), {
      method: 'PUT',
      body: JSON.stringify({ role, model, permissions, tools, budget_daily_usd: daily, budget_max_turns: turns }),
    });
    toast(`Agente "${id}" salvo`, 'ok');
    fecharDrawer();
    renderAgentes();
  } catch (e) {
    toast('Erro ao salvar: ' + (e as Error).message, 'erro');
  }
}

/** Cria agente clonando uma base (POST /agents {id, from, model}) */
export function abrirFormAgente(): void {
  const el = document.getElementById('agente-form');
  if (!el) return;

  el.innerHTML = `
    <div class="card p-4">
      <h3 class="font-semibold mb-3 flex items-center gap-2">${icone('plus')} Novo agente (clone de base) ${ajuda('agentes')}</h3>
      <form id="form-novo-agente" class="space-y-4" onsubmit="event.preventDefault(); criarAgente()">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label class="block text-xs text-zinc-500 mb-1">ID (kebab-case)</label>
            <input id="novo-agente-id" required placeholder="ex: editor-noturno" pattern="[a-z0-9]+(-[a-z0-9]+)*" />
          </div>
          <div>
            <label class="block text-xs text-zinc-500 mb-1">Clonar de</label>
            <input id="novo-agente-from" value="executor-padrao" placeholder="id do agente base" />
            <p class="text-xs text-zinc-500 mt-1">O clone <strong>herda o estado ativo/desativado</strong> do base — catálogo (ex.: agente-vendas) nasce desativado; ative com o toggle depois.</p>
          </div>
          <div>
            <label class="block text-xs text-zinc-500 mb-1">Modelo (opcional)</label>
            <input id="novo-agente-model" placeholder="provider/model" />
          </div>
        </div>
        <div class="flex gap-2">
          <button type="submit" class="btn">${icone('plus')} Criar agente</button>
          <button type="button" class="btn btn-ghost" onclick="fecharFormAgente()">Cancelar</button>
        </div>
      </form>
    </div>
  `;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function fecharFormAgente(): void {
  const el = document.getElementById('agente-form');
  if (el) el.innerHTML = '';
}

export async function criarAgente(): Promise<void> {
  const id = (document.getElementById('novo-agente-id') as HTMLInputElement)?.value.trim();
  const from = (document.getElementById('novo-agente-from') as HTMLInputElement)?.value.trim() || 'executor-padrao';
  const model = (document.getElementById('novo-agente-model') as HTMLInputElement)?.value.trim();
  if (!id) return;

  try {
    await api('/agents', { method: 'POST', body: JSON.stringify({ id, from, model: model || undefined }) });
    toast(`Agente "${id}" criado (clone de ${from}) — ajuste o prompt com agent edit`, 'ok');
    fecharFormAgente();
    renderAgentes();
  } catch (e) {
    toast('Erro ao criar: ' + (e as Error).message, 'erro');
  }
}

/** Exclui agente — a API bloqueia com 409 se citado em teams/flows/tasks */
export async function excluirAgente(id: string): Promise<void> {
  const { modalConfirm } = await import("../modal.js");
  if (!(await modalConfirm(`Excluir o agente "${escapeHtml(id)}"? O arquivo .md e a cópia do OpenCode são removidos.`, { titulo: 'Excluir agente', confirmar: 'Excluir' }))) return;

  try {
    await api('/agents/' + encodeURIComponent(id), { method: 'DELETE' });
    toast('Agente excluído', 'ok');
    renderAgentes();
  } catch (e) {
    const erro = e as Error & { status?: number };
    toast(erro.message || 'Erro ao excluir', 'erro');
  }
}
