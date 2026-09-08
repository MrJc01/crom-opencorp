#!/usr/bin/env node
/**
 * Orquestrador do Ciclo Autônomo - YouTube Video Factory
 * 1. Executa o Setup Inicial se ainda não foi feito (Day 0)
 * 2. Roda a Produção de Vídeo (Roteiro, Legendas, Vídeo e SEO)
 * 3. Roda a Auto-Evolução (Auditoria de qualidade e refinamento de regras)
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ws = process.env.OPENCORP_WORKSPACE || path.resolve(__dirname, "..");
const registriesDir = path.join(ws, "registries");
const setupOk = fs.existsSync(path.join(registriesDir, "identidade_canal.json"));

console.log("==================================================================");
console.log("    YOUTUBE FACTORY: DISPARANDO CICLO OPERACIONAL AUTÔNOMO       ");
console.log("==================================================================");

// 1. Setup inicial se necessário
if (!setupOk) {
  console.log("\n>>> [PASSO 1: CONFIGURAÇÃO INICIAL (DAY 0)]");
  execSync(`node "${path.join(__dirname, "setup_inicial.mjs")}"`, { stdio: "inherit", env: { ...process.env, OPENCORP_WORKSPACE: ws } });
} else {
  console.log("\n>>> [SETUP INICIAL]: Já configurado anteriormente. Pulando para produção.");
}

// 2. Produção de vídeo
console.log("\n>>> [PASSO 2: ESTEIRA DE PRODUÇÃO DE VÍDEO]");
execSync(`node "${path.join(__dirname, "produzir_video.mjs")}"`, { stdio: "inherit", env: { ...process.env, OPENCORP_WORKSPACE: ws } });

// 3. Auto-Evolução
console.log("\n>>> [PASSO 3: AUTO-EVOLUÇÃO E REFINAMENTO CONTÍNUO]");
execSync(`node "${path.join(__dirname, "auto_evolucao.mjs")}"`, { stdio: "inherit", env: { ...process.env, OPENCORP_WORKSPACE: ws } });

console.log("\n==================================================================");
console.log("    CICLO AUTÔNOMO CONCLUÍDO COM SUCESSO                          ");
console.log("==================================================================");
