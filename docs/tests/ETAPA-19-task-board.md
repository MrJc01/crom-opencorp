# Spec de Teste Cego — ETAPA 19: Task Board com chat

**Setup:** `OPENCORP_HOME=/tmp/opencorp-cego-e19` (rm -rf antes). Workspace `test-task` criado e ativo. Modelos free.

## Cenários

### 1. Ciclo básico do kanban
- Comandos:
  1. `task create --titulo "Publicar post no blog" --prioridade alta --labels marketing`
  2. `task list`
  3. `task move <id> --coluna fazendo`
  4. `task assign <id> agente:executor-padrao`
- Esperado: task criada com id `tsk-*`; list mostra coluna/prioridade/labels; move e assign confirmam. `task list --coluna feito` não mostra a task.

### 2. Chat por task com menções
- Comandos:
  1. `task chat <id> --msg "rascunho pronto, revisa @executor-padrao"`
  2. `task chat <id> --msg "revisado, publiquei" --autor agente:executor-padrao --tipo handoff`
  3. `task chat <id>` (sem --msg)
  4. `task show <id>`
- Esperado: a leitura mostra as 2 mensagens em ordem com autor/timestamp; a 1ª registra menção `agente:executor-padrao`; `show` exibe o chat no fim.

### 3. Guardas
- Comandos:
  1. `task chat <id> --msg "  "` (corpo vazio) — espera: erro claro, exit != 0
  2. `task chat tsk-inexistente --msg "oi"` — espera: erro "não encontrada", exit != 0
  3. `task create` sem --titulo — espera: erro claro
  4. `task move <id> --coluna "Coluna Com Espaço"` — espera: erro de coluna inválida (kebab-case)

### 4. Dependências e exclusão
- Comandos:
  1. `task create --titulo "Sub-a"` e `task create --titulo "Pai" --bloqueado-por <id-sub-a>`
  2. `task show <id-pai>` — anote (v1: bloqueado por listado)
  3. `task move <id-sub-a> --coluna feito`
  4. `task delete <id-pai>`
- Esperado: delete confirma; `task list` não mostra mais o pai; a sub-a continua em feito.

### 5. API (opcional, se souber usar curl)
- Com o servidor ativo (`opencorp serve --port 4100`, token em ~/.opencorp/secrets.json):
  1. `POST /tasks` com {"titulo":"Via API"} — espera 201 com id tsk-*
  2. `GET /tasks?workspace=<ws>` — espera lista contendo a task
  3. `POST /tasks/<id>/chat` com {"autor":"humano","corpo":"@analista olha"} — espera 201 e menciona ["agente:analista"]

## Veredito

Ao final, produza um relatório com:
- resultado por cenário (PASS/FAIL + evidência: saída relevante dos comandos)
- VEREDITO: **PASS** se todos os cenários passarem, senão **FAIL** com detalhes
