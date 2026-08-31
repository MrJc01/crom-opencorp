# 08 — Referência CLI

Binário: `opencorp` (em `bin/opencorp.mjs`). Convenções: `--workspace <id>` sobrepõe o ativo; `--json` imprime saída machine-readable; `-y` pula confirmações.

## Geral

```bash
opencorp init [--dir .]        # prepara repo: estrutura, settings global, template default
opencorp doctor                # diagnóstico: node, opencode no PATH, configs válidas, segredos fora dos ws
opencorp --version
opencorp <cmd> --help
```

## settings (painel de configurações)

```bash
opencorp settings                        # painel TUI interativo
opencorp settings list [--scope global|workspace]
opencorp settings get <chave>
opencorp settings set <chave> <valor> [--scope global|workspace]
opencorp settings edit [--scope ...]
opencorp settings path
opencorp settings reset <chave> [--scope ...]
```

## workspace

```bash
opencorp workspace create <id> [--template <tpl>]
opencorp workspace list
opencorp workspace show [id]
opencorp workspace delete <id>
opencorp use <id>                # workspace ativo
opencorp workspace current
```

## agent

```bash
opencorp agent create <id> [--from <agente>] [--model provider/model]
opencorp agent list [--categoria ceo|secretario|operario|custom]
opencorp agent show <id>
opencorp agent edit <id>
opencorp agent clone <origem> <destino>
opencorp agent run <id> "<ordem>" [--model m] [--session id] [--file f]
           [--gatilho <tipo>:<origem>]
# --gatilho declara quem ativa a execução no ledger unificado (corp.db `execucoes`):
#   manual|cron|evento|mencao|webhook|dependencia|padrao|turno  (ex.: --gatilho cron:sch-abc)
opencorp agent history <id>       # últimas execuções (registries/execucoes)
opencorp agent cost <id>          # gasto acumulado (registries/custos)
```

## session

```bash
opencorp session list [--agent <id>]
opencorp session log <id>
opencorp session kill <id>
```

## run (ordem rápida no ativo)

```bash
opencorp run "<ordem>" [--agent executor-padrao] [--gatilho <tipo>:<origem>]   # atalho de agent run
```

## flow (durável — retomada)

```bash
opencorp flow run <id> [--entrada texto] [--model m]
opencorp flow status <id>                              # última execução, status por nó
opencorp flow resume <id> <execId> [--model m]         # retoma execução FALHA do último nó ok
# nós "ok" do run anterior não re-executam; o contexto final é preservado (mesmo exec)
```

## registry (registros globais)

```bash
opencorp registry list [categoria]
opencorp registry create <cat>/<id> -d "<descrição>" [--perm-leitura x] [--perm-escrita y]
opencorp registry get <cat>/<id>
opencorp registry update <cat>/<id> [--conteudo s|--conteudo-arquivo f] [--descricao s]
opencorp registry log <cat>/<id> "<anotação>"      # só anexa no journal
opencorp registry perms <cat>/<id> [--leitura l] [--escrita w] [--meta m]
opencorp registry search "<termo>"
opencorp registry reindex                          # reconstrói SQLite a partir das pastas
```

## approvals (HITL)

```bash
opencorp approvals list
opencorp approvals approve <id>
opencorp approvals reject <id> --motivo "..."
```

## budget

```bash
opencorp budget status [--workspace id]
opencorp budget set --daily-usd 5 --per-agent-usd 1
```

## template & subcorp

```bash
opencorp template list
opencorp template create <id>
opencorp template export <ws> [-o arquivo.corp]
opencorp template import <pasta|arquivo.corp|url> [--as id]
opencorp subcorp add <path|template> --as <id> [--perm read|ask|write]
opencorp subcorp list
opencorp subcorp remove <id>
```

## test (teste cego)

```bash
opencorp test blind <etapa> [--model provider/model] [--timeout min] [--list]
# <etapa>: número ("01") ou fragmento ("workspaces") de docs/tests/ETAPA-XX-*.md; "all" roda todas em sequência
# rotação automática de modelos free em rate limit/timeout (settings tests.rotation)
# relatório e logs em .opencorp/reports/testes/ · exit 0 = PASS, 1 = FAIL
opencorp test blind all          # regressão completa + relatório consolidado
```

## cloud (opcional — ETAPA 8)

```bash
opencorp cloud configure        # wizard de perfis (backup-local | backup-nuvem | mirror-remoto)
opencorp cloud backup           # executa backup agora
opencorp cloud sync [--dry-run]
opencorp cloud status           # último backup, diffs pendentes, saúde dos remotos
```

## Exit codes

| Código | Significado |
|---|---|
| 0 | sucesso |
| 1 | erro genérico do comando |
| 2 | config/schema inválido |
| 3 | bloqueio do SecurityGuard |
| 4 | orçamento esgotado |
| 5 | HITL pendente/negado |
