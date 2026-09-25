# Relatório de auditoria de modelos — 25/09/2026

## Resultado executivo

O chat do Secretário está operacional. A causa principal das falhas recorrentes não era ausência de modelos: era a combinação de uma conta OpenCode Go sem cota, aliases `opencode/*` com credencial inválida, modelos customizados sem rota funcional e uma conversão silenciosa no executor que trocava modelos OpenRouter saudáveis pelo `opencode-go/glm-5.3-flash` esgotado.

A conversão foi removida, a rotação sistêmica passou a usar modelos realmente conectados e testados, e o `yt-factory-01` deixou de usar os fallbacks Gemma e `custom/qwen-2.5-coder-32b` que apareciam nos logs com quota/HTTP 500.

## Inventário observado no ambiente vivo

- OpenCorp CLI, após deduplicação: **428 IDs**.
  - OpenRouter: 387.
  - OpenCode Go: 32.
  - OpenCode/Zen: 9 IDs base coletados pelo OpenCorp.
- Catálogo bruto do servidor OpenCode, contando aliases por provedor: **494 entradas**.
  - OpenRouter: 387, sendo 28 marcadas com custo zero e 21 com `toolcall` + `reasoning`.
  - OpenCode Go: 32.
  - OpenCode: 75, incluindo aliases e modelos pagos.
- Provedores conectados neste projeto: `openrouter`, `opencode-go` e `opencode`.
- Configurações de agentes encontradas: **119 agentes em 14 workspaces**, com 6 modelos primários distintos.
- Distribuição dos modelos primários:
  - `opencode-go/glm-5.3-flash`: 83 agentes — catalogado, porém indisponível agora por limite mensal.
  - `openrouter/nvidia/nemotron-3.5-lightning:free`: 16.
  - `opencode/nemotron-3-ultra-free`: 12 — os logs registram `Invalid API key`.
  - `codex/gpt-5.6-luna`: 4, executados por harness Codex, fora do catálogo OpenCode.
  - `custom/gemini-2.5-flash`: 2 — os logs registram HTTP 500.
  - `openrouter/nvidia/nemotron-3-ultra-550b-a55b:free`: 2.

O catálogo é dinâmico e a disponibilidade é específica do projeto: o OpenCode documenta que o modelo precisa estar habilitado, o provedor disponível e as credenciais presentes no projeto. Fonte: [OpenCode — Models](https://opencode.ai/v2/docs/models).

## Modelos gratuitos com ferramentas e raciocínio no catálogo conectado

O endpoint vivo `/provider` retornou os seguintes 21 candidatos OpenRouter:

1. `cohere/north-mini-code:free`
2. `dots-studio/dots-3-note-preview:free`
3. `google/gemma-4-26b-a4b-it:free`
4. `google/gemma-4-31b-it:free`
5. `inclusionai/ling-3.0-flash-fin:free`
6. `inclusionai/ling-3.0-flash-sante:free`
7. `liquid/lfm-2.5-2.6b:free`
8. `nex-agi/nex-n2.5-mini:free`
9. `nex-agi/nex-n2.5-pro:free`
10. `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`
11. `nvidia/nemotron-3-super-120b-a12b:free`
12. `nvidia/nemotron-3-ultra-550b-a55b:free`
13. `nvidia/nemotron-3.5-lightning:free`
14. `openrouter/auto`
15. `openrouter/free`
16. `poolside/laguna-s-2.1:free`
17. `poolside/laguna-xs-2.1:free`
18. `qwen/qwen3.8-27b:free`
19. `stealth/space-bunny-alpha`
20. `thinkingmachines/inkling-small:free`
21. `thinkingmachines/inkling:free`

`openrouter/free` e `liquid/lfm-2.5-2.6b:free` continuam bloqueados pela governança do OpenCorp para agentes: o primeiro é um roteador não determinístico e o segundo tem apenas 2,6B parâmetros. A OpenRouter confirma que o sufixo `:free` possui limites próprios e que modelos gratuitos têm limites baixos, geralmente inadequados para produção. Fontes: [OpenRouter — FAQ](https://openrouter.ai/docs/faq) e [coleção de modelos gratuitos](https://openrouter.ai/collections/free-models/).

## Probes reais em 25/09/2026

Cada probe criou uma sessão descartável no OpenCode vivo, enviou `Responda somente com a palavra OK.`, validou `HTTP 200` e removeu a sessão.

| Modelo | Resultado | Latência |
|---|---:|---:|
| `openrouter/qwen/qwen3.8-27b:free` | PASS | 1.115 ms |
| `openrouter/nvidia/nemotron-3-ultra-550b-a55b:free` | PASS | 1.366 ms |
| `openrouter/thinkingmachines/inkling:free` | PASS | 1.640 ms |
| `openrouter/poolside/laguna-s-2.1:free` | PASS | 2.530 ms |
| `openrouter/nvidia/nemotron-3.5-lightning:free` | PASS | 2.550 ms |
| `openrouter/cohere/north-mini-code:free` | PASS | 2.801 ms |
| `openrouter/nvidia/nemotron-3-super-120b-a12b:free` | PASS | 4.225 ms |

Um PASS curto comprova autenticação, roteamento e inferência no momento do teste; não equivale a SLA ou benchmark de qualidade. A API oficial da OpenRouter permite enumerar o catálogo atualizado por `GET /api/v1/models`: [referência oficial](https://openrouter.ai/docs/api/api-reference/models/get-models).

## Falhas comprovadas nos logs

| Modelo/rota | Evidência | Diagnóstico |
|---|---|---|
| `opencode-go/glm-5.3-flash` | `monthly usage limit reached`, reset indicado em aproximadamente 4 dias e 16 horas | Conta sem cota; não usar até o reset ou ativação de saldo |
| `opencode/nemotron-3-ultra-free` e `opencode/nemotron-3.5-lightning-free` | `Invalid API key` | Aliases catalogados, mas credencial OpenCode/Zen inválida no ambiente |
| `custom/gemini-2.5-flash` e `custom/qwen-2.5-coder-32b` | `/message respondeu HTTP 500` | Provider customizado não funcional no servidor atual |
| Gemma 4 via Google/OpenRouter | `quota exceeded` ou aborto | Cota Google free excedida; removido da rota ativa |
| Nemotron Lightning/Super/Ultra | 503 `provider_overloaded`, 504 `idle timeout` e falha de conexão em execuções anteriores | Indisponibilidade transitória da NVIDIA; exige fallback de outro fornecedor |
| Google direto | HTTP 500 e ausência de chave AI Studio funcional em tentativas anteriores | Não confundir credencial Antigravity com `GEMINI_API_KEY` |

O OpenCode Go é uma assinatura com limites de 5 horas, semanais e mensais; portanto, o rótulo interno “cota zero” não significa disponibilidade ilimitada. Fonte: [OpenCode Go — limites oficiais](https://opencode.ai/v2/docs/console/go).

## Configuração aplicada

### Secretário

1. `openrouter/nvidia/nemotron-3-ultra-550b-a55b:free`
2. `openrouter/thinkingmachines/inkling:free`
3. `openrouter/nvidia/nemotron-3-super-120b-a12b:free`
4. `openrouter/nvidia/nemotron-3.5-lightning:free`

O Ultra permanece como modelo principal de orquestração. O Inkling foi colocado antes dos outros NVIDIA para reduzir falhas correlacionadas por fornecedor.

### Outros agentes no `yt-factory-01`

- Pautador e roteirista: `qwen3.8-27b` como primário, depois Lightning e Inkling.
- Analista de qualidade: removido `custom/qwen-2.5-coder-32b`; cadeia Lightning, Inkling e Super.
- Demais agentes: mantido Lightning como primário, com a rotação global agora composta por Qwen, North Mini Code, Inkling, Super e Ultra.

### Correção no executor

- Removida a reescrita silenciosa de OpenRouter/Nemotron para OpenCode Go/GLM.
- `provider/model` agora é preservado até o OpenCode.
- Rotações padrão e do harness OpenCode passaram a usar somente IDs conectados e aprovados nos probes.
- A cadeia defensiva do Secretário ganhou fallbacks de fornecedores distintos.

## Matriz recomendada

| Papel | Primário | Fallbacks |
|---|---|---|
| Secretário/orquestrador | Nemotron Ultra | Inkling, Nemotron Super, Lightning |
| Redação/pauta/roteiro | Qwen3.8 27B | Lightning, Inkling |
| Código e correções focadas | North Mini Code | Laguna S, Lightning |
| Tarefas curtas e validação | Laguna S | Qwen3.8 27B |

Para produção com SLA, recomenda-se restaurar uma conta paga/estável e manter a cadeia gratuita somente como contingência. OpenCode suporta mais de 75 provedores e configuração de whitelist/blacklist: [documentação oficial de providers](https://opencode.ai/docs/providers).

## Validação final

- 35/35 testes focados: PASS.
- `npx tsc --noEmit -p tsconfig.web.json`: PASS.
- `npm run build`: PASS.
- Playwright `tests/e2e/chat.spec.ts`: 14/14 testes PASS no Chromium.
- Daemon reiniciado na porta 4100; OpenCode vivo na porta 41337.
- `GET /secretario/status`: HTTP 200, `rodando: true`.
- Stream real: HTTP 200 e `content-type: text/event-stream`.
- Modelo efetivo: `openrouter/nvidia/nemotron-3-ultra-550b-a55b:free`.
- Resposta final recebida: `Estou operando com o modelo nvidia/nemotron-3-ultra-550b-a55b:free e o chat está operacional.`
- Evento final emitido normalmente, sem ferramenta indevida e sem rotação de modelo.

## Comandos de auditoria reproduzíveis

```bash
./bin/opencorp.mjs modelos --json
./bin/opencorp.mjs modelos --free --recommended
./bin/opencorp.mjs motores list --json
curl -sS http://127.0.0.1:41337/provider
curl -i http://127.0.0.1:4100/secretario/status
```

O inventário deve ser regenerado antes de novas alterações, porque catálogos, cotas e disponibilidade de modelos mudam sem depender de uma nova versão do OpenCorp.
