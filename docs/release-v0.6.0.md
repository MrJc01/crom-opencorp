# release v0.6.0 — Painel editável de ponta a ponta + fusão Team×Fluxo (PLANO-WEB-CRUD)

> Sucessor do v0.5.0 (primitiva de execução unificada). Este release executa o **PLANO-WEB-CRUD** (docs/PLANO-WEB-CRUD.md): o painel web passa a **editar e excluir** o que cria — tasks, rotinas, fluxos, teams, agentes — o CSS é padronizado com **Tailwind v4 + DaisyUI local** (fim da dependência de CDN) e a duplicação team×fluxo é **fundida num único motor de fluxos**, por decisão do dono.

## Motivação

- Auditoria do painel (§3 do plano): quase tudo que a UI criava, ela não editava nem excluía — excluir task existia só na API (a UI nunca chamava), fluxo/team/agentes não tinham edição nenhuma, hooks não tinham view.
- O painel carregava o Tailwind do CDN (`cdn.tailwindcss.com`): **CSS quebrado offline/LAN**, com um `web-dist/tailwind.css` órfão não linkado e um `<style>` inline legado como fonte da quebra.
- **Team × Flow** eram dois motores para o mesmo fenômeno (agentes chamados sob circunstâncias diferentes) — débito registrado desde o PLANO-UNIFICACAO. Decisão do dono (§5 do plano): **fundir agora num editor só**.

## O que entrega

**Etapa 0 — Tailwind v4 + DaisyUI local (fundação)** — `src/web/css/app.css` com `@import "tailwindcss"` + `@plugin "daisyui"` e tema dark mapeado à paleta do painel; classes legadas em `src/web/css/legacy.css` (layer components, strangler visual); script `build:css` encadeado no `build`; `index.html` sem o script de CDN — o painel volta a funcionar offline/LAN.

**Etapa A — queda rápida (UI sobre API existente)** — excluir task no drawer do kanban; excluir e detalhar team (drawer com padrão/passos/regras); **view Hooks nova** (listar, criar, copiar URL+token, excluir).

**Etapa B — editar o que existe** — `PATCH /schedules/:id` ampliado (nome, agenda cron, args, agente) + form "Editar rotina" na Agenda; `PUT /flows/:id` (validação zod + semântica) e `DELETE /flows/:id` + **editor linear pré-preenchido** (fluxos não-lineares avisam para usar a CLI); `PUT /teams/:id` + form de edição.

**Etapa C — agentes no painel** — **view Agentes** com cards (role, categoria, model, level, budget); `PUT /agents/:id` (edita frontmatter do .md); `DELETE /agents/:id` **bloqueia com 409** se o agente for citado em teams/flows/tasks abertas (via `citacoesAgente`); criar agente **por clone**; botão **Chamar** por agente; o "Run agente" da home agora leva à view Agentes.

**Etapa D — reuniões no Secretário** — Reuniões virou **aba** dentro da página do Secretário (`Conversa | Reuniões`; `#/reunioes` ativa a aba); convocação com **check-list de agentes**; link para a **ata** (via `/files`).

**Etapa E — seletor de agentes** — componente `seletor-agentes.ts` reutilizável (checkboxes, DaisyUI) — usado em reunião e outros pontos.

**Etapa F — fusão Team×Fluxo (decisão do dono)** — novos nós no motor de fluxos: `fanout` (paralelos + síntese), `review` (executor↔revisor, contrato APROVADO/AJUSTES, turnos) e `debate` (proponentes + moderador decide) — **versões contextuais** (o contexto flui entre nós; sem kanban); migração `opencorp flow migrate-teams` / `POST /flows/migrate-teams` converte teams legados, **arquivando como `<id>.json.migrado`**; editor único em Fluxos com templates **Pipeline | Fanout | Review | Debate**; sidebar sem Teams (`#/teams` redireciona); `POST /teams` segue existindo, **deprecado**.

**fix de infra de testes (e2e destravado)** — `tests/fixtures/fake-opencode.mjs` ganhou `GET /session/:id/message` (formato opencode ≥1.18): e2e de secretário/chat que falhavam por stream preso (falha pré-existente) voltaram a passar.

## Testes

- **463 unitários** (vitest, 39 arquivos) — novos: `tests/web-crud.test.ts` (rotas/CRUD do painel) e `tests/flow-migrate.test.ts` (migração team→flow e nós novos).
- **e2e (Playwright)** — suíte ~56, com **6 falhas PRÉ-existentes comprovadas no baseline** (agenda.spec ×5 — jobs do seeder usam comando `echo` fora da whitelist de comandos de rotina; chat.spec "markdown rico" ×1) — não são regressões deste release.
- package.json → **0.6.0** (reinicie serve/daemon para `/health` refletir a versão).

## Limitações conhecidas (honestas)

- **B4 fora do escopo** — renomear/excluir sessão do secretário não foi feito: as sessões vivem no **servidor OpenCode externo** (não são estado do opencorp); movido para o §7 do plano.
- **Edição web só de fluxos lineares** — o editor estruturado pré-preenchido cobre o caso linear; fluxos não-lineares avisam para usar a CLI (`flow edit`).
- **fanout/review/debate contextuais, sem kanban** — no motor de fluxos esses nós passam contexto entre nós; os teams legados criavam task raiz/subtasks no kanban.
- **6 e2e pré-existentes falhando** — agenda ×5 (seeder com `echo` fora da whitelist) e chat ×1; idênticas no baseline, correção fora do escopo.
- Apps no painel seguem read-only (P2); 06-painel e AJUDAS/"?" ainda não documentam as views novas.

## Migração recomendada (teams legados → fluxos)

```bash
opencorp flow migrate-teams        # converte os teams do workspace ativo
# cada teams/<id>.json vira flows/<id>.json (pipeline→nós agente em sequência;
# fanout/review/debate→nó correspondente); o original é arquivado como <id>.json.migrado
```

- A API de teams (`POST /teams`, run) segue funcionando **deprecada** — migre para manter um motor só.
- Próximos passos herdados: docs das views novas (06-painel/AJUDAS), e2e das edições, 6 falhas pré-existentes.
