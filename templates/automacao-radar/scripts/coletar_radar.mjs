#!/usr/bin/env node
/**
 * Execução da Coleta Real do Radar - Oportunidades & Leads
 * Minera fontes reais (APIs públicas / feeds RSS / fontes cadastradas),
 * aplica scoring algorítmico contra os critérios do negócio e registra no Kanban SQLite.
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const ws = process.env.OPENCORP_WORKSPACE || process.cwd();
const registriesDir = path.join(ws, "registries");
const tasksDbPath = path.join(ws, ".opencorp/tasks.db");
const optFile = path.join(registriesDir, "oportunidades.json");
const critFile = path.join(registriesDir, "criterios.json");
const fontesFile = path.join(registriesDir, "fontes.json");

console.log("=== INICIANDO CICLO DE MINERAÇÃO DO RADAR (REAL) ===");

if (!fs.existsSync(optFile)) {
  console.log("Banco de dados do radar não encontrado. Execute setup_inicial.mjs primeiro.");
  process.exit(1);
}

const dados = JSON.parse(fs.readFileSync(optFile, "utf8"));
const criterios = fs.existsSync(critFile)
  ? JSON.parse(fs.readFileSync(critFile, "utf8"))
  : { palavras_chave_positivas: ["IA", "Software", "Nuvem", "Automação"], palavras_chave_negativas: ["Obras"], score_minimo: 60 };

const fontes = fs.existsSync(fontesFile)
  ? JSON.parse(fs.readFileSync(fontesFile, "utf8"))
  : [
      { id: "hn-top", nome: "Hacker News Top Stories", url: "https://hacker-news.firebaseio.com/v0/topstories.json?limitToFirst=15&orderBy=\"$key\"" },
      { id: "github-trending", nome: "GitHub Repositories Search", url: "https://api.github.com/search/repositories?q=agentic+ai+stars:>50&sort=updated&per_page=5" }
    ];

const jaVistos = new Set(dados.oportunidades.map(o => o.titulo.toLowerCase().trim()));
const novasOportunidades = [];

// Função de scoring contra critérios
function calcularScore(texto) {
  let score = 50;
  const lower = texto.toLowerCase();

  for (const pos of (criterios.palavras_chave_positivas || [])) {
    if (lower.includes(pos.toLowerCase())) score += 15;
  }
  for (const neg of (criterios.palavras_chave_negativas || [])) {
    if (lower.includes(neg.toLowerCase())) score -= 30;
  }
  return Math.max(0, Math.min(100, score));
}

// 1. Mineração em fontes públicas
for (const fonte of fontes) {
  try {
    console.log(`📡 Consultando fonte: ${fonte.nome}...`);
    const res = await fetch(fonte.url, {
      signal: AbortSignal.timeout(6000),
      headers: { "User-Agent": "OpenCorp-RadarMiner/1.0" }
    });

    if (!res.ok) {
      console.log(`  ⚠ Fonte ${fonte.id} retornou status ${res.status}`);
      continue;
    }

    const payload = await res.json();

    // Caso 1: Array de IDs do Hacker News
    if (Array.isArray(payload) && typeof payload[0] === "number") {
      const ids = payload.slice(0, 5);
      for (const storyId of ids) {
        try {
          const itemRes = await fetch(`https://hacker-news.firebaseio.com/v0/item/${storyId}.json`, {
            signal: AbortSignal.timeout(3000)
          });
          if (itemRes.ok) {
            const item = await itemRes.json();
            if (item && item.title && !jaVistos.has(item.title.toLowerCase().trim())) {
              const score = calcularScore(item.title);
              if (score >= (criterios.score_minimo || 60)) {
                novasOportunidades.push({
                  id: `opt-hn-${item.id}`,
                  titulo: item.title,
                  fonte: "Hacker News",
                  url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
                  score,
                  status: score >= 75 ? "qualificada" : "em_analise",
                  descoberto_em: new Date().toISOString()
                });
                jaVistos.add(item.title.toLowerCase().trim());
              }
            }
          }
        } catch {}
      }
    }

    // Caso 2: GitHub Search API
    if (payload.items && Array.isArray(payload.items)) {
      for (const repo of payload.items) {
        const desc = `${repo.name} - ${repo.description || ""}`;
        if (!jaVistos.has(desc.toLowerCase().trim())) {
          const score = calcularScore(desc);
          if (score >= (criterios.score_minimo || 60)) {
            novasOportunidades.push({
              id: `opt-gh-${repo.id}`,
              titulo: desc.slice(0, 120),
              fonte: "GitHub",
              url: repo.html_url,
              score,
              status: score >= 75 ? "qualificada" : "em_analise",
              descoberto_em: new Date().toISOString()
            });
            jaVistos.add(desc.toLowerCase().trim());
          }
        }
      }
    }
  } catch (e) {
    console.log(`  Nota mineração (${fonte.id}):`, e.message);
  }
}

if (novasOportunidades.length > 0) {
  dados.oportunidades.unshift(...novasOportunidades);
  fs.writeFileSync(optFile, JSON.stringify(dados, null, 2));
  console.log(`✔ [RADAR] ${novasOportunidades.length} nova(s) oportunidade(s) minerada(s) com sucesso!`);

  // Registrar no Kanban SQLite
  try {
    if (fs.existsSync(tasksDbPath)) {
      const db = new Database(tasksDbPath);
      db.pragma("journal_mode = WAL");
      const now = new Date().toISOString();
      for (const opt of novasOportunidades.slice(0, 3)) {
        db.prepare(`
          INSERT OR IGNORE INTO tasks (id, titulo, descricao, coluna, pos, prioridade, labels, responsavel, criado_por, criado_em, atualizado_em)
          VALUES (?, ?, ?, 'backlog', 10, 'alta', 'radar,oportunidades,leads', 'agente:analista-radar', 'sistema:radar', ?, ?)
        `).run(`tsk-radar-${opt.id}`, `Oportunidade: ${opt.titulo.slice(0, 80)}`, `Fonte: ${opt.fonte} | Score: ${opt.score} | URL: ${opt.url}`, now, now);
      }
      console.log("✔ Oportunidades adicionadas ao backlog do Kanban.");
    }
  } catch (e) {
    console.log("Nota Kanban:", e.message);
  }
} else {
  console.log("ℹ Nenhuma nova oportunidade atendeu aos critérios mínimos de relevância neste ciclo.");
}

console.log("=== CICLO DE MINERAÇÃO CONCLUÍDO ===\n");
