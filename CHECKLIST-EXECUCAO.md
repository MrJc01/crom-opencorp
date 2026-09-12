# Checklist de Execução — Ecossistema OpenCorp (paralelo + gates)

> Como usar: cada tarefa tem ID, arquivos-alvo, aceite e gate. Tarefas do mesmo
> lote rodam em **subagentes paralelos** (sem sobreposição de arquivos).
> **Gate de ciclo** (obrigatório ao fechar cada tarefa): `tsc` + build +
> specs-alvo + `doctor`. **Gate final**: full E2E + vitest + `doctor` + redeploy.
> Commit ao fechar cada parte (convenção desta sessão).
> Decisões pendentes (trava F4/F5 antes de implementar): [D1] prompts.json global
> vs workspace; [D2] HITL fora (só guards) — confirmado, sem checkpoint de loop.

## Lote 0 — Preparação (1 subagente, depois dispara os lotes)

- [ ] **T00** Criar branch `feat/ecossistema` a partir de `2e579cd`; publicar baseline
  de suite (E2E count, vitest count) neste MD.
  Aceite: `git status` limpo na branch; baseline anotada abaixo.
  Baseline: E2E ____ · vitest ____ · data ____.

## Lote 1 — Sessões: continuar/duplicar/fila (3 subagentes paralelos)

Arquivos por tarefa (sem sobreposição):

- [ ] **F1-T01 Capabilities por harness** — `src/core/engines/drivers/*.ts` (só leitura
  de flags) + novo `src/core/engines/capabilities.ts`:
  `continuaNativo`, `duplicaNativo`, `como` por harness (opencode API; claude/agy/
  copilot/cursor `--resume|--continue|--connect`; codex `resume|fork`; crom-agente
  `--session`; aider/outros `false`).
  Aceite: teste unitário `tests/engine-capabilities.test.ts` com a matriz; drivers
  intactos fora de declaração. Gate: vitest da pasta + `tsc`.

- [ ] **F1-T02 continuar/duplicar no SessionManager** — `src/core/session-manager.ts`
  (+ tipos `OpcoesRun.session_from_ancestral?`, `fork_de`, `reidratada_de`):
  `continuar(id)` usa capability; `duplicar(id)` = snapshot→nova sessão (sempre
  agnóstico); sem nativo = reidratar com transcript + marca + aviso (nunca fingir).
  Plugar `opcoes.session` nos drivers que aceitam (crom-agente).
  Aceite: unit Profile (continua opencode/fake; duplica gera `fork_de`; reidrata marca).
  E2E novo: `tests/e2e/sessao-continuar-duplicar.spec.ts` (CLI-level via API).
  Gate: vitest + e2e do arquivo.

- [ ] **F1-T03 Seletor de sessão no nó + fila por sessão** — `src/core/flow-store.ts`
  (schema `session_mode: nova|reaproveitar|continuar|duplicar`, `session_from` só
  ancestral — validação topológica; erro legível caso contrário) + fila FIFO por
  `sessaoId` no servidor (`src/server/index.ts`, lock com dono+lease; `429 queued,
  posição N`; mantém evicção de órfão).
  Aceite: flow de teste com `session_from` válido/inválido (válido roda, inválido
  barra no salvar); 2 POSTs concorrentes → 1 roda + 1 enfileira (sem 409 seco).
  E2E novo: `tests/e2e/web/fluxo-sessao.spec.ts` (seletor) + caso fila em
  `sessao-continuar-duplicar.spec.ts`. Gate: ciclo + web do arquivo.

## Lote 2 — Loop juiz + Histórico agrupado (2 subagentes paralelos)

- [ ] **F2-T01 Juiz do loop** — `src/core/flow-store.ts` (bloco `juiz:
  {a_partir_da_volta, regras[]}`; regras `sem-melhora|orcamento|condicao(regex)|
  juiz-llm`; motivo sempre no journal) + fim do skip silencioso (nó comum acima do
  teto emite evento com motivo). Sem pausa humana (só guards existentes).
  Aceite: flow fixture com loop que para por `sem-melhora` na volta 3 com motivo
  no journal; `condicao_parada` regex funciona.
  E2E novo: `tests/e2e/web/fluxo-juiz.spec.ts` (timeline mostra volta/teto/motivo).
  Gate: ciclo + web do arquivo.

- [ ] **F2-T02 Histórico agrupado (fluxo + reunião)** — `src/server/index.ts`
  (`/historico`: filhas por tag `flow:X` e `reuniao:Y` sob o item pai, ordem por nó/
  turno) + `src/web/views/Historico.tsx` (grupo expansível, status por filho).
  Aceite: flow executado aparece 1 item pai + N filhos; reunião idem; item avulso
  continua plano. E2E: estender `tests/e2e/web/historico.spec.ts` (grupo expande).
  Gate: ciclo + web do arquivo.

## Lote 3 — `@` vs `/` + prompts.json (2 subagentes paralelos, após D1)

- [ ] **F3-T01 Taxonomia e registro @** — `src/web/components/chat/PromptInput.tsx`
  (menu com seções Agente|Prompt|Arquivo|Task; `/` e `!` só início de linha;
  3 visuais: chip, texto-editável-Esc-desfaz, pill-destinatário) + `src/server/index.ts`
  (resolver autoritativo: `/` fast-path whitelist, resto ajuda/erro; `@ctx` expande
  com cap KB + fontes; mesma regex cliente/servidor) + `docs/CATALOGO-AT.md`
  (documenta todos os predefinidos).
  Aceite: `/status` não cai no LLM; `@arquivo` mostra conteúdo real (não só nome);
  `@auditoria` injeta texto editável. E2E novo: `tests/e2e/web/mencoes.spec.ts`.
  Gate: ciclo + web do arquivo.

- [ ] **F3-T02 prompts.json** — novo `src/core/prompt-store.ts` (por workspace com
  fallback global — proposta pós-D1) + pull em agentes/fluxos/drawer/`@prompt`.
  Aceite: chave usada em 3 lugares a partir de 1 edição; unit de interpolação
  `{{vars}}` + teste de fallback. E2E: caso em `mencoes.spec.ts`. Gate: ciclo.

## Lote 4 — Skills + assets CLI (2 subagentes paralelos)

- [ ] **F4-T01 Skills** — `src/core/skill-store.ts` (SKILL.md + skill.json opcional),
  zod `skills: string[]` (`src/schemas/agent.ts`), injeção em `sincronizarAgente()`
  (`## Skills`, ~8k chars + aviso), CLI `oc skill instalar|listar|mostrar` +
  `oc agent skills <id> --add|--remove|--set [--json]`, `PUT /agents/:id {skills}`.
  Aceite: skill instalada aparece no system prompt sincronizado; ausente = erro
  legível; multi-add/remove funciona. E2E novo: `tests/e2e/skills.spec.ts`.
  Gate: ciclo.

- [ ] **F4-T02 Asset store CLI** — `src/core/asset-store.ts` (manifest `asset.json`,
  kinds `agente|skill|prompt|task|flow|pack|workspace-parcial`, `kindVersion` +
  migração, denylist de segredos estendida, `--dry-run`, `--como`, `--sobrescrever`),
  CLI `oc asset exportar|importar`.
  Aceite: matriz por kind — exportar→importar em ws limpo→hash equivalência→smoke;
  pack nunca contém segredo (teste dedicado); conflito sugere `--como`.
  E2E novo: `tests/e2e/assets.spec.ts` (7 kinds + segredo). Gate: ciclo.

## Lote 5 — Web paridade (2 subagentes paralelos, após Lotes 3–4)

- [ ] **F5-T01 Drawer skills + seletor de sessão no canvas** — `src/web/views/Agentes.tsx`
  (checkboxes multi + badge) + `src/web/views/Fluxos.tsx` (seletor
  nova/reaproveitar/continuar/duplicar + `session_from` ancestral + juiz do loop).
  Aceite: paridade total com CLI; sem emoji (lucide). E2E: estender
  `skills.spec.ts` + `fluxo-sessao.spec.ts` (casos web). Gate: ciclo + web afetados.

- [ ] **F5-T02 Loja visual + ficha do agente** — página assets (upload `.corp`,
  preview dry-run, conflitos) + ficha do agente (sessões/execs/tasks/custos) +
  `@agente/*` resolvendo. Aceite: importar `.corp` pela UI == CLI; ficha abre
  isolada por agente. E2E novo: `tests/e2e/web/loja.spec.ts`. Gate: ciclo + web.

## Lote 6 — Isolamento + ad-hoc (1–2 subagentes)

- [ ] **F6-T01 Nó ad-hoc + herança total** — schema (`agente?` opcional,
  `prompt_sistema`+`model` inline) + herança (system/model/tools/permissions/budget/
  skills) quando com agente. Aceite: nó sem `.md` executa; com agente = mesma saída
  que `rodar` direto. E2E: caso em `fluxo-sessao.spec.ts`. Gate: ciclo.

- [ ] **F6-T02 Prova de isolamento** — E2E `tests/e2e/isolamento-workspaces.spec.ts`:
  agente do ws-A não lê/escreve no ws-B, por harness instalado (opencode, claude,
  agy, copilot, codex, cursor). Aceite: matriz verde nos instalados; ausente = skip
  explícito (não falha). Gate: e2e do arquivo.

## Lote 7 — Grupos de agentes (verificar + fechar lacunas da Fase 9)

- [ ] **F9-T01 Execução E2E dos nós fundidos** — cobrir `flow-store.ts:869-960`
  (fanout/review/debate) com teste de unidade + E2E `tests/e2e/web/fluxo-fanout-debate.spec.ts`:
  fanout paralelo + síntese; review loop executor→revisor até `APROVADO`; debate com
  moderador emitindo `DECISÃO:`. Aceite: 3 padrões executam de ponta a ponta e o
  journal registra cada sessão (tag `flow:`). Gate: ciclo.

- [ ] **F9-T02 Paridade legacy×fundido** — comparar contratos: debate fundido usa
  `moderador.ordem` (hoje ignora); fanout/review passam a aceitar `{{anterior}}`/
  `{{ajustes}}`; saída completa (não só 1ª linha/600 chars) chega à síntese/moderador.
  Aceite: teste de unidade com saída longa verifica passagem integral. Gate: vitest.

- [ ] **F9-T03 Bug de índice em falhas simultâneas** — `team-orchestrator.ts:239`
  `resultados.indexOf(r)`: trocar por índice explícito no `Promise.allSettled`.
  Aceite: teste com 2+ subtasks falhando ao mesmo tempo indexa corretamente. Gate: vitest.

- [ ] **F9-T04 Documentar "sessões sempre separadas" + run por API** — documentar que
  grupo não tem `session_mode` (1 sessão por integrante) + E2E `POST /teams/:id/run`
  de ponta a ponta. Aceite: run por API encerra com status final e todas as sessões
  no ledger. Gate: e2e.

## Gate final (1 ciclo dedicado, após todos os lotes)

- [ ] **G1** `npx tsc --noEmit` limpo.
- [ ] **G2** `npm run build` ok.
- [ ] **G3** Full E2E `npx playwright test` 100% (investigar 1 a 1; flake de carga só
  aceito com 3 verdes isolados + nota neste MD).
- [ ] **G4** `npx vitest run` 100%.
- [ ] **G5** `node bin/opencorp.mjs doctor` sem falhas.
- [ ] **G6** Redeploy `:4100` (daemon stop → kill serve → start `--com-serve`,
  aguardar tick 15s, health 200, bundle contém marcadores novos).
- [ ] **G7** Commit final da parte + atualizar contadores neste MD.

## Registro de ciclos

| Ciclo | Data | Escopo | E2E | Vitest | Doctor | Commit |
|---|---|---|---|---|---|---|
| 0 | 2026-09-12 | Fase 0 + plano | 281/281 | 803 | OK | `2e579cd` |
| | | | | | | |
