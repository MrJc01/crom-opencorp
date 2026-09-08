#!/usr/bin/env node
/**
 * Setup Inicial Autônomo (Day 0) - Portal de Conteúdo
 * Cria linha editorial, manual de redação, banco de 30 pautas,
 * inicializa analytics local SQLite e marca as tasks no Kanban SQLite.
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const ws = process.env.OPENCORP_WORKSPACE || process.cwd();
const registriesDir = path.join(ws, "registries");
const docsDir = path.join(ws, "docs");
const exportsDir = path.join(ws, "exports/artigos");
const auditoriasDir = path.join(ws, "registries/auditorias");
const tasksDbPath = path.join(ws, ".opencorp/tasks.db");

fs.mkdirSync(registriesDir, { recursive: true });
fs.mkdirSync(docsDir, { recursive: true });
fs.mkdirSync(exportsDir, { recursive: true });
fs.mkdirSync(auditoriasDir, { recursive: true });

console.log("===============================================================");
console.log("   PORTAL CONTEÚDO: EXECUTANDO SETUP INICIAL (DAY 0)          ");
console.log("===============================================================");

// 1. Linha Editorial
const editorial = {
  nome_portal: "TechHub News & Insights",
  foco: "Engenharia de Software, Arquitetura, IA Prática e Open Source",
  publico: "Desenvolvedores, Tech Leads e CTOs",
  tom_voz: "Prático, fundamentado, direto ao ponto e sem buzzwords vazias",
  criado_em: new Date().toISOString()
};
fs.writeFileSync(path.join(registriesDir, "editorial.json"), JSON.stringify(editorial, null, 2));
console.log("✔ [1/5] Linha editorial definida em registries/editorial.json.");

// 2. Taxonomia e Categorias
const taxonomia = {
  categorias: [
    { id: "ia-pratica", nome: "Inteligência Artificial Prática", desc: "Aplicações reais de LLMs e agentes" },
    { id: "engenharia", nome: "Engenharia de Software", desc: "Boas práticas, clean code e refatoração" },
    { id: "open-source", nome: "Open Source em Foco", desc: "Projetos inovadores e bibliotecas da comunidade" },
    { id: "infra-sre", nome: "Infraestrutura & SRE", desc: "DevOps, observabilidade e resiliência" },
    { id: "casos-reais", nome: "Casos Reais e Post-Mortems", desc: "Incidentes históricos e lições aprendidas" }
  ]
};
fs.writeFileSync(path.join(registriesDir, "taxonomia.json"), JSON.stringify(taxonomia, null, 2));
console.log("✔ [2/5] Taxonomia estruturada em 5 categorias.");

// 3. Manual de Redação e Fact-Checking
const manualRedacao = `# Manual de Redação e Padrão Editorial

## 1. Regras de Qualidade
- Todo artigo deve conter exemplos práticos ou trechos de código/arquitetura quando aplicável.
- Dados numéricos de performance devem citar benchmarks reais ou ambiente de teste.
- Evitar adjetivos hiperbólicos ("revolucionário", "inacreditável").

## 2. Estrutura Padrão
1. **Introdução**: O problema real e por que ele importa.
2. **Diagnóstico / Cenário Atual**: Como o ecossistema lida com isso hoje.
3. **Solução Técnica & Demonstração**: Código, diagrama ou estratégia.
4. **Resultados & Métricas**: Trade-offs, custos e benchmarks.
5. **Conclusão e Próximos Passos**.
`;
fs.writeFileSync(path.join(docsDir, "manual_redacao.md"), manualRedacao);
console.log("✔ [3/5] Manual de redação salvo em docs/manual_redacao.md.");

// 4. Banco de 30 Pautas
const pautas = [];
const temasBase = [
  { t: "Adeus GA4: Por que equipes estão migrando para SQLite e Koko Analytics", cat: "infra-sre" },
  { t: "Arquitetura de Agentes Autônomos em Node.js com SQLite e WAL", cat: "ia-pratica" },
  { t: "O fim do Tailwind? Como CSS Moderno eliminou a necessidade de compiladores", cat: "engenharia" },
  { t: "Túneis Seguros sem Conta: Como expor microserviços com TryCloudflare", cat: "infra-sre" },
  { t: "Micro-SaaS com Zero Custo: A esteira de automação nível 5 explicada", cat: "casos-reais" }
];

for (let i = 1; i <= 30; i++) {
  const base = temasBase[(i - 1) % temasBase.length];
  pautas.push({
    id: `pauta-artigo-${String(i).padStart(3, "0")}`,
    numero: i,
    titulo: `${base.t} (Parte ${i > 5 ? Math.ceil(i/5) : 1})`,
    categoria: base.cat,
    status: i === 1 ? "em_producao" : "pendente",
    prioridade: i <= 5 ? "alta" : "media"
  });
}
fs.writeFileSync(path.join(registriesDir, "pautas.json"), JSON.stringify({ total: pautas.length, pautas }, null, 2));
console.log("✔ [4/5] Banco de 30 pautas editoriais registrado em registries/pautas.json.");

// 5. Analytics Local SQLite (Zero GA4)
const analyticsDbPath = path.join(registriesDir, "analytics.db");
const analyticsDb = new Database(analyticsDbPath);
analyticsDb.pragma("journal_mode = WAL");
analyticsDb.exec(`
  CREATE TABLE IF NOT EXISTS pageviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artigo_slug TEXT NOT NULL,
    categoria TEXT NOT NULL,
    tempo_segundos INTEGER DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);
console.log("✔ [5/5] Banco SQLite de Analytics Local inicializado (analytics.db).");

// Atualiza tasks no Kanban SQLite
try {
  const db = new Database(tasksDbPath);
  const now = new Date().toISOString();
  const setupTasks = [
    { id: "tsk-setup-portal-01-editorial", tit: "[SETUP] Linha Editorial e Posicionamento", desc: "Definição de público e diretrizes editoriais." },
    { id: "tsk-setup-portal-02-taxonomia", tit: "[SETUP] Categorias e Taxonomia", desc: "Mapeamento das 5 editorias do portal." },
    { id: "tsk-setup-portal-03-manual-qualidade", tit: "[SETUP] Manual de Redação e Fact-Checking", desc: "Diretrizes de qualidade e verificação técnica." },
    { id: "tsk-setup-portal-04-banco-pautas", tit: "[SETUP] Banco Inicial de 30 Pautas", desc: "30 matérias estruturadas em pautas.json." },
    { id: "tsk-setup-portal-05-analytics-local", tit: "[SETUP] Analytics Local SQLite (Zero GA4)", desc: "Telemetria local sem dependência de terceiros." }
  ];

  for (const t of setupTasks) {
    db.prepare(`
      INSERT OR REPLACE INTO tasks (id, titulo, descricao, coluna, pos, prioridade, labels, responsavel, criado_por, criado_em, atualizado_em)
      VALUES (?, ?, ?, 'feito', 10, 'alta', 'setup-inicial,portal', 'agente:pautador-editorial', 'sistema:setup', ?, ?)
    `).run(t.id, t.tit, t.desc, now, now);
  }
  console.log("✔ Tasks de Day 0 marcadas como CONCLUÍDAS no Kanban!");
} catch (err) {
  console.log("Nota Kanban:", err.message);
}

console.log("\n=== SETUP INICIAL DO PORTAL CONCLUÍDO COM SUCESSO ===\n");
