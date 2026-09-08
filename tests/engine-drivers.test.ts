import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { engineRegistry } from "../src/core/engines/index.js";
import { createApiServer } from "../src/server/index.js";

describe("EngineRegistry & Multi-Engine Drivers", () => {
  let tempHome: string;
  let serverInstance: any;
  let serverPort: number;

  beforeAll(async () => {
    tempHome = join(tmpdir(), `opencorp-engines-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    mkdirSync(join(tempHome, ".opencorp", "bin"), { recursive: true });

    serverPort = 44700 + Math.floor(Math.random() * 200);
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

  it("deve carregar todos os motores suportados no EngineRegistry", () => {
    const drivers = engineRegistry.list();
    const ids = drivers.map((d) => d.id);

    expect(ids).toContain("opencode");
    expect(ids).toContain("crom-agente");
    expect(ids).toContain("claude-code");
    expect(ids).toContain("antigravity");
    expect(ids).toContain("cursor");
    expect(ids).toContain("copilot");
    expect(ids).toContain("codex");
    expect(ids).toContain("aider");
  });

  it("deve resolver aliases para motores corretamente", () => {
    expect(engineRegistry.resolveDriver("crom-agente").id).toBe("crom-agente");
    expect(engineRegistry.resolveDriver("crom").id).toBe("crom-agente");
    expect(engineRegistry.resolveDriver("claude").id).toBe("claude-code");
    expect(engineRegistry.resolveDriver("agy").id).toBe("antigravity");
    expect(engineRegistry.resolveDriver("desconhecido").id).toBe("opencode");
  });

  it("deve listar summaries com status de instalação e isolamento", async () => {
    const summaries = await engineRegistry.listSummaries(tempHome, false);
    expect(Array.isArray(summaries)).toBe(true);
    expect(summaries.length).toBeGreaterThanOrEqual(4);

    const oc = summaries.find((s) => s.id === "opencode");
    expect(oc).toBeDefined();
    expect(oc?.name).toContain("OpenCode");

    const crom = summaries.find((s) => s.id === "crom-agente");
    expect(crom).toBeDefined();
    expect(crom?.maintainer).toBe("CromIA");
  });

  it("deve preparar execução com parâmetros isolados para crom-agente", async () => {
    const cromDriver = engineRegistry.get("crom-agente")!;
    const prep = await cromDriver.prepareExecution({
      workspaceId: "ws1",
      workspacePath: "/tmp/ws1",
      sessionId: "sess-123",
      agentId: "operario",
      model: "openrouter/google/gemini-3.8-flash",
      prompt: "Execute tarefa",
      homeDir: tempHome,
    });

    expect(prep.args).toContain("run");
    expect(prep.args).toContain("Execute tarefa");
    expect(prep.args).toContain("--workspace");
    expect(prep.args).toContain("/tmp/ws1");
    expect(prep.args).toContain("--permission-mode");
    expect(prep.args).toContain("total_access");
    expect(prep.args).toContain("--provider");
    expect(prep.args).toContain("openrouter");
    expect(prep.cwd).toBe("/tmp/ws1");
  });

  it("GET /api/motores deve responder 200 com lista completa de motores e diagnósticos", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/motores`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as any;
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.motores)).toBe(true);
    expect(data.motores.some((m: any) => m.id === "opencode")).toBe(true);
    expect(data.motores.some((m: any) => m.id === "crom-agente")).toBe(true);
    expect(data.motores.some((m: any) => m.id === "claude-code")).toBe(true);
    expect(data.motores.some((m: any) => m.id === "antigravity")).toBe(true);
  });

  it("POST /api/motores/:id/test deve executar verificação de saúde", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/motores/opencode/test`, {
      method: "POST",
    });
    expect(res.status).toBe(200);

    const data = (await res.json()) as any;
    expect(data.ok).toBe(true);
    expect(data.motorId).toBe("opencode");
    expect(data.health).toBeDefined();
  });

  it("cada módulo adaptador de motor deve implementar fetchLiveTokens sem cálculos cegos", async () => {
    const drivers = engineRegistry.list();
    for (const driver of drivers) {
      const liveUsage = await driver.fetchLiveTokens(tempHome);
      expect(liveUsage).toBeDefined();
      expect(liveUsage.motorId).toBe(driver.id);
      expect(liveUsage.motorName).toBe(driver.name);
      expect(["api_live", "cli_live", "oauth_session", "unconfigured", "error"]).toContain(liveUsage.source);
      expect(typeof liveUsage.mensagem).toBe("string");
      expect(liveUsage.consultadoEm).toBeDefined();
    }
  });

  it("GET /api/motores/tokens deve responder 200 com quotas e tokens reais de todos os motores", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/motores/tokens`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as any;
    expect(data.ok).toBe(true);
    expect(data.tokens).toBeDefined();
    expect(data.tokens.opencode).toBeDefined();
    expect(data.tokens.copilot).toBeDefined();
    expect(data.tokens.antigravity).toBeDefined();
  });

  it("GET /api/motores/:id/tokens deve retornar cota e tokens do motor especificado", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/motores/copilot/tokens`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as any;
    expect(data.ok).toBe(true);
    expect(data.motorId).toBe("copilot");
    expect(data.tokens).toBeDefined();
    expect(data.tokens.motorId).toBe("copilot");
  });
});
