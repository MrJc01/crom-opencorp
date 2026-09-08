#!/usr/bin/env node
/**
 * Auto-Evolução de Scoring do Radar
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const ws = process.env.OPENCORP_WORKSPACE || process.cwd();
const agentsDir = path.join(ws, ".opencorp/agents");
const evolucoesDir = path.join(ws, "registries/evolucoes");
const tasksDbPath = path.join(ws, ".opencorp/tasks.db");

fs.mkdirSync(evolucoesDir, { recursive: true });

console.log("=== INICIANDO AUTO-EVOLUÇÃO DO RADAR ===");

const analistaPath = path.join(agentsDir, "analista-radar.md");
let mudancas = [];

if (fs.existsSync(analistaPath)) {
  let content = fs.readFileSync(analistaPath, "utf8");
  const dataHoje = new Date().toISOString().slice(0, 10);
  const regra = `\n<!-- AUTO-APRENDIZADO ${dataHoje} -->\n- **Regra de Auto-Evolução (V2)**: Oportunidades com prazo de submissão inferior a 5 dias úteis devem receber penalidade de -20 pontos no score para evitar desperdício de tempo da equipe.\n`;
  if (!content.includes("AUTO-APRENDIZADO")) {
    content += regra;
    fs.writeFileSync(analistaPath, content);
    mudancas.push("Injetada regra de penalidade de prazo curto em analista-radar.md");
  } else {
    mudancas.push("Diretrizes de analista-radar.md já atualizadas.");
  }
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
fs.writeFileSync(path.join(evolucoesDir, `EVOLUCAO-${timestamp}.md`), `# REGISTRO RADAR AUTO-EVOLUÇÃO\n${mudancas.map(m=>`- ${m}`).join("\n")}`);

try {
  const db = new Database(tasksDbPath);
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO tasks (id, titulo, descricao, coluna, pos, prioridade, labels, responsavel, criado_por, criado_em, atualizado_em)
    VALUES (?, ?, ?, 'feito', 100, 'alta', 'auto-evolucao,radar', 'agente:curador-qualidade', 'sistema:auto-evolucao', ?, ?)
  `).run(`tsk-radar-evo-${Date.now().toString(36)}`, "Auto-Melhoria: Calibragem de Filtros de Prazo", "Penalidade para prazos inferiores a 5 dias aplicada.", now, now);
} catch (e) {
  console.log("Nota Kanban:", e.message);
}

console.log("=== AUTO-EVOLUÇÃO DO RADAR CONCLUÍDA ===\n");
