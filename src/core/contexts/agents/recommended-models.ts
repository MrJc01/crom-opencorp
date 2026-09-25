/**
 * Rotação conservadora para agentes: modelos explícitos, com tool-calling e
 * diversidade de provedores. Roteadores cegos e modelos <4B ficam de fora.
 *
 * A descoberta completa continua dinâmica via `opencode models`; esta lista é
 * apenas o conjunto curado usado em novos workspaces e na recuperação de falhas.
 */
export const ROTACAO_AGENTES_RECOMENDADA = [
  "opencode/nemotron-3.5-lightning-free",
  "opencode/nemotron-3-ultra-free",
  "opencode/mimo-v2.6-flash-free",
  "opencode/ling-3.0-flash-fin-free",
  "opencode/muse-spark-1.3-contributor-free",
  "openrouter/nvidia/nemotron-3.5-lightning:free",
  "openrouter/nvidia/nemotron-3-super-120b-a12b:free",
  "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
  "openrouter/qwen/qwen3.8-27b:free",
  "openrouter/google/gemma-4-31b-it:free",
  "openrouter/z-ai/glm-5.2:free",
  "openrouter/cohere/north-mini-code:free",
  "openrouter/thinkingmachines/inkling:free",
] as const;

export const MODELOS_CATALOGO_BASE = [
  ...ROTACAO_AGENTES_RECOMENDADA,
  "opencode/big-pickle",
  "opencode/space-bunny-free",
  "openrouter/nex-agi/nex-n2.5-mini:free",
  "openrouter/google/gemini-2.5-flash",
  "opencode-go/glm-5.3-flash",
  "opencode-go/qwen3.8-flash",
  "opencode-go/mimo-v2.6-flash",
  "opencode-go/deepseek-v4.1-flash",
  "opencode-go/qwen3.8-plus",
] as const;
