# opencorp — Documentação Oficial

**opencorp** é um Sistema Operacional de Empresas Autônomas, **CLI-first**, construído sobre o [OpenCode](https://opencode.ai). Cada "corp" (workspace) é uma empresa de agentes com hierarquia (CEO → operários), registros globais, histórico de custos e governança por arquivos legíveis.

> **Filosofia:** tudo é arquivo. Agentes, configurações, registros e históricos vivem em Markdown/JSON/SQLite — fáceis de ler, editar, versionar com git e, no futuro, expor numa UI web sem mudar o core.

---

## Como usar esta documentação

| Você é... | Comece por |
|---|---|
| Humano querendo entender o projeto | `01-visao-geral.md` → `02-arquitetura.md` |
| **Agente implementador** (vai construir o opencorp) | `10-plano-e-checklist.md` ← **SEU PONTO DE PARTIDA** |
| Agente testador cego | `agents/testador-cego.md` + `tests/` |
| Quem vai criar/editar agentes | `04-agentes.md` + `agents/README.md` |
| Quem vai configurar o sistema | `06-painel-configuracoes.md` |

---

## Índice

| # | Documento | Conteúdo |
|---|---|---|
| 01 | [Visão geral](01-visao-geral.md) | O que é, conceitos, princípios, roadmap |
| 02 | [Arquitetura](02-arquitetura.md) | Camadas, módulos, estrutura de pastas, stack |
| 03 | [Workspaces, templates e subcorp](03-workspaces-templates-subcorp.md) | Empresas isoladas, pacotes .corp, reuso |
| 04 | [Agentes](04-agentes.md) | Hierarquia, definição, criação/modificação fácil |
| 05 | [Registros e memória](05-registros-e-memoria.md) | Categorias de registros, histórico, custos, logs |
| 06 | [Painel de configurações](06-painel-configuracoes.md) | Settings global/workspace/agente, schema JSON |
| 07 | [Segurança e custos](07-seguranca-custos.md) | Guardrails, permissões, budget, HITL |
| 08 | [Referência CLI](08-cli-referencia.md) | Todos os comandos do `opencorp` |
| 09 | [Testes cegos](09-testes-cegos.md) | Protocolo de QA com modelos leves/free |
| **10** | [**Plano Fase A (concluída)**](10-plano-e-checklist.md) | Etapas 0–7 ✅ — histórico e protocolo |
| 11 | [Nuvem: backup e sync](11-nuvem-backup-sync.md) | Estratégia de backup/sincronização (opcional) |
| 12 | [Plano Fase B/C](12-plano-fase-b-c.md) | Fechamento A + Boardroom + Supervisor + Flows + Web (v0.2) |
| **13** | [**Plano Extensões da Plataforma (ATUAL)**](13-plano-extensoes-plataforma.md) | **Etapas 19–25: Tasks, Scheduler, Webhooks, Tools/MCP, Mini-apps, Teams, v0.3.0** |
| 14 | [Análise multi-agente + chat de tasks](14-analise-multiagente-tasks.md) | Padrões de orquestração e chat interno |
| 15 | [Gestão de Operação](15-gestao-operacao.md) | Tasks, Agenda, Fluxos, Teams, Reuniões, hooks — como funciona (consulta) |

### Pastas auxiliares

- [`agents/`](agents/README.md) — Prompts e definições dos agentes de processo (executor padrão, testador cego, revisor)
- [`tests/`](tests/README.md) — Specs de teste cego por etapa + relatórios

---

## Fluxo de trabalho resumido (agente + humano)

```
1. Agente implementador lê docs/10-plano-e-checklist.md
2. Implementa a etapa atual (código + auto-verificação)
3. Dispara TESTE CEGO: opencode run --agent testador-cego -m <modelo-free>
   → o testador NÃO lê código-fonte, só executa o CLI conforme a spec em docs/tests/
4. Relatório PASS/FAIL salvo em .opencorp/reports/testes/
5. Se FAIL → implementador corrige → repete (máx. 3 ciclos → escalar ao humano)
6. Revisor final valida → checkboxes marcados → commit → próxima etapa
```

Modelos leves/free sugeridos para teste (verificar com `opencode models`):
`opencode/hy3-free` · `opencode/mimo-v2.5-free` · `opencode/nemotron-3-ultra-free` · `openrouter/cohere/north-mini-code:free`
