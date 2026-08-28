# Spec de Teste Cego — ETAPA 10: Reunião Geral (Boardroom)

**Setup:** `OPENCORP_HOME=/tmp/opencorp-cego-e10` (rm -rf antes). Workspace `test-board` criado e ativo. Modelos free em tudo.

## Cenários

### 1. Criar reunião
- Comando: `node bin/opencorp.mjs meeting start "como melhorar o registro de custos?" --agentes ceo-documentos,executor-padrao --model opencode/hy3-free`
- Esperado: exit 0; mensagem com id da reunião; participantes listados.

### 2. Transcript com turnos alternados
- Comando: `meeting show <id>` (ou caminho informado)
- Esperado: transcript mostra falas de AMBOS os participantes alternadas (≥3 turnos no total), cada fala identificada pelo agente; contexto coerente com a pauta.

### 3. Limite de turnos
- Comando: repita o `meeting start` com pauta ampla (ex.: "planeje o trimestre") e verifique que a reunião TERMINA sozinha (sem travar) — por max_turnos do settings ou decisão do moderador; timeout de segurança 8 min.
- Esperado: reunião encerra com status claro (ex.: "encerrada"); não fica presa.

### 4. Listar reuniões
- Comando: `meeting list`
- Esperado: as duas reuniões aparecem com id/pauta/status/data.

### 5. Ata automática
- Comando: `meeting end <id-da-primeira>` se não encerrou sozinha; depois localize a ata (dica: `registry list documentos` ou caminho de atas informado pelo CLI)
- Esperado: existe documento de ata com: pauta, participantes, seção de decisões e/ou tarefas; data presente. Conteúdo plausível derivado do transcript (não vazio, não genérico).

### 6. Encerramento interrompido
- Comando: inicie uma 3ª reunião e interrompa (Ctrl+C simulado: rode em background e `kill` após a primeira fala aparecer no transcript)
- Esperado: a reunião não fica "preso" — status registra encerramento parcial e o transcript até ali é preservado.

### 7. Orçamento integrado
- Comando: `budget set --per-agent-usd 0.000001` e depois inicie reunião
- Esperado: recusa ou encerramento imediato por orçamento (sem loop infinito); `budget set --per-agent-usd 0.50` restaura.

## Relatório
Formato da doc 09. Workspaces `test-` limpos ao final. VEREDITO final em uma linha.
