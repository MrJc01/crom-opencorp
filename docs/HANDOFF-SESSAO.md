# Handoff de sessão — opencorp (cole este contexto ao trocar de chat)

## Objetivo
- Continuar o **opencorp** — Sistema Operacional de Empresas Autônomas CLI-first sobre OpenCode (`/home/j/Documentos/GitHub/crom-worker-opencode`, usuário fala PT-BR).
- **v0.3.0 TAGADA** (25 etapas, ~400 testes unit + 38/38 e2e). Foco atual: **estabilização de testes + auto-gestão dos 4 sites** — ver `docs/PLANO-ESTABILIZACAO.md` (Fases 0-5) e `docs/HANDOFF-SESSAO.md` + mapa completo no **README.md (seção "Onde encontrar tudo")**.
- Modo **Custo Zero**: modelos free em pools com cotas independentes — pool 1 AI Studio BYOK (`google/gemini-3.5-flash-lite` default), pool 2 OpenRouter free (glm-5.2, minimax-m3, nemotron-3.5-lightning, gemma-4-31b). Rotação em `~/.opencorp/settings.json`.
- Construção: subagentes (implementação) usam `z-ai/glm-5.3-flash` (quase grátis); usuário quer fazer **aos poucos, simples, validando o que funciona** — não empilhar grandes chunks.

## Estado do ambiente (30/08 noite)
- **4 empresas reais MIGRADAS para `~/.opencorp/workspaces/`** (pulso-diario, engenhar, emporio-aurora, norteia) — NÃO estão mais em /tmp/opencorp-smoke24. Credenciais WP em `~/.opencorp/secrets.json`.
- Jobs/scheduler: **PAUSADOS** (pedido do usuário). Servidor web/daemons podem não estar no ar — checar pidfiles antes de assumir.
- **REGRA DE OURO**: NUNCA matar `opencode*`/`node` sem pidfile nosso (`api.pid`, `scheduler.pid`, `supervisor.pid`) — o opencode do usuário roda na mesma máquina (cuidado com pkill/grep largo).
- Bench OpenRouter pendente: agenda `/tmp/opencode/bench-f1/agenda.sh` roda às 00:05 UTC (10 modelos × etapa-02) — resultado em `/tmp/opencode/bench-f1/bench.log`.

## Trabalho da sessão 30/08 (tarde/noite)
1. **Fase 0 ✅ (commit c5a3390)**: telemetria do `test blind` — eventos JSONL `events-<execid>.jsonl` com fail_cat (`provider_error|rate_limit|timeout_harness|missing_report|product_bug|spec_divergence|unknown`), `CATEGORIA:` no relatório do testador, health-check de modelos (`pingModelo`, setting `tests.health_check`). 417 testes verdes.
2. **Bench de modelos (AI Studio BYOK)**: `gemini-3.5-flash-lite` PASS 7/7 em **61s** (vencedor, default); `gemini-3.1-flash-lite` PASS 101s; `gemma-4-31b-it` 2× FAIL ("high demand" — re-bench); `gemini-3.5-flash` timeout (turnos de 2-4min); `3.7-flash` erro API; `2.5-flash-lite` descontinuado. Tabela completa no README/PLANO.
3. **Descoberta chave de cota**: OpenRouter tem **cota diária por conta** para free models (`free-models-per-day-high-balance`) — esgotou e gerou FAILs falsos; rotação NÃO resolve. AI Studio BYOK = cota própria (segunda pool). Antes de bateria longa: health-check.
4. **Kit de auto-gestão dos sites** (templates/default + implantado nos 4 workspaces):
   - Catálogo de **function calling** `docs/testes-site/FERRAMENTAS.md` (wp_listar/wp_ler/wp_criar/wp_editar/wp_configurar/wp_apagar/registro_*/agente_run com contratos exatos, quirks de status no 3º argumento, tabela de erros HTTP) — a "MCP do usuário" simplificada: modelos chamam via bash seguindo o catálogo.
   - Agentes `critico-site` (só leitura → PARECER com prioridades) e `corretor-site` (executa correções do parecer) — model flash-lite, no template e nos 4 workspaces.
   - Specs `AUDITORIA-01-identidade/02-conteudo/03-tecnico.md` + playbook `CICLO-AUTO-GESTAO.md`.
5. **Ciclo validado ao vivo no pulso-diario** (~11 min): aud01 PASS 7/7 · aud02 FAIL (C1 volume) · aud03 FAIL (C7 rascunhos lixo) → editor publicou 2 posts reais da fila (IDs 23, 16) · corretor apagou lixo (IDs 1,5,7). Estado final verificado: 3 posts de conteúdo publicados, identidade correta.

## Lições validadas (não repetir erros)
- **1 spec por execução de agente** — sessão longa empilha contexto e morre ("Requests ending with a model turn are not supported", API Google); sessões curtas = 100%.
- bin roda `dist/`, não `src/` — rebuild antes de validar via CLI.
- Settings isoladas de teste: caminho é `$OPENCORP_HOME/.opencorp/settings.json` (a subpasta .opencorp dentro do home).
- Scripts de monitoramento: `rc=$?` em linha separada (command substitution reseta $?); `pgrep -f` casa com o próprio shell — filtrar com ps.
- wp.cjs v2: CREATE aceita status só como 3º argumento; credenciais `wp_<site>_user/_pass`; SITE derivado do nome do workspace.

## Backlog de ideias do usuário (fazer AOS POUCOS, validando)
- [ ] Re-bench `gemma-4-31b-it` (Google "high demand" era transitório) + consolidar bench OpenRouter pós-reset
- [ ] Fase 2 do plano: 4 bugs sistêmicos (path fantasma `registries/`, gridlock permissões CKO, parser menções, `{{workspace}}` bridge)
- [ ] Fase 3: daemon de teste + timeout por cenário + retry com checkpoint
- [ ] Fase 4: verificador de write-falso + lock de healer
- [ ] MCP server real (ToolRegistry/agente_run como MCP) — catálogo FERRAMENTAS.md resolve hoje
- [ ] Replicar ciclo de auto-gestão nas outras 3 empresas + specs específicas por template
- [ ] Agendador do ciclo diário de auto-gestão (cuidando cotas) — jobs hoje pausados
- [ ] Limpar ~1.045 diretórios-lixo opencorp-* em /tmp

## Próximos passos sugeridos
1. Checar resultado do bench OpenRouter (`/tmp/opencode/bench-f1/`) e consolidar rotação final.
2. Re-bench gemma-4-31b + 2º ciclo de auto-gestão no pulso-diario (deve dar 3/3 PASS agora).
3. Escolher próximo item do backlog com o usuário — sempre: simplificar, rodar, medir, anotar.
