import { type ConversationDriver } from "./types.js";
import { OpenCodeConversationDriver } from "./OpenCodeConversationDriver.js";
import { DirectLlmConversationDriver } from "./DirectLlmConversationDriver.js";

export * from "./types.js";
export * from "./OpenCodeConversationDriver.js";
export * from "./DirectLlmConversationDriver.js";

export function criarConversationDriver(
  tipo: "opencode" | "direct-llm" | string,
  opcoes?: {
    porta?: number;
    homeDir?: string;
    defaultModel?: string;
  },
): ConversationDriver {
  if (tipo === "direct-llm") {
    return new DirectLlmConversationDriver({
      homeDir: opcoes?.homeDir,
      defaultModel: opcoes?.defaultModel,
    });
  }

  return new OpenCodeConversationDriver({
    porta: opcoes?.porta ?? 4096,
  });
}
