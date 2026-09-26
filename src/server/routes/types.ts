import type { IncomingMessage, ServerResponse } from "node:http";
import type { ZodType } from "zod";
import type { ProblemDetails } from "../http/problem-details.js";
import type { ResultadoValidacao } from "../http/validator.js";
import type { TaskStore } from "../../core/contexts/storage/task-store.js";
import type { NotificationStore } from "../../core/contexts/platform/notification-store.js";
import type { Scheduler } from "../../core/contexts/scheduling/scheduler.js";
import type { RegistryStore } from "../../core/contexts/storage/registry-store.js";
import type { MeetingManager } from "../../core/contexts/meetings/meeting-manager.js";
import type { WorkspaceManager } from "../../core/contexts/workspace/workspace-manager.js";
import type { TemplateStore } from "../../core/contexts/platform/template-store.js";
import type { SessaoApi } from "../index.js";

import type { FlowStore } from "../../core/contexts/orchestration/flow-store.js";
import type { AgentStore } from "../../core/contexts/agents/agent-store.js";
import type { TeamStore } from "../../core/contexts/meetings/team-store.js";
import type { OpencodeServerManager } from "../../core/contexts/execution/opencode-server.js";
import type { HookStore } from "../../core/contexts/scheduling/hook-store.js";
import type { SettingsStore } from "../../core/contexts/workspace/settings-store.js";
import type { SkillStore } from "../../core/contexts/agents/skill-store.js";
import type { SecretsStore } from "../../core/contexts/storage/secrets-store.js";
import type { AppStore } from "../../core/contexts/platform/app-store.js";
import type { EngineAccountStore } from "../../core/engines/index.js";
import type { ConversationRuntimeResolver } from "../../core/engines/conversation-resolver.js";

import type { PromptStore } from "../../core/contexts/agents/prompt-store.js";
import type { ApprovalsStore } from "../../core/contexts/platform/approvals-store.js";

export interface WebhookLimiterLike {
  check: (ip: string) => { ok: boolean; retryAfter?: number };
}

export interface RouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  rota: string;
  resolverWs: (url: URL) => Promise<{ id: string; path: string }>;
  lerCorpo: (req: IncomingMessage, maxBytes?: number) => Promise<unknown>;
  enviar: (res: ServerResponse, status: number, corpo: unknown, headersExtras?: Record<string, string>) => void;
  tasks: TaskStore;
  scheduler: Scheduler;
  registros: RegistryStore;
  sessoes: SessaoApi;
  notificacoes: NotificationStore;
  meetings: MeetingManager;
  workspaces: WorkspaceManager;
  flows?: FlowStore;
  agentes?: AgentStore;
  teams?: TeamStore;
  templates?: TemplateStore;
  opencodeServer?: OpencodeServerManager;
  conversationRuntimeResolver?: ConversationRuntimeResolver;
  hooks?: HookStore;
  settings?: SettingsStore;
  skillStore?: SkillStore;
  secretsStore?: SecretsStore;
  apps?: AppStore;
  engineAccounts?: EngineAccountStore;
  prompts?: PromptStore;
  approvals?: ApprovalsStore;
  docsRoot?: string;
  resolverCaminhoWorkspace?: (wsPath: string, pathParam: string) => Promise<string>;
  homeDir?: string;
  webhookLimiter?: WebhookLimiterLike;
  portaOpencodeOuErro?: (autoIniciar?: boolean) => Promise<number>;
  sincronizarSessaoNoCorp?: (porta: number, sessaoId: string) => Promise<void>;
  gerarIdExec?: () => string;
  serverPort?: number;
  version?: string;
  orquestrador?: import("../../core/contexts/meetings/team-orchestrator.js").OrquestradorDeTeams;

  // ── RFC 7807 (Passo 2 da padronização) ─────────────────────────────
  /** Envia uma resposta RFC 7807 `application/problem+json`. */
  enviarProblema?: (res: ServerResponse, problema: ProblemDetails) => void;
  /** Lê, parseia e valida o corpo da requisição contra um schema Zod. */
  validarCorpo?: <T>(req: IncomingMessage, schema: ZodType<T>, instance?: string) => Promise<ResultadoValidacao<T>>;
}




