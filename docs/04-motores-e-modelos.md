# 04 — Guia de Motores e Modelos de IA (Dimensionamento xB)

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

## 3. Motores de Execução Conectados

O OpenCorp conecta múltiplos motores através da pasta de binários e drivers em `src/core/engines/drivers/`:

### A. Google Antigravity Engine (AGY)
- **ID do Motor**: `antigravity`
- **Binário**: `/home/j/.opencorp/bin/agy` ou `/home/j/.local/bin/agy`
- **Modelos Suportados**: `google/gemini-2.5-flash`, `google/gemini-3.8-flash`, `google/gemini-2.5-pro`.
- **Como Funciona**: Comunica-se nativamente com a API do Google AI Studio e infraestrutura DeepMind. Suporta skills em Markdown, subagentes e MCP.
- **Configuração de Chave**:
  Basta definir a variável de ambiente no sistema ou no `~/.bashrc`:
  ```bash
  export GEMINI_API_KEY="sua_chave_do_aistudio"
  # ou
  export GOOGLE_API_KEY="sua_chave_do_aistudio"
  ```

### B. OpenCode Engine
- **ID do Motor**: `opencode`
- **Binário**: `/home/j/.opencorp/bin/opencode`
- **Modelos Recomendados**:
  - `opencode/nemotron-3-ultra-free` (Modelo de 550B parâmetros, ideal para raciocínio com cota gratuita).
  - `opencode-go/glm-5.3-flash` (Excelente para respostas rápidas e estruturação).
  - `openrouter/qwen/qwen3.8-27b:free` (Ótimo para redação de roteiros).
  - `opencode/nemotron-3.5-lightning-free` (Alternativa rápida de fallback).

### C. OpenAI Codex CLI & GitHub Copilot CLI
- **Codex (`codex`)**: Motor especializado em código (`~/.opencorp/bin/codex`).
- **Copilot (`copilot`)**: Autenticado via token herdado do GitHub CLI (`gh auth status`).

---

## 4. Filtragem de Modelos via CLI

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
```
