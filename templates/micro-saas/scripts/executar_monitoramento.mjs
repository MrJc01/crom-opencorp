#!/usr/bin/env node
/**
 * Execução da Sonda de Monitoramento Real - Micro-SaaS
 * Realiza requisições HTTP reais nos serviços alvo, registra telemetria no SQLite (WAL)
 * e atualiza o estado operacional e incidentes reais.
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const ws = process.env.OPENCORP_WORKSPACE || process.cwd();
const registriesDir = path.join(ws, "registries");
const telemetriaDbPath = path.join(registriesDir, "telemetria.db");
const tasksDbPath = path.join(ws, ".opencorp/tasks.db");

console.log("=== EXECUTANDO CICLO DE MONITORAMENTO DE UPTIME (REAL) ===");

const servicosFile = path.join(registriesDir, "servicos_alvo.json");
if (!fs.existsSync(servicosFile)) {
  console.log("Serviços não cadastrados. Execute setup_inicial.mjs primeiro.");
  process.exit(1);
}

const servicos = JSON.parse(fs.readFileSync(servicosFile, "utf8"));
const db = new Database(telemetriaDbPath);
db.pragma("journal_mode = WAL");

let totalLatencia = 0;
let totalSucessos = 0;
let incidentesAbertos = 0;

for (const s of servicos) {
  const start = Date.now();
  let sucesso = 0;
  let statusCode = 0;
  let erroMsg = null;

  try {
    const timeoutMs = s.timeout_ms || 4000;
    const res = await fetch(s.url, {
      method: s.metodo || "GET",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": "OpenCorp-UptimePulse/1.0" }
    });
    statusCode = res.status;
    sucesso = res.ok ? 1 : 0;
  } catch (err) {
    erroMsg = err.name === "TimeoutError" ? `Timeout após ${s.timeout_ms || 4000}ms` : err.message;
    statusCode = 0;
    sucesso = 0;
  }

  const latencia = Date.now() - start;
  totalLatencia += latencia;
  if (sucesso) totalSucessos++;

  try {
    db.prepare(`
      INSERT INTO pings (servico_id, status_code, latencia_ms, sucesso)
      VALUES (?, ?, ?, ?)
    `).run(s.id, statusCode, latencia, sucesso);

    if (sucesso) {
      console.log(`✔ [HEALTHCHECK] ${s.nome} -> HTTP ${statusCode} (${latencia}ms) [UP]`);
    } else {
      console.warn(`⚠ [DOWN/FAIL] ${s.nome} -> HTTP ${statusCode} (${latencia}ms) - ${erroMsg || "status inválido"}`);
      incidentesAbertos++;
      const incId = `inc-${s.id}-${Date.now().toString(36)}`;
      db.prepare(`
        INSERT INTO incidentes (id, servico_id, motivo)
        VALUES (?, ?, ?)
      `).run(incId, s.id, erroMsg || `HTTP ${statusCode}`);
    }
  } catch (e) {
    console.error(`Falha ao registrar ping para ${s.id}:`, e.message);
  }
}

const uptimeMedio = servicos.length > 0 ? ((totalSucessos / servicos.length) * 100).toFixed(1) + "%" : "0.0%";
const latenciaMedia = servicos.length > 0 ? Math.round(totalLatencia / servicos.length) : 0;

const resumo = {
  data: new Date().toISOString(),
  uptime_medio: uptimeMedio,
  latencia_media_ms: latenciaMedia,
  servicos_ativos: servicos.length,
  servicos_online: totalSucessos,
  incidentes_abertos: incidentesAbertos
};

fs.writeFileSync(path.join(registriesDir, "status_operacional.json"), JSON.stringify(resumo, null, 2));

console.log(`=== CICLO DE MONITORAMENTO CONCLUÍDO: Uptime ${uptimeMedio} | Latência Média ${latenciaMedia}ms ===\n`);
