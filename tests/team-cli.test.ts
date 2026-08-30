import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const raizes: string[] = [];

afterAll(async () => {
  await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
});

let home = "";
let wsId = "";
let bin = "";

function runCli(args: string[], env: Record<string, string> = {}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [bin, ...args], {
      env: { ...process.env, OPENCORP_HOME: home, ...env },
      cwd: process.cwd(),
      timeout: 30_000,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.on("error", (err) => resolve({ code: -1, stdout, stderr: err.message }));
  });
}

beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), "opencorp-team-cli-"));
  raizes.push(home);
  bin = join(process.cwd(), "bin", "opencorp.mjs");
  const { WorkspaceManager } = await import("../src/core/workspace-manager.js");
  const ws = await new WorkspaceManager({ homeDir: home, cwd: home }).criar("corp-team-cli");
  wsId = ws.id;
});

describe("CLI team — integração real via binário", () => {
  it("team create pipeline com passos — exit 0 e saída ok", async () => {
    const { code, stdout, stderr } = await runCli([
      "team",
      "create",
      "pipeline-test",
      "--titulo",
      "T",
      "--padrao",
      "pipeline",
      "--passo",
      "a:x {{entrada}}",
      "--passo",
      "b:y",
      "--workspace",
      wsId,
    ]);
    expect(code).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain('ok: team "pipeline-test" criado (pipeline)');
  });

  it("team list mostra o team criado", async () => {
    const { code, stdout, stderr } = await runCli(["team", "list", "--workspace", wsId]);
    expect(code).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("pipeline-test");
    expect(stdout).toContain("pipeline");
  });

  it("team show retorna JSON com 2 passos", async () => {
    const { code, stdout, stderr } = await runCli(["team", "show", "pipeline-test", "--workspace", wsId]);
    expect(code).toBe(0);
    expect(stderr).toBe("");
    const spec = JSON.parse(stdout.trim());
    expect(spec.id).toBe("pipeline-test");
    expect(spec.padrao).toBe("pipeline");
    expect(spec.passos).toHaveLength(2);
    expect(spec.passos[0].agente).toBe("a");
    expect(spec.passos[1].agente).toBe("b");
  });

  it("team create fanout sem paralelos — exit != 0 e erro menciona 'paralelos'", async () => {
    const { code, stdout, stderr } = await runCli([
      "team",
      "create",
      "ruim",
      "--titulo",
      "R",
      "--padrao",
      "fanout",
      "--workspace",
      wsId,
    ]);
    expect(code).not.toBe(0);
    expect(stderr).toMatch(/paralelos/);
  });

  it("team create pipeline com passo sem dois-pontos — exit != 0 e erro menciona formato", async () => {
    const { code, stdout, stderr } = await runCli([
      "team",
      "create",
      "ruim2",
      "--titulo",
      "R",
      "--padrao",
      "pipeline",
      "--passo",
      "sem-dois-pontos",
      "--workspace",
      wsId,
    ]);
    expect(code).not.toBe(0);
    expect(stderr).toMatch(/use "<agente>:<ordem>"/);
  });

  it("team delete remove o team", async () => {
    const { code, stdout, stderr } = await runCli(["team", "delete", "pipeline-test", "--workspace", wsId]);
    expect(code).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("ok: pipeline-test excluído");
  });

  it("team list após delete fica vazio", async () => {
    const { code, stdout, stderr } = await runCli(["team", "list", "--workspace", wsId]);
    expect(code).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("nenhum team");
  });
});