# CICLO DE AUTO-GESTÃO DO SITE

> Como este workspace se auto-gerencia: analisa, corrige, melhora e verifica — sem intervenção humana por ciclo.

## Comandos disponíveis (`node scripts/wp.cjs`)

```
settings '{}'                          # ler título/descrição/home
pages '{"qtd":20}' / posts '{"qtd":20}'        # listar (status: publish,draft)
ver '{"id":N,"tipo":"page|post"}'      # ler 1 item (600 chars do conteúdo)
page publish|draft '{"titulo":..,"conteudo":..}'   # criar página
post publish|draft '{"titulo":..,"conteudo":..}'   # criar post
update '{"id":N,"tipo":"page|post","titulo"/"conteudo"/"status"}'  # editar
configurar '{"titulo"/"descricao"/"home_estatica":N}'              # settings globais
delete '{"id":N,"tipo":"page|post","force":true}'  # apagar (corretor, só rascunho órfão)
```

Credenciais: `$OPENCORP_HOME/.opencorp/secrets.json` (chaves `wp_<site>_user/_pass`). Se rodando com `OPENCORP_HOME` apontando para outra pasta, use `OPENCORP_HOME=/home/j`.

## O ciclo (1 iteração completa)

1. **ANALISAR** — `critico-site` executa as 3 specs (`AUDITORIA-01`, `02`, `03`), gerando 3 pareceres em `.opencorp/registries/documentos/`.
2. **PRIORIZAR** — do conjunto de FAILs, ordenar por impacto: identidade/contaminação > site fora do ar > conteúdo fora do perfil > higiene técnica. Máx 5 itens por ciclo.
3. **CORRIGIR** — `corretor-site` executa os itens do parecer (comando a comando, com verificação pós-correção).
4. **VERIFICAR** — `critico-site` re-executa APENAS os cenários que falharam e confirma PASS.
5. **MELHORAR** (opcional, se 0 FAIL) — `editor` publica 1 conteúdo novo do `topicos_editoriais` menos coberto (rascunhos da fila C6 da AUDITORIA-02 primeiro).

## Regras do ciclo

- Um ciclo = no máx ~30 min de agentes. Se não couber, priorize e deixe o resto para o próximo.
- Nunca corrigir sem parecer. Nunca analisar com modos de escrita.
- Erros HTTP do wp.cjs: registrar saída completa; CATEGORIA no parecer (`identidade|conteudo|tecnico|provider_issue`).
- Cada passo grava registro próprio em `.opencorp/registries/execucoes/` com VEREDITO final.
- Se o site estiver fora do ar (C1/C2 da 03), abortar melhorias e focar só no restauro.
