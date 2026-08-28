# 09 — Testes Cegos (metodologia)

## O conceito

Um **teste cego** é executado por uma sessão OpenCode separada — o **testador cego** — com um **modelo leve ou free**, que valida o opencorp **pela porta de entrada do CLI**, como um usuário faria:

- ✅ Pode: rodar comandos, ler docs/tests/ (a spec), criar workspaces de teste, observar saídas.
- ❌ Não pode: ler `src/`, `bin/`, `package.json` internals, nem qualquer código do opencorp. **Blind = black-box.**

Isso evita dois problemas clássicos de QA automatizado:

1. **Ensinar ao teste**: o implementador não conhece os passos exatos; o testador não conhece a implementação.
2. **Custo**: o testador usa modelo free (ex.: `opencode/hy3-free`), gastando ~$0.

## Papéis

| Papel | Sessão | Modelo | Lê | Escreve |
|---|---|---|---|---|
| **Implementador** | opencode principal | forte (ex.: glm-5.3-flash, gemini-2.5-pro) | `docs/10-plano-e-checklist.md`, código, docs/ | código, checklist |
| **Testador cego** | `opencode run --agent testador-cego` | leve/free (`test_model`) | **só** `docs/tests/ETAPA-0X.md` | relatório em `.opencorp/reports/testes/` |
| **Revisor** | `opencode run --agent revisor` | médio | relatório de teste + diff | veredito |

## Protocolo (ciclo por etapa)

```
1. Implementador termina a etapa e roda a auto-verificação (comandos da própria etapa).
2. Implementador dispara o teste cego:
     opencode run --agent testador-cego \
       --model opencode/hy3-free \
       --dir <raiz-do-projeto> \
       --title "cego-etapa-03" \
       "Execute a spec docs/tests/ETAPA-03.md e grave o relatório em \
        .opencorp/reports/testes/ETAPA-03-$(date +%Y%m%d-%H%M).md"
3. Testador segue a spec literalmente, cenário por cenário, gerando
   relatório PASS/FAIL com evidência (comando + saída real).
4. Implementador lê o relatório:
   - Tudo PASS → marcar etapa no checklist → commit.
   - Algum FAIL → corrigir e repetir o teste cego (ciclo novo).
5. Após 3 ciclos com FAIL → ESCALAR ao humano (parar e relatar).
```

> Cada ciclo de teste cego deve partir de **estado limpo** (a spec diz o que limpar — ex.: remover `/workspaces/test-*`). Isso torna os testes repetíveis e independentes.

## Escolha do modelo de teste

Configurado em `settings.json → tests.test_model` (ou `--model`). Requisitos: custo ~zero e bom seguimento de instruções. Candidatos verificados (`opencode models`):

- `opencode/hy3-free` (padrão sugerido)
- `opencode/mimo-v2.5-free`
- `opencode/nemotron-3-ultra-free`
- `openrouter/cohere/north-mini-code:free`
- `openrouter/dots-studio/dots-3-note-preview:free`

Se o modelo free se confundir em specs longas, degrade para um flash/mini barato — o custo continua centavos.

## Formato obrigatório do relatório

```markdown
# Relatório de Teste Cego — ETAPA-03
- Data: 2026-08-28T14:02Z
- Modelo: opencode/hy3-free
- Spec: docs/tests/ETAPA-03.md
- Veredito: **FAIL** (2 PASS · 1 FAIL)

| # | Cenário | Resultado | Evidência (comando + trecho da saída) |
|---|---------|-----------|----------------------------------------|
| 1 | criar workspace | PASS | `opencorp workspace create test-x` → "created" |
| 2 | listar workspaces | PASS | ... |
| 3 | usar workspace inexistente | FAIL | esperava erro, saiu vazio |

## Detalhes do(s) FAIL
### Cenário 3
- Comando: `opencorp use inexistente`
- Esperado: mensagem de erro + exit != 0
- Obtido: (vazio, exit 0)

## Observações gerais
- ...
```

## Regras do testador (resumo; versão completa em `agents/testador-cego.md`)

1. Nunca abrir/ler código-fonte do opencorp (`src/`, `bin/`).
2. Executar a spec na ordem; não "consertar" o sistema, não pular cenários com base em suposição.
3. Registrar evidência real (copiar trecho da saída), nunca relatar de memória.
4. Um cenário que falha **não aborta** os demais — testar tudo e reportar.
5. Se um comando pendurar (>120s), matar e marcar como FAIL com nota "timeout".
6. Manter todos os artefatos de teste em `/workspaces/test-*` (descartáveis).
