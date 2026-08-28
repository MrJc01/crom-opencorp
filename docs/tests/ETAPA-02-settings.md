# Spec de Teste Cego — ETAPA 02: Settings (Painel de Configurações)

**Setup:** ambiente limpo (`~/.opencorp/settings.json` inexistente ou backup antes). Se o CLI suportar variável/flag de home alternativo, prefira; caso contrário, teste na home real com prefixo `test-` apenas nos valores, e restaure o original ao final (anote no relatório).

## Cenários

### 1. Listagem inicial com defaults
- Comando: `node bin/opencorp.mjs settings list`
- Esperado: exit 0; mostra chaves como `default_model`, `test_model`, `budget.daily_usd`, `security.level`, `paths.workspaces_root` e valores padrão plausíveis (ex.: `test_model` é um modelo com "free" ou definido como padrão).

### 2. Set + get roundtrip
- Comandos:
  1. `node bin/opencorp.mjs settings set test_model opencode/mimo-v2.5-free`
  2. `node bin/opencorp.mjs settings get test_model`
- Esperado: exit 0 em ambos; o get retorna exatamente `opencode/mimo-v2.5-free`.

### 3. Escopos global vs workspace
- Setup: crie workspace de teste `test-ws-settings` (se o comando workspace ainda não existir, pule este cenário marcando SKIP — anote).
- Comandos: `settings set test_model outro/modelo --scope workspace` e depois `settings get test_model` com esse workspace ativo.
- Esperado: dentro do workspace retorna o valor do workspace; sem workspace ativo (ou fora dele), retorna o global.

### 4. Valor inválido é rejeitado
- Comando: `node bin/opencorp.mjs settings set budget.daily_usd "bananas"`
- Esperado: exit != 0, mensagem apontando a chave e o motivo (número esperado). E `settings get budget.daily_usd` continua com o valor anterior.

### 5. Persistência em arquivo legível
- Comando: `cat ~/.opencorp/settings.json`
- Esperado: JSON válido contendo o `test_model` setado no cenário 2 (o arquivo é o contrato, deve ser legível por humano).

### 6. Caminho dos arquivos
- Comando: `node bin/opencorp.mjs settings path`
- Esperado: imprime os caminhos do settings global e do workspace (quando houver).

### 7. Reset volta ao padrão
- Comandos: `settings reset test_model` + `settings get test_model`
- Esperado: valor volta ao default inicial observado no cenário 1.

## Relatório

Formato da doc 09. Marque SKIP nos cenários que dependem de comandos ainda não implementados (ex.: workspace) e explique.
