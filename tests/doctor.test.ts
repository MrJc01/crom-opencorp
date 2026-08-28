import { afterAll, describe, expect, it } from "vitest";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkNodeVersion,
  findSecretFiles,
  loadSettings,
  lookupExecutable,
  runDoctor,
} from "../src/core/doctor.js";

const raizes: string[] = [];

async function tmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "opencorp-doctor-"));
  raizes.push(dir);
  return dir;
}

afterAll(async () => {
  await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
});

describe("checkNodeVersion", () => {
  it("passa para node >= 22", () => {
    expect(checkNodeVersion("v22.22.3").status).toBe("ok");
    expect(checkNodeVersion("v23.1.0").status).toBe("ok");
  });

  it("falha para node < 22", () => {
    expect(checkNodeVersion("v21.7.0").status).toBe("fail");
    expect(checkNodeVersion("v18.0.0").status).toBe("fail");
  });

  it("falha para versão ilegível", () => {
    expect(checkNodeVersion("banana").status).toBe("fail");
  });
});

describe("lookupExecutable (which sem spawn)", () => {
  it("encontra executável no PATH informado", async () => {
    const dir = await tmpDir();
    const exe = join(dir, "opencode");
    await writeFile(exe, "#!/bin/sh\n");
    await chmod(exe, 0o755);
    expect(lookupExecutable("opencode", dir)).toBe(exe);
  });

  it("ignora arquivo sem permissão de execução", async () => {
    const dir = await tmpDir();
    const exe = join(dir, "opencode");
    await writeFile(exe, "x");
    await chmod(exe, 0o644);
    expect(lookupExecutable("opencode", dir)).toBeNull();
  });

  it("ignora diretório com o mesmo nome", async () => {
    const dir = await tmpDir();
    await mkdir(join(dir, "opencode"), { recursive: true });
    expect(lookupExecutable("opencode", dir)).toBeNull();
  });

  it("retorna null quando não existe em nenhum diretório", () => {
    expect(lookupExecutable("opencode", "/caminho/inexistente")).toBeNull();
  });
});

describe("loadSettings", () => {
  it("settings ausente → info com 'não encontrado'", async () => {
    const base = await tmpDir();
    const check = await loadSettings(join(base, ".opencorp", "settings.json"));
    expect(check.check.status).toBe("info");
    expect(check.check.detail).toContain("não encontrado");
    expect(check.settings).toBeUndefined();
  });

  it("settings válido → ok e dados aplicados com defaults", async () => {
    const base = await tmpDir();
    const caminho = join(base, "settings.json");
    await writeFile(caminho, JSON.stringify({ version: 1, budget: { daily_usd: 2.5 } }));
    const check = await loadSettings(caminho);
    expect(check.check.status).toBe("ok");
    expect(check.settings?.budget.daily_usd).toBe(2.5);
    expect(check.settings?.default_model).toBe("opencode/grok-code");
  });

  it("JSON quebrado → fail", async () => {
    const base = await tmpDir();
    const caminho = join(base, "settings.json");
    await writeFile(caminho, "{ não é json");
    const check = await loadSettings(caminho);
    expect(check.check.status).toBe("fail");
    expect(check.check.detail).toContain("JSON inválido");
  });

  it("valor inválido → fail apontando a chave", async () => {
    const base = await tmpDir();
    const caminho = join(base, "settings.json");
    await writeFile(caminho, JSON.stringify({ budget: { daily_usd: "cinco" } }));
    const check = await loadSettings(caminho);
    expect(check.check.status).toBe("fail");
    expect(check.check.detail).toContain("budget.daily_usd");
  });
});

describe("findSecretFiles", () => {
  it("encontra apenas arquivos secrets* (case-insensitive), pulando node_modules e .git", async () => {
    const root = await tmpDir();
    const wsA = join(root, "ws-a");
    await mkdir(join(wsA, "docs"), { recursive: true });
    await mkdir(join(root, "ws-b"), { recursive: true });
    await mkdir(join(root, "ws-c", "node_modules"), { recursive: true });
    await mkdir(join(root, "ws-c", ".git"), { recursive: true });
    await writeFile(join(wsA, "secrets.json"), "{}");
    await writeFile(join(wsA, "docs", "SECRETS.env"), "x");
    await writeFile(join(root, "ws-b", "notas.txt"), "x");
    await writeFile(join(root, "ws-c", "node_modules", "secrets.json"), "{}");
    await writeFile(join(root, "ws-c", ".git", "secrets.json"), "{}");
    const encontrados = await findSecretFiles([root]);
    const relativos = encontrados.map((p) => p.slice(root.length + 1));
    expect(relativos).toEqual(["ws-a/docs/SECRETS.env", "ws-a/secrets.json"]);
  });

  it("retorna [] para raiz inexistente", async () => {
    expect(await findSecretFiles(["/caminho/inexistente"])).toEqual([]);
  });
});

describe("runDoctor (integração, tudo injetado)", () => {
  it("ambiente saudável → exitCode 0, com alerta de segredos", async () => {
    const home = await tmpDir();
    const bin = await tmpDir();
    await writeFile(join(bin, "opencode"), "#!/bin/sh\n");
    await chmod(join(bin, "opencode"), 0o755);
    const settingsDir = join(home, ".opencorp");
    await mkdir(settingsDir, { recursive: true });
    await writeFile(join(settingsDir, "settings.json"), JSON.stringify({ version: 1 }));
    const workspaces = join(home, "corps");
    await mkdir(join(workspaces, "corp-teste"), { recursive: true });
    await writeFile(join(workspaces, "corp-teste", "secrets.json"), "{}");

    const resultado = await runDoctor({
      nodeVersion: "v22.22.3",
      pathEnv: bin,
      homeDir: home,
      cwd: home,
      settingsPath: join(settingsDir, "settings.json"),
      workspaceRoots: [workspaces],
    });

    const porId = new Map(resultado.checks.map((c) => [c.id, c]));
    expect(porId.get("node")?.status).toBe("ok");
    expect(porId.get("opencode")?.status).toBe("ok");
    expect(porId.get("settings")?.status).toBe("ok");
    expect(porId.get("escrita")?.status).toBe("ok");
    expect(porId.get("segredos")?.status).toBe("warn");
    expect(porId.get("segredos")?.items).toHaveLength(1);
    expect(resultado.ok).toBe(true);
    expect(resultado.exitCode).toBe(0);
  });

  it("sem opencode no PATH → exitCode 1", async () => {
    const home = await tmpDir();
    const resultado = await runDoctor({
      nodeVersion: "v22.0.0",
      pathEnv: "",
      homeDir: home,
      cwd: home,
      settingsPath: join(home, "inexistente.json"),
      workspaceRoots: [],
    });
    expect(resultado.checks.find((c) => c.id === "opencode")?.status).toBe("fail");
    expect(resultado.ok).toBe(false);
    expect(resultado.exitCode).toBe(1);
  });

  it("settings inválido → exitCode 2", async () => {
    const home = await tmpDir();
    const settingsPath = join(home, "settings.json");
    await writeFile(settingsPath, JSON.stringify({ budget: { daily_usd: "cinco" } }));
    const resultado = await runDoctor({
      nodeVersion: "v22.0.0",
      pathEnv: "",
      homeDir: home,
      cwd: home,
      settingsPath,
      workspaceRoots: [],
    });
    expect(resultado.checks.find((c) => c.id === "settings")?.status).toBe("fail");
    expect(resultado.exitCode).toBe(2);
  });

  it("node antigo → exitCode 1", async () => {
    const home = await tmpDir();
    const resultado = await runDoctor({
      nodeVersion: "v20.11.0",
      pathEnv: "",
      homeDir: home,
      cwd: home,
      settingsPath: join(home, "inexistente.json"),
      workspaceRoots: [],
    });
    expect(resultado.checks.find((c) => c.id === "node")?.status).toBe("fail");
    expect(resultado.exitCode).toBe(1);
  });

  const ehRoot = typeof process.getuid === "function" && process.getuid() === 0;
  it.skipIf(ehRoot)("sem permissão de escrita em ~/.opencorp → fail", async () => {
    const home = await tmpDir();
    const oc = join(home, ".opencorp");
    await mkdir(oc, { recursive: true });
    await chmod(oc, 0o555);
    const resultado = await runDoctor({
      nodeVersion: "v22.0.0",
      pathEnv: "",
      homeDir: home,
      cwd: home,
      settingsPath: join(home, "inexistente.json"),
      workspaceRoots: [],
    });
    const escrita = resultado.checks.find((c) => c.id === "escrita");
    expect(escrita?.status).toBe("fail");
    expect(escrita?.detail).toContain(join(home, ".opencorp"));
  });
});
