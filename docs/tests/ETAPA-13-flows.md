# Spec de Teste Cego — ETAPA 13: Flows declarativos

**Setup:** `OPENCORP_HOME=/tmp/opencorp-cego-e13` (rm -rf antes). Workspace `test-flow` criado e ativo. Modelos free.

## Cenários

### 1. Criar flow
- Comandos:
  1. `flow create relatorio --nome "Relatório diário"`
  2. `flow show relatorio`
- Esperado: flow criado com grafo vazio inicial (ou nós de exemplo — anote o que vier); `flow list` mostra.

### 2. Montar grafo (editar arquivo)
- Setup: edite `<ws>/.opencorp/flows/relatorio.json` diretamente (você pode — é arquivo de dados) com:
  - nós: `gatilho` (tipo manual), `coletar` (tipo agente, agente executor-padrao, ordem "escreva 'fluxo-ok' no arquivo sandbox/<pega do contexto>.txt" usando a entrada), `salvar` (tipo saida, registro documentos/relatorios)
  - arestas: gatilho→coletar, coletar→salvar
- Esperado: `flow show relatorio` reflete o grafo (nós e arestas); validação aceitou (sem ciclo).

### 3. Ciclo rejeitado
- Setup: adicione aresta `salvar→coletar` (criando ciclo) e rode `flow show`/`flow run relatorio`
- Esperado: erro claro apontando o ciclo (exit != 0). Desfaça a aresta.

### 4. Run ponta a ponta
- Comando: `flow run relatorio --entrada "saida-do-gatilho" --model opencode/hy3-free`
- Esperado: execução segue a ordem gatilho→agente→saida; artefato do nó agente existe em `sandbox/`; nó saida gravou conteúdo em `registries/documentos/relatorios/` (verifique `registry list documentos` ou caminho informado); execução registrada com referência ao flow (`registry list execucoes`).

### 5. Contexto flui entre nós
- Esperado (evidência no `flow status relatorio` ou log da execução): a saída do nó `coletar` chegou ao nó `salvar` (o conteúdo gravado corresponde ao que o agente produziu, não ao gatilho original).

### 6. Falha interrompe com clareza
- Setup: troque a ordem do nó `coletar` para algo que falhe (ex.: "execute: comando-inexistente-xyz") e rode `flow run`
- Esperado: execução para no nó com falha, status claro apontando o nó; nós seguintes NÃO executam. Desfaça.

### 7. Nó condicao
- Setup: adicione nó tipo `condicao` (rota por chave do contexto — leia a ajuda do CLI para a sintaxe exata e anote) com 2 rotas, e rode o fluxo duas vezes com entradas diferentes
- Esperado: rotas diferentes tomadas conforme a entrada (evidência nos status/logs de cada run).

### 8. Editar via CLI
- Comandos: use o comando de edição do CLI (ex.: `flow edit relatorio` ou subcomando add-node se existir) para renomear um nó/adicionar nó; `flow show` reflete.
- Esperado: CLI valida e salva (não permite JSON inválido — teste passando `{lixo` e sendo rejeitado).

## Relatório
Formato da doc 09. VEREDITO em uma linha. Limpe workspace ao final.
