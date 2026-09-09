#!/usr/bin/env node
/**
 * Orquestrador do Benchmark 24h de Workspaces Autônomos
 * - Executa rodadas de produção cíclica em todos os 10 workspaces
 * - Atualiza arquivos gerados (vídeos, artigos, telemetria, leads, ofertas)
 * - Move o fluxo no Kanban SQLite (Backlog -> Fazendo -> Feito)
 * - Emite notificações em tempo real no OpenCorp NotificationStore
 * - Suporta: --once, --daemon, --status
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raizRepo = path.resolve(__dirname, "..");
const workspacesRoot = path.join(process.env.HOME || "/home/j", ".opencorp", "workspaces");
const notifStorePath = path.join(process.env.HOME || "/home/j", ".opencorp", "historico.db");

const catalogo = [
  { id: "pulso-diario", rotulo: "Portal de Notícias WP (VPS)", script: "exec_ciclo_autonomo.mjs" },
  { id: "yt-factory-01", rotulo: "YouTube Video Factory", script: "exec_ciclo_autonomo.mjs" },
  { id: "tech-hub-news", rotulo: "Tech Hub News Portal", script: "exec_ciclo_autonomo.mjs" },
  { id: "uptime-pulse", rotulo: "Uptime Pulse Sentinel", script: "exec_ciclo_autonomo.mjs" },
  { id: "prompt-vault", rotulo: "Prompt Vault Hub", script: "exec_ciclo_autonomo.mjs" },
  { id: "ofertas-radar", rotulo: "Radar de Ofertas Tech", script: "exec_ciclo_autonomo.mjs" },
  { id: "leadhunter-b2b", rotulo: "LeadHunter Prospecção B2B", script: "exec_ciclo_autonomo.mjs" },
  { id: "cryptobrief-news", rotulo: "CryptoBrief Web3 Terminal", script: "exec_ciclo_autonomo.mjs" },
  { id: "sre-watchdog", rotulo: "SRE Host Watchdog", script: "exec_ciclo_autonomo.mjs" },
  { id: "licitacoes-diario", rotulo: "Diário de Licitações TI", script: "exec_ciclo_autonomo.mjs" },
];

function emitirNotificacao(wsId, titulo, mensagem, tipo = "info") {
  try {
    const notifFile = path.join(workspacesRoot, wsId, ".opencorp", "notifications.json");
    let lista = [];
    if (fs.existsSync(notifFile)) {
      try { lista = JSON.parse(fs.readFileSync(notifFile, "utf8")); } catch {}
    }
    const nova = {
      id: "notif-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6),
      workspace: wsId,
      titulo,
      mensagem,
      tipo,
      criado_em: new Date().toISOString(),
      lida: false
    };
    lista.unshift(nova);
    if (lista.length > 50) lista = lista.slice(0, 50);
    fs.mkdirSync(path.dirname(notifFile), { recursive: true });
    fs.writeFileSync(notifFile, JSON.stringify(lista, null, 2));
  } catch (err) {
    // Silencioso se der erro de I/O
  }
}

function avancarKanban(wsId) {
  try {
    const dbPath = path.join(workspacesRoot, wsId, ".opencorp", "tasks.db");
    if (!fs.existsSync(dbPath)) return;
    const db = new Database(dbPath);

    // 1. Mover tarefa em 'fazendo' para 'feito'
    const fazendo = db.prepare("SELECT id, titulo FROM tasks WHERE coluna = 'fazendo' LIMIT 1").get();
    if (fazendo) {
      db.prepare("UPDATE tasks SET coluna = 'feito', atualizado_em = datetime('now') WHERE id = ?").run(fazendo.id);
    }

    // 2. Puxar próxima do 'backlog' para 'fazendo'
    const backlog = db.prepare("SELECT id, titulo FROM tasks WHERE coluna = 'backlog' ORDER BY pos ASC LIMIT 1").get();
    if (backlog) {
      db.prepare("UPDATE tasks SET coluna = 'fazendo', atualizado_em = datetime('now') WHERE id = ?").run(backlog.id);
    }
  } catch (err) {}
}

function rodarCicloWorkspace(w) {
  const wsDir = path.join(workspacesRoot, w.id);
  const scriptPath = path.join(wsDir, "scripts", w.script);
  if (!fs.existsSync(scriptPath)) {
    console.log(`[PULADO] ${w.id}: script ${w.script} não existe.`);
    return { ok: false, erro: "script ausente" };
  }

  console.log(`------------------------------------------------------------------`);
  console.log(`>>> DISPARANDO CICLO: [${w.id}] (${w.rotulo})`);
  const t0 = Date.now();
  try {
    const out = execSync(`node "${scriptPath}"`, {
      cwd: wsDir,
      env: { ...process.env, OPENCORP_WORKSPACE: wsDir },
      encoding: "utf8",
      timeout: 60000,
      stdio: "pipe"
    });
    const duracaoMs = Date.now() - t0;
    console.log(`    ✔ Ciclo finalizado com sucesso (${(duracaoMs / 1000).toFixed(1)}s).`);
    avancarKanban(w.id);
    emitirNotificacao(w.id, `Ciclo Autônomo Concluído (${w.rotulo})`, `Esteira de produção e auto-evolução executadas com sucesso em ${(duracaoMs / 1000).toFixed(1)}s.`, "resumo");
    return { ok: true, duracaoMs };
  } catch (err) {
    console.error(`    ✖ Erro na execução de ${w.id}:`, err.message);
    emitirNotificacao(w.id, `Alerta Operacional (${w.rotulo})`, `Falha na execução: ${err.message}`, "aviso");
    return { ok: false, erro: err.message };
  }
}

function exibirStatusGeral() {
  console.log("\n==================================================================");
  console.log("     PAINEL EXECUTIVO: STATUS DOS 10 WORKSPACES DO BENCHMARK      ");
  console.log("==================================================================");
  console.log("ID".padEnd(18) + "NOME / PROJETO".padEnd(30) + "KANBAN (Faz / Back / Feit)".padEnd(28) + "APP STATUS");
  console.log("-".repeat(85));

  for (const w of catalogo) {
    const wsDir = path.join(workspacesRoot, w.id);
    let kanbanResumo = "Sem DB";
    const dbPath = path.join(wsDir, ".opencorp", "tasks.db");
    if (fs.existsSync(dbPath)) {
      try {
        const db = new Database(dbPath);
        const fazendo = db.prepare("SELECT count(*) as c FROM tasks WHERE coluna = 'fazendo'").get().c;
        const backlog = db.prepare("SELECT count(*) as c FROM tasks WHERE coluna = 'backlog'").get().c;
        const feito = db.prepare("SELECT count(*) as c FROM tasks WHERE coluna = 'feito'").get().c;
        kanbanResumo = `Faz: ${fazendo} | Back: ${backlog} | Feit: ${feito}`;
      } catch {}
    }

    const appsDir = path.join(wsDir, "apps");
    let appStatus = "Sem App";
    if (fs.existsSync(appsDir)) {
      const apps = fs.readdirSync(appsDir);
      appStatus = apps.length > 0 ? `OK (${apps[0]})` : "Vazio";
    }

    console.log(w.id.padEnd(18) + w.rotulo.padEnd(30) + kanbanResumo.padEnd(28) + appStatus);
  }
  console.log("-".repeat(85));
}

// ── Execução Principal ──────────────────────────────────────────
const args = process.argv.slice(2);
const modoStatus = args.includes("--status");
const modoDaemon = args.includes("--daemon");

if (modoStatus) {
  exibirStatusGeral();
  process.exit(0);
}

console.log("==================================================================");
console.log("  INICIANDO RODADA OPERACIONAL DO BENCHMARK 24H (10 WORKSPACES)   ");
console.log("==================================================================");

let totalOk = 0;
for (const w of catalogo) {
  const res = rodarCicloWorkspace(w);
  if (res.ok) totalOk++;
}

console.log("\n==================================================================");
console.log(`  RODADA FINALIZADA: ${totalOk}/${catalogo.length} WORKSPACES EXECUTADOS COM SUCESSO! `);
console.log("==================================================================");
exibirStatusGeral();

if (modoDaemon) {
  const intervaloMin = 15;
  console.log(`\n[DAEMON BENCHMARK] Modo contínuo ativado. Próxima rodada em ${intervaloMin} minutos...`);
  setInterval(() => {
    console.log(`\n[DAEMON] Disparando nova rodada às ${new Date().toLocaleTimeString()}...`);
    for (const w of catalogo) rodarCicloWorkspace(w);
    exibirStatusGeral();
  }, intervaloMin * 60 * 1000);
}
