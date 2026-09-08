#!/usr/bin/env node
/**
 * Bootstrap dos Workspaces Autônomos de Benchmark
 * Cria workspaces a partir das bases de templates com Setup Inicial (Day 0),
 * popula tarefas no Kanban SQLite e prepara a esteira autônoma.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raizRepo = path.resolve(__dirname, "..");
const binOpenCorp = path.join(raizRepo, "bin", "opencorp.mjs");

console.log("==================================================================");
console.log("   BOOTSTRAP DE WORKSPACES AUTÔNOMOS PARA BENCHMARK (DAY 0)       ");
console.log("==================================================================");

const catalogoBenchmark = [
  { id: "yt-factory-01", template: "youtube-video-factory", rotulo: "Canal YouTube Autônomo" },
  { id: "tech-portal-01", template: "portal-conteudo", rotulo: "Portal Editorial de Notícias" },
  { id: "uptime-pulse-01", template: "micro-saas", rotulo: "Micro-SaaS & Monitor de Uptime" },
  { id: "radar-leads-01", template: "automacao-radar", rotulo: "Radar de Oportunidades e Leads" },
];

console.log(`Workspaces selecionados para criação inicial: ${catalogoBenchmark.length}\n`);

for (const w of catalogoBenchmark) {
  console.log(`------------------------------------------------------------------`);
  console.log(`>>> Criando workspace: [${w.id}] (${w.rotulo})`);
  console.log(`    Base Template: ${w.template}`);

  try {
    // 1. Criar via CLI do OpenCorp com o template correto
    const outCriar = execSync(`node "${binOpenCorp}" workspace create "${w.id}" --template "${w.template}"`, {
      encoding: "utf8",
      stdio: "pipe",
    });
    console.log(`    ✔ Workspace criado com sucesso.`);
  } catch (err) {
    if (err.message.includes("já existe")) {
      console.log(`    ℹ Workspace "${w.id}" já existia.`);
    } else {
      console.error(`    ✖ Erro ao criar workspace:`, err.message);
      continue;
    }
  }

  // 2. Executar ciclo de setup inicial do workspace se houver o script
  try {
    const wsInfoRaw = execSync(`node "${binOpenCorp}" workspace list`, { encoding: "utf8" });
    // Localiza a pasta do workspace
    const wsHome = path.join(process.env.HOME || "/home/j", ".opencorp", "workspaces", w.id);
    const setupScript = path.join(wsHome, "scripts", "setup_inicial.mjs");
    
    if (fs.existsSync(setupScript)) {
      console.log(`    ⚙ Executando Setup Inicial (Day 0) em ${w.id}...`);
      execSync(`node "${setupScript}"`, {
        cwd: wsHome,
        env: { ...process.env, OPENCORP_WORKSPACE: wsHome },
        stdio: "pipe",
      });
      console.log(`    ✔ Setup Inicial concluído e tasks de Day 0 registradas no Kanban!`);
    }
  } catch (err) {
    console.log(`    Nota sobre setup inicial: ${err.message}`);
  }
}

console.log("\n==================================================================");
console.log("   TODOS OS WORKSPACES DE BENCHMARK CRIADOS E PRONTOS!           ");
console.log("==================================================================");
console.log("Acesse o painel web (porta 4100) para visualizar o quadro de cada um.");
