# 01. Contexto Original e O Que Foi Feito

Este documento detalha o ponto de partida, os sintomas reportados pelo usuário e cada intervenção realizada no sistema.

---

## 1. Problemas Reportados pelo Usuário

O usuário relatou três falhas centrais na interface e na documentação:

### Problema A: Ícones Ausentes na Barra Superior do Secretário
- **Sintoma**: Ao acessar o Secretário via URL com parâmetro de sessão (`http://192.168.18.15:4100/secretario?sessao=ses_...`), a barra superior ficava sem ícones de ação e navegação.
- **Causa Raiz**: O componente [Secretario.tsx](file:///home/j/Documentos/GitHub/crom-worker-opencode/src/web/views/Secretario.tsx) renderizava elementos de navegação que não possuíam SVGs consistentes nem badges reativos quando aberto diretamente com query param.

### Problema B: O Botão "Abrir App" Forçava a Abertura do Chat Lado a Lado
- **Sintoma**: O usuário queria alternar entre modos de visualização limpos:
  1. Somente o **App** em tela cheia (para interagir com o Mini-App sem distração);
  2. Somente o **Chat** (para conversar com o secretário executivo);
  3. **Ambos** (Split View lado a lado).
- **Comportamento Anterior**: Ao clicar em abrir o app, o chat permanecia forçadamente visível ao lado, sem dar a opção de visualização exclusiva do app.

### Problema C: Falta de Documentação de Mini-Apps e Segredos
- **Sintoma**: Faltavam guias oficiais sobre como criar Mini-Apps locais (`apps/<nome>/index.html`), como configurar segredos via CLI (`oc secret`) e como os Mini-Apps consom segredos com segurança.
- **Causa Raiz**: A documentação parava no tópico 16 e o endpoint `/docs` não servia o documento de Mini-Apps.

---

## 2. Soluções Implementadas

### Solução 1: Seletor de Visualização Triplo no Secretário ([Secretario.tsx](file:///home/j/Documentos/GitHub/crom-worker-opencode/src/web/views/Secretario.tsx))
Implementado estado reativo `modoVisualizacao` com 3 opções explícitas:
- `'app'`: O painel do Mini-App expande para 100% da largura, ocultando o chat.
- `'chat'`: O painel de chat ocupa 100% da largura, ocultando o app.
- `'ambos'`: Divisão proporcional 50%/50% lado a lado (Split View).

Os botões de alternância foram posicionados no cabeçalho com ícones e IDs inequívocos para testes (`#btn-view-app`, `#btn-view-chat`, `#btn-view-ambos`), além de indicadores visuais de estado ativo.

### Solução 2: Correção dos Ícones e Header do Secretário
- Adicionados ícones em formato SVG inline (compatíveis com Solid.js / Preact / React sem dependências externas de fontes pesadas).
- Indicador visual de status da sessão ativa (`#sessao-status-badge`) com detecção automática do ID da sessão na URL.

### Solução 3: Documentação Oficial Completa ([docs/17-mini-apps-e-segredos.md](file:///home/j/Documentos/GitHub/crom-worker-opencode/docs/17-mini-apps-e-segredos.md))
Criado manual exaustivo com:
- **Estrutura de pastas**: Como criar `apps/<nome-do-app>/index.html` e assets associados.
- **Isolamento de Segurança**: Segredos armazenados por workspace em SQLite criptografado.
- **Comandos CLI**: Referência completa para `opencorp secret set/get/list/delete` e `opencorp app list/open`.
- **API REST**: Endpoints `/api/workspaces/:ws/apps` e `/api/workspaces/:ws/secrets`.

### Solução 4: Registro da Rota `/docs` no Servidor ([src/server/index.ts](file:///home/j/Documentos/GitHub/crom-worker-opencode/src/server/index.ts))
Adicionado o slug `17-mini-apps-segredos` no servidor backend, permitindo que a interface web e qualquer consumidor REST acesse o manual renderizado em HTML/Markdown.
