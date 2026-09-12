# Arquitetura: tudo é Fluxo (sessions, gatilhos, scheduler)

> Origem: decisão do dono (2026-09-12) — "schedule deveria ser um fluxo montado; toda ação é uma session; agentes operam dentro do fluxo; cada ronda deveria ser um fluxo".
> Auditoria em 3ª pessoa confirmou: a arquitetura já tem todas as peças; faltava só trocar o "spawn isolado" pelo "disparo de fluxo".
> Status: ✅ implementado (Etapa 12). Este doc é a referência canônica.

---

## MAPA 1 — Camadas: quem fala com quem

```
┌──────────────┐   ┌──────────────────┐
│  CLI (102)   │   │  WEB (13 views)  │
│  opencorp *  │   │  painel :4100    │
└──────┬───────┘   └──────┬───────────┘
       │ comandos         │  REST + SSE
       └────────┬─────────┘
                ▼
┌───────────────────────────────────┐
│  SERVER  src/server/index.ts      │
│  103 rotas + Bearer opcional +    │
│  guards (whitelist, traversal)    │
└────────┬──────────────────────────┘
         ▼
┌───────────────────────────────────┐
│  CORE  src/core/ (26 módulos)     │
│  stores · managers · executores   │
└──┬───────────┬───────────┬────────┘
   ▼           ▼           ▼
 Scheduler  FlowStore  SessionManager
 (tempo)    (grafos)   (execução)
```

## MAPA 2 — Ronda ANTES (spawn isolado — legado)

```
cron dispara (scheduler.ts)
  │
  ▼
SPAWN DETACHED de processo separado:
  $ bin/opencorp.mjs --workspace X agent run ...
  │  (sobrevive ao pai; log → logs/job-<id>.log)
  ▼
Agente ISOLADO → SessionManager.rodar()
  │
  ▼
opencode CLI → session → salva em:
  ├─ registries/execucoes/ULTIMA-ACAO-*.md
  ├─ corp.db (sessoes|mensagens|execucoes)
  └─ scheduler.db/job_runs
```

Cada ronda = 1 processo isolado + 1 session solta. Rondas trocam só arquivos `.md` no disco.

## MAPA 3 — Fluxo (o modelo canônico)

```
POST /flows/:id/run → 202 + exec_id
  │
  ▼
flows.executar() — fire-and-forget
  ├─ lê o GRAFO (nós + arestas)
  ▼
  para cada NÓ agente/fanout/review/debate:
  ▼
  SessionManager.rodar({
    gatilho: { tipo: "dependencia", origem: "flow:<id>/<nó>" },
    tags, referencias: [execId]      ← encadeia o transcript
  })
  ▼
  ResultadoRun → registries/execucoes + journal + corp.db
```

## MAPA 4 — SESSION: a unidade de ação

```
SessionManager.rodar()
  ├─ 1. policy check (level-1/2/3, ativo?, allowlist)
  ├─ 2. spawn opencode (opencode-server.ts)
  ├─ 3. stream da resposta (SSE)
  └─ 4. PERSISTE: corp.db (sessoes|mensagens|execucoes),
      registries/execucoes/*.md, chats/<id>,
      session_mode: nova|reaproveitar|continuar|duplicar
```

## MAPA 5 — As 3 portas de entrada (gatilhos)

```
gatilhos: manual | cron | webhook | delay | loop
  ┌─────────┐    ┌───────────┐    ┌──────────────────┐
  │ MANUAL  │    │   CRON    │    │     WEBHOOK      │
  │ web/CLI │    │ scheduler │    │ x-opencorp-token │
  └────┬────┘    └─────┬─────┘    └────────┬─────────┘
       │               │                   │
       └───────────────┼───────────────────┘
                       ▼
              POST /flows/:id/run ou /webhook (202)
                       ▼
                 ┌───────────┐
                 │   FLUXO   │ ← agentes EDITAM o grafo
                 └─────┬─────┘
                       ▼ nós agente ──► sessions ──► ledger
```

## MAPA 6 — Diagnóstico (pulso-diário: 10 jobs soltos → 1 fluxo, 10 nós)

```
ANTES (10 jobs soltos):              DEPOIS (1 fluxo, 10 nós):

05:00 agent run pesquisador ─┐       ┌─ fluxo "pulso-diario" ─────────┐
10:00 agent run curador ─────┤       │ gatilho: cron 05 * * * *       │
30:00 agent run editor ──────┤       │                                │
:15/45 agent run agendador ──┤  ⇒    │ nó pesquisa ─► session ─┐      │
:15/45 agent run publicador ─┤       │ nó curadoria ─► session ─┤ refs│
45:00 executor analytics ────┤       │ nó editor ────► session ─┘      │
...                           ┘       └────────────────────────────────┘
(só trocam .md no disco)              (transcript encadeado + 1 ledger)
```

## MAPA 7 — A fusão (implementada na Etapa 12)

```
1. Scheduler delega:  job "flow run <id>" ─► FlowStore.executar()
   IN-PROCESS (mantém claim/graça/catch-up; ledger unificado)

2. sincronizarFluxoParaScheduler = FONTE ÚNICA:
   fluxo com nó `cron` + auto_agendar:true  ═  1 job "flow:<id>"
   (agenda vira VIEW: fluxos?gatilho=cron)

3. Bridge legado:  `flow from-schedule <job>` converte
   agent-run|node-script em fluxo de 1 nó (sem tocar o job original)

4. Compat: COMANDOS_AGENDA + job_runs + spawn detached p/ não-fluxo
```

## MAPA 8 — Web (nada impediu a fusão)

```
sidebar ──► main (topbar + page-header + grid)
  ├─ Home, Tasks (viram nós), Agentes (operam DENTRO dos fluxos)
  ├─ Secretário (chat + HITL)
  ├─ Agenda ← FILTRO de fluxos com gatilho cron (Etapa 12)
  ├─ Fluxos ← editor visual + toggle auto_agendar (Etapa 12)
  └─ Workspace (arquivos que os nós leem/escrevem)
```

---

## Checklist da fusão (Etapa 12)

- [x] 12.1 Scheduler: `flow run <id>` executa **in-process** via `FlowStore.executar()` (claim/graça/catch-up mantidos; ledger `execucoes`)
- [x] 12.2 `sincronizarFluxoParaScheduler`: fluxo com nó cron + `auto_agendar:true` ⟺ 1 job `flow:<id>` (idempotente; remove ao desligar)
- [x] 12.3 Bridge `flow from-schedule <jobId>`: converte job legado em fluxo de 1 nó (não toca o original)
- [x] 12.4 Schema Flow: `auto_agendar?: boolean` (default `false` — sem duplo agendamento)
- [x] 12.5 Web Agenda: seção "Fluxos agendados" (filtro client de `GET /flows`); Fluxos: toggle auto_agendar
- [x] 12.6 Compat: `COMANDOS_AGENDA`, `job_runs`, spawn detached e `agenda.spec` intactos
- [x] 12.7 Testes: unitários da delegação/sync/conversor + e2e agenda/fluxos verdes

## Riscos conhecidos

- In-process morre junto com o scheduler (spawn detached sobrevivia) — mitigado: scheduler é daemon supervisionado.
- Overlap-guard por pid mantido no caminho legado; caminho flow usa claim do scheduler.
- Duplo agendamento impossível por construção (`auto_agendar` default `false` + job `flow:<id>` único).
