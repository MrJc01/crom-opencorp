---
name: git-ops
description: Criação de checkpoints, commits semânticos, gestão de branches e reconciliação de repositórios.
allowed-tools: [git, bash]
category: Desenvolvimento
---

# Git Ops Skill

Esta skill padroniza o fluxo de controle de versão Git para agentes autônomos no OpenCorp.

## Padrões de Commits Semânticos
- `feat(...)`: Adição de nova funcionalidade
- `fix(...)`: Correção de bug ou regressão
- `refactor(...)`: Mudança interna de código sem alterar comportamento
- `test(...)`: Adição ou correção de testes
- `docs(...)`: Alteração em documentações

## Regras Operacionais
1. **Checkpoints Isolados**: Sempre verifique `git status --short` e `git diff --check` antes de comitar.
2. **Sem Arquivos Operacionais Alheios**: Nunca inclua artefatos de logs transitórios ou saídas temporárias de pipelines.
3. **Mensagens Diretas**: Descreva o que e o porquê da alteração no tempo presente em português ou inglês conciso.
