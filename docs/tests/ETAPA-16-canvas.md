# Spec de Teste Cego — ETAPA 16: Canvas visual

**Setup:** como ETAPA 15 (`OPENCORP_HOME=/tmp/opencorp-cego-e16`, web+API rodando, workspace `test-canvas`). Validação via API/arquivos — o drag&drop visual é aceite humano.

## Cenários

### 1. Página de flows existe
- Comando: `curl -s http://localhost:<porta>/<rota-do-canvas> | grep -iE "flow|canvas"`
- Esperado: 200 e referências a flows/canvas no HTML.

### 2. Roundtrip arquivo ↔ canvas
- Setup: crie um flow via CLI (`flow create c1 --nome "C1"` com 2 nós via edição de arquivo)
- Comandos: `GET` no endpoint de flows da API → o JSON reflete o arquivo; depois `PUT/POST` via API alterando o nome/aresta → verifique o ARQUIVO `<ws>/.opencorp/flows/c1.json` mudou coerentemente
- Esperado: canvas edita o MESMO arquivo do CLI (nenhum formato paralelo).

### 3. Execução pelo canvas
- Comando: `POST /flows/c1/run` (endpoint que o botão run do canvas usa)
- Esperado: execução roda; status por nó consultável (endpoint usado pela UI — anote); `flow status c1` no CLI confirma.

### 4. Status visual coerente
- Setup: provoque falha num nó (ordem impossível) e rode o flow
- Esperado: o status consultável mostra o nó quebrado distinto dos demais (rascunho/verde/quebrado — cores são da UI; aqui vale o dado por nó).

### 5. Nada de formato novo
- Comando: `ls <ws>/.opencorp/flows/` e compare o schema de um flow editado pela web vs criado pelo CLI (`diff` ou inspeção)
- Esperado: MESMO schema (id/nome/nos/arestas) — divergência é FAIL.

## Relatório
Formato da doc 09. SKIP permitido para aspectos puramente visuais (com motivo). VEREDITO em uma linha.
