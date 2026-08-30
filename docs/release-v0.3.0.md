# release v0.3.0 — Plataforma de extensões completa (etapas 19–25)

> Sucessor do release v0.2.0 (Fase B/C: Boardroom, Supervisor, Flows, API+SSE, Web, Deploy). Este release fecha o plano `docs/13-plano-extensoes-plataforma.md`: a empresa não só conversa e executa — **agenda, recebe webhooks, usa ferramentas plugáveis, constrói mini-apps e orquestra times multi-agente**.

## O que a etapa 19–25 entrega

**task board + chat (19)** — kanban por workspace em corp-db (`tasks`): `task create/list/show/move/assign/label/delete/columns`; chat por task (`task_mensagens`) com autores humano/agente/sistema, tipos comentario/handoff/artefato/decisao, menções `@agente:<id>` (parser aceita `@nome` e `@agente:nome`), refs de artefatos; guardas de menção: **loop guard** (ping-pong ≥4 → pausa com aviso), **rate guard** (20 automáticas/h/task) e **lease** (lock 30s — menção em task travada recebe aviso de fila); spawn por menção com bundle de contexto (tarefa, histórico, artefatos, contrato de resposta); `instalarMencoes` no CLI e no servidor.

**scheduler (20)** — daemon `scheduler start/stop` (pidfile, tick 30s, heartbeat): jobs com cron 5 campos próprio / `intervalo_min` / `data_unica`; política de atraso com graça; persistência em `scheduler.db` (sobrevive a reinício); `schedule create/list/show/pause/resume/run-now/delete`; dedup e histórico no journal.

**webhooks & triggers (21)** — hooks públicos `POST /hooks/:ws/:id` com token por hook, allowlist de IP, expressão "só se", dedup 60s e respond imediato/final; alvos: agent_run, flow_run, task_create, webhook_out; triggers declarativos em `<ws>/.opencorp/triggers/*.json` (evento + filtro + alvo), avaliados no processo do servidor **e** do CLI (fix da bateria 21).

**tools + MCP (22)** — registry plugável: manifests JSON (`~/.opencorp/tools/` + `<ws>/.opencorp/tools/`) com `{id, inputSchema, handler: comando|http|interno, approval, rate_limit_min}`; built-ins `task.*`, `schedule.list`, `query.sql` (SELECT-only), `files.read`, `flow.run`, `http.get`; `opencorp mcp serve` (stdio JSON-RPC: initialize, tools/list, tools/call) registrado no opencode — agentes ganham tools nativas; erros de execução `isError:true` acionáveis.

**mini-apps (23)** — specs declarativos em `<ws>/.opencorp/apps/<id>.json` (widgets metrica/tabela/kanban/grafico/formulario/markdown/lista_tarefas com fonte sql|rota|tasks); validação zod; renderer genérico na UI (`#/app/:id`); `app create/list/show/validate/delete/seed`; dados sempre via APIs existentes (nenhum SQL do browser).

**teams / orquestração (24)** — `team create/list/show/delete/run` com padrões declarativos: **pipeline** (passos sequenciais com `{{entrada}}`/`{{anterior}}`), **fanout** (paralelos + barreira por `bloqueado_por` + síntese), **review** (executor↔revisor com APROVADO/AJUSTES, turnos), **debate** (proponentes paralelos + moderador com DECISÃO); task raiz + subtasks com escala humano automática em falha; rotas API `/teams` (GET/POST/DELETE/`:id/run`); bateria cega PASS 5/5.

**secretário nativo** — `OpencodeServerManager`: sobe `opencode serve` real (pidfile `opencode-server.json`), config/agentes via **bridge tools-mapa** (cópia crua quebra o opencode), proxy `/secretario/*` síncrono (POST /session/:id/message retorna o assistant; timeout 240s); agentes `secretario` (analisa) e `secretario-exec` (executa); conversa validada fim-a-fim com MCP e modelo free.

**web v3 (TypeScript modular)** — 16 módulos `src/web/` com build próprio (`tsconfig.web.json`); views: home, tasks, agenda (escopo só-empresa/todas via `?all=1`), reuniões, fluxos, histórico (mesclarHistorico), teams, mini-apps, secretário; login screen com router `#/view` e re-sincronização pós-login; ícones SVG idempotentes; cache-bust `?v=<boot>` + `no-cache`; `--host` no serve/web (LAN). Auditoria de 3 especialistas aplicada: escapeHtml restaurado (XSS), hamburger/backdrop/logout, refresh 8s não-destrutivo, api() com contrato de erro (4xx→toast, timeout, rede caída), contraste WCAG, mobile CSS (16px inputs, 44px touch, dvh, viewport-fit), feed incremental.

**doctor (25)** — cobre node/opencode/settings/budget/policy/segredos **+ scheduler** (pid órfão com jobs ativos → aviso), **hooks/apps/teams** (specs inválidos por nome), **secretário** (parado = ok; porta testada com fetch 2s).

**e2e permanente** — Playwright: `npm run test:e2e` (webServer 4399 isolado, `OPENCODE_SERVER_BIN=tests/fixtures/fake-opencode.mjs`, home `/tmp/opencorp-e2e`); 38 testes (login, nav, home, tasks+drawer, agenda, teams, apps, histórico, reuniões/fluxos, secretário com fake, workspaces) — **38/38 PASS**.

**modo custo zero** — bateria cega e agentes default 100% free com **rotation automática**: rate limit, `Provider returned error`, `provider_unavailable`, `overloaded`, `502/503` e relatório ausente rotacionam o modelo (nemotron-550b → minimax-m3 → nemotron-free).

## Ciclo real validado (WordPress)

Fila de conteúdo no `pulso-diario` (empresa real): scheduler cria task `Fila-de-conteudo` a cada 120min → trigger `trg-editor-conteudo` (ordem de 1 objetivo: rascunho via `wp.rascunho` + postar id no chat) → agente editor executa (19.5s) → **rascunho draft no WordPress + id postado no chat da task**. Tools `wp.listar/wp.rascunho/wp.publicar` (publicar = approval "sempre") com app passwords nos secrets.

## Testes

- **393 unitários** (vitest) — inclui parser de menções, guardas, orquestrador, secretário proxy, doctor, web-format.
- **38 e2e** (Playwright) — `npm run test:e2e`.
- **Baterias cegas** (docs/tests/): etapas 01–07 PASS; 19–24 PASS (24 em ciclo 3); regressão `test blind all` no release.

## Limitações conhecidas (honestas)

- **ETAPA-08 (nuvem/backup/sync) não implementada** — spec ⬜ opcional; FAIL esperado na regressão `all`.
- **Modelos free flakam** — sessões podem travar sem resposta (rerodar); latência 1–3min por passo de agente real.
- **Tailwind via CDN** — em rede sem internet a UI perde classes utilitárias (pré-compilar é trabalho futuro).
- **Rate limit do chat (30/h/task)** dispara antes do rate guard (20/h) quando os spawns falham rápido — documentado na spec 24.
- **Self-healing/aprovals** seguem os limites do v0.1.0 (pré-voo + auditoria pós-voo).

## Próximos passos

- Fechar o editor no fluxo de publicação com revisão (team `publicacao-review`).
- Drag-and-drop no kanban; modais no lugar de `prompt()/confirm()`.
- Seed de mini-apps nas empresas; dashboards por marca.
