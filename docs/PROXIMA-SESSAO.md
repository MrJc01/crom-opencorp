# PRÓXIMA SESSÃO — opencorp (leia isto ao abrir o novo chat)

> Atualizado em 30/08/2026. Este é o documento de continuidade. Complementa `docs/HANDOFF-SESSAO.md` (detalhes técnicos vivos: daemons, homes, secrets).

## Estado consolidado

- **Plano docs/13**: etapas 19–24 ✅ PASS e commitadas. **ETAPA 25 em andamento**.
- Repositório: working tree LIMPO, 393 testes unitários verdes, build OK, e2e 38/38 PASS.
- Modo Custo Zero: tudo free; **modificações de código o orquestrador (GLM) faz direto**; subagentes free só para análise (pedido do usuário).
- Home viva: **`/tmp/opencorp-smoke24`** (única pasta opencorp em /tmp — limpeza de 1045 diretórios de teste feita). Daemons vivos com pidfiles: `serve 4300 (token watch24)`, `scheduler`, `supervisor`, `opencode-server`. **REGRA DE OURO: nunca matar processo sem pidfile nosso.**
- 4 empresas WordPress reais (pulso-diario, engenhar, emporio-aurora, norteia) — app `painel-tarefas` semeado nas 4; team `publicacao-review` criado no pulso-diario.
- Ciclo do editor **validado fim-a-fim**: task → editor (19.5s) → rascunho draft no WP + id postado no chat.

## O QUE FALTA FAZER (ordem exata)

### 1. Concluir a regressão `test blind all` (PENDENA BLOQUEANTE)
- Foi lançada (background) e ainda roda: `pgrep -f "test blind all"`. Se o processo morreu, relançar: `node bin/opencorp.mjs test blind all > /tmp/opencode/blind-all.log 2>&1 &` (com setsid).
- Specs 01–06 PASS. **ETAPA-07**: sem veredito (checar relatório na mão). **ETAPA-08 (nuvem): FAIL esperado — nunca foi implementada, é opcional ⬜.** ETAPA-09 (regressão fase A) deu TIMEOUT na 1ª tentativa (spec pesada — roda as 8 anteriores; rotação de modelos pode resolver ou TIMEOUT final).
- Ao terminar: consolidar veredicto de TODAS as specs (ler última linha `VEREDITO:` de cada relatório em `.opencorp/reports/testes/`), registrar no docs/13 (status da 25), commit.
- Critério honesto: PASS em 01–07, 09–24 (as implementadas) + FAIL só na 08 (não implementada) = release pode sair. Fix se alguma implementada falhar (máx 3 ciclos).

### 2. Tag v0.3.0
- `git tag -a v0.3.0 -m "v0.3.0 — plataforma de extensões (19-25)" && git push origin v0.3.0` (só depois da regressão consolidada).
- Release notes prontos em `docs/release-v0.3.0.md`.

### 3. Melhorias pendentes (não bloqueiam release)
- Tailwind pré-compilado (hoje CDN — UI degrada sem internet).
- Drag-and-drop no kanban; modais no lugar de `prompt()/confirm()`.
- Fechar o editor no fluxo de publicação com revisão: `opencorp team run publicacao-review --entrada "..."` no pulso-diario (team já criado).
- Veredicto da ETAPA-07 se ficou incompleto.

## O que APRENDEMOS nesta sessão (não repetir)

1. **NUNCA rodar `npm run build` com bateria cega em voo** — `dist/` trocado em voo quebra o CLI que o testador invoca. `npx tsc -p tsconfig.web.json` (só web-dist) é seguro se a bateria não faz curl no bundle.
2. **Spawn sem listener de `error` derruba o processo inteiro** (uncaughtException) — o webServer do e2e morreu assim (caminho do fake-opencode errado). Toda chamada `spawn()` precisa de `child.on("error", ...)`.
3. **`clearAuth()` não pode descartar referências de recursos abertos** — fechar EventSource ANTES de zerar o state; interval de 8s era 401-loop eterno. Bug "login visível com SSE conectado" = socket órfão.
4. **GET /teams retorna `passos` como CONTAGEM (número)** — a view tratava como array ("undefined passo(s)"). Confira o SHAPE da API antes de escrever a view.
5. **Playwright webServer com caminho de binário errado (ENOENT)** → erro só aparece como ECONNREFUSED no meio da suíte. `resolve(__dirname, "..", "tests", ...)` tinha um `..` a mais.
6. **Seeder duplica dados entre testes e2e** (roda a cada beforeEach) — usar `.first()` ou recursos exclusivos (título com timestamp).
7. **Rate limit do chat (30 msgs/h/task)** dispara antes do rate guard (20/h) quando spawn falha rápido — testar rate guard via bateria cega é flake; unit tests cobrem.
8. **`escapeHtml` estava corrompido** (as entidades sumiram — provavelmente um replace mal feito anterior) — XSS real. Testes unitários validavam o comportamento BUGADO: ao corrigir, atualizar o teste.
9. **Bateria cega: veredito oficial pode divergir do relatório** (TIMEOUT pós-gravação) — extrair VEREDITO da última linha do relatório na mão (padrão já usado nas etapas 23 e 24).
10. **Regressão `test blind all` é pesada**: cada spec ~25-35min (agentes reais free flakam 1-3min por passo); ETAPA-09 (regressão fase A) tende a TIMEOUT por design pesado — considerar excluir a 08 (não implementada) e 09 (redundante) de futuras regressões, ou subir timeout.
11. **Testes unitários deixam lixo em /tmp** (mkdtemp sem cleanup) — 1045 diretórios acumulados; limpamos tudo. Considerar `afterAll` com rm -rf nos fixtures.
12. **Modelos free flakam/travam sem resposta** (170s sem byte) — rerodar a sessão resolve; rotação do test-blind já cobre os erros de provedor.

## PROMPT PARA COLAR NO NOVO CHAT

```
Continue o projeto opencorp (/home/j/Documentos/GitHub/crom-worker-opencode).

Leia PRIMEIRO (nesta ordem):
1. docs/PROXIMA-SESSAO.md — estado consolidado, o que falta (na ordem) e os 12 aprendizados técnicos desta sessão
2. docs/HANDOFF-SESSAO.md — ambiente vivo (home /tmp/opencorp-smoke24, 4 empresas WordPress reais, daemons com pidfiles), detalhes técnicos e pendências
3. docs/13-plano-extensoes-plataforma.md — plano e status das etapas

Tarefas imediatas (nesta ordem):
1. Verificar a regressão `test blind all` (se ainda roda: `pgrep -f "test blind all"`; relatórios em .opencorp/reports/testes/ — veredicto na última linha VEREDITO: de cada relatório). Consolidar: PASS nas etapas implementadas, FAIL só é aceitável na ETAPA-08 (nuvem, opcional, não implementada). Se alguma implementada falhou → fix (máx 3 ciclos).
2. Atualizar docs/13 (status da etapa 25) e commitar.
3. TAG v0.3.0: git tag -a v0.3.0 -m "..." (+ push se o usuário pedir).
4. Opcional: fechar o editor no fluxo de publicação (team publicacao-review no pulso-diario), drag-and-drop no kanban, Tailwind pré-compilado.

Contexto: etapas 19-24 PASS e commitadas; e2e Playwright 38/38 (npm run test:e2e); 393 testes unitários verdes; doctor etapa 25 completo (34 testes); ciclo do editor WordPress validado (rascunho draft + id no chat); agente frontend-especialista no template e sincronizado nas 4 empresas; README v0.3.0 e docs/release-v0.3.0.md prontos.

Regras de ouro: NUNCA matar processo opencode*/node sem pidfile nosso (api.pid, scheduler.pid, supervisor.pid, opencode-server.json); NUNCA rodar npm run build com bateria cega em voo; modelos free para todos os testes e agentes (bateria e defaults), e as MODIFICAÇÕES DE CÓDIGO o orquestrador faz direto (GLM) — subagentes free só para análise/leitura.

Protocolo por etapa: implementação → verificação real → bateria cega `opencorp test blind <etapa>` (nemotron-550b + rotation) → fix (máx 3 ciclos) → docs/13 → commit. Modo Custo Zero.
```