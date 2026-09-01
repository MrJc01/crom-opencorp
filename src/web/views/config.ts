/**
 * View Config — preferências do sistema em abas (espelho do settings-tui)
 * + abas especiais Secrets e Ferramentas.
 *
 * Princípios aplicados:
 *  - cada campo mostra ORIGEM do valor (global/workspace/default/cli/agente)
 *  - cada campo salva individualmente (bool/select salvam na interação)
 *  - escopo Global ⇄ Workspace por aba (workspace aplica no ws ativo)
 *  - secrets: valores NUNCA renderizados (input type=password, sem leitura de volta)
 */

import { api, toast, icone, escapeHtml } from "../api.js";
import { getWsAtivo } from "../state.js";
import { estadoVazio, estadoErro, estadoCarregando } from "../estado.js";
import { ajuda } from "../help.js";

interface EntradaSetting {
  chave: string;
  valor: unknown;
  origem: string;
}

interface SecretInfo {
  nome: string;
  definido: boolean;
}

interface ToolInfo {
  id: string;
  spec?: Record<string, unknown>;
  erro?: string;
}

type TipoCampo = 'string' | 'numero' | 'bool' | 'lista' | 'enum';

interface MetaCampo {
  chave: string;
  label: string;
  tipo: TipoCampo;
  dica?: string;
  opcoes?: string[];
}

interface MetaSecao {
  titulo: string;
  ajuda?: string;
  campos: MetaCampo[];
}

interface MetaAba {
  id: string;
  label: string;
  secoes: MetaSecao[];
}

const ABAS: MetaAba[] = [
  {
    id: 'modelos',
    label: 'Modelos',
    secoes: [
      {
        titulo: 'Modelos de IA',
        ajuda: 'modelos',
        campos: [
          { chave: 'default_model', label: 'Modelo padrão dos agentes', tipo: 'string', dica: 'formato provedor/modelo — plano Go: opencode-go/glm-5.3-flash' },
          { chave: 'test_model', label: 'Modelo dos testes cegos', tipo: 'string', dica: 'juiz que avalia outputs' },
          { chave: 'secretary.agent', label: 'Agente do secretário', tipo: 'string', dica: 'qual agente atende o chat' },
        ],
      },
    ],
  },
  {
    id: 'orcamento',
    label: 'Orçamento',
    secoes: [
      {
        titulo: 'Limites de gasto',
        ajuda: 'budget',
        campos: [
          { chave: 'budget.daily_usd', label: 'Teto diário do workspace (USD)', tipo: 'numero' },
          { chave: 'budget.per_agent_usd', label: 'Teto por agente (USD)', tipo: 'numero' },
          { chave: 'budget.pause_on_exceed', label: 'Pausar agentes ao estourar', tipo: 'bool', dica: '80% avisa · 100% pausa' },
          { chave: 'budget.notify_registry', label: 'Registry de notificação', tipo: 'string' },
        ],
      },
    ],
  },
  {
    id: 'seguranca',
    label: 'Segurança',
    secoes: [
      {
        titulo: 'Política de segurança',
        ajuda: 'security',
        campos: [
          { chave: 'security.level', label: 'Nível padrão', tipo: 'enum', opcoes: ['permissive', 'standard', 'strict'] },
          { chave: 'security.blocklist', label: 'Comandos bloqueados', tipo: 'lista', dica: '1 por linha — ex.: rm -rf' },
          { chave: 'security.hitl_patterns', label: 'Padrões que exigem aprovação humana (HITL)', tipo: 'lista', dica: '1 por linha — ex.: git push' },
          { chave: 'security.network_allowlist', label: 'Allowlist de rede', tipo: 'lista', dica: '1 domínio por linha' },
        ],
      },
    ],
  },
  {
    id: 'workspace',
    label: 'Workspace',
    secoes: [
      {
        titulo: 'Localização',
        ajuda: 'workspace',
        campos: [
          { chave: 'paths.workspaces_root', label: 'Raiz dos workspaces', tipo: 'string', dica: 'onde as empresas vivem em disco' },
        ],
      },
    ],
  },
  {
    id: 'testes',
    label: 'Testes',
    secoes: [
      {
        titulo: 'Testes cegos',
        ajuda: 'testes',
        campos: [
          { chave: 'tests.blind', label: 'Testes cegos ativos', tipo: 'bool' },
          { chave: 'tests.test_model', label: 'Modelo avaliador', tipo: 'string' },
          { chave: 'tests.rotation', label: 'Rotação de juízes', tipo: 'lista', dica: '1 modelo por linha' },
          { chave: 'tests.reports_dir', label: 'Diretório dos relatórios', tipo: 'string' },
          { chave: 'tests.timeout_minutes', label: 'Timeout (min)', tipo: 'numero' },
          { chave: 'tests.health_check', label: 'Health check ativo', tipo: 'bool' },
        ],
      },
    ],
  },
  {
    id: 'scheduler',
    label: 'Scheduler',
    secoes: [
      {
        titulo: 'Supervisor',
        ajuda: 'scheduler',
        campos: [
          { chave: 'supervisor.enabled', label: 'Supervisor ativo', tipo: 'bool', dica: 'limpa locks/zombies e reencaixa tarefas' },
          { chave: 'supervisor.interval_minutes', label: 'Intervalo entre ticks (min)', tipo: 'numero' },
          { chave: 'supervisor.max_orders_per_tick', label: 'Máx. de ordens por tick', tipo: 'numero' },
        ],
      },
      {
        titulo: 'Reuniões',
        ajuda: 'reunioes',
        campos: [
          { chave: 'meeting.max_turns', label: 'Máx. de turnos', tipo: 'numero' },
          { chave: 'meeting.max_minutes', label: 'Duração máxima (min)', tipo: 'numero' },
          { chave: 'meeting.per_agent_usd', label: 'Orçamento por agente (USD)', tipo: 'numero' },
          { chave: 'meeting.moderator', label: 'Moderador', tipo: 'string' },
          { chave: 'meeting.ata_model_rotation', label: 'Rotação de modelos da ata', tipo: 'lista', dica: '1 modelo por linha' },
        ],
      },
      {
        titulo: 'Self-healing',
        ajuda: 'healing',
        campos: [
          { chave: 'healing.enabled', label: 'Self-healing ativo', tipo: 'bool' },
          { chave: 'healing.max_retries', label: 'Tentativas máximas por execução', tipo: 'numero' },
        ],
      },
    ],
  },
];

// ── estado local do módulo ────────────────────────────────────────────
let abaAtual = 'modelos';
let escopoAtual: 'global' | 'workspace' = 'global';
let entradas: Map<string, EntradaSetting> = new Map();

/** Renderiza a view Config */
export async function renderConfig(): Promise<void> {
  const viewEl = document.getElementById('view-config');
  if (!viewEl) return;

  viewEl.innerHTML = `
    <div class="page-header">
      <div class="page-header-esq">
        <h1 class="page-header-titulo">${icone('gear')} Config</h1>
        <p class="page-header-sub">Preferências · segredos · ferramentas</p>
      </div>
      <div class="page-header-acoes">
        <span class="help-wrap">${ajuda('config')}</span>
        <div class="flex items-center gap-1 rounded-lg border border-zinc-700 p-1" role="group" aria-label="Escopo das configurações">
          <button id="cfg-escopo-global" class="btn-ghost text-xs px-3 py-1" onclick="window.__cfgEscopo('global')">Global</button>
          <button id="cfg-escopo-workspace" class="btn-ghost text-xs px-3 py-1" onclick="window.__cfgEscopo('workspace')">Workspace${getWsAtivo() ? ': ' + escapeHtml(getWsAtivo()) : ''}</button>
        </div>
      </div>
    </div>
    <div class="config-abas mb-4" role="tablist" aria-label="Abas de configuração">
      ${ABAS.map((a) => `<button role="tab" class="btn-ghost config-aba text-xs" data-aba="${a.id}" onclick="window.__cfgAba('${a.id}')">${escapeHtml(a.label)}</button>`).join('')}
      <button role="tab" class="btn-ghost config-aba text-xs" data-aba="secrets" onclick="window.__cfgAba('secrets')">${icone('key')} Secrets</button>
      <button role="tab" class="btn-ghost config-aba text-xs" data-aba="ferramentas" onclick="window.__cfgAba('ferramentas')">${icone('apps')} Ferramentas</button>
    </div>
    <div id="config-conteudo">${estadoCarregando()}</div>
  `;

  (window as unknown as Record<string, unknown>).__cfgAba = (id: string) => {
    abaAtual = id;
    void carregarConteudo();
  };
  (window as unknown as Record<string, unknown>).__cfgEscopo = (s: string) => {
    if (s === 'workspace' && !getWsAtivo()) {
      toast('Selecione um workspace para usar escopo workspace', 'aviso');
      return;
    }
    escopoAtual = s === 'workspace' ? 'workspace' : 'global';
    marcarEscopo();
    void carregarConteudo();
  };

  await carregarConteudo();
}

/** Recarrega dados da aba atual (settings/secrets/tools) e renderiza */
async function carregarConteudo(): Promise<void> {
  const el = document.getElementById('config-conteudo');
  if (!el) return;
  marcarAbaAtiva();
  marcarEscopo();

  if (abaAtual === 'secrets') { await carregarSecrets(); return; }
  if (abaAtual === 'ferramentas') { await carregarFerramentas(); return; }

  const aba = ABAS.find((a) => a.id === abaAtual);
  if (!aba) return;

  let lista: EntradaSetting[] | null;
  try {
    lista = await api<EntradaSetting[]>('/settings');
  } catch {
    lista = null;
  }

  if (!lista) {
    el.innerHTML = estadoErro('Não foi possível carregar as configurações.', () => { void carregarConteudo(); });
    return;
  }

  entradas = new Map(lista.map((e) => [e.chave, e]));

  el.innerHTML = aba.secoes.map((secao) => `
    <section class="card p-4 mb-4">
      <h3 class="font-semibold mb-2 text-sm uppercase tracking-wide text-zinc-400 flex items-center gap-1">${escapeHtml(secao.titulo)}${secao.ajuda ? ajuda(secao.ajuda) : ''}</h3>
      ${secao.campos.map((c) => campoHtml(c)).join('')}
    </section>
  `).join('');

  instalarGlobaisCampos();
}

function marcarAbaAtiva(): void {
  document.querySelectorAll('.config-aba').forEach((b) => {
    const ativo = (b as HTMLElement).dataset.aba === abaAtual;
    b.classList.toggle('config-aba-ativa', ativo);
  });
}

function marcarEscopo(): void {
  const g = document.getElementById('cfg-escopo-global');
  const w = document.getElementById('cfg-escopo-workspace');
  if (g) g.style.background = escopoAtual === 'global' ? 'var(--accent)' : 'transparent';
  if (w) w.style.background = escopoAtual === 'workspace' ? 'var(--accent)' : 'transparent';
}

/** Badge de origem do valor */
function badgeOrigem(origem: string): string {
  const cls = origem === 'workspace' ? 'badge-ok'
    : origem === 'global' ? 'badge-pipeline'
    : origem === 'default' ? 'badge-neutral'
    : 'badge-warn';
  return `<span class="badge ${cls}">${escapeHtml(origem)}</span>`;
}

function idDe(chave: string): string {
  return 'cfg-' + chave.replace(/\./g, '-');
}

/** HTML de um campo de settings */
function campoHtml(c: MetaCampo): string {
  const e = entradas.get(c.chave);
  const valor = e?.valor;
  const origem = e?.origem ?? 'default';
  const id = idDe(c.chave);
  const dica = c.dica ? `<span class="cfg-dica">${escapeHtml(c.dica)}</span>` : '';

  let controle = '';
  if (c.tipo === 'bool') {
    controle = `
      <label class="toggle" title="${valor ? 'ativo' : 'desativado'}">
        <input type="checkbox" id="${id}" ${valor ? 'checked' : ''} onchange="window.__cfgBool('${c.chave}', this.checked)"/>
        <span class="toggle-slider"></span>
      </label>`;
  } else if (c.tipo === 'enum') {
    controle = `
      <div class="cfg-linha">
        <select id="${id}">
          ${(c.opcoes ?? []).map((o) => `<option value="${escapeHtml(o)}" ${o === String(valor) ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}
        </select>
        <button class="btn" onclick="window.__cfgSalvar('${c.chave}', 'enum')">Salvar</button>
      </div>`;
  } else if (c.tipo === 'lista') {
    const texto = Array.isArray(valor) ? (valor as unknown[]).map(String).join('\n') : '';
    controle = `
      <div class="cfg-linha">
        <textarea id="${id}" rows="3" placeholder="1 por linha"></textarea>
        <button class="btn" onclick="window.__cfgSalvar('${c.chave}', 'lista')">Salvar</button>
      </div>`;
  } else if (c.tipo === 'numero') {
    controle = `
      <div class="cfg-linha">
        <input id="${id}" type="number" step="any" value="${escapeHtml(String(valor ?? ''))}"/>
        <button class="btn" onclick="window.__cfgSalvar('${c.chave}', 'numero')">Salvar</button>
      </div>`;
  } else {
    controle = `
      <div class="cfg-linha">
        <input id="${id}" value="${escapeHtml(String(valor ?? ''))}"/>
        <button class="btn" onclick="window.__cfgSalvar('${c.chave}', 'string')">Salvar</button>
      </div>`;
  }

  return `
    <div class="cfg-campo">
      <div class="cfg-campo-topo">
        <span class="cfg-label">${escapeHtml(c.label)}</span>
        ${badgeOrigem(origem)}
        <span class="cfg-chave" title="chave no settings.json">${escapeHtml(c.chave)}</span>
      </div>
      ${dica}
      ${controle}
    </div>
  `;
}

/** Converte o valor do input conforme o tipo e faz PUT */
async function salvarCampo(chave: string, tipo: TipoCampo, bruto?: string | boolean): Promise<void> {
  let valor: string;
  if (tipo === 'bool') {
    valor = bruto ? 'true' : 'false';
  } else {
    const id = idDe(chave);
    const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    if (!el) return;
    const brutoTexto = el.value;
    if (tipo === 'numero') {
      const n = Number(brutoTexto);
      if (Number.isNaN(n)) {
        toast('Valor não é um número', 'erro');
        return;
      }
      valor = String(n);
    } else if (tipo === 'lista') {
      const itens = brutoTexto.split('\n').map((s) => s.trim()).filter(Boolean);
      valor = JSON.stringify(itens);
    } else {
      valor = brutoTexto;
    }
  }

  try {
    await api('/settings', { method: 'PUT', body: JSON.stringify({ chave, valor, scope: escopoAtual }) });
    toast(`${chave} salvo (${escopoAtual === 'workspace' ? 'workspace' : 'global'})`, 'ok');
    await carregarConteudo();
  } catch {
    // api() já mostrou o toast de erro (ex.: valor rejeitado pelo schema)
  }
}

function instalarGlobaisCampos(): void {
  const g = window as unknown as Record<string, unknown>;
  g.__cfgSalvar = (chave: string, tipo: string) => void salvarCampo(chave, tipo as TipoCampo);
  g.__cfgBool = (chave: string, checked: boolean) => void salvarCampo(chave, 'bool', checked);
}

// ── SECRETS ───────────────────────────────────────────────────────────

async function carregarSecrets(): Promise<void> {
  const el = document.getElementById('config-conteudo');
  if (!el) return;

  let secrets: SecretInfo[] | null;
  try {
    secrets = await api<SecretInfo[]>('/secrets');
  } catch {
    secrets = null;
  }

  if (!secrets) {
    el.innerHTML = estadoErro('Não foi possível carregar os secrets.', () => { void carregarSecrets(); });
    return;
  }

  el.innerHTML = `
    <section class="card p-4 mb-4">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h3 class="font-semibold text-sm uppercase tracking-wide text-zinc-400 flex items-center gap-1">Segredos cadastrados ${ajuda('secrets')}</h3>
        <div class="flex gap-2 flex-wrap">
          <button class="btn-ghost text-xs" onclick="window.__cfgSecretTemplate('wp')">${icone('key')} Credencial WordPress</button>
          <button class="btn-ghost text-xs" onclick="window.__cfgSecretTemplate('apikey')">${icone('lock')} API Key genérica</button>
        </div>
      </div>
      ${secrets.length
        ? `<div class="secret-lista">${secrets.map((s) => `
            <div class="secret-row">
              <span class="font-mono text-sm">${escapeHtml(s.nome)}</span>
              <span class="flex-1"></span>
              <span class="badge badge-ok">definido</span>
              <button class="btn-ghost text-xs" style="color:var(--err)" aria-label="Remover ${escapeHtml(s.nome)}" onclick="window.__cfgSecretRemover('${escapeHtml(s.nome)}')">${icone('trash')}</button>
            </div>`).join('')}
          </div>`
        : estadoVazio('key', 'Nenhum segredo', 'Credenciais (senhas de API, WordPress…) ficam aqui. Os agentes usam sem nunca exibir o valor.')}
    </section>
    <section class="card p-4">
      <h3 class="font-semibold text-sm uppercase tracking-wide text-zinc-400 mb-2">Adicionar segredo</h3>
      <div class="cfg-linha">
        <input id="secret-nome" placeholder="nome (ex.: minha_api_key)" autocomplete="off"/>
        <input id="secret-valor" type="password" placeholder="valor — nunca é exibido" autocomplete="new-password"/>
        <button class="btn" onclick="window.__cfgSecretSalvar()">Adicionar</button>
      </div>
      <p class="cfg-dica" style="margin-top:.5rem">O valor é gravado em <code>~/.opencorp/secrets.json</code> e nunca volta para a tela — só o nome.</p>
    </section>
  `;

  const g = window as unknown as Record<string, unknown>;
  g.__cfgSecretSalvar = async () => {
    const nomeEl = document.getElementById('secret-nome') as HTMLInputElement | null;
    const valorEl = document.getElementById('secret-valor') as HTMLInputElement | null;
    const nome = (nomeEl?.value ?? '').trim();
    const valor = valorEl?.value ?? '';
    if (!/^[a-zA-Z0-9_]+$/.test(nome)) {
      toast('Nome inválido — use letras, números e _', 'erro');
      return;
    }
    if (!valor) {
      toast('Valor obrigatório', 'erro');
      return;
    }
    await api('/secrets/' + encodeURIComponent(nome), { method: 'PUT', body: JSON.stringify({ valor }) });
    toast(`Segredo "${nome}" salvo`, 'ok');
    await carregarSecrets();
  };

  g.__cfgSecretRemover = async (nome: string) => {
    const { modalConfirm } = await import("../modal.js");
    if (!(await modalConfirm(`Remover o segredo "${nome}"? Os agentes perdem o acesso imediatamente.`, { confirmar: 'Remover' }))) return;
    await api('/secrets/' + encodeURIComponent(nome), { method: 'DELETE' });
    toast(`Segredo "${nome}" removido`, 'ok');
    await carregarSecrets();
  };

  g.__cfgSecretTemplate = async (tipo: string) => {
    const { modalPrompt } = await import("../modal.js");
    if (tipo === 'wp') {
      const site = await modalPrompt({ titulo: 'Credencial WordPress', label: 'Identificador do site (snake_case):', placeholder: 'ex.: meu_site', obrigatorio: true });
      if (!site) return;
      const slug = site.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      const user = await modalPrompt({ titulo: 'WordPress — usuário', label: `Usuário para wp_${slug}_user:`, obrigatorio: true });
      if (!user) return;
      const pass = await modalPrompt({ titulo: 'WordPress — senha', label: `Senha para wp_${slug}_pass:`, obrigatorio: true });
      if (!pass) return;
      await api('/secrets/' + encodeURIComponent(`wp_${slug}_user`), { method: 'PUT', body: JSON.stringify({ valor: user }) });
      await api('/secrets/' + encodeURIComponent(`wp_${slug}_pass`), { method: 'PUT', body: JSON.stringify({ valor: pass }) });
      toast(`Credencial wp_${slug}_user/_pass criada`, 'ok');
    } else {
      const nome = await modalPrompt({ titulo: 'API Key genérica', label: 'Nome da chave (ex.: openrouter_key):', obrigatorio: true });
      if (!nome) return;
      const valor = await modalPrompt({ titulo: 'API Key genérica', label: `Valor para ${nome}:`, obrigatorio: true });
      if (!valor) return;
      await api('/secrets/' + encodeURIComponent(nome.trim()), { method: 'PUT', body: JSON.stringify({ valor }) });
      toast(`Segredo "${nome.trim()}" salvo`, 'ok');
    }
    await carregarSecrets();
  };
}

// ── FERRAMENTAS ───────────────────────────────────────────────────────

interface ToolSpec {
  id?: string;
  titulo?: string;
  descricao?: string;
  handler?: { tipo?: string; comando?: string[] };
  approval?: string;
  rate_limit_min?: number;
}

async function carregarFerramentas(): Promise<void> {
  const el = document.getElementById('config-conteudo');
  if (!el) return;

  let tools: ToolInfo[] | null;
  try {
    tools = await api<ToolInfo[]>('/tools');
  } catch {
    tools = null;
  }

  if (!tools) {
    el.innerHTML = estadoErro('Não foi possível carregar as ferramentas.', () => { void carregarFerramentas(); });
    return;
  }

  if (!tools.length) {
    el.innerHTML = estadoVazio('apps', 'Nenhuma ferramenta', 'Ferramentas são JSONs em <code>.opencorp/tools/</code> do workspace — o template default traz wp.pagina e wp.configurar.');
    return;
  }

  el.innerHTML = `
    <section class="card p-4 mb-3">
      <h3 class="font-semibold text-sm uppercase tracking-wide text-zinc-400 flex items-center gap-1 mb-2">Ferramentas do workspace ${ajuda('tools')}</h3>
      ${tools.map((t) => {
    const spec = (t.spec ?? {}) as ToolSpec;
    return `
        <div class="card p-4 mb-3">
          <div class="flex items-center gap-2 flex-wrap mb-1">
            <span class="font-mono text-sm font-semibold">${escapeHtml(t.id)}</span>
            ${spec.titulo ? `<span class="text-sm text-zinc-300">${escapeHtml(spec.titulo)}</span>` : ''}
            ${spec.handler?.tipo ? `<span class="badge badge-pipeline">${escapeHtml(spec.handler.tipo)}</span>` : ''}
            ${spec.approval ? `<span class="badge ${spec.approval === 'nunca' ? 'badge-ok' : 'badge-warn'}">approval: ${escapeHtml(spec.approval)}</span>` : ''}
            ${t.erro ? `<span class="badge badge-err">JSON inválido</span>` : ''}
          </div>
          ${spec.descricao ? `<div class="text-sm text-zinc-400 mb-2">${escapeHtml(spec.descricao)}</div>` : ''}
          ${t.erro ? `<div class="text-xs" style="color:var(--err)">${escapeHtml(t.erro)}</div>` : ''}
          ${t.spec ? `
            <details>
              <summary class="text-xs text-zinc-500 cursor-pointer">ver spec</summary>
              <pre class="text-xs whitespace-pre-wrap scrollbar-thin max-h-64 overflow-auto mt-2">${escapeHtml(JSON.stringify(t.spec, null, 2))}</pre>
            </details>` : ''}
        </div>
      `;
  }).join('')}
    </section>
  `;
}
