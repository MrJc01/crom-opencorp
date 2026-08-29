# Spec de Teste Cego — ETAPA 18: Cliente Cria Empresa (E2E)

Jornada real de um cliente fundando uma empresa com opencorp, do zero até ver trabalho acontecendo.

**Setup:** home isolada, sem workspaces `test-`. Modelo dos agentes: `opencode/nemotron-3-ultra-free` (use `--model` onde existir a opção; em `agent create` edite o frontmatter se necessário). Teto de tempo por reunião: o default (não aumente). Pautas curtas e objetivas.

## Cenários

### 1. Fundar a empresa
- Comandos:
  1. `node bin/opencorp.mjs workspace create test-startup`
  2. `node bin/opencorp.mjs use test-startup`
  3. `node bin/opencorp.mjs agent list`
  4. `node bin/opencorp.mjs workspace show test-startup`
- Esperado: exit 0 em todos; `agent list` mostra ao menos `ceo-documentos`, `executor-padrao`, `secretario`; `workspace show` exibe orçamento/limites.

### 2. Contratar especialistas (departamentos)
- Comandos:
  1. `node bin/opencorp.mjs agent create dev-produto --from executor-padrao --model opencode/nemotron-3-ultra-free`
  2. `node bin/opencorp.mjs agent create analista-mercado --from executor-padrao --model opencode/nemotron-3-ultra-free`
  3. `node bin/opencorp.mjs agent list`
- Esperado: exit 0; os dois novos agentes aparecem em `agent list` com o modelo free.

### 3. Reunião de diretoria (CEO decide com base na pauta)
- Comando: `node bin/opencorp.mjs meeting start "defina 3 próximos passos para lançar um app de tarefas e delegue cada passo" --agentes ceo-documentos,executor-padrao --model opencode/nemotron-3-ultra-free`
- Esperado: exit 0; reunião encerra sozinha (sem travar); `meeting list` mostra `encerrada`; `meeting show <id>` exibe transcript com turnos identificados e conteúdo específico da pauta (não genérico).

### 4. Ata com decisões e delegação
- Comando: localize a ata (via saída do meeting ou `registry list documentos`) e leia o arquivo em `registries/documentos/atas/`.
- Esperado: a ata contém seções `## Decisões` e `## Tarefas delegadas`; cada tarefa aponta um agente (@) e uma ação concreta; as decisões citam o app de tarefas (específico, não genérico).

### 5. Cliente manda executar uma tarefa da ata
- Comando: escolha 1 tarefa delegada (ex.: escrever especificação) e execute como cliente:
  `node bin/opencorp.mjs run "<texto da tarefa escolhida, reescrito como ordem: produza o arquivo sandbox/<artefato>.md com o conteúdo pedido>" --model opencode/nemotron-3-ultra-free`
- Esperado: exit 0; o arquivo do artefato existe em `sandbox/` com conteúdo real coerente com a tarefa (não vazio, não placeholder).

### 6. Prestação de contas
- Comandos:
  1. `node bin/opencorp.mjs registry list documentos`
  2. `node bin/opencorp.mjs budget status`
  3. `node bin/opencorp.mjs session list` (ou equivalente que mostre execuções)
- Esperado: ata registrada em `registry list`; `budget status` mostra gasto acumulado > 0; execuções da reunião e do run aparecem com status de conclusão.

### 7. Fechar a empresa (limpeza)
- Comando: `node bin/opencorp.mjs workspace delete test-startup --force`
- Esperado: exit 0; `workspace list` não mostra mais `test-startup`.

## Relatório

Formato da doc 09. Anexe trechos de transcript/ata como evidência (recorte ≤ 15 linhas por evidência). Se algum cenário depender de tempo de modelo, aguarde com `sleep` em incrementos de 30s e registre o tempo total gasto por cenário.
