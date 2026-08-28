# Agentes de processo (prompts-fonte)

Esta pasta guarda as **definições-fonte** dos agentes que o opencorp instala em todo workspace novo (via `templates/default/`) e dos agentes de processo usados para construir o próprio opencorp.

## Como usar

- Para **construir o opencorp**: o implementador copia `testador-cego.md` e `revisor.md` como agentes OpenCode na raiz do projeto (`<raiz>/.opencode/agent/testador-cego.md`), para que `opencode run --agent testador-cego` funcione durante o desenvolvimento.
- Para **workspaces novos**: `executor-padrao.md` (e os demais do template) entram em `<ws>/.opencorp/agents/` e o bridge converte para o formato OpenCode em runtime.

## Arquivos

| Arquivo | Papel | Onde é instalado |
|---|---|---|
| [`executor-padrao.md`](executor-padrao.md) | Agente padrão de criação: operário base para clonar (`agent create --from executor-padrao`) | `templates/default/agents/` |
| [`secretario.md`](secretario.md) | Interface com o humano; resume registros; pede HITL | `templates/default/agents/` |
| [`ceo-documentos.md`](ceo-documentos.md) | CEO que só cria/gerencia documentos (SOPs, planos, atas) e ordena operários | `templates/default/agents/` |
| [`testador-cego.md`](testador-cego.md) | QA black-box do próprio desenvolvimento (modelo free) | `<raiz do projeto>/.opencode/agent/` |
| [`revisor.md`](revisor.md) | Audita relatório de teste + diff, aprova etapa | `<raiz do projeto>/.opencode/agent/` |

## Modificar um agente = editar um arquivo

1. Edite o `.md` aqui (para futuros workspaces) ou o arquivo instalado no workspace (efeito imediato).
2. Frontmatter controla config (`model`, `tools`, `permissions`, `budget`, `memory`); corpo é o prompt.
3. Variantes: prefira `inherits` ou `agent clone --from` em vez de duplicar conteúdo.
4. Toda mudança em agente de workspace é registrada em `registries/agentes/` (histórico de agentes para consulta geral).
