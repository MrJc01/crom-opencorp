import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Caminho do binário opencorp.mjs (resolve a partir de dist/core ou src/core). */
export function binOpencorpPath(): string {
  const aqui = dirname(fileURLToPath(import.meta.url));
  return resolve(aqui, "..", "..", "bin", "opencorp.mjs");
}

export interface SpawnDetachedResultado {
  pid: number | null;
  binario: string;
  log: string;
}

/**
 * Spawna um processo CLI opencorp DESACOPLADO do pai (detached + unref).
 * Usado por menções/triggers: a cadeia de delegação sobrevive à morte do
 * processo que originou o evento (bug anti-stale — Fase 3.3).
 * Saída do filho vai para <home>/logs/spawn-<nome>.log (append).
 */
export function spawnOpencorpDetached(
  args: string[],
  opcoes: { homeDir: string; nomeLog: string },
): SpawnDetachedResultado {
  const { homeDir, nomeLog } = opcoes;
  const binario = binOpencorpPath();
  if (!existsSync(binario)) {
    throw new Error(`binário opencorp não encontrado em ${binario}`);
  }
  const logDir = join(homeDir, "logs");
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
  const log = join(logDir, `spawn-${nomeLog}.log`);
  let fdOut: number | null = null;
  let fdErr: number | null = null;
  try { fdOut = openSync(log, "a"); } catch { fdOut = null; }
  try { fdErr = openSync(`${log}.err`, "a"); } catch { fdErr = fdOut; }
  const child = spawn(process.execPath, [binario, ...args], {
    cwd: homeDir,
    env: { ...process.env, OPENCORP_HOME: homeDir },
    detached: true,
    stdio: ["ignore", fdOut ?? "ignore", fdErr ?? "ignore"],
  });
  child.unref();
  child.on("error", () => {
    // sem listener o erro derrubaria o processo pai
  });
  return { pid: child.pid ?? null, binario, log };
}
