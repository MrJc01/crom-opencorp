/**
 * @file src/core/secrets-store.ts
 * @deprecated Módulo reorganizado para src/core/contexts/storage/secrets-store.ts.
 * Fachada mantida para retrocompatibilidade total com imports legados.
 */
export * from "./contexts/storage/secrets-store.js";
export { SecretsStore as default } from "./contexts/storage/secrets-store.js";
