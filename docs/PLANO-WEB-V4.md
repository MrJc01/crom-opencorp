# PLANO WEB V4 — opencorp (handoff completo para novo agente)

> **Contexto**: este documento carrega tudo que um agente precisa para executar a evolução do painel web do opencorp. Foi produzido por análise real do código, testes executados, pesquisa de UX 2026 e validação com o usuário (PT-BR).
> **Projeto**: `/home/j/Documentos/GitHub/crom-worker-opencode` · CLI-first · Node 22 · TypeScript · sem framework frontend (TS módular + Tailwind CDN + CSS inline em `web-dist/index.html`)
> **Usuário fala PT-BR**. Nunca commitar sem pedido. Rebuild obrigatório após mudanças: `npm run build` (bin roda `dist/`, web roda `web-dist/app` via `tsc -p tsconfig.web.json`).

---

## 1. CONTEXTO DO PROJETO (o que você precisa saber)

### 1.1 Arquitetura em uma frase
**opencorp** = sistema operacional de empresas autônomas sobre o OpenCode CLI. Cada workspace (empresa) tem agentes (.md com frontmatter), task board (SQLite), registries (memória em arquivos), budget, scheduler, flows (linhas de pensamento executáveis estilo n8n) e um site WordPress gerido por agentes.

### 1.2 Mapa do frontend atual
```
web-dist/index.html      ← HTML estático + TODO o CSS inline (~330 linhas) + Tailwind CDN
web-dist/app/*.js        ← compilado de src/web/*.ts (tsc -p tsconfig.web.json)
src/web/
  main.ts     boot, login, SSE, router, expõe globais (onclick inline)
  router.ts   hash router (#/view), abre/fecha drawer
  state.ts    token, wsAtivo, viewAtual, eventSource
  api.ts      api() com auth Bearer, q(), toast(), icone(), escapeHtml()
  modal.ts    modalPrompt/modalConfirm (substitui prompt/confirm nativos)
  help.ts     [NOVO] sistema de ajuda "?" — AJUDAS: dicionário central de explicações
  views/      home, tasks, agenda, teams, reunioes, historico, secretario, fluxos, apps, app-detail
src/server/index.ts  API REST (51 rotas) + serve web-dist + SSE /events + proxy secretário
```

### 1.3 Endpoints relevantes (o server já tem)
- `/workspaces` GET/POST (POST aceita só `{id}` — wizard precisa de `{id, perfil}`)
- `/agents`, `/agents/:id/run` · `/sessions`, `/sessions/:id/log`
- `/tasks` + chat/move via rotas task · `/approvals` (+approve/reject) · `/budget/status|set`
- `/settings` GET/PUT + `/settings/:chave` (existe! **0 usos nas views**)
- `/secrets` GET (nomes mascarados), `/secrets/:chave` PUT/DELETE [SEMEADO — terminar: o handler PUT tem um bug: `await registros.eventoAuditoria?.call?.(null);` é inválido, REMOVER essa linha]
- `/secretario/status|start|stop|sessoes|sessoes/:id/mensagens|conversa` (proxy opencode serve; **síncrono** — sem streaming)
- `/flows`, `/flows/:id/run` · `/meetings` · `/hooks` · `/apps` · `/registries/:cat[/:id]` · `/events` (SSE)

### 1.4 O que já está pronto (não refazer)
- Mobile: fixes do banner/hamburger, drawer fecha ao navegar, secretário com lista deslizante (`web-dist/index.html` seção "MOBILE (auditoria)")
- `help.ts` criado + CSS do popup "?" já injetado no index.html + `exporAjuda()` já chamado no boot
- Server: rotas de secrets semeadas (com o bug anotado acima)
- Motor de flows v2 com nós: manual/agente/saida/condicao/webhook/**task_create/registro/decisao**
- 4 linhas de pensamento instaladas nos 4 workspaces: `ceo-analise-board`, `melhorias-continuas`, `ideias-conteudo`, `decisao-opcoes`
- `scripts/verificar-site.cjs` — verificador determinístico do site (PASS/FAIL por cenário)
- Anti-stale: menções/triggers spawnam detached (`src/core/spawn-detached.ts`); supervisor limpa locks/zombies a cada tick
- 12 jobs agendados (aud01/02/03 às 06:00/06:25/06:50 × 4 empresas); scheduler + 4 supervisores rodando
- Modelos: plano **OpenCode Go** ($10) — agentes em `opencode-go/glm-5.3-flash`, rotação de testes glm-5.3-flash→mimo-v2.5→minimax-m3 (minimax-m3 = melhor análise)
- Testes: 423 unit (vitest) + 38 e2e (playwright) — TODOS verdes. Playwright sobe server na 4399 com token `test-e2e` (`playwright.config.ts`)

### 1.5 Como testar localmente
```bash
npm run build
OPENCORP_HOME=/home/j node bin/opencorp.mjs serve --port 4300 --token <token de ~/.opencorp/secrets.json>
# e2e isolado (npx playwright test usa isso sozinho):
OPENCORP_HOME=/tmp/x node bin/opencorp.mjs serve --port 4399 --token test-e2e --foreground
# screenshots mobile: playwright chromium viewport 390x844 isMobile hasTouch
```

---

## 2. DIAGNÓSTICO (audit feito — F1)

| # | Problema | Evidência |
|---|---|---|
| 1 | **Configurações não existem na web** | `/settings` existe no server; 0 usos nas views. CLI tem `settings-tui.ts` com SECOES (Modelos/Orçamento/Segurança/Workspaces…) — espelhar isso |
| 2 | **Secrets invisíveis** | `~/.opencorp/secrets.json` tem 8 chaves (api_token, wp_*_user/pass); web não lista; NUNCA exibir valores |
| 3 | **Wizard de workspace = 1 prompt de id** | `novoWorkspace()` em main.ts usa modalPrompt; `POST /workspaces` aceita só `{id}`; `WorkspaceManager.criar(id, {template})` aceita template mas a web não passa; perfil editorial (`projeto.json`: nicho, público, tom, tópicos) não é perguntado |
| 4 | **Chat secretário básico** | Sem streaming, sem stop, sem copy, sem markdown rico (só `\n`→`<br>` e `` `code` ``), sem sugestões, sem busca/agrupamento no histórico. Contrato: `/secretario/conversa {mensagem, sessao_id?, agente: secretario|secretario-exec}` é SÍNCRONO (poll) |
| 5 | **Estados inconsistentes** | Cada view inventa empty/error; helpers `estadoVazio/estadoErro` não existem |
| 6 | **Nada explica conceitos** | 0 "?" antes de help.ts; usuários não sabem o que é workspace/level-1/HITL/flows |
| 7 | **Quebras visuais** | historico overflow-x 427>390 (fixado parcialmente), badges truncados, hero-actions wrap feio, contraste cinza #6b7280 no limite WCAG |
| 8 | **Home não é um hub** | Só KPIs+feed; não mostra linhas de pensamento, atalhos de sistema, saúde dos daemons, nem leva para config/secrets/ferramentas |

## 3. PESQUISA (referências que orientam o design — F2, resumo)

**Chat UX 2026** (Lazarev.agency 16 patterns; ai-tldr.dev chatbot UX; Jason Laster chat-ui; Brainy "prompt surfaces"):
- Impacto imediato: **streaming + botão STOP visível** (stop substitui o enviar no mesmo slot), typing indicator, copy button por mensagem, retry/regenerate
- Prompt surface = 8 partes: empty-state com sugestões, sugestões inline (chips), model/mode picker com tooltip, composer (Enter envia/Shift+Enter nova linha), stop, streaming honesto, revisão, histórico com busca
- Histórico: agrupar Hoje/Ontem/7 dias, auto-título ~50 chars, busca acima de ~20 conversas
- Erros: classificar + mensagem humana + botão retry; nunca tela branca
- Acessibilidade: aria-live="polite" no stream, foco visível, ESC fecha modais

**Dashboards (Linear/Vercel/Clerk)**: header com contexto do recurso ativo (workspace atual sempre visível), zonas com títulos pequenos uppercase (eyebrow), KPIs clicáveis que navegam, health dots.

**Wizards (Stripe)**: passos numerados com revisão final; validar por passo; nunca perder o que foi digitado ao voltar.

## 4. PRINCÍPIOS DE DESIGN (obedecer em TODA tela nova)

1. Todo conceito tem "?" com texto do dicionário `AJUDAS` em `src/web/help.ts`
2. Todo dado mostrado tem **origem** (badge global/workspace/default)
3. Todo view tem 3 estados: carregando/vazio/erro (helpers únicos, ver E3.2)
4. Ação destrutiva = modal de confirmação (nunca confirm()) 
5. Mobile-first: 0 overflow-x em 390px, touch targets ≥44px, testar com Playwright
6. Enter submete, Shift+Enter quebra linha, ESC fecha modal/popup
7. Chat: streaming + stop no slot do enviar + copy por mensagem
8. Cores: accent #2563eb, fundo #0a0a0a, card #171717, texto #e5e5e5/muted #a3a3a3 (checar contraste AA)
9. Nada de framework novo — TS módular + globais para onclick inline (padrão atual)
10. Toda rota nova no server precisa entrar em `rotas` (doc /doc) e seguir auth Bearer

---

## 5. ETAPAS DE EXECUÇÃO (ordem com dependências)

```
E3 (design system) ─┬→ E4 (config/secrets) ─┐
E5 (fixes visuais) ─┘                       ├→ E8 (testes) → E9 (relatório)
E6 (chat) ──────────────────────────────────┤
E7 (home + wizard; depende E3+E4) ──────────┘
```
Estimativa: ~9h. Cada etapa termina com build verde + screenshots.

### E3 — Design system mínimo (~1h)
1. `src/web/estado.ts` [NOVO]: `estadoCarregando(msg)`, `estadoVazio(icone, titulo, texto, acaoHtml?)`, `estadoErro(msg, retryFn?)` retornam HTML string padronizado (reusar classes .empty-state existentes)
2. Aplicar os 3 estados em todas as views (substituir código ad-hoc)
3. Aplicar `ajuda(chave)` (de `help.ts`) em: itens da sidebar (workspace, tasks, agenda, teams, reunioes, historico, secretario, fluxos, apps), KPIs da home, colunas do kanban, forms da agenda, badges de permissão (level-1/2/3), aba secrets, wizard
4. Toast com severidade (`toast(msg, 'ok'|'erro'|'aviso')`) — conferir api.ts
5. **Validação**: build + cada tela com estado vazio visível (usar workspace de teste vazio) + "?" abre popup

### E4 — Página Configurações + Secrets (~2h)
1. Nav: item "Config" (ícone engrenagem) → view `#config` (nova section no index.html + renderConfig em `src/web/views/config.ts`)
2. Estrutura por abas (espelho do `settings-tui.ts` SECOES): **Modelos · Orçamento · Segurança · Workspace · Testes · Scheduler · Secrets · Ferramentas**
3. Cada chave: label humano + input tipado (bool→toggle, número→input number, lista→textarea 1 por linha, string→input) + badge de origem (global/workspace/default — vem do GET /settings que já retorna `origem`) + botão salvar por campo → `PUT /settings {chave, valor, scope}`
4. Toggle escopo global/workspace por aba (workspace aplica no ws ativo)
5. **Secrets**: lista `GET /secrets` (nomes + definido), input de novo segredo (nome+valor) → `PUT /secrets/:nome`, remover com modal → `DELETE`. Valores NUNCA exibidos. Botões-templates: "Credencial WordPress" (gera `wp_<site>_user/_pass`), "API Key genérica"
6. **Ferramentas**: listar `.opencorp/tools/*.json` (server precisa de rota nova `GET /tools` — ler dir no server, seguir padrão das rotas existentes; SEM executar na v1, só listar spec)
7. **ANTES DE TUDO**: remover a linha bugada `await registros.eventoAuditoria?.call?.(null);` no handler de secrets do server
8. **Validação**: mudar `budget.daily_usd` pela UI e ver no `settings list`; criar secret `teste_x` e ver nome listado (valor não); e2e cobre os dois fluxos

### E5 — Fixes visuais (~1h30)
1. Gerar screenshots (mobile 390×844 + desktop 1280×800) das 10 views com o server isolado → anotar quebras
2. Corrigir: overflow historico (se persistir), hero-actions (grid 2 col mobile), badges (min-width semântico), forms agenda (labels acima em mobile), contraste muted #a3a3a3→ok
3. Header mobile com **workspace atual sempre visível** (chip no topo, clicável → abre sidebar)
4. **Validação**: 0 overflow-x em 390px nas 10 views (script Playwright já existe no histórico: avaliar scrollWidth>clientWidth por view)

### E6 — Chat secretário estilo opencode (~2h30)
1. Server: `/secretario/conversa` ganha modo streaming — opencode serve expõe API; opção simples: manter POST síncrono mas adicionar `GET /secretario/conversa/:msg_id/stream` via SSE usando o eventBus do server (emite "secretario.chunk"). Se streaming real do opencode for complexo, v1 = polling com indicador de progresso + typing dots (decidir por custo/benefício; o usuário aceitou decidir na hora)
2. Layout (`views/secretario.ts` rewrite): sidebar sessões (GET /secretario/sessoes) agrupadas Hoje/Ontem/Anteriores por `updated_at`, input de busca client-side, botão "Nova conversa"; chat à direita com header mostrando agente ativo (select secretario/secretario-exec com tooltip explicando a diferença — usar AJUDAS)
3. Empty state do chat: 4 sugestões-chip: "O que aconteceu hoje?", "Como está o board?", "Rodar linha ceo-analise-board", "Qual meu custo hoje?" — clicar preenche e envia
4. Mensagens: bolhas user direita/assistant esquerda; markdown rico — módulo `md.ts` [NOVO]: negrito, itálico, listas, code fences com botão copy, links; escapeHtml SEMPRE antes
5. Botão copy por mensagem (clipboard + flash ✓); stop: durante requisição o botão enviar vira "Parar" (AbortController; server ignora abort — resposta parcial: v1 apenas desiste de esperar e mostra aviso)
6. Follow-ups: após resposta, chips estáticos genéricos ("Detalhe o 1º ponto", "E o que faço agora?") clicáveis
7. Auto-scroll com "scroll pin" (se usuário scrollou pra cima, não força)
8. **Validação**: conversa real com plano Go (glm-5.3-flash), stop, copy, histórico agrupado; e2e com fake server (já existe fake no e2e do secretário)

### E7 — Home hub + wizard de workspace (~2h30)
**7a. Home (rewrite views/home.ts):**
- Header do hub: workspace atual (chip grande, clicável → sidebar), dot de saúde (verde se scheduler ativo + secretário ok; checar `/secretario/status` e pidfile via `/health` — se precisar, rota nova `/status` agregada)
- Zona "Operação hoje": KPIs existentes (tasks abertas, feitas 7d, taxa ok 24h, custo hoje) — cada KPI com "?" e onclick navega
- Zona "Aprovações": pendentes com botões Aprovar/Rejeitar inline (POST approve/reject) + "?"
- Zona "Linhas de pensamento": as 4 linhas com botão "Rodar agora" → `POST /flows/:id/run {entrada}` (pedir entrada via modal) + link "ver todas" → #fluxos
- Zona "Feed ao vivo": mantém o atual (adicionarFeedItem) + "?" 
- Zona "Sistema": cards Config · Secrets · Ferramentas · Doutor (doctor: rodar `opencorp doctor` no server? v1: link para CLI hint) 
**7b. Server**: estender `POST /workspaces` para `{id, perfil?{empresa,nicho,publico,tom,tom_evitar,topicos[]}}` → após criar, gravar `projeto.json` no ws (seguir schema existente do pulso-diario). Compat: perfil ausente = comportamento atual
**7c. Wizard** (`views/wizard.ts` [NOVO], modal fullscreen 4 passos):
  1. Identidade: nome empresa, id (slug auto do nome, editável, validação kebab-case), nicho (textarea), público, tom (chips sugeridos: "direto", "jornalístico", "técnico", "acessível"), tom_evitar (chips)
  2. Tipo: cards radio — Portal/Blog · Prestador de serviços · E-commerce · Empresa genérica (muda sugestões de tópicos)
  3. Template: select `default` (lista agentes que vêm: executor-padrao, critico-site, corretor-site, editor*, ceo-documentos, auditor, secretario…) + input tópicos editoriais (3 sugeridos por tipo, editável)
  4. Revisão: resumo → "Criar empresa" → POST → setWsAtivo(id) → navegar tasks → toast sucesso com "?" de próximos passos
- Progress bar dos passos, back preserva estado (objeto em memória do módulo)
- **Validação**: criar empresa `wizard-test` end-to-end pela UI; conferir `.opencorp/projeto.json` gravado; deletar workspace de teste depois

### E8 — Testes (~1h)
1. e2e novos arquivos: `config.spec.ts` (get/set budget via UI), `secrets.spec.ts` (add/list/remove), `wizard.spec.ts` (criar workspace completo com fake), `chat.spec.ts` (sugestões visíveis, mensagens render, copy btn), `ajuda.spec.ts` ("?" abre popup em home e config)
2. Rodar suítes completas: `npx vitest run` (423+) e `npx playwright test` (38+)
3. Screenshots antes/depois das 10 views (mobile+desktop) salvos em `/tmp/opencode/web-v4/`
4. Revisão visual: 0 overflow, contraste, "?" em ≥8 lugares

### E9 — Relatório + protocolo (~30 min)
1. Relatório PT-BR: o que mudou por etapa, com evidências (screenshots, rotas, testes)
2. Criar `templates/default/docs/web-checklist.md` — protocolo de padronização para QUALQUER agente que mexa no frontend (as 10 regras da seção 4 + como testar + como rodar e2e) — e adicionar referência ao catálogo FERRAMENTAS.md
3. Commit em blocos lógicos (só se o usuário pedir)

---

## 6. ARMADILHAS CONHECIDAS (não repetir)

1. **bin roda dist/ e web roda web-dist/**: sempre `npm run build` antes de validar; se esquecer, tudo "não funciona"
2. **Tailwind é CDN**: classes dinâmicas novas funcionam (JIT no browser), mas se o CDN cair offline o estilo some — o CSS crítico está inline no index.html (padrão: estilos próprios inline)
3. **globais onclick**: funções chamadas por onclick no HTML precisam estar em `window.*` via `exporGlobais()` (main.ts) ou no módulo da view (`window.__x = ...`)
4. **não usar `document.getElementById('x')!.classList` sem null-check em views dinâmicas** — views re-renderizam e perdem handlers
5. **secretário**: NÃO re-renderizar a view durante conversa (perde estado) — o refresh de 8s já pula `view === 'secretario'` (main.ts iniciarApp)
6. **escapeHtml antes de qualquer interpolação** de dado do server (XSS)
7. **secrets**: JAMAIS retornar valor; só nomes. O auditor (agente) também não deve ler secrets.json (política já no doctor)
8. **cotas**: testes com LLM real gastam plano Go; usar fake do e2e; AI Studio key nova do usuário precisa habilitar API no console (projeto antigo)
9. **daemon do scheduler/supervisores estão RODANDO** (pids em `~/.opencorp/**/*.pid`): NUNCA pkill node/opencode genérico; usar `opencorp scheduler stop`/`supervisor stop --workspace X`
10. **e2e do secretário usa fake opencode** (tests/e2e/helpers) — não iniciar o real em teste
11. Playwright: viewport default é desktop 1280×720 — para testar mobile criar context com `viewport: {width:390,height:844}, isMobile:true, hasTouch:true`
12. Server: rotas novas precisam entrar na lista `rotas` (linha ~44) senão /doc fica defasado (e auth igual às demais)

## 7. GLOSSÁRIO (para o AJUDAS e para você)

- **Workspace/empresa**: pasta em `~/.opencorp/workspaces/<id>` com agentes, board, registries, budget, site
- **Agente**: .md com frontmatter (model, tools, permissions level-1/2/3, budget) + prompt
- **Level-1/2/3**: só lê / bash local / +rede
- **HITL**: human-in-the-loop — padrões (git push, npm publish) exigem aprovação humana (approvals)
- **Registry**: memória em arquivos `.opencorp/registries/<categoria>/<id>/` (meta.json + conteudo.md + journal.jsonl)
- **Flow/linha de pensamento**: grafo executável `.opencorp/flows/<id>.json` — nós: manual, agente, decisao, task_create, registro, saida, condicao, webhook
- **Secretário**: sessão opencode com MCP do opencorp; secretario=analisa, secretario-exec=executa
- **OpenCode Go**: plano pago do opencode ($10) — modelos `opencode-go/*`
- **pj**: perfil editorial = `.opencorp/projeto.json` (empresa, nicho, público, tom, tom_evitar, topicos_editoriais)

## 8. CRITÉRIOS DE ACEITAÇÃO (o usuário valida isto)

- [ ] Painel Config com 7 abas + Secrets funcionando (criar/editar/remover, valores nunca visíveis)
- [ ] Wizard cria empresa com perfil gravado em projeto.json (testado com empresa real de teste)
- [ ] Chat com sugestões, markdown, copy, stop, histórico agrupado (streaming se viável)
- [ ] "?" explicando: workspace, agentes, level, HITL, flows, mentions, budget, secrets, cada aba de config
- [ ] 0 overflow mobile nas 10 views; workspace atual visível no mobile
- [ ] Home-hub: linhas de pensamento executáveis da home; health dot; atalhos de sistema
- [ ] Suítes verdes (unit 423+ / e2e 38+) + e2e novos passando
- [ ] `web-checklist.md` criado no template (protocolo para agentes)
