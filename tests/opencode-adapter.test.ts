/**
 * Adaptador OpenCode contra um servidor falso que reproduz o contrato real do
 * `opencode serve` 1.18.32 (conferido na OpenAPI `/doc` e em servidor real):
 *
 *   - HTTP Basic `opencode:<OPENCODE_SERVER_PASSWORD>` em todas as rotas;
 *   - `POST /session/:id/message` exige `parts` (400 "Missing key parts" sem ele);
 *   - streaming via `POST /session/:id/prompt_async` (204) + SSE `GET /event`
 *     com `message.updated`, `message.part.updated`, `message.part.delta`,
 *     `permission.asked`, `session.status`, `session.error`, `session.idle`;
 *   - permissões respondidas em `POST /session/:id/permissions/:permissionID`
 *     com `{ response: "once" | "always" | "reject" }`.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createServer, type Server, type ServerResponse } from "node:http";
import { mkdtemp, rm, mkdir, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  OpenCodeAdapter,
  OpenCodeTurnState,
  mapOpenCodeRunEvent,
  parseOpenCodeModel,
  type AgentEvent,
} from "../src/core/engines/index.js";
import { ProcessRegistry, formatProcessKey } from "../src/core/runtime/index.js";

interface FakeOpenCode {
  server: Server;
  port: number;
  requests: Array<{ method: string; url: string; body: any }>;
  permissionReplies: Array<{ id: string; response: string }>;
  sessions: Set<string>;
}

describe("ETAPA 6/11 — Adaptador OpenCode (contrato real do opencode serve)", () => {
  let tempHome: string;
  let ws1: string;
  let ws2: string;
  let fakes: FakeOpenCode[];
  let registry: ProcessRegistry;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), "opencorp-opencode-test-"));
    ws1 = join(tempHome, "workspaces", "ws-1");
    ws2 = join(tempHome, "workspaces", "ws-2");
    await mkdir(ws1, { recursive: true });
    await mkdir(ws2, { recursive: true });
    await mkdir(join(tempHome, ".opencorp"), { recursive: true });
    fakes = [];
    // PIDs falsos: "morrem" ao receber o sinal, sem esperar o período de graça.
    const dead = new Set<number>();
    registry = new ProcessRegistry({ idleTimeoutMs: 60_000, killer: (pid) => { dead.add(pid); }, isPidRunning: (pid) => !dead.has(pid) });
  });

  afterEach(async () => {
    for (const f of fakes) {
      f.server.closeAllConnections?.();
      await new Promise<void>((resolve) => f.server.close(() => resolve()));
    }
    await registry.shutdownAll();
    await rm(tempHome, { recursive: true, force: true });
  });

  function startFakeOpenCode(port: number, password: string): Promise<FakeOpenCode> {
    const expected = `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`;
    const subscribers = new Set<ServerResponse>();
    const pendingPermission = new Map<string, () => void>();
    let seq = 0;
    const fake: FakeOpenCode = { server: undefined as unknown as Server, port, requests: [], permissionReplies: [], sessions: new Set() };

    const emit = (type: string, properties: Record<string, unknown>) => {
      const data = JSON.stringify({ id: `evt_${++seq}`, type, properties });
      for (const res of subscribers) res.write(`data: ${data}\n\n`);
    };
    const json = (res: ServerResponse, status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    // Um turno: busy → mensagem do assistente → texto em deltas → ferramenta → idle.
    const runTurn = async (sessionID: string, text: string) => {
      const messageID = `msg_a${++seq}`;
      const partID = `prt_t${seq}`;
      // Evento de outra sessão: deve ser ignorado pelo adaptador.
      emit("message.part.delta", { sessionID: "ses_outra", messageID: "msg_x", partID: "prt_x", field: "text", delta: "VAZOU" });
      emit("session.status", { sessionID, status: { type: "busy" } });
      emit("message.updated", { sessionID, info: { id: messageID, sessionID, role: "assistant", time: { created: Date.now() } } });

      if (text.includes("erro")) {
        emit("session.error", { sessionID, error: { name: "ProviderAuthError", data: { message: "Model not found: x/y" } } });
        emit("session.idle", { sessionID });
        return;
      }
      if (text.includes("lento")) return; // só termina se for abortado

      if (text.includes("permissão")) {
        const permissionID = `per_${seq}`;
        await new Promise<void>((resolve) => {
          pendingPermission.set(permissionID, resolve);
          emit("permission.asked", { id: permissionID, sessionID, permission: "bash", patterns: ["git push origin main"], metadata: {}, always: [] });
        });
      }

      emit("message.part.updated", { sessionID, time: Date.now(), part: { id: partID, sessionID, messageID, type: "text", text: "" } });
      for (const delta of ["Olá, ", "resposta para: ", text]) {
        emit("message.part.delta", { sessionID, messageID, partID, field: "text", delta });
      }
      // Atualização final da parte com o texto completo: não pode duplicar.
      emit("message.part.updated", { sessionID, time: Date.now(), part: { id: partID, sessionID, messageID, type: "text", text: `Olá, resposta para: ${text}` } });
      emit("message.part.updated", {
        sessionID,
        time: Date.now(),
        part: { id: `prt_tool${seq}`, sessionID, messageID, type: "tool", callID: "call_1", tool: "read", state: { status: "completed", input: { filePath: "a.txt" }, output: "conteúdo", title: "a.txt", metadata: {}, time: { start: 1, end: 2 } } },
      });
      emit("message.updated", {
        sessionID,
        info: { id: messageID, sessionID, role: "assistant", time: { created: 1, completed: 2 }, cost: 0.001, tokens: { input: 100, output: 20, reasoning: 5, cache: { read: 0, write: 0 } } },
      });
      emit("session.idle", { sessionID });
    };

    fake.server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const url = req.url || "";
        let body: any;
        try { body = raw ? JSON.parse(raw) : undefined; } catch { body = raw; }
        fake.requests.push({ method: req.method || "", url, body });

        if (req.headers.authorization !== expected) return json(res, 401, { error: "unauthorized" });
        if (url === "/health") return json(res, 200, { ok: true });

        if (url === "/event" && req.method === "GET") {
          res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
          res.write(`data: ${JSON.stringify({ id: "evt_0", type: "server.connected", properties: {} })}\n\n`);
          subscribers.add(res);
          res.on("close", () => subscribers.delete(res));
          return;
        }
        if (url === "/session" && req.method === "POST") {
          const id = `ses_${fake.sessions.size + 1}${port}`;
          fake.sessions.add(id);
          return json(res, 200, { id, title: body?.title });
        }
        const m = /^\/session\/([^/]+)(\/[^?]*)?$/.exec(url);
        if (!m) return json(res, 404, { error: "not found" });
        const sessionID = decodeURIComponent(m[1]!);
        const rest = m[2] ?? "";
        if (!fake.sessions.has(sessionID)) return json(res, 404, { name: "NotFoundError" });

        if (rest === "" && req.method === "GET") return json(res, 200, { id: sessionID });
        if (rest === "/message" && req.method === "POST") {
          if (!Array.isArray(body?.parts)) return json(res, 400, { name: "BadRequest", data: { message: 'Missing key\n  at ["parts"]' } });
          return json(res, 200, { info: { role: "assistant" }, parts: [] });
        }
        if (rest === "/prompt_async" && req.method === "POST") {
          if (!Array.isArray(body?.parts)) return json(res, 400, { name: "BadRequest", data: { message: 'Missing key\n  at ["parts"]' } });
          res.writeHead(204);
          res.end();
          const text = String(body.parts.find((p: any) => p.type === "text")?.text ?? "");
          setTimeout(() => void runTurn(sessionID, text), 5);
          return;
        }
        if (rest === "/abort" && req.method === "POST") {
          emit("session.error", { sessionID, error: { name: "MessageAbortedError", data: { message: "aborted" } } });
          emit("session.idle", { sessionID });
          return json(res, 200, true);
        }
        if (rest === "/fork" && req.method === "POST") {
          const id = `ses_fork${fake.sessions.size + 1}`;
          fake.sessions.add(id);
          return json(res, 200, { id });
        }
        const perm = /^\/permissions\/([^/]+)$/.exec(rest);
        if (perm && req.method === "POST") {
          const id = decodeURIComponent(perm[1]!);
          const resume = pendingPermission.get(id);
          if (!resume) return json(res, 404, { name: "NotFoundError" });
          fake.permissionReplies.push({ id, response: body?.response });
          pendingPermission.delete(id);
          json(res, 200, true);
          resume();
          return;
        }
        if (rest === "" && req.method === "DELETE") return json(res, 200, true);
        return json(res, 404, { error: "not found" });
      });
    });

    return new Promise((resolve) => {
      fake.server.listen(port, "127.0.0.1", () => {
        fakes.push(fake);
        resolve(fake);
      });
    });
  }

  function adapterWithFake(onLaunch?: (password: string, port: number) => void) {
    let pid = 9000;
    return new OpenCodeAdapter({
      homeDir: tempHome,
      processRegistry: registry,
      customServerLauncher: async ({ port, authToken }) => {
        onLaunch?.(authToken, port);
        await startFakeOpenCode(port, authToken);
        return { pid: ++pid };
      },
    });
  }

  async function collect(iterable: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
    const out: AgentEvent[] = [];
    for await (const ev of iterable) out.push(ev);
    return out;
  }

  const create = (adapter: OpenCodeAdapter, workspaceId = "ws-1", workspacePath = ws1, extra: Record<string, unknown> = {}) =>
    adapter.conversationRuntime.create({ workspaceId, workspacePath, model: "openrouter/vendor/modelo", homeDir: tempHome, ...extra });

  it("manifesto declara conversa, streaming, continuação e fork", () => {
    const adapter = new OpenCodeAdapter({ homeDir: tempHome });
    expect(adapter.engineId).toBe("opencode");
    expect(adapter.manifest.supportsConversation).toBe(true);
    expect(adapter.manifest.features.streaming.level).toBe("integrated");
    expect(adapter.manifest.features.continuation.level).toBe("integrated");
    expect(adapter.manifest.features.fork.level).toBe("integrated");
  });

  it("sessão nova: senha aleatória, loopback, sessão nativa e registro sem referência presa", async () => {
    let password = "";
    let port = 0;
    const adapter = adapterWithFake((p, po) => { password = p; port = po; });
    const ref = await create(adapter, "ws-1", ws1, { title: "Olá Secretário" });

    expect(ref).toMatchObject({ engineId: "opencode", workspaceId: "ws-1" });
    expect(ref.id).toMatch(/^ses_/);
    expect(password.length).toBeGreaterThan(10);
    const meta = adapter.getSessionMeta(ref.id);
    expect(meta).toEqual({ port, workspaceDir: ws1, url: `http://127.0.0.1:${port}` });
    expect(JSON.stringify(meta)).not.toContain(password);

    const proc = registry.get(formatProcessKey({ engineId: "opencode", workspaceId: "ws-1" }));
    expect(proc?.pid).toBe(9001);
    // A senha nunca vai para o ProcessRegistry.
    expect(JSON.stringify(proc)).not.toContain(password);
    // Nenhuma referência presa: o timeout ocioso (D2) funciona entre mensagens.
    expect(proc?.referenceCount).toBe(0);
  });

  it("streaming real: prompt_async + SSE viram deltas, ferramenta, uso e conclusão", async () => {
    const adapter = adapterWithFake();
    const ref = await create(adapter);
    const events = await collect(adapter.conversationRuntime.send(ref, { text: "Liste os arquivos" }));

    expect(events[0]?.type).toBe("run.started");
    const deltas = events.filter((e) => e.type === "message.delta").map((e: any) => e.text);
    expect(deltas).toEqual(["Olá, ", "resposta para: ", "Liste os arquivos"]);
    expect(deltas.join("")).not.toContain("VAZOU");
    expect(events.find((e) => e.type === "tool.requested")).toMatchObject({ call: { id: "call_1", name: "read", arguments: { filePath: "a.txt" } } });
    expect(events.find((e) => e.type === "tool.completed")).toMatchObject({ result: { id: "call_1", result: "conteúdo", isError: false } });
    expect(events.find((e) => e.type === "usage.updated")).toMatchObject({ usage: { promptTokens: 100, completionTokens: 25, totalTokens: 125, costUsd: 0.001 } });
    const last = events.at(-1) as any;
    expect(last).toMatchObject({ type: "run.completed", result: { output: "Olá, resposta para: Liste os arquivos", stopReason: "completed" } });

    const fake = fakes[0]!;
    const prompt = fake.requests.find((r) => r.url.endsWith("/prompt_async"));
    expect(prompt?.body).toEqual({ parts: [{ type: "text", text: "Liste os arquivos" }], model: { providerID: "openrouter", modelID: "vendor/modelo" } });
    expect(registry.get("opencode::ws-1")?.referenceCount).toBe(0);
  });

  it("continuação: vários turnos reutilizam o mesmo servidor e retomada usa o ID nativo", async () => {
    let spawns = 0;
    const adapter = adapterWithFake(() => { spawns += 1; });
    const ref = await create(adapter);
    await collect(adapter.conversationRuntime.send(ref, { text: "Turno 1" }));
    await collect(adapter.conversationRuntime.send(ref, { text: "Turno 2" }));
    const resumed = await create(adapter, "ws-1", ws1, { conversationId: ref.id });
    expect(resumed.id).toBe(ref.id);
    expect(spawns).toBe(1);
    expect(fakes[0]!.requests.filter((r) => r.url === "/session" && r.method === "POST")).toHaveLength(1);
    expect(await adapter.conversationRuntime.resume(ref)).toMatchObject({ status: "idle" });
  });

  it("fork cria sessão nativa nova no mesmo servidor", async () => {
    const adapter = adapterWithFake();
    const ref = await create(adapter);
    const forked = await adapter.conversationRuntime.fork!(ref);
    expect(forked.id).toMatch(/^ses_fork/);
    expect(forked.id).not.toBe(ref.id);
    expect(forked.workspaceId).toBe("ws-1");
  });

  it("erro da sessão (SSE session.error) vira run.failed normalizado", async () => {
    const adapter = adapterWithFake();
    const ref = await create(adapter);
    const events = await collect(adapter.conversationRuntime.send(ref, { text: "provoque erro" }));
    const last = events.at(-1) as any;
    expect(last.type).toBe("run.failed");
    expect(last.error.message).toContain("Model not found");
  });

  it("cancelamento chama /abort e termina com stopReason cancelled", async () => {
    const adapter = adapterWithFake();
    const ref = await create(adapter);
    const ac = new AbortController();
    const pending = collect(adapter.conversationRuntime.send(ref, { text: "processo lento" }, ac.signal));
    setTimeout(() => ac.abort(), 100);
    const events = await pending;
    expect(events.at(-1)).toMatchObject({ type: "run.completed", result: { stopReason: "cancelled" } });
    expect(fakes[0]!.requests.some((r) => r.url.endsWith("/abort"))).toBe(true);
  });

  it("permissão: permission.asked vira approval e só o workspace dono responde", async () => {
    const adapter = adapterWithFake();
    const ref = await create(adapter);
    const events: AgentEvent[] = [];
    for await (const ev of adapter.conversationRuntime.send(ref, { text: "precisa de permissão" })) {
      events.push(ev);
      if (ev.type === "approval.requested") {
        expect(ev.approval).toMatchObject({ action: "bash", description: "git push origin main" });
        expect(await adapter.conversationRuntime.respondApproval!(ev.approval.id, "approve", { workspaceId: "ws-2" })).toBe(false);
        expect(await adapter.conversationRuntime.respondApproval!(ev.approval.id, "approve", { workspaceId: "ws-1" })).toBe(true);
      }
    }
    expect(fakes[0]!.permissionReplies).toEqual([{ id: expect.stringMatching(/^per_/), response: "once" }]);
    expect(events.at(-1)).toMatchObject({ type: "run.completed", result: { stopReason: "completed" } });
  });

  it("isolamento: cada workspace tem servidor, porta e senha próprios; fechar não apaga histórico", async () => {
    const launches: Array<{ password: string; port: number }> = [];
    const adapter = adapterWithFake((password, port) => launches.push({ password, port }));
    const ref1 = await create(adapter, "ws-1", ws1);
    const ref2 = await create(adapter, "ws-2", ws2);
    expect(launches).toHaveLength(2);
    expect(launches[0]!.port).not.toBe(launches[1]!.port);
    expect(launches[0]!.password).not.toBe(launches[1]!.password);
    expect(registry.get("opencode::ws-1")?.pid).not.toBe(registry.get("opencode::ws-2")?.pid);

    await adapter.conversationRuntime.close(ref1);
    expect(adapter.getSessionMeta(ref1.id)).toBeUndefined();
    expect(adapter.getSessionMeta(ref2.id)).toBeDefined();
    // Nenhum DELETE: o histórico da sessão no OpenCode é preservado.
    expect(fakes.flatMap((f) => f.requests).some((r) => r.method === "DELETE")).toBe(false);
  });

  it("sessão desconhecida falha sem tocar servidor algum", async () => {
    const adapter = adapterWithFake();
    const events = await collect(adapter.conversationRuntime.send({ id: "ses_inexistente", engineId: "opencode", workspaceId: "ws-1" }, { text: "oi" }));
    expect(events.at(-1)?.type).toBe("run.failed");
    expect(fakes).toHaveLength(0);
  });

  it("one-shot: traduz o formato real de `opencode run --format json`", async () => {
    const mockBin = join(tempHome, "fake-opencode-cli.sh");
    const lines = [
      { type: "step_start", sessionID: "ses_1", part: { type: "step-start" } },
      { type: "tool_use", sessionID: "ses_1", part: { type: "tool", tool: "read", callID: "c1", state: { status: "completed", input: { filePath: "a" }, output: "ok" } } },
      { type: "text", sessionID: "ses_1", part: { type: "text", text: "Resultado da análise" } },
      { type: "step_finish", sessionID: "ses_1", part: { type: "step-finish", tokens: { input: 10, output: 3, reasoning: 1 }, cost: 0 } },
    ];
    await writeFile(mockBin, `#!/bin/sh\n${lines.map((l) => `echo '${JSON.stringify(l)}'`).join("\n")}\nexit 0\n`);
    await chmod(mockBin, 0o755);
    const adapter = new OpenCodeAdapter({ homeDir: tempHome, binPath: mockBin, processRegistry: registry });
    const events = await collect(adapter.runner.run({
      runId: "run-1", sessionId: "s1", agentId: "a1", model: "opencode/x", prompt: "tarefa",
      workspaceId: "ws-1", workspacePath: ws1, homeDir: tempHome,
    }));
    expect(events.filter((e) => e.type === "message.delta").map((e: any) => e.text)).toEqual(["Resultado da análise"]);
    expect(events.find((e) => e.type === "tool.completed")).toMatchObject({ result: { id: "c1", name: "read", result: "ok", isError: false } });
    expect(events.find((e) => e.type === "usage.updated")).toMatchObject({ usage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 } });
    expect(events.at(-1)).toMatchObject({ type: "run.completed", result: { output: "Resultado da análise", stopReason: "completed" } });
  });

  it("one-shot: evento `error` do CLI vira run.failed mesmo com exit 0", async () => {
    const mockBin = join(tempHome, "fake-opencode-err.sh");
    const line = { type: "error", sessionID: "ses_1", error: { name: "UnknownError", data: { message: "Unexpected server error" } } };
    await writeFile(mockBin, `#!/bin/sh\necho '${JSON.stringify(line)}'\nexit 0\n`);
    await chmod(mockBin, 0o755);
    const adapter = new OpenCodeAdapter({ homeDir: tempHome, binPath: mockBin, processRegistry: registry });
    const events = await collect(adapter.runner.run({
      runId: "run-2", sessionId: "s1", agentId: "a1", model: "opencode/x", prompt: "tarefa",
      workspaceId: "ws-1", workspacePath: ws1, homeDir: tempHome,
    }));
    expect(events.at(-1)).toMatchObject({ type: "run.failed" });
    expect((events.at(-1) as any).error.message).toContain("Unexpected server error");
  });

  describe("tradutores puros", () => {
    it("parseOpenCodeModel", () => {
      expect(parseOpenCodeModel("openrouter/a/b:free")).toEqual({ providerID: "openrouter", modelID: "a/b:free" });
      expect(parseOpenCodeModel("default")).toBeUndefined();
      expect(parseOpenCodeModel("semprovedor")).toBeUndefined();
    });

    it("mapOpenCodeRunEvent ignora eventos desconhecidos", () => {
      expect(mapOpenCodeRunEvent({ type: "step_start" }, "r").events).toEqual([]);
      expect(mapOpenCodeRunEvent({ type: "text", part: { text: "" } }, "r").events).toEqual([]);
    });

    it("OpenCodeTurnState ignora session.idle antes do turno começar e texto de mensagens do usuário", () => {
      const state = new OpenCodeTurnState("ses_1", "r");
      state.accept({ type: "session.idle", properties: { sessionID: "ses_1" } });
      expect(state.idle).toBe(false);
      state.accept({ type: "message.part.updated", properties: { sessionID: "ses_1", part: { id: "p_user", messageID: "msg_user", type: "text", text: "prompt do usuário" } } });
      expect(state.output).toBe("");
      state.accept({ type: "session.status", properties: { sessionID: "ses_1", status: { type: "busy" } } });
      state.accept({ type: "session.idle", properties: { sessionID: "ses_1" } });
      expect(state.idle).toBe(true);
    });
  });
});
