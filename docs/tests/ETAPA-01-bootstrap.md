# Spec de Teste Cego — ETAPA 01: Bootstrap & Doctor

**Pré-requisitos:** nenhum (primeiro teste).
**Setup:** no diretório raiz do projeto, garanta que `npm run build` já foi executado (se o binário não existir, reporte FAIL imediato em todos os cenários).

## Cenários

### 1. Binário responde
- Comando: `node bin/opencorp.mjs --version`
- Esperado: imprime uma versão no formato `X.Y.Z` (ou `vX.Y.Z`), exit 0.

### 2. Ajuda lista os grupos de comandos
- Comando: `node bin/opencorp.mjs --help`
- Esperado: exit 0 e a saída menciona (pelo menos) estes grupos: `settings`, `workspace`, `agent`, `session`, `run`, `registry`, `template`, `subcorp`, `test`, `doctor`.

### 3. Comando não registrado dá erro amigável
- Comando: `node bin/opencorp.mjs foobarbaz`
- Esperado: exit != 0 e mensagem de erro clara (não stack trace bruta).

### 4. Doctor diagnostica
- Comando: `node bin/opencorp.mjs doctor`
- Esperado: exit 0 e a saída informa o resultado de pelo menos: versão do Node, presença do `opencode` no PATH, validade das configurações globais, permissão de escrita em `~/.opencorp/`.
- Sub-caso: se `opencode` não existir no PATH, o doctor deve indicar isso claramente (não pode fingir que está ok).

### 5. Ajuda de subcomando
- Comando: `node bin/opencorp.mjs doctor --help`
- Esperado: exit 0 e descrição de uso do doctor.

## Relatório

Grave no caminho indicado na ordem, formato da doc 09. Veredito final em uma linha.
