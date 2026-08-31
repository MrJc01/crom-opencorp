# HANDOFF — Sessão 31/08 (continuação)

> Continua HANDOFF-SESSAO.md (30/08). Estado detalhado por etapa: **docs/PLANO-CONSOLIDACAO.md**.

## O que mudou nesta sessão (31/08 tarde)

1. **Pulso diário consertado e em produção**: causa raiz era `agent run --ordem` (flag inexistente) nos 12 jobs —
   morriam em silêncio no parser. Corrigidos (ordem posicional) + validação na criação (core barra `--ordem`,
   API valida whitelist de comandos). Validado com `run-now`: parecer PASS 7/0 gravado.
2. **Secretária responsiva de verdade**: opencode ≥1.18 mudou a API (`GET /session/:id/message`); o poll antigo lia
   `session.messages` (vazio) → 504. Corrigido + **streaming SSE** (`/secretario/conversa/stream`).
   Ciclo de vida do opencode serve com log/kill-on-boot-fail/adoção de órfão. Chat espelhado no corp.db.
3. **Supervisão completa**: `opencorp daemon start|status|install` — serviço systemd do usuário (enabled + linger)
   mantendo scheduler + serve vivos com restart; servidor acessível em `0.0.0.0:4100`
   (LAN: http://192.168.18.15:4100). Doctor ganhou checagem de duplicados/órfãos.
4. **UI**: criação de fluxo e de teams no painel (antes só CLI); Histórico unificado server-side com filtro por
   agente (inclui conversas da secretária); botões mortos corrigidos.
5. **Qualidade**: 431 testes verdes (claim atômico, job_runs, catch-up, contratos web); `job_runs` no scheduler.db;
   catch-up configurável (`scheduler.catch_up`, ativo nesta máquina com janela 60min); zod no POST /tasks.

## Regras aprendidas (não repetir)

- `req.destroyed` vira true após consumir o corpo (autoDestroy) — check de cliente desconectado é `res.destroyed`.
- opencode ≥1.18: mensagens em `GET /session/:id/message` (NÃO em `GET /session/:id`).
- Spawn de job NUNCA com `stdio:"ignore"` sem captura — stderr vai para `~/.opencorp/logs/job-<id>.log`.
- Shorthand TS `{ home, }` ≠ `{ homeDir: home }` — teste chegou a poluir o scheduler.db REAL.
- `pkill -f` com padrão que casa com o próprio shell mata a sessão — listar PIDs antes.

## Próximos passos (prioridade)

1. Componentes web compartilhados (ListPage/CreateForm) — migrar tasks/apps/config (Etapa 6.3).
2. TZ explícita no cron do scheduler (4.5) + doctor `--fix` automático (4.8).
3. Espelho `job_runs` por workspace no corp.db (5.3) + `PRAGMA user_version` (5.1 formal).
4. e2e novos: criar fluxo via UI, filtro de histórico, chat streaming.

## PLANO-UNIFICACAO iniciado (31/08 noite) — primitiva de Execução

Base: análise "tudo se resume em agente e como ele é usado/organizado" + pesquisa (Temporal/Inngest, LangGraph/CrewAI/AutoGen). Implementado por estrangulamento (sem big bang):

1. **Contrato do gatilho** (`src/schemas/gatilho.ts`): `manual|cron|evento|mencao|webhook|dependencia|padrao|turno`; `SessionManager.rodar` aceita `gatilho` → extras + eventos + ledger. CLI: `agent run --gatilho <tipo>:<origem>`.
2. **Ledger unificado** no corp.db (tabela `execucoes`): agente, modelo, gatilho_tipo/origem, status, duração, custo, exit — consulta `GET /execucoes?agente=&gatilho=&origem=&status=`.
3. **Motores se auto-declaram**: scheduler (`cron:<job>`), mention (`mencao:<task>/<alvo>`), trigger/hook (`evento:<id>`), flow (`dependencia:flow:<id>/<no>`), team (`padrao:team:<id>/<passo>`), reunião (`turno:<id>`, incl. moderação e ata), API run (`manual:api:<ws>`).
4. **Evento unificado** `exec.iniciada` (com gatilho) além de `sessao-inicio/fim` (que agora carregam gatilho).
5. **Flow durável**: `opencorp flow resume <id> <execId>` / `POST /flows/:id/resume` — retoma execução falha do último nó ok (mesmo exec, nós ok não re-executam, evento `retomado`). UI: `GET /flows/:id/status` + botão Retomar no drawer. Histórico (web) mostra badge de gatilho.

Testes novos: `tests/exec-ledger.test.ts` (7), `tests/engine-gatilho.test.ts` (6), `tests/flow-resume.test.ts` (2). Doc de consulta: `docs/15-gestao-operacao.md` (§9 primitiva unificada).

**Etapa 6 concluída** (mesma sessão): e2e destravado — 🔥 race de login no painel (IIFE de importação em
`fluxos.ts` fazia fetch sem token → 401 → sairParaLogin limpava a sessão; fix: `state.ts` hidrata token/ws
no load do módulo → nav 9/9, suite 47 ✅ com 9 falhas PRÉ-existentes em agenda/apps/chat/secretário,
idênticas no baseline); doctor `checkLedger` (órfãs >24h em "executando" → warn); release notes
`docs/release-v0.5.0.md`; package.json → **0.5.0**. Validação ao vivo: `agent run --gatilho manual:...`
→ ledger correto no corp.db do pulso-diario + `GET /execucoes` na API. Versão nova exige restart do
serve/daemon para `/health` mostrar v0.5.0 (daemon já reiniciado nesta sessão).
