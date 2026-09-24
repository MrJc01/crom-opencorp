/**
 * @file src/core/contexts/workspace/index.ts
 * Bounded Context: Workspace Management & Git Lifecycle (OpenCorp)
 */

export * from "./workspace-manager.js";
export { WorkspaceManager as default } from "./workspace-manager.js";
export * from "./workspace-git.js";
export * from "./settings-store.js";
export * from "./subcorp-store.js";
export * from "./secretario-git-slash.js";
