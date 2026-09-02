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

type TipoCampo = 'string' | 'numero' | 'bool' | 'lista' | 'enum' | 'model';

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

/** Lista curada de modelos disponíveis (para dropdown) — inclui os
 *  free do opencode/openrouter que o usuário pediu (Muse Spark, Nemotron).
 *  O input aceita qualquer string provider/model — a lista é só atalho. */
const MODELOS_SUGERIDOS: string[] = [
  'opencode/muse-spark-1.2-contributor-free',
  'opencode/nemotron-3-nano-free',
  'opencode/nemotron-3-ultra-free',
  'opencode/nemotron-3-ultra-free:thinking',
  'openrouter/nvidia/nemotron-3-nano-30b-a3b:free',
  'openrouter/nvidia/nemotron-3-ultra-550b-a55b:free',
  'opencode-go/glm-5.3-flash',
  'opencode-go/mimo-v2.5',
  'opencode-go/minimax-m3',
  'openrouter/google/gemini-2.5-flash',
  'openrouter/anthropic/claude-3.5-haiku',
  'openrouter/minimax/minimax-m3:free',
];

const ABAS: MetaAba[] = [
  {
    id: 'modelos',
    label: 'Modelos',
    secoes: [
      {
        titulo: 'Modelos de IA',
        ajuda: 'modelos',
        campos: [
          { chave: 'secretary.model', label: 'Modelo do secretário (chat)', tipo: 'model', dica: 'vazio = usa o do template (opencode-go/glm-5.3-flash). Digite ou escolha: opencode/muse-spark-1.2-contributor-free, opencode/nemotron-3-nano-free, openrouter/nvidia/nemotron-3-ultra-550b-a55b:free etc. Após salvar, reinicie o secretário.' },
          { chave: 'default_model', label: 'Modelo padrão dos agentes', tipo: 'model', dica: 'fallback para agentes sem model no frontmatter — formato provedor/modelo' },
          { chave: 'test_model', label: 'Modelo dos testes cegos', tipo: 'model', dica: 'juiz que avalia outputs' },
          { chave: 'secretary.agent', label: 'Agente do secretário', tipo: 'string', dica: 'qual agente atende o chat (secretario / secretario-exec)' },
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
      <button role="tab" class="btn-ghost config-aba text-xs" data-aba="opencode" onclick="window.__cfgAba('opencode')">${icone('gear')} Opencode</button>
      <button role="tab" class="btn-ghost config-aba text-xs" data-aba="chaves" onclick="window.__cfgAba('chaves')">${icone('key')} Chaves · opencode</button>
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
  if (abaAtual === 'opencode') { await carregarOpencode(); return; }
  if (abaAtual === 'chaves') { await carregarChaves(); return; }

  const aba = ABAS.find((a) => a.id === abaAtual);
  if (!aba) return;

  let lista: EntradaSetting[] | null;
  try {
    // P-27: o escopo do toggle é INJETADO explicitamente. O api() sempre acrescenta
    // ?workspace=<ativo> em toda requisição — sem o ?escopo=, o server devolvia
    // sempre a lista MESCLADA (global+workspace) e o toggle não tinha efeito.
    // O server entende ?escopo=global (ignora o workspace da query) e
    // ?escopo=workspace (lista mesclada com badges de origem reais).
    // Literais estáticos: o contrato (tests/web-contratos.test.ts) verifica rotas literais.
    lista = await api<EntradaSetting[]>(
      escopoAtual === 'global' ? '/settings?escopo=global' : '/settings?escopo=workspace'
    );
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
  } else if (c.tipo === 'model') {
    const dlId = 'dl-' + id;
    const valStr = String(valor ?? '');
    controle = `
      <div class="cfg-linha">
        <input id="${id}" value="${escapeHtml(valStr)}" list="${dlId}" placeholder="ex.: opencode/muse-spark-1.2-contributor-free" autocomplete="off"/>
        <datalist id="${dlId}">${MODELOS_SUGERIDOS.map((m) => `<option value="${escapeHtml(m)}"></option>`).join('')}</datalist>
        <button class="btn" onclick="window.__cfgSalvar('${c.chave}', 'model')">Salvar</button>
      </div>
      <div class="cfg-dica" style="margin-top:.25rem">Escolha na lista ou digite manualmente (<code>provedor/modelo</code>). Modelos com <code>:free</code> usam cota gratuita quando disponível.</div>`;
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
    if (chave === 'secretary.model' || chave === 'default_model') {
      toast(`${chave} salvo (${escopoAtual === 'workspace' ? 'workspace' : 'global'}) — reinicie o secretário para aplicar`, 'ok');
    } else {
      toast(`${chave} salvo (${escopoAtual === 'workspace' ? 'workspace' : 'global'})`, 'ok');
    }
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

// ── OPENCODE (config do opencode do opencorp) ─────────────────────────

interface OpencodeConfigResp {
  config: Record<string, unknown>;
  path: string;
}

/** Aba Opencode: edita o <opencorpHome>/.opencorp/opencode-home/opencode.json
 *  (model, small_model, mcp.opencorp…) como JSON livre. Alterações valem após
 *  reiniciar o secretário — o reinício em si fica na home (Config → Ações). */
async function carregarOpencode(): Promise<void> {
  const el = document.getElementById('config-conteudo');
  if (!el) return;

  let resp: OpencodeConfigResp | null;
  try {
    resp = await api<OpencodeConfigResp>('/opencode-config');
  } catch {
    resp = null;
  }

  if (!resp) {
    el.innerHTML = estadoErro('Não foi possível carregar a config do opencode.', () => { void carregarOpencode(); });
    return;
  }

  el.innerHTML = `
    <section class="card p-4 mb-4">
      <h3 class="font-semibold text-sm uppercase tracking-wide text-zinc-400 flex items-center gap-1 mb-2">Opencode (do opencorp)</h3>
      <p class="cfg-dica mb-2">Arquivo: <code>${escapeHtml(resp.path)}</code> — JSON livre (model, small_model, mcp.opencorp…). O <code>$schema</code> é preservado pelo servidor.</p>
      <div class="cfg-linha">
        <textarea id="cfg-opencode-json" rows="18" spellcheck="false" class="font-mono text-xs" style="line-height:1.5">${escapeHtml(JSON.stringify(resp.config, null, 2))}</textarea>
      </div>
      <div class="flex flex-wrap items-center gap-2 mt-2">
        <button class="btn" onclick="window.__cfgOpencodeSalvar()">Salvar</button>
        <span class="cfg-dica" style="color:var(--warn)">⚠ alterações valem após reiniciar o secretário (Config → Ações → Reiniciar secretário)</span>
      </div>
    </section>
  `;

  (window as unknown as Record<string, unknown>).__cfgOpencodeSalvar = async () => {
    const ta = document.getElementById('cfg-opencode-json') as HTMLTextAreaElement | null;
    if (!ta) return;
    let config: unknown;
    try {
      config = JSON.parse(ta.value);
    } catch (e) {
      toast('JSON inválido: ' + (e as Error).message, 'erro');
      return;
    }
    if (config === null || typeof config !== 'object' || Array.isArray(config)) {
      toast('A config deve ser um objeto JSON (ex.: { "model": "…" })', 'erro');
      return;
    }
    try {
      await api('/opencode-config', { method: 'PUT', body: JSON.stringify({ config }) });
      toast('Config do opencode salva — reinicie o secretário para valer', 'ok');
      await carregarOpencode(); // re-renderiza com o $schema preservado pelo servidor
    } catch {
      // api() já mostrou o toast de erro (JSON rejeitado/falha de escrita)
    }
  };
}

/* ── Chaves de API dos provedores (auth.json do opencode do opencorp) ── */

interface ChaveInfo {
  provider: string;
  tipo: string;
  preview: string;
}

/** Aba "Chaves de API": obedece o escopo superior (Global × Workspace).
 *  Herança: workspace sobrepõe o global por provedor; o que não tem override
 *  no workspace herda do global. Fonte: opencorp — nunca o opencode pessoal. */
export async function carregarChaves(): Promise<void> {
  const el = document.getElementById('config-conteudo');
  if (!el) return;

  interface ChaveInfo { provider: string; tipo: string; preview: string; }
  interface RespChaves {
    global: { existe: boolean; chaves: ChaveInfo[]; path: string };
    workspace: { id: string | null; existe: boolean; chaves: ChaveInfo[]; herdadas: ChaveInfo[] };
  }

  let resp: RespChaves | null = null;
  try {
    resp = await api<RespChaves>('/provider-keys');
  } catch { resp = null; }

  if (!resp) {
    el.innerHTML = estadoErro('Não foi possível carregar as chaves de API.', () => { void carregarChaves(); });
    return;
  }

  const noWorkspace = escopoAtual === 'workspace' && !!resp.workspace.id;
  const lista = noWorkspace ? resp.workspace.chaves : resp.global.chaves;
  const herdadas = noWorkspace ? resp.workspace.herdadas : [];

  const linhaChave = (c: ChaveInfo, esc: string) => `
    <div class="approval-row">
      <div class="min-w-0">
        <div class="font-mono text-sm">${escapeHtml(c.provider)}</div>
        <div class="text-xs text-zinc-500 font-mono">${escapeHtml(c.preview)} · ${escapeHtml(c.tipo)}</div>
      </div>
      <button class="btn btn-ghost text-xs" onclick="window.__cfgChaveRemover('${escapeHtml(c.provider)}','${esc}')" title="Remover chave">${icone('trash')} Remover</button>
    </div>`;

  el.innerHTML = `
    <section class="card p-4 mb-4">
      <h3 class="font-semibold text-sm uppercase tracking-wide text-zinc-400 flex items-center gap-1 mb-2">Chaves de API — motor opencode</h3>
      <p class="cfg-dica mb-2">Estas chaves configuram o <b>opencode</b> — o motor que executa os agentes da empresa (secretário, runs, reuniões). No futuro, outros motores de agentes terão chaves próprias.</p>
      <p class="cfg-dica mb-2">${noWorkspace
        ? `Escopo <b>workspace</b> (${escapeHtml(resp.workspace.id ?? '')}) — valem só para os agentes da empresa e <b>sobrepõem as globais</b> por provedor.`
        : 'Escopo <b>global</b> — fallback para todas as empresas (o workspace pode sobrescrever por provedor no escopo dele).'}</p>
      ${lista.map((c) => linhaChave(c, noWorkspace ? 'workspace' : 'global')).join('') || '<div class="cfg-dica mb-2">Nenhuma chave configurada neste escopo.</div>'}
      ${noWorkspace && herdadas.length ? `<div class="cfg-dica mt-2 mb-1">Herdadas do global (ativas aqui enquanto não houver override):</div>${herdadas.map((c) => `<div class="approval-row"><div class="min-w-0"><div class="font-mono text-sm">${escapeHtml(c.provider)}</div><div class="text-xs text-zinc-500 font-mono">${escapeHtml(c.preview)} (herdada)</div></div></div>`).join('')}` : ''}
      <div class="cfg-linha mt-3">
        <input id="cfg-chave-provider" placeholder="provedor (ex.: opencode-go, openrouter)" class="font-mono text-xs"/>
        <input id="cfg-chave-valor" type="password" placeholder="chave de API (sk-…)" class="font-mono text-xs"/>
        <button class="btn" onclick="window.__cfgChaveSalvar('${noWorkspace ? 'workspace' : 'global'}')">Salvar chave ${noWorkspace ? 'no workspace' : 'no global'}</button>
      </div>
      <div class="cfg-dica" style="color:var(--warn)">⚠ após alterar, reinicie o secretário para aplicar no chat (agentes novos já pegam no próximo run)</div>
    </section>
  `;

  (window as unknown as Record<string, unknown>).__cfgChaveSalvar = async (esc: 'workspace' | 'global') => {
    const provider = (document.getElementById('cfg-chave-provider') as HTMLInputElement | null)?.value.trim() ?? '';
    const key = (document.getElementById('cfg-chave-valor') as HTMLInputElement | null)?.value.trim() ?? '';
    if (!provider || !key) { toast('Informe o provedor e a chave', 'aviso'); return; }
    try {
      await api('/provider-keys', { method: 'PUT', body: JSON.stringify({ provider, key, escopo: esc }) });
      toast(`Chave de ${provider} salva (${esc === 'workspace' ? 'workspace' : 'global'}) — reinicie o secretário para aplicar no chat`, 'ok');
      await carregarChaves();
    } catch (e) {
      toast('Erro ao salvar chave: ' + (e as Error).message, 'erro');
    }
  };

  (window as unknown as Record<string, unknown>).__cfgChaveRemover = async (provider: string, esc: string) => {
    try {
      await api('/provider-keys/' + encodeURIComponent(provider) + '?escopo=' + esc, { method: 'DELETE' });
      toast(`Chave de ${provider} removida (${esc})`, 'ok');
      await carregarChaves();
    } catch (e) {
      toast('Erro ao remover: ' + (e as Error).message, 'erro');
    }
  };
}
