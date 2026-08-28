# 10 — Plano e Checklist por Etapas (DOCUMENTO MESTRE DO AGENTE)

> **Se você é o agente implementador: comece aqui e siga na ordem.** Cada etapa abaixo só pode ser marcada como concluída após passar o **teste cego** correspondente (ver `09-testes-cegos.md`). Não pule etapas. Não marque checkbox sem evidência.

---

## Protocolo de execução (siga literalmente)

```
LOOP infinito:
  1. Encontre a PRIMEIRA etapa com checkbox pendente (tabela de status abaixo).
  2. Leia a etapa inteira + as docs citadas nela.
  3. Implemente os passos (marcando os [ ] conforme concluir cada um).
  4. Rode a AUTO-VERIFICAÇÃO da etapa. Se falhar, corrija antes de continuar.
  5. Dispare o TESTE CEGO da etapa (modelo free definido em tests.test_model):
       opencode run --agent testador-cego \
         --model opencode/hy3-free \
         --dir <raiz-do-projeto> \
         --title "cego-etapa-0X" \
         "Execute a spec docs/tests/ETAPA-0X.md e grave o relatório em \
          .opencorp/reports/testes/ETAPA-0X-<timestamp>.md"
  6. Leia o relatório:
       - Tudo PASS  → atualize a tabela de status → commit → próxima etapa.
       - Algum FAIL → corrija e repita o teste cego (novo relatório).
  7. Após 3 ciclos de FAIL na mesma etapa → PARE e escale ao humano
     (relate: etapa, ciclos, relatórios, hipóteses).
```

Regras do implementador:
- **Nunca leia/edite a spec do teste** para "adaptar" o teste ao código. Spec é contrato.
- Cada etapa = **um commit** no formato indicado.
- Run unit tests (`npm test`) antes de cada teste cego.
- Workspaces de teste vivem em `/workspaces/test-*` e podem ser apagados a qualquer momento.

---

## Tabela de status (atualize a cada etapa concluída)

| Etapa | Nome | Status | Data | Relatório de teste |
|---|---|---|---|---|
| 0 | Leitura e bootstrap do ambiente | ⬜ | — | n/a |
| 1 | Esqueleto CLI + doctor | ⬜ | — | tests/ETAPA-01 |
| 2 | Settings (painel de configurações CLI) | ⬜ | — | tests/ETAPA-02 |
| 3 | Workspaces | ⬜ | — | tests/ETAPA-03 |
| 4 | Agentes + sessões OpenCode | ⬜ | — | tests/ETAPA-04 |
| 5 | Registros | ⬜ | — | tests/ETAPA-05 |
| 6 | Templates + subcorp | ⬜ | — | tests/ETAPA-06 |
| 7 | Segurança + orçamento | ⬜ | — | tests/ETAPA-07 |
| 8 | Nuvem backup/sync (opcional) | ⬜ | — | tests/ETAPA-08 |

---

## ETAPA 0 — Leitura e bootstrap do ambiente

**Objetivo:** entender o projeto e preparar o terreno.

- [ ] Ler: `01-visao-geral.md`, `02-arquitetura.md`, `04-agentes.md`, `05-registros-e-memoria.md`, `06-painel-configuracoes.md`
- [ ] Confirmar ambiente: `node --version` (≥22), `opencode --version` (≥1.18), `git --version`
- [ ] `git init` (se ainda não houver) + `.gitignore` mínimo: `node_modules/`, `dist/`, `workspaces/`, `.opencorp/`, `*.log`
- [ ] Criar `package.json` com: `"bin": { "opencorp": "./bin/opencorp.mjs" }`, scripts `build` (tsc), `test` (vitest), `dev` (tsx watch)
- [ ] Instalar: `commander @clack/prompts zod better-sqlite3 execa` + dev: `typescript vitest @types/node tsx`
- [ ] Criar `tsconfig.json` (NodeNext, strict, outDir `dist/`) e estrutura `src/cli`, `src/core`, `src/schemas`, `src/utils`

**Auto-verificação:** `npm run build && npm test` executa sem erro (teste vazio ok).

---

## ETAPA 1 — Esqueleto CLI + doctor

**Objetivo:** binário `opencorp` funcionando com parsing de comandos e diagnóstico.

Docs: `08-cli-referencia.md` (seção Geral), `02-arquitetura.md`.

- [ ] `bin/opencorp.mjs` apontando para `src/cli/index.ts` (buildado)
- [ ] `src/cli/index.ts` com `commander`: subcomandos placeholder de TODOS os grupos da doc 08 (`settings`, `workspace`, `agent`, `session`, `run`, `registry`, `approvals`, `budget`, `template`, `subcorp`, `test`, `cloud`) — apenas registrados; não implementados ainda
- [ ] `opencorp --version` imprime a versão do package.json
- [ ] `opencorp doctor` verifica: versão do node, `opencode` no PATH (`which opencode`), settings global válido, permissão de escrita em `~/.opencorp/`, alerta se `secrets*` dentro de algum workspace
- [ ] Utilitário `src/utils/fs-safe.ts`: escrita atômica (tmp+rename) e mkdir recursivo
- [ ] Testes unitários de `doctor` (mock de PATH)

**Auto-verificação:** `npm run build && node bin/opencorp.mjs --version && node bin/opencorp.mjs doctor`

**Teste cego:** `docs/tests/ETAPA-01-bootstrap.md` · **DoD:** todos os cenários PASS

**Commit:** `feat(cli): skeleton bin, command registry e doctor`

---

## ETAPA 2 — Settings (painel de configurações)

**Objetivo:** `SettingsStore` + painel TUI + comandos `settings *` do doc 06.

Docs: `06-painel-configuracoes.md` (schema é contrato).

- [ ] `src/schemas/settings.ts`: schema zod exatamente como na doc 06, com defaults
- [ ] `src/core/settings-store.ts`: leitura global (`~/.opencorp/settings.json`), por workspace, e **merge** (CLI > workspace > global); validação com erro amigável apontando a chave; escrita atômica
- [ ] `src/cli/commands/settings.ts`: `list`, `get <chave>`, `set <chave> <valor> --scope`, `edit`, `path`, `reset`
- [ ] `opencorp settings` (sem args) abre painel TUI `@clack/prompts` com as seções da doc 06; `S` salva, `Q` sai
- [ ] Chave `test_model` configurável e persistida (usada pelas etapas seguintes)
- [ ] Testes unitários: merge de níveis, rejeição de schema inválido, default pós-reset

**Auto-verificação:** `opencorp settings set test_model opencode/mimo-v2.5-free && opencorp settings get test_model`

**Teste cego:** `docs/tests/ETAPA-02-settings.md` · **Commit:** `feat(settings): store com merge, painel TUI e comandos`

---

## ETAPA 3 — Workspaces

**Objetivo:** `WorkspaceManager` + comandos `workspace *` e `use`. Docs: `03-workspaces-templates-subcorp.md`, `02-arquitetura.md` (estrutura de workspace é contrato).

- [ ] `src/core/workspace-manager.ts`: create (a partir de `templates/default/`), list, show, delete, current/use
- [ ] `templates/default/`: estrutura completa do workspace (pastas + `config.json` mínimo + `security_policy.json` com blocklist/HITL da doc 07 + agentes iniciais: `secretario`, `ceo-documentos`, `executor-padrao` — prompts baseados em `docs/agents/`)
- [ ] `registry.json` de estado global (workspaces conhecidos + ativo) em `~/.opencorp/`
- [ ] Comandos: `workspace create/list/show/delete`, `use <id>`, `workspace current`; flag global `--workspace <id>`
- [ ] IDs válidos: kebab-case; criar workspace duplicado → erro claro; delete pede confirmação (sem `-y`)
- [ ] Testes unitários com tmpdir

**Auto-verificação:** `opencorp workspace create test-dev && opencorp use test-dev && opencorp workspace list`

**Teste cego:** `docs/tests/ETAPA-03-workspaces.md` · **Commit:** `feat(workspaces): manager, template default e comandos`

---

## ETAPA 4 — Agentes + sessões OpenCode

**Objetivo:** `AgentStore` + `OpenCodeBridge` + `SessionManager`; rodar um agente de verdade. Docs: `04-agentes.md` (frontmatter é contrato).

- [ ] `src/schemas/agent.ts`: schema zod do frontmatter (doc 04)
- [ ] `src/core/agent-store.ts`: create (`--from` clona `executor-padrao`), list, show, edit, clone; normalização de id; log de criação/modificação em `registries/agentes/` (pode usar stub do journal até a ETAPA 5)
- [ ] `src/core/opencode-bridge.ts`: converte agente opencorp → `.opencorp/opencode/agent/<id>.md` no formato do opencode (description, model, tools, permissions)
- [ ] `src/core/session-manager.ts`: `run <id> "<ordem>"` → valida orçamento (stub: sempre ok até ETAPA 7) → registra início em journal (stub) → `execa`/`node-pty` rodando `opencode run --agent <id> --model <m> --dir <workspace> "<ordem>"` → stream stdout/stderr para o terminal E para `logs/` → registra fim (status, duração)
- [ ] `--session <id>` para continuar sessão; `session list/log/kill`
- [ ] `agent history <id>` lê o journal (stub ok)
- [ ] Testes unitários do parser de frontmatter e do bridge (sem rodar opencode)

**Auto-verificação:** `opencorp agent run executor-padrao "escreva 'ok' no arquivo sandbox/probe.txt" --model opencode/hy3-free` dentro do workspace ativo → arquivo criado

**Teste cego:** `docs/tests/ETAPA-04-agentes-sessoes.md` · **Commit:** `feat(agents): store, bridge opencode e sessões`

---

## ETAPA 5 — Registros

**Objetivo:** `RegistryStore` completo + `Journal` append-only. Docs: `05-registros-e-memoria.md` (formato é contrato).

- [ ] `src/core/registry-store.ts`: create/get/update/log/perms/search/reindex exatamente como doc 08
- [ ] Estrutura `registries/<cat>/<id>/` com `meta.json` + `journal.jsonl` + `conteudo.md` (ou `dados.json`)
- [ ] Categorias padrão criadas no workspace: `chats`, `documentos`, `execucoes`, `agentes`, `custos`, `logs`, `custom/`
- [ ] `create` exige `-d` (descrição); permissões padrão: leitura `*`, escrita criador+CEOs
- [ ] `update/log` **só** com append no `journal.jsonl` (nunca reescrever entradas)
- [ ] Integrar ETAPA 4: `session run` grava em `execucoes` (início/fim/status) e `chats` (transcript); mudanças de agente em `agentes`
- [ ] `better-sqlite3`: tabelas `registros`, `journal`, `sessoes` + `registry reindex`
- [ ] Permissões verificadas na escrita (registro alheio sem permissão → erro + evento em `logs`)
- [ ] Testes unitários: append-only, permissões, reindex

**Auto-verificação:** `opencorp registry create notas/probe -d "teste" && opencorp registry log notas/probe "anotação" && opencorp registry get notas/probe`

**Teste cego:** `docs/tests/ETAPA-05-registros.md` · **Commit:** `feat(registry): store, journal append-only, sqlite e integração de sessões`

---

## ETAPA 6 — Templates + subcorp

**Objetivo:** reuso entre empresas. Docs: `03-workspaces-templates-subcorp.md`.

- [ ] `template list/create/export/import` (pasta e `.corp` = tar.gz; `--as` no import; exclusão garantida de segredos)
- [ ] `workspace create --template <id|path>`
- [ ] `subcorp add/list/remove` gravando em `config.json` do pai com `permissions` (`read|ask|write`) e `exposed_agents/registries`
- [ ] `agent run <subcorp>/<agente> "..."` funciona para agentes expostos (spawn com `--dir` no subcorp)
- [ ] Subcorp não enxerga o pai (verificar que `--dir` do subcorp não expõe paths do pai)
- [ ] Testes unitários de export/import (roundtrip)

**Teste cego:** `docs/tests/ETAPA-06-templates-subcorp.md` · **Commit:** `feat(templates): export/import .corp e subcorp delegáveis`

---

## ETAPA 7 — Segurança + orçamento

**Objetivo:** `SecurityGuard` + `BudgetManager` + HITL. Docs: `07-seguranca-custos.md` (políticas são contrato).

- [ ] `security_policy.json` validado com zod (níveis `permissive|standard|strict`)
- [ ] Guard no pipeline de sessão: blocklist → bloqueio (exit 3, evento em `logs`); `hitl_patterns` → pausa + fila em `approvals list/approve/reject` (exit 5); `level-1` não executa nada
- [ ] `BudgetManager`: acumulador por agente/dia e workspace/dia em `budget.json`; custo estimado por tokens×preço; 80% avisa; 100% pausa (exit 4) se `pause_on_exceed`
- [ ] Gasto registrado por sessão em `registries/custos/`; `agent cost <id>` e `budget status/set`
- [ ] `opencorp doctor` agora valida policy e budget
- [ ] Testes unitários: pattern matching do guard, bloqueio, aprovação HITL, estouro de budget

**Teste cego:** `docs/tests/ETAPA-07-seguranca-budget.md` · **Commit:** `feat(security): guard, HITL e budget manager`

---

## ETAPA 8 — Nuvem backup/sync (opcional — só com humano de acordo)

Docs: `11-nuvem-backup-sync.md`. Se o humano não pedir, **pare na ETAPA 7** e reporte.

- [ ] `cloud configure` (wizard: perfil, modo, alvos, agenda, criptografia)
- [ ] `cloud backup/sync` com `--dry-run` obrigatório no primeiro uso, lock por perfil, one-way por padrão
- [ ] `cloud status` e `cloud diff <perfil-monitor>`
- [ ] Diffs de mirror-remoto geram eventos em `registries/logs/`

**Teste cego:** `docs/tests/ETAPA-08-nuvem.md` · **Commit:** `feat(cloud): backup local/nuvem e mirror-remoto com dry-run`

---

## Encerramento da Fase A

Quando a tabela de status estiver toda ✅:

- [ ] Rodar TODAS as specs de teste cego uma última vez em sequência (regressão)
- [ ] `opencorp doctor` verde
- [ ] Tag `v0.1.0` + relatório final ao humano com: etapas, ciclos de teste, dívidas técnicas conhecidas
- [ ] Propor à humana os próximos passos da Fase B (boardroom, canvas) — não iniciar sem aprovação
