import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { envOpencodeIsolado } from "../src/core/opencode-server.js";

describe("Isolamento de Workspace e Variáveis de Ambiente", () => {
  let tempHome: string;

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), "opencorp-iso-test-"));
  });

  afterEach(() => {
    try {
      rmSync(tempHome, { recursive: true, force: true });
    } catch {}
  });

  it("envOpencodeIsolado exporta OPENCORP_WORKSPACE e OPENCORP_WORKSPACE_DIR quando fornecidos", () => {
    const wsId = "empresa-alfa";
    const wsPath = join(tempHome, "workspaces", wsId);
    mkdirSync(wsPath, { recursive: true });

    const env = envOpencodeIsolado(tempHome, wsId, wsPath);

    expect(env.OPENCORP_HOME).toBe(tempHome);
    expect(env.OPENCORP_WORKSPACE).toBe(wsId);
    expect(env.OPENCORP_WORKSPACE_DIR).toBe(wsPath);
    expect(env.XDG_DATA_HOME).toContain(join("workspaces", wsId));
  });

  it("envOpencodeIsolado isola diretório de dados por workspace", () => {
    const ws1 = "empresa-1";
    const ws2 = "empresa-2";

    const env1 = envOpencodeIsolado(tempHome, ws1);
    const env2 = envOpencodeIsolado(tempHome, ws2);

    expect(env1.XDG_DATA_HOME).not.toBe(env2.XDG_DATA_HOME);
    expect(env1.XDG_DATA_HOME).toContain(ws1);
    expect(env2.XDG_DATA_HOME).toContain(ws2);
  });
});
