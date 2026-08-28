# 05 — Registros e Memória

O coração do conhecimento compartilhado do opencorp são os **registros globais**: unidades de memória com categoria, dono, descrição e permissões, consultáveis por todos os agentes (conforme permissões de cada um).

## Formato de um registro

Cada registro é uma pasta em `registries/<categoria>/<registro-id>/`:

```
registries/execucoes/exec-2026-08-28-001/
├── meta.json        # identidade, dono, permissões, timestamps
├── journal.jsonl    # append-only: toda criação/modificação/anotação
└── conteudo.md      # o conteúdo em si (ou dados.json, conforme o tipo)
```

`meta.json`:

```json
{
  "id": "exec-2026-08-28-001",
  "categoria": "execucoes",
  "descricao": "Ordem: criar relatório de vendas",
  "criado_por": "executor-padrao",
  "criado_em": "2026-08-28T13:00:00Z",
  "atualizado_em": "2026-08-28T13:04:12Z",
  "permissoes": {
    "leitura": ["*"],
    "escrita": ["executor-padrao", "ceo-documentos"],
    "modificacao_meta": ["ceo-documentos"]
  },
  "tags": ["vendas", "relatorio"],
  "referencias": ["registries/logs/log-2026-08-28-090"]
}
```

`journal.jsonl` (uma linha por evento, nunca editado retroativamente):

```json
{"ts":"...","por":"executor-padrao","evento":"criado","resumo":"..."}
{"ts":"...","por":"ceo-documentos","evento":"anotacao","resumo":"Formato aprovado"}
{"ts":"...","por":"executor-padrao","evento":"modificado","campo":"conteudo.md","resumo":"Adicionada tabela mensal"}
```

## Categorias padrão

| Categoria | O que guarda | Quem escreve |
|---|---|---|
| `chats/` | histórico de chat por sessão (transcrição + resumo) | auto (SessionManager) |
| `documentos/` | documentos gerais para análise de todos: SOPs, planos, atas, relatórios | CEOs, operários autorizados |
| `execucoes/` | histórico de execuções: cada ordem, resultado, duração, status | auto (Journal) + agente |
| `agentes/` | histórico de criação/modificação de agentes — consulta geral | auto (AgentStore) |
| `custos/` | históricos de custos: tokens, USD por agente/sessão/dia | auto (BudgetManager) |
| `logs/` | logs referenciais: eventos pontuais com referências a outros registros | qualquer agente |
| `custom/<nome>/` | **novas categorias globais criadas por agentes**, sempre com descrição | o que o registro definir |

## API CLI

```bash
opencorp registry list                        # todas as categorias/registros
opencorp registry list custos                 # só uma categoria
opencorp registry create notas/reuniao-0828 -d "Notas da reunião 28/08" --perm-leitura "*"
opencorp registry get execucoes/exec-2026-08-28-001
opencorp registry update notas/reuniao-0828 --conteudo "..."    # vai para o journal
opencorp registry log logs/log-2026-08-28-090 "CTO avisou quebra no scraper"
opencorp registry perms custos/custo-agosto --escrita ceo-estrategia
opencorp registry search "relatório vendas"   # busca por texto no SQLite
```

## Quem pode criar o quê

- Qualquer agente pode **criar um registro global novo** (mesmo categoria custom), desde que:
  1. traga uma `descricao` clara (exigida pelo schema);
  2. tenha permissão `level-2` ou superior;
  3. defina `permissoes` (quem lê/escreve/modifica). Padrão: leitura `*`, escrita só o criador + CEOs.
- **Modificar registro de outro agente** exige estar na lista `escrita` do registro; a tentativa negada vira evento no `logs/` (auditoria).
- A categoria `documentos` é o "território do CEO": o `ceo-documentos` mantém e organiza os SOPs/planos, mas qualquer agente com `memory.reads: [documentos]` pode consultá-los.

## Memória dupla (base para a reunião geral futura)

| Memória | Onde vive | Vida |
|---|---|---|
| **Privada** (do agente) | o que o agente lê dos registros conforme `memory.reads` | longo prazo, persistente |
| **De sessão** | transcript da conversa atual (`registries/chats/`) | curto prazo, por execução |

Na Fase B, a Reunião Geral injeta nos CEOs: (a) a memória de sessão compartilhada e (b) trechos relevantes da memória privada de cada um, consultada sob demanda — evitando estourar tokens.

## Índice SQLite (`corp.db`)

Tabelas mínimas: `registros(id, categoria, descricao, criado_por, criado_em, atualizado_em, tags)`, `journal(registro_id, ts, por, evento, resumo)`, `sessoes(id, agente, modelo, inicio, fim, custo_usd, status)`. O SQLite é **índice derivado** — a verdade está nos arquivos; se o DB sumir, um `opencorp registry reindex` reconstrói varrendo as pastas.
