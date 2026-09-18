/** Sugestões rápidas do chat (estado vazio). */
export const SUGESTOES_RAPIDAS = [
  "O que aconteceu hoje?",
  "Como está o board de tasks?",
  "Qual o custo acumulado de LLM hoje?",
  "Rodar auditoria rápida do site",
];

/** Modelos sugeridos por motor no drawer de configuração. */
export const MODELOS_SUGERIDOS: Record<string, string[]> = {
  codex: [
    "gpt-5.6-luna",
    "gpt-5.5",
    "gpt-5.6-sol",
    "gpt-6-astra",
  ],
  antigravity: [
    "google/gemini-3.8-flash-high",
    "google/gemini-3.7-flash-high",
    "google/gemini-3.1-pro-high",
    "claude-sonnet-4-6",
  ],
  copilot: [
    "github/gpt-4o",
    "github/claude-3.5-sonnet",
    "github/gpt-4o-mini",
  ],
  opencode: [
    "opencode/nemotron-3-ultra-free",
    "opencode/nemotron-3.5-lightning-free",
    "opencode/mimo-v2.5-free",
    "opencode/ling-3.0-flash-fin-free",
    "opencode/muse-spark-1.3-contributor-free",
    "opencode/muse-spark-1.2-contributor-free",
    "opencode/big-pickle",
    "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
    "openrouter/nvidia/nemotron-3.5-lightning:free",
    "openrouter/google/gemma-4-26b-a4b-it:free",
    "opencode-go/glm-5.3-flash",
  ],
  "claude-code": [
    "claude-3-7-sonnet-20250219",
    "claude-3-5-sonnet-20241022",
  ],
  cursor: ["cursor-fast", "cursor-small"],
  "crom-agente": ["crom-default"],
};

/** Presets modernos de modelos no formato unificado provedor/modelo. */
export const MODELOS_PRESETS_POPULARES: string[] = [
  "opencode/nemotron-3-ultra-free",
  "opencode/nemotron-3.5-lightning-free",
  "opencode/mimo-v2.5-free",
  "opencode/ling-3.0-flash-fin-free",
  "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
  "openrouter/nvidia/nemotron-3.5-lightning:free",
  "openrouter/google/gemma-4-26b-a4b-it:free",
  "openrouter/google/gemini-2.5-flash",
  "openrouter/anthropic/claude-3.7-sonnet",
  "openrouter/openai/gpt-4o-mini",
];

/**
 * Infere o motor de execução (harness) a partir do prefixo do identificador do modelo.
 * No formato unificado provedor/modelo, a maioria dos modelos roda nativamente via OpenCode.
 */
export function inferirHarness(modelo: string): string {
  const m = (modelo || "").trim().toLowerCase();
  if (m.startsWith("claude-code/") || m.startsWith("anthropic/")) return "claude-code";
  if (m.startsWith("codex/") || m.startsWith("openai/")) return "codex";
  if (m.startsWith("antigravity/") || m.startsWith("agy/")) return "antigravity";
  if (m.startsWith("copilot/")) return "copilot";
  if (m.startsWith("cursor/")) return "cursor";
  if (m.startsWith("aider/")) return "aider";
  if (m.startsWith("crom/")) return "crom-agente";
  return "opencode";
}
