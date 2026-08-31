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
