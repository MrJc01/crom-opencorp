# SPEC AUDITORIA-01 — Identidade e Perfil do Site

> Executada pelo `critico-site` (somente leitura). Empresa/régua: `.opencorp/projeto.json`.
> Ferramenta: `node scripts/wp.cjs` (modos de leitura: `settings`, `pages`, `posts`, `ver`).

## Cenários

**C1 — Identidade global**: `node scripts/wp.cjs settings '{}'` → o `titulo` e a `descricao` correspondem EXATAMENTE à empresa do `projeto.json` (nome, nicho e tom). Comparação literal — nada de outro site, nada genérico.

**C2 — Home estática correta**: o `home_estatica` aponta para uma página EXISTENTE e publicada. `node scripts/wp.cjs pages '{"qtd":20}'` e confirme que o id existe e está `publish` (não draft, não lixeira).

**C3 — Página Início sem cara de padrão**: `node scripts/wp.cjs ver '{"id":<home_estatica>,"tipo":"page"}'` → o conteúdo menciona a empresa/nicho/público do perfil; contém estrutura real (`<h2>`, `<p>`); ZERO "lorem ipsum", "Página de exemplo", "Hello world!" ou placeholder.

**C4 — Páginas essenciais publicadas**: existem e estão `publish`: página Sobre (com conteúdo específico da empresa) e no mínimo 1 página ou post de conteúdo do nicho (tópicos editoriais do perfil).

**C5 — Sem contaminação cruzada**: nenhum texto, título ou descrição em qualquer página publicada menciona nome/nicho de OUTRA empresa (compare contra os nomes: Pulso Diário, Engenhar, Empório Aurora, Norteia).

**C6 — Descrição do site aderente**: a `descricao` das settings reflete o nicho do perfil em 1 frase (não vazia, não genérica tipo "Um site WordPress de exemplo").

**C7 — Rascunhos órfãos**: `node scripts/wp.cjs pages '{"qtd":20,"status":"draft"}'` e posts equivalentes → listar rascunhos duplicados/abandonados (mesmo tema repetido ≥2× é FAIL).

## Relatório

Gravar em `.opencorp/registries/documentos/PARECER-AUDITORIA-01-<data>.md` (formato do agente critico-site). Última linha: `VEREDITO: PASS|FAIL — <n> PASS, <n> FAIL — parecer: <caminho>`.
