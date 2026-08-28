# Spec de Teste Cego — ETAPA 05: Registros

**Setup:** workspace ativo `test-registros`. Este teste valida a memória global: categorias, journal append-only, permissões e busca.

## Cenários

### 1. Categorias padrão existem
- Comando: `node bin/opencorp.mjs registry list`
- Esperado: exit 0; mostra categorias como `chats`, `documentos`, `execucoes`, `agentes`, `custos`, `logs` (podem estar vazias — o importante é existirem).
- Complemento: se `agent history` já registra execuções (ETAPA 4), `registry list execucoes` deve ter registros de execução.

### 2. Criar registro exige descrição
- Comando: `node bin/opencorp.mjs registry create notas/teste-1` (SEM `-d`)
- Esperado: exit != 0 pedindo a descrição.

### 3. Criar registro correto
- Comando: `node bin/opencorp.mjs registry create notas/teste-1 -d "Registro de teste cego"`
- Esperado: exit 0; `registry list notas` mostra `teste-1`; `registry get notas/teste-1` mostra descrição e metadados (criado_em, criado_por).

### 4. Journal append-only
- Comandos:
  1. `node bin/opencorp.mjs registry log notas/teste-1 "primeira anotação"`
  2. `node bin/opencorp.mjs registry log notas/teste-1 "segunda anotação"`
  3. `node bin/opencorp.mjs registry get notas/teste-1`
- Esperado: as duas anotações aparecem, em ordem, com timestamp e autor.

### 5. Update vai para o journal
- Comandos:
  1. `node bin/opencorp.mjs registry update notas/teste-1 --conteudo "novo conteúdo"`
  2. `node bin/opencorp.mjs registry get notas/teste-1`
- Esperado: conteúdo atualizado E o histórico (journal) mostra o evento de modificação — nada é sobrescrito silenciosamente.

### 6. Formato em disco é legível
- Comando: localize a pasta do registro (ex.: `<workspace>/.opencorp/registries/notas/teste-1/`) e `ls` + `cat meta.json` + `cat journal.jsonl`
- Esperado: `meta.json` é JSON válido com `descricao`, `permissoes`; `journal.jsonl` tem uma linha JSON por evento.

### 7. Permissões bloqueiam escrita de terceiro
- Comandos:
  1. `node bin/opencorp.mjs registry perms notas/teste-1 --escrita ceo-documentos` (restringe)
  2. Tente `registry update notas/teste-1 --conteudo "x"` se o CLI permitir simular autor (ex.: `--por executor-padrao`); se não houver forma de simular outro autor, marque SKIP e explique.
- Esperado: escrita por agente fora da lista é negada com erro, e a tentativa gera evento em `logs` (verifique `registry list logs`).

### 8. Busca
- Comando: `node bin/opencorp.mjs registry search "teste cego"`
- Esperado: encontra `notas/teste-1`.

### 9. Categoria custom por agente
- Comando: `node bin/opencorp.mjs registry create inventario/servers -d "Lista de servidores monitorados"`
- Esperado: cria categoria `inventario` espontaneamente (categorias custom são permitidas) e o registro aparece em `registry list inventario`.

## Relatório

Formato da doc 09.
