/**
 * @file src/core/session-manager.ts
 * @deprecated Módulo reorganizado para src/core/contexts/execution/session-manager.ts.
 * Fachada mantida para retrocompatibilidade total com imports legados.
 */
export * from "./contexts/execution/session-manager.js";
export { SessionManager as default } from "./contexts/execution/session-manager.js";
