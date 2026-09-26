import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, readlink, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import {
  ManagedEngineInstaller,
  ManagedInstallUnsupportedError,
  requireEngineBinary,
  resolveEngineBinary,
  ConversationRuntimeResolver,
  EngineRegistry,
  CANONICAL_ENGINE_MANIFESTS,
  type ApprovedArtifact,
  type EngineAdapter,
} from "../src/core/engines/index.js";

const ELF = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(60)]);

async function makeTarball(dir: string, name: string, files: Record<string, Buffer | string>, transform?: string): Promise<{ path: string; sha256: string; size: number }> {
  const src = join(dir, `${name}-src`);
  await mkdir(src, { recursive: true });
  for (const [file, content] of Object.entries(files)) {
    await mkdir(join(src, file, ".."), { recursive: true });
    await writeFile(join(src, file), content);
    await chmod(join(src, file), 0o755);
  }
  const path = join(dir, `${name}.tar.gz`);
  execFileSync("tar", ["-czf", path, "-C", src, ...(transform ? ["--transform", transform] : []), ...Object.keys(files)], { stdio: "ignore" });
  const buf = readFileSync(path);
  return { path, sha256: createHash("sha256").update(buf).digest("hex"), size: buf.length };
}

function artifact(version: string, tar: { sha256: string; size: number }, member = "fake-engine"): ApprovedArtifact {
  return {
    engineId: "fake",
    version,
    platform: "linux-x64",
    url: `https://example.invalid/fake-${version}.tar.gz`,
    sha256: tar.sha256,
    sizeBytes: tar.size,
    format: "tar.gz",
    member,
    binaryName: "fake",
    source: "teste",
  };
}

describe("ETAPA 10 — resolução de binário e instalação gerenciada", () => {
  let home: string;
  let work: string;
  let tarballs: Map<string, string>;
  let downloads: string[];
  let probeFails: boolean;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "opencorp-install-"));
    work = join(home, "work");
    await mkdir(join(home, ".opencorp"), { recursive: true });
    await mkdir(work, { recursive: true });
    tarballs = new Map();
    downloads = [];
    probeFails = false;
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  const installer = (manifest: ApprovedArtifact[]) =>
    new ManagedEngineInstaller({
      homeDir: home,
      platform: "linux-x64",
      manifest,
      download: async (url, dest) => {
        downloads.push(url);
        const src = tarballs.get(url);
        if (!src) throw new Error("404");
        await copyFile(src, dest);
      },
      probe: async () => {
        if (probeFails) throw new Error("--version saiu com código 1");
        return "fake 1.0";
      },
    });

  async function publish(version: string, files: Record<string, Buffer | string> = { "fake-engine": ELF }, member?: string, transform?: string) {
    const tar = await makeTarball(work, `v${version}`, files, transform);
    const a = artifact(version, tar, member);
    tarballs.set(a.url, tar.path);
    return a;
  }

  const managedRoot = () => join(home, ".opencorp", "engines", "fake");

  describe("precedência do binário", () => {
    async function exe(path: string) {
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, "#!/bin/sh\necho 1\n");
      await chmod(path, 0o755);
      return path;
    }

    it("settings.binary_path vence PATH, que vence a instalação gerenciada", async () => {
      const explicit = await exe(join(home, "explicit", "codex"));
      const onPath = await exe(join(home, "pathdir", "codex"));
      const managed = await exe(join(home, ".opencorp", "engines", "codex", "1.0.0", "bin", "codex"));
      execFileSync("ln", ["-s", "1.0.0", join(home, ".opencorp", "engines", "codex", "current")]);
      const probe = async () => "v";

      await writeFile(join(home, ".opencorp", "settings.json"), JSON.stringify({ engines: { codex: { binary_path: explicit } } }));
      expect(await resolveEngineBinary("codex", { homeDir: home, pathEnv: join(home, "pathdir"), versionProbe: probe })).toMatchObject({ path: explicit, source: "settings" });

      await writeFile(join(home, ".opencorp", "settings.json"), "{}");
      expect(await resolveEngineBinary("codex", { homeDir: home, pathEnv: join(home, "pathdir"), versionProbe: probe })).toMatchObject({ path: onPath, source: "path" });

      const viaManaged = await resolveEngineBinary("codex", { homeDir: home, pathEnv: "/nao/existe", versionProbe: probe });
      expect(viaManaged).toMatchObject({ source: "managed", isManaged: true });
      expect(viaManaged.path).toBe(join(home, ".opencorp", "engines", "codex", "current", "bin", "codex"));
      expect(existsSync(managed)).toBe(true);
    });

    it("binary_path inexistente falha sem cair para outra fonte", async () => {
      await exe(join(home, "pathdir", "codex"));
      await writeFile(join(home, ".opencorp", "settings.json"), JSON.stringify({ engines: { codex: { binary_path: "/nao/existe/codex" } } }));
      const r = await resolveEngineBinary("codex", { homeDir: home, pathEnv: join(home, "pathdir") });
      expect(r.installed).toBe(false);
      expect(r.details).toContain("/nao/existe/codex");
    });

    it("ausência resulta em PREFLIGHT_BINARY_MISSING, usando a detecção legada só como último recurso", async () => {
      await expect(requireEngineBinary("codex", { homeDir: home, pathEnv: "/nao/existe" })).rejects.toMatchObject({ code: "PREFLIGHT_BINARY_MISSING" });
      const legacy = await resolveEngineBinary("codex", {
        homeDir: home,
        pathEnv: "/nao/existe",
        legacyDetect: async () => ({ installed: true, isManaged: true, path: "/legado/codex", version: "0.1" }),
      });
      expect(legacy).toMatchObject({ path: "/legado/codex", source: "legacy" });
    });
  });

  it("instala, registra proveniência e ativa por symlink `current`", async () => {
    const v1 = await publish("1.0.0");
    const result = await installer([v1]).install("fake");
    expect(result.version).toBe("1.0.0");
    expect(await readlink(join(managedRoot(), "current"))).toBe("1.0.0");
    const prov = JSON.parse(await readFile(join(managedRoot(), "current", "provenance.json"), "utf8"));
    expect(prov).toMatchObject({ engineId: "fake", version: "1.0.0", sha256: v1.sha256, url: v1.url, source: "teste", probeOutput: "fake 1.0" });
    expect(statSync(join(managedRoot(), "current", "bin", "fake")).mode & 0o111).toBeTruthy();
    expect(await readdir(join(home, ".opencorp", "engines", ".staging"))).toEqual([]);
  });

  it("checksum inválido não ativa o artefato e preserva a versão corrente", async () => {
    const v1 = await publish("1.0.0");
    await installer([v1]).install("fake");
    const v2 = { ...(await publish("2.0.0")), sha256: "0".repeat(64) };
    await expect(installer([v2]).install("fake")).rejects.toMatchObject({ details: { stage: "checksum" } });
    expect(await readlink(join(managedRoot(), "current"))).toBe("1.0.0");
    expect(existsSync(join(managedRoot(), "2.0.0"))).toBe(false);
  });

  it("probe falho descarta o staging e mantém a versão anterior", async () => {
    const v1 = await publish("1.0.0");
    await installer([v1]).install("fake");
    const v2 = await publish("2.0.0");
    probeFails = true;
    await expect(installer([v2]).install("fake")).rejects.toMatchObject({ details: { stage: "probe" } });
    expect(await readlink(join(managedRoot(), "current"))).toBe("1.0.0");
    expect(existsSync(join(managedRoot(), "2.0.0"))).toBe(false);
    expect(await readdir(join(home, ".opencorp", "engines", ".staging"))).toEqual([]);
  });

  it("interrupção durante o download preserva a versão corrente e o staging é limpo", async () => {
    const v1 = await publish("1.0.0");
    await installer([v1]).install("fake");
    const v2 = await publish("2.0.0");
    const interrupted = new ManagedEngineInstaller({
      homeDir: home,
      platform: "linux-x64",
      manifest: [v2],
      download: async (_url, dest) => {
        await writeFile(dest, "parcial");
        throw new Error("conexão encerrada");
      },
      probe: async () => "x",
    });
    await expect(interrupted.install("fake")).rejects.toMatchObject({ details: { stage: "download" } });
    expect(await readlink(join(managedRoot(), "current"))).toBe("1.0.0");
    // staging deixado por um processo morto é removido na próxima instalação
    await mkdir(join(home, ".opencorp", "engines", ".staging", "fake-deadbeef"), { recursive: true });
    await installer([v2]).install("fake");
    expect(await readdir(join(home, ".opencorp", "engines", ".staging"))).toEqual([]);
  });

  it("rejeita caminhos inseguros, membro ausente e executável não nativo", async () => {
    const traversal = await publish("3.0.0", { "fake-engine": ELF, escape: "x" }, undefined, "s,^escape$,../escape,");
    await expect(installer([traversal]).install("fake")).rejects.toMatchObject({ details: { stage: "formato" } });

    const missing = await publish("4.0.0", { other: ELF });
    await expect(installer([missing]).install("fake")).rejects.toThrow(/ausente/);

    const script = await publish("5.0.0", { "fake-engine": "#!/bin/sh\necho oi\n" });
    await expect(installer([script]).install("fake")).rejects.toThrow(/ELF/);
    expect(existsSync(join(managedRoot(), "current"))).toBe(false);
  });

  it("recusa motor sem artefato aprovado, sem baixar nada", async () => {
    await expect(installer([]).install("claude-code")).rejects.toBeInstanceOf(ManagedInstallUnsupportedError);
    expect(downloads).toEqual([]);
  });

  it("rollback reativa a versão anterior", async () => {
    await installer([await publish("1.0.0")]).install("fake");
    await installer([await publish("2.0.0")]).install("fake");
    expect(await readlink(join(managedRoot(), "current"))).toBe("2.0.0");
    expect(installer([]).rollback("fake")).toEqual({ engineId: "fake", version: "1.0.0" });
    expect(await readlink(join(managedRoot(), "current"))).toBe("1.0.0");
  });

  it("o manifesto real só contém artefatos com SHA-256 e origem oficial", async () => {
    const { APPROVED_ARTIFACTS } = await import("../src/core/engines/installer/approved-artifacts.js");
    for (const a of APPROVED_ARTIFACTS) {
      expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(a.url).toMatch(/^https:\/\/github\.com\/(openai\/codex|sst\/opencode)\/releases\/download\//);
      expect(a.url).toContain(a.version);
    }
  });

  it("preflight do chat não instala motor ausente", async () => {
    let installCalls = 0;
    const adapter = {
      engineId: "fake-chat",
      name: "Fake",
      manifest: { ...CANONICAL_ENGINE_MANIFESTS.codex, engineId: "fake-chat", name: "Fake" },
      installer: {
        engineId: "fake-chat",
        status: async () => ({ installed: false, isManaged: false, path: null, version: null }),
        install: async () => { installCalls += 1; throw new Error("não deveria instalar"); },
      },
      authenticator: { engineId: "fake-chat", status: async () => ({ authenticated: true, method: "t" }) },
      runner: { engineId: "fake-chat", run: async function* () {} },
      conversationRuntime: { engineId: "fake-chat", create: async () => ({ id: "x", engineId: "fake-chat", workspaceId: "w" }), send: async function* () {}, resume: async () => ({}) as any, close: async () => {} },
    } as unknown as EngineAdapter;
    const registry = new EngineRegistry();
    registry.registerAdapter(adapter);
    const resolver = new ConversationRuntimeResolver({ homeDir: home, registry });
    const result = await resolver.resolve({ workspaceId: "w", workspaceDir: work, engineOverride: "fake-chat", strict: false } as any);
    expect(result.preflight.ok).toBe(false);
    expect(installCalls).toBe(0);
  });

  it("nenhum caminho de execução chama install() e não há `curl | bash` no produto", () => {
    // Código que executa: núcleo e servidor. A UI pode exibir o comando oficial
    // do fornecedor para o usuário copiar, mas o OpenCorp nunca o executa.
    const root = join(__dirname, "..", "src");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(entry.name)) files.push(p);
      }
    };
    walk(join(root, "core"));
    walk(join(root, "server"));
    const allowed = new Set([
      "server/routes/config.ts",
      "core/engines/adapter-compat.ts",
      "core/engines/adapters/codex-adapter.ts",
      "core/engines/adapters/opencode-adapter.ts",
      "core/engines/acp/acp-adapter.ts",
      "core/engines/installer/managed-installer.ts",
    ]);
    for (const file of files) {
      const rel = relative(root, file).replace(/\\/g, "/");
      const src = readFileSync(file, "utf8");
      if (/\b(driver|installer)\.install\(/.test(src)) expect(allowed.has(rel), `${rel} chama install()`).toBe(true);
      if (!/blocklist/.test(src)) expect(/curl[^\n]*\|\s*(ba)?sh\b/.test(src), `${rel} contém curl | sh`).toBe(false);
    }
  });
});
