# 13 · Plano — Extensões da Plataforma (Tasks, Scheduler, Webhooks, Tools/MCP, Mini-apps)

> Sucessor do plano 12 para a fase de plataforma. Tudo em modo **Custo Zero** (modelos free, teto de budget ativo).
> Protocolo por etapa: implementador free (código + unit tests) → verificação real passo a passo → bateria cega `opencorp test blind <etapa>` → fix (máx. ciclos) → marcar status → commit.

## 0 · Pesquisas (fontes externas)

| Tema | Fonte | O que aproveitar |
|---|---|---|
| Ferramentas plugáveis | MCP — *Tools* (modelcontextprotocol.io/docs/concepts/tools) | Tool = `{name, title, description, inputSchema (JSON Schema), outputSchema, annotations}`; `tools/list` + `tools/call`; erros de execução com `isError:true` + mensagem acionável p/ auto-correção; **HITL recomendado** para operações sensíveis; rate limit, auditoria e validação obrigatórias; handles opacos para estado entre chamadas |
| Webhooks/triggers | n8n — *Webhook node* (docs.n8n.io) | URLs test vs produção; auth: basic/header/JWT/none; respond: **imediato** vs **quando terminar** vs nó próprio; path com `:variáveis`; IP allowlist; expressão "só rodar se"; CORS; max payload; anti-bot |
| Mini-apps internas | Appsmith — visão geral (docs.appsmith.com) | App interno = **widgets + datasources + queries + lógica**; versionamento com git; workflows com triggers (cron/webhook) e run history; separar UI de dados |
| Kanban (conhecimento consolidado, Trello) | — | Board → listas (colunas) → cards com `pos` (float), labels, membros, due date, checklists, feed de atividade |

## 1 · Painel de especialistas (simulação de análise)

**Arquiteto de plataforma** — O core já é event-driven: `eventBus` (src/core/event-bus.ts) emite eventos de sessão/tarefa/aprovação e a API já faz SSE. Scheduler, webhooks e fim de reunião devem ser **emissores**, e os triggers **assinaturas declarativas** — nada de polling espalhado. Persistência nova entra no `corp-db` (better-sqlite3, WAL) que já tem `registros/journal/sessoes`. Daemons (supervisor, scheduler) seguem o padrão existente: `setsid` + pidfile + `stop`. Risco: SQLite é single-writer — scheduler e API no mesmo processo de daemon evitam escrita concorrente entre processos.

**Engenheiro de produto devtools** — CLI primeiro, sempre: cada etapa entrega comando CLI completo antes de tela. O quadro kanban da web é espelho do `opencorp task`. Mini-apps declarativas (JSON versionado em git) batem com a filosofia "docs/specs como fonte da verdade" e permitem que o próprio agente construa apps — o usuário descreve, o agente escreve o spec.

**Especialista em automações (visão n8n)** — Separar **trigger** (entrada: webhook/cron/evento interno) de **ação** (saída: run agente/flow/task/webhook out). Respond imediato por padrão (202 + id), com opção "responder ao final" para quem precisa do resultado. Idempotência: dedup por hash do payload dentro de janela. IP allowlist e expressão de filtro são baratos e evitam 90% dos problemas.

**Especialista em agentes/segurança (visão MCP)** — MCP é o caminho certo para "fácil de aumentar as ferramentas": o opencode **já é cliente MCP** — se o opencorp expuser `opencorp mcp serve` (stdio), as agentes ganham tools estruturadas (task/query/files/flows) sem parse de saída CLI. Toda tool nova: manifest com JSON Schema validado, auditoria no journal, approval policy por ferramenta no SecurityGuard (padrão: pedir aprovação para shell/http; liberar leitura), rate limit por minuto. Nunca ecoar secrets em resultado de tool.

## 2 · Decisões de arquitetura

1. **Bus de eventos como espinha dorsal** — `eventBus` ganha categorias novas (`task`, `schedule`, `hook`); triggers são configs declarativas em `<ws>/.opencorp/triggers/*.json`.
2. **Tasks no corp-db** — tabela `tasks` + feed de atividade no journal; colunas padrão `backlog|fazendo|bloqueado|feito`, customizáveis por workspace.
3. **Scheduler = daemon** — `opencorp scheduler start` (padrão supervisor); jobs com cron, intervalo ou data única; política de atraso: rodar atrasado se `graca_min` ainda cobre, senão pular e registrar.
4. **Tools = manifest + handler** — manifesto JSON em `~/.opencorp/tools/` e `<ws>/.opencorp/tools/`; handler tipos: `comando` (shell na pasta do ws), `http`, `interno` (id de função built-in). Hot-reload por mtime. `opencorp mcp serve` expõe as tools via stdio MCP.
5. **Mini-apps = spec declarativo** — `<ws>/.opencorp/apps/<id>.json` com widgets e fontes; o servidor web já serve a UI estática — um renderer genérico lê o spec via `/apps/:id/spec` e monta a página; ações chamam a API existente com o mesmo token.
6. **Nada de dependências novas pesadas** — cron interpretado em casa (5 campos) e MCP stdio implementado sobre JSON-RPC puro (mesmo padrão do servidor HTTP).

## 3 · Etapas

### ETAPA 19 · Task Board (kanban interno dos agentes) — status: `pendente`
- **Core**: `task-store.ts` — CRUD em corp-db; card: `{id, titulo, descricao, coluna, pos, prioridade, labels[], responsavel(agente|humano), due, workspace, criado_por, criado_em, atualizado_em}`; mover com reordenação por `pos`; atividade no journal; eventos `task.criada/movida/atribuida/concluida` no eventBus.
- **Chat interno da task** (ver docs/14): tabela `task_mensagens` (autor humano/agente/sistema, tipos comentario/handoff/artefato/decisao, menciona, refs); `opencorp task chat <id> [--msg] [--de]`; bundle de contexto compactado a cada spawn; lock/lease anti-colisão; guardas básicas (rate limit por hora + loop guard); eventos SSE do chat.
- **CLI**: `opencorp task create|list|show|move|assign|label|delete|columns|chat`.
- **Integração agente**: doc de prompt — agentes usam `opencorp task ...` via shell (o SecurityGuard já audita); hook: sessão de agente concluída com `--task <id>` move o card e anexa o resumo.
- **API**: `GET/POST /tasks`, `GET/PATCH/DELETE /tasks/:id` (+ `/move`), eventos SSE.
- **Web**: colunas kanban arrastáveis no UI existente (view `/tasks`).
- **Aceite**: criar → mover → concluir via CLI e API; dois agentes criam/movem cards na mesma home sem conflito; SSE dispara em toda mudança.

### ETAPA 20 · Scheduler (tasks com horário) — status: `pendente`
- **Core**: `scheduler.ts` — job `{id, nome, agenda(cron|intervalo_min|data_unica), acao: {tipo: agente_run|flow_run|meeting|task_create|cli, ...params}, workspace, ativo, ultima_exec, proxima_exec, graca_min}`; calculadora cron 5 campos própria + testada; persistência corp-db; daemon loop 30s com pidfile e `scheduler stop`; política de atraso e dedup.
- **CLI**: `opencorp schedule create|list|show|pause|resume|run-now|delete`.
- **API**: `/schedules` CRUD + `/schedules/:id/run-now`; histórico de execuções em journal.
- **Doctor**: detecta scheduler morto com jobs ativos.
- **Aceite**: job de intervalo 1min dispara agent run fake (echo) 3x seguidas; cron `*/2 * * * *` calculado certo; pause/resume; sobrevive a reinício do daemon (recarrega do banco).

### ETAPA 21 · Webhooks & Triggers — status: `pendente`
- **Inbound**: `POST /hooks/:id` público com token do hook no header `x-opencorp-token`; options por hook: métodos, IP allowlist, expressão "só se", respond `imediato` (202) ou `final` (aguarda alvo e responde), dedup por hash 60s; alvo: flow_run | agent_run | task_create | webhook_out.
- **Outbound**: novo tipo de nó de flow `webhook` no `flow-store` (config: url, metodo, headers, body template, retry 3 com backoff).
- **Triggers declarativos**: `<ws>/.opencorp/triggers/*.json` — `quando: {evento: "sessao.concluida"|"task.movida"|"cron"...}` → alvo; avaliado no eventBus pelo daemon `serve`/scheduler.
- **Segurança**: hooks registrados no journal; approval policy opcional por hook (passa pelo SecurityGuard).
- **CLI/API**: `opencorp hook create|list|show|delete|test`; rotas `/hooks` gestão (authed) + `/hooks/:hook` público de disparo.
- **Aceite**: curl no hook dispara flow com payload entregue ao nó agente; allowlist bloqueia IP estranho (403); "só se" filtra; respond final retorna resultado do flow.

### ETAPA 22 · Ferramentas plugáveis (estilo MCP) — status: `pendente`
- **Registry**: `tool-registry.ts` — carrega manifests JSON (`{id, titulo, descricao, inputSchema, outputSchema?, handler: {tipo: comando|http|interno, ...}, approval: "sempre"|"nunca"|"policy", rate_limit_min?}`) de `~/.opencorp/tools/` + `<ws>/.opencorp/tools/`; hot-reload por mtime; `tool run` valida input no schema, executa, audita, aplica rate limit e approval.
- **Built-ins**: `task.*`, `schedule.list`, `query.sql` (SELECT-only no corp-db), `files.read` (reusa `resolverCaminhoWorkspace`), `flow.run`, `http.get`.
- **MCP server**: `opencorp mcp serve` — stdio JSON-RPC: `initialize`, `tools/list` (gera do registry), `tools/call`; registrar no opencode via `settings.json` do opencode (`"mcp"`), dando às agentes tools nativas; erros de execução com `isError:true` + mensagem acionável (padrão MCP).
- **CLI**: `opencorp tool list|run|validate|inspect`.
- **Aceite**: tool de exemplo `hello` (comando shell) criada em runtime e executada sem restart; `query.sql` bloqueia `DROP` (403); MCP: `tools/list` retorna built-ins e `tools/call task.list` funciona; approval dispara HITL para tool marcada.

### ETAPA 23 · Mini-apps (páginas internas no workspace) — status: `pendente`
- **Spec**: `<ws>/.opencorp/apps/<id>.json` — `{id, titulo, paginas: [{titulo, widgets: [{tipo: metrica|tabela|kanban|grafico|formulario|markdown|lista_tarefas, fonte: {sql?|rota_api?|tasks?}, layout, acoes?}]}]}`; validação por schema zod próprio.
- **Renderer**: página genérica no web-dist (`/#/app/:id`) que busca `/apps/:id/spec` e monta widgets; tabela/kanban com paginação simples; formulário dispara `POST` da ação (flow/hook/task) com confirmação; tudo com o mesmo token.
- **API**: `GET /apps` (lista), `GET /apps/:id/spec`; dados SEMPRE via APIs existentes (nenhum SQL direto do browser — queries ficam em specs server-side do widget).
- **CLI**: `opencorp app create|edit|list|show|delete` + `opencorp app seed <exemplo>` (kanban de tasks, métricas de custos).
- **Agente construtor**: prompt de agente `app-builder` — usuário descreve o app, agente escreve/valida o spec e mostra preview.
- **Aceite**: app "Painel de Tarefas" seed renderiza kanban ao vivo; formulário move um card de verdade; spec inválido é rejeitado com erro claro; apps versionados em git do workspace.

### ETAPA 24 · Orquestração multi-agente — status: `pendente`
- Usa chat da 19 + triggers da 21 + tools da 22 (ver docs/14): padrões declarativos **pipeline, fan-out/fan-in com barreira (`bloqueado_por`), revisão cruzada, debate**; supervisor como orquestrador padrão; spawn por menção com as 3 guardas (loop, rate, lease).
- **CLI**: `opencorp team create|list|show|run` (config do padrão + agentes + artefatos); escala humano automática nas violações.

### ETAPA 25 · Bateria final e v0.3.0 — status: `pendente`
- Specs cegas novas (19–23) + regressão `opencorp test blind all`; `doctor` cobre scheduler/hooks/apps; `README` e `docs/README.md` atualizados; tag **v0.3.0**.

## 4 · Ordem e dependências

```
19 Tasks+Chat ──► 20 Scheduler ──► 21 Webhooks/Triggers ──► 22 Tools/MCP ──► 23 Mini-apps ──► 24 Orquestração ──► 25 v0.3.0
    └────────── 22 expõe tudo como tools; 23 consome tudo nos widgets; 24 usa 19+21+22 ──────────┘
```
- 19 antes de 20/21 porque scheduler e hooks criam/atualizam tasks.
- 22 depois do 21 pois built-ins incluem `flow.run` e hooks.
- ETAPA 18 (e2e robustez) continua válida e roda na regressão do 24.

## 5 · Riscos e mitigação

| Risco | Mitigação |
|---|---|
| SQLite single-writer com API + scheduler | scheduler embutido no processo do `serve` quando ativo; daemon dedicado usa WAL e `busy_timeout` |
| Modelos free travando em chunks grandes | chunks pequenos (1 arquivo novo + testes por sessão), rotação de modelos, timeout por turno já existe |
| Hook público vira porta de entrada | token por hook, allowlist, dedup, rate limit, approval opcional, tudo auditado |
| MCP stdio mal implementado trava agentes | implementar sobre JSON-RPC puro com timeouts; suite unitária de protocolo; ferramenta de debug `opencorp mcp inspect` |
| Mini-app executando algo perigoso via formulário | ações passam pelas mesmas políticas (SecurityGuard/approvals); spec não permite SQL do cliente |

## 6 · Status

| Etapa | Tema | Status |
|---|---|---|
| 19 | Task Board + Chat interno (docs/14) | `pendente` |
| 20 | Scheduler | `pendente` |
| 21 | Webhooks & Triggers | `pendente` |
| 22 | Tools / MCP | `pendente` |
| 23 | Mini-apps | `pendente` |
| 24 | Orquestração multi-agente (docs/14) | `pendente` |
| 25 | Bateria final v0.3.0 | `pendente` |
