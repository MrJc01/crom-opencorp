# Spec de Teste Cego — ETAPA 20: Scheduler

**Setup:** `OPENCORP_HOME=/tmp/opencorp-cego-e20` (rm -rf antes). Workspace `test-sched` criado e ativo. Modelos free.

## Cenários

### 1. Criar job por intervalo
- Comandos:
  1. `schedule create --nome "limpeza" --intervalo-min 5 --args "task create --titulo 'Limpeza periódica'"`
  2. `schedule list`
- Esperado: job `sch-*` criado, status ativo, "cada 5 min", próxima execução no futuro (~5 min).

### 2. Criar job por cron
- Comandos:
  1. `schedule create --nome "matinal" --cron "30 9 * * *" --args "task list"`
  2. `schedule show <id-cron>`
- Esperado: criado; o JSON mostra agenda cron "30 9 * * *" e próxima execução = amanhã 09:30 (ou hoje se ainda não passou).

### 3. Validações
- Comandos:
  1. `schedule create --nome "ruim" --cron "30 9 *" --args "task list"` — espera: erro claro (5 campos), exit != 0
  2. `schedule create --nome "ruim2" --intervalo-min 0 --args "task list"` — espera: erro (>= 1)
  3. `schedule create --nome "ruim3" --args "task list"` (sem agenda) — espera: erro pedindo agenda

### 4. Pausar/retomar/executar agora/excluir
- Comandos:
  1. `schedule pause <id>` — espera: "pausado"
  2. `schedule list` — mostra pausado
  3. `schedule resume <id>` — ativo com nova próxima execução
  4. `schedule run-now <id>` — espera: "ok: executado" (spawn do comando)
  5. `task list` — se o job era task create, a task nova deve existir aqui
  6. `schedule delete <id>` e `schedule list` — job sumiu

### 5. Daemon
- Comandos:
  1. `scheduler start` (sem --foreground)
  2. `scheduler status` — espera: "daemon: vivo (pid N)"
  3. `scheduler stop`
  4. `scheduler status` — espera: "daemon: parado"
- Nota: não tente esperar o tick de 5 min; o run-now do cenário 4 já prova a execução.

## Veredito

Relatório com PASS/FAIL por cenário + evidências. **PASS** se todos passarem; senão **FAIL** com detalhes.
