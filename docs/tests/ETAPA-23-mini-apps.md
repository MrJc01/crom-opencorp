# Spec de Teste Cego — ETAPA 23: Mini-apps

**Setup:** `OPENCORP_HOME=/tmp/opencorp-cego-e23` (rm -rf antes). Workspace `test-app` criado e ativo. Modelos free.

## Cenários

### 1. Seed e listagem
- Comandos:
  1. `app seed painel-tarefas`
  2. `app list`
  3. `app show painel-tarefas`
- Esperado: app instalado; list mostra 3 widgets; show mostra o JSON (metrica + kanban + tabela consultando /tasks).

### 2. Criar e validar app próprio
- Comandos:
  1. `app create meu-app --titulo "Meu App"` — espera: ok + caminho do spec
  2. Edite `<ws>/.opencorp/apps/meu-app.json` adicionando um widget de métrica: `{"id":"m1","tipo":"metrica","titulo":"Aprovações","fonte":{"rota":"/approvals"}}` dentro de paginas[0].widgets
  3. `app validate meu-app` — espera: "ok: spec válido"
  4. `app list` — espera: 1 widget em meu-app

### 3. Spec inválido rejeitado
- Setup: coloque `{"id":"ruim"}` em `<ws>/.opencorp/apps/ruim.json` (falta titulo e paginas)
- Comando: `app list` — espera: o app "ruim" NÃO aparece (silenciosamente ignorado por ser inválido) OU mensagem clara; `app validate ruim` se existir — espera erro claro
- Depois remova o arquivo.

### 4. API
- Suba o servidor EM MODO DAEMON (nunca use `--foreground`; nunca use `pkill -f` — para parar use `serve stop` no final). Uma chamada bash por passo:
  1. `OPENCORP_HOME=/tmp/opencorp-cego-e23 node bin/opencorp.mjs serve --port 4100 --token teste-e23 --workspace test-app` — espera: "ok: API em background em http://127.0.0.1:4100" e o comando RETORNA sozinho
  2. `curl -s -H "Authorization: Bearer teste-e23" "http://127.0.0.1:4100/apps?workspace=test-app"` — espera lista com painel-tarefas
  3. `curl -s -H "Authorization: Bearer teste-e23" "http://127.0.0.1:4100/apps/painel-tarefas/spec?workspace=test-app"` — espera spec JSON
  4. `curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer teste-e23" "http://127.0.0.1:4100/apps/fantasma/spec?workspace=test-app"` — espera 404

### 5. Renderer (verificação sem browser)
- Com o servidor daemon do cenário 4 ainda ativo e 1-2 tasks criadas (`task create --titulo "Item A"`):
  1. `curl -s "http://127.0.0.1:4100/app/views/apps.js" | grep -o "renderWidget" | head -1` — espera: "renderWidget" (o BUNDLE do renderer de mini-apps é servido em /app/views/apps.js — o HTML da home NÃO tem mais JS inline)
  2. `curl -s "http://127.0.0.1:4100/app/views/apps.js" | grep -oE "loadAppsList|abrirApp|enviarForm" | sort -u | head -3` — espera: pelo menos `loadAppsList` (a aba Apps existe no bundle)
  3. Finalize com `OPENCORP_HOME=/tmp/opencorp-cego-e23 node bin/opencorp.mjs serve stop` — espera: confirmação de parada
- Esperado: os greps encontram as funções do renderer no bundle — prova de que o servidor serve a UI v3 com mini-apps (o index.html carrega `<script type="module" src="/app/main.js">`).

## Veredito

Relatório com PASS/FAIL por cenário + evidências. **PASS** se todos passarem; senão **FAIL** com detalhes.
