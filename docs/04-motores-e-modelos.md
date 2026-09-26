# 04 — Motores e Modelos de IA

## 1. Dimensionamento por Parâmetros (xB)

No OpenCorp, cada nó de fluxo e cada agente deve receber um modelo calibrado para o seu nível de complexidade. O desperdício de cota com modelos gigantes em tarefas triviais é tão prejudicial quanto a utilização de modelos minúsculos em tarefas analíticas.

### Tabela de Dimensionamento e Tiers de Qualidade

| Faixa (xB) | Classificação | Casos de Uso no OpenCorp | Vantagens | Riscos & Restrições | Exemplos |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **< 4B** | ⛔ **Inadequado para Agentes** | Apenas autocompletar de texto puro. | Latência minúscula. | **NÃO RECOMENDADO.** Não sustenta chamadas de ferramentas (*tool-calling*), falha em JSON estruturado, alucina comandos inexistentes. | `liquid/lfm-2.5-2.6b:free`, `llama-3.2-1b/3b` |
| **7B – 14B** | ⚡ **Mini-Agentes** | Validação de formatos, deduplicação de strings, checagem de estoque, filtros rápidos, sanitização de texto. | Velocidade altíssima, cota zero ou baratíssimo, resposta em milissegundos. | Não suporta prompts com regras contraditórias ou cadeias longas de raciocínio. | `llama-3.1-8b`, `qwen-2.5-7b/14b`, `gemma-2-9b` |
| **14B – 35B** | 📝 **Agentes Redatores** | Redação de roteiros com regras de cenas, síntese de notícias, geração de títulos jornalísticos A/B, extração de fatos de artigos. | Excelente equilíbrio entre obediência a instruções e velocidade. | Pode ter lentidão leve em depuração profunda de código ou infraestrutura. | `qwen3.8-27b:free`, `qwen-2.5-coder-32b`, `gemma-2-27b` |
| **> 70B & Flagships** | 🧠 **Secretário / Raciocínio** | Secretário Executivo do workspace, diagnóstico de incidentes, pesquisa investigativa, coordenação de subfluxos, tomada de decisão. | Raciocínio de topo, tool-calling impecável, segue instruções complexas e negativas. | Maior consumo de tokens ou cotas mais restritas. | `gemini-2.5-flash` / `gemini-3.8-flash` (AGY / AI Studio), `claude-3.5/3.7-sonnet`, `nemotron-3-ultra-550b`, `llama-3.3-70b` |

---

## 2. Modelos Não Recomendados (Lista Negra Operacional)

A auditoria identificou modelos que causam travamentos e comportamentos erráticos em agentes autônomos:

1. **`openrouter/liquid/lfm-2.5-2.6b:free`**:
   - Modelo de apenas 2.6 bilhões de parâmetros.
   - Incapaz de processar respostas do `curl` sem se perder. Alucina comandos de sistema e quebra validações JSON.
2. **`openrouter/openrouter/free`**:
   - Roteador cego da OpenRouter.
   - Envia a requisição para qualquer modelo gratuito disponível no momento, incluindo modelos experimentais ou de 1B-3B parâmetros.
   - Causa inconsistência aleatória: uma execução pode funcionar e a seguinte falhar completamente.
3. **Modelos com janelas de contexto restritas (< 8k tokens)**:
   - Incompatíveis com leituras de artigos ou logs do sistema.

> **Regra de Ouro:** O arquivo global `~/.opencorp/settings.json` e as rotações dos workspaces ativos **não** devem incluir esses modelos.

---

## 3. Arquitetura multimotores

O OpenCorp não depende de um motor específico. Cada motor é um **adaptador** que implementa portas canônicas
(`src/core/engines/ports.ts`):

- `EngineAdapter` — instalação, autenticação, capacidades e saúde;
- `AgentRunner` — execução one-shot (jobs, fluxos, agendador);
- `ConversationRuntime` — conversa persistente (Secretário), com `respondApproval` escopado por workspace.

Todos emitem os mesmos eventos `AgentEvent` (`run.started`, deltas de texto, ferramentas, aprovações,
`run.completed`/`run.failed`). Processos residentes pertencem ao `ProcessRegistry`, um por
`[engineId, workspaceId]`, encerrados após 15 min ociosos (`SIGTERM` → 5 s → `SIGKILL`).

### Motores suportados

| Motor | ID | Transporte | Conversa (Secretário) | Execução one-shot |
| :--- | :--- | :--- | :---: | :---: |
| OpenCode | `opencode` | `opencode serve` (HTTP + SSE, Basic auth, loopback) | ✅ | ✅ |
| OpenAI Codex | `codex` | `codex app-server` (JSON-RPC stdio) | ✅ | ✅ |
| GitHub Copilot | `copilot` | ACP v1 (`copilot --acp`) | ✅ | ✅ |
| Xiaomi MiMo Code | `mimo` | ACP v1 (`mimo acp`) | ✅ | ✅ |
| Claude Code | `claude-code` | CLI | — | ✅ |
| Google Antigravity | `antigravity` | CLI | — | ✅ |
| Cursor Agent | `cursor` | CLI | — | ✅ |
| Crom-Agente | `crom-agente` | CLI | — | ✅ |
| Aider | `aider` | CLI | — | ✅ |

Motores sem runtime conversacional **não** podem ser escolhidos para o Secretário: a configuração é
recusada com erro explícito.

### Regras de operação (decisões D1–D6)

1. **Sem fallback silencioso.** Motor configurado indisponível → erro explícito (`ENGINE_NOT_INSTALLED`,
   `ENGINE_AUTH_REQUIRED`, `MODEL_INCOMPATIBLE`…). Nunca se cai em OpenCode sem estar configurado.
2. **Resolução do binário:** `settings.engines[id].binary_path` → `PATH` → instalação gerenciada
   (`~/.opencorp/engines/<id>/<versão>`, com SHA-256 verificado). Nada é instalado durante jobs ou chat;
   instalar é uma ação explícita (UI ou `POST /api/motores/:id/install`).
3. **Credenciais** passam por uma fachada de cofre e são injetadas de forma efêmera no processo; o OpenCorp não
   lê arquivos internos de OAuth de CLIs de terceiros.
4. **ACP** (Agent Client Protocol v1) é transporte de primeira classe: qualquer agente compatível entra
   declarando um vendor em `src/core/engines/acp/vendors.ts`.

### Configuração

`~/.opencorp/settings.json`:

```json
{
  "default_conversation_engine": "codex",
  "run_engine": { "default": "claude-code", "timeout_min": 30, "fallback": ["codex"] },
  "engines": {
    "claude-code": { "binary_path": "/opt/claude/bin/claude" },
    "codex": { "limits": { "rate_limit_rpm": 10 } }
  }
}
```

- `default_conversation_engine` — motor do Secretário; cada workspace pode sobrepor com
  `conversationEngineOverride` em `.opencorp/config.json`.
- `run_engine.default` — motor das execuções one-shot; `run_engine.fallback` é a **única** cadeia de troca de
  motor permitida (vazia = nunca trocar).
- O antigo `~/.opencorp/runner.json` ainda é lido, com aviso de depreciação, até a remoção descrita em
  [`DEPRECACOES-MULTIMOTORES.md`](DEPRECACOES-MULTIMOTORES.md). Migre com `opencorp migrate-configs --apply`.

### Saúde multinível

`POST /api/motores/:id/test` (UI: "Diagnóstico rápido" / "Teste funcional") avalia, em ordem:
`installed → authenticated → inference → streaming → tools → conversation → lifecycle`.
O padrão para em `authenticated` (sem custo). Níveis a partir de `inference` consomem cota e exigem
`{ "confirmarCusto": true, "modelo": "<id>" }`. "Instalado" nunca é reportado como "funcionando".

### Catálogo e rotação

- O catálogo (`GET /modelos/catalogo`) agrega fontes com **proveniência** (manifesto, CLI do motor, probes)
  e indica em quais motores cada modelo é compatível.
- Prefixos como `opencode/`, `codex/`, `claude-code/` fixam o motor; `openrouter/` e `mimo/` não.
  Motor explícito + modelo de outro motor → `MODEL_INCOMPATIBLE` antes de qualquer spawn.
- O roteador de fallback (`src/core/models/fallback-router.ts`) decide, e registra no log de auditoria:
  rotacionar conta → próximo modelo da rotação → próximo motor (só com cadeia explícita e compatibilidade
  comprovada) → parar.

---

## 4. Consulta via CLI

Para consultar e filtrar os modelos no OpenCorp:

```bash
# Listar todos os motores e status de instalação
oc motores list

# Listar apenas modelos gratuitos
oc modelos --free

# Filtrar modelos por contagem de parâmetros
oc modelos --size ">30b"
oc modelos --size "<14b"
oc modelos --min-b 14 --max-b 70

# Ocultar modelos não recomendados
oc modelos --recommended

# Testar um motor (saúde barata, sem inferência)
oc motores test codex

# Migrar configuração legada (runner.json, campos antigos de agentes)
oc migrate-configs --check
```
