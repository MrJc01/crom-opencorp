import type { IncomingMessage, ServerResponse } from "node:http";
import type { ZodType } from "zod";
import type { ProblemDetails } from "../http/problem-details.js";
import type { ResultadoValidacao } from "../http/validator.js";
import type { TaskStore } from "../../core/task-store.js";
import type { NotificationStore } from "../../core/notification-store.js";
import type { Scheduler } from "../../core/scheduler.js";
import type { RegistryStore } from "../../core/registry-store.js";
import type { MeetingManager } from "../../core/meeting-manager.js";
import type { WorkspaceManager } from "../../core/workspace-manager.js";
import type { TemplateStore } from "../../core/template-store.js";
import type { SessaoApi } from "../index.js";

import type { FlowStore } from "../../core/flow-store.js";
import type { AgentStore } from "../../core/agent-store.js";
import type { TeamStore } from "../../core/team-store.js";
import type { OpencodeServerManager } from "../../core/opencode-server.js";
import type { HookStore } from "../../core/hook-store.js";
import type { SettingsStore } from "../../core/settings-store.js";
import type { SkillStore } from "../../core/skill-store.js";
import type { SecretsStore } from "../../core/secrets-store.js";
import type { AppStore } from "../../core/app-store.js";
import type { EngineAccountStore } from "../../core/engines/index.js";

import type { PromptStore } from "../../core/prompt-store.js";
import type { ApprovalsStore } from "../../core/approvals-store.js";

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
  orquestrador?: import("../../core/team-orchestrator.js").OrquestradorDeTeams;

  // ── RFC 7807 (Passo 2 da padronização) ─────────────────────────────
  /** Envia uma resposta RFC 7807 `application/problem+json`. */
  enviarProblema?: (res: ServerResponse, problema: ProblemDetails) => void;
  /** Lê, parseia e valida o corpo da requisição contra um schema Zod. */
  validarCorpo?: <T>(req: IncomingMessage, schema: ZodType<T>, instance?: string) => Promise<ResultadoValidacao<T>>;
}




