<script lang="ts">
  import { onMount } from 'svelte';
  import { api, toast } from '../api.js';
  import { wsAtivo } from '../stores/auth.svelte';

  // ── tipos ───────────────────────────────────────────────────────────────
  type TipoCampo = 'string' | 'numero' | 'bool' | 'lista' | 'enum' | 'model';

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
  interface ChaveInfo {
    provider: string;
    tipo: string;
    preview: string;
  }
  interface ToolSpec {
    id?: string;
    titulo?: string;
    descricao?: string;
    handler?: { tipo?: string; comando?: string[] };
    approval?: string;
    rate_limit_min?: number;
  }

  // ── constantes ────────────────────────────────────────────────────────
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

  const ABAS_ESPECIAIS = [
    { id: 'secrets', label: 'Secrets' },
    { id: 'ferramentas', label: 'Ferramentas' },
    { id: 'opencode', label: 'Opencode' },
    { id: 'chaves', label: 'Chaves · opencode' },
  ];

  // ── estado reativo ───────────────────────────────────────────────────
  let abaAtual = $state('modelos');
  let escopoAtual = $state<'global' | 'workspace'>('global');
  let wsAtual = $state('');
  wsAtivo.subscribe((v) => (wsAtual = v));

  let entradas = $state<Map<string, EntradaSetting>>(new Map());
  let carregando = $state(false);
  let erroMsg = $state<string | null>(null);

  let campoValores = $state<Record<string, string>>({});
  let campoBool = $state<Record<string, boolean>>({});

  // secrets
  let secretsLista = $state<SecretInfo[] | null>(null);
  let secretNome = $state('');
  let secretValor = $state('');

  // ferramentas
  let toolsLista = $state<ToolInfo[] | null>(null);

  // opencode
  let opencodePath = $state('');
  let opencodeJson = $state('');
  let opencodeCarregando = $state(false);

  // chaves
  let chavesGlobal = $state<ChaveInfo[]>([]);
  let chavesWorkspace = $state<ChaveInfo[]>([]);
  let chavesHerdadas = $state<ChaveInfo[]>([]);
  let chavesWsId = $state<string | null>(null);
  let chaveProvider = $state('');
  let chaveValor = $state('');

  // ── helpers ──────────────────────────────────────────────────────────
  function badgeClasse(origem: string): string {
    if (origem === 'workspace') return 'badge-success';
    if (origem === 'global') return 'badge-info';
    if (origem === 'default') return 'badge-ghost';
    return 'badge-warning';
  }

  function idDe(chave: string): string {
    return 'cfg-' + chave.replace(/\./g, '-');
  }

  function abaMeta(id: string): MetaAba | undefined {
    return ABAS.find((a) => a.id === id);
  }

  // ── carregamento ─────────────────────────────────────────────────────
  async function carregarConteudo(): Promise<void> {
    erroMsg = null;
    if (abaAtual === 'secrets') { await carregarSecrets(); return; }
    if (abaAtual === 'ferramentas') { await carregarFerramentas(); return; }
    if (abaAtual === 'opencode') { await carregarOpencode(); return; }
    if (abaAtual === 'chaves') { await carregarChaves(); return; }

    const aba = abaMeta(abaAtual);
    if (!aba) return;
    carregando = true;
    try {
      const lista = await api<EntradaSetting[]>(
        escopoAtual === 'global' ? '/settings?escopo=global' : '/settings?escopo=workspace'
      );
      entradas = new Map(lista.map((e) => [e.chave, e]));
      // popula valores editáveis
      const novosValores: Record<string, string> = {};
      const novosBool: Record<string, boolean> = {};
      for (const secao of aba.secoes) {
        for (const c of secao.campos) {
          const e = entradas.get(c.chave);
          const v = e?.valor;
          if (c.tipo === 'bool') {
            novosBool[c.chave] = Boolean(v);
          } else if (c.tipo === 'lista') {
            novosValores[c.chave] = Array.isArray(v) ? (v as unknown[]).map(String).join('\n') : '';
          } else {
            novosValores[c.chave] = v != null ? String(v) : '';
          }
        }
      }
      campoValores = novosValores;
      campoBool = novosBool;
    } catch {
      erroMsg = 'Não foi possível carregar as configurações.';
    } finally {
      carregando = false;
    }
  }

  function trocarAba(id: string) {
    abaAtual = id;
    void carregarConteudo();
  }

  function trocarEscopo(s: 'global' | 'workspace') {
    if (s === 'workspace' && !wsAtual) {
      toast('Selecione um workspace para usar escopo workspace', 'aviso');
      return;
    }
    escopoAtual = s;
    void carregarConteudo();
  }

  // ── salvar campo ─────────────────────────────────────────────────────
  async function salvarCampo(chave: string, tipo: TipoCampo): Promise<void> {
    let valor: string;
    if (tipo === 'bool') {
      valor = campoBool[chave] ? 'true' : 'false';
    } else {
      const bruto = campoValores[chave] ?? '';
      if (tipo === 'numero') {
        const n = Number(bruto);
        if (Number.isNaN(n)) {
          toast('Valor não é um número', 'erro');
          return;
        }
        valor = String(n);
      } else if (tipo === 'lista') {
        const itens = bruto.split('\n').map((s) => s.trim()).filter(Boolean);
        valor = JSON.stringify(itens);
      } else {
        valor = bruto;
      }
    }
    try {
      await api('/settings', { method: 'PUT', body: JSON.stringify({ chave, valor, scope: escopoAtual }) });
      if (chave === 'secretary.model' || chave === 'default_model') {
        toast(`${chave} salvo (${escopoAtual}) — reinicie o secretário para aplicar`, 'ok');
      } else {
        toast(`${chave} salvo (${escopoAtual})`, 'ok');
      }
      await carregarConteudo();
    } catch {
      // api já deu toast
    }
  }

  async function salvarBool(chave: string, checked: boolean): Promise<void> {
    campoBool[chave] = checked;
    await salvarCampo(chave, 'bool');
  }

  // ── secrets ──────────────────────────────────────────────────────────
  async function carregarSecrets(): Promise<void> {
    carregando = true;
    erroMsg = null;
    try {
      secretsLista = await api<SecretInfo[]>('/secrets');
    } catch {
      erroMsg = 'Não foi possível carregar os secrets.';
      secretsLista = null;
    } finally {
      carregando = false;
    }
  }

  async function salvarSecret(): Promise<void> {
    const nome = secretNome.trim();
    const valor = secretValor;
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
    secretNome = '';
    secretValor = '';
    await carregarSecrets();
  }

  async function removerSecret(nome: string): Promise<void> {
    const { modalConfirm } = await import('../modal.js');
    if (!(await modalConfirm(`Remover o segredo "${nome}"? Os agentes perdem o acesso imediatamente.`, { confirmar: 'Remover' }))) return;
    await api('/secrets/' + encodeURIComponent(nome), { method: 'DELETE' });
    toast(`Segredo "${nome}" removido`, 'ok');
    await carregarSecrets();
  }

  async function templateSecret(tipo: string): Promise<void> {
    const { modalPrompt } = await import('../modal.js');
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
  }

  // ── ferramentas ──────────────────────────────────────────────────────
  async function carregarFerramentas(): Promise<void> {
    carregando = true;
    erroMsg = null;
    try {
      toolsLista = await api<ToolInfo[]>('/tools');
    } catch {
      erroMsg = 'Não foi possível carregar as ferramentas.';
      toolsLista = null;
    } finally {
      carregando = false;
    }
  }

  // ── opencode ─────────────────────────────────────────────────────────
  async function carregarOpencode(): Promise<void> {
    opencodeCarregando = true;
    erroMsg = null;
    try {
      const resp = await api<{ config: Record<string, unknown>; path: string }>('/opencode-config');
      opencodePath = resp.path;
      opencodeJson = JSON.stringify(resp.config, null, 2);
    } catch {
      erroMsg = 'Não foi possível carregar a config do opencode.';
    } finally {
      opencodeCarregando = false;
    }
  }

  async function salvarOpencode(): Promise<void> {
    let config: unknown;
    try {
      config = JSON.parse(opencodeJson);
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
      await carregarOpencode();
    } catch { /* api toast */ }
  }

  // ── chaves ───────────────────────────────────────────────────────────
  async function carregarChaves(): Promise<void> {
    carregando = true;
    erroMsg = null;
    try {
      const resp = await api<{
        global: { existe: boolean; chaves: ChaveInfo[]; path: string };
        workspace: { id: string | null; existe: boolean; chaves: ChaveInfo[]; herdadas: ChaveInfo[] };
      }>('/provider-keys');
      chavesGlobal = resp.global.chaves;
      chavesWorkspace = resp.workspace.chaves;
      chavesHerdadas = resp.workspace.herdadas;
      chavesWsId = resp.workspace.id;
    } catch {
      erroMsg = 'Não foi possível carregar as chaves de API.';
    } finally {
      carregando = false;
    }
  }

  async function salvarChave(): Promise<void> {
    const provider = chaveProvider.trim();
    const key = chaveValor.trim();
    if (!provider || !key) { toast('Informe o provedor e a chave', 'aviso'); return; }
    const alvo = escopoAtual;
    try {
      await api('/provider-keys', { method: 'PUT', body: JSON.stringify({ provider, key, escopo: alvo }) });
      toast(`Chave de ${provider} salva (${alvo}) — reinicie o secretário para aplicar no chat`, 'ok');
      chaveProvider = '';
      chaveValor = '';
      await carregarChaves();
    } catch (e) {
      toast('Erro ao salvar chave: ' + (e as Error).message, 'erro');
    }
  }

  async function removerChave(provider: string, esc: string): Promise<void> {
    try {
      await api('/provider-keys/' + encodeURIComponent(provider) + '?escopo=' + esc, { method: 'DELETE' });
      toast(`Chave de ${provider} removida (${esc})`, 'ok');
      await carregarChaves();
    } catch (e) {
      toast('Erro ao remover: ' + (e as Error).message, 'erro');
    }
  }

  onMount(() => {
    void carregarConteudo();
  });
</script>

<div class="page-header">
  <div class="page-header-esq">
    <h1 class="page-header-titulo">Config</h1>
    <p class="page-header-sub">Preferências · segredos · ferramentas</p>
  </div>
  <div class="page-header-acoes">
    <div class="join border border-base-300 p-1" role="group" aria-label="Escopo das configurações">
      <button
        class="btn btn-sm {escopoAtual === 'global' ? 'btn-primary' : 'btn-ghost'}"
        onclick={() => trocarEscopo('global')}
      >Global</button>
      <button
        class="btn btn-sm {escopoAtual === 'workspace' ? 'btn-primary' : 'btn-ghost'}"
        onclick={() => trocarEscopo('workspace')}
      >Workspace{#if wsAtual}: {wsAtual}{/if}</button>
    </div>
  </div>
</div>

<div class="config-abas mb-4" role="tablist" aria-label="Abas de configuração">
  {#each ABAS as aba}
    <button
      role="tab"
      class="btn btn-ghost btn-sm config-aba {abaAtual === aba.id ? 'config-aba-ativa' : ''}"
      aria-selected={abaAtual === aba.id}
      onclick={() => trocarAba(aba.id)}
    >{aba.label}</button>
  {/each}
  {#each ABAS_ESPECIAIS as esp}
    <button
      role="tab"
      class="btn btn-ghost btn-sm config-aba {abaAtual === esp.id ? 'config-aba-ativa' : ''}"
      aria-selected={abaAtual === esp.id}
      onclick={() => trocarAba(esp.id)}
    >{esp.label}</button>
  {/each}
</div>

<div id="config-conteudo">
  {#if carregando || opencodeCarregando}
    <div class="empty-state estado-loading" role="status" aria-live="polite">
      <div class="empty-icon">⏳</div>
      <div class="empty-title">Carregando…</div>
    </div>
  {:else if erroMsg}
    <div class="empty-state estado-erro" role="alert">
      <div class="empty-title">Algo deu errado</div>
      <div class="empty-desc">{erroMsg}</div>
      <div class="empty-acao">
        <button class="btn btn-ghost btn-sm" onclick={() => carregarConteudo()}>Tentar novamente</button>
      </div>
    </div>
  {:else if ABAS.find((a) => a.id === abaAtual)}
    {@const meta = abaMeta(abaAtual)}
    {#if meta}
      {#each meta.secoes as secao}
        <section class="card p-4 mb-4 bg-base-100 border border-base-300">
          <h3 class="font-semibold mb-2 text-sm uppercase tracking-wide text-zinc-400 flex items-center gap-1">
            {secao.titulo}
          </h3>
          {#each secao.campos as campo}
            {@const origem = entradas.get(campo.chave)?.origem ?? 'default'}
            {@const badgeCls = badgeClasse(origem)}
            <div class="cfg-campo">
              <div class="cfg-campo-topo">
                <span class="cfg-label">{campo.label}</span>
                <span class="badge {badgeCls} badge-sm">{origem}</span>
                <span class="cfg-chave" title="chave no settings.json">{campo.chave}</span>
              </div>
              {#if campo.dica}<span class="cfg-dica">{campo.dica}</span>{/if}

              {#if campo.tipo === 'bool'}
                <label class="toggle" title={campoBool[campo.chave] ? 'ativo' : 'desativado'}>
                  <input
                    type="checkbox"
                    checked={!!campoBool[campo.chave]}
                    onchange={(e) => salvarBool(campo.chave, (e.target as HTMLInputElement).checked)}
                  />
                  <span class="toggle-slider"></span>
                </label>
              {:else if campo.tipo === 'enum'}
                <div class="cfg-linha">
                  <select
                    id={idDe(campo.chave)}
                    class="select select-bordered select-sm w-full"
                    bind:value={campoValores[campo.chave]}
                  >
                    {#each campo.opcoes ?? [] as op}
                      <option value={op}>{op}</option>
                    {/each}
                  </select>
                  <button class="btn btn-sm btn-primary" onclick={() => salvarCampo(campo.chave, 'enum')}>Salvar</button>
                </div>
              {:else if campo.tipo === 'lista'}
                <div class="cfg-linha">
                  <textarea
                    id={idDe(campo.chave)}
                    rows="3"
                    class="textarea textarea-bordered w-full text-sm"
                    placeholder="1 por linha"
                    bind:value={campoValores[campo.chave]}
                  ></textarea>
                  <button class="btn btn-sm btn-primary" onclick={() => salvarCampo(campo.chave, 'lista')}>Salvar</button>
                </div>
              {:else if campo.tipo === 'numero'}
                <div class="cfg-linha">
                  <input
                    id={idDe(campo.chave)}
                    type="number"
                    step="any"
                    class="input input-bordered input-sm w-full"
                    bind:value={campoValores[campo.chave]}
                  />
                  <button class="btn btn-sm btn-primary" onclick={() => salvarCampo(campo.chave, 'numero')}>Salvar</button>
                </div>
              {:else if campo.tipo === 'model'}
                <div class="cfg-linha">
                  <input
                    id={idDe(campo.chave)}
                    class="input input-bordered input-sm w-full"
                    placeholder="ex.: opencode/muse-spark-1.2-contributor-free"
                    list={'dl-' + idDe(campo.chave)}
                    autocomplete="off"
                    bind:value={campoValores[campo.chave]}
                  />
                  <datalist id={'dl-' + idDe(campo.chave)}>
                    {#each MODELOS_SUGERIDOS as m}
                      <option value={m}></option>
                    {/each}
                  </datalist>
                  <button class="btn btn-sm btn-primary" onclick={() => salvarCampo(campo.chave, 'model')}>Salvar</button>
                </div>
                <div class="cfg-dica" style="margin-top:.25rem">Escolha na lista ou digite manualmente (<code>provedor/modelo</code>). Modelos com <code>:free</code> usam cota gratuita quando disponível.</div>
              {:else}
                <div class="cfg-linha">
                  <input
                    id={idDe(campo.chave)}
                    class="input input-bordered input-sm w-full"
                    bind:value={campoValores[campo.chave]}
                  />
                  <button class="btn btn-sm btn-primary" onclick={() => salvarCampo(campo.chave, 'string')}>Salvar</button>
                </div>
              {/if}
            </div>
          {/each}
        </section>
      {/each}
    {/if}
  {:else if abaAtual === 'secrets'}
    <section class="card p-4 mb-4 bg-base-100 border border-base-300">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h3 class="font-semibold text-sm uppercase tracking-wide text-zinc-400">Segredos cadastrados</h3>
        <div class="flex gap-2 flex-wrap">
          <button class="btn btn-ghost btn-sm" onclick={() => templateSecret('wp')}>Credencial WordPress</button>
          <button class="btn btn-ghost btn-sm" onclick={() => templateSecret('apikey')}>API Key genérica</button>
        </div>
      </div>
      {#if secretsLista === null}
        <div class="cfg-dica">Nenhum dado</div>
      {:else if secretsLista.length}
        <div class="secret-lista">
          {#each secretsLista as s}
            <div class="secret-row">
              <span class="font-mono text-sm">{s.nome}</span>
              <span class="flex-1"></span>
              <span class="badge badge-success badge-sm">definido</span>
              <button class="btn btn-ghost btn-xs" style="color:var(--err)" aria-label="Remover {s.nome}" onclick={() => removerSecret(s.nome)}>🗑</button>
            </div>
          {/each}
        </div>
      {:else}
        <div class="empty-state">
          <div class="empty-title">Nenhum segredo</div>
          <div class="empty-desc">Credenciais (senhas de API, WordPress…) ficam aqui. Os agentes usam sem nunca exibir o valor.</div>
        </div>
      {/if}
    </section>
    <section class="card p-4 bg-base-100 border border-base-300">
      <h3 class="font-semibold text-sm uppercase tracking-wide text-zinc-400 mb-2">Adicionar segredo</h3>
      <div class="cfg-linha">
        <input class="input input-bordered input-sm" placeholder="nome (ex.: minha_api_key)" autocomplete="off" bind:value={secretNome} />
        <input class="input input-bordered input-sm" type="password" placeholder="valor — nunca é exibido" autocomplete="new-password" bind:value={secretValor} />
        <button class="btn btn-sm btn-primary" onclick={salvarSecret}>Adicionar</button>
      </div>
      <p class="cfg-dica" style="margin-top:.5rem">O valor é gravado em <code>~/.opencorp/secrets.json</code> e nunca volta para a tela — só o nome.</p>
    </section>
  {:else if abaAtual === 'ferramentas'}
    {#if toolsLista === null}
      <div class="cfg-dica">Carregando…</div>
    {:else if !toolsLista.length}
      <div class="empty-state">
        <div class="empty-title">Nenhuma ferramenta</div>
        <div class="empty-desc">Ferramentas são JSONs em <code>.opencorp/tools/</code> do workspace — o template default traz wp.pagina e wp.configurar.</div>
      </div>
    {:else}
      <section class="card p-4 mb-3 bg-base-100 border border-base-300">
        <h3 class="font-semibold text-sm uppercase tracking-wide text-zinc-400 mb-2">Ferramentas do workspace</h3>
        {#each toolsLista as t}
          {@const spec = (t.spec ?? {}) as ToolSpec}
          <div class="card p-4 mb-3 bg-base-200 border border-base-300">
            <div class="flex items-center gap-2 flex-wrap mb-1">
              <span class="font-mono text-sm font-semibold">{t.id}</span>
              {#if spec.titulo}<span class="text-sm text-zinc-300">{spec.titulo}</span>{/if}
              {#if spec.handler?.tipo}<span class="badge badge-info badge-sm">{spec.handler.tipo}</span>{/if}
              {#if spec.approval}<span class="badge {spec.approval === 'nunca' ? 'badge-success' : 'badge-warning'} badge-sm">approval: {spec.approval}</span>{/if}
              {#if t.erro}<span class="badge badge-error badge-sm">JSON inválido</span>{/if}
            </div>
            {#if spec.descricao}<div class="text-sm text-zinc-400 mb-2">{spec.descricao}</div>{/if}
            {#if t.erro}<div class="text-xs" style="color:var(--err)">{t.erro}</div>{/if}
            {#if t.spec}
              <details>
                <summary class="text-xs text-zinc-500 cursor-pointer">ver spec</summary>
                <pre class="text-xs whitespace-pre-wrap scrollbar-thin max-h-64 overflow-auto mt-2">{JSON.stringify(t.spec, null, 2)}</pre>
              </details>
            {/if}
          </div>
        {/each}
      </section>
    {/if}
  {:else if abaAtual === 'opencode'}
    <section class="card p-4 mb-4 bg-base-100 border border-base-300">
      <h3 class="font-semibold text-sm uppercase tracking-wide text-zinc-400 mb-2">Opencode (do opencorp)</h3>
      <p class="cfg-dica mb-2">Arquivo: <code>{opencodePath}</code> — JSON livre (model, small_model, mcp.opencorp…). O <code>$schema</code> é preservado pelo servidor.</p>
      <div class="cfg-linha max-w-none">
        <textarea
          rows="18"
          spellcheck="false"
          class="textarea textarea-bordered font-mono text-xs w-full leading-relaxed"
          bind:value={opencodeJson}
        ></textarea>
      </div>
      <div class="flex flex-wrap items-center gap-2 mt-2">
        <button class="btn btn-sm btn-primary" onclick={salvarOpencode}>Salvar</button>
        <span class="cfg-dica" style="color:var(--warn)">⚠ alterações valem após reiniciar o secretário (Config → Ações → Reiniciar secretário)</span>
      </div>
    </section>
  {:else if abaAtual === 'chaves'}
    {@const noWorkspace = escopoAtual === 'workspace' && !!chavesWsId}
    {@const lista = noWorkspace ? chavesWorkspace : chavesGlobal}
    {@const herdadas = noWorkspace ? chavesHerdadas : []}
    <section class="card p-4 mb-4 bg-base-100 border border-base-300">
      <h3 class="font-semibold text-sm uppercase tracking-wide text-zinc-400 mb-2">Chaves de API — motor opencode</h3>
      <p class="cfg-dica mb-2">Estas chaves configuram o <b>opencode</b> — o motor que executa os agentes da empresa (secretário, runs, reuniões). No futuro, outros motores de agentes terão chaves próprias.</p>
      <p class="cfg-dica mb-2">
        {#if noWorkspace}
          Escopo <b>workspace</b> ({chavesWsId}) — valem só para os agentes da empresa e <b>sobrepõem as globais</b> por provedor.
        {:else}
          Escopo <b>global</b> — fallback para todas as empresas (o workspace pode sobrescrever por provedor no escopo dele).
        {/if}
      </p>
      {#each lista as c}
        <div class="approval-row">
          <div class="min-w-0">
            <div class="font-mono text-sm">{c.provider}</div>
            <div class="text-xs text-zinc-500 font-mono">{c.preview} · {c.tipo}</div>
          </div>
          <button class="btn btn-ghost btn-xs" onclick={() => removerChave(c.provider, noWorkspace ? 'workspace' : 'global')} title="Remover chave">🗑 Remover</button>
        </div>
      {/each}
      {#if !lista.length}
        <div class="cfg-dica mb-2">Nenhuma chave configurada neste escopo.</div>
      {/if}
      {#if noWorkspace && herdadas.length}
        <div class="cfg-dica mt-2 mb-1">Herdadas do global (ativas aqui enquanto não houver override):</div>
        {#each herdadas as c}
          <div class="approval-row">
            <div class="min-w-0">
              <div class="font-mono text-sm">{c.provider}</div>
              <div class="text-xs text-zinc-500 font-mono">{c.preview} (herdada)</div>
            </div>
          </div>
        {/each}
      {/if}
      <div class="cfg-linha mt-3">
        <input class="input input-bordered input-sm font-mono text-xs" placeholder="provedor (ex.: opencode-go, openrouter)" bind:value={chaveProvider} />
        <input class="input input-bordered input-sm font-mono text-xs" type="password" placeholder="chave de API (sk-…)" bind:value={chaveValor} />
        <button class="btn btn-sm btn-primary" onclick={salvarChave}>Salvar chave {noWorkspace ? 'no workspace' : 'no global'}</button>
      </div>
      <div class="cfg-dica" style="color:var(--warn)">⚠ após alterar, reinicie o secretário para aplicar no chat (agentes novos já pegam no próximo run)</div>
    </section>
  {/if}
</div>

<style>
  /* preserva estilos legados caso Tailwind não cubra; usa apenas classes já existentes */
  .page-header { display:flex; justify-content:space-between; align-items:flex-start; gap:.75rem; margin-bottom:1rem; flex-wrap:wrap; }
  .page-header-titulo { font-size:1.5rem; font-weight:700; display:flex; align-items:center; gap:.5rem; }
  .page-header-sub { font-size:.8125rem; color:var(--muted); margin-top:.2rem; }
  .config-aba-ativa { background: var(--accent) !important; color:#fff !important; }
</style>
