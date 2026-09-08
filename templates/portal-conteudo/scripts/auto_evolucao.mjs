#!/usr/bin/env node
/**
 * Loop de Auto-Evolução Editorial - Portal de Conteúdo
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const ws = process.env.OPENCORP_WORKSPACE || process.cwd();
const auditoriasDir = path.join(ws, "registries/auditorias");
const evolucoesDir = path.join(ws, "registries/evolucoes");
const agentsDir = path.join(ws, ".opencorp/agents");
const tasksDbPath = path.join(ws, ".opencorp/tasks.db");

fs.mkdirSync(evolucoesDir, { recursive: true });

console.log("=== LOOP DE AUTO-EVOLUÇÃO EDITORIAL ===");

const redatorPath = path.join(agentsDir, "redator-artigo.md");
let mudancas = [];

if (fs.existsSync(redatorPath)) {
  let content = fs.readFileSync(redatorPath, "utf8");
  const dataHoje = new Date().toISOString().slice(0, 10);
  const novaRegra = `\n<!-- AUTO-APRENDIZADO ${dataHoje} -->\n- **Regra de Auto-Evolução (V2)**: Todo artigo técnico deve incluir obrigatoriamente um bloco de código executável ou tabela de parâmetros antes do subtítulo de conclusões.\n`;
  if (!content.includes("AUTO-APRENDIZADO")) {
    content += novaRegra;
    fs.writeFileSync(redatorPath, content);
    mudancas.push("Injetada regra de código executável obrigatório em redator-artigo.md");
  } else {
    mudancas.push("Diretrizes de redator-artigo.md já atualizadas.");
  }
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const registroMd = `# REGISTRO DE AUTO-EVOLUÇÃO EDITORIAL
**Data**: ${new Date().toISOString()}
**Ações**:
${mudancas.map(m => `- ${m}`).join("\n")}
`;
fs.writeFileSync(path.join(evolucoesDir, `EVOLUCAO-${timestamp}.md`), registroMd);

try {
  const db = new Database(tasksDbPath);
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO tasks (id, titulo, descricao, coluna, pos, prioridade, labels, responsavel, criado_por, criado_em, atualizado_em)
    VALUES (?, ?, ?, 'feito', 100, 'alta', 'auto-evolucao,editorial', 'agente:auditor-factcheck', 'sistema:auto-evolucao', ?, ?)
  `).run(`tsk-auto-evo-${Date.now().toString(36)}`, "Auto-Melhoria: Refinamento de Estrutura de Artigos", "Injeção de regra de código obrigatório nas diretrizes.", now, now);
} catch (e) {
  console.log("Nota Kanban:", e.message);
}

console.log("=== AUTO-EVOLUÇÃO CONCLUÍDA ===\n");
