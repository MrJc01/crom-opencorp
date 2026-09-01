# ADR-0001 — Canais de integração (WhatsApp, Telegram, e-mail)

- **Status:** Aceito (recomendado) — esqueleto implementado, providers pendentes
- **Data:** 2026-09-01
- **Cobre:** P-11 — "analisar a melhor forma de montar módulos/plugins para conectar WhatsApp, Telegram etc. para fácil utilização do opencorp"
- **Código:** `src/core/canal.ts` (interface `Canal`, `RegistroDeCanais`, `CanalNotificacao`) · testes: `tests/canal.test.ts`

---

## Contexto

O opencorp precisa de **canais de entrada e saída** fora do painel web:

1. **Entrada (inbound):** usuário manda mensagem pelo WhatsApp → agente do opencorp responde (direto ou via Secretário). Ex.: "Qual o status da task X?" pelo WhatsApp e o Secretário responde no próprio chat.
2. **Saída (outbound):** eventos do opencorp → notificação no Telegram/WhatsApp. Ex.: task concluída, orçamento em 80%, reunião iniciada → mensagem chega no celular do dono.

O que já existe e pode ser reusado:

- **Hooks webhooks** (`src/core/hook-store.ts`): rota pública `POST /hooks/:ws/:id` com `x-opencorp-token`, dedup, alvos `agent_run` / `flow_run` / `task_create` / `webhook_out`, modo `imediato`/`final`.
- **Scheduler** (`COMANDOS_AGENDA`): agendamento de comandos.
- **SessionManager**: spawna sessões opencode por agente.
- **EventBus → SSE**: eventos internos em tempo real (+ `webhook_out` como alvo de hook/trigger = webhooks de saída configuráveis).
- **Secrets com perfis** (Etapa 4): `app:tipo:id` — encaixa credenciais por canal.
- **Notificações** (Etapa 7): store por workspace + `POST /notifications` + tool `notificar`.

Cada canal tem uma realidade de custo/estabilidade diferente:

- **Telegram**: Bot API **oficial, gratuita** (long-polling ou webhook). Não precisa de infra pesada.
- **WhatsApp**: **sem webhook barato**. A API oficial (WhatsApp Business Cloud API da Meta) é paga por conversa e exige conta business; a via não-oficial (**Baileys** / `whatsapp-web.js`) é gratuita mas pesada (client WebSocket completo + sessão/QR) e **há risco de ban do número**.
- **E-mail**: precisa de polling IMAP (entrada) + SMTP (saída), sem webhooks nativos.

---

## Opções consideradas

### Opção A — Webhooks bidirecionais dentro do server

Inbound: estender a rota de hooks existente com um "adapter" por provider que traduz o payload do provider (Telegram update, Meta webhook) para o formato de hook do opencorp e dispara `agent_run`/`flow_run`. Outbound: EventBus → webhooks de saída (`webhook_out`) configuráveis por trigger.

- **Prós:** zero dependências novas no core; reusa hooks, dedup, token, scheduler, secrets e EventBus; tudo roda no processo único `opencorp serve`.
- **Contras:** providers sem webhook (WhatsApp via Baileys, e-mail IMAP) exigem cliente residente + state de sessão **dentro do server** → deps pesadas (Baileys ~30MB de transitive deps, puppeteer no `whatsapp-web.js`), crash derruba o painel inteiro, e o processamento de mídia/QR fica no mesmo event loop do SSE.

### Opção B — Gateway de canais como processo externo (RECOMENDADA)

Módulo Node separado, **`opencorp-channel-gateway`**, instalável via npm (`npm i -g opencorp-channel-gateway` ou um pacote por canal), que conversa com o server pelos endpoints que **já existem**:

- **Entrada:** gateway recebe a mensagem do provider (long-polling Telegram, WebSocket Baileys, IMAP) e chama `POST /hooks/:ws/:id` com o payload traduzido — o hook dispara `agent_run` (ou o Secretário) como hoje.
- **Saída:** server publica mensagem → gateway entrega no provider. Via `POST /notifications` (fallback atual) ou endpoint dedicado `POST /canais/:canal/enviar` (contrato abaixo).

- **Prós:** deps pesadas (Baileys, telegraf, nodemailer) ficam **fora do core**; crash do canal **não derruba** o opencorp; um gateway por canal (escala/desliga individualmente); core continua limpo e auditável; gateway pode rodar na VPS ou na máquina do usuário.
- **Contras:** mais um processo para operar (start/upgrade/logs) — mitigado por ser opcional e por `opencorp doctor` verificar saúde.

### Opção C — Plugins nativos do opencode (agents/tools)

Agentes/tools que chamam as APIs dos providers direto (tool `telegram_enviar`, tool `whatsapp_enviar`).

- **Prós:** simples para **saída**; zero infra nova.
- **Contras:** **sem estado de conversa** (cada mensagem é uma sessão nova, não mantém thread com o contato), **sem webhook inbound** (não recebe mensagem do usuário), e **credenciais no contexto do LLM = risco** (bot_token/session precisariam ser injetadas no prompt — viola a regra "segredo nunca no contexto/feed").

---

## Decisão

**Opção B com A como ponte.** Gateway externo por canal (WhatsApp via **Baileys**, Telegram via **Bot API/telegraf**, e-mail via IMAP/SMTP), falando com o server pelos endpoints existentes + o contrato abaixo. Enquanto os gateways não existem, a **Opção A serve de ponte**: `CanalNotificacao` (`src/core/canal.ts`) entrega mensagens como **notificações do painel** (`POST /notifications`) e o EventBus → `webhook_out` já cobre saída simples.

**Justificativa de custo:**

| Via | Custo | Risco |
|---|---|---|
| WhatsApp Business Cloud API (Meta) | **Pago** (por conversa/24h) | Baixo, oficial |
| WhatsApp via Baileys | Grátis | **Não-oficial — risco de ban do número**; usar número dedicado |
| Telegram Bot API | Grátis | Baixo, oficial |
| E-mail (IMAP/SMTP) | Grátis (conta existente) | Baixo-médio (creds de e-mail sensíveis) |

A Opção B é a única que deixa o WhatsApp (o canal mais pesado) fora do processo do painel sem custo por conversa — e mantém o Telegram viável em ~200 linhas de gateway.

---

## Contrato do canal

**Inbound** — mensagem do usuário chega como hook (rota existente `POST /hooks/:ws/:id`, com `x-opencorp-token`). O **gateway traduz** o payload do provider para:

```json
{ "canal": "whatsapp" | "telegram" | "email", "de": "<chat-id>", "texto": "...", "ts": 1725180000000 }
```

O hook típico tem alvo `agent_run` com `ordem: "{{texto}}"` (e `respond: "imediato"` — o ack volta pro gateway, a resposta final sai pelo canal de saída). O mesmo payload vai servir ao futuro `POST /secretario/conversa` quando a conversa for contínua.

**Outbound** — decisão: **endpoint dedicado `POST /canais/:canal/enviar`**, corpo `{ "para": "<chat-id>", "texto": "..." }` (estende `REGISTRO_ROTAS` e consulta o `RegistroDeCanais`). NÃO estendemos `POST /notifications`: notificação é domínio do painel (por workspace, cap FIFO 100, lida/não lida) — acoplá-la ao roteamento externo misturaria dois domínios. Enquanto o endpoint não existe, `CanalNotificacao` (fallback) posta em `POST /notifications` e a mensagem aparece no painel.

```
WhatsApp/Telegram ──msg──▶ gateway ──{canal,de,texto,ts}──▶ POST /hooks/:ws/:id ──▶ agent_run
opencorp (evento/task) ──▶ POST /canais/:canal/enviar ──▶ gateway ──▶ provider ──▶ celular do usuário
```

---

## Segurança

- **Credenciais por canal nos secrets** (perfis existentes da Etapa 4, nunca no workspace/contexto de LLM):
  - `app:whatsapp:<id>` → `{ "session_dir": "..." }` (diretório da sessão Baileys — o token de sessão mora aí, fora do core)
  - `app:telegram:<id>` → `{ "bot_token": "..." }`
  - `app:email:<id>` → `{ "imap_host", "smtp_host", "usuario", "senha" }`
- **Allowlist de números/chats por canal** (`allowlist_chats: ["55119...", "-100..."]` no config do canal/gateway): mensagem de remetente fora da lista é **descartada com log** — sem isso, qualquer número que descobrir o número do bot conversa com os agentes.
- **Rate limit** por chat (ex.: 20 msg/min) tanto no gateway (protege o opencode de flood) quanto no endpoint de saída.
- **Inbound** mantém a autenticação atual de hooks (`x-opencorp-token` + dedup `dedup_seg`).
- Respostas de agente que vão pro canal passam por truncamento (ex.: 4096 chars Telegram) e **nunca incluem secrets** (a regra do GET /secrets — masking — vale para o texto da mensagem).

---

## Esforço estimado por canal

| Canal | Dependências (no gateway) | LOC estimadas | Risco | Observações |
|---|---|---|---|---|
| **Telegram** | `telegraf` (ou `fetch` puro contra a Bot API) | ~200–300 | **Baixo** | long-polling de `getUpdates` + `sendMessage`; rápido de validar o contrato inteiro |
| **WhatsApp** | `baileys` (~pesada, não-oficial) | ~300–400 | **Médio/Alto** | login QR persistido em `session_dir`, reconexão automática; risco de ban → número dedicado; alternativa paga: Meta Cloud API (~150 LOC, sem Baileys) |
| **E-mail** | `nodemailer` (SMTP) + `imapflow` (IMAP) | ~250–350 | **Baixo-Médio** | polling IMAP a cada N min + envio SMTP; threads por `In-Reply-To` são um refinamento posterior |

Ordem de implementação sugerida: **Telegram primeiro** (valida o contrato A→B com risco mínimo), WhatsApp depois (valor máximo, risco de ban gerenciado), e-mail por último.
