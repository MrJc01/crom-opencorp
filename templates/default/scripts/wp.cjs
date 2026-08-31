#!/usr/bin/env node
// Ponte WordPress REST do opencorp v2 — SITE derivado do id do workspace (pasta acima de scripts/),
// credenciais em secrets.json (nunca versionadas). Funciona para qualquer empresa sem edição.
// Modos: posts|pages (listar) · post|page <status> (criar) · update (editar/status, input.tipo=page p/ páginas) · settings (ler) · configurar (escrever) · delete (input.tipo)
const { readFileSync } = require("node:fs");
const { join, basename } = require("node:path");

// script vive em <ws>/scripts/ → workspace = pasta acima de __dirname
const SITE = process.env.OPENCORP_SITE || basename(join(__dirname, ".."));
const home = process.env.OPENCORP_HOME || join(process.env.HOME, ".opencorp");
const chave = `wp_${SITE.replace(/-/g, "_")}`;
let segredos = {};
try {
  segredos = JSON.parse(readFileSync(join(home, ".opencorp", "secrets.json"), "utf8"));
} catch {}
const user = segredos[`${chave}_user`];
const pass = segredos[`${chave}_pass`];
if (!user || !pass) {
  console.error(`credenciais ausentes: chaves ${chave}_user / ${chave}_pass em secrets.json`);
  process.exit(3);
}

const modo = process.argv[2] || "posts";
const forcarStatus = process.argv[3] || "";
let input = {};
try {
  input = JSON.parse(process.argv[process.argv.length - 1] || "{}");
} catch {
  console.error("entrada inválida (JSON)"); process.exit(2);
}

const tipo = (modo === "page") ? "pages" : (input.tipo === "page" ? "pages" : "posts");
const base = `https://${SITE}.wp.crom.me/wp-json/wp/v2`;
const auth = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");

(async () => {
  const opts = { headers: { authorization: auth, "content-type": "application/json" } };
  let url;
  let verbatim = false;
  const resolveCategoria = async (nome) => {
    const r = await fetch(`${base}/categories?search=${encodeURIComponent(nome)}&_fields=id,name`, { headers: { authorization: auth } });
    const lista = await r.json();
    const exata = lista.find((c) => (c.name || "").toLowerCase() === nome.toLowerCase());
    if (exata) return exata.id;
    const c = await fetch(`${base}/categories`, { method: "POST", headers: { authorization: auth, "content-type": "application/json" }, body: JSON.stringify({ name: nome }) });
    if (!c.ok) throw new Error(`criar categoria "${nome}": HTTP ${c.status}`);
    return (await c.json()).id;
  };
  if (input && typeof input.categoria_nome === "string" && (modo === "post" || modo === "page" || modo === "update")) {
    input.categorias = [await resolveCategoria(input.categoria_nome)];
    delete input.categoria_nome;
  }

  if (modo === "post" || modo === "page") {
    // status pode vir como argv[3] ("page publish") ou dentro do JSON; um JSON
    // acidental em argv[3] não pode vazar como status (causa HTTP 400)
    const statusFixo = forcarStatus && !forcarStatus.startsWith("{") ? forcarStatus : "";
    const status = (input.status || statusFixo || "draft");
    if (!input.titulo || !input.conteudo) { console.error("titulo e conteudo são obrigatórios"); process.exit(2); }
    url = `${base}/${tipo}`;
    opts.method = "POST";
    const novo = { title: input.titulo, content: input.conteudo, status };
    if (input.categorias !== undefined) novo.categories = input.categorias.map(Number);
    if (input.categoria_nome !== undefined) novo.__categoria_nome = input.categoria_nome;
    opts.body = JSON.stringify(novo);
  } else if (modo === "update") {
    if (!input.id) { console.error("id é obrigatório"); process.exit(2); }
    url = `${base}/${tipo}/${Number(input.id)}`;
    opts.method = "PUT";
    const corpo = {};
    if (input.titulo !== undefined) corpo.title = input.titulo;
    if (input.conteudo !== undefined) corpo.content = input.conteudo;
    if (input.status !== undefined) corpo.status = input.status;
    if (input.categorias !== undefined) corpo.categories = input.categorias.map(Number);
    if (input.categoria_nome !== undefined) corpo.__categoria_nome = input.categoria_nome;
    opts.body = JSON.stringify(corpo);
  } else if (modo === "categorias") {
    url = `${base}/categories?per_page=50&_fields=id,name,slug,count`;
    if (input.criar) {
      opts.method = "POST";
      opts.body = JSON.stringify({ name: input.criar, slug: input.slug });
      delete url; url = `${base}/categories`;
    }
    verbatim = true;
  } else if (modo === "configurar") {
    url = `${base}/settings`;
    opts.method = "POST";
    const corpo = {};
    if (input.descricao !== undefined) corpo.description = input.descricao;
    if (input.titulo !== undefined) corpo.title = input.titulo;
    if (input.home_estatica !== undefined) {
      corpo.show_on_front = "page";
      corpo.page_on_front = Number(input.home_estatica);
    }
    if (input.pagina_posts !== undefined && input.pagina_posts) corpo.page_for_posts = Number(input.pagina_posts);
    opts.body = JSON.stringify(corpo);
  } else if (modo === "ver") {
    if (!input.id) { console.error("id é obrigatório"); process.exit(2); }
    url = `${base}/${tipo}/${Number(input.id)}`;
    verbatim = true;
  } else if (modo === "settings") {
    url = `${base}/settings`;
    verbatim = true;
  } else if (modo === "delete") {
    if (!input.id) { console.error("id é obrigatório"); process.exit(2); }
    url = `${base}/${tipo}/${Number(input.id)}`;
    opts.method = "DELETE";
    if (input.force === true) opts.body = JSON.stringify({ force: true });
  } else {
    const tipoListagem = (modo === "pages") ? "pages" : "posts";
    url = `${base}/${tipoListagem}?per_page=${Math.min(Number(input.qtd) || 5, 20)}&status=${input.status || "publish,draft"}&_fields=id,title,status,date,type,categories&_embed`;
  }
  const r = await fetch(url, opts);
  const t = await r.text();
  if (r.status >= 400) { console.error(`HTTP ${r.status}: ${t.slice(0, 300)}`); process.exit(1); }
  const d = JSON.parse(t);
  if (verbatim && d.content !== undefined) {
    // item único (modo ver) — inclui um trecho do conteúdo para auditoria
    console.log(JSON.stringify({ id: d.id, titulo: d.title && (d.title.rendered || d.title), status: d.status, tipo: d.type, categorias_ids: d.categories || [], conteudo: ((d.content && d.content.rendered) || "").slice(0, input.full ? 20000 : 600), link: d.link || "" }, null, 1));
    return;
  }
  if (modo === "categorias") { console.log(JSON.stringify(Array.isArray(d) ? d.map((c) => ({ id: c.id, nome: c.name, slug: c.slug, posts: c.count })) : d, null, 1)); return; } // categorias (modo dedicado)
  if (verbatim && d.description !== undefined) { console.log(JSON.stringify({ titulo: d.title, descricao: d.description, home_estatica: d.page_on_front, mostra_posts: d.show_on_front, pagina_posts: d.page_for_posts }, null, 1)); return; }
  const tipoResposta = (modo === "pages" || tipo === "pages") ? "page" : "post";
  const limpa = (p) => ({ id: p.id, titulo: (p.title && (p.title.rendered || p.title)) || "", status: p.status, tipo: p.type || tipoResposta, categorias_ids: p.categories || [], link: p.link || "" });
  console.log(JSON.stringify(Array.isArray(d) ? d.map(limpa) : limpa(d), null, 1));
})().catch((e) => { console.error(e.message); process.exit(1); });
