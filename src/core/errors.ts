/**
 * @file src/core/errors.ts
 * @deprecated Módulo reorganizado para src/core/shared/errors.ts.
 * Fachada mantida para retrocompatibilidade total com imports legados.
 */
export * from "./shared/errors.js";
export { OpencorpError as default } from "./shared/errors.js";
