import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "../../utils/fs-safe.js";

export interface ProcessKey {
  engineId: string;
  workspaceId: string;
}

export function formatProcessKey(key: ProcessKey): string {
  return `${key.engineId.trim().toLowerCase()}::${key.workspaceId.trim()}`;
}

export function parseProcessKey(keyString: string): ProcessKey {
  const parts = keyString.split("::");
  if (parts.length < 2) {
    return { engineId: parts[0] || "unknown", workspaceId: "unknown" };
  }
  return { engineId: parts[0], workspaceId: parts.slice(1).join("::") };
}

export type ProcessTransport = "http_server" | "stdio_jsonrpc" | "spawn_cli" | "embedded";

export type ProcessState =
  | "starting"
  | "ready"
  | "busy"
  | "idle"
  | "stopping"
  | "stopped"
  | "crashed";

export interface ManagedProcessRecord {
  key: ProcessKey;
  keyString: string;
  pid: number;
  pgid?: number;
  version?: string;
  cwd: string;
  transport: ProcessTransport;
  port?: number;
  startedAt: string;
  lastActiveAt: string;
  state: ProcessState;
  referenceCount: number;
  owner?: string;
  authVerified: boolean;
  expectedExecutableName?: string;
  metadata?: Record<string, unknown>;
}

export type ProcessLifecycleEvent =
  | { type: "process.registered"; record: ManagedProcessRecord }
  | { type: "process.acquired"; record: ManagedProcessRecord; refCount: number }
  | { type: "process.released"; record: ManagedProcessRecord; refCount: number }
  | { type: "process.active"; record: ManagedProcessRecord }
  | { type: "process.idle_timeout"; record: ManagedProcessRecord; idleMs: number }
  | { type: "process.terminating"; record: ManagedProcessRecord; signal: "SIGTERM" | "SIGKILL" }
  | { type: "process.terminated"; record: ManagedProcessRecord; exitCode?: number | null }
  | { type: "process.reconciled"; record: ManagedProcessRecord; action: "adopted" | "killed" | "ignored" };

export type ProcessLifecycleListener = (event: ProcessLifecycleEvent) => void;

export interface ProcessRegistryOptions {
  idleTimeoutMs?: number;
  gracePeriodMs?: number;
  clock?: () => number;
  setTimeoutFn?: (fn: () => void, ms: number) => any;
  clearTimeoutFn?: (timer: any) => void;
  killer?: (pid: number, signal: NodeJS.Signals) => void;
  isPidRunning?: (pid: number) => boolean;
  getPidCommandLine?: (pid: number) => string | null;
  pidfilesDir?: string;
}

export class ProcessRegistry {
  private static instance: ProcessRegistry | null = null;

  readonly idleTimeoutMs: number;
  readonly gracePeriodMs: number;
  private readonly clock: () => number;
  private readonly setTimeoutFn: (fn: () => void, ms: number) => any;
  private readonly clearTimeoutFn: (timer: any) => void;
  private readonly killer: (pid: number, signal: NodeJS.Signals) => void;
  private readonly isPidRunning: (pid: number) => boolean;
  private readonly getPidCommandLine: (pid: number) => string | null;
  private readonly pidfilesDir?: string;

  private records = new Map<string, ManagedProcessRecord>();
  private idleTimers = new Map<string, any>();
  private listeners = new Set<ProcessLifecycleListener>();

  constructor(opts: ProcessRegistryOptions = {}) {
    this.idleTimeoutMs = opts.idleTimeoutMs ?? 15 * 60 * 1000; // 15 minutos padrão (D2)
    this.gracePeriodMs = opts.gracePeriodMs ?? 5 * 1000; // 5 segundos de graça (D2)
    this.clock = opts.clock ?? (() => Date.now());
    this.setTimeoutFn = opts.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimeoutFn = opts.clearTimeoutFn ?? ((timer) => clearTimeout(timer));
    this.killer =
      opts.killer ??
      ((pid, sig) => {
        try {
          process.kill(pid, sig);
        } catch {
          // Processo pode já ter encerrado
        }
      });
    this.isPidRunning =
      opts.isPidRunning ??
      ((pid) => {
        try {
          process.kill(pid, 0);
          return true;
        } catch {
          return false;
        }
      });
    this.getPidCommandLine =
      opts.getPidCommandLine ??
      ((pid) => {
        try {
          const cmdPath = `/proc/${pid}/cmdline`;
          if (existsSync(cmdPath)) {
            return readFileSync(cmdPath, "utf8").replace(/\0/g, " ").trim();
          }
        } catch {
          //
        }
        return null;
      });
    this.pidfilesDir = opts.pidfilesDir;
  }

  public static getInstance(): ProcessRegistry {
    if (!ProcessRegistry.instance) {
      ProcessRegistry.instance = new ProcessRegistry();
    }
    return ProcessRegistry.instance;
  }

  public addListener(listener: ProcessLifecycleListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: ProcessLifecycleEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignora erros em listeners externos
      }
    }
  }

  private savePidfile(record: ManagedProcessRecord): void {
    if (!this.pidfilesDir) return;
    try {
      if (!existsSync(this.pidfilesDir)) {
        mkdirSync(this.pidfilesDir, { recursive: true });
      }
      const safeName = record.keyString.replace(/[^a-zA-Z0-9_-]/g, "_");
      const filePath = join(this.pidfilesDir, `${safeName}.json`);
      writeFileAtomic(filePath, JSON.stringify(record, null, 2)).catch(() => {});
    } catch {
      //
    }
  }

  private removePidfile(keyString: string): void {
    if (!this.pidfilesDir) return;
    try {
      const safeName = keyString.replace(/[^a-zA-Z0-9_-]/g, "_");
      const filePath = join(this.pidfilesDir, `${safeName}.json`);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    } catch {
      //
    }
  }

  public register(
    keyOrParams:
      | ProcessKey
      | {
          key: ProcessKey;
          pid: number;
          pgid?: number;
          version?: string;
          cwd: string;
          transport: ProcessTransport;
          port?: number;
          owner?: string;
          authVerified?: boolean;
          expectedExecutableName?: string;
          metadata?: Record<string, unknown>;
          initialRefCount?: number;
        },
    params?: {
      pid: number;
      pgid?: number;
      version?: string;
      cwd: string;
      transport: ProcessTransport;
      port?: number;
      owner?: string;
      authVerified?: boolean;
      expectedExecutableName?: string;
      metadata?: Record<string, unknown>;
      initialRefCount?: number;
    }
  ): ManagedProcessRecord {
    const isSingleArg =
      typeof keyOrParams === "object" && keyOrParams !== null && "pid" in keyOrParams && "key" in keyOrParams;
    const key: ProcessKey = isSingleArg ? (keyOrParams as any).key : (keyOrParams as ProcessKey);
    const p = isSingleArg ? (keyOrParams as any) : params!;

    const keyString = formatProcessKey(key);
    const existing = this.records.get(keyString);
    if (existing && this.isPidRunning(existing.pid)) {
      throw new Error(
        `Já existe um processo ativo registrado para a chave [${keyString}] (PID ${existing.pid}).`
      );
    }

    const nowIso = new Date(this.clock()).toISOString();
    const initialRefCount = p.initialRefCount ?? 1;

    const record: ManagedProcessRecord = {
      key: { engineId: key.engineId.trim().toLowerCase(), workspaceId: key.workspaceId.trim() },
      keyString,
      pid: p.pid,
      pgid: p.pgid,
      version: p.version,
      cwd: p.cwd,
      transport: p.transport,
      port: p.port,
      startedAt: nowIso,
      lastActiveAt: nowIso,
      state: initialRefCount > 0 ? "busy" : "idle",
      referenceCount: initialRefCount,
      owner: p.owner,
      authVerified: p.authVerified ?? true,
      expectedExecutableName: p.expectedExecutableName,
      metadata: p.metadata,
    };

    this.records.set(keyString, record);
    this.savePidfile(record);
    this.emit({ type: "process.registered", record });

    if (initialRefCount === 0) {
      this.scheduleIdleTimeout(keyString);
    }

    return record;
  }

  private toKeyString(key: ProcessKey | string): string {
    if (typeof key === "string") return key;
    return formatProcessKey(key);
  }

  public get(key: ProcessKey | string): ManagedProcessRecord | undefined {
    return this.records.get(this.toKeyString(key));
  }

  public list(): ManagedProcessRecord[] {
    return Array.from(this.records.values());
  }

  public acquire(key: ProcessKey | string): ManagedProcessRecord | undefined {
    const keyString = this.toKeyString(key);
    const record = this.records.get(keyString);
    if (!record) return undefined;

    if (!this.isPidRunning(record.pid)) {
      this.records.delete(keyString);
      this.clearIdleTimer(keyString);
      this.removePidfile(keyString);
      record.state = "crashed";
      this.emit({ type: "process.terminated", record, exitCode: null });
      return undefined;
    }

    this.clearIdleTimer(keyString);

    record.referenceCount += 1;
    record.state = "busy";
    record.lastActiveAt = new Date(this.clock()).toISOString();

    this.emit({ type: "process.acquired", record, refCount: record.referenceCount });
    this.savePidfile(record);

    return record;
  }

  public release(key: ProcessKey | string): ManagedProcessRecord | undefined {
    const keyString = this.toKeyString(key);
    const record = this.records.get(keyString);
    if (!record) return undefined;

    record.referenceCount = Math.max(0, record.referenceCount - 1);
    record.lastActiveAt = new Date(this.clock()).toISOString();

    if (record.referenceCount === 0) {
      record.state = "idle";
      this.scheduleIdleTimeout(keyString);
    }

    this.emit({ type: "process.released", record, refCount: record.referenceCount });
    this.savePidfile(record);

    return record;
  }

  /**
   * Remove o registro de um processo que já encerrou por conta própria, sem
   * enviar sinais. Só age se o PID registrado for o informado, para nunca
   * descartar um processo mais novo registrado na mesma chave.
   */
  public forget(key: ProcessKey | string, pid: number): boolean {
    const keyString = this.toKeyString(key);
    const record = this.records.get(keyString);
    if (!record || record.pid !== pid) return false;
    this.clearIdleTimer(keyString);
    this.records.delete(keyString);
    this.removePidfile(keyString);
    record.state = "stopped";
    this.emit({ type: "process.terminated", record, exitCode: null });
    return true;
  }

  public touch(key: ProcessKey | string): void {
    const keyString = this.toKeyString(key);
    const record = this.records.get(keyString);
    if (!record) return;

    record.lastActiveAt = new Date(this.clock()).toISOString();
    this.emit({ type: "process.active", record });

    if (record.referenceCount === 0 && record.state === "idle") {
      this.scheduleIdleTimeout(keyString);
    }
  }

  private clearIdleTimer(keyString: string): void {
    const timer = this.idleTimers.get(keyString);
    if (timer) {
      this.clearTimeoutFn(timer);
      this.idleTimers.delete(keyString);
    }
  }

  private scheduleIdleTimeout(keyString: string): void {
    this.clearIdleTimer(keyString);

    const timer = this.setTimeoutFn(async () => {
      const record = this.records.get(keyString);
      if (!record) return;

      if (record.referenceCount === 0 && record.state === "idle") {
        this.emit({
          type: "process.idle_timeout",
          record,
          idleMs: this.idleTimeoutMs,
        });

        await this.terminate(record.key, "idle_timeout");
      }
    }, this.idleTimeoutMs);

    this.idleTimers.set(keyString, timer);
  }

  public async terminate(key: ProcessKey, reason = "requested"): Promise<boolean> {
    const keyString = formatProcessKey(key);
    const record = this.records.get(keyString);
    if (!record) return false;

    this.clearIdleTimer(keyString);
    record.state = "stopping";
    record.metadata = { ...(record.metadata || {}), terminationReason: reason };

    this.emit({ type: "process.terminating", record, signal: "SIGTERM" });
    this.killer(record.pid, "SIGTERM");

    // Aguarda gracePeriodMs antes de enviar SIGKILL se necessário
    const isTerminated = await this.waitForExit(record.pid, this.gracePeriodMs);

    if (!isTerminated && this.isPidRunning(record.pid)) {
      this.emit({ type: "process.terminating", record, signal: "SIGKILL" });
      this.killer(record.pid, "SIGKILL");
      await this.waitForExit(record.pid, 1000);
    }

    record.state = "stopped";
    this.records.delete(keyString);
    this.removePidfile(keyString);

    this.emit({ type: "process.terminated", record, exitCode: 0 });
    return true;
  }

  private async waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
    const start = this.clock();
    while (this.clock() - start < timeoutMs) {
      if (!this.isPidRunning(pid)) {
        return true;
      }
      await new Promise<void>((r) => this.setTimeoutFn(r, 50));
    }
    return !this.isPidRunning(pid);
  }

  public async shutdownAll(reason = "shutdown"): Promise<number> {
    const records = Array.from(this.records.values());
    let terminated = 0;

    for (const record of records) {
      await this.terminate(record.key, reason);
      terminated++;
    }

    for (const timer of this.idleTimers.values()) {
      this.clearTimeoutFn(timer);
    }
    this.idleTimers.clear();

    return terminated;
  }

  public async reconcileBoot(opts: { killOrphans?: boolean } = {}): Promise<{
    adopted: number;
    killed: number;
    staleRemoved: number;
  }> {
    let adopted = 0;
    let killed = 0;
    let staleRemoved = 0;

    if (!this.pidfilesDir || !existsSync(this.pidfilesDir)) {
      return { adopted, killed, staleRemoved };
    }

    const files = readdirSync(this.pidfilesDir).filter((f) => f.endsWith(".json"));

    for (const file of files) {
      const filePath = join(this.pidfilesDir, file);
      let record: ManagedProcessRecord;
      try {
        record = JSON.parse(readFileSync(filePath, "utf8"));
      } catch {
        try {
          unlinkSync(filePath);
        } catch {}
        staleRemoved++;
        continue;
      }

      const isRunning = this.isPidRunning(record.pid);

      if (!isRunning) {
        // PID obsoleto/morto: descarta
        try {
          unlinkSync(filePath);
        } catch {}
        staleRemoved++;
        continue;
      }

      // PID está rodando: confirma identidade antes de adotar
      const cmdline = this.getPidCommandLine(record.pid);
      let identityConfirmed = false;

      if (cmdline && record.expectedExecutableName) {
        identityConfirmed = cmdline.includes(record.expectedExecutableName);
      } else if (cmdline && record.key?.engineId) {
        identityConfirmed = cmdline.includes(record.key.engineId);
      }

      if (!identityConfirmed) {
        // Não confirma identidade: não adota e remove pidfile obsoleto
        try {
          unlinkSync(filePath);
        } catch {}
        this.emit({ type: "process.reconciled", record, action: "ignored" });
        staleRemoved++;
        continue;
      }

      // Identidade confirmada
      if (opts.killOrphans) {
        this.killer(record.pid, "SIGTERM");
        await this.waitForExit(record.pid, this.gracePeriodMs);
        if (this.isPidRunning(record.pid)) {
          this.killer(record.pid, "SIGKILL");
        }
        try {
          unlinkSync(filePath);
        } catch {}
        this.emit({ type: "process.reconciled", record, action: "killed" });
        killed++;
      } else {
        // Adota no registro
        record.referenceCount = 0;
        record.state = "idle";
        this.records.set(record.keyString, record);
        this.scheduleIdleTimeout(record.keyString);
        this.emit({ type: "process.reconciled", record, action: "adopted" });
        adopted++;
      }
    }

    return { adopted, killed, staleRemoved };
  }
}

export const defaultProcessRegistry = ProcessRegistry.getInstance();
