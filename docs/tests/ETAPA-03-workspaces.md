# Spec de Teste Cego — ETAPA 03: Workspaces

**Setup:** `OPENCORP_HOME`/tmpdir se suportado; senão home real. Remover workspaces com prefixo `test-` antes de começar (`node bin/opencorp.mjs workspace list` para conferir).

## Cenários

### 1. Criar workspace
- Comando: `node bin/opencorp.mjs workspace create test-alfa`
- Esperado: exit 0; mensagem confirmando criação; `workspace list` agora mostra `test-alfa`.

### 2. Estrutura interna do workspace
- Comando: `ls test-.../` no diretório do workspace criado (descubra o caminho com `workspace show test-alfa`; se `show` imprimir o caminho, use-o; senão procure em `~/.opencorp/workspaces/`)
- Esperado: existem (pelo menos): config do workspace, pasta de agentes com arquivos, pastas de registros (ex.: `registries/` com categorias como `execucoes`, `documentos`, `custos`), pasta `sandbox/`.

### 3. Agentes iniciais presentes
- Comando: `node bin/opencorp.mjs agent list` (com workspace ativo)
- Esperado: lista inclui agentes como `executor-padrao`, `secretario`, `ceo-documentos` (nomes podem variar; anote os encontrados).

### 4. ID inválido rejeitado
- Comando: `node bin/opencorp.mjs workspace create "Nome Ruim!"`
- Esperado: exit != 0, explicando o formato válido (kebab-case).

### 5. Duplicado rejeitado
- Comando: `node bin/opencorp.mjs workspace create test-alfa` (de novo)
- Esperado: exit != 0 com mensagem clara.

### 6. Trocar workspace ativo
- Comandos:
  1. `node bin/opencorp.mjs workspace create test-beta`
  2. `node bin/opencorp.mjs use test-beta`
  3. `node bin/opencorp.mjs workspace current`
- Esperado: current retorna `test-beta`; `workspace list` marca o ativo.

### 7. Usar workspace inexistente
- Comando: `node bin/opencorp.mjs use test-nao-existe`
- Esperado: exit != 0 com mensagem clara.

### 8. Show detalhado
- Comando: `node bin/opencorp.mjs workspace show test-alfa`
- Esperado: exit 0; mostra ao menos: nome, caminho, agentes e configuração de orçamento.

### 9. Delete com confirmação
- Comandos:
  1. `node bin/opencorp.mjs workspace delete test-beta` (responda N / sem `-y`)
  2. `node bin/opencorp.mjs workspace list`
- Esperado: o comando pediu confirmação e, sem confirmar, `test-beta` continua listado.
- Complemento: `workspace delete test-beta -y` → saiu da lista.

## Relatório

Formato da doc 09. No fim, limpe os workspaces `test-` criados e anote que fez isso.
