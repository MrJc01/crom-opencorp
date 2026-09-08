# 03. Arquitetura Técnica e Código Modificado

Este documento documenta os componentes de software alterados e a arquitetura resultante.

---

## 1. Mapeamento de Arquivos Modificados

```
crom-worker-opencode/
├── docs/
│   ├── 06-painel-configuracoes.md       (Atualizado: tabela de views com Secrets e Apps)
│   ├── 08-cli-referencia.md             (Atualizado: comandos oc secret e oc app)
│   └── 17-mini-apps-e-segredos.md       (NOVO: manual oficial de Mini-Apps e Segredos)
├── src/
│   ├── server/
│   │   └── index.ts                     (Atualizado: rota /docs com slug 17-mini-apps-segredos)
│   └── web/
│       └── views/
│           └── Secretario.tsx           (Atualizado: seletor triplo de visualização e ícones)
└── tests/
    └── e2e/
        ├── apps-and-secrets.spec.ts     (Testes de integração de Apps e Secrets)
        ├── docs-navigation.spec.ts      (Testes de navegação do tópico 17)
        ├── secretario-toggles-preview.spec.ts (Testes dos 3 modos de visualização)
        └── solid-navigation.spec.ts     (Testes de integridade da UI)
```

---

## 2. Detalhes de Implementação

### 2.1. Lógica dos Modos de Visualização ([Secretario.tsx](file:///home/j/Documentos/GitHub/crom-worker-opencode/src/web/views/Secretario.tsx))

```typescript
// Estado reativo do modo de visualização
type ModoVisualizacao = 'app' | 'chat' | 'ambos';
const [modoVisualizacao, setModoVisualizacao] = createSignal<ModoVisualizacao>('ambos');

// Renderização condicional dos containers:
// 1. Container do Mini-App
<div class={`app-preview-container ${
  modoVisualizacao() === 'app' ? 'w-full block' :
  modoVisualizacao() === 'chat' ? 'hidden' : 'w-1/2 block'
}`}>
  <iframe id="app-frame" src={appUrl()} class="w-full h-full border-none" />
</div>

// 2. Container do Chat
<div class={`chat-container ${
  modoVisualizacao() === 'chat' ? 'w-full block' :
  modoVisualizacao() === 'app' ? 'hidden' : 'w-1/2 block'
}`}>
  <ChatMessages />
  <ChatInput />
</div>
```

### 2.2. Servidor de Documentação ([src/server/index.ts](file:///home/j/Documentos/GitHub/crom-worker-opencode/src/server/index.ts))

O endpoint de documentação foi estendido para incluir o mapeamento estático:

```typescript
const DOCS_SLUGS: Record<string, string> = {
  // ... tópicos anteriores (01 a 16)
  "17-mini-apps-segredos": "17-mini-apps-e-segredos.md",
};
```

---

## 3. Contratos de API REST Testados

### 3.1. Mini-Apps
- **`GET /api/workspaces/:ws/apps`**: Retorna a lista de mini-apps disponíveis na pasta `apps/` do workspace.
- **`GET /apps/:ws/:app/index.html`**: Serve o arquivo HTML do mini-app com cabeçalhos de segurança adequados para `<iframe>`.

### 3.2. Segredos (Secrets)
- **`GET /api/workspaces/:ws/secrets`**: Retorna chaves mascaradas cadastradas para o workspace.
- **`POST /api/workspaces/:ws/secrets`**: Cadastra ou atualiza um segredo criptografado.
- **`DELETE /api/workspaces/:ws/secrets/:chave`**: Remove o segredo especificado.
