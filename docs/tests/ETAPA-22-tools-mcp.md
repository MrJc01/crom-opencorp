# Spec de Teste Cego — ETAPA 22: Tools plugáveis e MCP

**Setup:** `OPENCORP_HOME=/tmp/opencorp-cego-e22` (rm -rf antes). Workspace `test-tool` criado e ativo. Modelos free.

## Cenários

### 1. Listar e inspecionar tools
- Comandos:
  1. `tool list`
  2. `tool inspect task.create`
- Esperado: built-ins (task.list, task.create, task.move, task.chat, query.sql, http.get); inspect mostra JSON com inputSchema.

### 2. Executar built-ins
- Comandos:
  1. `tool run task.create --input '{"titulo":"Ferrada no build"}'`
  2. `tool run task.list`
  3. `tool run task.move --input '{"id":"<id-do-passo-1>","coluna":"feito"}'`
- Esperado: criação confirma `tsk-*`; lista mostra; move confirma "feito".

### 3. Segurança
- Comandos:
  1. `tool run query.sql --input '{"sql":"DROP TABLE registros"}'` — espera: erro "apenas SELECT", exit != 0
  2. `tool run task.create --input '{}'` — espera: erro de campo obrigatório ausente
  3. `tool run http.get --input '{"url":"http://127.0.0.1:9/x"}'` — espera: erro pedindo aprovação humana
  4. `tool run http.get --input '{"url":"http://127.0.0.1:9/x"}' --aprovado` — espera: erro de rede (fetch failed), provando que passou da aprovação

### 4. Tool plugável via manifesto
- Setup: crie `~/.opencorp/tools/hello.json` com:
```json
{"id":"hello","titulo":"Hello","descricao":"tool de teste","inputSchema":{"type":"object","properties":{}},"handler":{"tipo":"comando","comando":["echo","olá do manifesto"]},"approval":"nunca"}
```
- Comandos: `tool list` (deve incluir hello) e `tool run hello`
- Esperado: "olá do manifesto". Remova o arquivo depois.

### 5. MCP stdio
- Comando (uma linha):
```bash
printf '%s\n%s\n%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"task.create","arguments":{"titulo":"Via MCP"}}}' | opencorp mcp serve
```
(ou `node bin/opencorp.mjs mcp serve`)
- Esperado: linha 1 = initialize ok (serverInfo.name "opencorp"); linha 2 = tools incluindo task.create; linha 3 = result com isError false e content text indicando task criada.

## Veredito

Relatório com PASS/FAIL por cenário + evidências. **PASS** se todos passarem; senão **FAIL** com detalhes.
