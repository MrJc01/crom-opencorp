# Spec de Teste Cego — ETAPA 24: Orquestração multi-agente

**Setup:** `OPENCORP_HOME=/tmp/opencorp-cego-e24` (rm -rf antes). Workspace `test-teams` criado (usa o template default — tem `executor-padrao`). Modelos free. Agentes reais via `opencode run` (sessões podem demorar 1-3 min — cada chamada bash pode bloquear; nunca sleep >90s).

## Cenários

### 1. team create / show / list
- Comandos:
  1. `team create test-pipeline --titulo "Pipeline Teste" --padrao pipeline --passo "executor-padrao:Responda apenas com a palavra PIPELINE-OK (entrada: {{entrada}})" --passo "executor-padrao:Repita exatamente a última resposta recebida: {{anterior}}"`
  2. `team list` — espera: 1 team, padrão `pipeline`, 2 passos
  3. `team show test-pipeline` — espera: JSON com `padrao: "pipeline"`, `passos` com 2 itens (`{agente, ordem}`)

### 2. team run pipeline (agentes reais)
- Comando: `team run test-pipeline --entrada "teste pipeline"`
- Esperado: saída `ok: team "test-pipeline" executado — task <id> em "feito"` e 2 passos `ok` com resumos contendo "PIPELINE-OK"; `task show <task_id>` mostra coluna `feito` e chat com mensagens de sistema + handoff de `agente:executor-padrao`.

### 3. fanout + barreira + síntese
- Comandos:
  1. `team create test-fanout --titulo "Fanout Teste" --padrao fanout --paralelo "executor-padrao:Responda apenas: FANOUT-A" --paralelo "executor-padrao:Responda apenas: FANOUT-B" --sintese "executor-padrao:Resuma em UMA linha as respostas anteriores: {{anterior}}"`
  2. `team run test-fanout --entrada "teste fanout"`
- Esperado: `ok ... em "feito"`; 2 passos paralelos ok + passo de síntese ok; a task raiz fica em "feito" e as 2 subtasks também (`task list` mostra as 3).

### 4. Guardas de menção (loop + rate) — agentes FALSOS de propósito
- Setup: `task create --titulo "Guardas de menção"` → anote o `<task_id>`.
### 4. Guardas de menção (loop) — agentes FALSOS de propósito
- Setup: `task create --titulo "Guardas de menção"` → anote o `<task_id>`.
- **Loop guard** (agentes falsos falham spawn rápido — os avisos "spawn ... falhou" são `sistema` e NÃO contam no ping-pong):
  1. `task chat <task_id> --msg "@agente:fake-a comece" --autor humano` — espera: mensagem do orquestrador "spawn do agente fake-a falhou" (a menção `@agente:fake-a` DEVE resolver para o id `fake-a`; se aparecer `agente "agente" não encontrado`, é BUG de parser)
  2. Repita 4× alternando:
     - `task chat <task_id> --msg "@agente:fake-b ping1" --autor agente:fake-a --tipo comentario`
     - `task chat <task_id> --msg "@agente:fake-a ping2" --autor agente:fake-b --tipo comentario`
     - `task chat <task_id> --msg "@agente:fake-b ping3" --autor agente:fake-a --tipo comentario`
     - `task chat <task_id> --msg "@agente:fake-a ping4" --autor agente:fake-b --tipo comentario`
  3. `task chat <task_id> --msg "@agente:fake-b ping5" --autor agente:fake-a` — espera: mensagem de SISTEMA contendo `loop guard: ping-pong fake-a ↔ fake-b` e NÃO há nova tentativa de spawn após ela
  4. `task chat <task_id>` (leitura) — evidência: última mensagem é o aviso de loop guard.
- **Rate (proteção de volume)**: poste menções adicionais a `@agente:fake-x` (--autor humano) uma a uma, lendo o chat a cada 3. Esperado em algum momento: mensagem de sistema com `rate guard: limite de 20 mensagens automáticas/hora` OU bloqueio do CLI com `rate limit: task ... atingiu 30 mensagens/hora` (a segunda é válida — o limite duro do chat é 30 msgs/h e dispara antes do rate guard quando os spawns falham rápido; o que importa é que EXISTE proteção de volume com mensagem clara). NÃO poste mais de 15 no total — se ao chegar no 15º nenhuma proteção disparou, FAIL.

### 5. API /teams
- Suba o servidor EM MODO DAEMON (nunca `--foreground`; nunca `pkill -f` — para parar use `serve stop` no final). Uma chamada bash por passo:
  1. `OPENCORP_HOME=/tmp/opencorp-cego-e24 node bin/opencorp.mjs serve --port 4100 --token teste-e24 --workspace test-teams` — espera: confirmação de API em background e o comando RETORNA sozinho
  2. `curl -s -H "Authorization: Bearer teste-e24" "http://127.0.0.1:4100/teams?workspace=test-teams"` — espera: lista com test-pipeline e test-fanout
  3. `curl -s -X POST -H "Authorization: Bearer teste-e24" -H "content-type: application/json" -d '{"id":"api-review","titulo":"Review API","padrao":"review","executor":{"agente":"executor-padrao","ordem":"Responda: EXECUTADO"},"revisor":{"agente":"executor-padrao","ordem":"Responda na primeira linha APROVADO"}}' "http://127.0.0.1:4100/teams?workspace=test-teams"` — espera: 201 com spec salva (criado_em é preenchido pelo servidor se omitido)
  4. `curl -s -H "Authorization: Bearer teste-e24" "http://127.0.0.1:4100/teams/api-review?workspace=test-teams"` — espera: JSON do spec (se o id na URL diferir, use o id retornado no passo 2) — depois `curl -s -X DELETE .../teams/<id>` → ok
  5. `curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer teste-e24" "http://127.0.0.1:4100/teams/fantasma?workspace=test-teams"` — espera: 404
  6. Finalize com `OPENCORP_HOME=/tmp/opencorp-cego-e24 node bin/opencorp.mjs serve stop` — espera: confirmação de parada

## Veredito

Relatório com PASS/FAIL por cenário + evidências. **PASS** se todos passarem; senão **FAIL** com detalhes.
