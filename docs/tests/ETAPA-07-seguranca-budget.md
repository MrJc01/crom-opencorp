# Spec de Teste Cego — ETAPA 07: Segurança e Orçamento

**Setup:** workspace `test-sec`. Nenhum segredo real. Política padrão (`standard`) deve estar ativa no workspace.

## Cenários

### 1. Policy visível
- Comando: `cat <workspace>/.opencorp/security_policy.json`
- Esperado: JSON válido com blocklist (ex.: contém padrões como `rm -rf`) e hitl_patterns (ex.: `git push`).

### 2. Blocklist bloqueia
- Comando: `node bin/opencorp.mjs agent run executor-padrao "execute: rm -rf /tmp/opencode/teste-guard" --model opencode/hy3-free`
- Esperado: a execução NÃO roda o comando; termina com erro de segurança (exit 3) OU mensagem de bloqueio clara na saída; `registry list logs` do workspace contém evento do bloqueio.

### 3. HITL intercepta
- Comando: `node bin/opencorp.mjs agent run executor-padrao "execute: git push origin main" --model opencode/hy3-free` (num repo inofensivo; se não houver repo no sandbox, crie `git init` nele antes)
- Esperado: execução pausa/termina com pedido de aprovação (exit 5 ou mensagem clara); `node bin/opencorp.mjs approvals list` mostra a pendência; `approvals reject <id> --motivo "teste"` funciona e o registro aparece no histórico.

### 4. Nível level-1 não executa nada
- Comandos:
  1. Edite o agente de teste: em `<workspace>/.opencorp/agents/<algum>.md` mude `permissions` para `level-1`
  2. `agent run <agente> "execute: echo hi" --model opencode/hy3-free`
- Esperado: comando não é executado (erro/bloqueio claro).

### 5. Orçamento acumula
- Setup: rode 1-2 execuções curtas: `agent run executor-padrao "escreva 'x' em sandbox/b1.txt" --model opencode/hy3-free`
- Comando: `node bin/opencorp.mjs agent cost executor-padrao` e `node bin/opencorp.mjs budget status`
- Esperado: custo > 0 (ou registrado mesmo que estimado); `budget status` mostra consumo do dia por workspace e por agente.

### 6. Teto diário pausa
- Comandos:
  1. `node bin/opencorp.mjs budget set --per-agent-usd 0.000001`
  2. `agent run executor-padrao "qualquer coisa" --model opencode/hy3-free`
- Esperado: execução recusada/pausada por orçamento esgotado (exit 4 ou mensagem clara), sem chamadas ao modelo.
- Cleanup: `budget set --per-agent-usd 1` para restaurar.

### 7. Registro de custos
- Comando: `node bin/opencorp.mjs registry list custos`
- Esperado: existem registros de custo das execuções feitas nos cenários anteriores.

## Relatório

Formato da doc 09. Este teste envolve execução real de modelo: mantenha tudo no workspace `test-sec`.
