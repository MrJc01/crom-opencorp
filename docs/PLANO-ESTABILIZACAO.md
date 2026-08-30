# PLANO-ESTABILIZACAO — Logs, Modelos e Estrutura

> Base: análise das 153 sessões opencorp (30/08/2026). Diagnóstico: ~95% do tempo de teste gasto em
> espera de provider, infra falhando e realinhamento de spec — não em execução de teste.
> Overhead medido: 34 sessões cegas para ~19 baterias (1,8×); etapas ruins (10,12,13,14,18,23,24) = 44% de desperdício.

## Objetivo

Reduzir o custo médio por veredito válido de ~2-3 execuções para ~1,3, com três frentes:
1. **Telemetria** — logs estruturados para saber ONDE o tempo vai (sem achismo).
2. **Modelos** — matriz de free models com health-check, gemma-4 incluso.
3. **Estrutura** — matar os 4 bugs sistêmicos + harness compatível com o produto.

---

## FASE 0 — Telemetria (coleta de logs para análise) `[primeiro, sem isso o resto é chute]`

**Meta: saber em números onde cada minuto de bateria vai.**

- [x] **0.1 — Event log append-only por execução de teste** ✅ commit c5a3390
  - `src/utils/event-log.ts` + eventos `attempt_start/attempt_end/rotate/verdict/health_check` em `logs/events-<execid>.jsonl`
  - `fail_cat`: `provider_error | rate_limit | timeout_harness | missing_report | product_bug | spec_divergence | unknown`

- [x] **0.2 — Sumário automático pós-bateria** ✅ commit c5a3390 (consolidado extendido com fail_cat via classificarFalha + eventos por execid)

- [x] **0.3 — Health-check de modelo antes de cada rodada** ✅ commit c5a3390
  - `pingModelo` (60s) + `filtrarModelosSaudaveis`; setting `tests.health_check` (default true); modelo morto pulado antes da bateria

**Aceite Fase 0:** rodar `blind all` e obter relatório com % por categoria de falha.

## FASE 1 — Matriz de modelos free `[paralelo à 0]`

**Meta: 3+ modelos estáveis validados, rotação por health real.**

> **⚠ Achado do bench (30/08 18:30):** a conta OpenRouter (paga) tem **cota diária de requisições a modelos free**
> (`free-models-per-day-high-balance`) que foi esgotada pela bateria do dia. Isso explica parte da "instabilidade de
> provider" histórica: a rotação NÃO contorna cota de conta. Bench agendado pós-reset (00:05 UTC) em
> `/tmp/opencode/bench-f1/` (agenda.sh → bench.sh, etapa-02 × 10 modelos, health_check off, spec é a medida real).

- [x] **1.1 — Bench de candidatos** ✅ 30/08 (AI Studio BYOK concluído; OpenRouter agendado pós-reset)

  AI Studio BYOK (cota própria, etapa-02 completa, timeout 15min):

  | Modelo | Ping | Spec | Duração | Diagnóstico |
  |---|---|---|---|---|
  | gemini-3.5-flash-lite | 3s | **PASS 7/7** | **61s** | ⭐ vencedor, 10-20× mais rápido |
  | gemini-3.1-flash-lite | 4s | **PASS** | 101s | 2º lugar |
  | gemma-4-31b-it | 10s | FAIL 2× | 2min/15min | "high demand" Google (transitório, re-bench depois) |
  | gemini-3.5-flash | 12s | TIMEOUT | 15min | turnos de 2-4min, inviável |
  | gemini-3.7-flash | 27s | FAIL | 6min | erro de API ("model turn") — incompatível com harness |
  | gemini-3.6-flash / gemma-4-26b-a4b | pendurou | - | - | ping >60s |
  | gemini-2.5-flash-lite | erro | - | - | descontinuado pelo Google |

- [x] **1.2 — Rotação por settings** ✅ pool duplo: AI Studio BYOK (cota própria) + OpenRouter free (cota diária conta) como fallback; `gemma-4-31b` fica via OpenRouter até Google normalizar
- [ ] **1.3 — Re-bench do gemma-4-31b-it** quando "high demand" passar + bench OpenRouter (agenda.sh roda às 00:05 UTC)

- [ ] **1.3 — Regra permanente de benchmark**: modelo novo entra na rotação SÓ após passar no bench 1.1

**Aceite Fase 1:** 3 modelos com uptime medida >95% na bateria curta; gemma-4 decidido por dado.

## FASE 2 — Bugs sistêmicos `[a estrutura que gera retrabalho]`

- [ ] **2.1 — Path fantasma**: normalizar todo caminho de registry para `.opencorp/registries/`
  - Fonte única de verdade (`paths.ts`), templates de agente/ordem deixam de citar `registries/`
  - Teste: grep zero de `registries/` solto nos templates
- [ ] **2.2 — Gridlock de permissões**: CKO read-only não pode ser o autor de docs; ou eleita um autor level-2, ou escritas do CKO vão por delegação. Definir e aplicar nos templates boardroom
- [ ] **2.3 — Parser de menção**: `@agente:fake-a` parsed como agente `"agente"` (cego-24 cenário 4). Fix + teste de regressão em `mention-runner.test.ts`
- [ ] **2.4 — Bridge `{{workspace}}`**: substituição nunca feita em trigger global (causa dos 4 sites em branco). Fix em `opencode-bridge` + teste

## FASE 3 — Harness compatível com o produto

**Meta: fim do "bash de 120s" como física do teste.**

- [ ] **3.1 — Daemon de teste**: `test blind --daemon` sobe serviço detached (pidfile, padrão `serve`/supervisor já existente); specs conversam com ele, shell do testador não morre junto
- [ ] **3.2 — Timeout configurável por cenário** (campo `timeout_s` no spec JSON), default 120, cenários de reunião/supervisor ganham 300-600
- [ ] **3.3 — Anti-stale**: ao morrer sessão, matar processos filhos + limpar status `executando` órfão (hoje ficam presos e a próxima sessão herda estado sujo)
- [ ] **3.4 — Retry com checkpoint**: spec falha no cenário N → re-run opcional começa do N, não do zero (maior economia de tempo do plano)

## FASE 4 — Anti-falso-sucesso

- [ ] **4.1 — Verificador de write-falso**: tarefa que alega ter escrito arquivo X → o orchestrator checa existência no fs; divergência = anomalia automática (mata o "FEITO" simulado do smoke24)
- [ ] **4.2 — Lock de tarefa/healer**: posse exclusiva por exec-id (lease com pidfile), impede 2 healers corrigindo a mesma exec (race observada em test-heal)
- [ ] **4.3 — Taxonomia no spec**: campo `ambiguidade_permitida: false` — ordem com `<pega do contexto>` deve falhar na validação do spec, não virar 3 interpretações em runtime

## FASE 5 — Spec a partir do código (contrato congelado)

- [ ] **5.1 — Gerar seção "contrato real" da spec do OpenAPI `/doc` + `--help`** (rotas, flags, defaults, mensagens de erro) — spec cita só o que o código garante
- [ ] **5.2 — Check de spec no CI local**: `opencorp test validate-spec <etapa>` cruza spec × rotas/flags existentes e aponta divergências ANTES de gastar sessão cega

---

## Ordem de execução sugerida

```
Semana A: Fase 0 (telemetria) + Fase 1 (bench gemma-4 e matriz)   → medir tudo
Semana B: Fase 2 (4 bugs)                                           → matar retrabalho
Semana C: Fase 3.1-3.3 (harness) + Fase 4.1-4.2 (anti-falso)       → matar re-run
Depois:   Fase 3.4 + Fase 5                                          → amortizar
```

## Métricas de sucesso (medidas pela Fase 0)

| Métrica | Hoje | Meta |
|---|---|---|
| Sessões por veredito válido | ~2-3 | ≤1,3 |
| FAIL por provider_error/rate_limit | dominante | <10% dos FAILs |
| TIMEOUT por timeout_harness | frequente | <5% dos FAILs |
| Falso "FEITO" detectado | ad hoc | 0 (verificador automático) |
| Tempo total `blind all` | 5h09m | ≤2h |

## Riscos

- Free models mudam/quebram sem aviso → health-check (0.3) + rotação mitigam; bench re-runnable
- Daemon de teste adiciona complexidade → reusar padrão `serve` já provado (daemon + pidfile)
- Telemetria sem adoção → eventos gerados pelo próprio `test blind`, zero esforço manual
