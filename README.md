# opencorp — Sistema Operacional de Empresas Autônomas

**opencorp** é um sistema **CLI-first** que roda empresas com agentes de IA sobre o [OpenCode](https://opencode.ai). Cada workspace ("corp") é uma empresa de agentes com hierarquia (CEO → operários), registros, custos e governança por arquivos legíveis (Markdown/JSON/SQLite).

> Filosofia: **tudo é arquivo** — agentes, settings, teams, apps e triggers vivem em texto versionável; o painel web (v3, TypeScript) é espelho dos comandos.

## Instalação

```bash
npm install
npm run build        # dist/ (core+CLI+API) e web-dist/ (UI v3)
node bin/opencorp.mjs --version
```

Requisitos: Node.js >= 22, OpenCode >= 1.18 no PATH (`opencode`).

## Quickstart

```bash
# 1. Criar uma empresa (workspace) com template default
opencorp workspace create minha-empresa

# 2. Agentes e sessões reais (modelos free por padrão)
opencorp agent list
opencorp run "liste os arquivos e resuma" --agent executor-padrao

# 3. Task board com chat interno
opencorp task create --titulo "Checar fila de conteúdo"
opencorp task chat <id> --msg "@executor-padrao dá uma olhada"

# 4. Rotinas agendadas (scheduler daemon)
opencorp schedule create checar-fila --tipo intervalo_min --valor 60 --args "task create --titulo 'Checagem'"
opencorp scheduler start

# 5. Servidor API + painel web (v3)
opencorp serve --port 4300 --token <seu-token>
opencorp web --port 4300

# 6. Teams multi-agente (etapa 24): pipeline | fanout | review | debate
opencorp team create conteudo --titulo "Produz conteúdo" --padrao pipeline \
  --passo "executor-padrao:redija: {{entrada}}" \
  --passo "executor-padrao:revise: {{anterior}}"
opencorp team run conteudo --entrada "automação de empresas"

# 7. Secretário nativo (opencode serve + MCP)
curl -X POST -H "Authorization: Bearer <token>" localhost:4300/secretario/start

# 8. Diagnóstico completo (etapa 25)
opencorp doctor
```

## O que tem dentro (v0.3.0)

| Área | Destaques |
|---|---|
| Task board + chat | Kanban por workspace, chat por task com menções, guardas de menção (loop/rate/lease) |
| Scheduler | Daemon com cron/intervalo/data única, dedup, graça de atraso |
| Webhooks & triggers | Hooks públicos com token/allowlist/dedup; triggers declarativos por evento |
| Tools + MCP | Registry plugável (comando/http/interno), rate limit, approval; servidor MCP stdio |
| Mini-apps | Apps declarativas (`<ws>/.opencorp/apps/*.json`) renderizadas no web |
| Teams | Orquestração multi-agente: pipeline, fan-out com barreira, revisão cruzada, debate |
| Secretário | `opencode serve` nativo com MCP, chat síncrono, agentes secretário/secretário-exec |
| Web v3 | UI TypeScript modular, login, agenda, reuniões, fluxos, histórico, teams, mini-apps |
| Doctor | Diagnóstico: node, opencode, settings, budget, scheduler, hooks, apps, teams, secretário |

## Testes

```bash
npm test                # testes unitários (vitest)
npm run test:e2e        # suíte Playwright (sobe servidor isolado na porta 4399)
opencorp test blind 24  # bateria cega por etapa (modelo free, sem ler código)
opencorp test blind all # regressão completa
```

## Documentação

Ver [`docs/README.md`](docs/README.md) — índice completo (visão, arquitetura, CLI, segurança, planos por etapa).

## Modo Custo Zero

Todas as baterias de teste e agentes default rodam com **modelos free** — rotação automática quando um provedor falha.

**Rotação atual** (`~/.opencorp/settings.json`, validada por bench 30/08): pool 1 = AI Studio BYOK (`google/gemini-3.5-flash-lite` default — PASS 7/7 em 61s, `google/gemini-3.1-flash-lite` 101s); pool 2 = OpenRouter free (`z-ai/glm-5.2:free`, `minimax-m3:free`, `nemotron-3.5-lightning:free`, `gemma-4-31b-it:free`) — pools de cota independentes.

⚠ **Limites de cota**: OpenRouter tem cota diária de requests a free models por CONTA (`free-models-per-day-high-balance`) que já esgotou e gerou FAILs falsos; AI Studio free é cota própria. Antes de baterias longas, rodar `test blind` (health-check pula modelos mortos).

## Onde encontrar tudo (mapa da sessão 30/08/2026)

| O quê | Onde |
|---|---|
| **4 empresas reais (workspaces persistentes)** | `~/.opencorp/workspaces/{pulso-diario,engenhar,emporio-aurora,norteia}` — migradas do /tmp efêmero |
| Perfis editoriais das empresas | `<ws>/.opencorp/projeto.json` (empresa, nicho, público, tom, tópicos) |
| Credenciais WordPress | `~/.opencorp/secrets.json` (chaves `wp_<site>_user/_pass`) |
| Ponte WP (função a chamar) | `<ws>/scripts/wp.cjs` — modos: `pages/posts/ver/settings/page post/update/configurar/delete` |
| **Catálogo de function calling** | `templates/default/docs/testes-site/FERRAMENTAS.md` (+ em cada `<ws>/docs/testes-site/`) — contratos exatos que os agentes chamam via bash (wp_*, registro_*, agente_run) |
| Agentes específicos de site | `<ws>/.opencorp/agents/{critico-site,corretor-site}.md` (model `google/gemini-3.5-flash-lite`) |
| Specs de auditoria de site | `<ws>/docs/testes-site/{AUDITORIA-01-identidade,02-conteudo,03-tecnico}.md` + `CICLO-AUTO-GESTAO.md` (playbook: analisar→priorizar→corrigir→verificar→melhorar) |
| Pareceres e execuções do ciclo | `<ws>/registries/documentos/PARECER-*.md` e `<ws>/registries/execucoes/*.md` |
| Plano de estabilização (fases 0-5) | [`docs/PLANO-ESTABILIZACAO.md`](docs/PLANO-ESTABILIZACAO.md) — Fase 0 (telemetria ✅ commit c5a3390), Fase 1 (bench ✅ parcial) |
| Handoff da próxima sessão | [`docs/HANDOFF-SESSAO.md`](docs/HANDOFF-SESSAO.md) |
| Telemetria de baterias cegas | `.opencorp/reports/testes/logs/events-<execid>.jsonl` (fail_cat: provider_error/rate_limit/timeout_harness/product_bug/spec_divergence) |
| Bench pendente OpenRouter | agenda em `/tmp/opencode/bench-f1/agenda.sh` (roda às 00:05 UTC, 10 modelos × etapa-02) |

### Como rodar o ciclo de auto-gestão (1 empresa, ~10 min)

```bash
cd /home/j/Documentos/GitHub/crom-worker-opencode

# 1. Análise (UMA spec por execução — conversas longas quebram a API do Google)
node bin/opencorp.mjs agent run critico-site --workspace pulso-diario \
  "Execute SOMENTE a spec docs/testes-site/AUDITORIA-01-identidade.md usando o catálogo FERRAMENTAS.md. Grave registries/documentos/PARECER-AUDITORIA-01-<data>.md com VEREDITO."
# (repetir para 02 e 03)

# 2. Correção (se parecer FAIL)
node bin/opencorp.mjs agent run corretor-site --workspace pulso-diario \
  "Execute as correções do parecer registries/documentos/PARECER-*.md. Verifique pós-correção e grave registro com VEREDITO."

# 3. Melhoria (se 0 FAIL crítico) — editor publica da fila de rascunhos
node bin/opencorp.mjs agent run editor --workspace pulso-diario "Publique os rascunhos da fila C6 do parecer AUDITORIA-02..."
```

### Lições validadas (30/08)

- **1 spec por execução de agente** — sessões longas morrem no meio ("Requests ending with a model turn are not supported", API Google); sessões curtas = 100% de sucesso
- **Function calling via catálogo** (FERRAMENTAS.md) funciona — modelos seguem contratos literais; MCP server real é backlog
- **agente_run** (`node bin/opencorp.mjs agent run <id> --workspace <ws> "<ordem>"`) é a forma de um agente chamar outro
- bin roda `dist/`, não `src/` — rebuild obrigatório após mudanças antes de validar via CLI
