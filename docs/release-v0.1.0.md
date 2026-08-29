# release v0.1.0 — Fase A concluída

## O que é o opencorp

O opencorp é um Sistema Operacional de Empresas Autônomas dirigido por CLI. Cada "corp" (workspace) é uma empresa de agentes com hierarquia (CEOs documentam e delegam, secretário conversa com o humano, operários executam), registros globais por categoria, orçamento e governança por arquivos. O opencorp não substitui o OpenCode — o orquestra: cada agente opencorp vira uma sessão `opencode run` isolada, com `--dir` no próprio workspace. Visão geral em `docs/01-visao-geral.md`.

## O que a Fase A entrega

**settings** — painel TUI (`opencorp settings`) e comandos `list/get/set/edit/path/reset`; schema zod conforme `docs/06`; 4 níveis de configuração (CLI > agente > workspace > global) com merge e indicação de origem; `~/.opencorp/settings.json` e `<ws>/.opencorp/config.json` com escrita atômica.

**workspace** — `workspace create/list/show/delete/current`, `use <id>`; template `default` com 3 agentes (secretario, ceo-documentos, executor-padrao) e estrutura contratual da doc 02; ids kebab-case; exclusão com confirmação (`-y`/`--force`); workspaces_root configurável (`paths.workspaces_root`); isolamento por `OPENCORP_HOME` para testes.

**agent / session / run** — agentes são arquivos `.md` com frontmatter (doc 04): `agent create --from/--model`, `list/show/edit/clone`, `history`; bridge converte agente opencorp → formato opencode 1.18 em `<ws>/.opencorp/opencode/agent/` (com vínculo `.opencode` para o opencode enxergar); `agent run` e o atalho `run` executam a ordem em sessão `opencode run --auto --agent --model --dir` com stdout/stderr streamados em tempo real para o terminal e capturados em `logs/` + transcript em `registries/chats/`; `session list/log/kill` lê das execuções registradas; `--session` continua sessões do opencode.

**registry** — registros globais por categoria (`registries/<cat>/<id>/` com `meta.json` + `journal.jsonl` append-only + `conteudo.md`/`dados.json`), exatamente como a doc 05; `create` exige `-d`; permissões por registro (leitura/escrita/modificação de meta) com bloqueio exit 3 e auditoria em `logs/audit-log`; `update/log` nunca reescrevem o journal; índice SQLite derivado (`corp.db`: registros, journal, sessões) com write-through e `registry reindex` reconstruindo a partir das pastas; `registry search` (LIKE) e `registry list [categoria]` com contagem.

**template / subcorp** — `template create/export/import/list`: pacote doc 03 (`template.json` + agents/ + registries/ + config.json + security_policy.json), export de workspace vivo para pasta ou `.corp` (tar.gz), import de pasta/arquivo/URL git (clone shallow); exclusão de segredos no export (`*secret*`, `*key*`, `.env*` com fronteira de palavra — não pega `secretario.md`) com contagem do que foi excluído; `workspace create --template <id|caminho>` faz merge sobre o default; `subcorp add/list/remove` grava no `config.json` do pai (`read|ask|write`, `exposed_agents/registries`); `agent run <subcorp>/<agente>` executa no subcorp com isolamento total de registros.

**approvals / budget** — fila HITL: ordens que casam com `hitl_patterns` geram pendência (`approvals list/approve/reject --motivo`); approve re-executa a ordem original automaticamente; BudgetManager acumula custo estimado por agente/dia e workspace/dia em `budget.json` (doc 07), avisa aos 80% e recusa novas sessões (exit 4) ao esgotar com `pause_on_exceed`; `agent cost <id>` e `budget status/set`.

**doctor** — diagnóstico: Node >= 22, opencode no PATH, settings global, permissão de escrita em `~/.opencorp/`, segredos dentro de workspaces (alerta), `security_policy.json` e `budget.json` do workspace ativo (exit 2 se inválidos).

**segurança (transversal)** — `security_policy.json` por workspace (doc 07); SecurityGuard avalia a ordem antes do spawn: blocklist → bloqueado (exit 3, auditado), `hitl_patterns` → pendência HITL (exit 5), agente `level-1` não executa nada, `strict` restringe à allowlist, rede fora de `network_allowlist` vai para HITL.

## Arquitetura em 5 linhas

CLI (commander, `bin/opencorp.mjs` → `src/cli`) chama o core puro (`src/core`: SettingsStore, WorkspaceManager, AgentStore, RegistryStore, SessionManager, SecurityGuard, BudgetManager, ApprovalsStore, TemplateStore, SubcorpStore), que valida com zod (`src/schemas`) e usa utilitários próprios (`src/utils/fs-safe.ts`: escrita atômica tmp+rename). Toda escrita de registro passa pelo RegistryStore (journal append-only + índice SQLite derivado, a verdade são os arquivos). Sessões são spawns do `opencode run` com CWD/`--dir` no workspace. Detalhes e fluxo de uma ordem: `docs/02-arquitetura.md`.

## Limitações conhecidas (honestas)

- **Guard não é interceptação em tempo real.** A execução de comandos dentro da sessão é governada pela permission layer do opencode. O guard do opencorp atua em dois pontos: pré-voo da ordem (bloqueia/HITL antes do spawn) e pós-voo de auditoria sobre o transcript (HITL → pendência para revisão; blocklist → evento de auditoria — o comando já correu, não há como desfazer).
- **Custo é heurístico.** `custo = turnos × preço/turno` (turnos = linhas de ferramenta `←` do transcript + 1), com preços embutidos por modelo e override em `budget.json.precos`. Não há leitura de tokens reais do opencode ainda.
- **Agente `level-1` não executa comandos** — por contrato (doc 07). O secretário, por exemplo, só lê e conversa.
- **Subcorp `write` cross-corp não implementado.** A flag é aceita e armazenada, mas escrever em registros do subcorp a partir do pai chega em etapa futura; hoje `ask` já permite invocar agentes do subcorp e `read` só permite listar/mostrar.
- **Self-healing dispara em execuções com status `falhou` apenas** (bloqueio do SecurityGuard, orçamento, HITL, spawn/timeout). Falha semântica dentro de sessão concluída (o agente tenta algo que falha mas encerra a sessão com exit 0) não gera `falhou` e não aciona o healing — limitação v1.
- **`opencorp test blind` não existe como comando.** O teste cego é disparado manualmente via `opencode run --agent testador-cego` (ver `.opencode/agent/testador-cego.md`); os relatórios ficam em `.opencorp/reports/testes/`.
- **Estado externo ao CLI** (plataforma): `approvals` vive em `<ws>/.opencorp/approvals/` e não sobrevive a remoção manual da pasta; o índice SQLite é derivado e reconstruível com `registry reindex`.

## Próximos passos (Fase B — docs/12-plano-fase-b-c.md)

- **ETAPA 09 — regressão da Fase A**: bateria cega das 7 specs anteriores (ETAPA-01..07 em `docs/tests/`) antes da tag v0.1.0.
- **ETAPA 10 — boardroom (reunião geral)**: injeta memória compartilhada nos CEOs e orquestra deliberação multi-agente.
- **ETAPA 11 — supervisor**: agente que supervisiona operários (revisa saídas, re-spawn com correções).
- **ETAPA 12 — self-healing**: recuperação automática de falhas de sessão.
- **ETAPA 13 — flows**: fluxos declarativos multi-passos.
- Fase C (API/web/canvas) e `cloud backup/sync` (ETAPA 08, opcional) ficam para depois da Fase B.
