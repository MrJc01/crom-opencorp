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
      <button class="btn" onclick="abrirFormFlow()">${icone('plus')} Novo fluxo</button>
    </div>
    <div id="flow-form" class="mb-6"></div>
    <div id="fluxos-lista" class="space-y-4"></div>
  `;

  await carregarFluxosLista();
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
    el.innerHTML = estadoVazio('fluxos', 'Nenhum fluxo', 'Clique em <strong>Novo fluxo</strong> acima, ou use <code>opencorp flow create &lt;id&gt; --nome "..."</code>');
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
        </div>
      </div>
    </div>
  `).join('');
}

/** Abre o form de criação (gera JSON do flowSchema: gatilho manual + passos lineares) */
export function abrirFormFlow(): void {
  const el = document.getElementById('flow-form');
  if (!el) return;

  el.innerHTML = `
    <div class="card p-4">
      <h3 class="font-semibold mb-3 flex items-center gap-2">${icone('plus')} Novo fluxo ${ajuda('flows')}</h3>
      <form id="form-novo-flow" class="space-y-4" onsubmit="event.preventDefault(); criarFlow()">
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
        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="text-xs text-zinc-500">Passos (executam em sequência após o gatilho manual)</label>
            <button type="button" class="btn btn-ghost text-xs" onclick="addPassoFlow()">${icone('plus')} passo</button>
          </div>
          <div id="flow-passos" class="space-y-3"></div>
        </div>
        <div class="flex gap-2">
          <button type="submit" class="btn">${icone('plus')} Criar fluxo</button>
          <button type="button" class="btn btn-ghost" onclick="fecharFormFlow()">Cancelar</button>
        </div>
      </form>
    </div>
  `;
  addPassoFlow();
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function fecharFormFlow(): void {
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
    campos.innerHTML = `<input class="flow-titulo" placeholder="título da task" class="sm:col-span-2" />`;
  } else {
    campos.innerHTML = `<input class="flow-categoria" placeholder="categoria do registro (ex: documentos)" />`;
  }
}

(window as unknown as Record<string, unknown>).__flowTipo = (sel: HTMLSelectElement) => {
  const linha = sel.closest('.flow-passo') as HTMLElement;
  atualizarCamposPasso(linha, sel.value);
};

export async function criarFlow(): Promise<void> {
  const id = (document.getElementById('flow-id') as HTMLInputElement)?.value.trim();
  const nome = (document.getElementById('flow-nome') as HTMLInputElement)?.value.trim();
  if (!id || !nome) return;

  // coleta os passos do DOM (ordem visual = ordem de execução)
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
        return;
      }
      config.agente = agente;
      config.ordem = ordem;
    } else if (tipo === 'task_create') {
      const titulo = (linha.querySelector('.flow-titulo') as HTMLInputElement)?.value.trim() ?? '';
      if (!titulo) {
        toast(`Passo #${i + 1}: título da task é obrigatório`, 'erro');
        return;
      }
      config.titulo = titulo;
    } else {
      const categoria = (linha.querySelector('.flow-categoria') as HTMLInputElement)?.value.trim() ?? '';
      if (!categoria) {
        toast(`Passo #${i + 1}: categoria é obrigatória`, 'erro');
        return;
      }
      if (tipo === 'saida') config.registro = categoria.includes('/') ? categoria : `documentos/${categoria}`;
      else config.categoria = categoria;
    }
    nos.push({ id: noId, tipo, config });
    arestas.push({ de: i === 0 ? 'gatilho' : `passo-${i}`, para: noId });
  }

  try {
    await q('/flows', {
      method: 'POST',
      body: JSON.stringify({ id, nome, nos, arestas }),
    });
    toast(`Fluxo "${id}" criado`, 'ok');
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
    await api('/flows/' + id + '/run', { method: 'POST', body: JSON.stringify({ entrada }) });
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
      const ultima = await api<Record<string, unknown> | null>('/flows/' + id + '/status');
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
    await api('/flows/' + id + '/resume', { method: 'POST', body: JSON.stringify({ exec_id: execId }) });
    toast('Retomando execução ' + execId + ' — nós concluídos serão preservados', 'ok');
  } catch (e) {
    toast('Erro: ' + (e as Error).message, 'erro');
  }
}
