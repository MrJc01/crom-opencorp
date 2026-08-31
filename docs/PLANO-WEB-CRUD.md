# PLANO WEB CRUD — editar task/fluxo/team/agente, reuniões no secretário, Tailwind local

> **STATUS 31/08 (noite): IMPLEMENTADO E VALIDADO — release v0.6.0 (docs/release-v0.6.0.md).**
> Decisões travadas (perguntas §5 respondidas): **fundir team×fluxo num editor só** (Etapa F),
> reuniões movidas para o Secretário (Etapa D), edição **só estruturada** (sem JSON cru),
> excluir agente **bloqueia** com 409 se citado.
> CSS padronizado (Etapa 0, feito): **Tailwind v4 + DaisyUI local** — o painel carregava o Tailwind do
> CDN (`cdn.tailwindcss.com`), quebrado offline/LAN; agora `web-dist/tailwind.css` é gerado no build
> (script `build:css`) e o `<style>` inline legado saiu do index.html.
> Único item do plano NÃO feito: **B4** (renomear/excluir sessão do secretário) — movido para §7.
> Princípio: **strangler** — API como fonte, MD/JSON como estado, protocolo frontend (q(), estados padronizados, drawer, modal, toast).

## 1. O que o usuário percebeu (e está certo)

| Percepção | Diagnóstico real |
|---|---|
| "Não tem editar task" | **Editar task JÁ EXISTE** (drawer do kanban: título, coluna, prioridade, due, responsável, descrição — PATCH /tasks/:id). Falta só o botão **excluir** (API DELETE já existe, UI nunca chama). |
| "Não tem editar fluxo" | Correto: **não existe** PUT/DELETE /flows/:id nem form de edição (só criar). O JSON é editável via `flow edit` (CLI $EDITOR) — a web não expõe. |
| "Não tem editar team" | Correto: **não existe** PUT /teams/:id em lugar nenhum; DELETE existe na API mas sem botão na UI. |
| "Listar reuniões" | Lista **já existe** na view Reuniões, mas o usuário esperou encontrá-la **junto do Secretário** — proposta: mover para lá (§4-E). |
| "Agentes para chamar, com check" | Não há view de agentes (só caches internos). "Chamar" hoje é hardcoded no executor-padrao da home. |
| "Team é os agentes? Não entendi" | Ver §2 — team **não é** um grupo de agentes; é uma receita de coordenação. Fluxo é a versão programável do mesmo fenômeno (sobreposição real, fusão adiada conscientemente no PLANO-UNIFICACAO §fora-de-escopo). |

## 2. Modelo mental (5 conceitos, 1 verbo)

- **AGENTE** = o funcionário: um arquivo `.md` (`<ws>/.opencorp/agents/<id>.md`) com config (modelo, permissões level-1/2/3, budget, tools) + prompt. É a única "entidade viva".
- **TASK** = o chamado no kanban (SQLite tasks.db): unidade de **estado** — quem está fazendo o quê, bloqueado_por, chat do card (menções @agente acionam agentes).
- **TEAM** = **receita de coordenação** (`teams/<id>.json`): 4 padrões fixos — `pipeline` (sequência), `fanout` (paralelo + síntese), `review` (executor↔revisor com contrato APROVADO/AJUSTES), `debate` (proponentes + moderador decide). Cada passo é `{agente, ordem}` — cita agentes, não os "contém". Ao rodar, cria task raiz e narra no chat dela. Efêmero por design (falha escala humano).
- **FLOW** = o n8n da empresa (`flows/<id>.json`): grafo com 8 tipos de nó (agente, condicao, decisao, webhook, task_create, registro, saida + gatilho manual), contexto (string) fluindo entre nós, **resume durável** (retoma do último nó ok — v0.5.0).
- **REUNIÃO** = sala de reunião: pauta, turnos, moderador (decide próximo falante) ou rotação, ata automática (ceo-documentos → registries/documentos/atas). Cara em tokens — para decisão, não execução.

**Team × Flow**: ambos chamam o mesmo `SessionManager`, usam `{{entrada}}` e gravam no mesmo ledger. Diferença real: topologia **fechada com protocolos prontos** (team) vs grafo **aberto com ramificação/efeitos externos** (flow). Fusão num único motor = débito já registrado (docs/15 §10, PLANO-UNIFICACAO) — **fora deste plano**; aqui tratamos os dois como duas views com editores próprios.

## 3. Matriz de lacunas (auditoria resumida)

| Recurso | API | UI | Lacuna priorizada |
|---|---|---|---|
| Tasks | CRUD completo | criar/editar/mover ✅ | **excluir** (botão) |
| Schedules | PATCH só `{ativo}` | pausar/retomar ✅ | **editar nome/agenda/args** |
| Flows | sem PUT/DELETE | sem editar | **PUT/DELETE + editor** |
| Teams | sem PUT; DELETE ok | sem excluir/sem editar/sem detalhe | **PUT + editor + excluir + detalhe** |
| Agents | sem PUT/DELETE; run ok | sem view | **view + PUT/DELETE + chamar** |
| Meetings | listar/criar/stop ✅ | na view própria | **mover p/ secretário + check de participantes + link ata** |
| Hooks | API completa | **view inexistente** | view (list/criar/copiar URL+token/excluir) |
| Apps | POST/DELETE ok | read-only | criar/excluir na UI (P2) |
| Secretário | sem renomear/excluir sessão | — | renomear/excluir conversa (P2) |

## 4. Etapas (ordem, com dependências)

### 0 — Fundação Tailwind + DaisyUI (bloqueia as etapas de UI; ~2h)
- [x] **0.1** `npm i -D tailwindcss @tailwindcss/cli daisyui` (v4 + plugin)
- [x] **0.2** `src/web/css/app.css`: `@import "tailwindcss"` + `@plugin "daisyui"` com tema dark mapeado à paleta atual (--bg #0a0a0a, card #171717, accent #2563eb, ok/warn/err) + `@source` para src/web e web-dist/index.html + classes legadas (.btn-ghost, .badge-*, .drawer, .sidebar, .scrollbar-thin) movidas para `src/web/css/legacy.css` em layer components, importada DEPOIS (strangler visual)
- [x] **0.3** `package.json`: script `build:css` (`@tailwindcss/cli -i ... -o web-dist/tailwind.css -m`) encadeado no `build`
- [x] **0.4** `web-dist/index.html`: remover `<script src="https://cdn.tailwindcss.com">` → `<link rel="stylesheet" href="/tailwind.css">`; `<style>` inline encolhe para o essencial (app.css passa a ser a fonte) — corrige CSS quebrado offline/LAN
- [x] **0.5** Componentes DaisyUI adotados nas NOVAS telas (btn, card, badge, checkbox, tabs, drawer, modal, toast); telas antigas migram conforme são tocadas (definido em AJUDAS)

### A — Queda rápida (UI sobre API existente; ~2h)
- [x] **A1** Excluir task: botão no drawer (modalConfirm) → DELETE /tasks/:id (tasks.ts)
- [x] **A2** Excluir team: botão na lista (modalConfirm) → DELETE /teams/:id (teams.ts)
- [x] **A3** Detalhe de team no drawer: GET /teams/:id já existe — mostrar padrão/passos/regras
- [x] **A4** View Hooks: list + criar + copiar URL/token + excluir (padrão da Agenda)

### B — Editar o que existe (API + form; ~4h)
- [x] **B1** PATCH /schedules/:id ampliado (nome, agenda cron, args, agente) + form "Editar rotina" na Agenda
- [x] **B2** PUT /flows/:id (validação zod + semântica: 1 gatilho, sem ciclos) + DELETE /flows/:id (guard: exec em curso) + editor estruturado (passos + nós condicao/decisao básicos)
- [x] **B3** PUT /teams/:id + editor de passos por padrão (reusar form de criação, pré-preenchido)

*(B4 movido para §7 — fora de escopo: sessões vivem no servidor OpenCode externo)*

### C — Agentes no painel (~4h)
- [x] **C1** View Agentes: cards (role, categoria, model, level, budget) — GET /agents já existe
- [x] **C2** PUT /agents/:id: editar frontmatter do .md (model, level, budget, tools) com validação zod; log em registries/agentes
- [x] **C3** Criar agente (clone de base, como `agent create --from`) + DELETE com guarda — implementado como **bloqueio 409** se citado em teams/flows/tasks abertas (via `citacoesAgente`)
- [x] **C4** Botão "Chamar" por agente → POST /agents/:id/run com prompt digitado
- [x] **C5** Home "Run agente" usa a view Agentes (leva para C1; antes hardcoded executor-padrao)

### D — Reuniões no Secretário (~3h) *(proposta do dono — confirmar forma no §5)*
- [x] **D1** Mover lista + convocação para a página do Secretário — virou **aba** (`Conversa | Reuniões`); `#/reunioes` ativa a aba
- [x] **D2** "Iniciar reunião" contextual no chat do secretário (pauta = texto selecionado/digitado)
- [x] **D3** Convocação com **check-list de agentes** (multi-select, default ceo/secretário)
- [x] **D4** Link para a ata (via `/files`) na lista + status em andamento

### E — Componente "lista de agentes com check" (transversal; ~2h)
- [x] **E1** `seletorAgentes()` reutilizável — implementado como `seletor-agentes.ts` (checkbox list, DaisyUI) — usado em: nós de fluxo, participantes de reunião, chamar agente
- [x] **E2** "Chamar agente" no hub da home via E1 (na prática, "Run agente" da home leva à view Agentes — C5)

### F — Fusão Team×Fluxo (decisão do dono: fundir AGORA; ~6h)
- [x] **F1** Novos nós no motor de fluxo: `fanout` (passos paralelos + síntese opcional), `review` (executor↔revisor, contrato APROVADO/AJUSTES, turnos), `debate` (proponentes + moderador decide) — **versões contextuais** (não criam kanban; contexto flui), reusando SessionManager + gatilhos `dependencia:flow:<id>/<no>`
- [x] **F2** Validação semântica dos 3 nós no validarSemantica + schemas zod
- [x] **F3** Migração: `opencorp flow migrate-teams` + `POST /flows/migrate-teams` converte `teams/<id>.json` → `flows/<id>.json` (pipeline→nós agente em sequência; fanout/review/debate→novo nó correspondente); legados **arquivados como `<id>.json.migrado`**; POST /teams segue existindo (deprecado no /doc)
- [x] **F4** Editor único em Fluxos: template ao criar — Vazio | Pipeline | Fanout | Review | Debate (gera o grafo correspondente); sidebar perde "Teams" (`#/teams` redireciona)
- [x] **F5** POST/PUT /flows aceita os novos nós; testes dos nós + migração (`tests/flow-migrate.test.ts`)

### G — Qualidade (~2h)
- [x] **F1** Unit: rotas novas (PUT/DELETE flows, PUT teams, PUT/DELETE agents, PATCH schedules amplo) — **463 unitários ✅** (39 arquivos; novos `tests/web-crud.test.ts` e `tests/flow-migrate.test.ts`)
- [ ] **F2** e2e: editar fluxo, reunião no secretário, excluir task *(fix do fixture `fake-opencode.mjs` desbloqueou e2e de secretário/chat; suíte ~56 com 6 falhas pré-existentes no baseline)*
- [ ] **F3** docs: 06-painel (novas views), AJUDAS/"?" (diferença team×flow), release notes *(release notes ✅ — `docs/release-v0.6.0.md`; 06-painel/AJUDAS pendentes)*
- [ ] **F4** Revalidar: build + 454 unitários + e2e + doctor ao vivo *(build ✅ · 463 unitários ✅ · e2e ~50/56 com 6 falhas pré-existentes no baseline — agenda ×5, chat ×1; doctor ao vivo não registrado nesta sessão)*

## 5. Perguntas — RESPONDIDAS pelo dono (31/08)
1. **Team vs Fluxo** → **Fundir agora num editor só** (Etapa F)
2. **Reuniões** → **Mover para o Secretário** (aba; `#/reunioes` redireciona)
3. **Modo de edição** → **Só estruturado** (form + validação zod; sem JSON cru)
4. **Excluir agente** → **Bloquear** (409 se citado em teams/flows/task responsável)
5. **CSS** (pedido novo) → **Tailwind local + DaisyUI** (Etapa 0), migrando views tocadas

## 6. Critérios de aceitação
- [x] Tudo que se cria pela UI se edita e exclui pela UI (tasks, schedules, flows, teams, agents) — *apps segue read-only (P2 da matriz §3)*
- [x] Reunião convocável da página do Secretário com check-list de participantes e link para ata
- [x] Nenhum `fetch` cru fora dos padrões (q()/api()); estados padronizados; drawer/modal/toast
- [x] Suítes verdes (unit 463 ≥454 ✅; e2e ~50/56 — 6 falhas pré-existentes no baseline, sem regressão)
- [ ] AJUDAS explica team×flow×meeting em linguagem de dono *(pendente — ver G-F3)*

## 7. Fora de escopo (débitos já registrados)
- **B4 — Secretário: renomear/excluir sessão (API + UI)** → ficou FORA deste plano: as sessões/conversas do secretário vivem no **servidor OpenCode externo** (não são estado do opencorp); expor renomear/excluir exigiria gerir ciclo de vida do opencode — adiado.
- ~~Fusão do motor team/flow~~ → **ENTROU no escopo (Etapa F)**; o que fica de fora: guards unificadas, visão ledger multi-workspace, TZ no cron (PLANO-UNIFICACAO)
- Cancelar execução em curso (stop de sessão) — depende de PID/gestão de processo no core
- Editor visual drag-and-drop de grafo (v1: editor estruturado por lista de nós)
- Rewriting instantâneo de todas as telas para DaisyUI (migração por contato)
