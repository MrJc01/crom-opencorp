import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export function expandTilde(caminho: string, home = homedir()): string {
  if (caminho === "~") return home;
  if (caminho.startsWith("~/")) return join(home, caminho.slice(2));
  return caminho;
}

export function resolvePath(caminho: string, base = process.cwd()): string {
  const expandido = expandTilde(caminho);
  return isAbsolute(expandido) ? expandido : resolve(base, expandido);
}
