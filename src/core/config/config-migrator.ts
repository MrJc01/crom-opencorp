/**
 * Migração segura de configurações legadas (Etapa 14).
 *
 * - `planMigration`: somente leitura; lista arquivos, campos, transformações e avisos.
 * - `applyMigration`: backup timestampado → validação de TODO o resultado →
 *   escrita atômica → verificação; qualquer falha restaura o backup.
 * - `rollbackMigration`: restaura byte a byte a partir do backup.
 *
 * Origens legadas cobertas:
 *   - `~/.opencorp/runner.json` → `settings.run_engine` / `settings.engines[id]`;
 *   - frontmatter de agentes: `harness` → `engine`, `harness_fallback` →
 *     `engine_fallback`, `model_fallback` → `rotation`, aliases de motor.
 */
import { createHash, randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { writeFileAtomic } from "../../utils/fs-safe.js";
import { settingsSchema } from "../../schemas/settings.js";
import { camposLegadosAgente, parseAgenteMd, parseYamlSimples } from "../../schemas/agent.js";
import { serializarAgenteMd } from "../contexts/agents/agent-store.js";
import { mergeSettings, runnerPath, settingsPath, translateRunnerJson } from "./run-engine-config.js";

export interface MigrationChange {
  path: string;
  kind: "runner.json" | "settings.json" | "agent";
  action: "update" | "create" | "delete";
  fields: string[];
  transformations: string[];
  warnings: string[];
  before: string | null;
  after: string | null;
}

export interface MigrationPlan {
  pending: boolean;
  changes: MigrationChange[];
  warnings: string[];
}

export interface BackupEntry {
  path: string;
  existed: boolean;
  sha256?: string;
  backupFile?: string;
}

export interface BackupManifest {
  id: string;
  createdAt: string;
  entries: BackupEntry[];
}

export class MigrationValidationError extends Error {
  constructor(readonly path: string, reason: string) {
    super(`Resultado inválido para ${path}: ${reason}. Nenhum arquivo foi alterado.`);
    this.name = "MigrationValidationError";
  }
}

/** Códigos de saída documentados do `opencorp migrate-configs`. */
export const MIGRATE_EXIT = Object.freeze({
  OK: 0,
  ERROR: 1,
  INVALID_RESULT: 2,
  PENDING: 3,
  ROLLBACK_FAILED: 4,
});

const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

function readText(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

function agentFiles(workspacePaths: string[]): string[] {
  const out: string[] = [];
  for (const ws of workspacePaths) {
    const dir = join(ws, ".opencorp", "agents");
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) if (f.endsWith(".md")) out.push(join(dir, f));
  }
  return out.sort();
}

export function planMigration(homeDir: string, opts: { workspacePaths?: string[] } = {}): MigrationPlan {
  const changes: MigrationChange[] = [];
  const warnings: string[] = [];

  // runner.json → settings.json
  const runnerFile = runnerPath(homeDir);
  const runnerText = readText(runnerFile);
  if (runnerText !== null) {
    let runner: Record<string, any> | null = null;
    try {
      runner = JSON.parse(runnerText);
    } catch (error) {
      warnings.push(`${runnerFile}: JSON inválido, não migrado (${error instanceof Error ? error.message : String(error)}).`);
    }
    if (runner && typeof runner === "object") {
      const { settingsPatch, notices, warnings: w } = translateRunnerJson(runner);
      const sFile = settingsPath(homeDir);
      const sText = readText(sFile);
      let current: Record<string, any> = {};
      if (sText !== null) {
        try {
          current = JSON.parse(sText);
        } catch {
          warnings.push(`${sFile}: JSON inválido; corrija antes de migrar.`);
          return { pending: false, changes: [], warnings };
        }
      }
      // settings já no formato novo prevalece sobre runner.json.
      const patch = current.run_engine?.default ? { ...settingsPatch, run_engine: undefined } : settingsPatch;
      const merged = mergeSettings(current, patch);
      const after = `${JSON.stringify(merged, null, 2)}\n`;
      changes.push({
        path: sFile,
        kind: "settings.json",
        action: sText === null ? "create" : "update",
        fields: Object.keys(settingsPatch).map((k) => `settings.${k}`),
        transformations: notices.map((n) => n.message),
        warnings: current.run_engine?.default ? [...w, "settings.run_engine já existe e prevalece; os valores de runner.json para run_engine foram ignorados."] : w,
        before: sText,
        after,
      });
      changes.push({ path: runnerFile, kind: "runner.json", action: "delete", fields: Object.keys(runner), transformations: ["conteúdo movido para settings.json; o original fica no backup"], warnings: [], before: runnerText, after: null });
    }
  }

  // agentes
  for (const file of agentFiles(opts.workspacePaths ?? [])) {
    const text = readFileSync(file, "utf8");
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
    if (!fm) continue;
    let legacy: string[];
    try {
      legacy = camposLegadosAgente(parseYamlSimples(fm));
    } catch {
      warnings.push(`${file}: frontmatter ilegível, não migrado.`);
      continue;
    }
    if (legacy.length === 0) continue;
    let after: string;
    try {
      const parsed = parseAgenteMd(text);
      after = serializarAgenteMd(parsed.frontmatter, parsed.corpo);
    } catch (error) {
      warnings.push(`${file}: agente inválido, não migrado (${error instanceof Error ? error.message : String(error)}).`);
      continue;
    }
    changes.push({
      path: file,
      kind: "agent",
      action: "update",
      fields: legacy,
      transformations: legacy.map((f) =>
        f === "harness" ? "harness → engine" : f === "harness_fallback" ? "harness_fallback → engine_fallback" : f === "model_fallback" ? "model_fallback → rotation" : `${f.replace(":alias", "")}: alias de motor → id canônico`
      ),
      warnings: [],
      before: text,
      after,
    });
  }

  return { pending: changes.length > 0, changes, warnings };
}

function validate(change: MigrationChange): void {
  if (change.after === null) return;
  if (change.kind === "settings.json") {
    let data: unknown;
    try {
      data = JSON.parse(change.after);
    } catch (error) {
      throw new MigrationValidationError(change.path, `JSON inválido (${error instanceof Error ? error.message : String(error)})`);
    }
    const r = settingsSchema.safeParse(data);
    if (!r.success) throw new MigrationValidationError(change.path, `${r.error.issues[0]?.path.join(".") || "(raiz)"}: ${r.error.issues[0]?.message}`);
  } else if (change.kind === "agent") {
    try {
      parseAgenteMd(change.after);
    } catch (error) {
      throw new MigrationValidationError(change.path, error instanceof Error ? error.message : String(error));
    }
  }
}

export function backupsDir(homeDir: string): string {
  return join(homeDir, ".opencorp", "backups");
}

export function listBackups(homeDir: string): BackupManifest[] {
  const dir = backupsDir(homeDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((d) => d.startsWith("migrate-configs-"))
    .map((d) => {
      try {
        return JSON.parse(readFileSync(join(dir, d, "manifest.json"), "utf8")) as BackupManifest;
      } catch {
        return null;
      }
    })
    .filter((m): m is BackupManifest => m !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function createBackup(homeDir: string, changes: MigrationChange[], now: Date): Promise<BackupManifest> {
  const id = `migrate-configs-${now.toISOString().replace(/[:.]/g, "-")}-${randomBytes(3).toString("hex")}`;
  const dir = join(backupsDir(homeDir), id);
  mkdirSync(join(dir, "files"), { recursive: true });
  const entries: BackupEntry[] = [];
  changes.forEach((change, i) => {
    if (existsSync(change.path)) {
      const backupFile = join("files", `${i}`);
      copyFileSync(change.path, join(dir, backupFile));
      entries.push({ path: change.path, existed: true, sha256: sha256(readFileSync(change.path)), backupFile });
    } else {
      entries.push({ path: change.path, existed: false });
    }
  });
  const manifest: BackupManifest = { id, createdAt: now.toISOString(), entries };
  await writeFileAtomic(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  // Backup íntegro antes de qualquer escrita.
  for (const e of entries) {
    if (e.existed && sha256(readFileSync(join(dir, e.backupFile!))) !== e.sha256) throw new Error(`backup corrompido para ${e.path}`);
  }
  return manifest;
}

export async function applyMigration(
  homeDir: string,
  opts: { workspacePaths?: string[]; now?: Date } = {}
): Promise<{ applied: MigrationChange[]; backup?: BackupManifest; warnings: string[] }> {
  const plan = planMigration(homeDir, opts);
  if (!plan.pending) return { applied: [], warnings: plan.warnings };
  // Valida TODO o resultado antes de tocar em qualquer arquivo.
  for (const change of plan.changes) validate(change);
  const backup = await createBackup(homeDir, plan.changes, opts.now ?? new Date());
  try {
    for (const change of plan.changes) {
      if (change.action === "delete") rmSync(change.path, { force: true });
      else {
        mkdirSync(dirname(change.path), { recursive: true });
        await writeFileAtomic(change.path, change.after!);
      }
    }
    // Verificação pós-escrita.
    for (const change of plan.changes) validate({ ...change, after: readText(change.path) });
  } catch (error) {
    await rollbackMigration(homeDir, backup.id);
    throw error;
  }
  return { applied: plan.changes, backup, warnings: plan.warnings };
}

/** Restaura byte a byte o estado anterior à migração do backup indicado (padrão: o mais recente). */
export async function rollbackMigration(homeDir: string, backupId?: string): Promise<BackupManifest> {
  const all = listBackups(homeDir);
  const manifest = backupId ? all.find((m) => m.id === backupId) : all.at(-1);
  if (!manifest) throw new Error(backupId ? `backup "${backupId}" não encontrado` : "nenhum backup de migração encontrado");
  const dir = join(backupsDir(homeDir), manifest.id);
  for (const e of manifest.entries) {
    if (e.existed) {
      const data = readFileSync(join(dir, e.backupFile!));
      if (sha256(data) !== e.sha256) throw new Error(`backup corrompido para ${e.path}; nada restaurado a partir dele`);
      mkdirSync(dirname(e.path), { recursive: true });
      await writeFileAtomic(e.path, data);
    } else {
      rmSync(e.path, { force: true });
    }
  }
  for (const e of manifest.entries) {
    if (e.existed && sha256(readFileSync(e.path)) !== e.sha256) throw new Error(`restauração divergente em ${e.path}`);
  }
  return manifest;
}
