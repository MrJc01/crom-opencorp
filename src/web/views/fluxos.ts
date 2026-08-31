/**
 * View Fluxos — listagem, CRIAÇÃO (POST /flows), execução e detalhes.
 */

import { api, q, toast, icone, escapeHtml } from "../api.js";
import { estadoVazio, estadoErro, estadoCarregando } from "../estado.js";
import { ajuda } from "../help.js";
import { getWsAtivo } from "../state.js";
import type { FlowInfo } from "../state.js";

export async function renderFluxos(): Promise<void> {
  const viewEl = document.getElementById('view-fluxos');
  if (!viewEl) return;

  if (!viewEl.innerHTML.trim()) {
    viewEl.innerHTML = `<h1 class="text-2xl font-bold flex items-center gap-2 mb-6">${icone('fluxos')} Fluxos</h1>` + estadoCarregando();
  }

  viewEl.innerHTML = `
    <div class="flex items-center justify-between mb-6 gap-2">
      <h1 class="text-2xl font-bold flex items-center gap-2">${icone('fluxos')} Fluxos ${ajuda('flows')}</h1>
      <div class="flex items-center gap-1 rounded-lg border border-zinc-700 p-1" role="group" aria-label="Novo fluxo por template">
        <button class="btn text-xs" onclick="abrirFormFlow('pipeline')">${icone('plus')} Pipeline</button>
        <button class="btn btn-ghost text-xs" onclick="abrirFormFlow('fanout')">${icone('plus')} Fanout</button>
        <button class="btn btn-ghost text-xs" onclick="abrirFormFlow('review')">${icone('plus')} Review</button>
        <button class="btn btn-ghost text-xs" onclick="abrirFormFlow('debate')">${icone('plus')} Debate</button>
      </div>
    </div>
    <div id="flow-form" class="mb-6"></div>
    <div id="times-legados" class="mb-6"></div>
    <div id="fluxos-lista" class="space-y-4"></div>
  `;

  await carregarTimesLegados();
  await carregarFluxosLista();
}

/** ── Times legados (fusão team×fluxo, PLANO-WEB-CRUD F4) ── */
interface TeamLegado { id: string; titulo: string; padrao: string; passos: number }

async function carregarTimesLegados(): Promise<void> {
  const el = document.getElementById('times-legados');
  if (!el) return;
  let teams: TeamLegado[] = [];
  try {
    teams = await api<TeamLegado[]>('/teams');
  } catch {
    teams = [];
  }
  if (!teams.length) { el.innerHTML = ''; return; }

  el.innerHTML = `
    <div class="card p-4 border-dashed">
      <div class="flex items-center justify-between gap-4 flex-wrap">
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold flex items-center gap-2">${icone('teams')} Times legados (${teams.length}) ${ajuda('teams')}</h3>
          <p class="text-xs text-zinc-500 mt-1">Times e fluxos são o mesmo motor agora — migre para editar e acompanhar como fluxo (o arquivo original fica preservado).</p>
        </div>
        <button class="btn" onclick="migrarTeams()">${icone('check')} Migrar todos para fluxos</button>
      </div>
      <div class="mt-3 space-y-2">
        ${teams.map(t => `
          <div class="flex items-center justify-between gap-2 text-sm border border-zinc-800 rounded p-2">
            <span class="font-mono text-xs">${escapeHtml(t.id)} <span class="text-zinc-500">· ${escapeHtml(t.padrao)} · ${t.passos} passo(s)</span></span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/** Migra todos os teams legados para flows (POST /flows/migrate-teams) */
export async function migrarTeams(): Promise<void> {
  try {
    const res = await api<{ criados: string[]; pulados: Array<{ id: string; motivo: string }> }>('/flows/migrate-teams', { method: 'POST' });
    const partes: string[] = [];
    if (res.criados.length) partes.push(`${res.criados.length} migrado(s): ${res.criados.join(', ')}`);
    if (res.pulados.length) partes.push(`${res.pulados.length} pulado(s) (${res.pulados.map(p => p.id).join(', ')})`);
    toast(partes.length ? partes.join(' · ') : 'Nada a migrar', res.criados.length ? 'ok' : 'aviso');
    await carregarTimesLegados();
    await carregarFluxosLista();
  } catch (e) {
    toast('Erro ao migrar: ' + (e as Error).message, 'erro');
  }
}


interface NoFlowUi {
  tipo: 'agente' | 'task_create' | 'registro' | 'saida';
  agente: string;
  ordem: string;
  titulo: string;
  categoria: string;
}

interface AgenteInfo {
  id: string;
}

let agentesCache: AgenteInfo[] = [];

async function carregarFluxosLista(): Promise<void> {
  let flows: FlowInfo[] | null;
  try {
    flows = await api<FlowInfo[]>('/flows');
  } catch {
    flows = null;
  }
  const el = document.getElementById('fluxos-lista');
  if (!el) return;

  if (!flows) {
    el.innerHTML = estadoErro('Não foi possível carregar os fluxos.', () => { void carregarFluxosLista(); });
    return;
  }

  if (!flows.length) {
    el.innerHTML = estadoVazio('fluxos', 'Nenhum fluxo', 'Escolha um template acima (Pipeline, Fanout, Review ou Debate), ou use <code>opencorp flow create &lt;id&gt; --nome "..."</code>');
    return;
  }

  el.innerHTML = flows.map(f => `
    <div class="card p-4">
      <div class="flex items-center justify-between gap-4">
        <div class="flex-1 min-w-0">
          <div class="font-mono text-sm">${escapeHtml(String(f.id))}</div>
          ${f.nome ? '<div class="text-xs text-zinc-400 mt-1">' + escapeHtml(String(f.nome)) + '</div>' : ''}
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <button class="btn btn-ghost text-sm" onclick="executarFlow('${escapeHtml(String(f.id))}')" aria-label="Executar">${icone('run')} Executar</button>
          <button class="btn btn-ghost text-sm" onclick="detalhesFlow('${escapeHtml(String(f.id))}')" aria-label="Detalhes">${icone('chat')} Detalhes</button>
          <button class="btn btn-ghost text-sm" onclick="editarFlow('${escapeHtml(String(f.id))}')" aria-label="Editar">${icone('gear')} Editar</button>
          <button class="btn btn-ghost text-sm" style="color:var(--err)" onclick="excluirFlow('${escapeHtml(String(f.id))}')" aria-label="Excluir">${icone('trash')}</button>
        </div>
      </div>
    </div>
  `).join('');
}

/** Flow em edição no form (null = criação) */
let flowEmEdicao: string | null = null;

/** Tipos que o form linear suporta editar */
const TIPOS_EDITAVEIS = new Set(['manual', 'agente', 'task_create', 'registro', 'saida']);

/** Abre o form de edição pré-preenchido (PUT /flows/:id) — só fluxos lineares.
 *  Fluxo com condicao/decisao/webhook → avisa para usar `opencorp flow edit` (sem perder grafo). */
export async function editarFlow(id: string): Promise<void> {
  interface FlowBruto {
    nome?: string;
    nos: Array<{ id: string; tipo: string; config: Record<string, unknown> }>;
    arestas: Array<{ de: string; para: string }>;
  }
  let flow: FlowBruto | null = null;
  try {
    flow = await api<FlowBruto>('/flows/' + encodeURIComponent(id));
  } catch {
    flow = null;
  }
  if (!flow) { toast('Não foi possível carregar o fluxo ' + id, 'erro'); return; }

  const nos = flow.nos ?? [];
  const editavel = nos.every(n => TIPOS_EDITAVEIS.has(String(n.tipo)));
  if (!editavel) {
    const { modalConfirm } = await import("../modal.js");
    await modalConfirm(
      `O fluxo "${id}" tem nós avançados (condição/decisão/webhook) que este editor simples não edita sem risco de perder o grafo. Edite via <code>opencorp flow edit ${escapeHtml(id)}</code> (abre o JSON com validação).`,
      { titulo: 'Editor simples não suporta este fluxo', confirmar: 'Entendi' },
    );
    return;
  }

  flowEmEdicao = id;
  const el = document.getElementById('flow-form');
  if (!el) return;

  el.innerHTML = `
    <div class="card p-4">
      <h3 class="font-semibold mb-3 flex items-center gap-2">${icone('gear')} Editar fluxo <span class="font-mono text-xs text-zinc-500">${escapeHtml(id)}</span></h3>
      <form id="form-novo-flow" class="space-y-4" onsubmit="event.preventDefault(); window.__submitFlowForm()">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs text-zinc-500 mb-1">ID (fixo)</label>
            <input id="flow-id" required value="${escapeHtml(id)}" readonly class="opacity-60" />
          </div>
          <div>
            <label class="block text-xs text-zinc-500 mb-1">Nome</label>
            <input id="flow-nome" required value="${escapeHtml(String(flow.nome ?? id))}" />
          </div>
        </div>
        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="text-xs text-zinc-500">Passos (executam em sequência após o gatilho manual)</label>
            <button type="button" class="btn btn-ghost text-xs" onclick="addPassoFlow()">${icone('plus')} passo</button>
          </div>
          <div id="flow-passos" class="space-y-3"></div>
        </div>
        <div class="flex gap-2">
          <button type="submit" class="btn">${icone('check')} Salvar fluxo</button>
          <button type="button" class="btn btn-ghost" onclick="fecharFormFlow()">Cancelar</button>
        </div>
      </form>
    </div>
  `;

  // reconstrói os passos na ordem da aresta (gatilho → passo1 → passo2…)
  const porId = new Map(nos.map(n => [String(n.id), n]));
  const sequencia: Array<{ id: string; tipo: string; config: Record<string, unknown> }> = [];
  let atual = flow.arestas.find(a => a.de === 'gatilho');
  const vistos = new Set<string>();
  while (atual && !vistos.has(atual.para)) {
    vistos.add(atual.para);
    const no = porId.get(atual.para);
    if (!no) break;
    sequencia.push(no);
    atual = flow.arestas.find(a => a.de === atual!.para);
  }

  const container = document.getElementById('flow-passos');
  if (container) container.innerHTML = '';
  if (!sequencia.length) addPassoFlow();
  for (const no of sequencia) {
    addPassoFlow();
    const linha = container?.lastElementChild as HTMLElement | undefined;
    if (!linha) continue;
    const sel = linha.querySelector('select') as HTMLSelectElement | null;
    if (sel) {
      sel.value = no.tipo;
      ((window as unknown as Record<string, unknown>).__flowTipo as (s: HTMLSelectElement) => void)(sel);
    }
    const config = no.config ?? {};
    const setVal = (cls: string, v: unknown): void => {
      const campo = linha.querySelector(cls) as HTMLInputElement | HTMLSelectElement | null;
      if (campo && v !== undefined && v !== null) campo.value = String(v);
    };
    setVal('.flow-agente', config.agente);
    setVal('.flow-ordem', config.ordem);
    setVal('.flow-titulo', config.titulo);
    setVal('.flow-categoria', config.registro ?? config.categoria);
  }

  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/** Salva a edição (PUT /flows/:id) — reutiliza a coleta de passos da criação */
export async function salvarEdicaoFlow(id: string): Promise<void> {
  const nome = (document.getElementById('flow-nome') as HTMLInputElement)?.value.trim();
  if (!nome) return;

  const grafo = coletarGrafoForm();
  if (!grafo) return; // toast de erro já disparado

  try {
    await api('/flows/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify({ id, nome, ...grafo }) });
    toast(`Fluxo "${id}" salvo`, 'ok');
    fecharFormFlow();
    await carregarFluxosLista();
  } catch (e) {
    toast('Erro ao salvar fluxo: ' + (e as Error).message, 'erro');
  }
}

/** Exclui um fluxo (com confirmação) */
export async function excluirFlow(id: string): Promise<void> {
  const { modalConfirm } = await import("../modal.js");
  if (!(await modalConfirm(`Excluir o fluxo "${escapeHtml(id)}"? Execuções passadas continuam no Histórico.`, { titulo: 'Excluir fluxo', confirmar: 'Excluir' }))) return;
  try {
    await api('/flows/' + encodeURIComponent(id), { method: 'DELETE' });
    toast('Fluxo excluído', 'ok');
    await carregarFluxosLista();
  } catch (e) {
    toast('Erro ao excluir: ' + (e as Error).message, 'erro');
  }
}

/** Template do form de criação (fusão team×fluxo — F4) */
export type TemplateFlow = 'pipeline' | 'fanout' | 'review' | 'debate';
let templateFlow: TemplateFlow = 'pipeline';

/** Abre o form de criação por template (gatilho manual + grafo correspondente) */
export function abrirFormFlow(template: TemplateFlow = 'pipeline'): void {
  flowEmEdicao = null;
  templateFlow = template;
  const el = document.getElementById('flow-form');
  if (!el) return;

  const seletor = `
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label class="block text-xs text-zinc-500 mb-1">ID (kebab-case)</label>
        <input id="flow-id" required placeholder="ex: ciclo-publicacao" pattern="[a-z0-9]+(-[a-z0-9]+)*" />
      </div>
      <div>
        <label class="block text-xs text-zinc-500 mb-1">Nome</label>
        <input id="flow-nome" required placeholder="ex: Ciclo de publicação" />
      </div>
    </div>
  `;

  const linhaPassoTeam = (rotulo: string, classe = 'flow-team-passo'): string => `
    <div class="border border-zinc-800 rounded p-3 space-y-2 ${classe}">
      <div class="flex items-center gap-2">
        <span class="text-xs text-zinc-500">${rotulo}</span>
        <button type="button" class="btn-ghost text-xs ml-auto" onclick="this.closest('.${classe}').remove()" title="Remover">✕</button>
      </div>
      <input class="ft-agente" placeholder="id do agente" />
      <input class="ft-ordem" placeholder="ordem (aceita {{entrada}})" />
    </div>
  `;

  let camposTemplate = '';
  if (template === 'pipeline') {
    camposTemplate = `
      <div class="flex items-center justify-between mb-2">
        <label class="text-xs text-zinc-500">Passos (executam em sequência após o gatilho manual)</label>
        <button type="button" class="btn btn-ghost text-xs" onclick="addPassoFlow()">${icone('plus')} passo</button>
      </div>
      <div id="flow-passos" class="space-y-3"></div>
    `;
  } else if (template === 'fanout') {
    camposTemplate = `
      <div class="flex items-center justify-between mb-2">
        <label class="text-xs text-zinc-500">Agentes em paralelo (2+)</label>
        <button type="button" class="btn btn-ghost text-xs" onclick="addPassoTemplate('ft-paralelos')">${icone('plus')} agente</button>
      </div>
      <div id="ft-paralelos" class="space-y-3">${linhaPassoTeam('paralelo 1')}${linhaPassoTeam('paralelo 2')}</div>
      <label class="text-xs text-zinc-500 block mt-3 mb-1">Síntese final (opcional — agrega as saídas)</label>
      ${linhaPassoTeam('síntese', 'ft-sintese flow-team-passo')}
    `;
  } else if (template === 'review') {
    camposTemplate = `
      <label class="text-xs text-zinc-500 block mb-1">Executor (faz)</label>${linhaPassoTeam('executor', 'ft-executor flow-team-passo')}
      <label class="text-xs text-zinc-500 block mb-1 mt-3">Revisor (aprova com "APROVADO" ou pede "AJUSTES: ...")</label>${linhaPassoTeam('revisor', 'ft-revisor flow-team-passo')}
      <div class="w-40 mt-3">
        <label class="block text-xs text-zinc-500 mb-1">Turnos máximos (1-5)</label>
        <input id="ft-turnos" type="number" min="1" max="5" value="2" />
      </div>
    `;
  } else {
    camposTemplate = `
      <div class="flex items-center justify-between mb-2">
        <label class="text-xs text-zinc-500">Proponentes (2+)</label>
        <button type="button" class="btn btn-ghost text-xs" onclick="addPassoTemplate('ft-proponentes')">${icone('plus')} proponente</button>
      </div>
      <div id="ft-proponentes" class="space-y-3">${linhaPassoTeam('proponente 1')}${linhaPassoTeam('proponente 2')}</div>
      <label class="text-xs text-zinc-500 block mb-1 mt-3">Moderador (decide com "DECISÃO: ...")</label>
      <input id="ft-moderador" placeholder="id do agente moderador (ex: secretario)" />
    `;
  }

  el.innerHTML = `
    <div class="card p-4">
      <h3 class="font-semibold mb-3 flex items-center gap-2">${icone('plus')} Novo fluxo <span class="badge badge-pipeline">${template}</span> ${ajuda('flows')}</h3>
      <form id="form-novo-flow" class="space-y-4" onsubmit="event.preventDefault(); criarFlow()">
        ${seletor}
        <div id="flow-campos-template" class="space-y-3">${camposTemplate}</div>
        <div class="flex gap-2">
          <button type="submit" class="btn">${icone('plus')} Criar fluxo</button>
          <button type="button" class="btn btn-ghost" onclick="fecharFormFlow()">Cancelar</button>
        </div>
      </form>
    </div>
  `;
  if (template === 'pipeline') addPassoFlow();
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/** Submit do form (criação OU edição) — global: flowEmEdicao é estado de módulo,
 *  invisível para handlers inline (achado da auditoria #1) */
(window as unknown as Record<string, unknown>).__submitFlowForm = (): void => {
  if (flowEmEdicao) void salvarEdicaoFlow(flowEmEdicao);
  else void criarFlow();
};

/** Adiciona um passo {agente, ordem} às listas dos templates de coordenação */
export function addPassoTemplate(containerId: string): void {
  const container = document.getElementById(containerId);
  if (!container) return;
  const linha = document.createElement('div');
  linha.className = 'border border-zinc-800 rounded p-3 space-y-2 flow-team-passo';
  linha.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="text-xs text-zinc-500">${container.childElementCount + 1}</span>
      <button type="button" class="btn-ghost text-xs ml-auto" onclick="this.closest('.flow-team-passo').remove()" title="Remover">✕</button>
    </div>
    <input class="ft-agente" placeholder="id do agente" />
    <input class="ft-ordem" placeholder="ordem (aceita {{entrada}})" />
  `;
  container.appendChild(linha);
}

/** Lê linhas {agente, ordem} de um contêiner (templates fanout/debate/pipeline-team) */
const passosTemplateDe = (id: string): Array<{ agente: string; ordem: string }> =>
  Array.from(document.querySelectorAll<HTMLElement>(`#${id} .flow-team-passo`))
    .map(linha => ({
      agente: (linha.querySelector('.ft-agente') as HTMLInputElement)?.value.trim() ?? '',
      ordem: (linha.querySelector('.ft-ordem') as HTMLInputElement)?.value.trim() ?? 'Contribua com a entrada.',
    }))
    .filter(p => p.agente);

const passoUnicoDe = (classe: string): { agente: string; ordem: string } | null => {
  const linha = document.querySelector(`.${classe}`);
  if (!linha) return null;
  const agente = (linha.querySelector('.ft-agente') as HTMLInputElement)?.value.trim() ?? '';
  if (!agente) return null;
  return { agente, ordem: (linha.querySelector('.ft-ordem') as HTMLInputElement)?.value.trim() || 'Contribua com a entrada.' };
};

export function fecharFormFlow(): void {
  flowEmEdicao = null;
  const el = document.getElementById('flow-form');
  if (el) el.innerHTML = '';
}

/** Adiciona uma linha de passo ao form */
export function addPassoFlow(): void {
  const container = document.getElementById('flow-passos');
  if (!container) return;
  const idx = container.childElementCount;

  const linha = document.createElement('div');
  linha.className = 'border border-zinc-800 rounded p-3 space-y-2 flow-passo';
  linha.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="text-xs text-zinc-500 font-mono">#${idx + 1}</span>
      <select class="text-xs w-auto" onchange="window.__flowTipo(this)">
        <option value="agente">agente (executa ordem)</option>
        <option value="task_create">task (cria no board)</option>
        <option value="registro">registro (grava documento)</option>
        <option value="saida">saída (grava + encerra)</option>
      </select>
      <button type="button" class="btn-ghost text-xs ml-auto" onclick="this.closest('.flow-passo').remove()" title="Remover passo">✕</button>
    </div>
    <div class="flow-campos grid grid-cols-1 sm:grid-cols-2 gap-2"></div>
  `;
  container.appendChild(linha);
  atualizarCamposPasso(linha, 'agente');
}

function atualizarCamposPasso(linha: HTMLElement, tipo: string): void {
  const campos = linha.querySelector('.flow-campos') as HTMLElement;
  if (!campos) return;
  const agentes = agentesCache;
  const selectAgentes = agentes.length
    ? `<select class="flow-agente"><option value="">— agente —</option>${agentes.map((a: AgenteInfo) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.id)}</option>`).join('')}</select>`
    : `<input class="flow-agente" placeholder="id do agente (ex: editor)" />`;

  if (tipo === 'agente') {
    campos.innerHTML = `${selectAgentes}<input class="flow-ordem" placeholder="ordem para o agente (aceita {{entrada}})" />`;
  } else if (tipo === 'task_create') {
    campos.innerHTML = `<input class="flow-titulo sm:col-span-2" placeholder="título da task" />`;
  } else {
    campos.innerHTML = `<input class="flow-categoria" placeholder="categoria do registro (ex: documentos)" />`;
  }
}

(window as unknown as Record<string, unknown>).__flowTipo = (sel: HTMLSelectElement) => {
  const linha = sel.closest('.flow-passo') as HTMLElement;
  atualizarCamposPasso(linha, sel.value);
};

/** Coleta os passos do DOM (ordem visual = ordem de execução) → {nos, arestas}.
 *  Retorna null (com toast) se algum passo estiver inválido. */
function coletarGrafoForm(): { nos: Array<{ id: string; tipo: string; config: Record<string, string> }>; arestas: Array<{ de: string; para: string }> } | null {
  const nos: Array<{ id: string; tipo: string; config: Record<string, string> }> = [
    { id: 'gatilho', tipo: 'manual', config: {} },
  ];
  const arestas: Array<{ de: string; para: string }> = [];
  const linhas = Array.from(document.querySelectorAll<HTMLElement>('#flow-passos .flow-passo'));
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    const tipo = (linha.querySelector('select') as HTMLSelectElement)?.value ?? 'agente';
    const noId = `passo-${i + 1}`;
    const config: Record<string, string> = {};
    if (tipo === 'agente') {
      const agente = (linha.querySelector('.flow-agente') as HTMLInputElement)?.value.trim() ?? '';
      const ordem = (linha.querySelector('.flow-ordem') as HTMLInputElement)?.value.trim() ?? '';
      if (!agente || !ordem) {
        toast(`Passo #${i + 1}: agente e ordem são obrigatórios`, 'erro');
        return null;
      }
      config.agente = agente;
      config.ordem = ordem;
    } else if (tipo === 'task_create') {
      const titulo = (linha.querySelector('.flow-titulo') as HTMLInputElement)?.value.trim() ?? '';
      if (!titulo) {
        toast(`Passo #${i + 1}: título da task é obrigatório`, 'erro');
        return null;
      }
      config.titulo = titulo;
    } else {
      const categoria = (linha.querySelector('.flow-categoria') as HTMLInputElement)?.value.trim() ?? '';
      if (!categoria) {
        toast(`Passo #${i + 1}: categoria é obrigatória`, 'erro');
        return null;
      }
      if (tipo === 'saida') config.registro = categoria.includes('/') ? categoria : `documentos/${categoria}`;
      else config.categoria = categoria;
    }
    nos.push({ id: noId, tipo, config });
    arestas.push({ de: i === 0 ? 'gatilho' : `passo-${i}`, para: noId });
  }
  return { nos, arestas };
}

export async function criarFlow(): Promise<void> {
  const id = (document.getElementById('flow-id') as HTMLInputElement)?.value.trim();
  const nome = (document.getElementById('flow-nome') as HTMLInputElement)?.value.trim();
  if (!id || !nome) return;

  let grafo: { nos: Array<{ id: string; tipo: string; config: Record<string, unknown> }>; arestas: Array<{ de: string; para: string }> } | null = null;

  if (templateFlow === 'pipeline') {
    grafo = coletarGrafoForm();
    if (!grafo) return;
  } else if (templateFlow === 'fanout') {
    const paralelos = passosTemplateDe('ft-paralelos');
    if (paralelos.length < 2) { toast('Fanout precisa de 2+ agentes em paralelo', 'erro'); return; }
    const sintese = passoUnicoDe('ft-sintese');
    grafo = {
      nos: [
        { id: 'gatilho', tipo: 'manual', config: {} },
        { id: 'fanout', tipo: 'fanout', config: { paralelos, ...(sintese ? { sintese } : {}) } },
      ],
      arestas: [{ de: 'gatilho', para: 'fanout' }],
    };
  } else if (templateFlow === 'review') {
    const executor = passoUnicoDe('ft-executor');
    const revisor = passoUnicoDe('ft-revisor');
    if (!executor || !revisor) { toast('Review precisa de executor e revisor', 'erro'); return; }
    const turnos = Math.min(Math.max(Number((document.getElementById('ft-turnos') as HTMLInputElement)?.value ?? 2), 1), 5);
    grafo = {
      nos: [
        { id: 'gatilho', tipo: 'manual', config: {} },
        { id: 'review', tipo: 'review', config: { executor, revisor, turnos } },
      ],
      arestas: [{ de: 'gatilho', para: 'review' }],
    };
  } else {
    const proponentes = passosTemplateDe('ft-proponentes');
    const moderador = (document.getElementById('ft-moderador') as HTMLInputElement)?.value.trim() ?? '';
    if (proponentes.length < 2) { toast('Debate precisa de 2+ proponentes', 'erro'); return; }
    if (!moderador) { toast('Debate precisa de um moderador', 'erro'); return; }
    grafo = {
      nos: [
        { id: 'gatilho', tipo: 'manual', config: {} },
        { id: 'debate', tipo: 'debate', config: { proponentes, moderador: { agente: moderador } } },
      ],
      arestas: [{ de: 'gatilho', para: 'debate' }],
    };
  }

  try {
    await q('/flows', {
      method: 'POST',
      body: JSON.stringify({ id, nome, ...grafo }),
    });
    toast(`Fluxo "${id}" criado (${templateFlow})`, 'ok');
    fecharFormFlow();
    await carregarFluxosLista();
  } catch (e) {
    toast('Erro ao criar fluxo: ' + (e as Error).message, 'erro');
  }
}

// cache de agentes para o form (carregado no primeiro uso)
void (async () => {
  try {
    agentesCache = await q<AgenteInfo[]>('/agents');
  } catch {
    /* form cai no input livre */
  }
})();

export async function executarFlow(id: string): Promise<void> {
  const { modalPrompt } = await import("../modal.js");
  const entrada = await modalPrompt({
    titulo: 'Executar flow ' + id,
    label: 'Entrada (JSON ou texto):',
    multiline: true,
  });
  if (entrada === null) return;

  try {
    await api('/flows/' + encodeURIComponent(id) + '/run', { method: 'POST', body: JSON.stringify({ entrada }) });
    toast('Flow executando — veja Início → Execuções', 'ok');
  } catch (e) {
    toast('Erro: ' + (e as Error).message, 'erro');
  }
}

export async function detalhesFlow(id: string): Promise<void> {
  try {
    const flow = await api<Record<string, unknown>>('/flows/' + id);
    const el = document.getElementById('drawer-content');
    if (!el) return;

    document.getElementById('drawer-title')!.textContent = 'Flow: ' + id;
    document.getElementById('drawer')!.classList.add('open');
    document.getElementById('drawer-overlay')!.classList.add('open');

    let blocoExec = '';
    try {
      const ultima = await api<Record<string, unknown> | null>('/flows/' + encodeURIComponent(id) + '/status');
      if (ultima) {
        const nos = (ultima.nos as Array<{ id: string; tipo: string; status: string }>) || [];
        const status = String(ultima.status ?? '?');
        const linhaNos = nos
          .map((n) => `${n.status === 'ok' ? '✓' : n.status === 'falhou' ? '✗' : '·'} ${n.id} (${n.status})`)
          .join('<br>');
        const falhou = status === 'falhou';
        blocoExec = `
          <div class="mt-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs">
            <div class="flex items-center justify-between gap-2">
              <span><strong>última execução</strong> — <span class="mono">${escapeHtml(String(ultima.execId))}</span> · ${escapeHtml(status)}</span>
              ${falhou ? `<button class="btn btn-ghost text-xs" onclick="retomarFlow('${escapeHtml(id)}','${escapeHtml(String(ultima.execId))}')">Retomar do último nó ok</button>` : ''}
            </div>
            <div class="mt-2 text-zinc-500">${linhaNos}</div>
          </div>`;
      }
    } catch {
      /* sem execução ainda */
    }

    el.innerHTML = '<pre class="text-xs whitespace-pre-wrap max-h-[45vh] overflow-auto">' + escapeHtml(JSON.stringify(flow, null, 2)) + '</pre>' + blocoExec;
  } catch (e) {
    toast('Erro: ' + (e as Error).message, 'erro');
  }
}

export async function retomarFlow(id: string, execId: string): Promise<void> {
  try {
    await api('/flows/' + encodeURIComponent(id) + '/resume', { method: 'POST', body: JSON.stringify({ exec_id: execId }) });
    toast('Retomando execução ' + execId + ' — nós concluídos serão preservados', 'ok');
  } catch (e) {
    toast('Erro: ' + (e as Error).message, 'erro');
  }
}
