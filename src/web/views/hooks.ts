/**
 * View Hooks — webhooks de entrada (API já existia; esta é a UI que faltava).
 * Lista + criar + copiar URL/cURL + excluir. Disparo público: POST /hooks/<ws>/<id>
 * com header x-opencorp-token.
 */

import { api, toast, icone, escapeHtml } from "../api.js";
import { getWsAtivo } from "../state.js";
import { estadoVazio, estadoErro, estadoCarregando } from "../estado.js";
import { ajuda } from "../help.js";
import { fecharDrawer } from "../router.js";

interface HookInfo {
  id: string;
  nome: string;
  ativo: boolean;
  respond: string;
  dedup_seg: number;
  metodos: string[];
  alvo: Record<string, unknown>;
  criado_em?: string;
  url?: string;
  token?: string;
}

const ALVOS: Array<{ tipo: string; rotulo: string; campos: string }> = [
  { tipo: 'task_create', rotulo: 'criar task', campos: '<input class="hook-alvo-campo" data-chave="titulo" placeholder="título da task (aceita {{payload.corpo.x}})" required/><input class="hook-alvo-campo" data-chave="responsavel" placeholder="responsável opcional (agente:id)"/>' },
  { tipo: 'agent_run', rotulo: 'rodar agente', campos: '<input class="hook-alvo-campo" data-chave="agente" placeholder="id do agente (ex: executor-padrao)" required/><input class="hook-alvo-campo" data-chave="ordem" placeholder="ordem para o agente (aceita {{payload}})" required/>' },
  { tipo: 'flow_run', rotulo: 'rodar fluxo', campos: '<input class="hook-alvo-campo" data-chave="flow" placeholder="id do fluxo" required/><input class="hook-alvo-campo" data-chave="entrada" placeholder="entrada do fluxo (aceita {{payload}})" required/>' },
  { tipo: 'webhook_out', rotulo: 'webhook de saída', campos: '<input class="hook-alvo-campo" data-chave="url" placeholder="https://…" required/><input class="hook-alvo-campo" data-chave="metodo" placeholder="método (padrão POST)"/>' },
];

const rotuloAlvo = (alvo: Record<string, unknown>): string => {
  const def = ALVOS.find(a => a.tipo === alvo?.tipo);
  const detalhe = alvo.tipo === 'agent_run' ? String(alvo.agente || '') : alvo.tipo === 'flow_run' ? String(alvo.flow || '') : alvo.tipo === 'task_create' ? String(alvo.titulo || '') : String(alvo.url || '');
  return `${def?.rotulo ?? String(alvo?.tipo || '—')}${detalhe ? ' · ' + detalhe : ''}`;
};

/** Renderiza a view Hooks */
export async function renderHooks(): Promise<void> {
  const viewEl = document.getElementById('view-hooks');
  if (!viewEl) return;

  if (!viewEl.innerHTML.trim()) {
    viewEl.innerHTML = `<div class="page-header"><div class="page-header-esq"><h1 class="page-header-titulo">${icone('hook')} Hooks</h1><p class="page-header-sub">Webhooks de entrada</p></div></div>` + estadoCarregando();
  }

  let hooks: HookInfo[] | null;
  try {
    hooks = await api<HookInfo[]>('/hooks');
  } catch {
    hooks = null;
  }

  if (!hooks) {
    viewEl.innerHTML = `<div class="page-header"><div class="page-header-esq"><h1 class="page-header-titulo">${icone('hook')} Hooks</h1><p class="page-header-sub">Webhooks de entrada</p></div><div class="page-header-acoes"><span class="help-wrap">${ajuda('hooks')}</span></div></div>` +
      estadoErro('Não foi possível carregar os hooks.', () => { void renderHooks(); });
    return;
  }

  viewEl.innerHTML = `
    <div class="page-header">
      <div class="page-header-esq">
        <h1 class="page-header-titulo">${icone('hook')} Hooks</h1>
        <p class="page-header-sub">POST externo → task / agente / fluxo</p>
      </div>
      <div class="page-header-acoes">
        <span class="help-wrap">${ajuda('hooks')}</span>
        <button class="btn" onclick="abrirFormHook()">${icone('plus')} Novo hook</button>
      </div>
    </div>
    <div id="hook-form" class="mb-6"></div>
    <div id="hooks-lista" class="space-y-4"></div>
  `;

  const el = document.getElementById('hooks-lista');
  if (!el) return;

  if (!hooks.length) {
    el.innerHTML = estadoVazio('hooks', 'Nenhum hook configurado', 'Hooks recebem POST de serviços externos e criam tasks, rodam agentes ou fluxos. Clique em <strong>Novo hook</strong> acima.');
    return;
  }

  el.innerHTML = hooks.map(h => `
    <div class="team-card">
      <div class="team-header">
        <div>
          <div class="team-title">${escapeHtml(h.nome || h.id)}</div>
          <div class="team-meta font-mono">${escapeHtml(h.id)} · ${escapeHtml(rotuloAlvo(h.alvo))}</div>
        </div>
        <div class="flex items-center gap-2">
          <span class="badge ${h.ativo === false ? 'badge-neutral' : 'badge-ok'}">${h.ativo === false ? 'inativo' : 'ativo'}</span>
          <button class="btn btn-ghost" title="Copiar cURL de teste" onclick="copiarCurlHook('${escapeHtml(h.id)}')">${icone('copy')} cURL</button>
          <button class="btn btn-ghost text-error" title="Excluir hook" onclick="excluirHook('${escapeHtml(h.id)}')">${icone('trash')}</button>
        </div>
      </div>
      <div class="team-steps font-mono text-xs">POST /hooks/${escapeHtml(getWsAtivo() || '<workspace>')}/${escapeHtml(h.id)} · dedup ${escapeHtml(String(h.dedup_seg ?? 0))}s · resposta ${escapeHtml(h.respond || 'imediato')}</div>
    </div>
  `).join('');
}

/** Form de criação com campos dinâmicos por tipo de alvo */
export function abrirFormHook(): void {
  const el = document.getElementById('hook-form');
  if (!el) return;

  el.innerHTML = `
    <div class="card p-4">
      <h3 class="font-semibold mb-3 flex items-center gap-2">${icone('plus')} Novo hook ${ajuda('hooks')}</h3>
      <form id="form-novo-hook" class="space-y-4" onsubmit="event.preventDefault(); criarHook()">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label class="block text-xs text-zinc-500 mb-1">Nome</label>
            <input id="hook-nome" required placeholder="ex: webhook-github" />
          </div>
          <div>
            <label class="block text-xs text-zinc-500 mb-1">O que faz ao receber</label>
            <select id="hook-alvo-tipo" onchange="hookCamposAlvo()">
              ${ALVOS.map(a => `<option value="${a.tipo}">${a.rotulo}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-xs text-zinc-500 mb-1">Responder</label>
            <select id="hook-respond">
              <option value="imediato">imediato (202 na hora)</option>
              <option value="final">final (espera conclusão)</option>
            </select>
          </div>
        </div>
        <div id="hook-campos-alvo" class="grid grid-cols-1 sm:grid-cols-2 gap-3"></div>
        <div class="flex gap-2 items-end">
          <div class="w-40">
            <label class="block text-xs text-zinc-500 mb-1">Dedup (segundos)</label>
            <input id="hook-dedup" type="number" min="0" value="0" />
          </div>
          <button type="submit" class="btn">${icone('plus')} Criar hook</button>
          <button type="button" class="btn btn-ghost" onclick="fecharFormHook()">Cancelar</button>
        </div>
      </form>
    </div>
  `;
  hookCamposAlvo();
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function fecharFormHook(): void {
  const el = document.getElementById('hook-form');
  if (el) el.innerHTML = '';
}

/** Renderiza campos do alvo conforme o tipo escolhido */
export function hookCamposAlvo(): void {
  const tipo = (document.getElementById('hook-alvo-tipo') as HTMLSelectElement)?.value ?? 'task_create';
  const campos = document.getElementById('hook-campos-alvo');
  if (!campos) return;
  campos.innerHTML = ALVOS.find(a => a.tipo === tipo)?.campos ?? '';
}

/** Cria o hook (POST /hooks) e mostra URL + token para copiar */
export async function criarHook(): Promise<void> {
  const nome = (document.getElementById('hook-nome') as HTMLInputElement)?.value.trim();
  const tipo = (document.getElementById('hook-alvo-tipo') as HTMLSelectElement)?.value;
  const respond = (document.getElementById('hook-respond') as HTMLSelectElement)?.value as 'imediato' | 'final';
  const dedup = Number((document.getElementById('hook-dedup') as HTMLInputElement)?.value ?? 0);
  if (!nome) return;

  const alvo: Record<string, unknown> = { tipo };
  let faltando = false;
  document.querySelectorAll<HTMLInputElement>('#hook-campos-alvo .hook-alvo-campo').forEach(c => {
    const v = c.value.trim();
    if (c.required && !v) faltando = true;
    if (v) alvo[c.dataset.chave!] = c.dataset.chave === 'dedup_seg' ? Number(v) : v;
  });
  if (faltando) { toast('Preencha os campos obrigatórios do alvo', 'erro'); return; }

  try {
    const criado = await api<HookInfo>('/hooks', {
      method: 'POST',
      body: JSON.stringify({ nome, alvo, respond, dedup_seg: dedup }),
    });
    fecharFormHook();
    await renderHooks();
    const { modalConfirm } = await import("../modal.js");
    await modalConfirm(
      `Hook criado. URL: ${location.origin}/hooks/${escapeHtml(getWsAtivo() || '')}/${escapeHtml(criado.id)} · token: ${escapeHtml(String((criado as unknown as { token: string }).token || ''))}`,
      { titulo: 'Hook criado — copie agora', confirmar: 'Copiar cURL' },
    ).then(async (copiar) => {
      if (copiar) await copiarCurlHook(criado.id, (criado as unknown as { token: string }).token);
    });
  } catch (e) {
    toast('Erro ao criar hook: ' + (e as Error).message, 'erro');
  }
}

/** Copia um cURL de teste para a área de transferência (busca token em GET /hooks/:id) */
export async function copiarCurlHook(id: string, tokenConhecido?: string): Promise<void> {
  try {
    let token = tokenConhecido;
    if (!token) {
      const det = await api<HookInfo>('/hooks/' + encodeURIComponent(id));
      token = String((det as unknown as { token?: string }).token || '');
    }
    const ws = getWsAtivo() || '';
    const curl = `curl -X POST ${location.origin}/hooks/${ws}/${id} -H "x-opencorp-token: ${token}" -H "content-type: application/json" -d '{"exemplo":"valor"}'`;
    await navigator.clipboard.writeText(curl);
    toast('cURL copiado — cole no terminal para testar', 'ok');
  } catch (e) {
    toast('Erro ao copiar: ' + (e as Error).message, 'erro');
  }
}

/** Exclui um hook (com confirmação) */
export async function excluirHook(id: string): Promise<void> {
  const { modalConfirm } = await import("../modal.js");
  if (!(await modalConfirm(`Excluir o hook "${escapeHtml(id)}"? Serviços externos que usam a URL vão receber 404.`, { titulo: 'Excluir hook', confirmar: 'Excluir' }))) return;

  try {
    await api('/hooks/' + encodeURIComponent(id), { method: 'DELETE' });
    toast('Hook excluído', 'ok');
    fecharDrawer();
    renderHooks();
  } catch (e) {
    toast('Erro ao excluir: ' + (e as Error).message, 'erro');
  }
}
