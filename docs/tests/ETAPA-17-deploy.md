# Spec de Teste Cego — ETAPA 17: Deploy e distribuição

**Setup:** docker disponível? Se `docker --version` falhar, execute os cenários "host" e marque os de container como SKIP com motivo. `OPENCORP_HOME` isolado.

## Cenários (host)

### 1. Pacote npm
- Comandos: `npm pack` na raiz (ou conforme doc) → instalação global local: `npm i -g ./opencorp-*.tgz` → `opencorp --version` (bin global)
- Esperado: versão correta; desinstale depois (`npm rm -g opencorp`) para não poluir.

### 2. Bootstrap em ambiente limpo
- Comandos: com `OPENCORP_HOME=/tmp/opencorp-deploy-e17` (limpo): `opencorp init` (se existir) → `opencorp doctor`
- Esperado: init prepara o ambiente; doctor verde na home nova.

## Cenários (container) — SKIP se sem docker

### 3. Build da imagem
- Comando: `docker build -t opencorp-test .` (ou docker compose build)
- Esperado: build multi-stage conclui sem erro.

### 4. Smoke no container
- Comandos: `docker run --rm opencorp-test opencorp --version` e `... opencorp doctor`
- Esperado: versão correta; doctor roda (alertas de opencode ausente no container são aceitáveis SE o compose instalar/mona o opencode — anote o comportamento).

### 5. docker-compose up
- Comando: `docker compose up -d` → `curl` no server dentro do mapeamento de porta
- Esperado: sobe com volumes para ~/.opencorp e workspaces; API responde; `docker compose down` limpa.

## Cenários (release)

### 6. Release notes
- Comando: verifique que `docs/release-v*.md` existe e lista funcionalidades + limitações conhecidas
- Esperado: presente e coerente com o que foi implementado (cite 3 itens presentes e 1 limitação documentada).

### 7. Tag
- Comando: `git tag -l`
- Esperado: tag de release presente (ex.: v0.1.0) apontando para o commit final.

## Relatório
Formato da doc 09. SKIPs documentados com motivo. VEREDITO em uma linha.
