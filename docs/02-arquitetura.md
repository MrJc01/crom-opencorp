# 02 — Arquitetura

## Visão em camadas

```
┌──────────────────────────────────────────────────────────────┐
│  CLI opencorp (bin/opencorp)                                 │
│  init · settings · workspace · agent · registry · template   │
│  session · run · subcorp · test · doctor · cloud             │
└───────────────┬──────────────────────────────────────────────┘
                │ chama
┌───────────────▼──────────────────────────────────────────────┐
│  CORE (src/core)                                             │
│  ├─ SettingsStore    — settings global/workspace (JSON+zod)  │
│  ├─ WorkspaceManager — criar/listar/trocar workspaces        │
│  ├─ AgentStore       — CRUD de agentes (.md + frontmatter)   │
│  ├─ RegistryStore    — registros globais por categoria       │
│  ├─ SessionManager   — spawn/kill de sessões OpenCode        │
│  ├─ OpenCodeBridge   — converte agente opencorp → opencode   │
│  ├─ SecurityGuard    — intercepta comandos (policy JSON)     │
│  ├─ BudgetManager    — teto de gastos, pausa, notificação    │
│  └─ Journal          — append-only (execuções, custos, logs) │
└───────────────┬──────────────────────────────────────────────┘
                │ spawn (child_process / node-pty)
┌───────────────▼──────────────────────────────────────────────┐
│  SESSÕES OPENCODE (opencorp run --agent X -m provider/model) │
│  cada agente = sessão isolada, CWD = workspace               │
└───────────────┬──────────────────────────────────────────────┘
                │ grava/consulta
┌───────────────▼──────────────────────────────────────────────┐
│  ARMAZENAMENTO                                               │
│  ~/.opencorp/ (global) + /workspaces/<id>/.opencorp/ (corp)  │
│  JSON (config) · MD (agentes, docs) · JSONL (journals)       │
│  SQLite (índice de registros e sessões)                      │
└──────────────────────────────────────────────────────────────┘
```

## Estrutura de pastas do projeto

```
opencorp/
├── bin/opencorp.mjs            # entrypoint executável
├── src/
│   ├── cli/                    # comandos (commander)
│   │   ├── index.ts            # setup do programa
│   │   └── commands/           # settings.ts, workspace.ts, agent.ts, ...
│   ├── core/                   # módulos core (tabela acima)
│   ├── schemas/                # schemas zod (settings, agente, registro)
│   └── utils/                  # fs-safe, paths, logger
├── templates/                  # template "padrão" de workspace novo
│   └── default/                # agentes iniciais: secretario, ceo-documentos, executor-padrao
├── docs/                       # esta documentação
├── tests/                      # testes unitários (vitest)
└── package.json
```

## Estrutura de um workspace

```
/workspaces/<corp-id>/
├── .opencorp/
│   ├── config.json             # settings do workspace (sobrepõe global)
│   ├── security_policy.json    # allowlist/blocklist de comandos
│   ├── budget.json             # orçamento e consumo acumulado
│   ├── agents/                 # definições de agentes (*.md + frontmatter)
│   ├── registries/             # registros globais por categoria
│   │   ├── chats/
│   │   ├── documentos/
│   │   ├── execucoes/
│   │   ├── agentes/
│   │   ├── custos/
│   │   ├── logs/
│   │   └── custom/<nome>/
│   ├── opencode/               # gerado pelo bridge (.opencode do opencode)
│   ├── reports/testes/         # relatórios de teste cego
│   └── corp.db                 # SQLite: índice de registros/sessões
├── sandbox/                    # área livre para agentes rodarem código
├── docs/                       # documentos/SOPs (categoria documentos)
└── logs/                       # stdout/stderr bruto das sessões
```

> O **CWD de toda sessão OpenCode é o workspace** — o agente não enxerga nada fora dele (isolamento Fase A).

## Fluxo de uma ordem (exemplo end-to-end)

```
humano> opencorp agent run executor-padrao "crie o relatório de vendas em docs/"
  │
  ├─ 1. SessionManager carrega agente .opencorp/agents/executor-padrao.md
  ├─ 2. BudgetManager verifica saldo do agente/dia      → bloqueia se estourado
  ├─ 3. Journal registra INÍCIO em registries/execucoes/ (append-only)
  ├─ 4. OpenCodeBridge escreve .opencorp/opencode/agent/executor-padrao.md
  ├─ 5. spawn: opencode run --agent executor-padrao --dir <workspace> --model <modelo>
  │     └─ toda ação do agente passa pelo SecurityGuard (policy)
  ├─ 6. saída → terminal + logs/ + registries/chats/
  └─ 7. Journal registra FIM + custo (tokens×preço) em registries/custos/
```

## Stack oficial (Fase A)

| Camada | Escolha | Motivo |
|---|---|---|
| Runtime | Node.js 22 + TypeScript | igual ao ecossistema opencode |
| CLI | `commander` + `@clack/prompts` | comandos + painel de settings interativo |
| Validação | `zod` | schemas de settings/agente/registro |
| Índice | `better-sqlite3` | índice local, sem servidor |
| Spawn | `execa` / `node-pty` | sessões CLI streaming |
| Testes | `vitest` | unitários; QA externo = teste cego |

## Regras de arquitetura (não negociáveis)

1. `src/core` **não importa** `src/cli` — o core é biblioteca pura (permitirá web/API depois).
2. Toda escrita em registros passa pelo `RegistryStore` (nunca fs direto) — garante journal e permissões.
3. Toda sessão passa por `SecurityGuard` e `BudgetManager` — sem exceção.
4. Nenhum segredo dentro do workspace — chaves ficam em `~/.opencorp/secrets.json` (fora de git).
5. Journal é append-only; correção = nova entrada que referencia a anterior.

## Canais de integração (WhatsApp, Telegram, e-mail)

Integrações de mensagem (P-11) entram no opencorp como **canais** mantidos fora do core: um *gateway* externo por canal (`opencorp-channel-gateway`) recebe/envia mensagens do provider e fala com o server pelos endpoints existentes (hooks inbound `POST /hooks/:ws/:id`, `POST /notifications` como fallback, futuro `POST /canais/:canal/enviar`), mantendo dependências pesadas (Baileys, telegraf) e crashes isolados do processo do painel. O esqueleto de interface já vive em `src/core/canal.ts` (`Canal`, `RegistroDeCanais`, `CanalNotificacao`) e credenciais por canal usam os perfis de secrets `app:whatsapp:<id>` / `app:telegram:<id>` com allowlist de chats e rate limit. **Canais de integração — ver `docs/adr/ADR-0001-canais-integracoes.md`.**
