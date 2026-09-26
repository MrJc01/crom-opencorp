import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { randomUUID } from "node:crypto";
import { opencorpHome } from "../../../utils/paths.js";
import { checkEngineAuthStatus, resolveEngineCredentials } from "../credentials-bridge.js";
import { CANONICAL_ENGINE_MANIFESTS, type EngineCapabilityManifest } from "../manifests.js";
import { normalizeEngineError } from "../error-normalizer.js";
import { CodexDriver } from "../drivers/codex-driver.js";
import type { AgentEvent } from "../events.js";
import type {
  AgentRunInput, AgentRunner, ConversationCreateInput, ConversationMessageInput, ConversationRef,
  ConversationRuntime, ConversationState, EngineAdapter, EngineAuthenticator, EngineAuthStatus,
  EngineInstaller, EngineInstallResult, EngineInstallStatus,
} from "../ports.js";

export interface CodexProcessHandle {
  pid: number;
  stdout: AsyncIterable<string | Buffer>;
  stderr?: AsyncIterable<string | Buffer>;
  exitCode: Promise<number>;
  kill: (signal?: NodeJS.Signals) => void;
}

export interface CodexLaunchOptions {
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd: string;
  signal?: AbortSignal;
}

export interface CodexAdapterOptions {
  homeDir?: string;
  binPath?: string;
  driver?: CodexDriver;
  installStatusProbe?: (homeDir: string) => Promise<EngineInstallStatus>;
  authStatusProbe?: (homeDir: string) => Promise<EngineAuthStatus>;
  customProcessLauncher?: (opts: CodexLaunchOptions) => Promise<CodexProcessHandle>;
}

interface CodexSessionMeta {
  id: string;
  nativeThreadId?: string;
  workspaceId: string;
  workspacePath: string;
  model?: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface CodexJsonEvent {
  type?: string;
  thread_id?: string;
  message?: string;
  error?: { message?: string } | string;
  item?: {
    id?: string;
    type?: string;
    text?: string;
    command?: string;
    aggregated_output?: string;
    exit_code?: number;
  };
  usage?: { input_tokens?: number; output_tokens?: number; cached_input_tokens?: number };
  text?: string;
  delta?: string;
}

type CodexInvocation =
  | { kind: "start" }
  | { kind: "resume"; threadId: string }
  | { kind: "fork"; threadId: string };

export class CodexAdapter implements EngineAdapter {
  readonly engineId = "codex";
  readonly name = "OpenAI Codex Engine";
  readonly manifest: EngineCapabilityManifest;
  readonly installer: EngineInstaller;
  readonly authenticator: EngineAuthenticator;
  readonly runner: AgentRunner;
  readonly conversationRuntime: ConversationRuntime;
  readonly modelCatalog = undefined;

  private readonly homeDir: string;
  private readonly binPath: string;
  private readonly driver: CodexDriver;
  private readonly customProcessLauncher?: CodexAdapterOptions["customProcessLauncher"];
  private readonly sessions = new Map<string, CodexSessionMeta>();

  constructor(options: CodexAdapterOptions = {}) {
    this.homeDir = options.homeDir ?? opencorpHome();
    this.driver = options.driver ?? new CodexDriver();
    this.binPath = options.binPath ?? "codex";
    this.customProcessLauncher = options.customProcessLauncher;
    this.manifest = CANONICAL_ENGINE_MANIFESTS.codex;

    this.installer = {
      engineId: this.engineId,
      status: options.installStatusProbe ?? ((home: string): Promise<EngineInstallStatus> => this.driver.isInstalled(home)),
      install: (home: string, onProgress?: (msg: string) => void): Promise<EngineInstallResult> =>
        this.driver.install(home, onProgress),
    };
    this.authenticator = {
      engineId: this.engineId,
      status: options.authStatusProbe ?? (async (home: string): Promise<EngineAuthStatus> => checkEngineAuthStatus(this.engineId, home)),
      fetchTokens: (home: string, creds?: { tokenOuChave?: string; authType?: string }) =>
        this.driver.fetchLiveTokens(home, creds),
    };
    this.runner = { engineId: this.engineId, run: (input, signal) => this.execute(input, { kind: "start" }, signal) };
    this.conversationRuntime = {
      engineId: this.engineId,
      create: (input) => this.createConversation(input),
      send: (ref, input, signal) => this.sendConversationMessage(ref, input, signal),
      resume: (ref) => this.resumeConversation(ref),
      fork: (ref) => this.forkConversation(ref),
      close: (ref) => this.closeConversation(ref),
    };
  }

  private buildArgs(input: AgentRunInput, invocation: CodexInvocation): string[] {
    const common = ["--json", "--skip-git-repo-check"];
    if (input.model && input.model !== "default") common.push("--model", input.model);
    if (invocation.kind === "resume") return ["exec", "resume", ...common, invocation.threadId, input.prompt];
    if (invocation.kind === "fork") {
      return input.prompt
        ? ["exec", "fork", ...common, invocation.threadId, input.prompt]
        : ["exec", "fork", ...common, invocation.threadId];
    }
    return ["exec", "--sandbox", "workspace-write", ...common, input.prompt];
  }

  private async launch(input: AgentRunInput, invocation: CodexInvocation, signal?: AbortSignal) {
    let bin = this.binPath;
    if (!this.customProcessLauncher && (!bin || bin === "codex")) {
      const status = await this.installer.status(input.homeDir || this.homeDir);
      bin = status.path || "codex";
    }
    const options: CodexLaunchOptions = {
      command: bin,
      args: this.buildArgs(input, invocation),
      cwd: input.workspacePath,
      signal,
      env: {
        ...(process.env as Record<string, string>),
        ...resolveEngineCredentials(input.homeDir || this.homeDir),
        ...(input.envOverrides ?? {}),
      },
    };
    if (this.customProcessLauncher) return this.customProcessLauncher(options);

    const spawnOptions: SpawnOptions = { cwd: options.cwd, env: options.env, stdio: ["ignore", "pipe", "pipe"] };
    const child: ChildProcess = spawn(options.command, options.args, spawnOptions);
    const exitCode = new Promise<number>((resolve) => {
      child.once("close", (code) => resolve(code ?? 1));
      child.once("error", () => resolve(1));
    });
    return {
      pid: child.pid ?? 0,
      stdout: child.stdout!,
      stderr: child.stderr ?? undefined,
      exitCode,
      kill: (sig: NodeJS.Signals = "SIGTERM") => { if (!child.killed) child.kill(sig); },
    } satisfies CodexProcessHandle;
  }

  private async *execute(
    input: AgentRunInput,
    invocation: CodexInvocation,
    signal?: AbortSignal,
    onThreadId?: (threadId: string) => void
  ): AsyncIterable<AgentEvent> {
    const runId = input.runId || `codex-run-${Date.now()}-${randomUUID().slice(0, 6)}`;
    yield { type: "run.started", runId, timestamp: new Date().toISOString(), engineId: this.engineId };

    let handle: CodexProcessHandle;
    try {
      handle = await this.launch(input, invocation, signal);
    } catch (error) {
      yield { type: "run.failed", runId, error: normalizeEngineError(error, { engineId: this.engineId, modelId: input.model }), timestamp: new Date().toISOString() };
      return;
    }

    let aborted = signal?.aborted ?? false;
    let timedOut = false;
    let timeoutTimer: NodeJS.Timeout | undefined;
    let killTimer: NodeJS.Timeout | undefined;
    let output = "";
    let protocolError: string | undefined;
    const terminate = () => {
      handle.kill("SIGTERM");
      if (killTimer) clearTimeout(killTimer);
      killTimer = setTimeout(() => handle.kill("SIGKILL"), 5_000);
    };
    const onAbort = () => { aborted = true; terminate(); };
    if (signal && !signal.aborted) signal.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) terminate();
    if (input.timeoutMs && input.timeoutMs > 0) {
      timeoutTimer = setTimeout(() => { timedOut = true; terminate(); }, input.timeoutMs);
    }
    const stderrPromise = (async () => {
      let stderr = "";
      if (handle.stderr) for await (const chunk of handle.stderr) stderr += chunk.toString();
      return stderr.trim();
    })();

    let buffer = "";
    try {
      for await (const chunk of handle.stdout) {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const event = this.parseJsonLine(line);
          if (!event) continue;
          if (event.type === "thread.started" && event.thread_id) onThreadId?.(event.thread_id);
          const text = this.extractAssistantText(event);
          if (text) {
            output += text;
            yield { type: "message.delta", runId, text, timestamp: new Date().toISOString() };
          }
          if (event.type === "item.started" && event.item?.type === "command_execution") {
            yield { type: "tool.requested", runId, call: { id: event.item.id || randomUUID(), name: "shell", arguments: { command: event.item.command || "" } }, timestamp: new Date().toISOString() };
          }
          if (event.type === "item.completed" && event.item?.type === "command_execution") {
            yield { type: "tool.completed", runId, result: { id: event.item.id || randomUUID(), name: "shell", result: event.item.aggregated_output || "", isError: typeof event.item.exit_code === "number" && event.item.exit_code !== 0 }, timestamp: new Date().toISOString() };
          }
          if (event.type === "turn.completed" && event.usage) {
            const promptTokens = event.usage.input_tokens;
            const completionTokens = event.usage.output_tokens;
            yield { type: "usage.updated", runId, usage: { promptTokens, completionTokens, totalTokens: typeof promptTokens === "number" && typeof completionTokens === "number" ? promptTokens + completionTokens : undefined }, timestamp: new Date().toISOString() };
          }
          if (event.type === "turn.failed" || event.type === "error") {
            protocolError = typeof event.error === "string" ? event.error : event.error?.message || event.message || "Falha no Codex";
          }
        }
      }
      if (buffer.trim()) {
        const event = this.parseJsonLine(buffer);
        if (event?.type === "thread.started" && event.thread_id) onThreadId?.(event.thread_id);
        const text = event ? this.extractAssistantText(event) : "";
        if (text) { output += text; yield { type: "message.delta", runId, text, timestamp: new Date().toISOString() }; }
      }

      const exitCode = await handle.exitCode;
      const stderr = await stderrPromise;
      if (!aborted && !timedOut && (exitCode !== 0 || protocolError)) {
        const message = protocolError || stderr || `Codex encerrou com código ${exitCode}`;
        yield { type: "run.failed", runId, error: normalizeEngineError(new Error(message), { engineId: this.engineId, modelId: input.model }), timestamp: new Date().toISOString() };
        return;
      }
      yield { type: "run.completed", runId, result: { output, stopReason: aborted ? "cancelled" : timedOut ? "timeout" : "completed" }, timestamp: new Date().toISOString() };
    } catch (error) {
      yield { type: "run.failed", runId, error: normalizeEngineError(error, { engineId: this.engineId, modelId: input.model }), timestamp: new Date().toISOString() };
    } finally {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  private parseJsonLine(line: string): CodexJsonEvent | undefined {
    const trimmed = line.trim();
    if (!trimmed) return undefined;
    try { return JSON.parse(trimmed) as CodexJsonEvent; } catch { return undefined; }
  }

  private extractAssistantText(event: CodexJsonEvent): string {
    if (event.type === "item.completed" && event.item?.type === "agent_message") return event.item.text || "";
    if (event.type === "message.delta") return event.delta || event.text || "";
    if (event.type === "delta" || event.type === "text") return event.text || event.delta || "";
    return "";
  }

  private async createConversation(input: ConversationCreateInput): Promise<ConversationRef> {
    const id = input.conversationId || `codex-session-${randomUUID()}`;
    const existing = this.sessions.get(id);
    if (existing) {
      if (input.model && input.model !== "default") existing.model = input.model;
      existing.updatedAt = new Date().toISOString();
    } else {
      const now = new Date().toISOString();
      this.sessions.set(id, { id, workspaceId: input.workspaceId, workspacePath: input.workspacePath, model: input.model === "default" ? undefined : input.model, title: input.title || "Conversa com Codex", createdAt: now, updatedAt: now });
    }
    return { id, engineId: this.engineId, workspaceId: input.workspaceId };
  }

  private async *sendConversationMessage(ref: ConversationRef, input: ConversationMessageInput, signal?: AbortSignal): AsyncIterable<AgentEvent> {
    const session = this.sessions.get(ref.id);
    if (!session || session.workspaceId !== ref.workspaceId) {
      yield { type: "run.failed", runId: `codex-run-${randomUUID()}`, error: normalizeEngineError(new Error(`Sessão Codex não encontrada: ${ref.id}`), { engineId: this.engineId }), timestamp: new Date().toISOString() };
      return;
    }
    const invocation: CodexInvocation = session.nativeThreadId ? { kind: "resume", threadId: session.nativeThreadId } : { kind: "start" };
    const runInput: AgentRunInput = {
      workspaceId: session.workspaceId, workspacePath: session.workspacePath, sessionId: ref.id,
      agentId: "secretario", model: session.model || "default", prompt: input.text, homeDir: this.homeDir,
    };
    for await (const event of this.execute(runInput, invocation, signal, (threadId) => {
      session.nativeThreadId = threadId;
      session.updatedAt = new Date().toISOString();
    })) yield event;
  }

  private async resumeConversation(ref: ConversationRef): Promise<ConversationState> {
    const session = this.sessions.get(ref.id);
    return {
      ref,
      status: session?.nativeThreadId ? "active" : session ? "idle" : "closed",
      lastActiveAt: session?.updatedAt || new Date().toISOString(),
      metadata: session ? { nativeThreadId: session.nativeThreadId, model: session.model || "default", title: session.title } : undefined,
    };
  }

  private async forkConversation(ref: ConversationRef): Promise<ConversationRef> {
    const source = this.sessions.get(ref.id);
    if (!source?.nativeThreadId) throw new Error("A conversa precisa ter ao menos um turno antes de criar um fork.");
    let nativeThreadId: string | undefined;
    let failure: Error | undefined;
    const input: AgentRunInput = {
      workspaceId: source.workspaceId, workspacePath: source.workspacePath, sessionId: ref.id,
      agentId: "secretario", model: source.model || "default", prompt: "", homeDir: this.homeDir,
    };
    for await (const event of this.execute(input, { kind: "fork", threadId: source.nativeThreadId }, undefined, (id) => { nativeThreadId = id; })) {
      if (event.type === "run.failed") failure = new Error(event.error.message);
    }
    if (failure) throw failure;
    if (!nativeThreadId) throw new Error("O Codex não retornou o ID da thread criada pelo fork.");
    const id = `codex-session-${randomUUID()}`;
    const now = new Date().toISOString();
    this.sessions.set(id, { ...source, id, nativeThreadId, title: `${source.title} (Fork)`, createdAt: now, updatedAt: now });
    return { id, engineId: this.engineId, workspaceId: source.workspaceId };
  }

  private async closeConversation(ref: ConversationRef): Promise<void> {
    this.sessions.delete(ref.id);
  }
}
