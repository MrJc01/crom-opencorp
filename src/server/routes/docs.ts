import { existsSync, readFileSync } from "node:fs";
import { readdir, rm, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileAtomic } from "../../utils/fs-safe.js";
import type { RouteContext } from "./types.js";

const DEFAULT_DOCS_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "docs");

export interface DocumentoItem {
  slug: string;
  titulo: string;
  arquivo: string;
  categoria: string;
  origem?: "sistema" | "workspace";
}

export const DOCUMENTOS_SISTEMA: DocumentoItem[] = [
  { slug: "estudo-padronizacao", titulo: "Estudo de Arquitetura e Padronização", arquivo: "ESTUDO-ARQUITETURA-E-PADRONIZACAO-AGENTES.md", categoria: "Guia & Padronização" },
  { slug: "01-visao-geral", titulo: "01. Visão Geral da Plataforma", arquivo: "01-visao-geral.md", categoria: "Conceitos" },
  { slug: "02-arquitetura", titulo: "02. Arquitetura do Sistema", arquivo: "02-arquitetura.md", categoria: "Conceitos" },
  { slug: "03-workspaces", titulo: "03. Workspaces e Templates", arquivo: "03-workspaces-templates-subcorp.md", categoria: "Operação" },
  { slug: "04-agentes", titulo: "04. Agentes e Papéis", arquivo: "04-agentes.md", categoria: "Operação" },
  { slug: "05-registros", titulo: "05. Registros e Memória", arquivo: "05-registros-e-memoria.md", categoria: "Operação" },
  { slug: "06-painel", titulo: "06. Painel e Configurações", arquivo: "06-painel-configuracoes.md", categoria: "Interface" },
  { slug: "07-seguranca", titulo: "07. Segurança e Orçamento", arquivo: "07-seguranca-custos.md", categoria: "Governança" },
  { slug: "08-cli", titulo: "08. Referência do CLI e oc", arquivo: "08-cli-referencia.md", categoria: "Referência" },
  { slug: "17-mini-apps-segredos", titulo: "17. Mini-Apps e Segredos", arquivo: "17-mini-apps-e-segredos.md", categoria: "Aplicações & Segurança" },
  { slug: "capacidades", titulo: "Capacidades da Empresa", arquivo: "CAPACIDADES-EMPRESA.md", categoria: "Referência" },
];

export const MAPA_ALIASES_DOCS: Record<string, { slug?: string; titulo: string; arquivo: string; categoria: string }> = {
  "estudo-padronizacao": { titulo: "Estudo de Arquitetura e Padronização", arquivo: "ESTUDO-ARQUITETURA-E-PADRONIZACAO-AGENTES.md", categoria: "Guia & Padronização" },
  "01-visao-geral": { titulo: "01. Visão Geral da Plataforma", arquivo: "01-visao-geral.md", categoria: "Conceitos" },
  "02-arquitetura": { titulo: "02. Arquitetura do Sistema", arquivo: "02-arquitetura.md", categoria: "Conceitos" },
  "03-workspaces": { titulo: "03. Workspaces e Templates", arquivo: "03-workspaces-templates-subcorp.md", categoria: "Operação" },
  "04-agentes": { titulo: "04. Agentes e Papéis", arquivo: "04-agentes.md", categoria: "Operação" },
  "05-registros": { titulo: "05. Registros e Memória", arquivo: "05-registros-e-memoria.md", categoria: "Operação" },
  "06-painel": { titulo: "06. Painel e Configurações", arquivo: "06-painel-configuracoes.md", categoria: "Interface" },
  "07-seguranca": { titulo: "07. Segurança e Orçamento", arquivo: "07-seguranca-custos.md", categoria: "Governança" },
  "08-cli": { titulo: "08. Referência do CLI e oc", arquivo: "08-cli-referencia.md", categoria: "Referência" },
  "17-mini-apps-segredos": { titulo: "17. Mini-Apps e Segredos", arquivo: "17-mini-apps-e-segredos.md", categoria: "Aplicações & Segurança" },
  "apps": { slug: "17-mini-apps-segredos", titulo: "17. Mini-Apps e Segredos", arquivo: "17-mini-apps-e-segredos.md", categoria: "Aplicações & Segurança" },
  "secrets": { slug: "17-mini-apps-segredos", titulo: "17. Mini-Apps e Segredos", arquivo: "17-mini-apps-e-segredos.md", categoria: "Aplicações & Segurança" },
  "capacidades": { titulo: "Capacidades da Empresa", arquivo: "CAPACIDADES-EMPRESA.md", categoria: "Referência" },
  "secretario": { slug: "04-agentes", titulo: "04. Agentes e Papéis (Secretário Executivo)", arquivo: "04-agentes.md", categoria: "Operação" },
  "agentes": { slug: "04-agentes", titulo: "04. Agentes e Papéis", arquivo: "04-agentes.md", categoria: "Operação" },
  "arquitetura": { slug: "02-arquitetura", titulo: "02. Arquitetura do Sistema", arquivo: "02-arquitetura.md", categoria: "Conceitos" },
  "wordpress": { slug: "capacidades", titulo: "Capacidades da Empresa", arquivo: "CAPACIDADES-EMPRESA.md", categoria: "Referência" },
};

export async function handleDocsRoutes(ctx: RouteContext): Promise<boolean> {
  const {
    req,
    res,
    url,
    rota,
    resolverWs,
    lerCorpo,
    enviar,
    registros,
    sessoes,
    workspaces,
    docsRoot: customDocsRoot,
  } = ctx;

  const docsRoot = customDocsRoot && existsSync(customDocsRoot)
    ? customDocsRoot
    : existsSync(DEFAULT_DOCS_ROOT)
    ? DEFAULT_DOCS_ROOT
    : join(process.cwd(), "docs");

  // ─────────────────────────────────────────────────────────────────────
  // 1. CATÁLOGO / LISTAGEM DE DOCUMENTOS (/docs, /documentos)
  // ─────────────────────────────────────────────────────────────────────
  if ((rota === "/docs" || rota === "/documentos") && req.method === "GET") {
    let docs: DocumentoItem[] = [...DOCUMENTOS_SISTEMA].map((d) => ({ ...d, origem: "sistema" as const }));

    // Tenta enriquecer com documentos locais do workspace ativo (se houver)
    try {
      const ws = await resolverWs(url);
      const wsDocsDir = join(ws.path, "docs");
      if (existsSync(wsDocsDir)) {
        const arquivosWs = await readdir(wsDocsDir);
        for (const arq of arquivosWs) {
          if (arq.endsWith(".md")) {
            const slug = arq.replace(/\.md$/, "");
            if (!docs.some((d) => d.slug === slug)) {
              docs.push({
                slug,
                titulo: slug.replace(/[-_]/g, " "),
                arquivo: arq,
                categoria: "Workspace",
                origem: "workspace",
              });
            }
          }
        }
      }
    } catch {}

    const q = url.searchParams.get("q")?.toLowerCase();
    if (q) {
      docs = docs.filter((d) => d.titulo.toLowerCase().includes(q) || d.slug.toLowerCase().includes(q) || d.categoria.toLowerCase().includes(q));
    }

    enviar(res, 200, docs);
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────
  // 2. CRIAÇÃO DE DOCUMENTO (/docs, /documentos)
  // ─────────────────────────────────────────────────────────────────────
  if ((rota === "/docs" || rota === "/documentos") && req.method === "POST") {
    const ws = await resolverWs(url);
    const corpo = (await lerCorpo(req)) as {
      slug?: string;
      titulo?: string;
      conteudo?: string;
      categoria?: string;
    };

    if (!corpo.conteudo && !corpo.titulo) {
      enviar(res, 400, { erro: "titulo ou conteudo são obrigatórios" });
      return true;
    }

    const slug = (corpo.slug || corpo.titulo || `doc-${Date.now()}`)
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
      .replace(/-+/g, "-");

    const wsDocsDir = join(ws.path, "docs");
    await mkdir(wsDocsDir, { recursive: true });
    const filePath = join(wsDocsDir, `${slug}.md`);

    const frontmatter = `---\ntitulo: "${corpo.titulo || slug}"\ncategoria: "${corpo.categoria || "Geral"}"\ncriado_em: "${new Date().toISOString()}"\n---\n\n`;
    await writeFileAtomic(filePath, `${frontmatter}${corpo.conteudo || ""}\n`);

    enviar(res, 201, {
      ok: true,
      slug,
      titulo: corpo.titulo || slug,
      categoria: corpo.categoria || "Geral",
      arquivo: `${slug}.md`,
    });
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────
  // 3. OPERAÇÕES EM DOCUMENTO INDIVIDUAL (/docs/:slug, /documentos/:slug)
  // ─────────────────────────────────────────────────────────────────────
  const mDoc = /^\/(?:docs|documentos)\/([^/]+)$/.exec(rota);
  if (mDoc) {
    const slug = decodeURIComponent(mDoc[1]!);

    if (req.method === "GET") {
      const item = MAPA_ALIASES_DOCS[slug];
      const arquivoNome = item?.arquivo || (slug.endsWith(".md") ? slug : `${slug}.md`);

      // 1. Tenta encontrar no diretório docs do sistema
      let arquivoPath = join(docsRoot, arquivoNome);
      let origem: "sistema" | "workspace" = "sistema";

      // 2. Se não existe no sistema, tenta no diretório docs do workspace
      if (!existsSync(arquivoPath)) {
        try {
          const ws = await resolverWs(url);
          const wsPath = join(ws.path, "docs", arquivoNome);
          if (existsSync(wsPath)) {
            arquivoPath = wsPath;
            origem = "workspace";
          }
        } catch {}
      }

      if (!existsSync(arquivoPath)) {
        enviar(res, 404, { erro: `documento "${slug}" não encontrado` });
        return true;
      }

      const conteudo = readFileSync(arquivoPath, "utf8");
      enviar(res, 200, {
        slug: item?.slug || slug,
        titulo: item?.titulo || slug,
        categoria: item?.categoria || "Documentação",
        arquivo: arquivoNome,
        origem,
        conteudo,
      });
      return true;
    }

    if (req.method === "PUT") {
      const ws = await resolverWs(url);
      const corpo = (await lerCorpo(req)) as { conteudo?: string; titulo?: string; categoria?: string };
      const wsDocsDir = join(ws.path, "docs");
      await mkdir(wsDocsDir, { recursive: true });
      const arquivoNome = slug.endsWith(".md") ? slug : `${slug}.md`;
      const arquivoPath = join(wsDocsDir, arquivoNome);

      await writeFileAtomic(arquivoPath, corpo.conteudo ?? "");
      enviar(res, 200, { ok: true, slug, arquivo: arquivoNome });
      return true;
    }

    if (req.method === "DELETE") {
      const ws = await resolverWs(url);
      const arquivoNome = slug.endsWith(".md") ? slug : `${slug}.md`;
      const arquivoPath = join(ws.path, "docs", arquivoNome);
      if (existsSync(arquivoPath)) {
        await rm(arquivoPath, { force: true });
        enviar(res, 200, { ok: true, slug });
      } else {
        enviar(res, 404, { erro: `documento "${slug}" não encontrado para exclusão` });
      }
      return true;
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4. REGISTRIES & MEMÓRIA CORPORATIVA (/registries/*)
  // ─────────────────────────────────────────────────────────────────────
  const mReg = /^\/registries\/([^/]+)(?:\/([^/]+))?$/.exec(rota);
  if (mReg) {
    const ws = await resolverWs(url);
    const cat = decodeURIComponent(mReg[1]!);
    const regId = mReg[2] ? decodeURIComponent(mReg[2]) : undefined;

    // GET /registries/:categoria
    if (!regId && req.method === "GET") {
      enviar(res, 200, await registros.listar(ws.path, cat));
      return true;
    }

    // POST /registries/:categoria
    if (!regId && req.method === "POST") {
      const corpo = (await lerCorpo(req)) as { id?: string; descricao?: string };
      const meta = await registros.criar(ws.path, {
        categoria: cat,
        id: corpo.id ?? "",
        descricao: corpo.descricao ?? "",
        criadoPor: "api",
      });
      enviar(res, 201, { id: `${cat}/${meta.id}` });
      return true;
    }

    // GET /registries/:categoria/:id
    if (regId && req.method === "GET") {
      try {
        if (cat === "execucoes") {
          await sessoes.reconciliarZombieSeNecessario?.(ws.path, regId);
        }
        enviar(res, 200, await registros.obter(ws.path, cat, regId));
        return true;
      } catch (err) {
        if (cat === "execucoes") {
          const todosWs = await workspaces.listar();
          for (const outro of todosWs) {
            if (outro.path === ws.path) continue;
            try {
              await sessoes.reconciliarZombieSeNecessario?.(outro.path, regId);
              enviar(res, 200, await registros.obter(outro.path, cat, regId));
              return true;
            } catch {}
          }
        }
        enviar(res, 404, { erro: `Registro "${cat}/${regId}" não encontrado` });
        return true;
      }
    }

    // PUT /registries/:categoria/:id
    if (regId && req.method === "PUT") {
      const corpo = (await lerCorpo(req)) as { conteudo?: string };
      await registros.atualizar(ws.path, cat, regId, "api", { conteudo: corpo.conteudo });
      enviar(res, 200, { ok: true });
      return true;
    }

    // DELETE /registries/:categoria/:id
    if (regId && req.method === "DELETE") {
      try {
        const itemPath = join(ws.path, ".opencorp", "registries", cat, `${regId}.md`);
        const metaPath = join(ws.path, ".opencorp", "registries", cat, `${regId}.json`);
        if (existsSync(itemPath)) await rm(itemPath, { force: true });
        if (existsSync(metaPath)) await rm(metaPath, { force: true });
        enviar(res, 200, { ok: true, id: regId });
        return true;
      } catch (err) {
        enviar(res, 500, { erro: `Falha ao remover registro: ${String(err)}` });
        return true;
      }
    }
  }

  return false;
}
