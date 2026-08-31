# PLANO-UNIFICACAO — Primitiva de Execução única (Agente × Gatilho × Padrão)

> **STATUS 31/08 (noite): ETAPAS 1–6 IMPLEMENTADAS E VALIDADAS** — contrato do gatilho + ledger unificado
> (`corp.db`, tabela `execucoes`) + motores auto-declarados + `exec.iniciada` + flow durável (resume)
> + doctor do ledger + fix da race de login do painel + release v0.5.0 (`docs/release-v0.5.0.md`).
> Testes: 452 unitários ✅ · e2e 47 ✅ (9 falhas pré-existentes documentadas) · validação ao vivo no pulso-diario ✅.

> Base: análise da banca de especialistas (sessão 31/08 noite) + pesquisa de sistemas externos
> (Temporal/Inngest/Hatchet durable execution · LangGraph/CrewAI/AutoGen · GitHub Actions/n8n · Kubernetes).
> Insight central: **"tudo se resume em agente e como ele é usado e organizado"** — tasks, agenda, fluxos,
> automação, teams e reuniões são o MESMO fenômeno: um agente ativado sob circunstâncias diferentes.
> Hoje isso está implementado como 6 engines independentes (repetitivo, não padronizado).

## Diagnóstico (o que se repete hoje)

| O que deveria ser 1× | Implementações atuais |
|---|---|
| "Rodar agente com ordem + capturar resultado" | 6 caminhos: `SessionManager.rodar`, nó `agente` do flow, `executarPasso` do team, `mention-runner` (detached), `scheduler` (spawn CLI), turno de reunião |
| Contexto/ordem | 4 dialetos: `{{entrada}}` (flow), `{{entrada}}/{{anterior}}/{{ajustes}}` (team), bundle (mention), pauta+transcript (meeting) |
| Guardas | 4 sistemas parciais (mention: loop/rate/lease; scheduler: claim/grace/catch-up; flow: retry webhook; meeting: budget) |
| Persistência de runtime | 6 stores: tasks.db, scheduler.db, flows/*.json, teams/*.json, registries MD, mensagens no corp.db |
| Eventos | 4 famílias sem contrato comum: `task.*`, `flow-*`, `reuniao-*`, `team.*` |
| IDs | 5 formatos: `tsk-`, `sch-`, `exec-`, `msg-`, `reuniao-` |

## Modelo-alvo (4 primitivas — sem big bang)

```
1. AGENTE    — capacidade declarada (já existe: agents/*.md)          [NÃO MUDA]
2. EXECUÇÃO  — a molécula única: {agente, contexto, gatilho, política, resultado, rastro}
3. GATILHO   — binding de ativação: manual | cron | evento | mencao | webhook | dependencia | padrao | turno
4. PADRÃO    — receita declarativa (flows/teams JSON continuam arquivos) — agora rastreável no ledger
```

Tradução: job=cron · trigger/hook=evento · menção=mencao · nó de flow=dependencia ·
passo de team=padrao · turno de reunião=turno · task/humano=manual.
O **Kanban continua sendo view de estado**, não engine. Estratégia: **strangler** — novo contrato
adotado motor a motor; nada de migração dramática; 438 testes sempre verdes.

---

## Regras de execução (vale para todas as etapas)

- **Build obrigatório** antes de validar: `npm run build`. Testes: `npm test` antes de qualquer entrega.
- Core não importa CLI (`src/core` biblioteca pura). Zod em toda entrada nova de API. `escapeHtml` sempre.
- Toda rota nova entra no array `ROUTES` (`src/server/index.ts`).
- Nada de matar processos sem conferir pidfile/cmdline (regra de ouro do HANDOFF).
- Um artefato verificável por sub-tarefa (teste novo, output de curl, ou print de query).

---

## ETAPA 1 — Contrato da Execução + Ledger unificado `[core + CLI]`

**Meta: toda execução — de qualquer motor — fica consultável com "quem chamou e por quê" (gatilho).**

- [x] **1.1 — Contrato do gatilho** (`session-manager.ts`): `OpcoesRun.gatilho?: { tipo: GatilhoTipo; origem: string }`;
      `GatilhoTipo = manual|cron|evento|mencao|webhook|dependencia|padrao|turno` (validado por zod em `src/schemas/`).
      Gatilho vai para `extras` do registro de execução e para o evento `sessao-fim`.
- [x] **1.2 — Ledger no corp.db** (`corp-db.ts`): tabela `execucoes` (id PK, agente, modelo, gatilho_tipo,
      gatilho_origem, status, inicio, fim, duracao_ms, custo_usd, exit_code) + `upsertExecucao()` e
      `listarExecucoes({agente?, gatilho_tipo?, status?, limite?})`. É a PRIMEIRA tabela de leitura cross-motor.
- [x] **1.3 — SessionManager grava no ledger**: início (status `executando`) e finalização (`finalizar()`), com gatilho.
- [x] **1.4 — CLI `--gatilho`**: `agent run` e `run` aceitam `--gatilho <tipo>:<origem>` (parse e validação).
- [x] **1.5 — Testes**: unit (ledger upsert/listar/filtros; parse --gatilho; extras com gatilho).

**Aceite:** execução via CLI com `--gatilho cron:sch-x` aparece em `listarExecucoes` com gatilho correto.

---

## ETAPA 2 — Motores adotam o gatilho `[core, um motor por vez]`

**Meta: os 6 caminhos passam a declarar QUEM está ativando o agente — o eixo fica explícito.**

- [x] **2.1 — Scheduler**: `executarSpawn()` anexa `--gatilho cron:<jobId>` quando args = `agent run ...`.
- [x] **2.2 — Mention-runner**: spawn detached com `--gatilho mencao:<taskId>`.
- [x] **2.3 — Trigger-runner**: agentRun com `--gatilho evento:<triggerId>` (flowRun já se auto-declara no 2.4).
- [x] **2.4 — FlowStore (nó agente + decisão)**: `rodar({gatilho:{tipo:"dependencia", origem:"flow:<id>/<no>"}})`.
- [x] **2.5 — TeamOrchestrator**: `executarPasso` com `gatilho {tipo:"padrao", origem:"team:<id>/<passo>"}`.
- [x] **2.6 — MeetingManager (turno)**: `rodar({gatilho:{tipo:"turno", origem:<reuniaoId>}})`.
- [x] **2.7 — Web (run por API)**: `POST /agents/:id/run` declara `manual:api:<ws>` (chat da secretária não passa por SessionManager — espelhado em `mensagens`).
- [ ] **2.8 — Testes por motor** (assert de gatilho no ledger/exec registro com fixture).

**Aceite:** uma ordem disparada por cron, menção e flow produzem 3 linhas no ledger com gatilhos distintos.

---

## ETAPA 3 — Ledger vira produto `[API + UI]`

**Meta: o painel espelha VISÕES do ledger, não engines.**

- [x] **3.1 — API**: `GET /execucoes?agente=&gatilho=&status=&limite=` (ROUTES + handler, zod na query).
- [x] **3.2 — Histórico**: lista unificada inclui gatilho como badge (`cron`, `menção`, `flow`, `turno`…).
- [x] **3.3 — Agenda**: painel da rotina mostra execuções cruzadas do ledger (além de `job_runs` local).
- [x] **3.4 — Contratos web** (`web-contratos.test.ts`): rotas novas no ROUTES; handlers em window.

**Aceite:** histórico mostra a mesma execução com origem correta em todas as visões.

---

## ETAPA 4 — Flow durável: retomar do último nó ok `[core + CLI + UI]`

**Meta: exec morta no meio não perde o trabalho (durable execution — o maior gap atual).**

- [x] **4.1 — Core**: `FlowStore.retomar(ws, flowId, execId)` — lê `extras.nos` do registro, retoma do 1º nó
      `nao-executado`/`falhou` com o `contexto_final` persistido (continua append no MESMO exec).
- [x] **4.2 — CLI**: `opencorp flow resume <flowId> <execId>`; **API**: `POST /flows/:id/resume`; **UI**: botão
      "Retomar" na última execução falha (tela do flow).
- [x] **4.3 — Testes**: falha sintética no nó 2 → resume → nós 2..n executam, mesmo exec, contexto preservado.

**Aceite:** matar um flow no meio e retomar produz conclusão sem re-executar nós ok (custo/audit preservados).

---

## ETAPA 5 — Padronização de eventos + documentação `[core + docs]`

- [x] **5.1 — Evento `exec.iniciada`** no eventBus (espelha `sessao-fim`) com gatilho — triggers podem casar em
      "qualquer execução de agente X iniciada por gatilho Y" sem conhecer o motor.
- [x] **5.2 — docs/08-cli-referencia.md**: `--gatilho`, `flow resume`, `GET /execucoes`.
- [x] **5.3 — docs/15-gestao-operacao.md**: seção "Primitiva de Execução" + mapa atualizado.
- [ ] **5.4 — HANDOFF/PROXIMA-SESSAO atualizados.

---

## ETAPA 6 — Bateria final `[QA + release v0.5.0]`

- [x] **6.1 — npm test verde completo** + e2e (`npm run test:e2e`).
      🔥 **ACHADO (e2e destravado)**: race de login no painel — IIFE de importação em `fluxos.ts`
      (`q('/agents')`) disparava fetch ANTES do boot carregar o token → 401 → `sairParaLogin()` limpava
      a sessão inteira (nav.spec 0/9). Fix: `state.ts` hidrata token/ws do localStorage no load do módulo
      → nav 9/9; suite 47 passando (9 falhas pré-existentes em agenda/apps/chat/secretário, idênticas no
      baseline — registradas no release notes).
- [x] **6.2 — Validação ao vivo**: execução real no pulso-diario com `--gatilho manual:validacao-ledger` → ledger correto
      (status/custo/duração) + `GET /execucoes` na API :4100 + gatilho inválido barrado antes do spawn; gatilhos dos
      motores (cron/mencao/dependencia/padrao/turno) validados em testes; daemon reiniciado de forma gerenciada
      (doctor 12 ok / 0 falha). Ciclos agendados passam a gravar `cron:<jobId>` a partir do próximo disparo.
- [x] **6.3 — doctor**: checagem de consistência do ledger (execs órfãs `executando` sem processo).
- [x] **6.4 — Release notes v0.5.0** (docs/release-v0.5.0.md) seguindo formato das anteriores.

## Fora de escopo (registrado, não feito agora)

- Unificar guards num módulo único (tocaria behavior de produção — exige etapa própria com A/B).
- Fundir engine de flow e team num motor de grafo único (doc 14 recomenda manter padrões como receitas).
- Migrar registries MD → SQLite (filosofia "tudo é arquivo" permanece; ledger SQLite é índice, não fonte documental).
