import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

export async function mkdirRecursive(dir: string): Promise<string> {
  const alvo = resolve(dir);
  await mkdir(alvo, { recursive: true });
  return alvo;
}

export async function pathExists(alvo: string): Promise<boolean> {
  try {
    await stat(alvo);
    return true;
  } catch {
    return false;
  }
}

export interface AtomicWriteOptions {
  encoding?: BufferEncoding;
  mode?: number;
  createDirs?: boolean;
}

export async function writeFileAtomic(
  filePath: string,
  data: string | Uint8Array,
  options: AtomicWriteOptions = {},
): Promise<void> {
  const { encoding = "utf8", mode = 0o644, createDirs = true } = options;
  const target = resolve(filePath);
  const dir = dirname(target);
  if (createDirs) {
    await mkdir(dir, { recursive: true });
  }
  const tmp = join(dir, `.${basename(target)}.tmp-${process.pid}-${randomUUID()}`);
  try {
    if (typeof data === "string") {
      await writeFile(tmp, data, { encoding, mode });
    } else {
      await writeFile(tmp, data, { mode });
    }
    await rename(tmp, target);
  } finally {
    await rm(tmp, { force: true }).catch(() => undefined);
  }
}
