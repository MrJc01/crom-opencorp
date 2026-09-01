# PLANO — PAINEL COMPLETO (29 pedidos)

> **Origem:** pedido do dono — 28 itens originais + histórico popup (P-29) + token aberto por padrão (operacional) + estudo Preline como estrutura (não só CSS).
> **Método:** inventário do código real + 5 especialistas simulados em paralelo (Arquiteto Web/Core, Product, Segurança, UX Preline) + re-auditoria em 3ª pessoa.
> **Data:** 2026-09-01 · Base: v0.6.0 → v0.7 em 12 etapas. `docs/PLANO-PAINEL-V2.md` é o histórico; este é o checklist de execução.

---

## 1. Registro completo — tudo que foi pedido (nada perdido)

| ID | Pedido (voz do usuário) | Domínio |
|----|-------------------------|---------|
| P-01 | **Página para configurar apps, salvando no `secrets`** | Apps & Secrets |
| P-02 | Informações de uma **VPS** (host, usuário, chave, porta) | Apps & Secrets |
| P-03 | **Senha app WordPress + onde ele roda** (URL, usuário, rede) | Apps & Secrets |
| P-04 | **MercadoPago keys** (public/secret, ambiente) | Apps & Secrets |
| P-05 | Outras ferramentas/recursos do opencorp | Apps & Secrets |
| P-06 | **Cartão de crédito — com ATENÇÃO: não testado corretamente ainda** | Apps & Secrets |
| P-07 | Outras **customizações e informações importantes** | Apps & Secrets |
| P-08 | **Página que lista todo o workspace e pastas, estilo VS Code** | Workspace |
| P-09 | **3 modos de ver:** editor · **preview (padrão p/ .md)** · **lado a lado** | Workspace |
| P-10 | **Tabs de terminais** na mesma página | Workspace |
| P-11 | **Módulos/plugins futuros** (WhatsApp, Telegram etc.) — **analisar melhor forma** | Integrações |
| P-12 | **Página de agentes:** listar todos, **habilitar/desabilitar, editar**, mais controle; alguns **ativos por padrão**, outros desativados; **catálogo diverso** para empresas | Agentes |
| P-13 | **Remover Reuniões do navbar** lateral esquerdo | Layout |
| P-14 | **Desktop: opção de esconder o navbar** (colapso) | Layout |
| P-15 | **Tasks: overflow scroll por coluna** (backlog/fazendo/bloqueado/feito) | Layout |
| P-16 | **Navbar scroll feio → invisível**, seguir padrões; **main central** padronizado para todas as páginas | Layout |
| P-17 | **Home: listar informações importantes + section comando → iniciar conversa no Secretário** | Home |
| P-18 | **Button no Secretário** que abre **chat lateral direito** (desktop) | Secretário |
| P-19 | **Button floating** para abrir o chat; **mobile tela cheia** | Secretário |
| P-20 | **`/` comandos, `@` contexto, `!` terminal** no Secretário + **lista de comandos** (opencode + opencorp) | Secretário |
| P-21 | **Right-click** (muda ícone, mostra opções: ver, `@` contexto, abrir Secretário lateral) + **histórico de input não enviado** persistente e **sincronizado** (página ↔ lateral, survive refresh/navegação) | Secretário |
| P-22 | **`@` clicável** além do padrão (pill/chip) | Secretário |
| P-23 | **Secretário estilo ChatGPT / opencode web** | Secretário |
| P-24 | **Página + sistema de notificações** via **function call** dos agentes ao finalizar (resumo) | Notificações |
| P-25 | **Reuniões — chat em grupo:** loop desligável se todos **concordarem**, **seleção de quais agentes** respondem como profissionais, **secretário multi-agente**, **reunião automática** e **agendar como task** | Reuniões |
| P-26 | **Chat em tempo real** da reunião: abrir / encerrar / acompanhar | Reuniões |
| P-27 | **Config global × workspace** não oculta/mostra corretamente — corrigir | Config |
| P-28 | **Layout com Preline** — https://github.com/htmlstreamofficial/preline — **não é só CSS, é ESTRUTURA com várias páginas** | Design |
| P-29 | **Histórico do Secretário como popup page** — lista limpa estilo opencode/chatGPT (adicionado 2026-09-01) | Secretário |

> Operacional (fora dos 29): token desabilitado por padrão (`serve` sem `--token` = aberto em `0.0.0.0:4100` → `192.168.18.15:4100`); `--token` / `--token <valor>` habilita.

---

## 2. Especialistas simulados — diagnóstico em 3ª pessoa

**Arquiteto Web** — Shell central existe (`web-dist/index.html:27`), mas sem `topbar/breadcrumb/page-header` padronizado; cada view inventa H1. Chat lateral precisa de estado singleton fora do SSE. Drawer/tabs/tree devem ser primitivas reutilizáveis.

**Arquiteto Core** — Gaps: escrita de arquivos + tree, terminal whitelist, store de notificações + tool `notificar`, campo `ativo` no agente, MeetingManager consultável (hoje fire-and-forget), perfis de secrets. Reuso: EventBus/SSE, `resolverCaminhoWorkspace`, `COMANDOS_AGENDA`.

**Product** — Ordem por valor/dependência: chão de fábrica (E0) → Secretário v2 + composer (coração) → Workspace/Apps/Agentes paralelizáveis → Reuniões/Notificações (core) → Config/Home → Integrações (ADR).

**Segurança** — Secrets nunca retornam valores; cartão só referência/últimos 4 + banner; `!` terminal = maior risco → whitelist + sanitização + SIGKILL + auditoria; escrita/tree com `realpath` + cap; injeção de secrets opt-in.

**UX/Preline** — Preline = 22 templates, 972 blocos; estrutura = `sidebar push (hs-overlay w-64) + topbar sticky + page-header (breadcrumb + H1 + ações) + grid-12 + card`. Opencorp falta: topbar, breadcrumb, page-header, toolbar, card system. Mapeamento: Dashboard→home, Kanban→tasks, User Tables→agentes, File Views→workspace, Chat Workspace→secretário, Settings→apps/config. Recomendação: copiar padrões Tailwind (sem `preline.js`), DaisyUI 5 já é o design system.

---

## 3. Checklist por Etapas — ordem = dependência + valor

> Cada etapa fecha com `npm run build` 0 erros + `npm test` verde + e2e do escopo verde. Baseline permitido: `agenda ×5 + chat "markdown rico" ×1`.

### Etapa 0 — Fundação: shell, navbar e primitivas ✅ 2026-09-01
- [x] 0.1 Decisão Preline: **copiar padrões sem bundle**; primitivas em `src/web/ui/` (`posicaoMenu`, `ocultarScrollbar`, `criarControladorDrawer`, `criarTabs`) — 7 testes
- [x] 0.2 Main central padronizado — shell único (`web-dist/index.html` canônico)
- [x] 0.3 Navbar scrollbar invisível (`scrollbar-none` no `#nav`, `scrollbar-thin` nas colunas)
- [x] 0.4 Collapse do navbar no desktop (64px icons-only, `localStorage oc-sidebar-colapsada`)
- [x] 0.5 Remover Reuniões do navbar (rota `#/reunioes` mantida como aba do Secretário)
- [x] 0.6 Tasks: overflow por coluna (`≥1025px` scroll próprio; abaixo empilhamento natural)
- **P cobre:** P-13, P-14, P-15, P-16, P-28 (parte)

### Etapa 1 — Secretário v2: chat lateral global ✅ 2026-09-01
- [x] 1.1 Layout ChatGPT/opencode (`.oc-feed 760px`, composer fixo)
- [x] 1.2 Drawer direito global (`chat-lateral.ts` + `#chat-drawer` estático — sobrevive navegação)
- [x] 1.3 Botão no Secretário abre o lateral (`#btn-chat-lateral`)
- [x] 1.4 Floating global; mobile **tela cheia** (`100vw ≤768px`)
- [x] 1.5 Rascunho não-enviado: singleton `rascunho.ts` (`oc-chat-rascunho`) sincronizado página↔lateral, survives refresh
- **P cobre:** P-18, P-19, P-23 + P-21-parte · **Aceite:** `chat-lateral.spec 4/4`

### Etapa 1b — Histórico como popup limpo *(P-29)*
- [ ] 1.6 Histórico **como popup page** sobre o chat — lista agrupada Hoje/Ontem/Anteriores + busca + paginação; clique abre a conversa; limpo estilo opencode/chatGPT
- [ ] 1.7 Estados vazio ilustrado / loading / erro; fecha em `Escape` / click fora; não quebrar o feed ativo
- **P cobre:** P-29

### Etapa 1c — Estrutura Preline (não só CSS, mas páginas) *(P-28)*
- [x] 1.8 **Main + topbar sticky**: `header` com `breadcrumb ol + busca global + avatar/ações` dentro do `main`
- [x] 1.9 **Page-header padronizado** (`flex justify-between`): `breadcrumb > H1 + subtítulo` + `toolbar (busca/filtros/CTA)` — aplicar em **todas**: home (KPI 4-col), tasks (toolbar + board), agentes (tabela avatar/badge), workspace (breadcrumb caminho), secretário (splitter 3-col), apps/config (tabs)
- [x] 1.10 **Card/design system**: `border-zinc-800 rounded-lg p-4/6 + shadow-sm hover:shadow-md`, tipografia `H1 1.5rem/700`, inputs `pl-9 com ícone + ring`, botões `h-9 font-medium`, empty-states ilustrados — sem bundle
- [x] 1.11 Templates de referência mapeados: Dashboard→home, Kanban→tasks, User Tables→agentes, File Views→workspace, Chat Workspace/AI Chat→secretário, Settings Modals→apps/config
- **P cobre:** P-28

### Etapa 2 — Composer `/ @ !` ✅ 2026-09-01
- [x] 2.1 Parser puro `composer-comandos.ts` (`/cmd`, `!` terminal, `@` contexto, `textoLimpo`) — 10 testes
- [x] 2.2 Palette de comandos (opencorp + passthrough opencode)
- [x] 2.3 `@` contexto: arquivos + agentes + tasks — menu clicável (cap 3+3+3); server aceita `contexto[]`
- [x] 2.4 `!` terminal: `POST /terminal` whitelist `COMANDOS_AGENDA` minus operacionais, sanitizado, `execFile` sem shell, `SIGKILL`, cap 100KB, log `[terminal]`
- [x] 2.5 Right-click base (`task-card` → Ver/Copiar/Excluir; `cursor:context-menu`) — arquivos ligados na E3
- **P cobre:** P-20, P-22, P-21-parte · **Aceite:** `composer.spec 4/4` · gap menor: `@` como pill renderizado no feed será reforçado na 1c

### Etapa 3 — Workspace VS Code ✅ 2026-09-01
- [x] 3.1 Backend `GET /files/tree` (ignore `node_modules/.git/dist`, cap 800, depth ≤6, symlinks não seguidos) + `realpath` anti-escape + `PUT /files` (deve existir, cap 1MB, `writeFileAtomic`)
- [x] 3.2 Tree lateral + tabs (`criarTabs`) + view Workspace no navbar (grupo Código)
- [x] 3.3 Modos editor / preview (padrão p/ .md) / lado a lado (.md) — dirty `●`, `Ctrl+S`
- [x] 3.4 Terminais em tabs (≤4, `localStorage`, `POST /terminal`)
- [x] Right-click arquivo: Abrir · `@` contexto (abre lateral com `@path`) · Copiar
- **P cobre:** P-08, P-09, P-10 + P-21-arquivo

### Etapa 4 — Apps & Secrets ✅ 2026-09-01
- [x] 4.1 Perfis `app:vps|wordpress|mercadopago|cartao|custom:<id>` com zod por tipo; `tipo_app` no `GET /secrets`; cartão rejeita variantes de `numero/CVV` (422)
- [x] 4.2 Aba "Configurar apps" (VPS/WP/MP/cartão com **banner ATENÇÃO**/custom) — agrupado por tipo, Editar/Excluir com `modalConfirm`
- [x] 4.3 Light: `env_hint` na UI; injeção real fica para E10
- [x] 4.4 Mini-apps preservados
- **P cobre:** P-01..P-07 · **Aceite:** `apps-perfis.spec 4/4`, masking provado

### Etapa 5 — Catálogo de Agentes ✅ 2026-09-01
- [x] 5.1 `ativo` no schema (default `true`) + 6 templates desativados (`vendas/marketing/financeiro/suporte/juridico/ops`)
- [x] 5.2 Seções Ativos × Catálogo, toggle com loading, sistema não-desativável (422)
- [x] 5.3 `POST /agents/semear-catalogo` idempotente (escaneia `templates/`, `ativo:false`)
- [x] 5.4 Guard único em `SessionManager.rodar` + `409` em `POST /agents/:id/run`; `@` lista só ativos
- **P cobre:** P-12

### Etapa 6 — Reuniões v2 *(P-25/26)* ✅ 2026-09-01
- [x] 6.1 Core buffer vivo (`reuniao-<ts+random>`, `anexarBuffer`, `estadoSala`, `MARCA_CONSENSO`)
- [x] 6.2 Chat em grupo: seleção de participantes, loop com consenso (`pediram.size >= total`), moderador
- [x] Agendável: `opencorp meeting iniciar --nao-interativo --pauta "..." --agentes a,b` (detached), `POST /meetings → {id}`, agendamento via `POST /schedules`
- [x] 6.4 Sala ao vivo: poll 2s, feed com `escapeHtml`, `encerrarReuniao`/`fecharSalaViva`, SSE guard (`isSalaAoVivoAberta`)
- [x] Correções do revisor: `salasVivas(wsPath)` filtrar por workspace, `gerarId` com random (feito), `onclick` → `encodeURIComponent`, `criarAgendaReuniao` toast (feitos)
- [x] Commit + e2e `reunioes-v2.spec` (3/3)
- **P cobre:** P-25, P-26

### Etapa 7 — Notificações *(P-24)*
- [ ] 7.1 Store por workspace + `GET /notifications` / `POST /notifications` + `PATCH :id/lida`
- [ ] 7.2 Tool `notificar` em `ToolRegistry` + guidance nos prompts
- [ ] 7.3 Página com feed lidas/não lidas + badge no navbar + push `SSE`
- **P cobre:** P-24

### Etapa 8 — Config fix *(P-27)*
- [ ] 8.1 `GET /settings` respeita o toggle (remover `?workspace=` inj. em `web/api.ts:32`)
- [ ] 8.2 Badges de origem + `PUT` coerente + e2e de regressão
- **P cobre:** P-27

### Etapa 9 — Home dashboard *(P-17)*
- [ ] 9.1 Infos importantes (tasks vencidas, custos do dia, saúde daemon/scheduler, fluxos ativos, notificações)
- [ ] 9.2 Barra de comando que inicia conversa no Secretário (reusa composer `/ @ !`)
- **P cobre:** P-17 (estrutura Preline aplicada aqui também)

### Etapa 10 — Integrações: análise *(P-11)*
- [ ] 10.1 Doc comparando webhook inbound/outbound vs agente-bridge vs plugin opencode para WhatsApp/Telegram
- [ ] 10.2 ADR + esqueleto `canal` (sem provider)
- **P cobre:** P-11

### Etapa 11 — QA, docs e segurança
- [ ] 11.1 e2e finais (drawer, composer, workspace, apps, toggle, reunião v2, notificações, config)
- [ ] 11.2 Revisão: secrets sem retorno, `!` whitelist, `realpath`, cartão ofuscado
- [ ] 11.3 `docs/06` + AJUDAS + CHANGELOG

---

## 4. Riscos e notas
- `!` terminal = maior risco — whitelist + sanitização + kill-switch.
- Cartão: só referência/últimos 4; rejeitar variantes de `numero/cvv`.
- `web-dist/index.html` é canônico (`@source` aponta pra lá).
- Reuniões: compat `POST /meetings 202` mantida.
- Token: aberto por padrão (`--token` habilita).

## 5. Métricas de sucesso
- 29/29 pedidos endereçados.
- Zero segredos em `GET`; zero execução fora de whitelist.
- Shell único Preline-inspired (sidebar push + topbar + page-header) em todas as páginas.
- Suite verde com cobertura dos novos fluxos.
