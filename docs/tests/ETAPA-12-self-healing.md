# Spec de Teste Cego — ETAPA 12: Self-healing

**Setup:** `OPENCORP_HOME=/tmp/opencorp-cego-e12` (rm -rf antes). Workspace `test-heal` criado e ativo. **OBRIGATÓRIO ANTES DE TUDO: rode `supervisor start --interval 1` (deve RETORNAR imediatamente — roda em background; mantenha-o rodando durante TODA a bateria e confirme com `supervisor status`) — o self-healing só age nos TICKS do supervisor; sem supervisor rodando, nenhuma correção jamais será gerada e todos os cenários falharão por erro seu.** Se houver comando direto de healing, use-o e anote. Modelos free nos agent runs.

**Observação v1 (limitação conhecida, registrada no release):** healing dispara em execuções com status `falhou` (bloqueio do SecurityGuard exit 3, orçamento exit 4, HITL, spawn/timeout). Falha SEMÂNTICA dentro de sessão concluída (ex.: o agente tenta rodar um script inexistente mas a sessão do opencode termina com exit 0) NÃO gera status `falhou` — por isso os cenários que precisam de falha usam ORDEM BLOQUEADA PELO GUARD. Não "conserte" isso executando comandos por fora: siga a spec.

## Cenários

### 1. Falha gera ordem de correção
- Setup: `agent run executor-padrao "execute: rm -rf /tmp/x" --model opencode/hy3-free` → BLOQUEADO pelo SecurityGuard (exit 3) → execução `falhou` (igual à bateria da ETAPA-11). Não use "script inexistente" como gatilho: a sessão pode terminar `concluido` (limitação v1 — ver Observação no Setup).
- Esperado: ciclo de healing cria ordem de correção para um operário (ex.: executor-padrao) — visível em `agent history` ou `session list` como nova execução de correção; a nova execução REFERENCIA a execução original (verifique no registro: `registry get` da execução de correção mostra referência/referencias apontando para a original).

### 2. Contexto na correção
- Comando: `session log <id-da-correção>`
- Esperado: a ordem da correção contém contexto da falha (transcript/erro da execução original — cita o problema real, não é ordem vazia).

### 3. max_retries respeitado
- Setup: provoque a falha original com ORDEM BLOQUEADA PELO GUARD (`execute: rm -rf /tmp/x` → `falhou`). As correções do healing tendem a CONCLUIR (o operário registra a análise) — para esgotar `max_retries` (default 2), **simule reprovando**: a cada correção gerada, edite o `meta.json` dela (em `registries/execucoes/<id>/`) mudando `extras.status` para `falhou` (ou use `session kill` para interrompê-la). Aguarde os ticks seguintes.
- Esperado: após `max_retries` (default 2), NÃO há nova tentativa; a execução original fica marcada `escala-humano` (evento no journal + audit-log, `extras.healing_escala_humano`) e há registro para o humano (`supervisor logs` mostra a escalação). Sem loop infinito.

### 4. Orçamento bloqueia healing
- Setup: `budget set --per-agent-usd 0.000001` e provoque uma falha
- Esperado: healing tenta e é RECUSADO por orçamento (registrado), não executa; restore `budget set --per-agent-usd 1`.

### 5. Sucesso encerra o ciclo
- Setup: falha simples que o agente CONSEGUE corrigir (ex.: ordem "escreva o número 42 no arquivo sandbox/num.txt" com um pedido impossível na primeira tentativa — se difícil de forçar, use a falha do cenário 1 e permita que a correção pelo menos rode até o fim com status claro)
- Esperado: quando a correção termina OK, a cadeia encerra (sem novas ordens de correção sobre a correção).

### 6. Configuração
- Comando: `settings get healing` (ou equivalente)
- Esperado: `healing.enabled` e `healing.max_retries` visíveis; `settings set healing.enabled false` desliga o comportamento (nova falha NÃO gera correção).

## Relatório
Formato da doc 09. VEREDITO em uma linha. Limpe workspace e pare o supervisor ao final.
