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

Todas as baterias de teste e agentes default rodam com **modelos free** (`openrouter/nvidia/nemotron-3-ultra-550b-a55b:free`, `minimax-m3:free`, `opencode/nemotron-3-ultra-free`) — rotação automática quando um provedor falha.
