# 04 — Agentes

## Hierarquia padrão

```
[ VOCÊ (humano) ]
      │
[ 💬 secretario ]   ← traduz intenções, resume status, pede aprovações HITL
      │
[ 👔 ceo-documentos ] [ 🧠 ceo-estrategia ]   ← só criam documentos/planos e ORDENAM; não executam braçal
      │
[ 🔧 executor-padrao ] [ 🌐 browser ] [ custom ] ← operários: executam, testam, registram
```

Regra de ouro: **CEOs criam documentos e gerem a parte deles** (planos, SOPs, atas). Operários executam. Nenhum agente assume o papel do outro sem edição do arquivo.

## Definição de agente (arquivo-vivo)

Um agente é UM arquivo Markdown em `.opencorp/agents/<id>.md`. Frontmatter = config; corpo = prompt do sistema.

```markdown
---
id: executor-padrao
role: Operário
category: operario                 # ceo | secretario | operario | custom
model: opencode/grok-code          # modelo default (leve/barato)
inherits: null                     # herda de outro agente (opcional)
tools: [read, write, edit, bash, registry]
permissions: level-2               # 1=só leitura, 2=sandbox, 3=pede HITL
budget:
  daily_usd: 1.00
  max_turns: 40
memory:
  reads: [documentos, execucoes]   # categorias que pode consultar
  writes: [execucoes, logs]        # categorias que pode anexar
---

Você é o executor padrão do workspace {{workspace}}.

Regras:
1. Execute a ordem recebida sem reescrever o escopo.
2. Antes de terminar, registre o resultado em `registries/execucoes/`.
3. Se a ordem violar a security policy, recuse e registre o bloqueio.
4. Nunca gaste além do orçamento; se aproximar, pare e avise.
```

### Campos do frontmatter (schema zod)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string (kebab-case) | identificador único no workspace |
| `role` | string | rótulo humano (ex.: "Operário") |
| `category` | enum | `ceo` \| `secretario` \| `operario` \| `custom` |
| `model` | `provider/model` | modelo padrão; pode ser sobrescrito por `--model` |
| `inherits` | string? | id de outro agente para herdar prompt/tools (merge) |
| `tools` | string[] | ferramentas liberadas (whitelist) |
| `permissions` | enum | `level-1` \| `level-2` \| `level-3` (ver `07-seguranca-custos.md`) |
| `budget` | objeto | teto diário em USD e limite de turnos |
| `memory` | objeto | categorias de registro que lê (`reads`) e escreve (`writes`) |

## Criar e modificar — fácil de propósito

```bash
opencorp agent create auditor --from executor-padrao   # clona o padrão e abre editor
opencorp agent list                                    # id, categoria, modelo, status
opencorp agent show auditor
opencorp agent edit auditor                            # abre $EDITOR no .md
opencorp agent run auditor "revise os custos da semana" --model openrouter/google/gemini-2.5-flash
```

- **`--from`** é o caminho recomendado: parte do `executor-padrao` (agente padrão de criação, mantido em `templates/default/agents/executor-padrao.md`).
- Editar o `.md` com qualquer editor é 100% equivalente aos comandos.
- `inherits` permite variantes enxutas: um `auditor-rapido` que herda tudo do `auditor` e só troca o modelo.
- Alterações em agentes são registradas em `registries/agentes/` (quem mudou o quê, quando) — consulta geral.

## Categorias e o que cada uma pode fazer (padrão, editável)

| Categoria | Pode | Não pode |
|---|---|---|
| `ceo` | criar documentos/planos (categoria `documentos`), emitir ordens a operários | executar código, gastar além do budget do dia |
| `secretario` | conversar com humano, resumir registros, pedidos de HITL | alterar config, escrever em `execucoes` |
| `operario` | executar em sandbox, escrever `execucoes`/`logs` | criar apagar registros de outros, mudar config |
| `custom` | o que o arquivo definir | — |

## Sessões separadas (isolamento)

- Cada `opencorp agent run` cria **uma sessão OpenCode nova** (ou continua com `--session <id>`).
- `opencorp session list` mostra sessões vivas/históricas; `opencorp session log <id>` imprime a transcrição; `opencorp session kill <id>` mata.
- O transcript completo vai para `registries/chats/<sessao>/` — histórico de chat consultável por todos os agentes (respeitando `memory.reads`).

## O bridge para o OpenCode

Ao rodar, o `OpenCodeBridge` converte o agente opencorp → agente opencode:

```
.opencorp/agents/executor-padrao.md  →  .opencorp/opencode/agent/executor-padrao.md
  (frontmatter opencorp)                (frontmatter opencode: description, model, tools, permissions)
```

e executa:

```bash
opencode run --agent executor-padrao --model <model> --dir <workspace> "<ordem>"
```

Isso mantém o opencorp agnóstico: qualquer recurso novo do OpenCode (agents, MCP, permissions) pode ser exposto no frontmatter sem quebrar o formato.
