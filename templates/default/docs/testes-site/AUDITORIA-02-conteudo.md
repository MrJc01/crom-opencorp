# SPEC AUDITORIA-02 — Conteúdo e Perfil Editorial

> Executada pelo `critico-site` (somente leitura). Régua: `.opencorp/projeto.json` (tópicos_editoriais, tom, tom_evitar, público).
> Ferramenta: `node scripts/wp.cjs` (leitura) — `posts`, `pages`, `ver`.

## Cenários

**C1 — Volume mínimo de conteúdo**: ≥2 posts ou páginas de conteúdo publicadas além das institucionais (Início/Sobre). Listar com `posts '{"qtd":20}'`.

**C2 — Aderência aos tópicos editoriais**: cada conteúdo publicado pertence a um dos `topicos_editoriais` do perfil. Conteúdo fora dos tópicos = FAIL (indicar qual e por quê).

**C3 — Tom conforme o perfil**: amostrar 2 conteúdos (`ver`) e julgar contra `tom` e `tom_evitar`. Parágrafos longos demais, jargão que o `publico` não entende, ou qualquer traço de `tom_evitar` = FAIL.

**C4 — Sem repetição temática**: dois conteúdos publicados abordando o mesmo ângulo/tema (títulos ou primeiros parágrafos equivalentes) = FAIL.

**C5 — Sem cara de template**: nenhum conteúdo com seções vazias, listas de promessas genéricas ("aqui você encontra tudo sobre..."), ou texto que serviria para qualquer empresa do mundo.

**C6 — Rascunhos em fila**: rascunhos de posts com conteúdo útil e dentro dos tópicos são listados como OPORTUNIDADE (não FAIL) — para o editor transformar em publicação.

**C7 — Datas e atualidade**: nenhum conteúdo publicado com data no futuro; conteúdo "de lançamento" (anúncio de site novo, "bem-vindo") não conta como conteúdo do nicho.

## Relatório

Gravar em `.opencorp/registries/documentos/PARECER-AUDITORIA-02-<data>.md`. Última linha: `VEREDITO: PASS|FAIL — <n> PASS, <n> FAIL — parecer: <caminho>`.
