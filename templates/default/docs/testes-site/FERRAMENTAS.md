# CATÁLOGO DE FUNÇÕES — function calling deste workspace

> Como chamar as ferramentas: cada função abaixo é um comando bash EXATO. Siga o contrato literal
> (argumentos, ordem, JSON). Prefixo obrigatório `OPENCORP_HOME=/home/j` em toda chamada wp_*.

## WordPress

**wp_listar(tipo, qtd, status)**
```bash
OPENCORP_HOME=/home/j node scripts/wp.cjs pages '{"qtd":20,"status":"publish,draft"}'
OPENCORP_HOME=/home/j node scripts/wp.cjs posts '{"qtd":20}'
```
→ `[{id, titulo, status, tipo, link}]`

**wp_ler(tipo, id)**
```bash
OPENCORP_HOME=/home/j node scripts/wp.cjs ver '{"id":20,"tipo":"page"}'
```
→ `{id, titulo, status, tipo, conteudo (≤600 chars), link}`

**wp_settings_ler()**
```bash
OPENCORP_HOME=/home/j node scripts/wp.cjs settings '{}'
```
→ `{titulo, descricao, home_estatica, mostra_posts, pagina_posts}`

**wp_criar(tipo, status, titulo, conteudo)**
```bash
OPENCORP_HOME=/home/j node scripts/wp.cjs page publish '{"titulo":"...","conteudo":"<h2>...</h2><p>...</p>"}'
OPENCORP_HOME=/home/j node scripts/wp.cjs post draft '{"titulo":"...","conteudo":"..."}'
```
⚠ `publish|draft` vai como 3º ARGUMENTO — NUNCA dentro do JSON (o endpoint CREATE rejeita → HTTP 400).

**wp_editar(tipo, id, campos)**
```bash
OPENCORP_HOME=/home/j node scripts/wp.cjs update '{"id":20,"tipo":"page","titulo":"...","conteudo":"..."}'
```
→ campos opcionais: `titulo`, `conteudo`, `status` (aqui status PODE ir no JSON).

**wp_configurar(titulo?, descricao?, home_estatica?)**
```bash
OPENCORP_HOME=/home/j node scripts/wp.cjs configurar '{"titulo":"...","descricao":"...","home_estatica":20}'
```

**wp_apagar(tipo, id)** ⚠ irreversível — somente rascunho órfão apontado em parecer
```bash
OPENCORP_HOME=/home/j node scripts/wp.cjs delete '{"id":6,"tipo":"post","force":true}'
```

## Registros (memória do workspace)

**registro_gravar(namespace, nome, conteudo)** → `.opencorp/registries/documentos|execucoes|logs/<nome>`
```bash
cat > .opencorp/registries/documentos/PARECER-<spec>-<data>.md << 'EOF'
<conteudo>
EOF
```

**registro_ler(namespace)**
```bash
ls -t .opencorp/registries/documentos/ | head -5 && cat .opencorp/registries/documentos/<mais-recente>.md
```

## Chamar outro agente (delegação)

**agente_run(agente, workspace, ordem)**
```bash
cd /home/j/Documentos/GitHub/crom-worker-opencode && node bin/opencorp.mjs agent run <agente> --workspace <ws> "<ordem>"
```
→ bloqueia até concluir; saída inclui `exec_id`, status e duração.

## Task board (fila de trabalho da empresa)

> O board é a fila de trabalho compartilhada. Ao receber uma ordem ligada a uma task, WORK NELA:
> assuma, registre progresso no chat e mova de coluna ao concluir.
> Prefixo obrigatório: `cd /home/j/Documentos/GitHub/crom-worker-opencode &&` antes de node bin/opencorp.mjs
> (o binário NÃO fica dentro do workspace — seu cwd é o workspace).

**task_listar(coluna?)**
```bash
cd /home/j/Documentos/GitHub/crom-worker-opencode && OPENCORP_HOME=/home/j node bin/opencorp.mjs task list --workspace <ws>
cd /home/j/Documentos/GitHub/crom-worker-opencode && OPENCORP_HOME=/home/j node bin/opencorp.mjs task list --workspace <ws> --coluna fazendo
```
→ `[{id, titulo, coluna, prioridade, responsavel, labels, criado_em}]`

**task_criar(titulo, prioridade?, responsavel?, descricao?)**
```bash
cd /home/j/Documentos/GitHub/crom-worker-opencode && OPENCORP_HOME=/home/j node bin/opencorp.mjs task create --workspace <ws> --titulo "..." --prioridade alta --responsavel agente:<seu-id>
```
→ colunas: `backlog` → `fazendo` → `feito` (padrão: backlog).

**task_assumir(task_id)** — mova para fazendo e anuncie no chat ANTES de trabalhar
```bash
cd /home/j/Documentos/GitHub/crom-worker-opencode && OPENCORP_HOME=/home/j node bin/opencorp.mjs task move <task_id> --coluna fazendo --workspace <ws>
cd /home/j/Documentos/GitHub/crom-worker-opencode && OPENCORP_HOME=/home/j node bin/opencorp.mjs task chat <task_id> --msg "assumi esta task" --autor agente:<seu-id>
```

**task_chat(task_id, mensagem)** — registre progresso e decisões no chat da task
```bash
cd /home/j/Documentos/GitHub/crom-worker-opencode && OPENCORP_HOME=/home/j node bin/opencorp.mjs task chat <task_id> --msg "rascunho criado (id 23), verificado" --autor agente:<seu-id>
```
→ para pedir algo a outro agente, mencione `@<id-do-agente>` na mensagem (dispara o orquestrador).
→ menções válidas: `@executor-padrao`, `@critico-site`… (sem espaços).

**task_concluir(task_id)** — ao terminar, mova para feito com registro
```bash
cd /home/j/Documentos/GitHub/crom-worker-opencode && OPENCORP_HOME=/home/j node bin/opencorp.mjs task chat <task_id> --msg "concluído: <resumo + caminho do registro>" --autor agente:<seu-id>
cd /home/j/Documentos/GitHub/crom-worker-opencode && OPENCORP_HOME=/home/j node bin/opencorp.mjs task move <task_id> --coluna feito --workspace <ws>
```

## Erros do wp.cjs (contrato de erro)

| Sinal | Causa | Ação |
|---|---|---|
| `credenciais ausentes` exit 3 | OPENCORP_HOME errado | use `OPENCORP_HOME=/home/j` |
| HTTP 400 `rest_invalid_param: status` | status no JSON do CREATE | mover status p/ 3º argumento |
| HTTP 404 `rest_post_invalid_id` | id não existe | wp_listar e re-checar |
| HTTP 401 | senha de aplicação revogada | reportar, não tentar de novo |

## Linhas de pensamento (flows executáveis — n8n da empresa)

> Uma "linha" é um grafo de nós executável: gatilho → agentes → decisões → tasks/registros.
> Os agentes PODEM criar novas linhas gravando o JSON e rodar as existentes.

**flow_listar()**
```bash
cd /home/j/Documentos/GitHub/crom-worker-opencode && OPENCORP_HOME=/home/j node bin/opencorp.mjs flow list --workspace <ws>
```

**flow_run(id, entrada)**
```bash
cd /home/j/Documentos/GitHub/crom-worker-opencode && OPENCORP_HOME=/home/j node bin/opencorp.mjs flow run <flow-id> --workspace <ws> --entrada "<contexto>"
```
→ executa todos os nós; ao final imprime `contextoFinal` (o resultado da linha).

**flow_criar(id, nome, nos_json)** — para criar linha nova, grave o JSON diretamente:
```bash
cat > /home/j/.opencorp/workspaces/<ws>/.opencorp/flows/<flow-id>.json << 'EOF'
{
  "id": "<flow-id>",
  "nome": "<nome>",
  "nos": [
    {"id": "gatilho", "tipo": "manual", "config": {}},
    {"id": "pensar", "tipo": "agente", "config": {"agente": "<id-agente>", "ordem": "<instrução com {{entrada}}>"}},
    {"id": "decidir", "tipo": "decisao", "config": {"agente": "<id-agente>", "pergunta": "<o que julgar>", "opcoes": [
      {"rotulo": "OPCAO_1", "proximo": "nó-destino-1"},
      {"rotulo": "OPCAO_2", "proximo": "nó-destino-2"}
    ]}},
    {"id": "abrir-task", "tipo": "task_create", "config": {"titulo": "...", "prioridade": "media", "responsavel": "agente:<id>"}},
    {"id": "memorizar", "tipo": "registro", "config": {"categoria": "documentos", "id": "nome-do-registro", "titulo": "Título"}},
  ],
  "arestas": [{"de": "gatilho", "para": "pensar"}, {"de": "pensar", "para": "decidir"}, {"de": "abrir-task", "para": "memorizar"}]
}


## Linhas de pensamento (flows executáveis — n8n da empresa)

> Uma "linha" é um grafo de nós executável: gatilho → agentes → decisões → tasks/registros.
> Os agentes PODEM criar novas linhas gravando o JSON e rodar as existentes.

**flow_listar()**
```bash
cd /home/j/Documentos/GitHub/crom-worker-opencode && OPENCORP_HOME=/home/j node bin/opencorp.mjs flow list --workspace <ws>
```

**flow_run(id, entrada)**
```bash
cd /home/j/Documentos/GitHub/crom-worker-opencode && OPENCORP_HOME=/home/j node bin/opencorp.mjs flow run <flow-id> --workspace <ws> --entrada "<contexto>"
```
→ executa todos os nós; ao final imprime `contextoFinal` (o resultado da linha).

**flow_criar(id, nome, nos_json)** — para criar linha nova, grave o JSON diretamente (contrato abaixo), depois valide com `flow show <id>`:
- caminho do arquivo: `/home/j/.opencorp/workspaces/<ws>/.opencorp/flows/<flow-id>.json`
- 1 nó `manual` obrigatório (gatilho)
- nós possíveis: `agente` ({agente, ordem com {{entrada}}}), `decisao` ({agente, pergunta, opcoes: [{rotulo, proximo}]}), `task_create` ({titulo, descricao?, prioridade?, responsavel?}), `registro` ({categoria, id?, titulo?}), `saida`, `condicao`
- arestas: `[{de, para}]` — linear; decisão ramifica via `proximo`

**Linhas padrão já instaladas**: `ceo-analise-board` (CEO analisa o board e abre tasks), `melhorias-continuas` (proposta→task ou arquivo), `ideias-conteudo` (3 ideias→escolha→task editorial), `decisao-opcoes` (ata de decisão A/B).
