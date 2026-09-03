import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApiServer } from "../src/server/index.js";

describe("Endpoint /motores/status e /llm/*", () => {
  let tempHome: string;
  let serverInstance: any;
  let serverPort: number;

  beforeAll(async () => {
    tempHome = join(tmpdir(), `opencorp-motores-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    mkdirSync(join(tempHome, ".opencorp", "workspaces", "ws-teste", ".opencorp"), { recursive: true });

    serverPort = 44500 + Math.floor(Math.random() * 500);
    const s = createApiServer({
      porta: serverPort,
      homeDir: tempHome,
      token: "",
    });
    serverInstance = s.server;
    serverInstance.listen(serverPort);
    await s.porta;
  });

  afterAll(async () => {
    if (serverInstance?.close) {
      await new Promise<void>((r) => serverInstance.close(() => r()));
    }
    rmSync(tempHome, { recursive: true, force: true });
  });

  it("GET /motores/status retorna diagnóstico do OpenCode, provedores e daemons", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/motores/status`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as any;
    expect(data.ok).toBe(true);
    expect(data.opencode).toBeDefined();
    expect(data.opencode.path).toBeDefined();
    expect(Array.isArray(data.provedores)).toBe(true);
    expect(data.provedores.some((p: any) => p.id === "openrouter")).toBe(true);
    expect(data.daemons).toBeDefined();
    expect(data.harnesses_suportados).toBeDefined();
  });
});
