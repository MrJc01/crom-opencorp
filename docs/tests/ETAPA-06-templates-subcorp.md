# Spec de Teste Cego — ETAPA 06: Templates e Subcorp

**Setup:** workspace `test-base` com pelo menos 1 agente custom (ex.: crie `auditor` via `agent create --from executor-padrao`) e 1 registro (ex.: `notas/base -d "doc base"`). Home limpa de templates anteriores com prefixo `test-`.

## Cenários

### 1. Exportar template
- Comando: `node bin/opencorp.mjs template export test-base -o /tmp/opencode/test-base.corp`
- Esperado: exit 0; arquivo/pasta gerado em `/tmp/opencode/`; ao inspecionar (`ls`/`tar -tf` se for .corp), contém os agentes (incl. `auditor.md`) e registros do workspace.

### 2. Segredos não vazam
- Setup: se o CLI tiver comando de segredo, adicione um; senão, crie manualmente um arquivo `secrets.json` dentro de `test-base/.opencorp/` e repita o export.
- Esperado: o export NÃO contém `secrets*` (checar conteúdo do pacote). Este cenário é crítico: se vazar, FAIL direto no veredito.

### 3. Importar template
- Comando: `node bin/opencorp.mjs template import /tmp/opencode/test-base.corp --as test-tpl`
- Esperado: `template list` mostra `test-tpl`.

### 4. Workspace a partir de template
- Comandos:
  1. `node bin/opencorp.mjs workspace create test-filho --template test-tpl`
  2. `node bin/opencorp.mjs use test-filho`
  3. `node bin/opencorp.mjs agent list`
  4. `node bin/opencorp.mjs registry list notas`
- Esperado: `test-filho` nasce com o agente `auditor` e o registro `notas/base` herdados do template.

### 5. Subcorp: adicionar
- Setup: volte ao workspace `test-base` (`use test-base`).
- Comando: `node bin/opencorp.mjs subcorp add <caminho-do-test-filho> --as financeiro --perm ask`
- Esperado: exit 0; `subcorp list` mostra `financeiro` com permissão `ask` e caminho/fonte.

### 6. Subcorp: agente exposto invocável
- Comando: `node bin/opencorp.mjs agent run financeiro/auditor "escreva 'subcorp ok' em sandbox/sub.txt" --model opencode/hy3-free`
- Esperado: exit 0 (a sessão rodou dentro do subcorp); artefato criado no workspace do subcorp.

### 7. Subcorp: isolamento
- Comando: dentro do trabalho do cenário 6, verifique que o subcorp não ganhou acesso a registros do pai (ex.: os registros escritos pela sessão do subcorp ficam no subcorp, não no pai). Se o CLI não oferecer forma de verificar, tente `registry list` no subcorp vs pai e compare. Marque PASS apenas com evidência.

### 8. Subcorp: remover
- Comando: `node bin/opencorp.mjs subcorp remove financeiro` + `subcorp list`
- Esperado: `financeiro` sai da lista.

## Relatório

Formato da doc 09. Limpe workspaces/templates `test-` no final.
