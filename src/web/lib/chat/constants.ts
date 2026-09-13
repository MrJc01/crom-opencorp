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
    "opencode-go/glm-5.3-flash",
    "opencode-go/glm-5.3",
    "opencode/nemotron-3-ultra-free",
    "opencode/nemotron-3.5-lightning-free",
    "opencode/big-pickle",
  ],
  "claude-code": [
    "claude-3-7-sonnet-20250219",
    "claude-3-5-sonnet-20241022",
  ],
  cursor: ["cursor-fast", "cursor-small"],
  "crom-agente": ["crom-default"],
};
