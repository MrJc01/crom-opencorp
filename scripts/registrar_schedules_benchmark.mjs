import { Scheduler } from "../dist/core/scheduler.js";
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

console.log("==================================================================");
console.log("    REGISTRANDO ROTINAS DE BENCHMARK NO OPENCORP SCHEDULER        ");
console.log("==================================================================");

const scheduler = new Scheduler();
const workspacesRoot = path.join(process.env.HOME || "/home/j", ".opencorp", "workspaces");
const dbPath = path.join(process.env.HOME || "/home/j", ".opencorp", "scheduler.db");
const db = new Database(dbPath);

// Workspaces e frequências de execução
const jobs = [
  { ws: "yt-factory-01", id: "bench-yt-factory", nome: "yt-factory-ciclo-autonomo", cron: "0 */2 * * *", desc: "Ciclo de produção de vídeos, legendas e auto-evolução" },
  { ws: "tech-hub-news", id: "bench-tech-hub", nome: "tech-hub-ciclo-editorial", cron: "30 * * * *", desc: "Ciclo editorial, redação de artigo tech e fact-checking" },
  { ws: "uptime-pulse", id: "bench-uptime-pulse", nome: "uptime-pulse-sonda-sre", cron: "*/15 * * * *", desc: "Sonda de telemetria p95 e status de endpoints" },
  { ws: "prompt-vault", id: "bench-prompt-vault", nome: "prompt-vault-curadoria", cron: "45 * * * *", desc: "Curadoria de prompts de IA e avaliação de assertividade" },
  { ws: "ofertas-radar", id: "bench-ofertas-radar", nome: "ofertas-radar-mineracao", cron: "*/30 * * * *", desc: "Mineração de descontos em hardware e SaaS tech" },
  { ws: "leadhunter-b2b", id: "bench-leadhunter", nome: "leadhunter-prospeccao-b2b", cron: "*/45 * * * *", desc: "Prospecção e qualificação de decisores B2B" },
  { ws: "cryptobrief-news", id: "bench-cryptobrief", nome: "cryptobrief-mercado-onchain", cron: "15 * * * *", desc: "Briefing de mercado cripto e narrativas DeFi" },
  { ws: "sre-watchdog", id: "bench-sre-watchdog", nome: "sre-watchdog-host-sentinel", cron: "*/10 * * * *", desc: "Inspeção de saúde de host (RAM, CPU, Swap)" },
  { ws: "licitacoes-diario", id: "bench-licitacoes", nome: "licitacoes-triagem-editais", cron: "0 * * * *", desc: "Triagem de editais governamentais de tecnologia" },
];

for (const j of jobs) {
  const wsDir = path.join(workspacesRoot, j.ws);
  const scriptPath = path.join(wsDir, "scripts", "exec_ciclo_autonomo.mjs");
  if (!fs.existsSync(scriptPath)) {
    console.log(`✖ Script não encontrado em ${scriptPath}`);
    continue;
  }

  // Deleta do SQLite se já existia
  db.prepare("DELETE FROM jobs WHERE id = ?").run(j.id);

  const criado = await scheduler.criar({
    id: j.id,
    nome: j.nome,
    agenda: { tipo: "cron", valor: j.cron },
    args: ["node", scriptPath],
    workspace: j.ws,
    graca_min: 10
  });

  console.log(`✔ [${j.ws.padEnd(17)}] Job [${criado.id}] criado: ${criado.agenda.valor} (Próxima: ${criado.proxima_exec.slice(0, 16).replace("T", " ")})`);
}

console.log("\n==================================================================");
console.log("   TODAS AS ROTINAS AGENDADAS COM SUCESSO NO OPENCORP SCHEDULER!  ");
console.log("==================================================================");
