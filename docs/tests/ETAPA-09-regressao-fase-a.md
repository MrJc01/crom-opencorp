# Spec de Teste Cego — ETAPA 09: Regressão da Fase A

**Setup:** `OPENCORP_HOME=/tmp/opencorp-cego-e09` (rm -rf antes) em TODOS os comandos. Você vai re-executar as specs anteriores em sequência e consolidar.

## Cenários

### 1. Bateria de regressão
- Execute, NA ORDEM, uma sessão de teste por spec (estado limpo entre elas):
  1. `docs/tests/ETAPA-01-bootstrap.md`
  2. `docs/tests/ETAPA-02-settings.md`
  3. `docs/tests/ETAPA-03-workspaces.md`
  4. `docs/tests/ETAPA-04-agentes-sessoes.md`
  5. `docs/tests/ETAPA-05-registros.md`
  6. `docs/tests/ETAPA-06-templates-subcorp.md`
  7. `docs/tests/ETAPA-07-seguranca-budget.md`
- Use `--model opencode/hy3-free` em tudo que pedir modelo; timeout 240s por cenário.
- Marque o veredito de CADA spec (não precisa repetir as tabelas detalhadas — resuma com PASS/FAIL + 1 linha de evidência).

### 2. Doctor e testes unitários
- `node bin/opencorp.mjs doctor` → exit 0
- `npm test` (na raiz) → todos os testes passam

### 3. Consolidação
- Relatório final: tabela `| spec | veredito | evidência (1 linha) |` + veredito consolidado da Fase A.

## Relatório
Formato da doc 09. Um único arquivo consolidado no caminho indicado na ordem. VEREDITO = PASS somente se TODAS as 7 specs passarem nesta bateria.
