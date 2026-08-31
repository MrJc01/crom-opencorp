# PLANO-CONSOLIDACAO — Responsividade, Padronização e Pulso Diário

> **STATUS DA SESSÃO 31/08 (implementado e verificado ao vivo):**
>
> - **ETAPA 0 ✅** — limpeza + fix dos 12 jobs (`--ordem` inexistente) + pulso validado antecipadamente (parecer PASS 7/0).
> - **ETAPA 1 ✅** — ciclo de vida (log redirect do filho, kill em boot falho, adoção de órfão saudável, boot 25s);
>   **streaming SSE real** (`POST /secretario/conversa/stream`: inicio → delta* → fim, validado com 1ª resposta em ~7s);
>   estado/rascunho sobrevivem à navegação; chat espelhado no corp.db (`mensagens` + `sessoes`).
>   **🔥 ACHADO CRÍTICO**: opencode ≥1.18 moveu as mensagens p/ `GET /session/:id/message` — o poll antigo lia
>   `session.messages` (sempre vazio) → **era a causa real da secretária não responsiva** (504 após 180s+). Corrigido
>   nos 3 pontos (proxy de mensagens, poll do sync, poll do stream). + Fix `req.destroyed` (auto-destroy pós-leitura do
>   corpo — o check de desconexão correto é `res.destroyed`).
> - **ETAPA 2 ✅** — form de criação de fluxo na UI (POST /flows, passos dinâmicos); **form de criação de teams**
>   (pipeline/fanout/review/debate, spec gerada); fixes: `rodarFlowHub`, Cancelar da agenda, deep-link `#/app/:id`.
> - **ETAPA 3 ✅** — `GET /historico` (server-side merge: execuções+tasks+rotinas+conversas da secretária, filtro por
>   agente/tipo/limite) + view reescrita com filtro de agente, guard de 1º render (fim do flicker).
> - **ETAPA 4 ✅ (essencial)** — claim atômico no tick (impossível execução dupla); `job_runs` (histórico de execuções
>   e pulos, visível via `GET /schedules/:id/runs`); stderr/stdout do job → `~/.opencorp/logs/job-<id>.log`;
>   validação `--ordem` no core + whitelist de comandos na API; tick loga erros; **catch-up implementado e ATIVADO
>   nesta máquina** (`scheduler.catch_up=true`, janela 60min — pulso sobrevive a reboot/dormência; atraso fora da
>   janela continua sendo pulado COM registro). (4.5 TZ explícita, 4.8 doctor → pendentes.)
> - **ETAPA 5 ✅ (parcial)** — corp.db: tabela `mensagens` + `listarSessoes(agentePrefixo)` + `RegistryStore.corpDb()`;
>   fix bug latente (`mkdirRecursive` não awaited no construtor); **zod `taskCreateSchema` aplicado no POST /tasks**
>   (título/responsável/prioridade validados → 422 com detalhes). (job_runs_mirror → pendente.)
> - **ETAPA 6 ✅ (essencial)** — `/tasks*` e `/schedules*` no ROUTES; **testes de contrato** (`tests/web-contratos.test.ts`):
>   (a) todo handler inline precisa estar exposto em window (mata a classe "botão morto" — já teria pego
>   `rodarFlowHub`/`renderAgendaForm`), (b) toda rota literal do front existe no ROUTES, (c) rotas críticas presentes;
>   `api()` com teto de 30s para POST/PATCH/DELETE (conversas de secretária isentas). (Componentes compartilhados
>   ListPage/CreateForm e tipos únicos → próxima sessão.)
> - **ETAPA 7 ✅ (mínimo viável)** — `opencorp daemon start|stop|status`: supervisor mantém scheduler + serve vivos
>   (health 15s, restart, fix corrida do pidfile, `--host` passthrough p/ rede). Em produção nesta máquina.
>   **globalTeardown de e2e** mata fixtures fake-opencode sobreviventes. (Restart do serve supervisionado herdando
>   --host do daemon.)
> - **Testes: 438/438 ✅** (novos: claim atômico, pulo registrado, corrida entre daemons, catch-up on/off/janela,
>   job_runs, corp.db mensagens, contratos web). ⚠ lição: shorthand `{ home, }` ≠ `{ homeDir: home }` no teste chegou
>   a poluir o scheduler.db real — limpado.
> - **Produção nesta máquina**: supervisor `daemon` mantendo scheduler (14 jobs) + serve em **0.0.0.0:4100**
>   (acessível em `http://192.168.18.15:4100` — login com token de `~/.opencorp/api.pid`); secretária em streaming;
>   catch-up ativo; 4 tasks de design/informação no board do pulso-diario + 2 rotinas diárias (ciclo-melhoria-design
>   07:30, ciclo-melhoria-info 07:45).

> Base: auditoria v0.4.0 (31/08/2026) — frontend (`src/web/`), core (`src/core/`), API (`src/server/index.ts`),
> docs existentes (PLANO-WEB-V4, PLANO-ESTABILIZACAO, HANDOFF, PROXIMA-SESSAO) e **estado vivo da máquina**
> (2 daemons de scheduler, 4 `opencode serve` órfãos, 4 `opencorp serve` órfãos, 10 fixtures de teste vazando,
> 12 jobs de ciclo ativos com `ultima_exec=null`).
>
> Este plano NÃO substitui PLANO-ESTABILIZACAO (Fases 2-5 seguem válidas); consolida os 3 eixos sentidos em uso real:
> **secretária lenta**, **histórico sem filtro**, **fluxos sem criação**, **pulso diário frágil**, **gestão fragmentada**.

## Objetivo

1. Secretária responde com streaming e sobrevive a navegadas (chat de verdade).
2. Todas as páginas de criação funcionam (fluxo, teams) e nenhum botão morre em silêncio.
3. Histórico único, filtrável por agente, incluindo os chats da secretária.
4. Pulso diário à prova de reboot, com histórico de execução e catch-up configurável.
5. corp.db passa a ser fonte da verdade do dinâmico (sessões, mensagens, execuções de rotina).
6. Contratos padronizados: API documentada + componentes web compartilhados + um daemon supervisor.

---

## Regras de execução (vale para todas as etapas)

- **Regra de ouro** (docs/HANDOFF-SESSAO.md): nunca matar `opencode*`/`node` sem conferir que é nosso
  (pidfile `~/.opencorp/*.pid|*.json` ou cmdline contendo `bin/opencorp.mjs` / `tests/fixtures/fake-opencode.mjs`).
- **Build obrigatório**: `npm run build` (tsc → `dist/` + `tsc -p tsconfig.web.json` → `web-dist/`). Sem build, nada funciona.
- **Nunca cache-bust módulo ES** (`?v=` quebra boot duplo — lição 13). Nunca expor secrets. `escapeHtml` sempre.
- **Toda rota nova entra no array `ROUTES`** (`src/server/index.ts:43-101`) — hoje `/tasks*` e `/schedules*` já violam isso.
- **Um commit por sub-tarefa**; testes (`npm test`) antes de commit; e2e (`npm run test:e2e`) nas etapas de UI.
- Validação zod em toda entrada nova de API (tasks hoje é a lacuna — sem schema).

---

## ETAPA 0 — Higiene operacional `[~30 min, sem código]` ✅ **CONCLUÍDA 31/08 04:00**

**Meta: máquina limpa antes de mexer em nada. O 1º pulso dispara hoje às 06:00 local.**

- [x] **0.1 — Deduplicar scheduler** ✅ mantido 702709 (pidfile), morto 339298.
- [x] **0.2 — Limpar instâncias órfãs de `opencode serve`** ✅ 4 mortas (cwd em /tmp/*smoke*/e2e) + 2 mcp serve.
- [x] **0.3 — Limpar `opencorp serve` órfãos** ✅ 4 mortas (portas 4322/4332/4333/4300).
- [x] **0.4 — Limpar fixtures de teste vazando** ✅ 10 `fake-opencode` mortas (⚠ pkill com padrão que casa com o
      próprio shell mata a sessão — usar `pkill -f` com padrão exato do fixture em script, não em linha interativa).
- [x] **0.5 — Conferência** ✅ doctor 11 ok/0 falha; serve limpo em `127.0.0.1:4100` (api.pid ok);
      `/status` = `{scheduler:true, secretario:false}` (secretária sobe sob demanda).
- [x] **0.6 — Jobs corrigidos e pulso validado antecipadamente** (achado crítico, ver abaixo):
  - **🔥 BUG DOS 12 JOBS**: todos foram criados com `agent run ... --ordem "..."`, mas `--ordem` **não existe** —
    `ordem` é argumento posicional (`agent run <id> <ordem>`). Toda execução morria no parser com `stdio:"ignore"`
    → **zero rastro** (demonstração ao vivo do gap `job_runs` da Etapa 4.3).
  - Fix aplicado: backup em `/tmp/opencode/scheduler-backup-pre-fix.db` + reescrita dos args dos 12 jobs
    (removido `--ordem`/`--workspace` duplicado; ordem posicional após o id do agente).
  - Validação end-to-end: job de teste (`teste-tick`, intervalo 2min, `task create`) → tick + spawn + task criada
    ✅; `run-now` do ciclo-aud01 real → task "Ciclo: AUDITORIA-01" criada, executada e movida a **feito**;
    parecer gravado em `registries/documentos/PARECER-AUDITORIA-01-2026-08-31.md` (**VEREDITO: PASS 7/0**) ✅.
  - Jobs de teste e tasks `TESTE-PULSO-tick` removidos.

**Aceite:** ✅ `doctor` sem erros; 1 scheduler, 0 órfãos; ciclo executado e validado antes das 06:00.

**Arquivos:** nenhum (operacional). **Achados para frente:** (a) tasks antigas no board com lixo de terminal no título
(códigos ANSI, output de erro) — reforça item 4.x anti-falso-sucesso do PLANO-ESTABILIZACAO;
(b) supervisores: `pulso-diario` tem `supervisor.pid` mas nenhum processo próprio (coberto pelo global — revisar na 7);
(c) validação de sintaxe na criação de job → novo item **4.9**.

---

## ETAPA 1 — Secretária: ciclo de vida + streaming `[1-2 dias]`

**Meta: chat responsivo — 1ª resposta visível em segundos, zero cold start recorrente, estado preservado.**

Causas raiz confirmadas: proxy síncrono sem streaming (pior caso 430s > `requestTimeout` Node 300s,
`server/index.ts:1225-1323`); pidfile `opencode-server.json` perdido → cold boot de 15s por chat e 4 instâncias órfãs;
view reseta estado ao navegar (`secretario.ts:84-91`).

- [ ] **1.1 — Ciclo de vida à prova:**
  - `OpencodeServerManager.iniciar()` (`opencode-server.ts:193-237`): antes de spawnar, matar instâncias
    órfãs detectáveis (portas em `~/.opencorp/logs/` ou via pidfile corrompido) OU adotar lock de single-instance
    (`flock` no pidfile) que rejeita 2º spawn.
  - `status()` (`opencode-server.ts:239-258`): ao detectar pid morto/porta sem resposta, **limpar pidfile** imediatamente
    (hoje o pidfile velho persiste e induz start duplo).
  - `parar()` deve matar o processo E remover pidfile atomicamente.
- [ ] **1.2 — Streaming real (SSE):**
  - Server: `POST /secretario/conversa/stream` que responde `text/event-stream`, reencaminhando os eventos
    `message.part.updated` (ou poll de `GET /session/:id` a 500ms enviando delta) e finalizando com `sessao_id`.
  - Fallback: manter o endpoint atual para ambientes sem SSE; timeout do handler ≤ 240s total (dentro do requestTimeout).
  - Front (`secretario.ts:413-483`): substituir fetch síncrono por `fetch` + leitura de stream (`ReadableStream`),
    renderizando markdown incremental (`md.ts`); STOP aborta e informa que o processamento continua no servidor.
- [ ] **1.3 — Estado sobrevive à navegação:**
  - Não resetar `mensagensCache`/rascunho em `renderSecretario()` (linhas 84-91); reset só em `__secretarioNovaConversa`.
  - Rascunho do textarea em `sessionStorage` (chave por sessão).
- [ ] **1.4 — Persistir chat no corp.db** (espelho mínimo, schema completo na Etapa 5):
  - Após cada conversa concluída, `CorpDb.upsertSessao` + nova tabela `mensagens` (agente = `secretario`/`secretario-exec`).

**Aceite:** 1ª resposta parcial < 5s em conversa quente; apenas 1 processo `opencode serve` vivo após N inícios/paradas;
sair e voltar da view mantém conversa e rascunho; mensagens da secretária consultáveis via corp.db.
**Verificação:** e2e novo (Playwright): iniciar chat, navegar, voltar, enviar msg, assert streaming; `ps` assert 1 instância.
**Riscos:** formato de stream do opencode varia por versão — isolar em `opencode-server.ts` com testes contra fixture.

---

## ETAPA 2 — Criação de fluxo na UI + botões mortos `[0,5-1 dia]`

**Meta: criar fluxo pelo painel; zero botões que jogam ReferenceError.**

- [ ] **2.1 — Form "Novo fluxo"** (drawer, reusando padrão do wizard):
  - Campos: `id` (kebab), `nome`, `descrição`, gatilho `manual` (v1) e editor de nós em lista simples
    (`agente` → agente+ordem, `condicao` → texto/ramos, `saida`/`registro`); gerar JSON do `flowSchema`
    client-side e `POST /flows` (`server/index.ts:702` já existe).
  - Erros de validação do server exibidos no form (não só toast); sucesso abre detalhes do fluxo criado.
- [ ] **2.2 — Fix `rodarFlowHub`** (`home.ts:229`): expor em `exporGlobais` (`main.ts:342-385`) ou converter para
  `window.__`; testar os 3 fluxos de hub.
- [ ] **2.3 — Fix "Cancelar" da Agenda** (`agenda.ts:164`): expor handler que limpa o form.
- [ ] **2.4 — Fix deep-link `#/app/:id`** (`router.ts:15`, `app-detail.ts:8-16`): rota renderiza dentro de `#view-apps`
  (ou redireciona para `#/apps` + `abrirApp(id)`), eliminando tela em branco.
- [ ] **2.5 — (bônus) Form de teams** substituindo o "cole JSON" (`teams.ts:44`): pipeline simples (lista de agentes
  + padrão) → spec gerada; se apertar prazo, adiar para Etapa 6 (components).

**Aceite:** criar → executar → ver execução em Início, tudo pela UI; console limpo em todas as views; deep-link funciona.
**Verificação:** e2e: criar fluxo via UI, rodar, assert registro em `execucoes`; grep de `onclick=` sem handler exposto (script novo, Etapa 6.4).

---

## ETAPA 3 — Histórico único com filtro por agente `[0,5-1 dia]`

**Meta: ver só a secretária (ou só qualquer agente) no Histórico; chats da secretária presentes; sem flicker.**

Causas raiz: mesclagem client-side sem filtro de agente (`historico.ts:38-59`, `format.ts:143-198`);
chats da secretária só em `/secretario/sessoes` (silos separados); refetch triplo a cada clique e a cada 8s.

- [ ] **3.1 — API server-side:** `GET /historico?agente=&tipo=&limite=&all=` que une em um só lugar:
  execuções (`listarExecucoes` — já filtra por agente, `session-manager.ts:425-434`) + tasks + rotinas + **sessões da
  secretária** (proxy `/secretario/sessoes`, anotadas `agente=secretario`); entrar no `ROUTES`.
- [ ] **3.2 — UI:** filtro por agente (select populado de `/agents` + "secretária"); filtro por tipo mantido;
  mesclagem server-side substitui `mesclarHistorico` client-side; guard de primeiro render (fim do flicker de 8s).
- [ ] **3.3 — Corrigir falhas silenciosas**: sem `.catch(() => [])` escondendo queda parcial — mostrar banner
  "execuções indisponíveis" quando uma fonte falha.
- [ ] **3.4 — Acessos diretos**: cards da secretária no Histórico abrem a conversa (`#/secretario` + sessão ativa).

**Aceite:** filtrar "secretária" mostra só as conversas/atividades dela; refresh de 8s não reinicia a timeline;
fonte em queda é sinalizada.
**Verificação:** unit do handler `/historico` (fixture de 3 fontes); e2e do filtro.

---

## ETAPA 4 — Scheduler robusto `[1 dia]`

**Meta: pulso diário confiável — single-instance, claim atômico, histórico de execuções, catch-up decidido.**

Causas raiz: sem claim atômico (execução dupla com 2 daemons); erros de tick engolidos (`scheduler.ts:299`);
grace de 5 min sem catch-up pula o dia em silêncio (`scheduler.ts:266-272`); sem histórico de execuções
(só `ultima_exec`); TZ ambígua (`scheduler.ts:83-89`).

- [ ] **4.1 — Single-instance lock:** `scheduler start` verifica pidfile + pid vivo; se já existe, sai com mensagem
  (opção `--takeover` mata o antigo e assume). Resolve a duplicidade de forma estrutural (Etapa 0 era paliativo).
- [ ] **4.2 — Claim atômico:** `UPDATE jobs SET proxima_exec=:nova WHERE id=:id AND proxima_exec=:velha`;
  `changes()==1` ganha o direito de executar. Duplicatas entre daemons/instâncias impossíveis.
- [ ] **4.3 — Tabela `job_runs`** no `scheduler.db`: `(id, job_id, iniciado_em, fim_em, exit_code, resumo, erro, pulado)`;
  registrar execução, falha de spawn, e **skip por grace** (com `proxima_exec` recalculada).
- [ ] **4.4 — Catch-up configurável:** setting `scheduler.catch_up` (default false): true = executa atrasado dentro de
  `catch_up_max_min`; false = pula com registro em `job_runs`. Fim dos dias perdidos sem rastro.
- [ ] **4.5 — TZ explícita:** setting `scheduler.tz` (default: local no momento da criação, persistida no job);
  `proxima_exec` sempre UTC; exibição no TZ do job.
- [ ] **4.6 — Log de erro do tick:** falha de tick entra em `job_runs` (job=null, tipo=erro) + `console.error`
  substituindo o `.catch(() => undefined)` (`scheduler.ts:299`).
- [ ] **4.7 — UI Agenda:** `ultima_exec=null` → badge "nunca rodou"; histórico de runs por job (drawer lê `job_runs`);
  próximos 3 horários; jobs pausados visíveis com badge.
- [ ] **4.8 — Doctor:** `checkScheduler` (`doctor.ts:308-365`) passa a detectar **daemons duplicados** e instâncias
  opencode órfãs, com `--fix` para limpar (respeitando regra de ouro).
- [ ] **4.9 — Validar args na criação de job** (novo, achado da Etapa 0): `Scheduler.criar` e `POST /schedules`
  validam que `args` é um comando CLI real (1º token ∈ comandos registrados, flags conferem com `--help` do comando)
  — teria barrado o bug `--ordem` dos 12 jobs na criação. Inclui log de erro do spawn: nunca `stdio:"ignore"` sem
  captura — redirecionar stderr do filho para `~/.opencorp/logs/job-<id>.log` (junto com 4.3/4.6 fecha o ciclo de
  observabilidade: hoje um job quebrado é indistinguível de um job saudável).

**Aceite:** iniciar 2º daemon → 2º sai com mensagem clara; job pausado/reagendado/skipado sempre tem run registrada;
UI mostra "nunca rodou" e o histórico; doctor detecta duplicados.
**Verificação:** unit: claim concorrente simulado (2 conexões), catch-up on/off, TZ; integração: matar daemon, rodar após
atraso > grace, checar `job_runs.pulado=1`.

---

## ETAPA 5 — corp.db fonte da verdade do dinâmico `[1-1,5 dia]`

**Meta: o que é vivo (sessões, mensagens, execuções de rotina) persiste no corp.db com migrações versionadas.**

Hoje: corp.db é espelho do filesystem (`corp-db.ts:49-81`), chats da secretária ficam cativos no storage do opencode,
rotinas só têm `ultima_exec`. Filesystem continua fonte do **documental** (registries, agentes .md, flows .json).

- [ ] **5.1 — Migrações versionadas:** `PRAGMA user_version`; v1 adiciona:
  ```sql
  CREATE TABLE IF NOT EXISTS mensagens (
    id TEXT PRIMARY KEY, sessao_id TEXT NOT NULL, agente TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL, conteudo TEXT NOT NULL DEFAULT '', criado_em TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_mensagens_sessao ON mensagens (sessao_id, criado_em);
  CREATE TABLE IF NOT EXISTS job_runs_mirror ( -- espelho do scheduler.db para o ws
    id TEXT PRIMARY KEY, job_id TEXT NOT NULL, job_nome TEXT, iniciado_em TEXT,
    fim_em TEXT, exit_code INTEGER, resumo TEXT, erro TEXT, pulado INTEGER DEFAULT 0
  );
  ```
- [ ] **5.2 — Espelhar chats da secretária** (consolida 1.4): `upsertSessao(agente=secretario|secretario-exec)`
  + insert das mensagens a cada conversa concluída; `reindexar` (`registry-store.ts:512-560`) atualizado.
- [ ] **5.3 — Espelhar `job_runs` por workspace** na execução (scheduler notifica por evento/eventBus → server espelha
  no ws do job; daemon standalone grava direto no ws via CLI path).
- [ ] **5.4 — `GET /historico` (Etapa 3.1) lê do corp.db** quando disponível (uma query, não 3 fontes).
- [ ] **5.5 — Schema zod para tasks** (`src/schemas/task.ts`) aplicado no `POST /tasks` (`server/index.ts:826-837`)
  — fecha a lacuna de validação.

**Aceite:** limpar o storage do opencode não perde histórico (consultável no corp.db); `/historico` sobrevive com
opencode parado; migração idempotente em banco existente (testar com os 5 workspaces atuais).
**Verificação:** unit de migração (v0→v1 em fixture); integração: conversa → corp.db → query por agente.

---

## ETAPA 6 — Contratos padronizados `[2-3 dias]`

**Meta: um jeito certo para API e para views; matar a classe de bugs "botão morto".**

- [ ] **6.1 — `ROUTES` completo + teste de dif:** teste unitário que extrai rotas implementadas do handler e compara
  com `ROUTES` — divergência falha o build (hoje `/tasks*`, `/schedules*` faltam; `GET /settings/:chave` sem uso).
- [ ] **6.2 — `api()` única via de HTTP:** POST com timeout configurável (default 30s; chat usa streaming à parte);
  abolir `q` como alias (deprecar com codemod trivial); `.catch(() => undefined)` proibido — cada falha tem
  toast + estado de erro na view (migrar os ~10 pontos: `tasks.ts:151,162,267-327`, `home.ts:61-66`, `agenda.ts`).
- [ ] **6.3 — Componentes compartilhados** (`src/web/ui/`): `ListPage` (guard de render + header + filtros),
  `CreateForm` (drawer + validação + POST + erro inline), `DetailDrawer`, `RunHistory` (lê execuções/runs do domínio).
  Pilotos: migrar **fluxos** e **agenda**; depois tasks, teams, apps (1 view por PR).
- [ ] **6.4 — Binding de eventos único:** tudo por `exporGlobais` central com verificação — teste estático que falha se
  algum `onclick="fn()"` referenciar função não exportada (mata `rodarFlowHub`, `renderAgendaForm` para sempre).
- [ ] **6.5 — Tipos em uma fonte:** `FlowInfo`, `ScheduleJob`, `SessionInfo`, `AppSpec` etc. só em `state.ts`;
  apagar cópias (`fluxos.ts:28`, `home.ts:40`, `agenda.ts:73`, `apps.ts:10`, `format.ts:105,122`).
- [ ] **6.6 — Loading padronizado:** guard "primeiro render" em todas as views (fim das 3 convenções).

**Aceite:** teste de dif de rotas e teste de handlers no CI; 2 views migradas sem regressão visual; 0 tipos duplicados.
**Verificação:** `npm test` + e2e das views piloto; grep por `q<`/`window.__` fora do padrão em refactor seguinte.

---

## ETAPA 7 — Daemon supervisor único `[1-2 dias]`

**Meta: um comando sobe tudo; reboot não perde rotina; sem órfãos.**

- [ ] **7.1 — `opencorp daemon start`:** gerencia scheduler + opencode serve (+ `serve` opcional via setting);
  health checks periódicos, restart com backoff, pidfiles únicos, cleanup de órfãos no boot (usando o detector 4.8).
- [ ] **7.2 — `GET /status`** reflete os 3 subprocessos com detalhes (uptime, porta, última ação).
- [ ] **7.3 — `opencorp daemon stop|status`; integração com doctor `--fix`.**
- [ ] **7.4 — Cleanup de e2e:** `globalTeardown` no Playwright mata fixtures (`fake-opencode`) — fim do vazamento da
  Etapa 0.4.

**Aceite:** reboot da máquina → `opencorp daemon start` → tudo de pé, pulso do dia executa (com catch-up se habilitado);
24h sem processo órfão novo.
**Verificação:** script de caos (matar filhos, verificar restart); e2e teardown assertion.

---

## ETAPA 8 — Qualidade, docs e handoff `[contínuo]`

- [ ] **8.1 — Docs:** atualizar PLANO-WEB-V4 (status real do E6 streaming), PROXIMA-SESSAO e HANDOFF com este plano;
  marcar itens concluídos aqui mesmo.
- [ ] **8.2 — Baterias de teste:** unit scheduler (claim/catch-up/TZ), migração corp.db, dif de rotas, handlers web;
  e2e: chat streaming, criar fluxo, filtro de histórico, agenda.
- [ ] **8.3 — web-checklist** do template atualizado com os novos padrões (Etapa 6).

---

## Ordem, dependências e estimativas

| Etapa | Escopo | Depende de | Estimativa | Valor imediato |
|---|---|---|---|---|
| 0 | Higiene operacional | — | 30 min | Máquina limpa; pulso de hoje sai |
| 1 | Secretária (lifecycle + streaming) | 0 | 1-2 dias | Chat responsivo de verdade |
| 2 | Fluxo UI + botões mortos | 0 | 0,5-1 dia | Criação funciona na UI |
| 3 | Histórico com filtro | 0 (5.2 melhora) | 0,5-1 dia | Vê só o que quer |
| 4 | Scheduler robusto | 0 | 1 dia | Pulso confiável |
| 5 | corp.db dinâmico | 1.4, 4.3 | 1-1,5 dia | Memória persistente |
| 6 | Contratos padronizados | 2, 3 | 2-3 dias | Fim dos bugs de classe |
| 7 | Daemon supervisor | 4, 1 | 1-2 dias | Infra à prova de reboot |
| 8 | Qualidade/docs | todas | contínuo | Sustentação |

**Caminho crítico:** 0 → 1 → 4 → 5 → 7. Etapas 2 e 3 são paralelizáveis em qualquer ponto após 0.
**Total estimado:** ~8-11 dias de trabalho focado.

## Checklist mestre

- [x] ETAPA 0 — Higiene operacional ✅ (31/08: limpeza + fix dos 12 jobs + pulso validado antecipadamente)
- [ ] ETAPA 1 — Secretária: lifecycle + streaming
- [ ] ETAPA 2 — Fluxo UI + botões mortos
- [ ] ETAPA 3 — Histórico com filtro por agente
- [ ] ETAPA 4 — Scheduler robusto (+ 4.9 validação de args)
- [ ] ETAPA 5 — corp.db fonte do dinâmico
- [ ] ETAPA 6 — Contratos padronizados
- [ ] ETAPA 7 — Daemon supervisor
- [ ] ETAPA 8 — Qualidade e docs
