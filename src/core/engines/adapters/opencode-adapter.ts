import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, openSync } from "node:fs";
import { join, dirname } from "node:path";
import { opencorpHome } from "../../../utils/paths.js";
import { checkEngineAuthStatus } from "../credentials-bridge.js";
import { envOpencodeIsolado } from "../../contexts/execution/opencode-server.js";
import { CANONICAL_ENGINE_MANIFESTS, type EngineCapabilityManifest } from "../manifests.js";
import { formatProcessKey, ProcessRegistry } from "../../runtime/process-registry.js";
import { normalizeEngineError } from "../error-normalizer.js";
import { OpencodeDriver } from "../drivers/opencode-driver.js";
import type { AgentEvent } from "../events.js";
import type {
  AgentRunInput,
  AgentRunner,
  ConversationCreateInput,
  ConversationMessageInput,
  ConversationRef,
  ConversationRuntime,
  ConversationState,
  EngineAdapter,
  EngineAuthenticator,
  EngineAuthStatus,
  EngineInstaller,
  EngineInstallResult,
  EngineInstallStatus,
  ModelCatalogSource,
  ModelDescriptor,
} from "../ports.js";

async function buscarPortaLivreLoopback(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      server.close(() => {
        if (addr && typeof addr === "object") resolve(addr.port);
        else reject(new Error("Não foi possível obter porta livre em loopback"));
      });
    });
    server.on("error", reject);
  });
}

async function aguardarPortaPronta(port: number, timeoutMs = 25000): Promise<boolean> {
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok || res.status === 401 || res.status === 404) {
        return true;
      }
    } catch {
      // continua tentando até o timeout
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

export interface OpenCodeAdapterOptions {
  homeDir?: string;
  binPath?: string;
  driver?: OpencodeDriver;
  processRegistry?: ProcessRegistry;
  customServerLauncher?: (opts: {
    port: number;
    authToken: string;
    workspaceDir: string;
    workspaceId: string;
  }) => Promise<{ pid: number; unref?: () => void; close?: () => Promise<void> }>;
}

interface ConversationSessionMeta {
  port: number;
  authToken: string;
  workspaceDir: string;
  url: string;
}

export class OpenCodeAdapter implements EngineAdapter {
  readonly engineId = "opencode";
  readonly name = "OpenCode Engine";
  readonly manifest: EngineCapabilityManifest;
  readonly installer: EngineInstaller;
  readonly authenticator: EngineAuthenticator;
  readonly runner: AgentRunner;
  readonly conversationRuntime: ConversationRuntime;
  readonly modelCatalog?: ModelCatalogSource;

  private readonly homeDir: string;
  private readonly binPath: string;
  private readonly driver: OpencodeDriver;
  private readonly processRegistry: ProcessRegistry;
  private readonly customServerLauncher?: OpenCodeAdapterOptions["customServerLauncher"];
  private readonly activeConversations = new Map<string, ConversationSessionMeta>();

  constructor(options: OpenCodeAdapterOptions = {}) {
    this.homeDir = options.homeDir ?? opencorpHome();
    this.driver = options.driver ?? new OpencodeDriver();
    this.binPath = options.binPath ?? "opencode";
    this.processRegistry = options.processRegistry ?? ProcessRegistry.getInstance();
    this.customServerLauncher = options.customServerLauncher;
    this.manifest = CANONICAL_ENGINE_MANIFESTS["opencode"] ?? {
      engineId: "opencode",
      name: "OpenCode Engine",
      transport: "http_server",
      supportsConversation: true,
      features: {
        streaming: { level: "integrated" },
        continuation: { level: "integrated" },
        fork: { level: "integrated" },
        hitl: { level: "integrated" },
        tools: { level: "integrated" },
        mcp: { level: "integrated" },
        images: { level: "integrated" },
        cancellation: { level: "integrated" },
      },
    };

    // 1. Porta do Instalador
    this.installer = {
      engineId: this.engineId,
      status: async (home: string): Promise<EngineInstallStatus> => {
        return this.driver.isInstalled(home);
      },
      install: async (home: string, onProgress?: (msg: string) => void): Promise<EngineInstallResult> => {
        return this.driver.install(home, onProgress);
      },
    };

    // 2. Porta do Autenticador
    this.authenticator = {
      engineId: this.engineId,
      status: async (home: string): Promise<EngineAuthStatus> => {
        return checkEngineAuthStatus(this.engineId, home);
      },
      fetchTokens: async (home: string, creds?: { tokenOuChave?: string; authType?: string }) => {
        return this.driver.fetchLiveTokens(home, creds);
      },
    };

    // 3. Porta do Runner One-Shot (CLI estruturado)
    this.runner = {
      engineId: this.engineId,
      run: (input: AgentRunInput, signal?: AbortSignal) => this.executeOneShot(input, signal),
    };

    // 4. Porta do Runtime Conversacional (Sessões HTTP isoladas)
    this.conversationRuntime = {
      engineId: this.engineId,
      create: (input: ConversationCreateInput) => this.createConversation(input),
      send: (ref: ConversationRef, input: ConversationMessageInput, signal?: AbortSignal) =>
        this.sendConversationMessage(ref, input, signal),
      resume: (ref: ConversationRef) => this.resumeConversation(ref),
      fork: (ref: ConversationRef) => this.forkConversation(ref),
      close: (ref: ConversationRef) => this.closeConversation(ref),
    };

    // 5. Catálogo de Modelos
    this.modelCatalog = {
      engineId: this.engineId,
      listModels: async (): Promise<ModelDescriptor[]> => {
        return [
          {
            id: "opencode/nemotron-3-ultra-free",
            name: "Nemotron 3 Ultra (Gratuito)",
            provider: "opencode",
            contextWindow: 128000,
            isFree: true,
          },
          {
            id: "opencode/nemotron-3.5-lightning-free",
            name: "Nemotron 3.5 Lightning (Gratuito)",
            provider: "opencode",
            contextWindow: 128000,
            isFree: true,
          },
          {
            id: "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
            name: "Nemotron Ultra 550B (OpenRouter)",
            provider: "openrouter",
            contextWindow: 128000,
            isFree: true,
          },
        ];
      },
    };
  }

  /**
   * Executa tarefa one-shot via CLI estruturado do OpenCode
   */
  private async *executeOneShot(input: AgentRunInput, externalSignal?: AbortSignal): AsyncIterable<AgentEvent> {
    const bin = this.binPath || (await this.installer.status(this.homeDir)).path || "opencode";
    const args: string[] = ["run", "--format", "json"];

    if (input.model) {
      args.push("--model", input.model);
    }
    if (input.workspacePath) {
      args.push("--dir", input.workspacePath);
    }
    if (input.sessionId) {
      args.push("--session", input.sessionId);
    }
    args.push(input.prompt);

    const env = envOpencodeIsolado(this.homeDir, input.workspaceId, input.workspacePath) as Record<string, string>;
    if (input.envOverrides) {
      Object.assign(env, input.envOverrides);
    }

    const runId = input.runId || `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const timestamp = new Date().toISOString();

    yield {
      type: "run.started",
      runId,
      timestamp,
      engineId: this.engineId,
    };

    let child: ChildProcess | null = null;
    let timedOut = false;
    let aborted = false;

    try {
      child = spawn(bin, args, {
        cwd: input.workspacePath,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      const normErr = normalizeEngineError(err, { engineId: this.engineId, modelId: input.model });
      yield {
        type: "run.failed",
        runId,
        error: normErr,
        timestamp: new Date().toISOString(),
      };
      return;
    }

    const pid = child.pid ?? 0;

    const exitPromise = new Promise<void>((resolve, reject) => {
      if (!child) return resolve();
      child.on("close", (code) => {
        if (code === 0 || code === null) resolve();
        else reject(new Error(`Processo opencode finalizou com código ${code}`));
      });
      child.on("error", reject);
    });

    // Timeout e watchdog
    let timeoutTimer: NodeJS.Timeout | null = null;
    if (input.timeoutMs && input.timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        if (child && !child.killed && pid > 0) {
          try {
            process.kill(pid, "SIGTERM");
            setTimeout(() => {
              try {
                if (child && !child.killed) process.kill(pid, "SIGKILL");
              } catch {}
            }, 5000);
          } catch {}
        }
      }, input.timeoutMs);
    }

    // Cancelamento
    const onAbort = () => {
      aborted = true;
      if (child && !child.killed && pid > 0) {
        try {
          process.kill(pid, "SIGTERM");
          setTimeout(() => {
            try {
              if (child && !child.killed) process.kill(pid, "SIGKILL");
            } catch {}
          }, 5000);
        } catch {}
      }
    };

    const activeSignal = externalSignal;
    if (activeSignal) {
      if (activeSignal.aborted) {
        onAbort();
      } else {
        activeSignal.addEventListener("abort", onAbort, { once: true });
      }
    }

    let buffer = "";
    let fullOutput = "";

    try {
      if (child.stdout) {
        for await (const chunk of child.stdout) {
          const text = chunk.toString("utf8");
          buffer += text;

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // Tenta decodificar JSON lines estruturadas do OpenCode
            if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
              try {
                const parsed = JSON.parse(trimmed);
                if (parsed.type === "thought" || parsed.thought) {
                  const thoughtText = parsed.thought || parsed.content || "";
                  fullOutput += thoughtText;
                  yield {
                    type: "message.delta",
                    runId,
                    text: thoughtText,
                    timestamp: new Date().toISOString(),
                  };
                } else if (parsed.type === "tool" || parsed.tool) {
                  yield {
                    type: "tool.requested",
                    runId,
                    call: {
                      id: parsed.id || `call-${Date.now()}`,
                      name: parsed.tool || parsed.name || "unknown",
                      arguments: parsed.input ?? {},
                    },
                    timestamp: new Date().toISOString(),
                  };
                } else if (parsed.type === "tool_result" || parsed.result) {
                  yield {
                    type: "tool.completed",
                    runId,
                    result: {
                      id: parsed.id || `call-${Date.now()}`,
                      name: parsed.tool || parsed.name || "unknown",
                      result: parsed.result ?? parsed.output,
                      isError: Boolean(parsed.isError),
                    },
                    timestamp: new Date().toISOString(),
                  };
                } else if (parsed.type === "text" || parsed.text) {
                  const textDelta = parsed.text || parsed.content || "";
                  fullOutput += textDelta;
                  yield {
                    type: "message.delta",
                    runId,
                    text: textDelta,
                    timestamp: new Date().toISOString(),
                  };
                }
              } catch {
                fullOutput += `${trimmed}\n`;
                yield {
                  type: "message.delta",
                  runId,
                  text: `${trimmed}\n`,
                  timestamp: new Date().toISOString(),
                };
              }
            } else {
              fullOutput += `${trimmed}\n`;
              yield {
                type: "message.delta",
                runId,
                text: `${trimmed}\n`,
                timestamp: new Date().toISOString(),
              };
            }
          }
        }
      }

      if (buffer.trim()) {
        fullOutput += buffer.trim();
        yield {
          type: "message.delta",
          runId,
          text: buffer.trim(),
          timestamp: new Date().toISOString(),
        };
      }

      await exitPromise;

      yield {
        type: "run.completed",
        runId,
        result: {
          output: fullOutput,
          stopReason: "completed",
        },
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      if (!aborted && !timedOut) {
        const norm = normalizeEngineError(err, { engineId: this.engineId, modelId: input.model });
        yield {
          type: "run.failed",
          runId,
          error: norm,
          timestamp: new Date().toISOString(),
        };
      } else if (aborted) {
        yield {
          type: "run.completed",
          runId,
          result: {
            output: fullOutput,
            stopReason: "cancelled",
          },
          timestamp: new Date().toISOString(),
        };
      } else if (timedOut) {
        yield {
          type: "run.completed",
          runId,
          result: {
            output: fullOutput,
            stopReason: "timeout",
          },
          timestamp: new Date().toISOString(),
        };
      }
    } finally {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (activeSignal) {
        activeSignal.removeEventListener("abort", onAbort);
      }
    }
  }

  /**
   * Cria nova sessão conversacional persistente no servidor OpenCode
   */
  private async createConversation(input: ConversationCreateInput): Promise<ConversationRef> {
    const key = formatProcessKey({ engineId: this.engineId, workspaceId: input.workspaceId });
    const existingRecord = this.processRegistry.get(key);

    let port: number;
    let authToken: string;

    if (existingRecord && existingRecord.state !== "stopped" && existingRecord.state !== "crashed") {
      this.processRegistry.acquire(key);
      this.processRegistry.touch(key);
      port = existingRecord.port || (existingRecord.metadata?.port as number);
      authToken = (existingRecord.metadata?.authToken as string) || "";
    } else {
      // Inicia novo processo de servidor dedicado ao workspace em loopback
      port = await buscarPortaLivreLoopback();
      authToken = randomUUID();

      let childPid: number;

      if (this.customServerLauncher) {
        const custom = await this.customServerLauncher({
          port,
          authToken,
          workspaceDir: input.workspacePath,
          workspaceId: input.workspaceId,
        });
        childPid = custom.pid;
      } else {
        const bin = this.binPath || (await this.installer.status(this.homeDir)).path || "opencode";
        const logPath = join(this.homeDir, "logs", `opencode-${input.workspaceId}.log`);
        const logDir = dirname(logPath);
        if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });

        const env = envOpencodeIsolado(this.homeDir, input.workspaceId, input.workspacePath) as Record<string, string>;
        env.OPENCODE_SERVER_TOKEN = authToken;

        const options: SpawnOptions = {
          cwd: input.workspacePath,
          env,
          detached: true,
          stdio: ["ignore", openSync(logPath, "a"), openSync(logPath, "a")],
        };

        const child = spawn(bin, ["serve", "--port", String(port), "--hostname", "127.0.0.1"], options);
        childPid = child.pid ?? 0;
        child.unref();

        const ok = await aguardarPortaPronta(port, 15000);
        if (!ok) {
          try {
            if (childPid > 0) process.kill(childPid, "SIGKILL");
          } catch {}
          throw new Error(`OpenCode server não iniciou na porta ${port} para o workspace ${input.workspaceId}`);
        }
      }

      this.processRegistry.register({
        key: { engineId: this.engineId, workspaceId: input.workspaceId },
        pid: childPid,
        cwd: input.workspacePath,
        transport: "http_server",
        port,
        expectedExecutableName: "opencode",
        authVerified: true,
        metadata: {
          port,
          authToken,
          workspaceDir: input.workspacePath,
        },
      });
    }

    const baseUrl = `http://127.0.0.1:${port}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    };

    // Cria a sessão remota no servidor
    const res = await fetch(`${baseUrl}/session`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: input.title || "Nova conversa",
      }),
    });

    if (!res.ok) {
      throw new Error(`Falha ao criar sessão no servidor OpenCode: HTTP ${res.status}`);
    }

    const data = (await res.json()) as { id: string };
    const sessionId = data.id || input.conversationId || `opencode-sess-${Date.now()}`;

    this.activeConversations.set(sessionId, {
      port,
      authToken,
      workspaceDir: input.workspacePath,
      url: baseUrl,
    });

    return {
      id: sessionId,
      engineId: this.engineId,
      workspaceId: input.workspaceId,
    };
  }

  /**
   * Envia mensagem em sessão conversacional persistente
   */
  private async *sendConversationMessage(
    ref: ConversationRef,
    input: ConversationMessageInput,
    signal?: AbortSignal
  ): AsyncIterable<AgentEvent> {
    const key = formatProcessKey({ engineId: this.engineId, workspaceId: ref.workspaceId });
    this.processRegistry.touch(key);

    const meta = this.activeConversations.get(ref.id);
    const baseUrl = meta?.url || `http://127.0.0.1:${meta?.port ?? 4096}`;
    const authToken = meta?.authToken || "";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    };

    const runId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const timestamp = new Date().toISOString();

    yield {
      type: "run.started",
      runId,
      timestamp,
      engineId: this.engineId,
    };

    let fullOutput = "";

    try {
      const res = await fetch(`${baseUrl}/session/${encodeURIComponent(ref.id)}/message`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: input.text,
        }),
        signal: signal ?? AbortSignal.timeout(60000),
      });

      if (!res.ok) {
        const errTxt = await res.text().catch(() => "");
        throw new Error(`Servidor OpenCode retornou HTTP ${res.status}: ${errTxt}`);
      }

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const body = (await res.json()) as {
          parts?: Array<{ type: string; text?: string; thought?: string; tool?: string; result?: unknown }>;
          resposta?: string;
        };

        for (const p of body.parts ?? []) {
          if (p.thought) {
            fullOutput += p.thought;
            yield {
              type: "message.delta",
              runId,
              text: p.thought,
              timestamp: new Date().toISOString(),
            };
          }
          if (p.tool) {
            yield {
              type: "tool.requested",
              runId,
              call: {
                id: `call-${Date.now()}`,
                name: p.tool,
                arguments: (p as any).input ?? {},
              },
              timestamp: new Date().toISOString(),
            };
          }
          if (p.text) {
            fullOutput += p.text;
            yield {
              type: "message.delta",
              runId,
              text: p.text,
              timestamp: new Date().toISOString(),
            };
          }
        }

        if (body.resposta && (!body.parts || body.parts.length === 0)) {
          fullOutput += body.resposta;
          yield {
            type: "message.delta",
            runId,
            text: body.resposta,
            timestamp: new Date().toISOString(),
          };
        }
      } else {
        const reader = res.body?.getReader();
        if (reader) {
          const decoder = new TextDecoder();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunkText = decoder.decode(value, { stream: true });
            fullOutput += chunkText;
            yield {
              type: "message.delta",
              runId,
              text: chunkText,
              timestamp: new Date().toISOString(),
            };
          }
        }
      }

      yield {
        type: "run.completed",
        runId,
        result: {
          output: fullOutput,
          stopReason: "completed",
        },
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      const isAbort = signal?.aborted;
      if (isAbort) {
        try {
          await fetch(`${baseUrl}/session/${encodeURIComponent(ref.id)}/abort`, {
            method: "POST",
            headers,
            signal: AbortSignal.timeout(2000),
          });
        } catch {}

        yield {
          type: "run.completed",
          runId,
          result: {
            output: fullOutput,
            stopReason: "cancelled",
          },
          timestamp: new Date().toISOString(),
        };
      } else {
        const norm = normalizeEngineError(err, { engineId: this.engineId });
        yield {
          type: "run.failed",
          runId,
          error: norm,
          timestamp: new Date().toISOString(),
        };
      }
    }
  }

  /**
   * Consulta estado atual de uma sessão conversacional
   */
  private async resumeConversation(ref: ConversationRef): Promise<ConversationState> {
    const key = formatProcessKey({ engineId: this.engineId, workspaceId: ref.workspaceId });
    this.processRegistry.touch(key);

    const meta = this.activeConversations.get(ref.id);
    const baseUrl = meta?.url || `http://127.0.0.1:${meta?.port ?? 4096}`;
    const authToken = meta?.authToken || "";
    const headers: Record<string, string> = {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    };

    try {
      const res = await fetch(`${baseUrl}/session/${encodeURIComponent(ref.id)}`, {
        headers,
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        return {
          ref,
          status: "idle",
          lastActiveAt: new Date().toISOString(),
          metadata: {
            port: meta?.port,
            authToken: meta?.authToken,
            workspaceDir: meta?.workspaceDir,
          },
        };
      }

      return {
        ref,
        status: "closed",
        lastActiveAt: new Date().toISOString(),
      };
    } catch {
      return {
        ref,
        status: "error",
        lastActiveAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Bifurca (fork) uma conversa existente preservando histórico anterior
   */
  private async forkConversation(ref: ConversationRef): Promise<ConversationRef> {
    const key = formatProcessKey({ engineId: this.engineId, workspaceId: ref.workspaceId });
    this.processRegistry.touch(key);

    const meta = this.activeConversations.get(ref.id);
    const baseUrl = meta?.url || `http://127.0.0.1:${meta?.port ?? 4096}`;
    const authToken = meta?.authToken || "";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    };

    const res = await fetch(`${baseUrl}/session/${encodeURIComponent(ref.id)}/fork`, {
      method: "POST",
      headers,
    });

    if (!res.ok) {
      throw new Error(`Falha ao bifurcar sessão ${ref.id} no OpenCode: HTTP ${res.status}`);
    }

    const data = (await res.json()) as { id: string };
    const forkedId = data.id || `forked-${Date.now()}`;

    if (meta) {
      this.activeConversations.set(forkedId, { ...meta });
    }

    return {
      id: forkedId,
      engineId: this.engineId,
      workspaceId: ref.workspaceId,
    };
  }

  /**
   * Encerra sessão liberando contagem no ProcessRegistry
   */
  private async closeConversation(ref: ConversationRef): Promise<void> {
    const meta = this.activeConversations.get(ref.id);
    const baseUrl = meta?.url || `http://127.0.0.1:${meta?.port ?? 4096}`;
    const authToken = meta?.authToken || "";
    const headers: Record<string, string> = {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    };

    try {
      await fetch(`${baseUrl}/session/${encodeURIComponent(ref.id)}`, {
        method: "DELETE",
        headers,
        signal: AbortSignal.timeout(3000),
      });
    } catch {}

    this.activeConversations.delete(ref.id);

    const key = formatProcessKey({ engineId: this.engineId, workspaceId: ref.workspaceId });
    this.processRegistry.release(key);
  }

  // Método auxiliar para testes e inspeção
  public getSessionMeta(sessionId: string): ConversationSessionMeta | undefined {
    return this.activeConversations.get(sessionId);
  }
}
