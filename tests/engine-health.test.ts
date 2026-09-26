import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CANONICAL_ENGINE_MANIFESTS,
  HealthProbeRequestError,
  runEngineHealth,
  validateHealthRequest,
  type AgentEvent,
  type AgentRunInput,
  type EngineAdapter,
} from "../src/core/engines/index.js";
import { ProcessRegistry } from "../src/core/runtime/index.js";

interface FakeOptions {
  installed?: boolean;
  authenticated?: boolean;
  /** Resposta do runner; recebe o prompt e o diretório do workspace. */
  reply?: (prompt: string, cwd: string) => { text: string; tokens?: number; tool?: boolean; fail?: string; hang?: boolean };
  conversation?: boolean;
}

function fakeAdapter(opts: FakeOptions = {}) {
  const runs: AgentRunInput[] = [];
  const workspaces: string[] = [];
  const history: string[] = [];
  const reply = opts.reply ?? ((prompt: string) => ({ text: /OK-[0-9A-F]{8}/.exec(prompt)?.[0] ?? "", tokens: 30 }));

  async function* turn(prompt: string, cwd: string, signal?: AbortSignal): AsyncIterable<AgentEvent> {
    const r = reply(prompt, cwd);
    yield { type: "run.started", runId: "r", engineId: "fake", timestamp: "" };
    if (r.hang) {
      await new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve(), { once: true }));
      yield { type: "run.completed", runId: "r", result: { output: "", stopReason: "cancelled" } };
      return;
    }
    if (r.fail) {
      yield { type: "run.failed", runId: "r", error: { message: r.fail } as any };
      return;
    }
    if (r.tool) yield { type: "tool.requested", runId: "r", call: { id: "c", name: "read", arguments: {} } };
    if (r.text) yield { type: "message.delta", runId: "r", text: r.text };
    if (r.tokens) yield { type: "usage.updated", runId: "r", usage: { totalTokens: r.tokens } };
    yield { type: "run.completed", runId: "r", result: { output: r.text, stopReason: "completed" } };
  }

  const adapter = {
    engineId: "fake",
    name: "Fake",
    manifest: { ...CANONICAL_ENGINE_MANIFESTS.opencode, engineId: "fake" },
    installer: {
      engineId: "fake",
      status: async () => (opts.installed === false
        ? { installed: false, isManaged: false, path: null, version: null, details: "ausente" }
        : { installed: true, isManaged: false, path: "/bin/fake", version: "9.9.9" }),
      install: async () => { throw new Error("health nunca instala"); },
    },
    authenticator: { engineId: "fake", status: async () => ({ authenticated: opts.authenticated !== false, method: "teste" }) },
    runner: {
      engineId: "fake",
      run: (input: AgentRunInput, signal?: AbortSignal) => {
        runs.push(input);
        workspaces.push(input.workspacePath);
        return turn(input.prompt, input.workspacePath, signal);
      },
    },
    conversationRuntime: opts.conversation === false ? undefined : {
      engineId: "fake",
      create: async (input: any) => { workspaces.push(input.workspacePath); return { id: "c1", engineId: "fake", workspaceId: input.workspaceId }; },
      async *send(_ref: any, input: { text: string }, signal?: AbortSignal) {
        const marker = /PROBE-[0-9A-F]{8}/.exec(input.text)?.[0] ?? /PROBE-[0-9A-F]{8}/.exec(history[0] ?? "")?.[0] ?? "";
        history.push(input.text);
        yield* turn(`Responda ${marker}`.replace("Responda", ""), "", signal);
      },
      resume: async () => ({}) as any,
      close: async () => {},
    },
  } as unknown as EngineAdapter;
  return { adapter, runs, workspaces };
}

describe("ETAPA 11 — saúde multinível", () => {
  it("níveis reais exigem confirmação de custo e modelo explícito", () => {
    expect(() => validateHealthRequest({ level: "authenticated" })).not.toThrow();
    expect(() => validateHealthRequest({ level: "inference", model: "p/m" })).toThrow(HealthProbeRequestError);
    expect(() => validateHealthRequest({ level: "inference", allowRealProbe: true })).toThrow(/modelo explícito/);
    expect(() => validateHealthRequest({ level: "inference", allowRealProbe: true, model: "default" })).toThrow(/modelo explícito/);
    expect(() => validateHealthRequest({ level: "inference", allowRealProbe: true, model: "p/m" })).not.toThrow();
  });

  it("nível barato nunca executa inferência", async () => {
    const fake = fakeAdapter();
    const report = await runEngineHealth({ adapter: fake.adapter, homeDir: "/tmp", level: "authenticated" });
    expect(fake.runs).toHaveLength(0);
    expect(report).toMatchObject({ ok: true, highestPassed: "authenticated", version: "9.9.9", model: null });
    expect(report.results.map((r) => r.level)).toEqual(["installed", "authenticated"]);
  });

  it("para no primeiro nível reprovado e marca os seguintes como skipped", async () => {
    const report = await runEngineHealth({ adapter: fakeAdapter({ installed: false }).adapter, homeDir: "/tmp", level: "authenticated" });
    expect(report.ok).toBe(false);
    expect(report.highestPassed).toBeNull();
    expect(report.results).toEqual([
      expect.objectContaining({ level: "installed", status: "failed", detail: "ausente" }),
      expect.objectContaining({ level: "authenticated", status: "skipped" }),
    ]);
    const noAuth = await runEngineHealth({ adapter: fakeAdapter({ authenticated: false }).adapter, homeDir: "/tmp", level: "inference", allowRealProbe: true, model: "p/m" });
    expect(noAuth.highestPassed).toBe("installed");
    expect(noAuth.results.find((r) => r.level === "inference")?.status).toBe("skipped");
  });

  it("inferência e streaming reais registram modelo, latência e tokens, sem guardar prompt/resposta", async () => {
    const fake = fakeAdapter();
    const report = await runEngineHealth({ adapter: fake.adapter, homeDir: "/tmp", level: "streaming", allowRealProbe: true, model: "p/m" });
    expect(report).toMatchObject({ ok: true, highestPassed: "streaming", model: "p/m", totalTokens: 30 });
    expect(report.results.find((r) => r.level === "inference")?.latencyMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(report)).not.toMatch(/OK-[0-9A-F]{8}|Responda/);
    expect(fake.runs[0]?.model).toBe("p/m");
  });

  it("usa workspace temporário, removido ao final", async () => {
    const fake = fakeAdapter();
    await runEngineHealth({ adapter: fake.adapter, homeDir: "/tmp", level: "inference", allowRealProbe: true, model: "p/m" });
    expect(fake.workspaces[0]).toMatch(/opencorp-health-fake-/);
    expect(existsSync(fake.workspaces[0]!)).toBe(false);
  });

  it("resposta sem o marcador reprova a inferência", async () => {
    const fake = fakeAdapter({ reply: () => ({ text: "qualquer coisa" }) });
    const report = await runEngineHealth({ adapter: fake.adapter, homeDir: "/tmp", level: "inference", allowRealProbe: true, model: "p/m" });
    expect(report.results.find((r) => r.level === "inference")).toMatchObject({ status: "failed", detail: expect.stringContaining("marcador") });
  });

  it("tempo limite interrompe o probe", async () => {
    const fake = fakeAdapter({ reply: () => ({ text: "", hang: true }) });
    const report = await runEngineHealth({ adapter: fake.adapter, homeDir: "/tmp", level: "inference", allowRealProbe: true, model: "p/m", timeoutMs: 50 });
    expect(report.results.find((r) => r.level === "inference")).toMatchObject({ status: "failed", detail: expect.stringContaining("tempo limite") });
  });

  it("orçamento de tokens estourado reprova o nível", async () => {
    const fake = fakeAdapter({ reply: (p) => ({ text: /OK-[0-9A-F]{8}/.exec(p)?.[0] ?? "", tokens: 5_000 }) });
    const report = await runEngineHealth({ adapter: fake.adapter, homeDir: "/tmp", level: "inference", allowRealProbe: true, model: "p/m", maxTotalTokens: 100 });
    expect(report.results.find((r) => r.level === "inference")).toMatchObject({ status: "failed", detail: expect.stringContaining("orçamento") });
  });

  it("tools lê um arquivo controlado do workspace temporário", async () => {
    const fake = fakeAdapter({
      reply: (prompt, cwd) => prompt.includes("probe.txt")
        ? { text: readFileSync(join(cwd, "probe.txt"), "utf8").trim(), tool: true }
        : { text: /OK-[0-9A-F]{8}/.exec(prompt)?.[0] ?? "" },
    });
    const report = await runEngineHealth({ adapter: fake.adapter, homeDir: "/tmp", level: "tools", allowRealProbe: true, model: "p/m" });
    expect(report.results.find((r) => r.level === "tools")).toMatchObject({ status: "passed", detail: "1 chamada(s) de ferramenta" });
  });

  it("conversation e lifecycle: continuação verificada e nenhum processo remanescente", async () => {
    const fake = fakeAdapter({
      reply: (prompt, cwd) => prompt.includes("probe.txt")
        ? { text: readFileSync(join(cwd, "probe.txt"), "utf8").trim(), tool: true }
        : { text: /(OK|PROBE)-[0-9A-F]{8}/.exec(prompt)?.[0] ?? "" },
    });
    const registry = new ProcessRegistry({ idleTimeoutMs: 60_000, killer: () => {}, isPidRunning: () => false });
    const report = await runEngineHealth({ adapter: fake.adapter, homeDir: "/tmp", level: "lifecycle", allowRealProbe: true, model: "p/m", processRegistry: registry });
    expect(report.results.map((r) => [r.level, r.status])).toEqual([
      ["installed", "passed"], ["authenticated", "passed"], ["inference", "passed"], ["streaming", "passed"],
      ["tools", "passed"], ["conversation", "passed"], ["lifecycle", "passed"],
    ]);
    expect(report.highestPassed).toBe("lifecycle");
  });

  it("motor sem runtime conversacional marca conversation como unsupported sem reprovar", async () => {
    const fake = fakeAdapter({
      conversation: false,
      reply: (prompt, cwd) => prompt.includes("probe.txt")
        ? { text: readFileSync(join(cwd, "probe.txt"), "utf8").trim(), tool: true }
        : { text: /OK-[0-9A-F]{8}/.exec(prompt)?.[0] ?? "" },
    });
    const report = await runEngineHealth({ adapter: fake.adapter, homeDir: "/tmp", level: "conversation", allowRealProbe: true, model: "p/m" });
    expect(report.results.find((r) => r.level === "conversation")?.status).toBe("unsupported");
    expect(report.ok).toBe(true);
  });
});
