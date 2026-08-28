import { accessSync, constants as fsConstants, existsSync, statSync } from "node:fs";
import { readFile, readdir, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { settingsSchema, type Settings } from "../schemas/settings.js";
import { mkdirRecursive, writeFileAtomic } from "../utils/fs-safe.js";
import { expandTilde } from "../utils/paths.js";

export const MIN_NODE_MAJOR = 22;
export const DEFAULT_WORKSPACES_ROOT = "~/.opencorp/workspaces";

export type CheckStatus = "ok" | "fail" | "warn" | "info";

export interface DoctorCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail?: string;
  items?: string[];
}

export interface DoctorResult {
  checks: DoctorCheck[];
  ok: boolean;
  exitCode: 0 | 1 | 2;
}

export interface DoctorOptions {
  nodeVersion?: string;
  pathEnv?: string;
  homeDir?: string;
  cwd?: string;
  settingsPath?: string;
  workspaceRoots?: string[];
}

export function errorMessage(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

export function checkNodeVersion(
  version: string = process.version,
  minMajor: number = MIN_NODE_MAJOR,
): DoctorCheck {
  const base = { id: "node", label: "Node.js" } as const;
  const m = /^v(\d+)\./.exec(version);
  if (!m) {
    return {
      ...base,
      status: "fail",
      detail: `versão não reconhecida: "${version}" (esperado algo como v22.x)`,
    };
  }
  const major = Number(m[1]);
  if (major < minMajor) {
    return {
      ...base,
      status: "fail",
      detail: `Node.js ${version} encontrado, mas o opencorp requer >= ${minMajor}`,
    };
  }
  return { ...base, status: "ok", detail: `Node.js ${version} (requer >= ${minMajor})` };
}

export function lookupExecutable(
  comando: string,
  pathEnv: string = process.env.PATH ?? "",
  platform: string = process.platform,
): string | null {
  const separador = platform === "win32" ? ";" : ":";
  const extensoes = platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  const dirs = pathEnv.split(separador).filter((d) => d.length > 0);
  for (const dir of dirs) {
    for (const ext of extensoes) {
      const candidato = join(dir, comando + ext);
      try {
        accessSync(candidato, fsConstants.X_OK);
        if (statSync(candidato).isFile()) {
          return candidato;
        }
      } catch {
        // continua procurando no próximo candidato
      }
    }
  }
  return null;
}

export function checkOpenCodeInPath(pathEnv: string): DoctorCheck {
  const base = { id: "opencode", label: "opencode no PATH" } as const;
  const encontrado = lookupExecutable("opencode", pathEnv);
  if (!encontrado) {
    return {
      ...base,
      status: "fail",
      detail:
        "opencode não encontrado no PATH (which opencode falhou) — necessário para rodar sessões (OpenCode >= 1.18)",
    };
  }
  return { ...base, status: "ok", detail: `encontrado em ${encontrado}` };
}

export interface LoadedSettings {
  check: DoctorCheck;
  settings?: Settings;
}

export async function loadSettings(settingsPath: string): Promise<LoadedSettings> {
  const base = { id: "settings", label: "settings global" } as const;
  if (!existsSync(settingsPath)) {
    return {
      check: {
        ...base,
        status: "info",
        detail: `${settingsPath} não encontrado (ok na primeira execução)`,
      },
    };
  }
  let raw: string;
  try {
    raw = await readFile(settingsPath, "utf8");
  } catch (erro) {
    return {
      check: {
        ...base,
        status: "fail",
        detail: `não foi possível ler ${settingsPath}: ${errorMessage(erro)}`,
      },
    };
  }
  let dados: unknown;
  try {
    dados = JSON.parse(raw);
  } catch (erro) {
    return {
      check: {
        ...base,
        status: "fail",
        detail: `JSON inválido em ${settingsPath}: ${errorMessage(erro)}`,
      },
    };
  }
  const parsed = settingsSchema.safeParse(dados);
  if (!parsed.success) {
    const problemas = parsed.error.issues
      .map((i) => `${i.path.length > 0 ? i.path.join(".") : "(raiz)"}: ${i.message}`)
      .join("; ");
    return {
      check: {
        ...base,
        status: "fail",
        detail: `settings inválido em ${settingsPath} → ${problemas}`,
      },
    };
  }
  return {
    check: {
      ...base,
      status: "ok",
      detail: `${settingsPath} válido (versão ${parsed.data.version})`,
    },
    settings: parsed.data,
  };
}

export async function checkWritableDir(dir: string): Promise<DoctorCheck> {
  const base = { id: "escrita", label: `permissão de escrita em ${dir}` } as const;
  try {
    await mkdirRecursive(dir);
    const probe = join(dir, `.doctor-probe-${process.pid}-${Date.now()}`);
    await writeFileAtomic(probe, "opencorp-doctor");
    await rm(probe, { force: true });
    return {
      ...base,
      status: "ok",
      detail: `${dir} aceita escrita (arquivo de prova criado e removido)`,
    };
  } catch (erro) {
    return {
      ...base,
      status: "fail",
      detail: `não foi possível escrever em ${dir}: ${errorMessage(erro)}`,
    };
  }
}

export async function findSecretFiles(raizes: string[], maxDepth = 6): Promise<string[]> {
  const encontrados: string[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entradas;
    try {
      entradas = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entrada of entradas) {
      const completo = join(dir, entrada.name);
      if (entrada.isDirectory()) {
        if (entrada.name === "node_modules" || entrada.name === ".git") continue;
        await walk(completo, depth + 1);
      } else if (entrada.isFile() && entrada.name.toLowerCase().startsWith("secrets")) {
        encontrados.push(completo);
      }
    }
  }
  for (const raiz of raizes) {
    const st = await stat(raiz).catch(() => null);
    if (st?.isDirectory()) await walk(raiz, 0);
  }
  return encontrados.sort();
}

export function checkSecrets(arquivos: string[], raizes: string[]): DoctorCheck {
  const base = { id: "segredos", label: "segredos nos workspaces" } as const;
  if (arquivos.length > 0) {
    return {
      ...base,
      status: "warn",
      detail: `${arquivos.length} arquivo(s) "secrets*" dentro de workspaces — segredos devem ficar em ~/.opencorp/ (fora de git e fora dos workspaces)`,
      items: arquivos,
    };
  }
  const algumExiste = raizes.some((r) => existsSync(r));
  return {
    ...base,
    status: "ok",
    detail: algumExiste
      ? 'nenhum arquivo "secrets*" dentro dos workspaces'
      : "nenhum diretório de workspaces encontrado (ok na primeira execução)",
  };
}

export async function runDoctor(options: DoctorOptions = {}): Promise<DoctorResult> {
  const home = options.homeDir ?? homedir();
  const cwd = options.cwd ?? process.cwd();
  const nodeVersion = options.nodeVersion ?? process.version;
  const pathEnv = options.pathEnv ?? process.env.PATH ?? "";
  const settingsPath = options.settingsPath ?? join(home, ".opencorp", "settings.json");

  const checks: DoctorCheck[] = [];
  checks.push(checkNodeVersion(nodeVersion));
  checks.push(checkOpenCodeInPath(pathEnv));

  const loaded = await loadSettings(settingsPath);
  checks.push(loaded.check);

  let raizes = options.workspaceRoots;
  if (!raizes) {
    const candidatos = [expandTilde(DEFAULT_WORKSPACES_ROOT, home), join(cwd, "workspaces")];
    if (loaded.settings) {
      candidatos.unshift(expandTilde(loaded.settings.paths.workspaces_root, home));
    }
    raizes = [...new Set(candidatos)];
  }

  const arquivosSecretos = await findSecretFiles(raizes);
  checks.push(checkSecrets(arquivosSecretos, raizes));

  checks.push(await checkWritableDir(join(home, ".opencorp")));

  const falhas = checks.filter((c) => c.status === "fail");
  const ok = falhas.length === 0;
  const exitCode: 0 | 1 | 2 = ok
    ? 0
    : falhas.some((c) => c.id === "settings")
      ? 2
      : 1;

  return { checks, ok, exitCode };
}
