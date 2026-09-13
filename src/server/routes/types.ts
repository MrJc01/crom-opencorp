import type { IncomingMessage, ServerResponse } from "node:http";
import type { TaskStore } from "../../core/task-store.js";
import type { NotificationStore } from "../../core/notification-store.js";
import type { Scheduler } from "../../core/scheduler.js";
import type { RegistryStore } from "../../core/registry-store.js";
import type { SessaoApi } from "../index.js";

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
  homeDir?: string;
}
