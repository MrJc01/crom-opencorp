/**
 * Testes herméticos: coloca executáveis falsos de todos os motores no início do
 * PATH. Desde a Etapa 10 o preflight exige o binário antes do spawn; sem isto,
 * testes que mockam `execa` passariam ou falhariam conforme os motores
 * instalados na máquina. Testes que verificam ausência de binário passam um
 * `pathEnv` explícito ao resolvedor.
 */
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { ENGINE_BINARY_NAMES } from "../../src/core/engines/installer/binary-resolver.js";

const dir = join(tmpdir(), "opencorp-test-engine-stubs");
mkdirSync(dir, { recursive: true });
for (const name of new Set(Object.values(ENGINE_BINARY_NAMES).flat())) {
  const bin = join(dir, name);
  if (existsSync(bin)) continue;
  writeFileSync(bin, `#!/bin/sh\necho "${name} 0.0.0-test"\n`);
  chmodSync(bin, 0o755);
}
if (!(process.env.PATH ?? "").split(delimiter).includes(dir)) {
  process.env.PATH = `${dir}${delimiter}${process.env.PATH ?? ""}`;
}
