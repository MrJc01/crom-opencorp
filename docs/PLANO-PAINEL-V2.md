# PLANO — PAINEL vNext (v0.7 "Painel Completo")

> Origem: pedido do dono (28 itens), registrado na íntegra e organizado por domínio.
> Método: inventário do código real (subagentes de exploração frontend + core) + especialistas simulados + estudo do Preline.
> Data: 2026-09-01 · Estado anterior: v0.6.0 (PLANO-WEB-CRUD 100% [x]).

---

## 1. Registro do pedido (voz do usuário — nada perdido)

### A. Apps & Secrets
| ID | Pedido |
|----|--------|
| P-01 | Página para configurar apps, salvando no **secrets** |
| P-02 | Informações de uma **VPS** |
| P-03 | **Senha do app WordPress** e onde ele roda |
| P-04 | **MercadoPago keys** |
| P-05 | Outras ferramentas que são recursos para o opencorp |
| P-06 | **Cartão de crédito** — com "Atenção: não testado corretamente ainda" |
| P-07 | Outras customizações e informações importantes |

### B. Workspace estilo VS Code
| ID | Pedido |
|----|--------|
| P-08 | Página que lista **todo o workspace e pastas, estilo VS Code** |
| P-09 | 3 modos de ver: **editor**, **preview (padrão)**, **lado a lado** (ex.: .md) |
| P-10 | Na mesma página, **tabs de terminais** |

### C. Agentes
| ID | Pedido |
|----|--------|
| P-12 | Página para **listar todos os agentes, habilitar/desabilitar, editar**; mais controle; alguns **ativados por padrão**, outros desativados; **catálogo diverso** para diversas empresas |

### D. Layout & Navegação
| ID | Pedido |
|----|--------|
| P-13 | **Remover Reuniões do navbar** lateral esquerdo |
| P-14 | Desktop: **opção de esconder o navbar** |
| P-15 | Tasks: **overflow scroll por coluna** (backlog/fazendo/bloqueado/feito) |
| P-16 | Navbar com **scroll feio → invisível**; seguir padrões; **main central** padronizado para todas as páginas |
| P-17 | **Página inicial**: listar informações importantes + section para **enviar comando e iniciar conversa no Secretário** |

### E. Secretário / Chat
| ID | Pedido |
|----|--------|
| P-18 | Botão no Secretário que abre **chat lateral direito** (desktop) |
| P-19 | **Botão floating** para abrir esse chat; no mobile, **tela cheia** |
| P-20 | **/** comandos, **@** contexto, **!** terminal no Secretário + **lista de comandos** (opencode + próprios do opencorp) |
| P-21 | **Right-click contextual** (cursor muda, opções: ver, enviar como contexto @, abrir Secretário lateral) + **histórico de input não enviado** persistente (mudança de página/refresh) e **sincronizado** (página Secretário ↔ chat lateral) |
| P-22 | **@ clicável** (além do padrão) |
| P-23 | Página do Secretário **estilo ChatGPT/opencode web** |

### F. Notificações
| ID | Pedido |
|----|--------|
| P-24 | Página + **sistema de notificações**; **function calls** dos agentes ao finalizar para resumir/informar |

### G. Reuniões v2
| ID | Pedido |
|----|--------|
| P-25 | Chat tipo **grupo**: loop desligável se todos concordarem, **seleção de agentes**, cada um como profissional; reunião funcionando como **Secretário multi-agente**; reunião **automática/agendada como task** |
| P-26 | **Chat em tempo real** da reunião; abrir/encerrar etc. |

### H. Config
| ID | Pedido |
|----|--------|
| P-27 | Config **global × workspace não oculta/mostra corretamente** — corrigir |

### I. Integrações (futuro) & Design
| ID | Pedido |
|----|--------|
| P-11 | **Módulos/plugins posteriores**: WhatsApp, Telegram etc — **analisar a melhor forma** de montar tudo para fácil utilização |
| P-28 | Para o layout, usar um agente para estudar **https://github.com/htmlstreamofficial/preline** |

---

## 2. Inventário do código atual (fundamentação)

### Frontend (src/web)
- **Shell central JÁ existe**: `web-dist/index.html:27-64` (sidebar fixa + `#nav` + main) — HTML canônico mora em web-dist, não em src/web; ícones injetados via `main.ts:44-61`.
- **Roteador por hash**: `router.ts:12-49` (`#/view`, `app/:id`); SSE re-renderiza a view ativa (`main.ts:222-243`, proteção "digitando" :238-240); polling 8s.
- **Navbar**: links estáticos em `index.html:39-53`; scroll `overflow-y-auto` em `#nav` :38; hamburger mobile `main.ts:364-371`. **Sem collapse**.
- **tasks.ts**: kanban com colunas padrão + extras (`tasks.ts:43-55`); `.kanban-cards` já tem overflow-y (`legacy.css:61`); drag-and-drop :104-150.
- **secretario.ts**: feed + composer (`:110-277`), sessões Hoje/Ontem :91-107, streaming cru `api.ts:44-45`, estado sobrevive navegação :126. **Sem / @ ! hoje**.
- **reunioes.ts**: já é **aba do Secretário** (`secretario.ts:114-124`; rota própria redireciona `main.ts:304`).
- **agentes.ts**: CRUD completo (PUT `:147`, criar clone `:169-221`, DELETE c/ 409 :223). **Sem enable/disable**.
- **apps.ts**: mini-apps com widgets read-only (`:12-150`). **Sem secrets/edição**.
- **config.ts**: toggle escopo `:173,185-186,201-209`; mostra ORIGEM por campo :6-8; aba Secrets `:375-403`. **Bug P-27 confirmado**: `api()` injeta `?workspace=<ativo>` em TODA requisição (`web/api.ts:32-38`), então o GET /settings ignora o toggle e sempre mostra a lista mesclada.
- **home.ts**: hub com cards → secrets `:123`, feed de atividade :237, aprovações HITL :260, hub de fluxos :212.
- **CSS**: Tailwind v4 + DaisyUI 5 (`css/app.css:4-12`), tokens dark `:12-20`, legacy.css 454 linhas em migração.

### Core/Server (src/server, src/core)
- **Secrets**: `~/.opencorp/secrets.json` plano, mode 0600 (`server/index.ts:873-910`); GET retorna só nomes; PUT/DELETE. **Sem perfis tipados nem injeção em agentes**.
- **Agentes**: MD com frontmatter por workspace (`.opencorp/agents/<id>.md`, `agent-store.ts:78-96`); PUT /agents/:id aceita role/model/permissions/tools/budgets (`server/index.ts:631-647`). **Sem ativo/enable/disable**.
- **Reuniões**: `meeting-manager.ts:96` (sala com turno/ata, moderador, PARTICIPANTES_PADRAO :20); POST /meetings 202 fire-and-forget (`server/index.ts:1022-1030`); stop só sinaliza, **sem estado consultável em tempo real**.
- **Notificações**: **não existe**. Só EventBus→SSE (`event-bus.ts:9-33`, `/events` :1088-1099). ToolRegistry.executar existe (`tool-registry.ts:254-267`) — ponto de extensão para a function call.
- **Arquivos**: GET /files único endpoint FS (`server/index.ts:1033-1067`, traversal bloqueado :1058-1059). **Sem tree, sem escrita**.
- **Terminal**: **sem endpoint**; whitelist COMANDOS_AGENDA `:48-52` (padrão a reusar).
- **Config**: SettingsStore merge global+workspace com origem (`settings-store.ts:276-307`); PUT /settings coerção de scope (`server/index.ts:862-869`). Bug está no front (acima).
- **Opencode**: daemon + bridge; conversa/stream SSE prontos (`server/index.ts:1658,1766`).
- **WhatsApp/Telegram**: nada em src.

### Preline (estudo — P-28)
- Licença **dual MIT + Fair Use** (exige notice/atribuição); usa **bundle JS próprio** (`data-hs-*`); suporta Tailwind v4; **sem conflito conhecido** com DaisyUI 5 (mas = 2 design systems no mesmo CSS).
- Componentes relevantes: **Collapse** (sidebar), **Overlay** (drawer direito), **TreeView** (file tree), **Tabs** (terminais), **ComboBox** (command palette), **Dropdown** (context menu c/ JS próprio para right-click).
- **Recomendação do especialista**: para painel vanilla TS **copiar padrões/markup, não adotar o bundle completo** (DaisyUI 5 já é o design system). Meio-termo legítimo: cherry-pick de 2-3 plugins headless (HSOverlay/HSTabs/HSDropdown), ou **~150-250 linhas de TS próprio** para drawer/tabs/dropdown.
- Alternativas: **FlyonUI** (mesma base Tailwind v4 + DaisyUI, fit natural), **Flowbite** (MIT, JS vanilla), **Basecoat** (copy-paste styles).

---

## 3. Especialistas (simulação)

**Arquiteto Web** — O shell central já existe; a dívida é o HTML canônico em web-dist e os ~70 handlers em `window` (`main.ts:374-447`). O SSE re-renderiza a view ativa inteira: **chat lateral e drawer precisam de estado fora do ciclo de re-render** (padrão módulo singleton, como `secretario.ts:126` já faz). Drawer/tabs/tree/dropdown devem ser primitivas próprias reutilizáveis — escrever uma vez, usar em: chat lateral, terminais, file tree, context menu, command palette.

**Arquiteto Core** — Gaps reais que exigem backend novo: (1) escrita de arquivos + tree; (2) exec de terminal com whitelist; (3) store de notificações + tool `notificar`; (4) campo de estado no agente; (5) MeetingManager consultável em tempo real (hoje 202 fire-and-forget, stop frágil); (6) perfis de secrets. Reusar: EventBus/SSE, resolverCaminhoWorkspace, COMANDOS_AGENDA, SettingsStore.

**Product Owner** — Sequência por valor/dependência: **chão de fábrica primeiro** (shell, drawer, primitivas) porque 6 pedidos dependem dele; **Secretário v2 + composer** é o coração do produto; **Workspace VS Code** e **Apps/Secrets** e **Catálogo de Agentes** são independentes entre si (paralelizáveis); Reuniões v2 e Notificações têm dependência de core; Config-fix é rápido e desbloqueia confiança na Config; Integrações é análise, não implementação.

**Segurança** — (1) Secrets: **nunca retornar valores** (padrão já correto: GET só nomes); cartão de crédito é dado de altíssimo risco → campo com **banner de atenção permanente**, guardar ofuscado por padrão e considerar só referência/últimos 4; (2) `!` terminal no chat = **superfície de risco máxima** → whitelist estendida + auditoria + desativável por config; (3) escrita de arquivos/tree: reusar `resolverCaminhoWorkspace` (traversal já bloqueado) + size caps; (4) injeção de secrets em agentes: opt-in por agente/permissão, nunca no log/feed.

**UX** — Padrões a copiar do Preline/FlyonUI: sidebar colapsável (ícone-only mode), drawer direito com overlay, tree view com chevrons, tabs no topo do painel, palette ⌘K. Scrollbar invisível via `scrollbar-width: none` + `::-webkit-scrollbar{display:none}` apenas onde existe scroll de rolagem (navbar, colunas kanban, chats) — nunca em conteúdo de leitura. Cursor contextual (`cursor: context-menu`). Mobile: drawer = fullscreen; floating button ≥44px de toque.

---

## 4. Etapas (checklist)

> Ordem = dependência + valor. Cada etapa fecha com build + testes verdes e commits separados.

### Etapa 0 — Fundação: shell central, navbar e primitivas de layout *(P-16, P-13, P14, P-15, P-28)* ✅ 2026-09-01
- [x] 0.1 Decisão de design registrada: copiar padrões Preline (não adotar bundle); primitivas próprias em `src/web/ui/` (drawer, tabs, dropdown, scrollbar-none) — ~150-250 linhas TS *(primitivas.ts: posicaoMenu, ocultarScrollbar, criarControladorDrawer, criarTabs; 7 testes unitários puros)*
- [x] 0.2 Main central padronizado: todas as views dentro do mesmo shell (consolidar HTML canônico web-dist ↔ views) *(shell único já vigente — revisor confirmou; nenhuma view fora do shell)*
- [x] 0.3 Navbar: scrollbar invisível (padrão) em `#nav` e onde houver rolagem *(scrollbar-none no #nav e config-abas; scrollbar-thin nas colunas kanban)*
- [x] 0.4 Collapse do navbar no desktop (toggle ícone-only, estado em localStorage) *(body.sidebar-colapsada ≥769px, chave oc-sidebar-colapsada, e2e de persistência)*
- [x] 0.5 Remover "Reuniões" do navbar (fica acessível como aba do Secretário — já é assim) *(rota #/reunioes mantida; e2e garante ausência no navbar + rota funcionando)*
- [x] 0.6 Tasks: overflow scroll em cada coluna kanban (backlog/fazendo/bloqueado/feito) *(≥1025px colunas com rolagem própria; abaixo, empilhamento natural)*
- **Aceite**: shell único; navbar colapsa e persiste; zero scrollbars "feios". — **Validado por QA + Revisor em 3ª pessoa**: build 0 erros, 472 unitários, e2e completa com falhas idênticas ao baseline documentado (agenda ×5 + chat markdown ×1).

### Etapa 1 — Secretário v2: layout + chat lateral global *(P-23, P-18, P-19, P-21-parte)* ✅ 2026-09-01
- [x] 1.1 Layout estilo ChatGPT/opencode (feed centrado, largura máx, composer fixo, cabeçalho de sessão) *(já vigente desde v0.6 — .oc-feed 760px + composer; mantido e reutilizado pelo lateral)*
- [x] 1.2 Primitiva drawer-direito global (`ui/drawer`) — chat disponível em TODAS as páginas *(chat-lateral.ts + #chat-drawer estático no index.html; sobrevive à navegação; mesma conversa/estado da página via superfícies 'pagina'|'lateral' em secretario.ts)*
- [x] 1.3 Botão no Secretário que abre o chat lateral (desktop) *(#btn-chat-lateral no header do chat)*
- [x] 1.4 Botão floating global; no mobile o drawer abre **tela cheia** *(#fab-chat com z-30, oculto na view Secretário e com drawer aberto; ≤768px width 100vw — e2e valida)*
- [x] 1.5 Estado do input não-enviado: fonte única (módulo singleton + persistência local), **sincronizado** entre página Secretário e drawer; sobrevive navegação e refresh *(src/web/rascunho.ts — oc-chat-rascunho; __chatRascunhoInput sincroniza as duas textareas)*
- **Aceite**: conversar de qualquer página; input nunca se perde; nada duplicado. — e2e novo chat-lateral.spec 4/4 (FAB, sync bidirecional, persistência reload, mobile fullscreen, FAB oculto no Secretário); unitários 472; suite completa = baseline (agenda ×5 + chat markdown ×1); fix de design: superfície lateral só renderiza com drawer aberto (evita duplicação em strict mode).

### Etapa 2 — Composer inteligente: / @ ! *(P-20, P-22)* ✅ 2026-09-01
- [x] 2.1 Parser do composer: `/` comandos, `@` contexto, `!` terminal *(src/web/composer-comandos.ts — parsearComposer puro + 10 testes unitários)*
- [x] 2.2 Palette de comandos (estilo opencode): lista com descrição — comandos próprios do opencorp + passthrough opencode *(src/web/palette.ts — resolve no front via API; desconhecido vai ao LLM)*
- [x] 2.3 `@` contexto: arquivos do workspace (GET /files), agentes, tasks — autocomplete + **menu clicável** *(cap 3+3+3; server stream/conversa aceitam `contexto[]` e mencionam os alvos na mensagem; CONTEÚDO dos arquivos entra na Etapa 3)*
- [x] 2.4 `!` terminal: POST /terminal — mesma whitelist COMANDOS_AGENDA **menos subcomandos operacionais** (serve/web/scheduler/test/daemon), args sanitizados (sem --flags/paths), execFile **sem shell**, timeout 20s SIGKILL, cap 100KB, log de auditoria `[terminal]` *(revisado por especialista de segurança: sem bypass)*
- [x] 2.5 Context menu (right-click) base + cursor contextual: em **task cards** → Ver detalhes / Copiar título / Excluir *(modalConfirm; fecha em Escape/fora/scroll; Etapa 3 liga os itens de arquivo)*
- **Aceite**: digitar `/`/`@`/`!` abre lista navegável; @ clicável; right-click em task oferece ações. — e2e composer.spec 4/4; unitários 482; suite completa = baseline. Notas: Enter na palette só insere (envio é o Enter seguinte); segundo Enter com ! / durante streaming aborta (comportamento herdado do stop).

### Etapa 3 — Workspace estilo VS Code *(P-08, P-09, P-10)* ✅ 2026-09-01
- [x] 3.1 Backend: GET /files/tree (recursivo, ignora node_modules/.git/dist, cap 800 nós, profundidade ≤6, symlinks NÃO seguidos) + GET arquivo (com realpath anti-symlink-para-fora) + **PUT /files** (resolverCaminhoWorkspace, arquivo deve existir, cap 1MB — corpo cortado no stream, writeFileAtomic)
- [x] 3.2 UI: file tree lateral (chevrons, ícones) + tabs de arquivos abertos (criarTabs) + view "Workspace" no navbar (grupo Código)
- [x] 3.3 Modos de ver: **editor** · **preview (padrão p/ .md)** · **lado a lado** (.md) — dirty-state ● na tab, Ctrl+S, Salvar via PUT
- [x] 3.4 Tabs de **terminais** na mesma página (até 4, localStorage, histórico ↑↓) — exec via POST /terminal da Etapa 2 (whitelist), log acumulado por tab
- [x] Right-click de arquivo: Abrir · **Enviar como contexto @** (setRascunho + abre chat lateral) · Copiar caminho *(fecha o item de arquivo do P-21)*
- **Aceite**: navegar/editar/salvar arquivos; md com preview; terminais funcionando. — e2e workspace.spec 5/5; revisão de segurança: realpath no GET, cap de corpo no lerCorpo (30MB default / 1.5MB no PUT), duplo-decode de path removido; unitários 482; suite completa = baseline.

### Etapa 4 — Apps & Secrets *(P-01…P-07)*
- [ ] 4.1 Core: perfis de credencial tipados (`vps`, `wordpress`, `mercadopago`, `cartao`, `custom`) com schema por tipo no secrets.json (0600, valores nunca retornados)
- [ ] 4.2 Página Apps: aba "Configurar apps" com form por perfil (VPS host/user/senha/chave; WP url+senha+onde roda; MP public/secret; cartão com **banner "Atenção — não testado"**; custom livres)
- [ ] 4.3 Injeção opt-in nas sessões de agentes (por agente/permissão; nunca em logs/feed)
- [ ] 4.4 Integrar mini-apps existentes na mesma página (widgets + config lado a lado)
- **Aceite**: salvar/recuperar credenciais sem exposição; cartão sempre com aviso visível.

### Etapa 5 — Catálogo de Agentes *(P-12)*
- [ ] 5.1 Core: campo de estado no schema do agente (ativo/desativado) + defaults "ativados por padrão" por empresa no template do workspace
- [ ] 5.2 UI: lista completa com toggle, editar, criar; seções "Ativos" × "Catálogo disponível"
- [ ] 5.3 Semear catálogo diverso (vendas, marketing, financeiro, suporte, jurídico, ops…)
- [ ] 5.4 Endpoints: PUT aceita estado; agentes desativados ficam fora de fanouts/flows/runtimes por padrão (mas visíveis na página)
- **Aceite**: ligar/desligar agente com 1 clique; catálogo semeado e editável.

### Etapa 6 — Reuniões v2 *(P-25, P-26)*
- [ ] 6.1 Core: sala de reunião com estado consultável (GET /meetings/:id → turno atual, mensagens, participantes) e encerramento real do processo
- [ ] 6.2 Chat de grupo: seleção de participantes, **loop com consenso** (todos concordam → encerra; moderador sempre pode encerrar), cada agente responde como profissional
- [ ] 6.3 **Agendável**: job de agenda tipo "executar reunião" (reusa COMANDOS_AGENDA/scheduler) — reunião automática
- [ ] 6.4 UI: visualização em **tempo real** (SSE), abrir/encerrar/sair; permanece aba do Secretário (fora do navbar)
- **Aceite**: acompanhar reunião ao vivo, encerrável, agendável como task.

### Etapa 7 — Notificações *(P-24)*
- [ ] 7.1 Core: store de notificações por workspace + GET/POST /notifications + marcar lida
- [ ] 7.2 Tool `notificar` no ToolRegistry (function call dos agentes ao finalizar, com resumo) + guidance nos prompts dos agentes
- [ ] 7.3 Página de notificações: feed com lidas/não lidas + badge no navbar + push via SSE existente
- **Aceite**: agente finaliza → notificação aparece na página e no badge.

### Etapa 8 — Config global × workspace fix *(P-27)*
- [ ] 8.1 Front: GET /settings respeita o escopo do toggle (não deixar `api()` injetar workspace no settings) — bug confirmado em `web/api.ts:32-38`
- [ ] 8.2 Badges de origem coerentes com o escopo; PUT coerente; teste de regressão e2e
- **Aceite**: toggle oculta/mostra e edita no escopo correto.

### Etapa 9 — Home dashboard *(P-17)*
- [ ] 9.1 Seção de infos importantes (tasks vencidas, custos do dia, saúde daemon/scheduler, fluxos ativos, últimas notificações)
- [ ] 9.2 Barra de comando que **inicia conversa no Secretário** (reusa composer / @ ! da Etapa 2)
- **Aceite**: home abre com resumo acionável; comando enviado da home cai na conversa.

### Etapa 10 — Integrações: análise e design *(P-11)*
- [ ] 10.1 Doc de análise: WhatsApp/Telegram/e-mail — comparar (a) webhook inbound/outbound do server, (b) agente-bridge com session, (c) plugin do opencode; recomendar arquitetura de "canais" com permissões e custo
- [ ] 10.2 ADR + esqueleto de interface de canal (sem implementação de providers nesta fase)
- **Aceite**: decisão documentada com recomendação clara para próxima fase.

### Etapa 11 — QA, docs e segurança transversal
- [ ] 11.1 e2e para novos fluxos (drawer, composer, workspace, apps/secrets, agentes toggle, reunião v2, notificações, config fix)
- [ ] 11.2 Revisão de segurança: secrets sem retorno, `!` whitelist+auditoria, path-traversal em escrita/tree, cartão ofuscado
- [ ] 11.3 docs/06 + AJUDAS das novas views; CHANGELOG/versão

---

## 5. Riscos e notas
- **SSE × estado de chat**: re-render de view não pode matar o drawer/streaming — primitivas de estado singleton (padrão já provado em `secretario.ts:126`).
- **`!` terminal**: maior risco de segurança do plano — whitelist fechada, audit log, e kill-switch por config.
- **Cartão de crédito**: manter mínimo dado possível; considerar guarda extra (nunca exibir integral, apagar em memória após uso).
- **web-dist/index.html é o HTML canônico**: mudanças de shell precisam tocar web-dist + build Tailwind (`@source` aponta para lá).
- **Reuniões hoje são fire-and-forget**: Etapa 6 muda o contrato (estado consultável) — manter compat com `POST /meetings` 202.
- **PUT vs PATCH de agentes**: padronizar para PUT com objeto parcial mesclado (como já aceita) — evitar PATCH duplo.

## 6. Métricas de sucesso
- 28/28 pedidos endereçados (implementados ou com ADR, no caso de P-11).
- Zero segredos expostos em qualquer GET; zero execução fora de whitelist.
- Todas as páginas no shell único; navegação sem scrollbars visíveis.
- Suite unitária + e2e verdes com cobertura dos novos fluxos.
