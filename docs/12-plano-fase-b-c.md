# 12 — Plano Fase A (fechamento), Fase B e Fase C (DOCUMENTO MESTRE — CONTINUAÇÃO)

> **Continuação de `10-plano-e-checklist.md`** (etapas 0–7 concluídas em 2026-08-28, todas com teste cego PASS).
> Se você é o agente implementador: **mesmo protocolo da doc 10** (loop implementar → auto-verificar → teste cego → corrigir → commit). Regras intactas: não ler specs para adaptar código; máx. 3 ciclos de FAIL por etapa antes de escalar; 1 commit por etapa; modelos free para testes cegos (`tests.test_model`).

---

## Tabela de status (atualize a cada etapa concluída)

| Etapa | Nome | Fase | Status | Data | Relatório de teste |
|---|---|---|---|---|---|
| 8 | Nuvem backup/sync | A (opcional) | ⬜ aguardando humano | — | tests/ETAPA-08 |
| 9 | Regressão completa + release v0.1.0 | A | ✅ | 2026-08-28 | tests/ETAPA-09 (PASS 7/7 + doctor + 139 testes) |
| 10 | Reunião Geral (Boardroom) | B | ✅ | 2026-08-28 | tests/ETAPA-10 (PASS 7/7, ciclo 3: +data no list, +meeting.max_minutes) |
| 11 | Supervisor em loop (heartbeat) | B | ⬜ | — | tests/ETAPA-11 |
| 12 | Self-healing (correção assistida) | B | ⬜ | — | tests/ETAPA-12 |
| 13 | Flows declarativos (canvas em arquivo) | B | ⬜ | — | tests/ETAPA-13 |
| 14 | API server (headless) | C | ⬜ | — | tests/ETAPA-14 |
| 15 | Painel web (chat, monitor, settings) | C | ⬜ | — | tests/ETAPA-15 |
| 16 | Canvas visual (React Flow) | C | ⬜ | — | tests/ETAPA-16 |
| 17 | Deploy e distribuição | C | ⬜ | — | tests/ETAPA-17 |

Ordem recomendada: **9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17** (a 8 pode entrar em qualquer ponto, com aprovação humana). Etapas 14+ exigem que 13 esteja concluída (a API expõe flows).

---

## ETAPA 9 — Regressão completa da Fase A + release v0.1.0

**Objetivo:** provar que todo o CLI continua funcionando de ponta a ponta e selar a Fase A.

- [ ] Rodar TODAS as specs de teste cego em sequência (ETAPA-01, 02, 03, 04, 05, 06, 07), cada uma com estado limpo e relatório novo
- [ ] Consolidar: `opencorp doctor` verde + `npm test` 100% + todos os vereditos PASS
- [ ] Se qualquer spec reprovar: corrigir (regressão é etapa própria — não pule direto pro commit)
- [ ] Relatório de release: `docs/release-v0.1.0.md` (o que existe, limitações conhecidas — ex.: guard pré/pós-voo, custo heurístico — e próximos passos)
- [ ] Tag anotada: `git tag -a v0.1.0 -m "Fase A: CLI core completo"` (sem push)

**Teste cego:** `docs/tests/ETAPA-09-regressao-fase-a.md` · **DoD:** 7/7 specs PASS na mesma bateria + tag criada
**Commit:** `chore(release): v0.1.0 — fase A concluída`

---

## ETAPA 10 — Reunião Geral (Boardroom)

**Objetivo:** sessão multi-agente com turnos, memória dupla e ata automática.

Docs de contrato: `04-agentes.md` (hierarquia), `05-registros-e-memoria.md` (memória dupla).

- [ ] Novo schema de settings `meeting`: `{ max_turns: 12, per_agent_usd: 0.50, moderator: "secretario" }` (doc 06)
- [ ] `src/core/meeting-manager.ts`: `meeting start "<pauta>" [--agentes a,b,c]` (default: ceo-documentos + ceo-estrategia + secretario)
  - cria sala em `registries/chats/reuniao-<id>/` (meta.json: pauta, participantes, status; transcript.md compartilhado)
  - **protocolo de turnos**: moderador (secretario) decide o próximo falante com base na pauta + transcript; cada participante responde via `SessionManager` com prompt composto: papel do agente + TRANSCRIÇÃO da reunião até agora + trechos relevantes dos registros que ele tem `memory.reads` (memória privada consultada sob demanda — nunca despejada inteira)
  - termina quando: moderador decide consenso / max_turnos / orçamento estourado (BudgetManager integrado) / humano interrompe (Ctrl+C → estado `encerrada-partial`)
- [ ] `meeting list` / `meeting show <id>` (transcript) / `meeting end <id>`
- [ ] **Ata automática**: ao encerrar, o `ceo-documentos` recebe a tarefa de sintetizar `registries/documentos/atas/ATA-<data>-<id>.md` (pauta, participantes, decisões, tarefas delegadas com agente responsável) e atualiza o índice de atas
- [ ] Tarefas da ata com "dono" viram eventos em `registries/logs/` (referenciais) para o supervisor da etapa 11
- [ ] Testes unitários: orquestrador de turnos com sessões falsas (mock do SessionManager), corte por max_turnos, geração da ata via agente mock

**Auto-verificação:** reunião real com 2 agentes e modelo free sobre pauta "como melhorar o registro de custos?" → transcript com ≥3 falas alternadas + ata criada com seção de decisões

**Teste cego:** `docs/tests/ETAPA-10-boardroom.md` · **Commit:** `feat(meeting): boardroom com turnos, memória dupla e ata automática`

---

## ETAPA 11 — Supervisor em loop (heartbeat)

**Objetivo:** execução de fundo periódica com checks gerais e ordens cegas.

- [ ] Settings `supervisor`: `{ interval_minutes: 15, enabled: false, max_orders_per_tick: 3 }`
- [ ] `src/core/supervisor.ts`: loop `setInterval` com:
  - **checks**: (a) execuções `falhou` desde o último tick; (b) approvals pendentes >X min; (c) budget >80%; (d) pautas de ata com tarefa delegada não registrada como executada
  - resultado de cada tick → evento em `registries/logs/supervisor-log/`
  - ações: emitir **ordem cega** para operário competente via SessionManager (ex.: resumir falha, avisar humano via registro) — respeitando `max_orders_per_tick` e BudgetManager
- [ ] `supervisor start [--interval m]` (grava pid em `.opencorp/supervisor.pid`) / `stop` / `status` / `logs`
- [ ] Daemon à prova de duplicidade (lock por pidfile) e sobrevivência a crash (retoma do último tick registrado)
- [ ] Testes unitários: tick com checks falsos, corte de ordens, lock

**Teste cego:** `docs/tests/ETAPA-11-supervisor.md` · **Commit:** `feat(supervisor): heartbeat com checks e ordens cegas`

---

## ETAPA 12 — Self-healing (correção assistida)

**Objetivo:** execução falhada gera ciclo de correção com contexto, sem loop infinito.

- [ ] Settings `healing`: `{ enabled: true, max_retries: 2 }`
- [ ] No Supervisor: execução `falhou` → cria ordem de correção para `executor-padrao` com contexto anexado (transcript da falha + stderr do log) e meta "corrigir causa raiz, não só sintoma"
- [ ] A correção referencia a execução original (`referencias` no registro) e vice-versa
- [ ] Respeita `max_retries` por ordem original (contador no meta da exec) e BudgetManager; ao esgotar, marca `escala-humano` + pendência no Secretário
- [ ] Testes unitários: retry com contexto, limite de retries, escalação

**Teste cego:** `docs/tests/ETAPA-12-self-healing.md` · **Commit:** `feat(healing): correção assistida com retries e escalação`

---

## ETAPA 13 — Flows declarativos (canvas em arquivo)

**Objetivo:** fluxos como grafo em arquivo editável por humanos E agentes — base do canvas visual (etapa 16) e da automodificação.

Contrato (adicionar ao doc 02 após aprovação):

```json
// <ws>/.opencorp/flows/<id>.json
{
  "id": "relatorio-diario",
  "nome": "Relatório diário",
  "nos": [
    { "id": "gatilho", "tipo": "manual", "config": {} },
    { "id": "coletar", "tipo": "agente", "config": { "agente": "executor-padrao", "ordem": "colete dados de {entrada}" } },
    { "id": "salvar",  "tipo": "saida",  "config": { "registro": "documentos/relatorios" } }
  ],
  "arestas": [ { "de": "gatilho", "para": "coletar" }, { "de": "coletar", "para": "salvar" } ]
}
```

- [ ] `src/core/flow-store.ts` (zod: id kebab, nós com id único, arestas acíclicas — detectar ciclo com erro claro) + `src/cli/commands/flow.ts`
- [ ] `flow create <id> --nome` / `list` / `show <id>` / `edit <id>` ($EDITOR com validação) / `delete` / `run <id> [--entrada s]`
- [ ] Tipos de nó v1: `manual` (gatilho), `agente` (ordem com template `{{entrada}}`), `saida` (grava em registro), `condicao` (rota por chave do contexto)
- [ ] `flow run`: execução topológica, contexto flui de nó em nó, cada execução de nó = sessão registrada em `execucoes` com `referencias` ao flow; falha de nó interrompe com status claro
- [ ] `flow status <id>` (última execução por nó) + registro `flows/<id>/exec-.../` com o contexto final
- [ ] Testes unitários: ciclo detectado, execução com mock, condição

**Teste cego:** `docs/tests/ETAPA-13-flows.md` · **Commit:** `feat(flows): grafo declarativo executável via CLI`

---

## ETAPA 14 — API server (headless)

**Objetivo:** expor o core sem lógica nova — a web será só pele.

- [ ] `src/server/index.ts`: `opencorp serve [--port 4100] [--token t]` — HTTP (fastify ou node:http puro; documente) + token obrigatório em header `Authorization: Bearer` (gerado e salvo em `~/.opencorp/secrets.json` se não passado)
- [ ] Endpoints REST (todos resolvendo workspace ativo ou `?workspace=`): `GET/POST /workspaces`, `GET/POST /agents`, `POST /agents/:id/run`, `GET /sessions/:id/log`, `GET /registries/:cat` + `GET/PUT /registries/:cat/:id`, `GET/POST /approvals`, `GET/POST /budget`, `GET/PUT /settings`, `GET/POST /flows`, `POST /flows/:id/run`, `POST /meetings`, `GET /events` (SSE com eventos de sessão/supervisor)
- [ ] SSE de eventos: hook simples de pub/sub no core (sem reescrever stores)
- [ ] Mesmos exit codes/erros → JSON `{ erro, chave? }`; CORS local liberado só para localhost
- [ ] Testes unitários: rotas com supertest-like (fetch contra servidor efêmero) usando stores com tmpdir

**Teste cego:** `docs/tests/ETAPA-14-api.md` · **Commit:** `feat(server): API headless REST+SSE sobre o core`

---

## ETAPA 15 — Painel web

**Objetivo:** a pele da Fase C v1: monitorar, conversar e configurar.

- [ ] `web/` (Next.js + Tailwind): `opencorp web` serve a UI e aponta para a API da etapa 14 (token configurado no primeiro acesso)
- [ ] Páginas: (1) Workspaces (switcher + criação), (2) Agentes (lista + show + run com ordem), (3) Execuções (tabela + log da sessão), (4) Chat do Secretário (envia ordem, mostra resposta), (5) Custos (budget status + histórico), (6) Approvals (aprovar/rejeitar), (7) **Painel de configurações** (formulários gerados do schema zod — mesma fonte da doc 06)
- [ ] Live updates via SSE (`/events`) — no mínimo execuções e approvals
- [ ] Nenhuma lógica de negócio na web: só chama a API
- [ ] Testes unitários mínimos de componentes + build de produção ok

**Teste cego:** `docs/tests/ETAPA-15-web.md` (validação via curl/HTML — visual humano fica para aceite final) · **Commit:** `feat(web): painel web v1 sobre a API`

---

## ETAPA 16 — Canvas visual (React Flow)

**Objetivo:** o canvas estilo n8n sobre os flows da etapa 13.

- [ ] Página "Flows": lista + editor React Flow (nós = tipos da etapa 13; arestas arrastáveis; salvamento grava `flows/<id>.json` via API — mesmo arquivo, zero formato novo)
- [ ] Execução visual: botão run + status por nó em tempo real (SSE), cores rascunho/verde/quebrado
- [ ] Agentes continuam podendo editar o MESMO arquivo via CLI — canvas é visão, não fonte de verdade
- [ ] Testes: build, salvamento roundtrip (edita no canvas → arquivo muda → CLI lê)

**Teste cego:** `docs/tests/ETAPA-16-canvas.md` · **Commit:** `feat(web): canvas visual dos flows`

---

## ETAPA 17 — Deploy e distribuição

**Objetivo:** instalar em qualquer lugar com 1 comando.

- [ ] `Dockerfile` (build multi-stage do CLI+server+web) + `docker-compose.yml` (volumes para `~/.opencorp` e workspaces; opencode disponível no container)
- [ ] `npm pack`/`npm i -g` funcionando (bin `opencorp`); smoke em container limpo: `opencorp init && opencorp doctor`
- [ ] README raiz de instalação rápida + `docs/release-vX.Y.Z.md`
- [ ] Teste cego final dentro do container (specs 01, 03, 05 resumidas)

**Teste cego:** `docs/tests/ETAPA-17-deploy.md` · **Commit:** `chore(deploy): docker, pack e release notes`

---

## Regras de engenharia que continuam valendo (Fases B e C)

1. Core nunca importa CLI nem server/web (regra da doc 02) — a API e a UI são consumidores.
2. Nenhum formato de arquivo novo sem virar contrato aqui primeiro (docs 02/04/05/06 mandam).
3. Journal append-only e permissões de registro valem também para ata, supervisor e flows.
4. Toda nova funcionalidade entra no `opencorp doctor` se tiver estado próprio.
5. Modelos free por padrão para reuniões/supervisor; modelos maiores só por settings explícitos.
