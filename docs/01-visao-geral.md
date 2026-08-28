# 01 — Visão Geral

## O que é o opencorp

O **opencorp** é um **Sistema Operacional de Empresas Autônomas** dirigido por CLI. Você cria "corps" (workspaces) — cada um é uma empresa de agentes com:

- **Hierarquia de agentes**: CEO(s) que planejam e documentam, Secretário que conversa com o humano, Operários que executam.
- **Registros globais por categoria**: histórico de chats, documentos gerais, histórico de execuções, históricos de custos, logs referenciais — e qualquer categoria nova que um agente crie.
- **Governança por arquivos**: nada de banco invisível; tudo é Markdown/JSON/SQLite legível e versionável em git.
- **Isolamento**: cada workspace roda restrito à sua própria pasta.

A base é **CLI** de propósito: CLI é a API mais simples e testável. A UI web (painel, canvas visual) virá depois **reusando o mesmo core**, sem reescrever lógica.

## Relação com o OpenCode

O opencorp **não substitui** o OpenCode — ele o orquestra:

- Cada agente opencorp = uma **sessão separada** do `opencode run` com seu próprio agente/modelo/prompt.
- O opencorp gera a definição do agente em formato OpenCode (`.opencode/agent/<id>.md`) a partir da definição opencorp.
- O opencorp adiciona o que o OpenCode não tem: workspaces múltiplos, registros globais entre agentes, orçamento, histórico de execuções e governança.

## Conceitos fundamentais

| Conceito | Definição |
|---|---|
| **Workspace (corp)** | Uma empresa/projeto isolado em `/workspaces/<id>/` com config, agentes, registros e sandbox próprios |
| **Agente** | Arquivo Markdown com frontmatter (papel, modelo, ferramentas, permissões, orçamento) + prompt do sistema |
| **Sessão** | Uma instância viva do OpenCode executando um agente; cada agente tem sessões separadas |
| **Ordem** | Instrução enviada a um agente; toda ordem gera registro no histórico de execuções |
| **Registro** | Unidade de memória global com categoria, descrição, dono e permissões de leitura/modificação |
| **Template (.corp)** | Pacote exportável de um workspace (agentes + registros + configs) para reuso |
| **Subcorp** | Workspace filho importado por um pai, com escopo de permissões limitado |
| **Teste cego** | QA executado por uma sessão OpenCode com modelo leve/free que só usa o CLI, sem ler código |

## Princípios de design

1. **CLI-first**: toda funcionalidade existe primeiro como comando; a web é só uma pele.
2. **Arquivo-vivo**: agentes e registros são arquivos que humanos e agentes editam igualmente.
3. **Isolamento por workspace**: um corp nunca vê os dados de outro por padrão.
4. **Append-only para histórico**: execuções, chats e custos nunca são apagados, apenas anexados (journal).
5. **Agente modificável por arquivo**: criar/alterar um agente = editar (ou clonar) um `.md`. Sem migrations.
6. **Barato por padrão**: modelos leves/free para testes e tarefas simples; modelos fortes apenas onde precisam.
7. **HITL (humano no loop)**: ações críticas sempre exigem confirmação explícita.

## Roadmap macro

```
FASE A (CLI core)          FASE B (inteligência)        FASE C (web)
├─ settings + workspaces   ├─ reunião geral (boardroom)  ├─ API server (mesmo core)
├─ agentes + sessões       ├─ canvas visual              ├─ painel de configurações web
├─ registros               ├─ automodificação de fluxos  └─ monitoramento multi-corp
├─ templates/subcorp       └─ self-healing
├─ segurança + budget
└─ nuvem backup/sync (opcional)
```

**Este repositório está construindo a FASE A.** O plano detalhado está em `10-plano-e-checklist.md`.
