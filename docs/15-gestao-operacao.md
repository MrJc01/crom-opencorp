# 15 · Gestão de Operação — Tasks, Agenda, Fluxos, Teams e Reuniões

> Documento de **consulta**: como funciona (de verdade, no código) a camada de gerenciamento do opencorp — o que o painel web chama de Operação (Tasks, Secretário, Automação), Agenda, Fluxos, Teams e Reuniões. Consolida o código de `src/core/*` e os aprendizados das sessões de 30–31/08 (HANDOFF-SESSAO.md, HANDOFF-SESSAO-31-08.md, PLANO-CONSOLIDACAO.md e a sessão "Análise de projeto: padronização e fluxos").

---

## 1 · Mapa geral — quem é o que

| Painel (web) | Módulo core | Onde vive | Fonte de verdade |
|---|---|---|---|
| **Tasks** (kanban) | `task-store.ts` | `<ws>/.opencorp/tasks.db` (SQLite: `tasks` + `task_mensagens`) | SQLite |
| **Agenda** (rotinas) | `scheduler.ts` | `~/.opencorp/scheduler.db` (global: `jobs` + `job_runs`) | SQLite global |
| **Fluxos** | `flow-store.ts` | `<ws>/.opencorp/flows/<id>.json` | JSON no filesystem |
| **Teams** | `team-store.ts` + `team-orchestrator.ts` | `<ws>/.opencorp/teams/<id>.json` | JSON no filesystem |
| **Reuniões** | `meeting-manager.ts` | registro em `<ws>/.opencorp/registries/chats/<id>/` | Registry (MD + meta) |
| **Secretário** (chat) | `opencode-server.ts` + server SSE | storage do opencode + espelho `mensagens` no corp.db | opencode serve |
| **Automação** (hooks/triggers) | `hook-store.ts` + `trigger-runner.ts` | `<ws>/.opencorp/hooks/` + triggers globais | JSON no filesystem |
| **Histórico** | `registry-store.ts` + corp.db | `<ws>/.opencorp/registries/<categoria>/` | Filesystem (MD) + índice |

**Princípio central:** o **eventBus** (`event-bus.ts`) é o sistema nervoso. `task-store`, `flow-store`, `meeting-manager` e `team-orchestrator` emitem eventos (`task.criada`, `task.mensagem`, `flow-inicio`, `reuniao-inicio`…). Dois ouvintes instalados no server/daemon reagem: **triggers** (automations declarativas) e **mention-runner** (menções `@agente` no chat de tasks). Quem mantém tudo vivo: `opencorp daemon` (systemd do usuário) → scheduler + serve com restart.

---

## 2 · Tasks — o kanban (espinha dorsal)

`src/core/task-store.ts` · banco por workspace: `<ws>/.opencorp/tasks.db`.

### 2.1 Modelo da task

```jsonc
{
  "id": "tsk_x1", "titulo": "...", "coluna": "fazendo", "pos": 1024,
  "prioridade": "media",            // baixa | media | alta
  "labels": [], "responsavel": "agente:executor-padrao", "due": null,
  "task_pai": null,                 // fan-out: subtask aponta para a pai
  "bloqueado_por": ["tsk_9f8e"],    // barreira: não inicia até as deps estarem em "feito"
  "lock_por": null, "lock_expira": null   // lease anti-colisão (30 min default)
}
```

- **Colunas**: `backlog → fazendo → bloqueado → feito` (+ colunas custom). `pos` é fracionário (insere no meio dividindo posições — ordenação estável sem reindexar).
- **`mover` para "feito"** emite `task.concluida` → é isso que libera dependências (`bloqueado()` confere se toda dep está em `feito`).
- **Lock/lease**: `travar(id, por, 30min)` — só o dono do lock atua; `liberar` exige o mesmo dono; `limparLocksExpirados()` é o anti-stale (execução morreu com lock preso → próxima libera e posta mensagem "sistema" no chat).

### 2.2 Chat da task (a "conversa" da execução)

Toda task tem thread (`task_mensagens`): autor (`humano`, `agente:x`, `orquestrador`/`sistema`), tipo (`comentario | handoff | sistema | artefato | decisao`), corpo com **menções** `@agente` extraídas automaticamente, e `refs` (artefatos por caminho). Rate limit embutido: **30 mensagens/hora** por task (HTTP 429 ao estourar).

### 2.3 Menções → execução (mention-runner, o coração multi-agente)

Quando uma mensagem é postada com `@agente`, o `mention-runner.ts` dispara o agente citado com **bundle de contexto** (task + últimas 30 msgs compactadas + artefatos + contrato: "responda via `opencorp task chat`, conclua com `task move --coluna feito`"). Antes de spawnar, passa por **3 guardas**:

1. **Loop guard** — ping-pong A↔B sem progresso (≥4 trocas) → pausa e escala humano.
2. **Rate guard** — máx. 20 mensagens automáticas/h da task → escala humano.
3. **Lease guard** — task travada por outro → mensagem fica na fila ("aguarda lock no chat").

O spawn é **detached** (processo próprio, sobrevive ao emissor; log em `~/.opencorp/logs/mencao-<agente>.log`).

---

## 3 · Agenda — scheduler de rotinas

`src/core/scheduler.ts` · banco **global** `~/.opencorp/scheduler.db` (jobs + `job_runs` de histórico).

### 3.1 Tipos de agenda

| Tipo | Valor | Exemplo |
|---|---|---|
| `cron` | 5 campos (min hora dom mês dow; suporta `* , - /`) | `0 9 * * *` |
| `intervalo_min` | minutos ≥ 1 | `30` |
| `data_unica` | ISO date | roda 1× e **desativa sozinho** (sem loop eterno de skip) |

### 3.2 Como executa (o tick)

- Daemon roda `tick()` a cada 30s: varre jobs ativos com `proxima_exec <= agora`.
- **Graça**: atraso > `graca_min` (5 min default) → pula e reagenda. **Catch-up** (settings `scheduler.catch_up`, ativo nesta máquina, janela 60 min): executa atrasado dentro da janela em vez de perder o dia — é o que salvou o pulso diário com a máquina acordando depois das 06:00.
- **Claim atômico**: `UPDATE ... WHERE id = ? AND proxima_exec = <valor lido>` — com dois daemons, só um ganha o direito de executar (fim da execução dupla/SQLITE_BUSY).
- **`run_now`** executa na hora (botão "Rodar agora" da Agenda).
- Execução = spawn detached do CLI (`opencorp --workspace <ws> agent run <agente> "<ordem>"`) com stderr/stdout em `~/.opencorp/logs/job-<id>.log` — **nunca mais silêncio** (lição da sessão 31/08: os 12 jobs do pulso usavam `agent run --ordem`, flag inexistente, e morriam no parser sem rastro; hoje o core barra `--ordem` e a ordem deve ser 1 argumento quotado).
- **`job_runs`** registra toda execução/pulo: `iniciado_em, fim_em, resultado, erro, pulado` — "ficou parado" ficou distinguível de "rodou e falhou" (UI: histórico da rotina).

### 3.3 Vida longa

`opencorp scheduler start` (daemon dedicado) + `opencorp daemon start|status|install` — serviço **systemd do usuário** (enabled + linger) que mantém scheduler + serve vivos com restart. Máquina reiniciou → rotinas voltam sozinhas.

---

## 4 · Fluxos — pipelines declarativos

`src/core/flow-store.ts` · spec JSON validada por zod em `<ws>/.opencorp/flows/<id>.json`.

### 4.1 Nós disponíveis

| Nó | O que faz | Config |
|---|---|---|
| `manual` | **gatilho** — exatamente 1 por flow (v1) | — |
| `agente` | roda agente com `ordem` (`{{entrada}}` interpola contexto) | `agente`, `ordem`, `resposta_arquivo` (contrato: resposta limpa em `sandbox/`, não no transcript ANSI) |
| `saida` | anexa contexto a um registro | `registro: "categoria/id"` |
| `registro` | cria registro novo com timestamp | `categoria`, `id?`, `titulo?` |
| `webhook` | HTTP com 3 tentativas e backoff exponencial | `url`, `metodo`, `corpo`, `headers` |
| `condicao` | ramifica se `contexto.includes(chave)` | `chave`, `entao`, `senao` |
| `decisao` | agente escolhe entre rótulos (contrato rígido: 1 linha com o rótulo) | `agente`, `pergunta`, `opcoes: [{rotulo, proximo}]` — decisão é **anexada** ao contexto |
| `task_create` | cria task no board | `titulo`, `descricao?`, `prioridade?`, `responsavel?`, `coluna?` |

### 4.2 Motor de execução

- Execução é **linear com ramificação**: nós comuns só podem ter 1 aresta de saída; ramificar exige `condicao`/`decisao`. DFS barra **ciclos** na validação (não existe flow infinito).
- O **contexto** (saída do nó anterior) vira a entrada do próximo — `limparCaptura()` remove lixo de terminal/ANSI para que nós seguintes recebam texto limpo.
- Cada execução cria registro em `registries/execucoes/<exec-id>/` com **status por nó** (`ok | falhou | nao-executado`) + `contexto_final` — o painel mostra o rastro passo a passo; falha interrompe no nó com erro claro (`exec-... interrompido no nó "x"`).
- Eventos `flow-inicio / flow-no / flow-fim` alimentam a UI em tempo real.

---

## 5 · Teams — orquestração multi-agente

`team-store.ts` (spec JSON em `<ws>/.opencorp/teams/`) + `team-orchestrator.ts` (execução). Um team **é uma receita**; ao rodar (`POST /teams/:id/run`), o orquestrador cria uma **task raiz** no kanban e narra tudo no chat dela (handoff/sistema/decisao) — falha em qualquer ponto = task raiz → `bloqueado` + "escala humano".

| Padrão | Spec | Como roda |
|---|---|---|
| **pipeline** | `passos: [{agente, ordem}]` | Sequencial; `{{anterior}}` leva a 1ª linha da saída do passo anterior ao próximo |
| **fanout** | `paralelos: [...]` (≥2) + `sintese?` | Cria **subtasks** (filhas da raiz, 1 por agente), roda em paralelo com lock por subtask; `bloqueado_por` = barreira (raiz só segue quando **todas** concluem); no fim, `sintese` agrega os resumos |
| **review** | `executor` + `revisor` + `turnos` (≤5) | Executor produz → revisor responde na 1ª linha `APROVADO` ou `AJUSTES: <motivo>` → ajustes voltam ao executor; esgotou turnos → `bloqueado` |
| **debate** | `proponentes` (≥2) + `moderador` | Propostas em paralelo → moderador recebe propostas e responde `DECISÃO: <escolha>` → registrada como mensagem tipo `decisao` |

Por que 4 padrões: são os modelos de coordenação do doc 14 (pipeline puro, fan-out/fan-in com barreira, revisão cruzada, debate/consenso) — o humano escolhe por config, sem orquestrador improvisado.

---

## 6 · Reuniões — boardroom síncrono

`src/core/meeting-manager.ts` · decisão/consenso (não é para execução contínua — para isso existe task/team).

- `opencorp meeting start "<pauta>" --agentes a,b,c` (default: `ceo-documentos, ceo-estrategia, secretario`; mínimo 2).
- **Transcript** vive em `registries/chats/<reuniao-...>/` (append-only, legível).
- **Moderação** (settings `meeting.moderator`): se o moderador é participante, ele decide o próximo falante a cada turno (`próximo: <agente> — instrução: <foco>`, ou `ENCERRAR` para consenso); senão, **rotação fixa**.
- **Limites duros**: `max_turnos`, `max_minutes`, `per_agent_usd` (BudgetManager confere **antes de cada turno** — orçamento estourou → encerra com motivo). Falha de turno é tolerada 1×; 2 consecutivas → `encerrada-partial`. SIGINT encerra com grça (transcript preservado).
- Ao encerrar: **ata** gerada (rotação de modelo `meeting.ata_model_rotation` para reduzir viés/custo) e anexada ao registro; status `encerrada` ou `encerrada-partial` com `motivo_fim`.
- Reunião pausável de fora: `POST /meetings/:id/stop` (o loop confere o status do registro a cada turno).

---

## 7 · Automação — hooks e triggers (a cola por evento)

`hook-store.ts` + `trigger-runner.ts`.

- **eventBus** emite eventos de tudo (tasks, flows, reuniões, execs). Um **trigger** casa `tipo + filtro` (ex.: `task.criada` com label `x`) e executa um **alvo**: `agentRun` (spawn detached do agente) ou `flowRun` (executa flow).
- **Hooks HTTP**: endpoint público `/hooks/:workspace/:id` com token (`x-opencorp-token`) — sistemas externos empurram eventos (webhook entra no opencorp).
- Proteção de recursão: eventos `hook.*`/`trigger.*` não re-disparam triggers.

---

## 8 · Como tudo se conecta — o ciclo do Pulso Diário (exemplo real)

```
06:00  scheduler (systemd) ticka → job ciclo-aud01 vence (claim atômico)
  │    spawn detached: opencorp --workspace pulso-diario agent run auditor-01 "..."
  ▼
agente lê a ordem → cria task "Ciclo: AUDITORIA-01" (eventBus: task.criada)
  │   move para fazendo (task.movida) → trabalha (checagens C1..C7)
  │   precisa de revisão? posta no chat com @revisor
  ▼
mention-runner: guardas ok → spawn detached do revisor com bundle de contexto
  ▼
revisor posta parecer → task → feito (task.concluida)
  ▼
trigger em task.concluida (se configurado) → flowRun de publicação/webhook
  ▼
tudo registrável: registry execucoes + job_runs + chats da task → Histórico/Histórico da rotina
```

O mesmo esqueleto serve para "fila editorial", "diagnóstico semanal" etc.: **job na Agenda → agente → task no board → chat/menções → feito**.

---

## 9 · Estado atual e aprendizados (sessões 30–31/08)

**Consertado/validado:**
- Pulso diário parado → causa raiz era `agent run --ordem` (flag inexistente) nos 12 jobs; corrigidos + validação na criação (core barra, API valida whitelist e args quotados).
- Scheduler: claim atômico, `job_runs`, catch-up ativo (janela 60 min), tick falho logado.
- Secretário: streaming SSE + espelho no corp.db (opencode ≥1.18: mensagens em `GET /session/:id/message`).
- Supervisão: systemd do usuário mantendo scheduler+serve; doctor detecta duplicados/órfãos.
- UI: criação de **Fluxos** e **Teams** no painel (antes só CLI); Histórico unificado com filtro por agente; botões mortos corrigidos.

**Em aberto (próximos passos):**
1. Componentes web compartilhados (ListPage/CreateForm) — migrar tasks/apps/config.
2. TZ explícita no cron do scheduler + doctor `--fix` automático.
3. Espelho `job_runs` por workspace no corp.db + `PRAGMA user_version`.
4. e2e novos: criar fluxo via UI, filtro de histórico, chat streaming.

**Regras aprendidas (não repetir):** spawn de job nunca com `stdio:"ignore"` sem log; ordem do `agent run` é posicional e deve vir quotada; `pkill -f` com padrão que casa com o próprio shell mata a sessão; shorthand TS `{ home, }` ≠ `{ homeDir: home }` (já poluiu o scheduler.db real em teste).
