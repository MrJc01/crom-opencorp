# Handoff de sessão — opencorp (cole este contexto ao trocar de chat)

## Objective
- Continuar o **opencorp** — Sistema Operacional de Empresas Autônomas CLI-first sobre OpenCode (`/home/j/Documentos/GitHub/crom-worker-opencode`, usuário fala PT-BR).
- Plano ativo: `docs/13-plano-extensoes-plataforma.md` (etapas 19–25). 19–23 ✅ PASS e commitadas; **24 código pronto (não commitado), bateria cega pendente; 25 pendente**. Extra: Web v3 em TypeScript + Secretário nativo opencode + integração WordPress de 4 empresas reais.
- Modo **Custo Zero**: nemotron-550b = testador-cego, minimax-m3 = implementador (subagentes), `opencode/nemotron-3-ultra-free` = modelo default dos agentes (forçado no `<home>/opencode.json`).

## Estado do ambiente VIVO (não é o ~/.opencorp default!)
- Home ativa: **`/tmp/opencorp-smoke24`** — 4 workspaces/empresas: `pulso-diario` (ativo), `engenhar`, `emporio-aurora`, `norteia` = sites WordPress reais do usuário.
- Servidor web: `node bin/opencorp.mjs serve --port 4300 --token watch24 --host 0.0.0.0` (daemon, pidfile `api.pid`) — acesso LAN: `http://192.168.18.15:4300` (token `watch24`).
- Daemons vivos (pidfiles em `<home>/.opencorp/`): scheduler (heartbeat 2min; checar-site 30min ×4; fila-conteudo 120min → task `Fila-de-conteudo` → trigger `trg-editor-conteudo` → agente editor) e supervisor.
- Secretário NATIVO funcionando fim-a-fim: `POST /secretario/start` sobe `opencode serve` real (porta em `opencode-server.json`), MCP `opencorp` no `<home>/opencode.json`, agentes `secretario`/`secretario-exec` sincronizados via **bridge** (formato tools-mapa — cópia crua quebra o opencode com ConfigInvalidError). Conversa real validada: respondeu com dados do workspace usando MCP, modelo free.
- WordPress: app passwords nos secrets (`wp_*_user/pass`), tools por workspace `wp.listar/wp.rascunho/wp.publicar` (publicar = approval "sempre"), scripts `scripts/wp.cjs`. Smoke draft id 5 no pulso-diario. Sites: `https://<marca>.wp.crom.me`.
- **REGRA DE OURO (incidente 30/08)**: NUNCA matar processo `opencode*`/`node` sem pidfile nosso (`api.pid`, `scheduler.pid`, `supervisor.pid`, `opencode-server.json`) — derrubamos a interface do usuário 1×. Os demais: perguntar antes.

## Trabalho feito nesta sessão (não commitado — working tree cheio!)
Commite em blocos lógicos ANTES de seguir:
1. `feat(teams): orquestração multi-agente (etapa 24)` — src/core/team-store.ts, team-orchestrator.ts, mention-runner.ts (3 guardas: loop/rate/lease), cli/commands/team.ts, rotas /teams, TeamError, task-store (definirDependencias + ws_path no evento task.mensagem), cli/index (instalarMencoes), tests/* (team-store 11, orchestrator 8, mention 6, cli 7).
2. `feat(web): UI v3 em TypeScript modular` — src/web/* (16 módulos), tsconfig.web.json, build duplo, web-dist/index.html (markup + CSS; JS virou `<script type="module" src="/app/main.js">`), views novas: Agenda (escopo só-empresa/todas + filtro server-side em GET /schedules), Reuniões (GET /meetings novo), Fluxos, Histórico (mesclarHistorico), Secretário (chat), Teams, login screen, sidebar, ícones SVG idempotentes (guarda anti-duplicação), cache-bust `?v=<boot>` no servidor + no-cache, favicon.svg, --host no serve/web (LAN), drawer/KPIs/badges. 15 fixes de CSS mobile/overflow.
3. `feat(secretario): chat opencode nativo com MCP` — src/core/opencode-server.ts (daemon + config + agentes), rotas /secretario/* (proxy sync: POST /session/:id/message É síncrono — resposta assistant direto; timeout 240s), templates secretario/-exec, tests/opencode-server (7) + secretario-proxy (11).
4. `fix: misc` — GET /meetings, filtro workspace em /schedules, statusHttpDe TeamError/SecretarioError, rotation… (ver git status; ~25 arquivos).
Verificação: **376 testes verdes, build OK**; e2e Playwright NÃO foi criada (task cancelada 2× — brief completo existe abaixo).

## Pendências (ordem sugerida)
1. **COMMITS** (blocos acima; `git status` tem ~25 arquivos: src/core, src/cli, src/server, src/web, tests, templates, web-dist/index.html, package.json, tsconfig*, .gitignore).
2. **Spec cega ETAPA 24** (`docs/tests/ETAPA-24-orquestracao.md`, 5 cenários: team create/show/list; team run pipeline com agentes reais; fanout+barreira+síntese; guardas de menção (loop: 4 msgs ping-pong → 5ª bloqueia com msg sistema; lease: task travada → msg "fila"); API /teams) → `opencorp test blind 24` → fix (máx 3) → docs/13 status → commit.
3. **ATUALIZAR spec ETAPA-23 cenário 5** (os greps `renderWidget`/`loadAppsList` agora vivem no BUNDLE: `curl :PORTA/app/views/apps.js | grep ...` — o HTML não tem mais o JS inline; sem isso a regressão da 23 dá FAIL falso).
4. **Login loop (bug aberto do usuário)**: repros limpos com Playwright passam (login some, ícones únicos após 3 logins, router ressincroniza hash pós-login via sincronizarComHash, cache-bust por boot). Estado impossível relatado: login visível + SSE conectado + banner. Cavar com as 5 variantes Playwright (sem token; token válido; token inválido; clear-storage mid-session; 401 forçado via route interceptor) — suspeitas: api() 401 chamando mostrarLogin sem reload; EventSource com token vazio; dupla execução. Depois FECHAR com e2e.
5. **Suíte e2e Playwright** (brief pronto em conversas anteriores; essencial: playwright.config.ts com webServer `serve --port 4399 --token test-e2e --foreground` + `OPENCORP_HOME=/tmp/opencorp-e2e` + `OPENCODE_SERVER_BIN=tests/fixtures/fake-opencode.mjs`; core já aceita o env; specs login/nav/home/tasks/agenda/teams/apps/historico/secretario/reunioes-fluxos; `test:e2e` no package.json).
6. **Ciclo de conteúdo do editor**: gatilho+agenda funcionam (task criada → sessão editor 211s) MAS o editor não cumpriu o contrato (sem rascunho no WP, sem chat, sem mover). Simplificar a ordem do trigger `trg-editor-conteudo` (1 objetivo só: "crie rascunho via wp.rascunho e poste o id no chat"), retestar ciclo completo.
7. **Rotation do test blind**: rotacionar também em "Provider returned error" (hoje só timeout/rate limit — ciclo 3 da 23 morreu por isso).
8. **ETAPA 25 · v0.3.0**: doctor cobre scheduler/hooks/apps/teams/secretario; regressão `test blind all` (com spec 23 corrigida!); README + docs/README; tag v0.3.0.
9. Opcional: seed de apps nas 4 empresas; fecha o editor no fluxo de publicação com revisão (team `publicacao-review` já criado no pulso-diario).

## Detalhes que salvam tempo
- **Test blind**: relatório em `.opencorp/reports/testes/` (gitignored); veredito extraído da ÚLTIMA linha `VEREDITO:` (testador às vezes escreve errado — ler o relatório na mão); home isolada é mkdtemp mas a SPEC manda o testador usar `/tmp/opencorp-cego-e<n>` (rm -rf antes); spec do cenário com servidor DEVE mandar usar `serve` daemon + `serve stop` e proibir `--foreground`/`pkill` (aprendido na 23).
- **Secretário**: POST /session/:id/message do opencode serve É síncrono (retorna a msg do assistant; 10s de timeout aborta — usar 240s); `agent` vai no BODY da message; sessões antigas grudam no modelo da criação; agente copiado cru (tools em array) quebra o opencode — SEMPRE via bridge (`gerarAgenteOpencode` converte tools para mapa).
- **Web**: `configurarIconesIniciais` tem guarda idempotente (insertAdjacentHTML acumulava → logo/ícones triplicados que o usuário viu); router ressincroniza hash no login (`sincronizarComHash`); servidor injeta `?v=<boot>` no main.js + `cache-control: no-cache` em estáticos; specs cegas fazem grep em `/app/views/apps.js` (renderWidget/loadAppsList/enviarForm/abrirApp) — manter nomes.
- **Scheduler spawn não tem timeout** (runs longos de agente respiram); trigger CLI não expõe filtro — escrever JSON direto em `<home>/.opencorp/triggers/`.
- **Subagentes**: implementador-free (minimax) faz chunk = 1 arquivo novo + testes; NUNCA deixar rodar `npm run build` com bateria rodando (dist trocado em voo); revisar saída sempre (2 bugs achados: require em ESM, spawn de binário com process.execPath).
- Gasto total antes do custo-zero: $16.81/5d. Hoje: tudo free.
