import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceManager } from "../src/core/workspace-manager.js";
import { isModoOc, buildProgram } from "../src/cli/index.js";

describe("CLI 'oc' vs 'opencorp' & Target Resolution", () => {
  let tempDir: string;
  let homeDir: string;
  let wsDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "oc-test-"));
    homeDir = join(tempDir, "home");
    wsDir = join(tempDir, "workspaces", "ws-teste");
    await mkdir(join(homeDir, ".opencorp"), { recursive: true });
    await mkdir(wsDir, { recursive: true });
    await writeFile(
      join(homeDir, ".opencorp", "workspaces.json"),
      JSON.stringify(
        {
          version: 1,
          ativo: null,
          workspaces: [
            {
              id: "ws-teste",
              criado_em: new Date().toISOString(),
              path: wsDir,
            },
          ],
        },
        null,
        2
      )
    );
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    delete process.env.OPENCORP_CLI_MODE;
    delete process.env.OPENCORP_WORKSPACE;
    delete process.env.OPENCORP_ACTIVE_WS;
  });

  it("detecta modo 'oc' via env e via argv", () => {
    expect(isModoOc(["node", "/usr/local/bin/oc"])).toBe(true);
    expect(isModoOc(["node", "/usr/local/bin/oc.mjs"])).toBe(true);
    expect(isModoOc(["node", "/usr/local/bin/opencorp"])).toBe(false);

    process.env.OPENCORP_CLI_MODE = "oc";
    expect(isModoOc(["node", "/usr/local/bin/qualquer"])).toBe(true);
  });

  it("auto-detecta o workspace a partir do cwd", async () => {
    const wm = new WorkspaceManager({
      homeDir,
      cwd: join(wsDir, "subpasta", "dados"),
    });
    const ws = await wm.atual();
    expect(ws?.id).toBe("ws-teste");
    expect(ws?.path).toBe(wsDir);
  });

  it("prioriza target explícito sobre cwd", async () => {
    const wsOutro = join(tempDir, "workspaces", "ws-outro");
    await mkdir(wsOutro, { recursive: true });
    const content = JSON.parse(
      await (await import("node:fs/promises")).readFile(
        join(homeDir, ".opencorp", "workspaces.json"),
        "utf8"
      )
    );
    content.workspaces.push({
      id: "ws-outro",
      criado_em: new Date().toISOString(),
      path: wsOutro,
    });
    await writeFile(join(homeDir, ".opencorp", "workspaces.json"), JSON.stringify(content));

    const wm = new WorkspaceManager({
      homeDir,
      cwd: wsDir,
    });
    const ws = await wm.resolver("ws-outro");
    expect(ws.id).toBe("ws-outro");
  });

  it("programa no modo 'oc' bloqueia daemon, serve e init", () => {
    const ocProgram = buildProgram(true);
    const daemonCmd = ocProgram.commands.find((c) => c.name() === "daemon");
    const serveCmd = ocProgram.commands.find((c) => c.name() === "serve");
    const initCmd = ocProgram.commands.find((c) => c.name() === "init");

    expect(daemonCmd).toBeDefined();
    expect(daemonCmd?.description()).toContain("Infraestrutura Global");
    expect(serveCmd).toBeDefined();
    expect(serveCmd?.description()).toContain("Infraestrutura Global");
    expect(initCmd).toBeDefined();
    expect(initCmd?.description()).toContain("Infraestrutura Global");
  });
});
