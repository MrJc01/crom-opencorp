import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm, mkdir, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  OpenCodeAdapter,
  type AgentEvent,
} from "../src/core/engines/index.js";
import {
  ProcessRegistry,
  formatProcessKey,
} from "../src/core/runtime/index.js";

describe("ETAPA 6 — Adaptador OpenCode Completo", () => {
  let tempHome: string;
  let workspaceDir1: string;
  let workspaceDir2: string;
  let fakeServers: Server[] = [];
  let testRegistry: ProcessRegistry;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), "opencorp-opencode-test-"));
    workspaceDir1 = join(tempHome, "workspaces", "ws-1");
    workspaceDir2 = join(tempHome, "workspaces", "ws-2");
    await mkdir(workspaceDir1, { recursive: true });
    await mkdir(workspaceDir2, { recursive: true });
    await mkdir(join(tempHome, ".opencorp"), { recursive: true });

    testRegistry = new ProcessRegistry({
      idleTimeoutMs: 100, // curto para teste de idle shutdown
      gracePeriodMs: 50,
      killer: () => {},
      isPidRunning: () => true,
    });
  });

  afterEach(async () => {
    // Teardown limpo: garante que todos os servidores fake sejam fechados sem órfãos
    for (const server of fakeServers) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    fakeServers = [];
    testRegistry.shutdownAll();
    await rm(tempHome, { recursive: true, force: true });
  });

  function startMockOpenCodeServer(port: number, expectedToken: string): Promise<Server> {
    return new Promise((resolve) => {
      const server = createServer(async (req, res) => {
        const url = req.url || "";
        const auth = req.headers.authorization;

        // Validação de autenticação local
        if (expectedToken && auth !== `Bearer ${expectedToken}`) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }

        if (url === "/health" && req.method === "GET") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok" }));
          return;
        }

        if (url === "/session" && req.method === "POST") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ id: "mock-sess-100", title: "Nova conversa" }));
          return;
        }

        if (url.startsWith("/session/") && url.endsWith("/message") && req.method === "POST") {
          let bodyStr = "";
          req.on("data", (chunk) => {
            bodyStr += chunk;
          });
          req.on("end", () => {
            const parsed = JSON.parse(bodyStr || "{}");
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                parts: [
                  { type: "thought", thought: "Pensando na solução..." },
                  { type: "tool", tool: "read_file", input: { path: "teste.txt" } },
                  { type: "text", text: `Resposta para: ${parsed.message}` },
                ],
              })
            );
          });
          return;
        }

        if (url.startsWith("/session/") && url.endsWith("/fork") && req.method === "POST") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ id: "mock-sess-forked-200" }));
          return;
        }

        if (url.startsWith("/session/") && req.method === "GET") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ id: "mock-sess-100", status: "idle" }));
          return;
        }

        if (url.startsWith("/session/") && req.method === "DELETE") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        if (url.startsWith("/session/") && url.endsWith("/abort") && req.method === "POST") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
      });

      server.listen(port, "127.0.0.1", () => {
        fakeServers.push(server);
        resolve(server);
      });
    });
  }

  it("manifesto: expõe capacidades canônicas declarando suporte a sessões e streaming", () => {
    const adapter = new OpenCodeAdapter({ homeDir: tempHome });
    expect(adapter.engineId).toBe("opencode");
    expect(adapter.manifest.supportsConversation).toBe(true);
    expect(adapter.manifest.features.streaming.level).toBe("integrated");
    expect(adapter.manifest.features.continuation.level).toBe("integrated");
    expect(adapter.manifest.features.fork.level).toBe("integrated");
  });

  it("sessão nova e autenticação local: cria sessão com token aleatório restrito a loopback", async () => {
    let capturedToken = "";
    let capturedPort = 0;

    const adapter = new OpenCodeAdapter({
      homeDir: tempHome,
      processRegistry: testRegistry,
      customServerLauncher: async ({ port, authToken }) => {
        capturedPort = port;
        capturedToken = authToken;
        await startMockOpenCodeServer(port, authToken);
        return { pid: 9001 };
      },
    });

    const ref = await adapter.conversationRuntime.create({
      workspaceId: "ws-1",
      workspacePath: workspaceDir1,
      model: "opencode/nemotron",
      homeDir: tempHome,
      title: "Olá Secretário",
    });

    expect(ref.id).toBe("mock-sess-100");
    expect(ref.engineId).toBe("opencode");
    expect(ref.workspaceId).toBe("ws-1");

    const meta = adapter.getSessionMeta(ref.id);
    expect(meta?.url).toBe(`http://127.0.0.1:${capturedPort}`);
    expect(capturedToken).toBeDefined();
    expect(capturedToken.length).toBeGreaterThan(10); // UUID aleatório gerado

    // Valida registro no ProcessRegistry
    const processKey = formatProcessKey({ engineId: "opencode", workspaceId: "ws-1" });
    const proc = testRegistry.get(processKey);
    expect(proc).toBeDefined();
    expect(proc?.pid).toBe(9001);
    expect(proc?.referenceCount).toBe(1);
    expect(proc?.authVerified).toBe(true);
  });

  it("envio e streaming: converte resposta do OpenCode em eventos canônicos AgentEvent", async () => {
    const adapter = new OpenCodeAdapter({
      homeDir: tempHome,
      processRegistry: testRegistry,
      customServerLauncher: async ({ port, authToken }) => {
        await startMockOpenCodeServer(port, authToken);
        return { pid: 9002 };
      },
    });

    const ref = await adapter.conversationRuntime.create({
      workspaceId: "ws-1",
      workspacePath: workspaceDir1,
      model: "opencode/nemotron",
      homeDir: tempHome,
    });

    const events: AgentEvent[] = [];
    for await (const ev of adapter.conversationRuntime.send(ref, {
      text: "Liste os arquivos",
    })) {
      events.push(ev);
    }

    expect(events.length).toBeGreaterThanOrEqual(4);
    expect(events[0]?.type).toBe("run.started");
    expect(events.some((e) => e.type === "message.delta")).toBe(true);
    expect(events.some((e) => e.type === "tool.requested")).toBe(true);
    expect(events[events.length - 1]?.type).toBe("run.completed");
    expect((events[events.length - 1] as any).result.stopReason).toBe("completed");
  });

  it("continuação: envia múltiplos turnos reutilizando o mesmo processo residente", async () => {
    let spawnCount = 0;

    const adapter = new OpenCodeAdapter({
      homeDir: tempHome,
      processRegistry: testRegistry,
      customServerLauncher: async ({ port, authToken }) => {
        spawnCount++;
        await startMockOpenCodeServer(port, authToken);
        return { pid: 9003 };
      },
    });

    const ref = await adapter.conversationRuntime.create({
      workspaceId: "ws-1",
      workspacePath: workspaceDir1,
      model: "opencode/nemotron",
      homeDir: tempHome,
    });

    // Primeiro turno
    for await (const _ of adapter.conversationRuntime.send(ref, {
      text: "Turno 1",
    })) {}

    // Segundo turno (continuação)
    for await (const _ of adapter.conversationRuntime.send(ref, {
      text: "Turno 2",
    })) {}

    // Servidor foi instanciado apenas UMA vez para a sessão
    expect(spawnCount).toBe(1);

    const proc = testRegistry.get(formatProcessKey({ engineId: "opencode", workspaceId: "ws-1" }));
    expect(proc?.referenceCount).toBe(1);
  });

  it("fork: bifurca sessão mantendo o mesmo runtime residente", async () => {
    const adapter = new OpenCodeAdapter({
      homeDir: tempHome,
      processRegistry: testRegistry,
      customServerLauncher: async ({ port, authToken }) => {
        await startMockOpenCodeServer(port, authToken);
        return { pid: 9004 };
      },
    });

    const refOriginal = await adapter.conversationRuntime.create({
      workspaceId: "ws-1",
      workspacePath: workspaceDir1,
      model: "opencode/nemotron",
      homeDir: tempHome,
    });

    const refForked = await adapter.conversationRuntime.fork!(refOriginal);
    expect(refForked.id).toBe("mock-sess-forked-200");
    expect(refForked.workspaceId).toBe("ws-1");
  });

  it("cancelamento: trata AbortSignal emitindo run.completed com stopReason cancelled", async () => {
    const adapter = new OpenCodeAdapter({
      homeDir: tempHome,
      processRegistry: testRegistry,
      customServerLauncher: async ({ port, authToken }) => {
        await startMockOpenCodeServer(port, authToken);
        return { pid: 9005 };
      },
    });

    const ref = await adapter.conversationRuntime.create({
      workspaceId: "ws-1",
      workspacePath: workspaceDir1,
      model: "opencode/nemotron",
      homeDir: tempHome,
    });

    const ac = new AbortController();
    ac.abort(); // já abortado

    const events: AgentEvent[] = [];
    for await (const ev of adapter.conversationRuntime.send(
      ref,
      { text: "Execução que será cancelada" },
      ac.signal
    )) {
      events.push(ev);
    }

    const last = events[events.length - 1];
    expect(last?.type).toBe("run.completed");
    expect((last as any).result.stopReason).toBe("cancelled");
  });

  it("isolamento entre workspaces: ws-1 e ws-2 possuem processos e portas dedicados", async () => {
    let serverCount = 0;
    const portsUsed: number[] = [];

    const adapter = new OpenCodeAdapter({
      homeDir: tempHome,
      processRegistry: testRegistry,
      customServerLauncher: async ({ port, authToken }) => {
        serverCount++;
        portsUsed.push(port);
        await startMockOpenCodeServer(port, authToken);
        return { pid: 9010 + serverCount };
      },
    });

    const ref1 = await adapter.conversationRuntime.create({
      workspaceId: "ws-1",
      workspacePath: workspaceDir1,
      model: "opencode/nemotron",
      homeDir: tempHome,
    });

    const ref2 = await adapter.conversationRuntime.create({
      workspaceId: "ws-2",
      workspacePath: workspaceDir2,
      model: "opencode/nemotron",
      homeDir: tempHome,
    });

    expect(ref1.workspaceId).toBe("ws-1");
    expect(ref2.workspaceId).toBe("ws-2");
    expect(serverCount).toBe(2);
    expect(portsUsed[0]).not.toBe(portsUsed[1]); // Portas dedicadas

    const key1 = formatProcessKey({ engineId: "opencode", workspaceId: "ws-1" });
    const key2 = formatProcessKey({ engineId: "opencode", workspaceId: "ws-2" });

    expect(testRegistry.get(key1)?.pid).toBe(9011);
    expect(testRegistry.get(key2)?.pid).toBe(9012);

    // Fechar ref1 libera ws-1 sem afetar ws-2
    await adapter.conversationRuntime.close(ref1);
    expect(testRegistry.get(key1)?.referenceCount).toBe(0);
    expect(testRegistry.get(key2)?.referenceCount).toBe(1);

    await adapter.conversationRuntime.close(ref2);
    expect(testRegistry.get(key2)?.referenceCount).toBe(0);
  });

  it("one-shot: executa CLI com parsing estruturado e emite run.completed", async () => {
    // Cria binário mock executável que simula saída estruturada do OpenCode CLI
    const mockBin = join(tempHome, "fake-opencode-cli.sh");
    await writeFile(
      mockBin,
      `#!/bin/sh
echo '{"type":"thought","thought":"Analisando tarefa"}'
echo '{"type":"tool","tool":"test_tool","id":"t1","input":{"foo":"bar"}}'
echo '{"type":"text","text":"Resultado da análise"}'
exit 0
`,
      "utf8"
    );
    await chmod(mockBin, 0o755);

    const adapter = new OpenCodeAdapter({
      homeDir: tempHome,
      binPath: mockBin,
      processRegistry: testRegistry,
    });

    const events: AgentEvent[] = [];
    for await (const ev of adapter.runner.run({
      runId: "run-test-1",
      sessionId: "session-test-1",
      agentId: "agent-test-1",
      model: "opencode/nemotron",
      prompt: "Realizar tarefa pontual",
      workspaceId: "ws-1",
      workspacePath: workspaceDir1,
      homeDir: tempHome,
    })) {
      events.push(ev);
    }

    expect(events.length).toBeGreaterThanOrEqual(4);
    expect(events[0]?.type).toBe("run.started");
    expect(events.some((e) => e.type === "message.delta")).toBe(true);
    expect(events.some((e) => e.type === "tool.requested")).toBe(true);
    expect(events[events.length - 1]?.type).toBe("run.completed");
    expect((events[events.length - 1] as any).result.stopReason).toBe("completed");
  });
});
