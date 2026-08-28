# Spec de Teste Cego — ETAPA 04: Agentes e Sessões OpenCode

**Setup:** workspace ativo `test-agentes` (crie com `workspace create test-agentes && use test-agentes`). `opencode` deve estar no PATH. Use modelo free nos testes de execução: `opencode/hy3-free`.

## Cenários

### 1. Listar agentes do template
- Comando: `node bin/opencorp.mjs agent list`
- Esperado: exit 0; mostra id, categoria e modelo de cada agente (ex.: `executor-padrao`, `secretario`, `ceo-documentos`).

### 2. Criar agente a partir do padrão
- Comando: `node bin/opencorp.mjs agent create auditor --from executor-padrao`
- Esperado: exit 0; `agent list` agora inclui `auditor`; `agent show auditor` mostra papel/modelo.

### 3. Definição é arquivo editável
- Comando: localize o arquivo do agente `auditor` (dica: `agent show auditor` deve indicar o caminho; senão procure `<workspace>/.opencorp/agents/auditor.md`) e `cat` dele.
- Esperado: arquivo Markdown legível com frontmatter (campos como `id`, `model`, `permissions`) e prompt em texto. Marque o caminho no relatório.

### 4. Editar frontmatter muda comportamento visível
- Comandos:
  1. Edite o arquivo `auditor.md`: mude `model` para `opencode/mimo-v2.5-free` (edite com sed/append — você pode editar, é um arquivo de dados, não código-fonte do opencorp).
  2. `node bin/opencorp.mjs agent show auditor`
- Esperado: o show reflete o novo modelo sem reiniciar nada.

### 5. Run real de um agente
- Comando: `node bin/opencorp.mjs agent run auditor "crie o arquivo sandbox/probe.txt com o conteúdo ok" --model opencode/hy3-free --title cego-e04-run1`
  - (timeout: 180s; se pendurar, mate e FAIL "timeout")
- Esperado: exit 0; saída visível da sessão; arquivo `sandbox/probe.txt` existe dentro do workspace com conteúdo "ok".

### 6. Histórico da execução
- Comando: `node bin/opencorp.mjs agent history auditor`
- Esperado: exit 0; mostra a execução do cenário 5 (status, horário). Se histórico ainda for básico, aceite o essencial: a execução aparece.

### 7. Session log
- Comando: `node bin/opencorp.mjs session list` e depois `node bin/opencorp.mjs session log <id-da-sessao-do-cenário-5>`
- Esperado: a sessão aparece listada (com agente/modelo); o log contém a conversa/transcript da execução.

### 8. Clone
- Comando: `node bin/opencorp.mjs agent clone auditor auditor-jr` + `agent list`
- Esperado: `auditor-jr` existe e herda o modelo/metadata de `auditor`.

## Relatório

Formato da doc 09. Anote custos percebidos se o CLI exibir.
