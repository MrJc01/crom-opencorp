/**
 * ManagedEngineInstaller — instalação gerenciada, fixada, verificada e reversível (D3).
 *
 * Fluxo:
 *   1. localizar artefato aprovado para motor + plataforma (sem entrada → recusa);
 *   2. baixar para `~/.opencorp/engines/.staging/<id>-<rand>/` calculando SHA-256;
 *   3. recusar se o SHA-256 ou o tamanho divergirem — nada é extraído;
 *   4. listar o tar e exigir o membro esperado como arquivo regular, sem
 *      caminhos absolutos ou `..`; extrair só esse membro;
 *   5. validar formato (ELF/Mach-O) e permissão de execução;
 *   6. executar o probe (`--version`) no staging;
 *   7. mover para `<id>/<versão>/` e trocar o symlink `current` por rename
 *      atômico; registrar proveniência e histórico;
 *   8. qualquer falha antes da troca remove o staging e mantém a versão atual.
 *
 * Só é chamado por ação explícita (UI/API/CLI). Job e chat usam apenas
 * `requireEngineBinary` (preflight).
 */
import { createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, symlinkSync, writeFileSync, chmodSync, openSync, readSync, closeSync, lstatSync } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";
import * as childProcess from "node:child_process";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { EngineError } from "../errors.js";
import { APPROVED_ARTIFACTS, MANUAL_INSTALL_INSTRUCTIONS, currentPlatform, findApprovedArtifact, type ApprovedArtifact, type EnginePlatform } from "./approved-artifacts.js";
import { managedEngineRoot } from "./binary-resolver.js";

const execFileAsync = (file: string, args: string[], options: childProcess.ExecFileOptions): Promise<{ stdout: string; stderr: string }> =>
  (promisify(childProcess.execFile) as any)(file, args, { encoding: "utf8", ...options });

export class ManagedInstallUnsupportedError extends EngineError {
  constructor(engineId: string, platform: string | undefined) {
    const manual = MANUAL_INSTALL_INSTRUCTIONS[engineId];
    super(
      "ENGINE_UNAVAILABLE",
      `Instalação gerenciada não suportada para "${engineId}" em ${platform ?? "esta plataforma"}: não há artefato com checksum aprovado.${manual ? ` ${manual}` : ""}`,
      { engineId, details: { managedInstall: "unsupported", platform, manualInstructions: manual } }
    );
  }
}

export class ManagedInstallError extends EngineError {
  constructor(engineId: string, stage: string, message: string, cause?: unknown) {
    super("ENGINE_UNAVAILABLE", `Instalação de "${engineId}" falhou em ${stage}: ${message}`, { engineId, cause, details: { stage } });
  }
}

export interface InstallProvenance {
  engineId: string;
  version: string;
  platform: EnginePlatform;
  url: string;
  sha256: string;
  source: string;
  installedAt: string;
  probeOutput: string;
}

export interface ManagedInstallResult {
  engineId: string;
  version: string;
  path: string;
  provenance: InstallProvenance;
  previousVersion?: string;
}

/** Baixa `url` para `destination`; deve falhar se passar de `maxBytes`. */
export type ArtifactDownloader = (url: string, destination: string, maxBytes: number) => Promise<void>;
export type BinaryProbe = (binaryPath: string) => Promise<string>;

export interface ManagedInstallerOptions {
  homeDir: string;
  platform?: EnginePlatform;
  manifest?: readonly ApprovedArtifact[];
  download?: ArtifactDownloader;
  probe?: BinaryProbe;
  now?: () => Date;
}

const defaultDownloader: ArtifactDownloader = async (url, destination, maxBytes) => {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} ao baixar ${url}`);
  let bytes = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      bytes += chunk.length;
      if (bytes > maxBytes) cb(new Error(`download excede ${maxBytes} bytes`));
      else cb(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body as any), limiter, createWriteStream(destination, { mode: 0o600 }));
};

const defaultProbe: BinaryProbe = async (binaryPath) => {
  const { stdout } = await execFileAsync(binaryPath, ["--version"], { timeout: 15_000 });
  const out = stdout.trim();
  if (!out) throw new Error("--version não produziu saída");
  return out.split("\n")[0]!;
};

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

function readMagic(path: string): Buffer {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(4);
    readSync(fd, buf, 0, 4, 0);
    return buf;
  } finally {
    closeSync(fd);
  }
}

export function isNativeExecutable(path: string): boolean {
  const m = readMagic(path);
  const elf = m[0] === 0x7f && m[1] === 0x45 && m[2] === 0x4c && m[3] === 0x46;
  const macho = [0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe].includes(m.readUInt32BE(0));
  return elf || macho;
}

interface HistoryFile {
  current?: string;
  previous?: string;
  installs: Array<{ version: string; installedAt: string; sha256: string }>;
}

export class ManagedEngineInstaller {
  private readonly homeDir: string;
  private readonly platform?: EnginePlatform;
  private readonly manifest: readonly ApprovedArtifact[];
  private readonly download: ArtifactDownloader;
  private readonly probe: BinaryProbe;
  private readonly now: () => Date;

  constructor(opts: ManagedInstallerOptions) {
    this.homeDir = opts.homeDir;
    this.platform = opts.platform ?? currentPlatform();
    this.manifest = opts.manifest ?? APPROVED_ARTIFACTS;
    this.download = opts.download ?? defaultDownloader;
    this.probe = opts.probe ?? defaultProbe;
    this.now = opts.now ?? (() => new Date());
  }

  /** Artefato aprovado para o motor nesta plataforma, ou `undefined`. */
  artifactFor(engineId: string): ApprovedArtifact | undefined {
    return findApprovedArtifact(engineId, this.platform, this.manifest);
  }

  isSupported(engineId: string): boolean {
    return Boolean(this.artifactFor(engineId));
  }

  async install(engineId: string, onProgress?: (msg: string) => void): Promise<ManagedInstallResult> {
    const artifact = this.artifactFor(engineId);
    if (!artifact) throw new ManagedInstallUnsupportedError(engineId, this.platform);

    const root = managedEngineRoot(this.homeDir, engineId);
    const stagingRoot = join(this.homeDir, ".opencorp", "engines", ".staging");
    mkdirSync(stagingRoot, { recursive: true, mode: 0o700 });
    this.cleanupStaleStaging(stagingRoot, engineId);
    const staging = join(stagingRoot, `${engineId}-${randomBytes(6).toString("hex")}`);
    mkdirSync(join(staging, "bin"), { recursive: true, mode: 0o700 });

    try {
      const archive = join(staging, "artifact.tar.gz");
      onProgress?.(`Baixando ${artifact.url}`);
      await this.download(artifact.url, archive, artifact.sizeBytes).catch((e) => {
        throw new ManagedInstallError(engineId, "download", e instanceof Error ? e.message : String(e), e);
      });

      onProgress?.("Verificando SHA-256");
      const digest = await sha256File(archive);
      if (digest !== artifact.sha256) {
        throw new ManagedInstallError(engineId, "checksum", `SHA-256 ${digest} difere do aprovado ${artifact.sha256}`);
      }

      onProgress?.("Validando conteúdo do arquivo");
      const entries = await this.listArchive(archive, engineId);
      const member = entries.find((e) => normalize(e.name) === normalize(artifact.member));
      if (!member) throw new ManagedInstallError(engineId, "formato", `membro "${artifact.member}" ausente no arquivo`);
      if (member.type !== "-") throw new ManagedInstallError(engineId, "formato", `"${artifact.member}" não é um arquivo regular`);

      await execFileAsync("tar", ["-xzf", archive, "-C", staging, "--no-same-owner", "--", artifact.member], { timeout: 120_000 });
      const extracted = join(staging, artifact.member);
      const binary = join(staging, "bin", artifact.binaryName);
      if (!existsSync(extracted) || lstatSync(extracted).isSymbolicLink()) {
        throw new ManagedInstallError(engineId, "formato", "executável não extraído");
      }
      renameSync(extracted, binary);
      rmSync(archive, { force: true });
      if (!isNativeExecutable(binary)) throw new ManagedInstallError(engineId, "formato", "o executável não é ELF nem Mach-O");
      chmodSync(binary, 0o755);

      onProgress?.("Executando probe de versão");
      const probeOutput = await this.probe(binary).catch((e) => {
        throw new ManagedInstallError(engineId, "probe", e instanceof Error ? e.message : String(e), e);
      });

      const provenance: InstallProvenance = {
        engineId,
        version: artifact.version,
        platform: artifact.platform,
        url: artifact.url,
        sha256: artifact.sha256,
        source: artifact.source,
        installedAt: this.now().toISOString(),
        probeOutput,
      };
      writeFileSync(join(staging, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`, { mode: 0o644 });

      // Ativação: versão lado a lado + troca atômica do ponteiro `current`.
      mkdirSync(root, { recursive: true });
      const versionDir = join(root, artifact.version);
      const history = this.readHistory(root);
      const previousVersion = history.current;
      if (existsSync(versionDir)) {
        const backup = `${versionDir}.replaced-${randomBytes(4).toString("hex")}`;
        renameSync(versionDir, backup);
        rmSync(backup, { recursive: true, force: true });
      }
      renameSync(staging, versionDir);
      this.pointCurrentTo(root, artifact.version);
      this.writeHistory(root, {
        current: artifact.version,
        previous: previousVersion && previousVersion !== artifact.version ? previousVersion : history.previous,
        installs: [...history.installs, { version: artifact.version, installedAt: provenance.installedAt, sha256: artifact.sha256 }],
      });
      onProgress?.(`Versão ${artifact.version} ativada`);
      return { engineId, version: artifact.version, path: join(root, "current", "bin", artifact.binaryName), provenance, previousVersion };
    } catch (error) {
      rmSync(staging, { recursive: true, force: true });
      if (error instanceof EngineError) throw error;
      throw new ManagedInstallError(engineId, "instalação", error instanceof Error ? error.message : String(error), error);
    }
  }

  /** Reativa a versão anterior registrada no histórico. */
  rollback(engineId: string): { engineId: string; version: string } {
    const root = managedEngineRoot(this.homeDir, engineId);
    const history = this.readHistory(root);
    const target = history.previous;
    if (!target || !existsSync(join(root, target))) {
      throw new ManagedInstallError(engineId, "rollback", "não há versão anterior disponível");
    }
    this.pointCurrentTo(root, target);
    this.writeHistory(root, { ...history, current: target, previous: history.current });
    return { engineId, version: target };
  }

  /** Proveniência da versão ativa, se houver. */
  provenance(engineId: string): InstallProvenance | undefined {
    try {
      return JSON.parse(readFileSync(join(managedEngineRoot(this.homeDir, engineId), "current", "provenance.json"), "utf8")) as InstallProvenance;
    } catch {
      return undefined;
    }
  }

  private pointCurrentTo(root: string, version: string): void {
    const tmp = join(root, `.current-${randomBytes(4).toString("hex")}`);
    symlinkSync(version, tmp);
    renameSync(tmp, join(root, "current"));
  }

  private readHistory(root: string): HistoryFile {
    try {
      const parsed = JSON.parse(readFileSync(join(root, "history.json"), "utf8")) as HistoryFile;
      return { ...parsed, installs: parsed.installs ?? [] };
    } catch {
      let current: string | undefined;
      try { current = readlinkSync(join(root, "current")); } catch { current = undefined; }
      return { current, installs: [] };
    }
  }

  private writeHistory(root: string, history: HistoryFile): void {
    const tmp = join(root, `.history-${randomBytes(4).toString("hex")}.json`);
    writeFileSync(tmp, `${JSON.stringify(history, null, 2)}\n`);
    renameSync(tmp, join(root, "history.json"));
  }

  private async listArchive(archive: string, engineId: string): Promise<Array<{ name: string; type: string }>> {
    const opts = { timeout: 120_000, maxBuffer: 16 * 1024 * 1024 };
    // Nomes por `-t` (um por linha, sem ambiguidade); tipos pelo 1º caractere de `-tv`, na mesma ordem.
    const names = (await execFileAsync("tar", ["-tzf", archive], opts)).stdout.split("\n").filter((l) => l.length > 0);
    const types = (await execFileAsync("tar", ["-tvzf", archive], opts)).stdout.split("\n").filter((l) => l.length > 0).map((l) => l[0]!);
    if (names.length !== types.length) throw new ManagedInstallError(engineId, "formato", "listagem do arquivo inconsistente");
    return names.map((name, i) => {
      if (isAbsolute(name) || normalize(name).split(/[\\/]/).includes("..")) {
        throw new ManagedInstallError(engineId, "formato", `caminho inseguro no arquivo: ${name}`);
      }
      return { name, type: types[i]! };
    });
  }

  private cleanupStaleStaging(stagingRoot: string, engineId: string): void {
    try {
      for (const entry of readdirSync(stagingRoot)) {
        if (entry.startsWith(`${engineId}-`)) rmSync(join(stagingRoot, entry), { recursive: true, force: true });
      }
    } catch {
      // nada a limpar
    }
  }
}


/**
 * Ponto único de instalação usado por drivers e adaptadores. Só deve ser
 * chamado por ação explícita do usuário (UI/API/CLI).
 */
export async function installManagedEngine(
  engineId: string,
  homeDir: string,
  onProgress?: (msg: string) => void
): Promise<{ success: boolean; path: string; version: string; log: string }> {
  const log: string[] = [];
  const result = await new ManagedEngineInstaller({ homeDir }).install(engineId, (msg) => {
    log.push(msg);
    onProgress?.(msg);
  });
  return { success: true, path: result.path, version: result.version, log: log.join("\n") };
}
