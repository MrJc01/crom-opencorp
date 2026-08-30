# SPEC AUDITORIA-03 — Higiene Técnica

> Executada pelo `critico-site` (somente leitura). Ferramenta: `node scripts/wp.cjs` (leitura) + `curl` para checagens de site público.

## Cenários

**C1 — Site responde**: `curl -s -o /dev/null -w "%{http_code}" https://<site>.wp.crom.me/` → HTTP 200.

**C2 — Título público correto**: `curl -s https://<site>.wp.crom.me/ | grep -o "<title>[^<]*</title>"` → título = nome da empresa do `projeto.json` (sem prefixo "– WordPress", sem nome de outra empresa).

**C3 — Home renderiza conteúdo real**: o HTML da home contém texto do nicho (≥1 trecho do conteúdo da página inicial publicada, sem tags) e não contém "Hello world!", "Página de exemplo" nem "lorem".

**C4 — Links internos das páginas essenciais**: os links da home para Início/Sobre funcionam (HTTP 200) — extrair hrefs dos menus e testar até 5.

**C5 — Sem conteúdo duplicado publicado**: ids/títulos duplicados em `pages` e `posts` publicados (mesmo título publicado 2×) = FAIL.

**C6 — Imagens e mídia**: se houver `<img>` na home, as URLs respondem 200 (testar até 3). Ausência de imagens NÃO é FAIL (registra como melhoria).

**C7 — Rascunhos órfãos antigos**: rascunhos cuja data é anterior ao último publish e não fazem parte de fila editorial ativa = FAIL (candidatos a limpeza pelo corretor).

## Relatório

Gravar em `registries/documentos/PARECER-AUDITORIA-03-<data>.md`. Última linha: `VEREDITO: PASS|FAIL — <n> PASS, <n> FAIL — parecer: <caminho>`.
