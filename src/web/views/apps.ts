/**
 * View Apps — Mini-apps com widgets + aba "Configurar apps" (perfis de secrets).
 * Mantém contratos: renderWidget, loadAppsList, abrirApp, enviarForm
 */

import { api, toast, icone, escapeHtml } from "../api.js";
import { estadoVazio, estadoCarregando, estadoErro } from "../estado.js";
import { ajuda } from "../help.js";
import { criarTabs } from "../ui/primitivas.js";
import type { WidgetSpec, AppSpec, AppInfo } from "../state.js";

/** Espelho de APP_PERFIL_NOME_REGEX (src/schemas/app-perfil.ts) — importar de lá
 *  puxaria zod para o bundle web; manter os dois em sincronia. */
const APP_PERFIL_NOME_REGEX = /^app:(vps|wordpress|mercadopago|cartao|custom):[a-z0-9][a-z0-9-]{0,40}$/;

/** Renderiza a view Apps (lista) */
export async function renderApps(): Promise<void> {
  const viewEl = document.getElementById('view-apps');
  if (!viewEl) return;

  viewEl.innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold flex items-center gap-2">${icone('apps')} Mini-apps ${ajuda('apps')}</h1>
    </div>
    <div id="apps-tabs" class="mb-4"></div>
    <div id="apps-painel-apps">
      <div id="apps-lista" class="apps-grid">${estadoCarregando()}</div>
      <div id="app-view" class="hidden"></div>
    </div>
    <div id="apps-painel-perfis" class="hidden"></div>
  `;

  criarTabs(
    document.getElementById('apps-tabs')!,
    [
      { id: 'apps', rotulo: 'Apps' },
      { id: 'perfis', rotulo: 'Configurar apps' },
    ],
    (id) => {
      const painelApps = document.getElementById('apps-painel-apps');
      const painelPerfis = document.getElementById('apps-painel-perfis');
      if (!painelApps || !painelPerfis) return;
      painelApps.classList.toggle('hidden', id !== 'apps');
      painelPerfis.classList.toggle('hidden', id !== 'perfis');
      if (id === 'perfis') void carregarPerfis();
    },
  );

  instalarGlobaisPerfis();
  await loadAppsList();
}

/** Carrega lista de apps — FUNÇÃO EXPOSTA GLOBALMENTE para testes cegos */
export async function loadAppsList(): Promise<void> {
  let lista: AppInfo[] | null;
  try {
    lista = await api<AppInfo[]>('/apps');
  } catch {
    lista = null;
  }
  const el = document.getElementById('apps-lista');
  if (!el) return;

  if (!Array.isArray(lista) || !lista.length) {
    el.innerHTML = '<div style="grid-column:1/-1">' + estadoVazio('apps', 'Nenhum mini-app', 'Instale com: <code>opencorp app seed painel-tarefas</code> ou crie via <code>POST /apps</code>.') + '</div>';
    return;
  }

  el.innerHTML = lista.map(a => `
    <div class="app-card" onclick="abrirApp('${escapeHtml(a.id)}')">
      <div class="app-title">${escapeHtml(a.titulo)}</div>
      <div class="app-meta">${escapeHtml(a.id)} · ${a.widgets} widget(s)</div>
    </div>
  `).join('');
}

/** Abre detalhe de um app — FUNÇÃO EXPOSTA GLOBALMENTE */
export async function abrirApp(id: string): Promise<void> {
  const listaEl = document.getElementById('apps-lista');
  const viewEl = document.getElementById('app-view');
  if (!listaEl || !viewEl) return;

  let spec: AppSpec;
  try {
    spec = await api<AppSpec>('/apps/' + id + '/spec');
  } catch {
    listaEl.classList.remove('hidden');
    return;
  }
  listaEl.classList.add('hidden');
  viewEl.classList.remove('hidden');
  viewEl.innerHTML = `
    <div class="flex items-center gap-3 mb-6">
      <button class="btn btn-ghost" onclick="fecharApp()">← Voltar</button>
      <h2 class="font-semibold">${escapeHtml(spec.titulo)}</h2>
    </div>
    <div class="widget-grid" id="widgets-container"></div>
  `;

  const container = document.getElementById('widgets-container');
  if (!container) return;

  for (const pagina of spec.paginas || []) {
    if (spec.paginas.length > 1) {
      const h3 = document.createElement('h3');
      h3.className = 'text-sm text-zinc-500 mb-2';
      h3.textContent = String(pagina.titulo || '');
      container.appendChild(h3);
    }
    const grid = document.createElement('div');
    grid.className = 'widget-grid';
    container.appendChild(grid);
    for (const w of pagina.widgets || []) {
      grid.appendChild(await renderWidget(w));
    }
  }
}

/** Fecha view de app e volta para lista — FUNÇÃO EXPOSTA GLOBALMENTE */
export function fecharApp(): void {
  const viewEl = document.getElementById('app-view');
  const listaEl = document.getElementById('apps-lista');
  if (!viewEl || !listaEl) return;

  viewEl.classList.add('hidden');
  viewEl.innerHTML = '';
  listaEl.classList.remove('hidden');
}

/** Busca dados para um widget */
async function dadosWidget(w: WidgetSpec): Promise<unknown> {
  if (!w.fonte || !w.fonte.rota) return null;
  try {
    const d = await api(w.fonte.rota);
    return Array.isArray(d) ? d : d;
  } catch {
    return null;
  }
}

/** Renderiza um widget — FUNÇÃO EXPOSTA GLOBALMENTE para testes cegos */
export async function renderWidget(w: WidgetSpec): Promise<HTMLElement> {
  const el = document.createElement('div');
  el.className = 'widget-card';
  el.innerHTML = `<h4 class="widget-title">${escapeHtml(w.titulo)}</h4>`;

  const dados = await dadosWidget(w);

  if (w.tipo === 'metrica') {
    const n = Array.isArray(dados) ? dados.length : (dados ? Object.keys(dados as object).length : 0);
    el.innerHTML += `<div class="widget-metric">${n}</div>`;
  } else if (w.tipo === 'tabela' || w.tipo === 'grafico') {
    const rot = w.fonte?.rotulo_campo || 'id';
    const val = w.fonte?.campo_valor || 'status';
    const linhas = (Array.isArray(dados) ? dados : []).slice(0, 10);

    if (w.tipo === 'grafico') {
      const contagem: Record<string, number> = {};
      linhas.forEach((d: Record<string, unknown>) => {
        const k = String(d[val] ?? '?');
        contagem[k] = (contagem[k] || 0) + 1;
      });
      const max = Math.max(1, ...Object.values(contagem));
      el.innerHTML += Object.entries(contagem).map(([k, v]) => `
        <div class="flex items-center gap-2 mb-2">
          <span class="text-xs w-24 truncate">${escapeHtml(k)}</span>
          <div style="width:${(v/max)*100}%" class="widget-chart-bar"></div>
          <span class="text-xs">${v}</span>
        </div>
      `).join('') || '<div class="text-zinc-500 text-xs">Sem dados</div>';
    } else {
      el.innerHTML += `<table class="widget-table">${linhas.map((d: Record<string, unknown>) => `
        <tr>
          <td class="font-mono text-xs truncate max-w-[150px]">${escapeHtml(String(d[rot] ?? '').slice(0, 30))}</td>
          <td class="text-xs text-zinc-500">${escapeHtml(String(d[val] ?? ''))}</td>
        </tr>
      `).join('') || '<tr><td class="text-zinc-500 text-xs" colspan="2">Sem dados</td></tr>'}</table>`;
    }
  } else if (w.tipo === 'kanban') {
    const colunas: Record<string, Record<string, unknown>[]> = {};
    (Array.isArray(dados) ? dados : []).forEach((t: Record<string, unknown>) => {
      const col = String(t.coluna || 'backlog');
      (colunas[col] = colunas[col] || []).push(t);
    });
    el.innerHTML += Object.entries(colunas).map(([c, ts]) => `
      <div class="mb-2">
        <div class="text-xs text-zinc-500 capitalize">${escapeHtml(c)} (${ts.length})</div>
        ${ts.map(t => `<div class="text-xs bg-zinc-800 rounded p-1 mb-1 truncate">${escapeHtml(String(t.titulo || ''))}</div>`).join('')}
      </div>
    `).join('') || '<div class="text-zinc-500 text-xs">Sem dados</div>';
  } else if (w.tipo === 'markdown') {
    el.innerHTML += `<div class="text-xs whitespace-pre-wrap">${escapeHtml(String(w.texto || ''))}</div>`;
  } else if (w.tipo === 'lista_tarefas') {
    el.innerHTML += (Array.isArray(dados) ? dados : []).map((t: Record<string, unknown>) => `
      <label class="flex items-center gap-2 text-xs mb-1">
        <input type="checkbox" ${t.coluna === 'feito' ? 'checked' : ''} disabled/> ${escapeHtml(String(t.titulo || ''))}
      </label>
    `).join('') || '<div class="text-zinc-500 text-xs">Sem dados</div>';
  } else if (w.tipo === 'formulario') {
    const campos = w.acao?.campos || [{ nome: 'titulo' }];
    el.innerHTML += campos.map(c => `
      <input class="mb-2" placeholder="${escapeHtml(String(c.rotulo || c.nome))}" data-campo="${escapeHtml(c.nome)}"/>
    `).join('') + `<button class="btn" onclick="enviarForm(this, '${escapeHtml(w.id)}')">${w.acao?.tipo === 'post_rota' ? 'Enviar' : 'Executar'}</button>`;
    el.dataset.rota = w.fonte?.rota || '';
    el.dataset.acao = w.acao?.tipo || 'post_rota';
  }

  return el;
}

/** Envia formulário de widget — FUNÇÃO EXPOSTA GLOBALMENTE */
export async function enviarForm(btn: HTMLButtonElement, _widgetId: string): Promise<void> {
  const card = btn.closest('.widget-card') as HTMLElement | null;
  if (!card) return;

  const corpo: Record<string, string> = {};
  card.querySelectorAll('[data-campo]').forEach((input) => {
    const el = input as HTMLInputElement;
    corpo[el.dataset.campo!] = el.value;
  });

  const rota = card.dataset.rota || '/tasks';
  try {
    await api(rota, { method: 'POST', body: JSON.stringify(corpo) });
    btn.innerHTML = 'Enviado ' + icone('spark');
    setTimeout(() => {
      btn.innerHTML = card.dataset.acao === 'post_rota' ? 'Enviar' : 'Executar';
    }, 2000);
  } catch (e) {
    toast('Erro: ' + (e as Error).message, 'erro');
    btn.innerHTML = card.dataset.acao === 'post_rota' ? 'Enviar' : 'Executar';
  }
}

// ── CONFIGURAR APPS — perfis de secrets (app:<tipo>:<id>) ─────────────

interface SecretInfoLista {
  nome: string;
  definido: boolean;
  tipo_app?: string | null;
}

interface CampoPerfil {
  nome: string;
  rotulo: string;
  obrigatorio?: boolean;
  segredo?: boolean;
  numero?: boolean;
  textarea?: boolean;
  opcoes?: string[];
  dica?: string;
}

const BANNER_CARTAO = '⚠ Atenção: recurso NÃO testado corretamente ainda — armazene apenas referência (bandeira/últimos 4), nunca número completo nem CVV. O servidor rejeita esses campos.';

const CAMPOS_APP: Record<string, CampoPerfil[]> = {
  vps: [
    { nome: 'rotulo', rotulo: 'Rótulo', obrigatorio: true },
    { nome: 'host', rotulo: 'Host / IP', obrigatorio: true },
    { nome: 'porta', rotulo: 'Porta', numero: true, dica: 'opcional — ex.: 22' },
    { nome: 'usuario', rotulo: 'Usuário', obrigatorio: true },
    { nome: 'senha', rotulo: 'Senha', segredo: true },
    { nome: 'chave_ssh', rotulo: 'Chave SSH', segredo: true },
    { nome: 'notas', rotulo: 'Notas' },
  ],
  wordpress: [
    { nome: 'rotulo', rotulo: 'Rótulo', obrigatorio: true },
    { nome: 'url', rotulo: 'URL do site', obrigatorio: true, dica: 'ex.: https://meusite.com' },
    { nome: 'usuario', rotulo: 'Usuário', obrigatorio: true },
    { nome: 'senha_app', rotulo: 'Senha de aplicação', segredo: true, obrigatorio: true },
    { nome: 'onde_roda', rotulo: 'Onde roda', dica: 'ex.: VPS app:vps:servidor-1' },
    { nome: 'notas', rotulo: 'Notas' },
  ],
  mercadopago: [
    { nome: 'rotulo', rotulo: 'Rótulo', obrigatorio: true },
    { nome: 'public_key', rotulo: 'Public key', obrigatorio: true },
    { nome: 'access_token', rotulo: 'Access token', segredo: true, obrigatorio: true },
    { nome: 'ambiente', rotulo: 'Ambiente', obrigatorio: true, opcoes: ['test', 'prod'] },
    { nome: 'notas', rotulo: 'Notas' },
  ],
  cartao: [
    { nome: 'rotulo', rotulo: 'Rótulo', obrigatorio: true },
    { nome: 'bandeira', rotulo: 'Bandeira', obrigatorio: true },
    { nome: 'ultimos4', rotulo: 'Últimos 4 dígitos', obrigatorio: true, dica: 'ex.: 4242 — nunca o número completo' },
    { nome: 'validade', rotulo: 'Validade', obrigatorio: true, dica: 'MM/AA' },
    { nome: 'notas', rotulo: 'Notas' },
  ],
  custom: [
    { nome: 'rotulo', rotulo: 'Rótulo', obrigatorio: true },
    { nome: 'conteudo', rotulo: 'Conteúdo', obrigatorio: true, textarea: true, dica: 'informação livre para o agente (chaves de API, configurações…)' },
    { nome: 'notas', rotulo: 'Notas' },
  ],
};

const ROTULO_TIPO: Record<string, string> = {
  vps: 'VPS / servidor',
  wordpress: 'WordPress',
  mercadopago: 'MercadoPago',
  cartao: 'Cartão (só referência)',
  custom: 'Customizado',
};

const TIPOS = Object.keys(CAMPOS_APP);

const CLASSE_BANNER_CARTAO = 'rounded-lg border px-4 py-3 text-sm mb-3';

function bannerCartaoHtml(): string {
  return `<div class="${CLASSE_BANNER_CARTAO}" id="app-perfil-banner-cartao" style="border-color:var(--err);color:var(--err);background:rgba(248,113,113,.08)">${escapeHtml(BANNER_CARTAO)}</div>`;
}

/** Carrega a lista de perfis definidos (GET /secrets, prefixo app:) — valores NUNCA são buscados/renderizados */
export async function carregarPerfis(): Promise<void> {
  const painel = document.getElementById('apps-painel-perfis');
  if (!painel) return;

  let secrets: SecretInfoLista[] | null;
  try {
    secrets = await api<SecretInfoLista[]>('/secrets');
  } catch {
    secrets = null;
  }

  const topo = `
    <section class="card p-4">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h2 class="font-semibold text-sm uppercase tracking-wide text-zinc-400 flex items-center gap-1">Perfis de apps ${ajuda('apps-perfis')}</h2>
        <button class="btn" id="app-perfil-novo" onclick="window.__appPerfilNovo()">+ Novo perfil</button>
      </div>`;

  if (!secrets) {
    painel.innerHTML = topo + estadoErro('Não foi possível carregar os perfis de app.', () => { void carregarPerfis(); }) + '</section>';
    return;
  }

  const perfis = secrets
    .filter((s) => typeof s.nome === 'string' && APP_PERFIL_NOME_REGEX.test(s.nome))
    .map((s) => {
      const partes = s.nome.split(':');
      return { nome: s.nome, tipo: partes[1] ?? '', id: partes.slice(2).join(':') };
    })
    .sort((a, b) => a.tipo.localeCompare(b.tipo) || a.id.localeCompare(b.id));

  const grupos = new Map<string, { nome: string; tipo: string; id: string }[]>();
  for (const p of perfis) {
    const lista = grupos.get(p.tipo) ?? [];
    lista.push(p);
    grupos.set(p.tipo, lista);
  }

  painel.innerHTML = `
    ${topo}
      ${perfis.length
        ? [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([tipo, lista]) => `
          <div class="cfg-dica mb-1 mt-3 uppercase tracking-wide">${escapeHtml(ROTULO_TIPO[tipo] ?? tipo)} (${lista.length})</div>
          ${lista.map((p) => `
          <div class="secret-row" data-perfil="${escapeHtml(p.nome)}">
            <span class="badge badge-pipeline">${escapeHtml(p.tipo)}</span>
            <span class="font-mono text-sm">${escapeHtml(p.id)}</span>
            <span class="flex-1"></span>
            <span class="badge badge-ok">definido</span>
            <button class="btn-ghost text-xs" aria-label="Editar ${escapeHtml(p.nome)}" onclick="window.__appPerfilEditar('${escapeHtml(p.nome)}')">${icone('gear')}</button>
            <button class="btn-ghost text-xs" style="color:var(--err)" aria-label="Excluir ${escapeHtml(p.nome)}" onclick="window.__appPerfilExcluir('${escapeHtml(p.nome)}')">${icone('trash')}</button>
          </div>`).join('')}`).join('')
        : estadoVazio('key', 'Nenhum perfil de app', 'Credenciais de VPS, WordPress, MercadoPago e outras informações ficam aqui — gravadas em ~/.opencorp/secrets.json e nunca exibidas.')}
      <div class="${CLASSE_BANNER_CARTAO} mt-3" data-banner-cartao style="border-color:var(--err);color:var(--err);background:rgba(248,113,113,.08)">${escapeHtml(BANNER_CARTAO)}</div>
    </section>
  `;
}

function campoFormHtml(c: CampoPerfil): string {
  const id = 'app-perfil-campo-' + c.nome;
  const dica = c.dica ? `<span class="cfg-dica">${escapeHtml(c.dica)}</span>` : '';
  let controle: string;
  if (c.opcoes) {
    controle = `<select id="${id}">${c.opcoes.map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('')}</select>`;
  } else if (c.textarea) {
    controle = `<textarea id="${id}" rows="4" placeholder="${escapeHtml(c.rotulo)}"></textarea>`;
  } else {
    const tipo = c.numero ? 'number' : c.segredo ? 'password' : 'text';
    const auto = c.segredo ? ' autocomplete="new-password"' : '';
    controle = `<input id="${id}" type="${tipo}"${auto} placeholder="${escapeHtml(c.rotulo)}"/>`;
  }
  return `
    <div class="cfg-campo">
      <div class="cfg-campo-topo">
        <span class="cfg-label">${escapeHtml(c.rotulo)}${c.obrigatorio ? ' *' : ''}</span>
        ${c.segredo ? '<span class="badge badge-neutral">segredo</span>' : ''}
      </div>
      ${dica}
      <div class="cfg-linha">${controle}</div>
    </div>
  `;
}

/** Formulário por tipo — salvar faz PUT /secrets/app:<tipo>:<id> com JSON.stringify */
function renderFormPerfil(tipo: string, idPerfil: string, editando: boolean): void {
  const painel = document.getElementById('apps-painel-perfis');
  if (!painel) return;
  const campos = CAMPOS_APP[tipo] ?? CAMPOS_APP.custom!;
  painel.innerHTML = `
    <section class="card p-4">
      <div class="flex items-center gap-3 mb-4">
        <button class="btn btn-ghost" onclick="window.__appPerfilVoltar()">← Voltar</button>
        <h2 class="font-semibold">${editando ? 'Editar' : 'Novo'} perfil de app</h2>
      </div>
      ${tipo === 'cartao' ? bannerCartaoHtml() : ''}
      <div class="cfg-linha mb-3">
        <select id="app-perfil-tipo" ${editando ? 'disabled' : ''} onchange="window.__appPerfilTipo()">
          ${TIPOS.map((t) => `<option value="${escapeHtml(t)}" ${t === tipo ? 'selected' : ''}>${escapeHtml(ROTULO_TIPO[t] ?? t)}</option>`).join('')}
        </select>
        <input id="app-perfil-id" placeholder="id (ex.: servidor-1)" value="${escapeHtml(idPerfil)}" ${editando ? 'readonly' : ''}/>
      </div>
      ${campos.map((c) => campoFormHtml(c)).join('')}
      <div class="text-xs text-zinc-500 mt-3">Como o agente usa: <code>${escapeHtml(`referencie nas ordens: OPENCORP_SECRET app:${tipo}:<id>`)}</code></div>
      <p class="cfg-dica mt-1">Salvar substitui todos os valores do perfil. Campos vazios são salvos como "" — o valor nunca volta para a tela.</p>
      <button class="btn mt-3" id="app-perfil-salvar" onclick="window.__appPerfilSalvar()">Salvar perfil</button>
    </section>
  `;
}

async function salvarPerfil(): Promise<void> {
  const tipoEl = document.getElementById('app-perfil-tipo') as HTMLSelectElement | null;
  const idEl = document.getElementById('app-perfil-id') as HTMLInputElement | null;
  if (!tipoEl || !idEl) return;
  const tipo = tipoEl.value;
  const id = idEl.value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(id)) {
    toast('ID inválido — use letras minúsculas, números e hífen (começando por letra ou número)', 'erro');
    return;
  }
  const dados: Record<string, string | number> = {};
  for (const c of CAMPOS_APP[tipo] ?? []) {
    const el = document.getElementById('app-perfil-campo-' + c.nome) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    if (!el) continue;
    const v = el.value.trim();
    if (c.numero) {
      if (!v) continue;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 65535) {
        toast('Porta inválida (1–65535)', 'erro');
        return;
      }
      dados[c.nome] = n;
      continue;
    }
    if (!v && c.obrigatorio) {
      toast(`Campo obrigatório: ${c.rotulo}`, 'erro');
      return;
    }
    dados[c.nome] = v;
  }
  if (tipo === 'cartao' && !/^\d{4}$/.test(String(dados.ultimos4 ?? ''))) {
    toast('Últimos 4 deve ter exatamente 4 dígitos', 'erro');
    return;
  }
  const nome = `app:${tipo}:${id}`;
  try {
    await api('/secrets/' + encodeURIComponent(nome), { method: 'PUT', body: JSON.stringify({ valor: JSON.stringify(dados) }) });
    toast(`Perfil "${nome}" salvo`, 'ok');
    await carregarPerfis();
  } catch {
    // api() já mostrou o toast de erro (ex.: schema 422 do servidor)
  }
}

async function excluirPerfil(nome: string): Promise<void> {
  const { modalConfirm } = await import("../modal.js");
  if (!(await modalConfirm(`Excluir o perfil "${nome}"? Os agentes perdem o acesso imediatamente.`, { confirmar: 'Excluir' }))) return;
  try {
    await api('/secrets/' + encodeURIComponent(nome), { method: 'DELETE' });
    toast(`Perfil "${nome}" removido`, 'ok');
  } catch {
    // api() já mostrou o toast de erro
  }
  await carregarPerfis();
}

function instalarGlobaisPerfis(): void {
  const g = window as unknown as Record<string, unknown>;
  g.__appPerfilNovo = () => renderFormPerfil('vps', '', false);
  g.__appPerfilEditar = (nome: string) => {
    const partes = String(nome).split(':');
    renderFormPerfil(partes[1] ?? 'custom', partes.slice(2).join(':'), true);
  };
  g.__appPerfilExcluir = (nome: string) => void excluirPerfil(nome);
  g.__appPerfilTipo = () => {
    const tipoEl = document.getElementById('app-perfil-tipo') as HTMLSelectElement | null;
    const idEl = document.getElementById('app-perfil-id') as HTMLInputElement | null;
    renderFormPerfil(tipoEl?.value ?? 'vps', idEl?.value ?? '', false);
  };
  g.__appPerfilVoltar = () => void carregarPerfis();
  g.__appPerfilSalvar = () => void salvarPerfil();
}
