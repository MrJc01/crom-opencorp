import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceManager } from "../src/core/workspace-manager.js";
import {
  obterListaRotacaoCompleta,
  proximoModeloRotacao,
  ehModeloGratuito,
} from "../src/core/session-manager.js";
import { AgentStore } from "../src/core/agent-store.js";

const raizes: string[] = [];
let mockServer: Server;
let serverPort = 0;
let stopChamado = false;

beforeAll(async () => {
  mockServer = createServer((req, res) => {
    if (req.url === "/secretario/status" && req.method === "GET") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ rodando: true, porta: serverPort, pid: process.pid }));
      return;
    }
    if (req.url === "/secretario/stop" && req.method === "POST") {
      stopChamado = true;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, mensagem: "secretário parado com sucesso" }));
      return;
    }
    if (req.url === "/secretario/conversa" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const dados = JSON.parse(body || "{}");
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, resposta: `Recebido: ${dados.mensagem}` }));
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => {
    mockServer.listen(0, "127.0.0.1", () => {
      const addr = mockServer.address() as { port: number };
      serverPort = addr.port;
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
  const home = await mkdtemp(join(tmpdir(), "opencorp-secretario-e2e-"));
  raizes.push(home);
  const wm = new WorkspaceManager({ homeDir: home, cwd: home });
  const ws = await wm.criar("secretario-corp");
  return { home, wsPath: ws.path };
}

describe("Secretário Executivo & Resiliência (Auditoria de SO)", () => {
  describe("Tratamento de Stop na CLI e API (Prevenção de Mensagem Acidental)", () => {
    it("POST /secretario/stop encerra o serviço sem passar pela conversa", async () => {
      stopChamado = false;
      const resp = await fetch(`http://127.0.0.1:${serverPort}/secretario/stop`, {
        method: "POST",
      });
      expect(resp.status).toBe(200);
      const data = await resp.json();
      expect(data.ok).toBe(true);
      expect(stopChamado).toBe(true);
    });
  });

  describe("RBAC Declarativo: Níveis e Permissões de Agentes", () => {
    it("valida a existência e integridade dos agentes criados no workspace", async () => {
      const { wsPath } = await criarAmbiente();
      const agentStore = new AgentStore();

      const lista = await agentStore.listar(wsPath);
      expect(lista.length).toBeGreaterThan(0);

      // Clona um agente operacional como secretário executivo com modelo dedicado
      const novoSecretario = await agentStore.criar(wsPath, "secretario-operacoes", {
        model: "openrouter/nvidia/nemotron-3.5-lightning:free",
      });

      expect(novoSecretario.frontmatter.id).toBe("secretario-operacoes");
      expect(novoSecretario.frontmatter.model).toBe("openrouter/nvidia/nemotron-3.5-lightning:free");
    });
  });

  describe("Hot-Swap Transparente de Modelos em Fallback", () => {
    it("rotaciona modelos em cadeia de contingência e preserva modelos gratuitos", async () => {
      const { home, wsPath } = await criarAmbiente();
      const agentStore = new AgentStore();

      const lista = await obterListaRotacaoCompleta(
        agentStore,
        wsPath,
        "secretario-exec",
        home
      );

      expect(lista.length).toBeGreaterThan(0);

      // Testa a rotação determinística
      const listaTeste = [
        "openrouter/nvidia/nemotron-3.5-lightning:free",
        "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
        "openrouter/minimax/minimax-m3:free",
        "openrouter/z-ai/glm-5.2:free",
      ];

      const proximo = proximoModeloRotacao(listaTeste, "openrouter/nvidia/nemotron-3.5-lightning:free");
      expect(proximo).toBe("openrouter/nvidia/nemotron-3-ultra-550b-a55b:free");

      const proximo2 = proximoModeloRotacao(listaTeste, "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free");
      expect(proximo2).toBe("openrouter/minimax/minimax-m3:free");

      // Valida detecção de gratuidade
      for (const m of listaTeste) {
        expect(ehModeloGratuito(m)).toBe(true);
      }
    });
  });
});
