# Spec de Teste Cego — ETAPA 11: Supervisor em loop

**Setup:** `OPENCORP_HOME=/tmp/opencorp-cego-e11` (rm -rf antes). Workspace `test-sup` criado e ativo. Modelos free.

## Cenários

### 1. Start/stop/status
- Comandos: `supervisor start --interval 1` (1 min) → `supervisor status` → `supervisor stop` → `supervisor status`
- Esperado: status mostra rodando com intervalo/pid; após stop, parado. Sem erro.

### 2. Anti-duplicidade
- Comandos: `supervisor start` e imediatamente `supervisor start` de novo
- Esperado: o segundo avisa que já está rodando (não cria 2 processos). Confirme com `ps` (1 processo) ou como o CLI indicar.

### 3. Check de falhas gera ordem
- Setup: com supervisor rodando (interval 1 min), provoque uma falha: `agent run executor-padrao "leia o arquivo sandbox/nao-existe.txt e mostre o conteúdo" --model opencode/hy3-free` (agente pode falhar OU use uma ordem que certamente falhe no guard: "execute: rm -rf /tmp/x" → falha exit 3)
- Esperado: no tick seguinte (≤2 min), o log do supervisor (`supervisor logs` ou registro em `registry list logs`) mostra o check detectando a execução falha e uma AÇÃO registrada (ordem cega emitida ou aviso).

### 4. Check de approvals pendentes
- Setup: crie pendência HITL (`agent run executor-padrao "execute: git push origin main"` → pendência) e espere o tick
- Esperado: supervisor registra a pendência detectada (log/registro).

### 5. Check de budget >80%
- Setup: rode uma execução real (hy3-free) para ter custo; `budget set --per-agent-usd` um valor pouco acima do custo atual (ex.: custo 0.001 → set 0.0011) para cruzar 80%
- Esperado: tick registra aviso de budget alto. Restore: `budget set --per-agent-usd 1`.

### 6. Orçamento respeitado pelo supervisor
- Setup: `budget set --per-agent-usd 0.000001`, supervisor rodando, provoque 2 falhas em sequência
- Esperado: supervisor NÃO emite ordens além do permitido (max_orders_per_tick) e ordens que precisam de modelo não executam sem orçamento (recusa registrada, não crash).

### 7. Sobrevivência a restart
- Comandos: com supervisor rodando, `supervisor stop` → `supervisor start` → `supervisor logs`
- Esperado: logs preservados entre reinícios (histórico não zera); status limpo.

## Relatório
Formato da doc 09. Intervalo 1 min nos testes. Limpe workspace e pare o supervisor ao final.
