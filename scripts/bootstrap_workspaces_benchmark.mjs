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
  { id: "tech-hub-news", template: "portal-conteudo", rotulo: "Portal Editorial de Notícias Tech" },
  { id: "uptime-pulse", template: "micro-saas", rotulo: "Micro-SaaS & Monitor de Uptime" },
  { id: "prompt-vault", template: "portal-conteudo", rotulo: "Diretório & Curadoria de Prompts IA" },
  { id: "ofertas-radar", template: "automacao-radar", rotulo: "Radar & Vitrine de Ofertas" },
  { id: "leadhunter-b2b", template: "automacao-radar", rotulo: "Prospecção B2B & Inteligência de Mercado" },
  { id: "cryptobrief-news", template: "portal-conteudo", rotulo: "Boletim Cripto & Web3" },
  { id: "sre-watchdog", template: "micro-saas", rotulo: "Guardião de Infraestrutura & SRE" },
  { id: "licitacoes-diario", template: "automacao-radar", rotulo: "Radar & Triagem de Editais" },
];

console.log(`Workspaces selecionados para criação inicial: ${catalogoBenchmark.length}\n`);

for (const w of catalogoBenchmark) {
  console.log(`------------------------------------------------------------------`);
  console.log(`>>> Criando workspace: [${w.id}] (${w.rotulo})`);
  console.log(`    Base Template: ${w.template}`);

  try {
    // 1. Criar via CLI do OpenCorp com o template correto
    execSync(`node "${binOpenCorp}" workspace create "${w.id}" --template "${w.template}"`, {
      encoding: "utf8",
      stdio: "pipe",
    });
    console.log(`    ✔ Workspace criado com sucesso.`);
  } catch (err) {
    if (err.message && err.message.includes("já existe")) {
      console.log(`    ℹ Workspace "${w.id}" já existia.`);
    } else {
      console.error(`    ✖ Erro ao criar workspace:`, err.message);
      continue;
    }
  }

  // 2. Executar ciclo de setup inicial do workspace se houver o script
  try {
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

    // 3. Executar o ciclo inicial de auto-evolução
    const autoEvolucaoScript = path.join(wsHome, "scripts", "auto_evolucao.mjs");
    if (fs.existsSync(autoEvolucaoScript)) {
      console.log(`    ⚙ Inicializando motor de Auto-Evolução em ${w.id}...`);
      execSync(`node "${autoEvolucaoScript}"`, {
        cwd: wsHome,
        env: { ...process.env, OPENCORP_WORKSPACE: wsHome },
        stdio: "pipe",
      });
      console.log(`    ✔ Ciclo de Auto-Evolução inicial registrado com sucesso.`);
    }
  } catch (err) {
    console.log(`    Nota sobre ciclo inicial: ${err.message}`);
  }
}

console.log("\n==================================================================");
console.log("   TODOS OS WORKSPACES DE BENCHMARK CRIADOS E PRONTOS!           ");
console.log("==================================================================");
console.log("Acesse o painel web (porta 4100) para visualizar o quadro de cada um.");
