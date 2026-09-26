import { describe, expect, it } from "vitest";
import { runConversationProbe, type AgentEvent, type ConversationRuntime } from "../src/core/engines/index.js";

type Turn = (text: string, history: string[]) => AgentEvent[];

function fakeRuntime(turn: Turn) {
  const history: string[] = [];
  const rejected: string[] = [];
  let closed = 0;
  const runtime: ConversationRuntime = {
    engineId: "fake",
    create: async (input) => ({ id: "c1", engineId: "fake", workspaceId: input.workspaceId }),
    async *send(_ref, input, signal) {
      yield { type: "run.started", runId: "r", engineId: "fake", timestamp: "" };
      for (const event of turn(input.text, history)) {
        if (signal?.aborted) {
          yield { type: "run.completed", runId: "r", result: { output: "", stopReason: "cancelled" } };
          return;
        }
        yield event;
      }
      history.push(input.text);
    },
    resume: async (ref) => ({ ref, status: "active", lastActiveAt: "" }),
    respondApproval: async (id) => { rejected.push(id); return true; },
    close: async () => { closed += 1; },
  };
  return { runtime, rejected, closed: () => closed };
}

const marker = (text: string) => /PROBE-[0-9A-F]{8}/.exec(text)?.[0] ?? "";
const opts = { workspaceId: "ws", workspacePath: "/tmp", homeDir: "/tmp", model: "modelo-explicito" };

describe("runConversationProbe", () => {
  it("aprova inferência, streaming e continuação sem expor o conteúdo", async () => {
    const fake = fakeRuntime((text, history) => {
      const m = history.length === 0 ? marker(text) : marker(history[0]!);
      return [
        { type: "message.delta", runId: "r", text: m },
        { type: "usage.updated", runId: "r", usage: { totalTokens: 50 } },
        { type: "run.completed", runId: "r", result: { output: m, stopReason: "completed" } },
      ];
    });
    const report = await runConversationProbe({ runtime: fake.runtime, ...opts });
    expect(report.checks).toMatchObject({ inference: { status: "passed" }, streaming: { status: "passed" }, conversation: { status: "passed" } });
    expect(report.totalTokens).toBe(100);
    expect(JSON.stringify(report)).not.toMatch(/PROBE-/);
    expect(fake.closed()).toBe(1);
  });

  it("reprova continuação quando o segundo turno perde o contexto", async () => {
    const fake = fakeRuntime((text) => [
      { type: "message.delta", runId: "r", text: marker(text) || "não lembro" },
      { type: "run.completed", runId: "r", result: { output: "", stopReason: "completed" } },
    ]);
    const report = await runConversationProbe({ runtime: fake.runtime, ...opts });
    expect(report.checks.inference.status).toBe("passed");
    expect(report.checks.conversation.status).toBe("failed");
  });

  it("recusa aprovações e interrompe quando o orçamento de tokens estoura", async () => {
    const fake = fakeRuntime((text) => [
      { type: "approval.requested", runId: "r", approval: { id: "a1", action: "cmd", description: "rm -rf" } },
      { type: "usage.updated", runId: "r", usage: { totalTokens: 999 } },
      { type: "message.delta", runId: "r", text: marker(text) },
      { type: "run.completed", runId: "r", result: { output: "", stopReason: "completed" } },
    ]);
    const report = await runConversationProbe({ runtime: fake.runtime, ...opts, maxTotalTokens: 100 });
    expect(fake.rejected).toEqual(["a1"]);
    expect(report.approvalsRejected).toBe(1);
    expect(report.budgetExceeded).toBe(true);
    expect(report.checks.inference.status).toBe("failed");
    expect(report.checks.conversation.status).toBe("skipped");
  });

  it("reprova quando o motor falha", async () => {
    const fake = fakeRuntime(() => [{ type: "run.failed", runId: "r", error: { message: "sem login" } as any }]);
    const report = await runConversationProbe({ runtime: fake.runtime, ...opts });
    expect(report.checks.inference).toMatchObject({ status: "failed", detail: "sem login" });
  });
});
