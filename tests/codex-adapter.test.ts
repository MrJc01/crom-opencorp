import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CodexAdapter,
  type AgentEvent,
  type AgentRunInput,
  type CodexLaunchOptions,
  type CodexProcessHandle,
} from "../src/core/engines/index.js";

describe("ETAPA 8 — Adaptador Codex", () => {
  let home: string;
  let workspace: string;
  let launches: CodexLaunchOptions[];
  let sequence: number;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "opencorp-codex-test-"));
    workspace = join(home, "workspace");
    await mkdir(workspace, { recursive: true });
    launches = [];
    sequence = 0;
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  function launcher(opts: CodexLaunchOptions): Promise<CodexProcessHandle> {
    launches.push(opts);
    sequence += 1;
    const isFork = opts.args[1] === "fork";
    const threadId = isFork ? `thread-fork-${sequence}` : "thread-original";
    const answer = opts.args[1] === "resume" ? "segunda resposta" : "primeira resposta";
    async function* stdout() {
      yield `${JSON.stringify({ type: "thread.started", thread_id: threadId })}\n`;
      if (!isFork) {
        yield `${JSON.stringify({ type: "item.started", item: { id: "cmd-1", type: "command_execution", command: "pwd" } })}\n`;
        yield `${JSON.stringify({ type: "item.completed", item: { id: "cmd-1", type: "command_execution", aggregated_output: workspace, exit_code: 0 } })}\n`;
        yield `${JSON.stringify({ type: "item.completed", item: { id: "msg-1", type: "agent_message", text: answer } })}\n`;
        yield `${JSON.stringify({ type: "turn.completed", usage: { input_tokens: 10, output_tokens: 5 } })}\n`;
      }
    }
    return Promise.resolve({ pid: 1234, stdout: stdout(), exitCode: Promise.resolve(0), kill: () => {} });
  }

  function runInput(overrides: Partial<AgentRunInput> = {}): AgentRunInput {
    return {
      workspaceId: "ws-1",
      workspacePath: workspace,
      sessionId: "session-1",
      agentId: "agent-1",
      model: "default",
      prompt: "analise o projeto",
      homeDir: home,
      ...overrides,
    };
  }

  it("declara somente capacidades implementadas e não inventa catálogo estático", () => {
    const adapter = new CodexAdapter({ homeDir: home, customProcessLauncher: launcher });
    expect(adapter.manifest.features.streaming).toMatchObject({ level: "integrated", flags: ["--json"] });
    expect(adapter.manifest.features.continuation).toMatchObject({ level: "integrated", flags: ["exec resume"] });
    expect(adapter.manifest.features.fork).toMatchObject({ level: "integrated", flags: ["exec fork"] });
    expect(adapter.manifest.features.hitl.level).toBe("declared");
    expect(adapter.modelCatalog).toBeUndefined();
  });

  it("converte o JSONL realista do codex exec em eventos canônicos", async () => {
    const adapter = new CodexAdapter({ homeDir: home, customProcessLauncher: launcher });
    const events: AgentEvent[] = [];
    for await (const event of adapter.runner.run(runInput())) events.push(event);

    expect(launches[0].args.slice(0, 2)).toEqual(["exec", "--sandbox"]);
    expect(launches[0].args).toContain("--json");
    expect(events.map((event) => event.type)).toEqual([
      "run.started", "tool.requested", "tool.completed", "message.delta", "usage.updated", "run.completed",
    ]);
    expect(events.find((event) => event.type === "run.completed")).toMatchObject({
      result: { output: "primeira resposta", stopReason: "completed" },
    });
  });

  it("continua a conversa com o ID nativo retornado por thread.started", async () => {
    const adapter = new CodexAdapter({ homeDir: home, customProcessLauncher: launcher });
    const ref = await adapter.conversationRuntime.create({
      workspaceId: "ws-1", workspacePath: workspace, model: "default", homeDir: home,
    });
    for await (const _ of adapter.conversationRuntime.send(ref, { text: "primeiro turno" })) { /* consome */ }
    for await (const _ of adapter.conversationRuntime.send(ref, { text: "segundo turno" })) { /* consome */ }

    expect(launches[1].args.slice(0, 3)).toEqual(["exec", "resume", "--json"]);
    expect(launches[1].args).toContain("thread-original");
    expect(launches[1].args).not.toContain("--resume");
    const state = await adapter.conversationRuntime.resume(ref);
    expect(state).toMatchObject({ status: "active", metadata: { nativeThreadId: "thread-original" } });
  });

  it("cria fork real pelo subcomando nativo", async () => {
    const adapter = new CodexAdapter({ homeDir: home, customProcessLauncher: launcher });
    const ref = await adapter.conversationRuntime.create({
      workspaceId: "ws-1", workspacePath: workspace, model: "default", homeDir: home,
    });
    for await (const _ of adapter.conversationRuntime.send(ref, { text: "primeiro turno" })) { /* consome */ }
    const fork = await adapter.conversationRuntime.fork!(ref);

    expect(fork.id).not.toBe(ref.id);
    expect(launches[1].args.slice(0, 3)).toEqual(["exec", "fork", "--json"]);
    expect(launches[1].args).toContain("thread-original");
    expect(await adapter.conversationRuntime.resume(fork)).toMatchObject({
      status: "active", metadata: { nativeThreadId: "thread-fork-2" },
    });
  });

  it("não registra o PID do processo OpenCorp como runtime Codex", async () => {
    const adapter = new CodexAdapter({ homeDir: home, customProcessLauncher: launcher });
    const ref = await adapter.conversationRuntime.create({
      workspaceId: "ws-1", workspacePath: workspace, model: "default", homeDir: home,
    });
    expect(ref.engineId).toBe("codex");
    await adapter.conversationRuntime.close(ref);
    expect((await adapter.conversationRuntime.resume(ref)).status).toBe("closed");
  });

  it("emite run.failed em saída não zero", async () => {
    const adapter = new CodexAdapter({
      homeDir: home,
      customProcessLauncher: async () => {
        async function* empty() { /* sem stdout */ }
        async function* stderr() { yield "autenticação ausente"; }
        return { pid: 9, stdout: empty(), stderr: stderr(), exitCode: Promise.resolve(1), kill: () => {} };
      },
    });
    const events: AgentEvent[] = [];
    for await (const event of adapter.runner.run(runInput())) events.push(event);
    expect(events.at(-1)).toMatchObject({ type: "run.failed", error: { engineId: "codex" } });
    expect(events.some((event) => event.type === "run.completed")).toBe(false);
  });

  it("cancela o subprocesso por AbortSignal e encerra sem timer órfão", async () => {
    const signals: NodeJS.Signals[] = [];
    const adapter = new CodexAdapter({
      homeDir: home,
      customProcessLauncher: async (opts) => {
        async function* stdout() {
          yield `${JSON.stringify({ type: "thread.started", thread_id: "thread-cancel" })}\n`;
          while (!opts.signal?.aborted) await new Promise((resolve) => setTimeout(resolve, 5));
        }
        return {
          pid: 10,
          stdout: stdout(),
          exitCode: Promise.resolve(0),
          kill: (signal = "SIGTERM") => signals.push(signal),
        };
      },
    });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);
    const events: AgentEvent[] = [];
    for await (const event of adapter.runner.run(runInput(), controller.signal)) events.push(event);

    expect(signals).toContain("SIGTERM");
    expect(events.at(-1)).toMatchObject({ type: "run.completed", result: { stopReason: "cancelled" } });
  });
});
