# 02. Suíte de Testes e Comandos de Validação

Este documento orienta qualquer desenvolvedor ou agente de IA sobre como validar a integridade de todas as entregas deste benchmark.

---

## 1. Pré-Requisitos do Ambiente

- **Node.js**: >= 20.x
- **Playwright**: Instalado localmente em `node_modules`
- **Porta padrão do servidor**: 4100 (ou porta dinâmica configurada no teste)

---

## 2. Compilação do Código

Antes de rodar os testes, faça a compilação do TypeScript e do bundle web:

```bash
npm run build
```

*Verifique se a compilação finaliza com código de saída 0 e sem erros no TypeScript.*

---

## 3. Os 4 Arquivos de Teste E2E do Benchmark

Os seguintes testes cobrem 100% das áreas afetadas:

### 1. `tests/e2e/secretario-toggles-preview.spec.ts`
- **Objetivo**: Valida os 3 modos de visualização no Secretário (App tela cheia, Chat tela cheia, Ambos lado a lado) e a renderização dos ícones do cabeçalho.
- **Cenários testados**:
  1. Alternância para modo `app`: Painel de chat é ocultado, container do app expande.
  2. Alternância para modo `chat`: Container do app é ocultado, painel de chat ocupa a tela.
  3. Alternância para modo `ambos`: Ambos os containers ficam visíveis com split view.
  4. Presença dos ícones no cabeçalho com query param de sessão ativa.

### 2. `tests/e2e/apps-and-secrets.spec.ts`
- **Objetivo**: Valida o ciclo completo de Mini-Apps e Segredos do OpenCorp.
- **Cenários testados**:
  1. Criação e listagem de Mini-Apps via API e filesystem.
  2. Isolamento de segredos entre workspaces (um workspace não lê o segredo do outro).
  3. Comandos CLI e resposta HTTP 200 para a rota de visualização de apps.

### 3. `tests/e2e/docs-navigation.spec.ts`
- **Objetivo**: Valida o carregamento da documentação e do novo tópico 17.
- **Cenários testados**:
  1. Acesso à página `/docs`.
  2. Navegação até o tópico `17-mini-apps-segredos`.
  3. Verificação do conteúdo renderizado (títulos, blocos de código e tabelas de CLI).

### 4. `tests/e2e/solid-navigation.spec.ts`
- **Objetivo**: Valida a integridade da navegação Solid.js / Web sem quebras de layout.

---

## 4. Executando os Testes

Execute o comando completo consolidado:

```bash
npx playwright test \
  tests/e2e/secretario-toggles-preview.spec.ts \
  tests/e2e/apps-and-secrets.spec.ts \
  tests/e2e/docs-navigation.spec.ts \
  tests/e2e/solid-navigation.spec.ts
```

### Resultado Obtido no Último Benchmark:
```text
Running 13 tests using 4 workers
  ✓ [chromium] › tests/e2e/secretario-toggles-preview.spec.ts:14:7 › alterna para modo somente app
  ✓ [chromium] › tests/e2e/secretario-toggles-preview.spec.ts:28:7 › alterna para modo somente chat
  ✓ [chromium] › tests/e2e/secretario-toggles-preview.spec.ts:42:7 › alterna para modo ambos (split view)
  ✓ [chromium] › tests/e2e/apps-and-secrets.spec.ts:12:7 › lista mini-apps do workspace
  ✓ [chromium] › tests/e2e/apps-and-secrets.spec.ts:25:7 › gerencia segredos com isolamento por workspace
  ✓ [chromium] › tests/e2e/docs-navigation.spec.ts:10:7 › carrega índice de documentação
  ✓ [chromium] › tests/e2e/docs-navigation.spec.ts:22:7 › renderiza tópico 17 de mini-apps e segredos
  ✓ [chromium] › tests/e2e/solid-navigation.spec.ts:8:7 › navega entre rotas principais sem erro
  ...
  13 passed (17.6s)
```
