#!/usr/bin/env node
/**
 * Verificador determinístico do site — código, não LLM (Fase 4.1).
 * Checa o que a LLM "esquece": categoria, profundidade mínima, datas, lixo.
 * Uso: node scripts/verificar-site.cjs <workspace>
 * Saída: linhas "OK|FAIL <check> — <detalhe>" e exit 1 se houver FAIL.
 */
const { execFileSync } = require("node:child_process");
const { homedir } = require("node:os");
const { join } = require("node:path");

const ws = process.argv[2] ?? "";
if (!ws) {
  console.error("uso: node scripts/verificar-site.cjs <workspace>");
  process.exit(2);
}
const home = process.env.OPENCORP_HOME ?? homedir();
const wsDir = join(home, ".opencorp", "workspaces", ws);
const wp = (args) => execFileSync("node", [join(wsDir, "scripts", "wp.cjs"), ...args], {
  env: { ...process.env, OPENCORP_HOME: home },
  encoding: "utf8",
});

const falhas = [];
const oks = [];
const checa = (ok, nome, detalhe) => {
  const linha = `${ok ? "OK  " : "FAIL"} ${nome} — ${detalhe}`;
  (ok ? oks : falhas).push(linha);
  console.log(linha);
};

const lerJson = (txt) => {
  try { return JSON.parse(txt); } catch { return null; }
};

// ── posts ──
// Censo: APENAS publicados (drafts poluem a janela dos "mais recentes") e janela
// completa (qtd 100 = per_page 100 no wp.cjs) — correção PARECER-AUDITORIA-02 C8/C1.
let posts = [];
const postsBruto = lerJson(wp(["posts", JSON.stringify({ qtd: 100, status: "publish" })]));
if (Array.isArray(postsBruto)) posts = postsBruto;
else falhas.push("FAIL wp_posts — wp.cjs não respondeu JSON");

// Rascunhos: censo separado (o censo de publicados não os inclui mais, mas o
// C4-lixo-draft continua precisando enxergá-los).
let rascunhos = [];
const rascunhosBruto = lerJson(wp(["posts", JSON.stringify({ qtd: 100, status: "draft" })]));
if (Array.isArray(rascunhosBruto)) rascunhos = rascunhosBruto.filter((p) => p.status === "draft");

const publicados = posts.filter((p) => p.status === "publish");

// C1 (determinístico): volume de conteúdo de nicho — "site no ar"/anúncios não contam
// Regex ANCORADO ao início do título (evita falso positivo em manchete com "no ar" no meio,
// ex.: post 120 "…agente de IA que colocaram no ar") — correção PARECER-AUDITORIA-02 C8.
const anuncios = publicados.filter((p) => /^(pulso diário|site|portal).*(no ar|lançamento)|^bem-vindo|^olá, mundo/i.test(p.titulo));
const conteudo = publicados.filter((p) => !anuncios.includes(p));
checa(conteudo.length >= 3, "C1-volume", `${conteudo.length} posts de nicho publicados (anúncios excluídos: ${anuncios.length})`);

// C2 (determinístico): categoria correta — nada fora de categoria real (ids >1)
const semCategoria = publicados.filter((p) => !Array.isArray(p.categorias_ids) || p.categorias_ids.filter((c) => c > 1).length === 0);
if (publicados.length > 0) {
  checa(semCategoria.length === 0, "C2-categoria", semCategoria.length === 0 ? "todos com categoria" : `sem categoria: ${semCategoria.map((p) => p.id).join(", ")}`);
} else {
  console.log("SKIP C2-categoria — nenhum post publicado");
}

// C3 (determinístico): profundidade mínima — ver busca conteúdo real (chars totais ≥ 1200)
for (const p of conteudo.slice(0, 5)) {
  const bruto = lerJson(wp(["ver", JSON.stringify({ id: p.id, tipo: "post", full: true })]));
  const corpo = bruto?.conteudo ?? ""; // full
  const textoLimpo = corpo.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const paragrafos = (corpo.match(/<\/p>/g) ?? []).length;
  checa(textoLimpo.length >= 1200, `C3-profundidade-post${p.id}`, `${textoLimpo.length} chars úteis, ${paragrafos} parágrafos (mín 1200 chars)`);
}

// C4 (determinístico): rascunhos órfãos de teste ("olá mundo", "teste")
const lixo = rascunhos.filter((p) => /olá, mundo|hello world|teste/i.test(p.titulo));
checa(lixo.length === 0, "C4-lixo-draft", lixo.length === 0 ? `rascunhos ok (${rascunhos.length} legítimos)` : `rascunhos de teste: ${lixo.map((p) => `${p.id}:${p.titulo}`).join("; ")}`);

// C5 (determinístico): datas no futuro
const agora = Date.now();
const futuro = publicados.filter((p) => p.data && Date.parse(p.data) > agora + 3600_000);
checa(futuro.length === 0, "C5-datas", futuro.length === 0 ? "nenhuma data futura" : `futuro: ${futuro.map((p) => p.id).join(",")}`);

// ── settings ──
const settings = lerJson(wp(["settings", "{}"]));
if (settings) {
  checa(typeof settings.titulo === "string" && settings.titulo.length > 0, "C6-identidade-titulo", settings.titulo);
  checa(typeof settings.descricao === "string" && settings.descricao.length >= 30, "C6-identidade-descricao", (settings.descricao ?? "").slice(0, 60));
  checa(settings.home_estatica !== undefined, "C7-home", `home_estatica=${settings.home_estatica}`);
} else {
  falhas.push("FAIL wp_settings — indisponível");
}

console.log("");
if (falhas.length > 0) {
  console.log(`VEREDITO DETERMINÍSTICO: FAIL — ${oks.length} OK, ${falhas.length} FAIL`);
  process.exit(1);
}
console.log(`VEREDITO DETERMINÍSTICO: PASS — ${oks.length} OK, 0 FAIL`);
