import { accessSync, constants as fsConstants, existsSync, statSync } from "node:fs";
import { readFile, readdir, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { settingsSchema, type Settings } from "../schemas/settings.js";
import { parseSecurityPolicyTexto } from "../schemas/security-policy.js";
import { mkdirRecursive, writeFileAtomic } from "../utils/fs-safe.js";
import { expandTilde } from "../utils/paths.js";
import { AppStore } from "./app-store.js";
import { TeamStore } from "./team-store.js";

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
  workspacePath?: string;
  securityPolicyPath?: string;
  budgetPath?: string;
  /**
   * Injetado para evitar dependência circular e facilitar testes.
   * Recebe um PID e devolve true se o processo estiver vivo.
   */
  pidVivo?: (pid: number) => boolean | Promise<boolean>;
  /** Função de fetch injetada para o check do secretário (testes podem mockar). */
  fetch?: typeof fetch;
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

export function schedulerPidfilePath(homeDir: string): string {
  return join(homeDir, ".opencorp", "scheduler.pid");
}

export function schedulerDbPath(homeDir: string): string {
  return join(homeDir, ".opencorp", "scheduler.db");
}

export function hooksDir(wsPath: string): string {
  return join(wsPath, ".opencorp", "hooks");
}

export function appsDir(wsPath: string): string {
  return join(wsPath, ".opencorp", "apps");
}

export function teamsDir(wsPath: string): string {
  return join(wsPath, ".opencorp", "teams");
}

export function secretarioPidfilePath(homeDir: string): string {
  return join(homeDir, ".opencorp", "opencode-server.json");
}

export async function pidfileAlive(
  pidfile: string,
  pidVivoFn: (pid: number) => boolean | Promise<boolean>,
): Promise<{ vivo: boolean; pid: number | null }> {
  if (!existsSync(pidfile)) return { vivo: false, pid: null };
  try {
    const dados = JSON.parse(await readFile(pidfile, "utf8")) as { pid?: unknown };
    const pid = typeof dados.pid === "number" ? dados.pid : NaN;
    if (!Number.isFinite(pid)) return { vivo: false, pid: null };
    const vivo = await pidVivoFn(pid);
    return { vivo, pid };
  } catch {
    return { vivo: false, pid: null };
  }
}

async function contarJobsAtivos(dbPath: string): Promise<number> {
  if (!existsSync(dbPath)) return 0;
  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true });
    const linha = db.prepare("SELECT COUNT(*) as n FROM jobs WHERE ativo = 1").get() as { n: number };
    return Number(linha.n) || 0;
  } catch {
    return 0;
  } finally {
    if (db) {
      try {
        db.close();
      } catch {
        /* noop */
      }
    }
  }
}

export async function checkScheduler(
  homeDir: string,
  opcoes: { pidVivo?: (pid: number) => boolean | Promise<boolean> } = {},
): Promise<DoctorCheck> {
  const base = { id: "scheduler", label: "scheduler (daemon + jobs)" } as const;
  const pidfile = schedulerPidfilePath(homeDir);
  const dbPath = schedulerDbPath(homeDir);
  const pidVivoFn =
    opcoes.pidVivo ??
    ((pid: number) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    });

  const existePidfile = existsSync(pidfile);
  const existeDb = existsSync(dbPath);
  if (!existePidfile && !existeDb) {
    return {
      ...base,
      status: "info",
      detail: "scheduler não configurado (sem pidfile nem scheduler.db) — ok na primeira execução",
    };
  }

  const estado = await pidfileAlive(pidfile, pidVivoFn);
  const jobs = await contarJobsAtivos(dbPath);
  const itens: string[] = [];

  if (existePidfile && estado.pid === null) {
    itens.push(`pidfile ${pidfile} ilegível (sem campo pid válido) — remova manualmente`);
    return {
      ...base,
      status: "warn",
      detail: `pidfile ilegível em ${pidfile} — scheduler pode estar rodando sem pidfile ou há resíduo`,
      items: itens,
    };
  }
  if (existePidfile && !estado.vivo && estado.pid !== null) {
    itens.push(
      `pidfile ${pidfile} aponta pid ${estado.pid} que NÃO está vivo — scheduler está morto`,
    );
  }

  if (jobs > 0 && (!estado.vivo || !existePidfile)) {
    itens.push(
      `${jobs} job(s) ativo(s) em ${dbPath} com scheduler ${existePidfile ? "morto" : "sem pidfile"} — não serão executados`,
    );
    return {
      ...base,
      status: "warn",
      detail: `scheduler morto (pidfile órfão) mas há ${jobs} job(s) ativo(s) — start com "opencorp scheduler start"`,
      items: itens,
    };
  }

  if (!estado.vivo && estado.pid !== null) {
    return {
      ...base,
      status: "warn",
      detail: `pidfile órfão em ${pidfile} (pid ${estado.pid} não está vivo) — remova com "opencorp scheduler stop"`,
      items: itens,
    };
  }

  if (estado.vivo && estado.pid !== null) {
    return {
      ...base,
      status: "ok",
      detail: `scheduler vivo (pid ${estado.pid}) — ${jobs} job(s) ativo(s)`,
    };
  }

  return {
    ...base,
    status: "info",
    detail: `scheduler parado — ${jobs} job(s) cadastrado(s) (sem execução até "opencorp scheduler start")`,
    items: itens,
  };
}

export async function checkHooks(wsPath: string): Promise<DoctorCheck> {
  const base = { id: "hooks", label: "hooks do workspace" } as const;
  const dir = hooksDir(wsPath);
  if (!existsSync(dir)) {
    return {
      ...base,
      status: "info",
      detail: `diretório ${dir} não existe — sem hooks configurados`,
    };
  }
  let entradas;
  try {
    entradas = await readdir(dir);
  } catch (erro) {
    return {
      ...base,
      status: "warn",
      detail: `não foi possível ler ${dir}: ${errorMessage(erro)}`,
    };
  }
  const arquivos = entradas.filter((f) => f.endsWith(".json"));
  if (arquivos.length === 0) {
    return {
      ...base,
      status: "info",
      detail: `${dir} vazio — sem hooks configurados`,
    };
  }
  const invalidos: string[] = [];
  for (const f of arquivos) {
    try {
      JSON.parse(await readFile(join(dir, f), "utf8"));
    } catch (erro) {
      invalidos.push(`${f}: ${errorMessage(erro)}`);
    }
  }
  if (invalidos.length > 0) {
    return {
      ...base,
      status: "warn",
      detail: `${invalidos.length} hook(s) com JSON inválido em ${dir}`,
      items: invalidos,
    };
  }
  return {
    ...base,
    status: "ok",
    detail: `${arquivos.length} hook(s) válido(s) em ${dir}`,
  };
}

export async function checkApps(wsPath: string): Promise<DoctorCheck> {
  const base = { id: "apps", label: "apps do workspace" } as const;
  const store = new AppStore();
  const dir = appsDir(wsPath);
  if (!existsSync(dir)) {
    return {
      ...base,
      status: "info",
      detail: `diretório ${dir} não existe — sem apps configurados`,
    };
  }
  let entradas;
  try {
    entradas = await readdir(dir);
  } catch (erro) {
    return {
      ...base,
      status: "warn",
      detail: `não foi possível ler ${dir}: ${errorMessage(erro)}`,
    };
  }
  const arquivos = entradas.filter((f) => f.endsWith(".json"));
  if (arquivos.length === 0) {
    return {
      ...base,
      status: "info",
      detail: `${dir} vazio — sem apps configurados`,
    };
  }
  const invalidos: string[] = [];
  for (const f of arquivos) {
    try {
      store.validarTexto(await readFile(join(dir, f), "utf8"), f);
    } catch (erro) {
      invalidos.push(`${f}: ${errorMessage(erro)}`);
    }
  }
  if (invalidos.length > 0) {
    return {
      ...base,
      status: "warn",
      detail: `${invalidos.length} app(s) com spec inválida em ${dir}`,
      items: invalidos,
    };
  }
  return {
    ...base,
    status: "ok",
    detail: `${arquivos.length} app(s) válido(s) em ${dir}`,
  };
}

export async function checkTeams(wsPath: string): Promise<DoctorCheck> {
  const base = { id: "teams", label: "teams do workspace" } as const;
  const store = new TeamStore();
  const dir = teamsDir(wsPath);
  if (!existsSync(dir)) {
    return {
      ...base,
      status: "info",
      detail: `diretório ${dir} não existe — sem teams configurados`,
    };
  }
  let entradas;
  try {
    entradas = await readdir(dir);
  } catch (erro) {
    return {
      ...base,
      status: "warn",
      detail: `não foi possível ler ${dir}: ${errorMessage(erro)}`,
    };
  }
  const arquivos = entradas.filter((f) => f.endsWith(".json"));
  if (arquivos.length === 0) {
    return {
      ...base,
      status: "info",
      detail: `${dir} vazio — sem teams configurados`,
    };
  }
  const invalidos: string[] = [];
  for (const f of arquivos) {
    try {
      store.validarTexto(await readFile(join(dir, f), "utf8"), f);
    } catch (erro) {
      invalidos.push(`${f}: ${errorMessage(erro)}`);
    }
  }
  if (invalidos.length > 0) {
    return {
      ...base,
      status: "warn",
      detail: `${invalidos.length} team(s) com spec inválida em ${dir}`,
      items: invalidos,
    };
  }
  return {
    ...base,
    status: "ok",
    detail: `${arquivos.length} team(s) válido(s) em ${dir}`,
  };
}

export async function checkSecretario(
  homeDir: string,
  opcoes: { fetch?: typeof fetch; pidVivo?: (pid: number) => boolean | Promise<boolean> } = {},
): Promise<DoctorCheck> {
  const base = { id: "secretario", label: "secretário (opencode-server)" } as const;
  const pidfile = secretarioPidfilePath(homeDir);
  const pidVivoFn =
    opcoes.pidVivo ??
    ((pid: number) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    });
  const fetchFn: typeof fetch | undefined = opcoes.fetch ?? (typeof fetch === "function" ? fetch : undefined);

  if (!existsSync(pidfile)) {
    return {
      ...base,
      status: "ok",
      detail: `secretário parado (sem pidfile ${pidfile}) — ok, será iniciado por "opencorp serve"`,
    };
  }

  let info: { pid?: unknown; porta?: unknown };
  try {
    info = JSON.parse(await readFile(pidfile, "utf8")) as { pid?: unknown; porta?: unknown };
  } catch {
    return {
      ...base,
      status: "warn",
      detail: `pidfile ${pidfile} ilegível — remova manualmente`,
    };
  }
  const pid = typeof info.pid === "number" ? info.pid : NaN;
  const porta = typeof info.porta === "number" ? info.porta : NaN;
  if (!Number.isFinite(pid) || !Number.isFinite(porta)) {
    return {
      ...base,
      status: "warn",
      detail: `pidfile ${pidfile} sem pid/porta válidos — remova manualmente`,
    };
  }
  const vivo = await pidVivoFn(pid);
  if (!vivo) {
    return {
      ...base,
      status: "warn",
      detail: `pidfile ${pidfile} órfão (pid ${pid} não está vivo) — remova manualmente`,
    };
  }

  if (!fetchFn) {
    return {
      ...base,
      status: "info",
      detail: `secretário vivo (pid ${pid}, porta ${porta}) — sem fetch disponível, porta não testada`,
    };
  }
  try {
    const resp = await fetchFn(`http://127.0.0.1:${porta}/health`, { signal: AbortSignal.timeout(2000) });
    if (resp.ok || resp.status === 401 || resp.status === 404) {
      return {
        ...base,
        status: "ok",
        detail: `secretário vivo (pid ${pid}, porta ${porta}) — /health respondeu HTTP ${resp.status}`,
      };
    }
    return {
      ...base,
      status: "warn",
      detail: `secretário vivo (pid ${pid}) mas porta ${porta} respondeu ${resp.status}`,
    };
  } catch {
    return {
      ...base,
      status: "warn",
      detail: `secretário vivo (pid ${pid}) mas porta ${porta} não respondeu em 2s`,
    };
  }
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

  if (options.securityPolicyPath !== undefined) {
    checks.push(await checarPolicy(options.securityPolicyPath));
  } else {
    checks.push({
      id: "policy",
      label: "security_policy.json",
      status: "info",
      detail: "nenhum workspace ativo — policy não verificada",
    });
  }
  if (options.budgetPath !== undefined) {
    checks.push(await checarBudget(options.budgetPath));
  } else {
    checks.push({
      id: "budget",
      label: "budget.json",
      status: "info",
      detail: "nenhum workspace ativo — budget não verificado",
    });
  }

  checks.push(await checkScheduler(home, { pidVivo: options.pidVivo }));
  checks.push(await checkSecretario(home, { pidVivo: options.pidVivo, fetch: options.fetch }));

  if (options.workspacePath !== undefined) {
    const wsPath = options.workspacePath;
    checks.push(await checkHooks(wsPath));
    checks.push(await checkApps(wsPath));
    checks.push(await checkTeams(wsPath));
  } else {
    checks.push({
      id: "hooks",
      label: "hooks do workspace",
      status: "info",
      detail: "nenhum workspace ativo — hooks não verificados",
    });
    checks.push({
      id: "apps",
      label: "apps do workspace",
      status: "info",
      detail: "nenhum workspace ativo — apps não verificados",
    });
    checks.push({
      id: "teams",
      label: "teams do workspace",
      status: "info",
      detail: "nenhum workspace ativo — teams não verificados",
    });
  }

  const falhas = checks.filter((c) => c.status === "fail");
  const ok = falhas.length === 0;
  const exitCode: 0 | 1 | 2 = ok
    ? 0
    : falhas.some((c) => ["settings", "policy", "budget"].includes(c.id))
      ? 2
      : 1;

  return { checks, ok, exitCode };
}

export async function checarPolicy(path: string): Promise<DoctorCheck> {
  const base = { id: "policy", label: "security_policy.json" } as const;
  if (!existsSync(path)) {
    return {
      ...base,
      status: "info",
      detail: `${path} não encontrado (ok — sem policy, guard usa policy vazia)`,
    };
  }
  try {
    parseSecurityPolicyTexto(await readFile(path, "utf8"), path);
  } catch (erro) {
    return {
      ...base,
      status: "fail",
      detail: erro instanceof Error ? erro.message : String(erro),
    };
  }
  return { ...base, status: "ok", detail: `${path} válido` };
}

export async function checarBudget(path: string): Promise<DoctorCheck> {
  const base = { id: "budget", label: "budget.json" } as const;
  if (!existsSync(path)) {
    return {
      ...base,
      status: "info",
      detail: `${path} não encontrado (ok — sem consumo registrado)`,
    };
  }
  try {
    const dados = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    const diaOk = dados.dia === null || typeof dados.dia === "string";
    if (!diaOk || typeof dados.workspace_usd_hoje !== "number") {
      return {
        ...base,
        status: "fail",
        detail: `budget.json inválido em ${path} → campos obrigatórios "dia" (string|null) e "workspace_usd_hoje" (number)`,
      };
    }
    const semConsumo = dados.dia === null ? " (sem consumo)" : ` (dia ${dados.dia})`;
    return { ...base, status: "ok", detail: `${path} válido${semConsumo}` };
  } catch (erro) {
    return {
      ...base,
      status: "fail",
      detail: `budget.json inválido em ${path}: ${erro instanceof Error ? erro.message : String(erro)}`,
    };
  }
}
