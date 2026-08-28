# Spec de Teste Cego — ETAPA 15: Painel web

**Setup:** `OPENCORP_HOME=/tmp/opencorp-cego-e15` (rm -rf antes). Workspace `test-web` criado e ativo. API server rodando (etapa 14). Você valida a web via `curl` (HTML/rotas) — avaliação visual final é do humano.

## Cenários

### 1. UI sobe
- Comandos: inicie a web (`node bin/opencorp.mjs web` ou conforme doc — anote) e `curl -s -o /dev/null -w "%{http_code}" http://localhost:<porta>/`
- Esperado: 200 e HTML contendo a shell da app (título/marca opencorp no HTML).

### 2. Primeiro acesso pede token
- Comando: `curl -s http://localhost:<porta>/ | grep -i token` (ou examine o HTML/JS inicial)
- Esperado: há fluxo de configuração de token (form/campo) — a UI não funciona sem token (proteção herdada da API).

### 3. Páginas principais respondem
- Comando: `curl -s` nas rotas de: workspaces, agentes, execuções, custos, approvals, configurações (descubra as rotas na doc/HTML — anote as que achou)
- Esperado: todas retornam 200 (ou 200 com shell SPA e conteúdo carregado client-side — nesse caso, valide que os ENDPOINTS da API chamados por cada página respondem 200, listando-os).

### 4. Chat do Secretário funcional (via API da UI)
- Comando: pela API (o mesmo endpoint que a página de chat usa — anote qual é), envie uma ordem ao secretário/executor e consulte a resposta
- Esperado: resposta registrada e visível; `session list` do CLI mostra a sessão (mesma fonte de verdade).

### 5. Painel de configurações usa o schema
- Comando: examine o HTML/JS da página de configurações (`curl -s ... | grep -oE "(daily_usd|test_model|per_agent)" | sort -u`)
- Esperado: campos refletem chaves reais do settings (daily_usd, test_model, etc.) — mesma fonte do schema zod, não chaves inventadas.

### 6. Live updates
- Setup: com a UI rodando, dispare uma execução curta via CLI
- Esperado: a UI recebe atualização (via SSE/polling — evidência: endpoint de eventos consumido ou log da UI; se só polling, anote o intervalo).

### 7. Build de produção
- Comando: build da web (npm run build na pasta web, conforme doc)
- Esperado: build conclui sem erro; servidor serve o build (não modo dev).

## Relatório
Formato da doc 09. Se algo exigir browser real (canvas, drag&drop), marque SKIP com motivo — aceite final visual é do humano. VEREDITO em uma linha.
