# release v0.5.0 — Primitiva de Execução unificada (Agente × Gatilho × Execução)

> Sucessor do v0.4.0 (consolidação: secretária em streaming, scheduler robusto, daemon systemd, UI de criação de fluxos/teams, histórico unificado). Este release executa o **PLANO-UNIFICACAO** (docs/PLANO-UNIFICACAO.md): a constatação de que **tasks, agenda, fluxos, automação, teams e reuniões são o mesmo fenômeno — um agente ativado sob circunstâncias diferentes** — passou a ser estrutura de código, por estrangulamento (sem big bang, 452 testes sempre verdes).

## Motivação (pesquisa + análise)

- **Durable execution** (Temporal/Inngest/Trigger.dev/Hatchet, 2026): uma única primitiva (função/workflow) e o que diferencia cada uso é só **o que a acorda** — cron, evento, webhook, outra função ("events wake functions").
- **Frameworks de agentes** (LangGraph/CrewAI/AutoGen): agente = nó; pipeline/fanout/review/debate são **arranjos** sobre a mesma primitiva, não engines separados.
- Antes: 6 caminhos de "rodar agente com ordem", 4 dialetos de contexto, 4 sistemas parciais de guardas, 6 stores, 4 famílias de eventos, 5 formatos de id — repetitivo, não padronizado.

## O que entrega

**contrato do gatilho (`src/schemas/gatilho.ts`)** — `manual | cron | evento | mencao | webhook | dependencia | padrao | turno`, parseado de `<tipo>:<origem>`, validado por zod. `SessionManager.rodar` aceita `gatilho` e o propaga para: extras do registro documental (`registries/execucoes`), eventos e ledger. CLI: `agent run --gatilho cron:sch-abc` (e atalho `run`); gatilho inválido é barrado **antes** do spawn.

**ledger unificado (`corp.db` tabela `execucoes`)** — toda ativação de agente, de qualquer motor, numa única tabela consultável: `agente, modelo, gatilho_tipo, gatilho_origem, status, inicio, fim, duracao_ms, custo_usd, exit_code`. Gravação no início (`executando`) e na finalização (com custo); bloqueio de SecurityGuard e pendência HITL também entram. `listarExecucoes()` com filtros; **API `GET /execucoes?agente=&gatilho=&origem=&status=&limite=`** (ROUTES atualizado). A filosofia "tudo é arquivo" permanece: o ledger é **índice de leitura** — os registries MD/JSON seguem sendo a fonte documental.

**motores se auto-declaram** — scheduler → `cron:<jobId>` (no spawn real, `argsComGatilhoCron`) · mention-runner → `mencao:<task>/<alvo>` · trigger-runner e hooks HTTP → `evento:<id>` · nós `agente`/`decisao` de flow → `dependencia:flow:<id>/<no>` · passos de team (pipeline/fanout/síntese/review/debate/moderador) → `padrao:team:<id>/<passo>` · turnos, moderação e ata de reunião → `turno:<reuniaoId>` · `POST /agents/:id/run` → `manual:api:<ws>`.

**eventos unificados** — `exec.iniciada` (com gatilho e workspace) no eventBus; `sessao-inicio`/`sessao-fim` agora carregam o gatilho. Qualquer consumidor (trigger, SSE, futuro plugin) casa "execução iniciada por gatilho X" sem conhecer o motor.

**flow durável (resume do último nó ok)** — o maior gap vs. durable execution: execução morta no meio não perde mais o trabalho. `opencorp flow resume <id> <execId>` / `POST /flows/:id/resume {exec_id}` retoma uma execução **falha** a partir do 1º nó não-ok, com o `contexto_final` do run anterior — nós "ok" **não re-executam** (custo/auditoria preservados), o journal do mesmo exec ganha evento `retomado`. `GET /flows/:id/status` expõe a última execução (status por nó) e o drawer do flow na UI ganhou bloco "última execução" com botão **"Retomar do último nó ok"**.

**doctor — checagem do ledger** — `checkLedger(ws)`: contabiliza execuções e detecta **órfãs** (presas em "executando" com fim em aberto há >24h — processo morto sem finalizar) como `warn` com itens; entra no `opencorp doctor` com workspace ativo.

**fix de race de login no painel (e2e destravado)** — views com IIFE de importação (cache de agentes em `fluxos.ts`) disparavam fetch **antes** do boot carregar o token → 401 → `sairParaLogin()` limpava a sessão inteira. `state.ts` agora hidrata token/ws do localStorage **no load do módulo**. e2e `nav.spec` voltou a 9/9 (antes 0/9 — suite inteira morria no login).

**histórico (UI)** — itens de execução exibem o gatilho (`gatilho: <tipo>:<origem>`) na sub-linha e no detalhe.

## Testes

- **452 unitários** (vitest) — novos: `exec-ledger` (7: parse/contrato, upsert/filtros do ledger, gravação via SessionManager com e sem gatilho), `engine-gatilho` (6: scheduler, flow, team, reunião, menção, distinção no ledger), `flow-resume` (2: falha no nó 2 → retomada conclui sem re-executar nós ok; erros claros para exec concluída/inexistente), `doctor` (+3: ledger vazio/órfã/recente).
- **e2e (Playwright)** — 47 passando; **9 falhas pré-existentes** documentadas (agenda ×3, apps ×2, chat ×3, secretário ×1 — idênticas no baseline sem as mudanças; não são regressões deste release).
- **Validação ao vivo (pulso-diario)** — `agent run` com `--gatilho manual:validacao-ledger` → ledger com linha correta (status/custo/duração); `GET /execucoes` na API :4100; gatilho inválido barrado antes do spawn; daemon reiniciado de forma gerenciada (doctor 12 ok / 0 falha).

## Limitações conhecidas (honestas)

- **Guards ainda não unificadas** — loop/rate/lease (mention), claim/grace/catch-up (scheduler), budget (meeting) continuam módulos próprios; unificar exige etapa com A/B (registrada no plano).
- **Flows/teams não retomáveis como grafo completo** — o resume cobre flow; team é efêmero por design (task raiz guarda o rastro no chat).
- **Ledger por workspace** — `GET /execucoes` consulta o corp.db da empresa ativa (visão "todas as empresas" é trabalho futuro).
- **9 e2e pré-existentes falhando** — ver acima; correção fora do escopo deste release.
- Execuções do scheduler disparadas ANTES deste release não têm gatilho no ledger (classificadas `manual` se re-executadas à mão; novas execuções via job saem com `cron:<jobId>`).

## Próximos passos

- Unificar guardas num módulo único (loop/rate/lease/claim/budget) com política declarada por execução.
- Visão "todas as empresas" no ledger (merge client-side ou db global de leitura).
- e2e: consertar os 9 pré-existentes (agenda/apps/chat/secretário) e adicionar "retomar flow via UI".
- TZ explícita no cron (4.5 do PLANO-CONSOLIDACAO) continua pendente.
