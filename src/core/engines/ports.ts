import type { AgentEvent } from "./events.js";
import type { EngineCapabilityManifest } from "./manifests.js";
import type { EngineInstallStatus, EngineTokenUsage } from "./types.js";
import type { EngineAuthStatus } from "./credentials-bridge.js";

export type { EngineAuthStatus, EngineInstallStatus, EngineTokenUsage };

export interface EngineInstallResult {
  success: boolean;
  path: string;
  version: string;
  log: string;
}

export interface EngineInstaller {
  readonly engineId: string;
  status(homeDir: string): Promise<EngineInstallStatus>;
  install(homeDir: string, onProgress?: (msg: string) => void): Promise<EngineInstallResult>;
  uninstall?(homeDir: string): Promise<void>;
}

export interface EngineLoginInput {
  accountId?: string;
  tokenOuChave?: string;
  authType?: string;
}

export interface EngineAuthenticator {
  readonly engineId: string;
  status(homeDir: string, accountId?: string): Promise<EngineAuthStatus>;
  login?(input: EngineLoginInput): Promise<{ success: boolean; message: string }>;
  logout?(accountId?: string): Promise<void>;
  fetchTokens?(
    homeDir: string,
    accountCredentials?: { tokenOuChave?: string; authType?: string }
  ): Promise<EngineTokenUsage>;
}

export interface AgentRunInput {
  runId?: string;
  workspaceId: string;
  workspacePath: string;
  sessionId: string;
  agentId: string;
  model: string;
  prompt: string;
  homeDir: string;
  envOverrides?: Record<string, string>;
  timeoutMs?: number;
}

export interface AgentRunner {
  readonly engineId: string;
  run(input: AgentRunInput, signal?: AbortSignal): AsyncIterable<AgentEvent>;
  cancel?(runId: string): Promise<void>;
}

export interface ConversationCreateInput {
  conversationId?: string;
  workspaceId: string;
  workspacePath: string;
  model: string;
  homeDir: string;
  title?: string;
}

export interface ConversationRef {
  id: string;
  engineId: string;
  workspaceId: string;
}

export interface ConversationMessageInput {
  text: string;
  role?: "user" | "system";
}

export interface ConversationState {
  ref: ConversationRef;
  status: "active" | "idle" | "closed" | "error";
  lastActiveAt: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationRuntime {
  readonly engineId: string;
  create(input: ConversationCreateInput): Promise<ConversationRef>;
  send(ref: ConversationRef, input: ConversationMessageInput, signal?: AbortSignal): AsyncIterable<AgentEvent>;
  resume(ref: ConversationRef): Promise<ConversationState>;
  fork?(ref: ConversationRef): Promise<ConversationRef>;
  /**
   * Responde a um `approval.requested` emitido por `send`. Retorna `false`
   * quando o ID não pertence ao workspace informado (ou não está pendente).
   */
  respondApproval?(
    approvalId: string,
    decision: "approve" | "reject",
    scope: { workspaceId: string }
  ): Promise<boolean>;
  close(ref: ConversationRef): Promise<void>;
}

export interface ModelDescriptor {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  isFree?: boolean;
}

export interface ModelProbeResult {
  available: boolean;
  latencyMs?: number;
  reason?: string;
}

export interface ModelCatalogSource {
  readonly engineId: string;
  listModels(accountId?: string): Promise<ModelDescriptor[]>;
  probe?(model: { provider: string; id: string }): Promise<ModelProbeResult>;
}

export interface EngineAdapter {
  readonly engineId: string;
  readonly name: string;
  readonly manifest: EngineCapabilityManifest;
  readonly installer: EngineInstaller;
  readonly authenticator: EngineAuthenticator;
  readonly runner: AgentRunner;
  readonly conversationRuntime?: ConversationRuntime;
  readonly modelCatalog?: ModelCatalogSource;
}
