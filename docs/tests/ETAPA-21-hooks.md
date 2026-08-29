# Spec de Teste Cego — ETAPA 21: Webhooks & Triggers

**Setup:** `OPENCORP_HOME=/tmp/opencorp-cego-e21` (rm -rf antes). Workspace `test-hook` criado e ativo. Modelos free.

## Cenários

### 1. Criar hook e listar
- Comandos:
  1. `hook create --nome "do-form" --alvo task_create --titulo "Contato de {{nome}}" --respond final`
  2. `hook list` e `hook show <id>`
- Esperado: hook `hook-*` criado com token `hk_*` e URL `POST /hooks/<ws>/<id>`; list/show refletem.

### 2. Testar disparo local (sem servidor)
- Comando: `hook test <id> --payload '{"nome":"Ana"}'`
- Esperado: `ok: tsk-* — task ... criada: Contato de Ana`; `task list` mostra a task.

### 3. Validar alvo inválido
- Comando: `hook create --nome "ruim" --alvo task_create` (sem --titulo)
- Esperado: erro claro pedindo --titulo, exit != 0.

### 4. Disparo público via curl (servidor)
- Setup: `opencorp serve --port 4100` (em outro terminal ou background; token em ~/.opencorp/secrets.json)
- Comandos (substitua WS/ID/TOKEN):
  1. sem token: `curl -s -o /dev/null -w "%{http_code}" -X POST -H "content-type: application/json" -d '{"nome":"X"}' http://127.0.0.1:4100/hooks/<WS>/<ID>` — espera **401**
  2. com token: `curl -s -X POST -H "content-type: application/json" -H "x-opencorp-token: <TOKEN>" -d '{"nome":"Bia"}' http://127.0.0.1:4100/hooks/<WS>/<ID>` — espera 200 com exec_id tsk-* e resultado "Contato de Bia"
  3. repetir o 2 imediatamente — espera 409 (duplicado)
- Feche o servidor depois.

### 5. Triggers declarativos
- Comandos:
  1. `trigger create --evento task.concluida --alvo task_create --titulo "Comemorar: task concluída"`
  2. `trigger list`
  3. `task create --titulo "T1"` ; `task move <id-T1> --coluna fazendo` ; `task move <id-T1> --coluna feito`
  4. `task list --coluna backlog`
- Esperado: trigger listado; após mover T1 para feito, uma task "Comemorar: task concluída" aparece no backlog (avaliado no processo que executou o move). Se não aparecer, anote FAIL com a saída de `trigger list`.
- Limpeza: `trigger delete <id>`.

## Veredito

Relatório com PASS/FAIL por cenário + evidências. **PASS** se todos passarem; senão **FAIL** com detalhes.
