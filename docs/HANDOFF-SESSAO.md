# Handoff de sessão — opencorp (cole este contexto ao trocar de chat)

## Objective
- Continuar o **opencorp** — Sistema Operacional de Empresas Autônomas CLI-first sobre OpenCode (`/home/j/Documentos/GitHub/crom-worker-opencode`, usuário fala PT-BR).
- Plano ativo: `docs/13-plano-extensoes-plataforma.md`. Etapas 19–24 ✅ PASS e commitadas. **ETAPA 25 em andamento**: doctor ✅, e2e permanente 38/38 ✅, regressão `test blind all` — VERIFICAR se terminou (ver "Estado do ambiente"). Falta: veredicto da regressão → docs/13 → **tag v0.3.0** + docs/release-v0.3.0.md.
- Modo **Custo Zero**: baterias e agentes default 100% free (`openrouter/nvidia/nemotron-3-ultra-550b-a55b:free`, `minimax/minimax-m3:free`, `opencode/nemotron-3-ultra-free`; rotation automática em erro de provedor). **Modificações de código o orquestrador (GLM) faz direto** — subagentes free só para análise/leitura (pedido do usuário).

## Estado do ambiente VIVO (não é o ~/.opencorp default!)
- Home ativa: **`/tmp/opencorp-smoke24`** — 4 workspaces/empresas: `pulso-diario` (ativo), `engenhar`, `emporio-aurora`, `norteia` = sites WordPress reais do usuário.
- Servidor web: `node bin/opencorp.mjs serve --port 4300 --token watch24 --host 0.0.0.0` (daemon, pidfile `api.pid`) — LAN: `http://192.168.18.15:4300` (token `watch24`).
- Daemons vivos (pidfiles em `<home>/.opencorp/`): scheduler (tick 30s; checar-site 30min ×4; fila-conteudo 120min → task `Fila-de-conteudo` → trigger `trg-editor-conteudo` → agente editor) e supervisor. Secretário NATIVO no ar (opencode-server.json, porta dinâmica).
- **REGRA DE OURO (incidente 30/08)**: NUNCA matar processo `opencode*`/`node` sem pidfile nosso (`api.pid`, `scheduler.pid`, `supervisor.pid`, `opencode-server.json`) — derrubamos a interface do usuário 1×. Os demais: perguntar antes.
- Relatório da regressão blind all aparece em `.opencorp/reports/testes/` (gitignored) — extrair veredito da ÚLTIMA linha `VEREDITO:` (ler na mão se o formato desviar).

## Trabalho desta sessão (TUDO commitado — working tree limpo)
1. **Commits em blocos**: feat(teams etapa 24) · feat(web UI v3 TS) · feat(secretario opencode nativo) · feat(api rotas /teams + /secretario) · fix(test-blind rotação) · spec 24 · auditoria web · doctor 25 · e2e 38/38 · README v0.3.0 · agente frontend-especialista (template + 4 empresas vivas sincronizadas).
2. **ETAPA 24 PASS 5/5 (ciclo 3)** — fixes no caminho: parser de menções `@agente:<id>` completo (task-store), POST /teams preenche `criado_em`, rotação do test blind em erros genéricos de provedor (`provider_unavailable`, `overloaded`, `502/503`, relatório ausente). Runner marcou TIMEOUT pós-gravação do relatório — veredito extraído do conteúdo (mesmo padrão da 23).
3. **Spec ETAPA-23 cenário 5** corrigida: greps no bundle `curl :PORTA/app/views/apps.js` (HTML não tem mais JS inline).
4. **Bug de login FECHADO**: causa raiz = `clearAuth()` descartava o EventSource sem fechar (socket órfão seguia "conectado" com login na tela) + interval de 8s gerava 401-loop eterno. Fix: `sairParaLogin` fecha SSE ANTES do clearAuth + clearInterval; `clearAuth` fecha ES; guard no `onopen` (sem token → fecha e não pinta conectado). Validado com repro Playwright (401 forçado → 0 sockets abertos).
5. **Suíte e2e permanente 38/38 PASS**: playwright.config (webServer 4399 isolado, `OPENCORP_HOME=/tmp/opencorp-e2e`, `OPENCODE_SERVER_BIN=fake-opencode.mjs`) + tests/e2e/* (13 specs) + `npm run test:e2e`. Bugs achados: hash router v3 gravava `#view` mas specs esperam `#/view` (router normalizado); caminho do fake no config tinha `..` a mais → ENOENT → uncaughtException matava o webServer; seletores `.card`/`.team-card` com hasText; GET /teams retorna `passos` como CONTAGEM (view tratava como array → "undefined passo(s)"); seeder duplica jobs/tasks entre testes (usar `.first()`/task exclusiva).
6. **Auditoria frontend (painel 3 especialistas via subagente) + fixes**: escapeHtml estava CORROMPIDO (XSS real), hamburger/backdrop/logout, refresh 8s não-destrutivo (secretário/inputs/drawer), api() com contrato de erro (4xx→toast com {erro}, timeout 15s GETs, rede caída), feed incremental, cores da timeline, contraste WCAG (accent #2563eb, baixa/version), mobile CSS (16px inputs, 44px touch, wrap, dvh, viewport-fit), apps sem tela preta, aria-label no enviar do secretário.
7. **Trigger editor + WordPress validados**: ordem simplificada (1 objetivo: rascunho via wp.rascunho + postar id no chat; NÃO mover/publicar). Ciclo completo OK: task → editor (19.5s) → rascunho 12 draft no WP → "rascunho 12 criado" no chat. Modelos free flakam (1ª sessão travou 170s sem resposta — rerodar).
8. **Doctor etapa 25**: scheduler (pid órfão + jobs ativos), hooks/apps/teams (specs inválidos), secretário (parado=ok, porta). 34 testes.
9. **Agente `frontend-especialista`** no template default: painel de 3 especialistas (arquiteto UX, designer mobile-first, eng. a11y) com checklist de responsividade. Testes 4→5 agentes atualizados (393 unitários verdes). Sincronizado nas 4 empresas.
10. **README.md (raiz, novo) v0.3.0** + docs/README índice apontando plano 13.

## Pendências (ordem sugerida)
1. **Regressão `test blind all`** — se ainda rodando, esperar (pidfile do processo em voo; relatório por spec em `.opencorp/reports/testes/`). Ao terminar: veredicto consolidado → docs/13 status 25 → commit. Fix se FAIL (máx 3 ciclos).
2. **TAG v0.3.0** + `docs/release-v0.3.0.md` (seguir padrão do release-v0.1.0.md).
3. Opcional: seed de apps nas 4 empresas; fechar editor no fluxo de publicação com revisão (team `publicacao-review` já criado no pulso-diario — recriá-lo com o CLI novo se necessário).
4. Ideia futura: drag-and-drop no kanban; Tailwind pré-compilado (hoje usa CDN — em rede sem internet a UI perde classes utilitárias); limpar prompts()/confirm() nativos por modais.

## Detalhes que salvam tempo
- **Test blind**: relatórios em `.opencorp/reports/testes/` (gitignored); veredito na ÚLTIMA linha `VEREDITO:` (ler na mão se desviar); home isolada é mkdtemp mas a SPEC manda usar `/tmp/opencorp-cego-e<n>` (rm -rf antes); spec com servidor DEVE mandar `serve` daemon + `serve stop` e proibir `--foreground`/`pkill`. Rotação de modelos cobre rate limit, "Provider returned error", `provider_unavailable`, `overloaded`, 502/503 e relatório ausente.
- **Bateria com agentes reais**: cada passo do team run demora 1-3min (free flaky). Rate limit do chat = 30 msgs/h/task (bloqueia ANTES do rate guard de 20/h quando spawn falha rápido — spec 24 documenta isso).
- **Secretário**: POST /session/:id/message do opencode serve É síncrono (retorna assistant direto; usar timeout 240s); `agent` no BODY; sessões antigas grudam no modelo da criação; agentes copiados crus quebram opencode — SEMPRE via bridge (`gerarAgenteOpencode`).
- **Web**: `configurarIconesIniciais` idempotente; router usa `#/view` (navegar() seta `'/' + hash`); specs cegas fazem grep em `/app/views/apps.js`; server injeta `?v=<boot>` + `no-cache`.
- **Playwright e2e**: webServer 4399 isolado; global-setup recria /tmp/opencorp-e2e (safe); fake-opencode responde sync com `info.role="assistant"` e parts textuais; NUNCA rodar `npm run build` com bateria em voo (dist trocado em voo) — `npx tsc -p tsconfig.web.json` (só web-dist) é seguro se a bateria não faz curl no bundle.
- **Scheduler spawn não tem timeout**; trigger CLI não expõe filtro — escrever JSON direto em `<home>/.opencorp/triggers/`.
- Gasto total antes do custo-zero: $16.81/5d. Hoje: tudo free.
