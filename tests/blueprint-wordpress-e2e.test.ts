import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceManager } from "../src/core/workspace-manager.js";
import { TaskStore } from "../src/core/task-store.js";
import { SecretsStore } from "../src/core/secrets-store.js";

interface PostWp {
  id: number;
  title: { rendered: string };
  content: { rendered: string };
  status: "draft" | "publish";
  slug: string;
}

const raizes: string[] = [];
let mockServer: Server;
let mockWpUrl = "";
const postsBanco = new Map<number, PostWp>();
let proximoPostId = 101;

beforeAll(async () => {
  // Inicializa Mock do WordPress REST API
  mockServer = createServer((req, res) => {
    const auth = req.headers["authorization"] ?? "";
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    // Validação de autenticação Bearer ou Application Password
    if (!auth.includes("Bearer wp-secret-token") && !auth.includes("Basic")) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ code: "rest_cannot_access", message: "Acesso negado", data: { status: 401 } }));
      return;
    }

    // Rotas da REST API do WordPress
    // POST /wp-json/wp/v2/posts — Cria post (draft ou publish)
    if (url.pathname === "/wp-json/wp/v2/posts" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const dados = JSON.parse(body || "{}");
        const post: PostWp = {
          id: proximoPostId++,
          title: { rendered: dados.title ?? "Sem Título" },
          content: { rendered: dados.content ?? "" },
          status: dados.status ?? "draft",
          slug: dados.slug ?? `post-${Date.now()}`,
        };
        postsBanco.set(post.id, post);
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify(post));
      });
      return;
    }

    // POST /wp-json/wp/v2/posts/:id — Atualiza post (ex: publica rascunho)
    const mPostId = /^\/wp-json\/wp\/v2\/posts\/(\d+)$/.exec(url.pathname);
    if (mPostId && req.method === "POST") {
      const id = Number(mPostId[1]);
      const existente = postsBanco.get(id);
      if (!existente) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ code: "rest_post_invalid_id", message: "Post não encontrado" }));
        return;
      }
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const dados = JSON.parse(body || "{}");
        if (dados.status) existente.status = dados.status;
        if (dados.title) existente.title = { rendered: dados.title };
        if (dados.content) existente.content = { rendered: dados.content };
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(existente));
      });
      return;
    }

    // GET /wp-json/wp/v2/posts — Lista posts
    if (url.pathname === "/wp-json/wp/v2/posts" && req.method === "GET") {
      const statusFiltro = url.searchParams.get("status") ?? "publish";
      const lista = Array.from(postsBanco.values()).filter(
        (p) => statusFiltro === "any" || p.status === statusFiltro
      );
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(lista));
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ code: "rest_no_route", message: "Rota não encontrada" }));
  });

  await new Promise<void>((resolve) => {
    mockServer.listen(0, "127.0.0.1", () => {
      const addr = mockServer.address() as { port: number };
      mockWpUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  if (mockServer) {
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
  await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
});

async function criarAmbiente() {
  const home = await mkdtemp(join(tmpdir(), "opencorp-wp-blueprint-"));
  raizes.push(home);
  const wm = new WorkspaceManager({ homeDir: home, cwd: home });
  const ws = await wm.criar("portal-tech-wordpress");
  return { home, wsPath: ws.path };
}

describe("Blueprint E2E: Empresa Editorial Autônoma WordPress", () => {
  it("armazena credenciais no cofre de segredos do workspace", async () => {
    const { home, wsPath } = await criarAmbiente();
    const secrets = new SecretsStore(home);

    await secrets.definir("WORDPRESS_URL", mockWpUrl, "workspace", wsPath);
    await secrets.definir("WORDPRESS_TOKEN", "wp-secret-token", "workspace", wsPath);

    const creds = secrets.obterTodosValores(wsPath);
    expect(creds["WORDPRESS_URL"]).toBe(mockWpUrl);
    expect(creds["WORDPRESS_TOKEN"]).toBe("wp-secret-token");
  });

  it("pipeline autônomo completo: Pauta ➔ Rascunho ➔ Revisão ➔ Publicação ➔ Promoção", async () => {
    const { home, wsPath } = await criarAmbiente();
    const taskStore = new TaskStore();
    const secrets = new SecretsStore(home);

    await secrets.definir("WORDPRESS_URL", mockWpUrl, "workspace", wsPath);
    await secrets.definir("WORDPRESS_TOKEN", "wp-secret-token", "workspace", wsPath);

    // 1. Scheduler gera a pauta no backlog
    const pauta = await taskStore.criar(wsPath, {
      titulo: "Artigo: O Surgimento dos Sistemas Operacionais de Agentes de IA",
      descricao: "Pauta do dia: explorar o OpenCorp v0.7.0, persistência SQLite WAL e autonomia editorial.",
      coluna: "backlog",
      prioridade: "alta",
      labels: ["editorial", "ia", "tech"],
    });
    expect(pauta.id).toMatch(/^tsk-/);
    expect(pauta.coluna).toBe("backlog");

    // 2. @redator-ia assume a tarefa e cria o rascunho no WordPress via REST API
    await taskStore.mover(wsPath, pauta.id, "fazendo");
    await taskStore.mensagem(wsPath, pauta.id, {
      autor: "redator-ia",
      tipo: "handoff",
      corpo: "Rascunho criado com sucesso! Enviando para revisão editorial.",
    });

    const token = secrets.obterValor("WORDPRESS_TOKEN", wsPath)!.valor;
    const urlWp = secrets.obterValor("WORDPRESS_URL", wsPath)!.valor;

    // Chamada à API mock do WordPress para criar rascunho
    const respDraft = await fetch(`${urlWp}/wp-json/wp/v2/posts`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: "O Surgimento dos Sistemas Operacionais de Agentes de IA",
        content: "O OpenCorp representa a evolução dos runtimes de IA...",
        status: "draft",
        slug: "sistemas-operacionais-ia",
      }),
    });

    expect(respDraft.status).toBe(201);
    const postCriado = (await respDraft.json()) as PostWp;
    expect(postCriado.id).toBeGreaterThan(100);
    expect(postCriado.status).toBe("draft");

    // 3. @editor-chefe revisa e aprova a publicação
    await taskStore.mensagem(wsPath, pauta.id, {
      autor: "editor-chefe",
      tipo: "decisao",
      corpo: `Revisão aprovada com louvor. Post #${postCriado.id} pronto para publicação.`,
    });

    // 4. @wordpress-publisher atualiza status para 'publish'
    const respPublish = await fetch(`${urlWp}/wp-json/wp/v2/posts/${postCriado.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        status: "publish",
      }),
    });

    expect(respPublish.status).toBe(200);
    const postPublicado = (await respPublish.json()) as PostWp;
    expect(postPublicado.status).toBe("publish");

    // 5. Verifica que o post agora consta na listagem pública do WordPress
    const respLista = await fetch(`${urlWp}/wp-json/wp/v2/posts`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const listaPublicada = (await respLista.json()) as PostWp[];
    expect(listaPublicada.some((p) => p.id === postCriado.id && p.status === "publish")).toBe(true);

    // 6. @social-promoter finaliza a tarefa com os links sociais
    await taskStore.mover(wsPath, pauta.id, "concluido");
    await taskStore.mensagem(wsPath, pauta.id, {
      autor: "social-promoter",
      tipo: "comentario",
      corpo: `Artigo publicado com sucesso! Links divulgados no X e LinkedIn. URL: https://portaltech.com/${postPublicado.slug}`,
    });

    // Validação do estado final no TaskStore
    const tarefaFinal = (await taskStore.listar(wsPath)).find((t) => t.id === pauta.id);
    expect(tarefaFinal?.coluna).toBe("concluido");

    const historicoMensagens = await taskStore.chat(wsPath, pauta.id);
    expect(historicoMensagens.length).toBe(3);
    expect(historicoMensagens.map((m) => m.autor)).toEqual(["redator-ia", "editor-chefe", "social-promoter"]);
  });
});
