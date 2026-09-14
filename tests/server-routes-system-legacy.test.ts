import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApiServer } from "../src/server/index.js";
import { WorkspaceManager } from "../src/core/workspace-manager.js";
import { eventBus } from "../src/core/event-bus.js";

const raizes: string[] = [];

async function tmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "opencorp-sys-legacy-"));
  raizes.push(dir);
  return dir;
}

function makeFetch(port: number, token: string) {
  const base = `http://127.0.0.1:${port}`;
  return async (path: string, opts: RequestInit = {}) => {
    const res = await fetch(`${base}${path}`, {
      ...opts,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        ...opts.headers,
      },
    });
    const text = await res.text();
    let json: any;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = text;
    }
    return { status: res.status, json, text, headers: res.headers };
  };
}

describe("Rotas Modulares de Sistema, Legado e Estáticos (Micro-Passo 15)", () => {
  let home: string;
  let wsDir: string;
  let webDistDir: string;
  let token = "test-token-sys-legacy";
  let port: number;
  let fetchApi: ReturnType<typeof makeFetch>;
  let server: ReturnType<typeof createApiServer>["server"];

  beforeAll(async () => {
    home = await tmpDir();
    wsDir = join(home, "workspaces", "default");
    await mkdir(wsDir, { recursive: true });

    // Mock do web-dist
    webDistDir = join(home, "web-dist");
    await mkdir(webDistDir, { recursive: true });
    await writeFile(join(webDistDir, "index.html"), "<html><body>OpenCorp SPA Mock</body></html>", "utf8");
    await writeFile(join(webDistDir, "style.css"), "body { color: red; }", "utf8");

    // Inicializa workspace padrão
    const wm = new WorkspaceManager({ homeDir: home, cwd: home });
    await wm.criar("default");
    await wm.usar("default");

    const apiInst = createApiServer({
      homeDir: home,
      token,
      porta: 0,
    });
    server = apiInst.server;

    await new Promise<void>((res) => {
      server.listen(0, "127.0.0.1", () => {
        port = (server.address() as any).port;
        fetchApi = makeFetch(port, token);
        res();
      });
    });
  });

  afterAll(async () => {
    if (server) await new Promise<void>((res) => server.close(() => res()));
    for (const r of raizes) {
      await rm(r, { recursive: true, force: true }).catch(() => {});
    }
  });

  describe("Endpoints de Sistema (system.ts)", () => {
    it("GET /health retorna status ok e versão pública sem auth", async () => {
      const base = `http://127.0.0.1:${port}`;
      const res = await fetch(`${base}/health`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json).toHaveProperty("versao");
    });

    it("GET /status retorna saúde agregada dos serviços", async () => {
      const res = await fetchApi("/status");
      expect(res.status).toBe(200);
      expect(res.json).toHaveProperty("scheduler");
      expect(res.json).toHaveProperty("secretario");
    });

    it("GET /doc retorna especificação OpenAPI 3.0", async () => {
      const res = await fetchApi("/doc");
      expect(res.status).toBe(200);
      expect(res.json.openapi).toBe("3.0.3");
      expect(res.json).toHaveProperty("paths");
    });

    it("GET /doctor executa diagnóstico completo do ambiente", async () => {
      const res = await fetchApi("/doctor");
      expect(res.status).toBe(200);
      expect(res.json).toHaveProperty("checks");
      expect(Array.isArray(res.json.checks)).toBe(true);
    });

    it("POST /doctor/fix responde com resultado de remediação", async () => {
      const res = await fetchApi("/doctor/fix", { method: "POST" });
      expect(res.status).toBe(200);
      expect(res.json.remediado).toBe(true);
    });

    it("GET /approvals retorna lista de aprovações pendentes", async () => {
      const res = await fetchApi("/approvals");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.json)).toBe(true);
    });

    it("GET /events conecta via SSE e recebe eventos do bus", async () => {
      const base = `http://127.0.0.1:${port}`;
      const controller = new AbortController();
      const res = await fetch(`${base}/events`, {
        headers: { authorization: `Bearer ${token}` },
        signal: controller.signal,
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");

      const reader = res.body?.getReader();
      expect(reader).toBeDefined();

      // Lê a primeira mensagem de conexão
      const chunk1 = await reader!.read();
      const texto1 = new TextDecoder().decode(chunk1.value);
      expect(texto1).toContain("event: conectado");

      // Emite evento no bus e confere recebimento
      setTimeout(() => {
        eventBus.emit("teste.evento", { msg: "hello-sse" });
      }, 50);

      const chunk2 = await reader!.read();
      const texto2 = new TextDecoder().decode(chunk2.value);
      expect(texto2).toContain("hello-sse");

      controller.abort();
    });
  });

  describe("Endpoints Legados (legacy.ts)", () => {
    it("GET /teams e POST /teams manipulam times legados", async () => {
      const postRes = await fetchApi("/teams", {
        method: "POST",
        body: JSON.stringify({
          id: "team-legado-teste",
          titulo: "Time Legado",
          padrao: "pipeline",
          passos: [{ agente: "dev", ordem: "executar passo" }],
        }),
      });
      expect(postRes.status).toBe(201);
      expect(postRes.json.id).toBe("team-legado-teste");

      const getRes = await fetchApi("/teams");
      expect(getRes.status).toBe(200);
      expect(Array.isArray(getRes.json)).toBe(true);
      const achou = getRes.json.some((t: any) => t.id === "team-legado-teste");
      expect(achou).toBe(true);
    });

    it("GET /hooks e POST /hooks manipulam webhooks legados", async () => {
      const postRes = await fetchApi("/hooks", {
        method: "POST",
        body: JSON.stringify({
          nome: "Hook Legado",
          alvo: { tipo: "task_create", titulo: "Task via Hook Legado" },
        }),
      });
      expect(postRes.status).toBe(201);
      expect(postRes.json).toHaveProperty("id");

      const hookId = postRes.json.id;
      const getRes = await fetchApi("/hooks");
      expect(getRes.status).toBe(200);
      expect(Array.isArray(getRes.json)).toBe(true);

      const delRes = await fetchApi(`/hooks/${hookId}`, { method: "DELETE" });
      expect(delRes.status).toBe(200);
      expect(delRes.json.ok).toBe(true);
    });
  });

  describe("Entrega de Estáticos e Fallback SPA (static.ts)", () => {
    it("GET / e SPA fallback entregam index.html quando solicitado HTML", async () => {
      const base = `http://127.0.0.1:${port}`;
      const res = await fetch(`${base}/tasks`, {
        headers: { accept: "text/html" },
      });
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("opencorp");
    });
  });
});
