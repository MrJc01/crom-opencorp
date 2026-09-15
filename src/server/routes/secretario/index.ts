import type { RouteContext } from "../types.js";
import { handleDaemonRoutes } from "./daemon.js";
import { handleOrdemRoutes } from "./ordem.js";
import { handleConversaRoutes } from "./conversa.js";
import { handleStreamRoutes } from "./stream.js";
import { handleKeysRoutes } from "./keys.js";
import { handleHitlRoutes } from "./hitl.js";

export { parsearModelo } from "./helpers.js";
export * from "./helpers.js";
export * from "./mentions.js";
export * from "./slash.js";
export * from "./daemon.js";
export * from "./ordem.js";
export * from "./conversa.js";
export * from "./stream.js";
export * from "./keys.js";
export * from "./hitl.js";

export async function handleSecretarioRoutes(ctx: RouteContext): Promise<boolean> {
  if (await handleDaemonRoutes(ctx)) return true;
  if (await handleOrdemRoutes(ctx)) return true;
  if (await handleConversaRoutes(ctx)) return true;
  if (await handleStreamRoutes(ctx)) return true;
  if (await handleKeysRoutes(ctx)) return true;
  if (await handleHitlRoutes(ctx)) return true;
  return false;
}
