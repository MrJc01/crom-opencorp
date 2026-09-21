#!/usr/bin/env node
/**
 * RUNNER para jobs python no scheduler OpenCorp.
 * Motivo: o scheduler executa jobs com args[0]=="node" diretamente (execPath),
 * mas jobs com args[0]=="python3" são empacotados como `opencorp.mjs python3 …`
 * e morrem com "unknown command".
 * Uso (no args do job): node /…/scripts/run_python.mjs /…/script.py [flags…]
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const ws = process.env.OPENCORP_WORKSPACE || path.resolve(aqui, "..");
const script = process.argv[2];
if (!script) {
  console.error("uso: run_python.mjs <caminho-do-script.py> [flags…]");
  process.exit(2);
}
const fullScript = script.startsWith("/") ? script : path.resolve(ws, script);
const rest = process.argv.slice(3);
try {
  execFileSync("/usr/bin/python3", [fullScript, ...rest], {
    cwd: ws,
    stdio: "inherit",
    env: process.env,
  });
} catch (e) {
  console.log("runner: script python terminou com", e.status ?? e.message);
  process.exit(e.status ?? 1);
}
