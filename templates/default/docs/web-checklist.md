# Web Checklist — protocolo para mexer no painel (frontend)

> Vale para QUALQUER agente/humano que altere `src/web/**` ou `web-dist/index.html`.
> Objetivo: manter o painel consistente, acessível e sem regressões. Se você quebrou uma regra daqui, o PR não está pronto.

## Stack (não negociável)

- **Sem framework**: TypeScript módular compilado com `tsc -p tsconfig.web.json` → `web-dist/app/*.js`. HTML + CSS vivem em `web-dist/index.html` (CSS crítico inline; Tailwind é CDN e pode sumir offline — estilos próprios sempre inline).
- **Globais para onclick inline**: funções usadas em `onclick="..."` precisam estar em `window.*` — via `exporGlobais()` (main.ts), `exporWizard()`, `exporAjuda()` ou `window.__x = ...` dentro do módulo da view.
- **O bin roda `dist/` e a web roda `web-dist/`**: SEM `npm run build` nada funciona. Sempre build antes de validar qualquer mudança.

## As 10 regras de design (obedecer em TODA tela)

1. **Todo conceito tem "?"** — popups alimentados pelo dicionário `AJUDAS` em `src/web/help.ts`. Conceito novo = entrada nova no dicionário (nunca texto solto no HTML).
2. **Todo dado mostrado tem origem** — badge `global / workspace / default` (ver aba de settings em `src/web/views/config.ts`).
3. **Toda view tem 3 estados** — carregando/vazio/erro com os helpers únicos de `src/web/estado.ts` (`estadoCarregando`, `estadoVazio`, `estadoErro(msg, retryFn)`). Proibido inventar empty-state ad-hoc. Loading só no primeiro render (o refresh de 8s não pode piscar a tela).
4. **Ação destrutiva = modal de confirmação** (`modalConfirm`) — nunca `confirm()` nativo. Entradas de texto = `modalPrompt`.
5. **Mobile-first** — 0 overflow-x em 390px, touch targets ≥44px (exceção: `.help-btn`, que tem área de toque expandida via `::after`). Validar com o scan de overflow (abaixo).
6. **Teclado** — Enter submete, Shift+Enter quebra linha, ESC fecha modal/popup.
7. **Chat** — streaming honesto (ou indicador "Pensando" + stop no slot do enviar) + copy por mensagem + escapeHtml SEMPRE antes de markdown (`src/web/md.ts`).
8. **Cores/contraste** — accent `#2563eb`, fundo `#0a0a0a`, card `#171717`, texto `#e5e5e5`, muted `#a3a3a3`. Cinzas abaixo de ~7:1 sobre card falham AA (ex.: `text-zinc-500` já é sobrescrito para `#a1a1aa` no index.html — não reintroduza cinza escuro em texto pequeno).
9. **Nada de framework novo** — TS módular + globais. Sem React/Vue/jQuery.
10. **Rota nova no server** — precisa entrar no array `ROUTES` (topo de `src/server/index.ts`) para o `/doc`, seguir auth Bearer e NUNCA retornar valores de secrets.

## Armadilhas conhecidas (não repetir)

1. Views re-renderizam a cada 8s (`main.ts iniciarApp`) — não manter estado só no DOM; o refresh pula `secretario` e campos focados.
2. Não usar `document.getElementById('x')!` sem null-check em conteúdo dinâmico — views recriam o DOM e soltam handlers.
3. `escapeHtml` antes de QUALQUER interpolação de dado do server (XSS).
4. Secrets: JAMAIS retornar/exibir valor — só nome + estado.
5. O secretário (chat) não pode ser re-renderizado durante a conversa (perde estado local).
6. `icone()` gera `<span class="nav-icon">` com `display:flex` — botões já são `inline-flex` globalmente; se adicionar ícone em contexto novo, confira alinhamento.
7. Playwright: viewport default é desktop — mobile exige `viewport: {width:390,height:844}, isMobile:true, hasTouch:true`.
8. Testes com LLM real gastam o plano OpenCode Go — usar o fake (`tests/fixtures/fake-opencode.mjs`, já ligado no `playwright.config.ts`).

## Como testar (obrigatório antes de qualquer entrega)

```bash
# 1. build (bin roda dist/, web roda web-dist/ — sem isso nada funciona)
npm run build

# 2. unit (423+)
npx vitest run

# 3. e2e (52+) — sobe server isolado na 4399 com token test-e2e + fake opencode
npx playwright test

# 4. um arquivo só, durante o desenvolvimento
npx playwright test tests/e2e/home.spec.ts
```

### Scan de overflow mobile (validação da regra 5)

Script usado na v4 (adaptar caminhos conforme preciso): sobe server isolado
(`OPENCORP_HOME=/tmp/x node bin/opencorp.mjs serve --port 4401 --token t --foreground`),
abre cada rota em 390×844 e avalia `document.documentElement.scrollWidth > clientWidth`.
Zero exceções: se estourou, a view está errada — não "conserte" com scroll horizontal.

### Screenshots

- Mobile: Playwright chromium 390×844 `isMobile hasTouch`.
- Desktop: 1280×800.
- Salvar em `/tmp/opencode/web-<versao>/` com prefixo por etapa (ex.: `08-final-home-d.png`).

## Contratos que os e2e seguram (mudou o comportamento? mude o teste junto, de propósito)

- `.nav-item[data-view]` navega e ativa a view (`nav.spec.ts`).
- Home: KPIs (Tasks abertas, Feitas 7d, Taxa ok 24h, Custo hoje), Feed ao vivo, Linhas de pensamento, Sistema, chip de workspace, wizard abre (`home.spec.ts`).
- Secretário: standby → iniciar (fake) → `#chat-input`, `#btn-enviar`, `button[title="Nova conversa"]` (`secretario.spec.ts`, `chat.spec.ts`).
- Config: 8 abas, `#cfg-budget-daily_usd` salva e reflete no `GET /settings` (`config.spec.ts`).
- Secrets: adicionar/listar/remover sem vazar valor (`secrets.spec.ts`).
- Wizard: 4 passos, slug automático, `projeto.json` no workspace (`wizard.spec.ts`).
- Ajuda: "?" abre popup em home e config (`ajuda.spec.ts`).

## Antes de entregar (checklist rápido)

- [ ] `npm run build` verde
- [ ] `npx vitest run` verde (423+)
- [ ] `npx playwright test` verde (52+)
- [ ] Screenshots mobile + desktop das telas tocadas
- [ ] 0 overflow em 390px nas views tocadas
- [ ] Todo conceito novo tem "?" com entrada em `AJUDAS`
- [ ] Nenhum `confirm()`/`prompt()` nativo novo
- [ ] Nenhum valor de secret em tela, log ou resposta de API
