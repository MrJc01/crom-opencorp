# Spec de Teste Cego — ETAPA 14: API server

**Setup:** `OPENCORP_HOME=/tmp/opencorp-cego-e14` (rm -rf antes). Workspace `test-api` criado e ativo. Você tem `curl` disponível.

## Cenários

### 1. Subir o servidor
- Comandos: `node bin/opencorp.mjs serve --port 4100` (background) + `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4100/health` (ou rota raiz se /health não existir)
- Esperado: servidor sobe; resposta 200 (ou 401 se exigir token ANTES de autenticar — anote o comportamento).

### 2. Autenticação
- Comando: `curl -s http://127.0.0.1:4100/workspaces` SEM token
- Esperado: 401/403 com mensagem clara (sem token não entra).
- Complemento: com token (obtido da saída do serve ou de `~/.opencorp/secrets.json` conforme documentado) → 200.

### 3. CRUD básico via API
- Comandos (com token):
  1. `GET /workspaces` → lista inclui `test-api`
  2. `POST /workspaces` `{"id":"test-api-2"}` → criado; confirmar em `opencorp workspace list`
  3. `GET /agents` (workspace test-api) → 3+ agentes
  4. `GET /settings/budget.daily_usd` (ou rota equivalente documentada) → valor numérico

### 4. Executar agente via API
- Comando: `POST /agents/executor-padrao/run` `{"ordem":"escreva 'api-ok' em sandbox/api.txt","model":"opencode/hy3-free"}` (timeout 240s; capture o id de sessão da resposta)
- Esperado: 200/202 com id; depois `GET /sessions/<id>/log` (ou equivalente) mostra o transcript; arquivo `sandbox/api.txt` existe no workspace.

### 5. Registros via API
- Comandos: `POST /registries/notas/api-probe` `{"descricao":"via api"}` → `GET /registries/notas/api-probe`
- Esperado: criado e legível; `opencorp registry get notas/api-probe` (CLI) confirma (mesma fonte de verdade).

### 6. Approvals e budget via API
- Comandos: `GET /approvals` (deve refletir pendências reais, se houver — se nenhuma, crie uma via CLI com git push e refaça); `GET /budget/status`
- Esperado: dados coerentes com o CLI (mesma fonte).

### 7. SSE de eventos
- Comando: `curl -N http://127.0.0.1:4100/events` (com token) em background, e em seguida rode uma execução curta via CLI
- Esperado: stream emite evento(s) sobre a execução (início/fim). Se não houver SSE, o CLI deve documentar alternativa (polling) — anote.

### 8. Token errado
- Comando: `curl -s -H "Authorization: Bearer token-errado" http://127.0.0.1:4100/workspaces`
- Esperado: 401/403.

## Relatório
Formato da doc 09. Matar o servidor ao final. VEREDITO em uma linha.
