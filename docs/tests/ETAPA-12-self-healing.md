# Spec de Teste Cego — ETAPA 12: Self-healing

**Setup:** `OPENCORP_HOME=/tmp/opencorp-cego-e12` (rm -rf antes). Workspace `test-heal` criado e ativo. Supervisor: use o comando que a etapa expõe para disparar o ciclo de correção (se for via supervisor, inicie com interval 1 min; se houver comando direto, use-o e anote).

## Cenários

### 1. Falha gera ordem de correção
- Setup: `agent run executor-padrao "execute o script sandbox/inexistente.sh" --model opencode/hy3-free` → execução `falhou`
- Esperado: ciclo de healing cria ordem de correção para um operário (ex.: executor-padrao) — visível em `agent history` ou `session list` como nova execução de correção; a nova execução REFERENCIA a execução original (verifique no registro: `registry get` da execução de correção mostra referência/referencias apontando para a original).

### 2. Contexto na correção
- Comando: `session log <id-da-correção>`
- Esperado: a ordem da correção contém contexto da falha (transcript/erro da execução original — cita o problema real, não é ordem vazia).

### 3. max_retries respeitado
- Setup: force 3 falhas encadeadas da MESMA ordem original (rode a ordem que falha, deixe o healing corrigir, a correção também falha — ou simule reprovando)
- Esperado: após `max_retries` (default 2), NÃO há nova tentativa; a execução fica marcada `escala-humano` (ou similar) e há pendência/registro para o humano. Sem loop infinito.

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
