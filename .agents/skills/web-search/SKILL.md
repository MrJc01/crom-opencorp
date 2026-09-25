---
name: web-search
description: Permite aos agentes buscar documentações públicas, dados de APIs e notícias em fontes externas.
allowed-tools: [web_search, fetch, curl]
category: Pesquisa
---

# Web Search Skill

Esta skill fornece diretrizes e instruções operacionais para realização de buscas na web e coleta de dados externos.

## Princípios de Pesquisa
1. **Fontes Oficiais**: Priorize documentações oficiais, APIs primárias e repositórios confiáveis.
2. **Filtragem e Limpeza**: Extraia apenas o texto relevante e limpe artefatos de HTML ou scripts.
3. **Resiliência**: Trate erros 429 (rate limit) e timeouts com backoff exponencial ou fontes alternativas.
4. **Sem Alucinação**: Se uma informação não for encontrada na busca, informe claramente a ausência de dados.

## Boas Práticas
- Utilize termos de busca específicos e em inglês quando pesquisar documentação técnica.
- Respeite termos de uso e robots.txt das plataformas consultadas.
