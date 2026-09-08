#!/usr/bin/env node
/**
 * Ciclo Operacional Completo - Automação & Radar
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ws = process.env.OPENCORP_WORKSPACE || path.resolve(__dirname, "..");
const registriesDir = path.join(ws, "registries");
const setupOk = fs.existsSync(path.join(registriesDir, "criterios.json"));

console.log("==================================================================");
console.log("      RADAR: DISPARANDO CICLO OPERACIONAL AUTÔNOMO                ");
console.log("==================================================================");

if (!setupOk) {
  console.log("\n>>> [PASSO 1: CONFIGURAÇÃO INICIAL (DAY 0)]");
  execSync(`node "${path.join(__dirname, "setup_inicial.mjs")}"`, { stdio: "inherit", env: { ...process.env, OPENCORP_WORKSPACE: ws } });
}

console.log("\n>>> [PASSO 2: MINERAÇÃO E SCORING DE OPORTUNIDADES]");
execSync(`node "${path.join(__dirname, "coletar_radar.mjs")}"`, { stdio: "inherit", env: { ...process.env, OPENCORP_WORKSPACE: ws } });

console.log("\n>>> [PASSO 3: AUTO-EVOLUÇÃO DO RADAR]");
execSync(`node "${path.join(__dirname, "auto_evolucao.mjs")}"`, { stdio: "inherit", env: { ...process.env, OPENCORP_WORKSPACE: ws } });

console.log("\n==================================================================");
console.log("      CICLO DO RADAR CONCLUÍDO COM SUCESSO                        ");
console.log("==================================================================");
