# PRÓXIMA SESSÃO — opencorp (leia isto ao abrir o novo chat)

> Atualizado em 30/08/2026 (fim de sessão). Documento de continuidade. Complementa `docs/HANDOFF-SESSAO.md` (ambiente vivo).

## Estado consolidado

- **v0.3.0 TAGADA** (tag local `v0.3.0`; push falhou por acesso — usuário decide quando/onde push). Commits: extensões 19-25 + empresas autônomas + fixes web/core. 397 unitários verdes, e2e 38/38.
- Plano docs/13: **etapa 25 concluída** com aditivo: regressão cega completa foi trocada por **teste monitorado** nas 4 empresas (decisão do usuário — "pular teste cego, testar monitorado no real, corrigindo em voo").
- **4 EMPRESAS REAIS COM SITE CONFIGURADO (SETUP-OK ×4)**: pulso-diario, engenhar, emporio-aurora, norteia — cada uma com tagline/título do perfil, páginas Início/Sobre/Serviços(ou Produtos)/Cobertura, home estática e post de lançamento publicados, conteúdo adaptado ao `projeto.json` (briefing inferido pelo nome, usuário valida/refina depois).

## O que foi implementado nesta sessão (tudo commitado)

1. **Correção por projeto**: `<ws>/.opencorp/projeto.json` (perfil: nicho/público/tom/tópicos) lido pelos agentes; ordens dos triggers exigem adaptação ao perfil e variância temática (editor lista rascunhos existentes antes).
2. **Agente `auditor`** (6º agente do template): audita o site sem prompt — cenário A (setup) e B (manutenção). Corrigiu o pulso-diario SOZINHO na 2ª passada (tagline errada, home estática quebrada, título, Sobre faltando).
3. **wp.cjs v2** — páginas, settings, update/delete, configurar (home estática); SITE derivado de `__dirname` (um script serve todas as empresas); fix de status corrompido por JSON em argv[3].
4. **Triggers multi-empresa**: `task.criada` agora carrega `workspace` no payload (task-store.ts) e o `casar()` isola por empresa (retrocompatível); runner usa workspace do evento. 8 triggers (auditoria ×4 + editor ×4), todos com `--workspace` explícito na ordem.
5. **Scheduler**: job `auditoria-site` 60min ×4 (task → trigger → auditor); `fila-conteudo` 120min ×4; heartbeat 2min e checar-site antigos PAUSADOS; 446 tasks heartbeat acumuladas REMOVIDAS.
6. **Web**: modais (`src/web/modal.ts`) no lugar de prompt()/confirm() (6 call-sites), drag-and-drop no kanban, e2e agenda atualizada. **Login duplicado RESOLVIDO**: build antiga do daemon injetava `?v=` no script tag → módulo avaliado 2× → boot duplo (regra: NUNCA cache-bust módulo ES entry; o código já documentava isso — faltava rebuild).
7. **Boardroom**: ata com rotação de modelos (`meeting.ata_model_rotation`), recusas determinísticas não rotacionam.

## ESTADO ATUAL (pausa)

**JOBS TODOS PAUSADOS** (pedido do usuário): auditoria-site ×4 e fila-conteudo ×4 pausados no scheduler — para reativar: `schedule resume sch-mtg65km0c348 sch-mtg65kssey8j sch-mtg65kzbcyiv sch-mtg65l5ba05c` (auditorias) e `schedule resume sch-mtg65lbgh5xu sch-mtg65lhnl4vh sch-mtg65lnres6s sch-mtfauggihzz8` (fila-conteudo); heartbeat/checar-site antigos seguem pausados. Último ciclo automático 19:55: job→task→trigger→agente funcionou ×4 (3 concluídos até a parada). Daemons (serve 4300, scheduler, secretário, supervisor) continuam no ar.

1. **Monitorar ciclo recorrente do auditor** (job 60min ×4, rodou às 19:54 — ver se as 4 execuções de manutenção passam: cenário B → "site ok" ou correção pontual). Cuidado: execução do trigger roda DENTRO do CLI `task create` — CLI morre = agente morre (não usar `| head` no kick; scheduler run-now é seguro).
2. **Refinar briefings**: `projeto.json` das 4 empresas foi INFERIDO pelo nome (aprovado pelo usuário, "valido depois") — pedir ao usuário os briefs reais e ajustar (ou criar `opencorp workspace perfil set`).
3. **Editor dos 3 ws novos** ainda é clone byte-idêntico do executor — o trigger injeta adaptação por projeto.json, mas vale personalizar o corpo do editor por empresa.
4. **Pendências menores**: 10 rascunhos duplicados no pulso (ruído no admin WP — só drafts); team `publicacao-review` (pulso) para o fluxo rascunho→revisão→publicar (wp.publicar-id com HITL); Tailwind local (web-dist/tailwind.css já existe, falta apontar no index.html e testar); drag-and-drop já commitado.
5. Regressão cega 13–24 nunca rodou nesta sessão (decisão do usuário) — specs 01–08, 10–12 PASS/TIMEOUT documentados em `.opencorp/reports/testes/`.

## Regras de ouro (vigem)

- NUNCA matar processo sem pidfile nosso. Restart do serve = `opencorp serve stop` + relançar (pidfile api.pid).
- NUNCA `npm run build` com bateria cega em voo (está parada).
- Modelos free em tudo; modificações de código o orquestrador (GLM) faz direto.
- **Novo**: CLI `task create` pipado (head) MATA o agente do trigger (EPIPE) — para disparar auditorias use `schedule run-now` ou rode sem pipe.

## Aprendizados desta sessão (complementam os 12 anteriores)

13. **?v= no entry ES module quebra identidade de módulo** — main.js avaliado 2× (imports relativos resolvem sem query) → boot duplo: logo duplicado, SSE dupla, intervalos duplos. Jamais cache-bust módulo por query; usar no-cache.
14. **CLI que dispara trigger agent_run morre se o stdout fechar** (head -1 → EPIPE mata pai e filho) — sempre background sem pipe para ciclos longos.
15. **Modelos free flakam em sequência** — rerodar resolve (4 auditores morreram 1ª vez, todos passaram na 2ª); agente leu o próprio wp.cjs e contornou bug sozinho (migrando de `page create` para `page publish`).
16. **Trigger sem workspace no evento dispara em TODAS as empresas** — payload de evento precisa do workspace e o filtro precisa exigir igualdade.
17. **Meta "executando" com pid morto** = CLI pai morto antes de finalizar; não deixa exec órfã presa — o caminho do scheduler (run-now) espera o fim.
