# Specs de Teste Cego

Cada `ETAPA-0X-*.md` é um **contrato de QA** executado pelo agente `testador-cego` (modelo leve/free) que só usa o CLI — ver `docs/09-testes-cegos.md`.

## Como disparar um teste

```bash
opencode run --agent testador-cego \
  --model opencode/hy3-free \
  --dir <raiz-do-projeto> \
  --title "cego-etapa-0X" \
  "Execute a spec docs/tests/ETAPA-0X-<nome>.md e grave o relatório em \
   .opencorp/reports/testes/ETAPA-0X-<timestamp>.md"
```

(ou `opencorp test blind <etapa>` quando o comando existir)

## Índice

| Spec | Valida |
|---|---|
| [ETAPA-01-bootstrap.md](ETAPA-01-bootstrap.md) | binário `opencorp`, `--version`, `doctor` |
| [ETAPA-02-settings.md](ETAPA-02-settings.md) | settings global/workspace, merge, painel |
| [ETAPA-03-workspaces.md](ETAPA-03-workspaces.md) | create/list/show/use/delete |
| [ETAPA-04-agentes-sessoes.md](ETAPA-04-agentes-sessoes.md) | agentes e sessões reais do opencode |
| [ETAPA-05-registros.md](ETAPA-05-registros.md) | registries, journal, permissões, busca |
| [ETAPA-06-templates-subcorp.md](ETAPA-06-templates-subcorp.md) | .corp e subcorp delegáveis |
| [ETAPA-07-seguranca-budget.md](ETAPA-07-seguranca-budget.md) | guard, HITL, orçamento |
| [ETAPA-08-nuvem.md](ETAPA-08-nuvem.md) | backup/sync (opcional) |

## Regras comuns a todas as specs (valem sem repetição)

1. Estado limpo: remova `/workspaces/test-*` e `~/.opencorp/settings.json` de teste antes de começar (guarde backup se já existir config real do usuário; se existir, teste com `OPENCORP_HOME`/tmpdir quando o CLI permitir — se não permitir, use os prefixos `test-` e não toque em workspaces reais).
2. Todos os cenários são executados; falha não aborta a bateria.
3. Relatório: tabela `| # | cenário | PASS/FAIL | evidência |` + veredito final, conforme formato da doc 09.
4. Proibido ler código-fonte do opencorp (`src/`, `bin/`, `*.ts`).
5. Workspaces de teste sempre com prefixo `test-`.
