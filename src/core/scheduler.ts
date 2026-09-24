/**
 * @file src/core/scheduler.ts
 * @deprecated Módulo reorganizado para src/core/contexts/scheduling/scheduler.ts.
 * Fachada mantida para retrocompatibilidade total com imports legados.
 */
export * from "./contexts/scheduling/scheduler.js";
export { Scheduler as default } from "./contexts/scheduling/scheduler.js";
