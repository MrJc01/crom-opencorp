import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import http from "node:http";
import { obterConfiguracaoServidor, cliFetch, CliHttpError } from "../src/cli/client.js";
import { buildProgram } from "../src/cli/index.js";
import { WorkspaceManager } from "../src/core/contexts/workspace/workspace-manager.js";
import { FlowStore } from "../src/core/contexts/orchestration/flow-store.js";

describe("CLI Standardization (Micro-Passo 20)", () => {
  let tempHome: string;
  let tempWs: string;
  const envOriginal = { ...process.env };

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), "oc-std-home-"));
    tempWs = mkdtempSync(join(tmpdir(), "oc-std-ws-"));
    mkdirSync(join(tempHome, ".opencorp"), { recursive: true });

    delete process.env.OPENCORP_PORT;
    delete process.env.OPENCORP_TOKEN;
    delete process.env.OPENCORP_HOST;
    delete process.env.OPENCORP_HOME;
    process.env.OPENCORP_HOME = tempHome;
  });

  afterEach(() => {
    try {
      rmSync(tempHome, { recursive: true, force: true });
      rmSync(tempWs, { recursive: true, force: true });
    } catch {}
    process.env = { ...envOriginal };
  });

  describe("obterConfiguracaoServidor", () => {
    it("retorna valores padrão quando nada está configurado", () => {
      const cfg = obterConfiguracaoServidor({ homeDir: tempHome });
      expect(cfg.host).toBe("127.0.0.1");
      expect(cfg.porta).toBe(4100);
      expect(cfg.token).toBe("");
      expect(cfg.urlBase).toBe("http://127.0.0.1:4100");
    });

    it("respeita variáveis de ambiente OPENCORP_PORT, OPENCORP_TOKEN e OPENCORP_HOST", () => {
      process.env.OPENCORP_PORT = "8899";
      process.env.OPENCORP_TOKEN = "segredo-super-secreto";
      process.env.OPENCORP_HOST = "0.0.0.0";

      const cfg = obterConfiguracaoServidor({ homeDir: tempHome });
      expect(cfg.host).toBe("0.0.0.0");
      expect(cfg.porta).toBe(8899);
      expect(cfg.token).toBe("segredo-super-secreto");
      expect(cfg.urlBase).toBe("http://0.0.0.0:8899");
    });

    it("lê porta e token de ~/.opencorp/api.pid quando presentes", () => {
      writeFileSync(
        join(tempHome, ".opencorp", "api.pid"),
        JSON.stringify({
          pid: 1234,
          porta: 5432,
          token: "token-do-pidfile",
          iniciado_em: new Date().toISOString(),
        }),
      );

      const cfg = obterConfiguracaoServidor({ homeDir: tempHome });
      expect(cfg.porta).toBe(5432);
      expect(cfg.token).toBe("token-do-pidfile");
      expect(cfg.urlBase).toBe("http://127.0.0.1:5432");
    });

    it("lê porta de ~/.opencorp/daemon.pid como fallback se api.pid não tiver porta", () => {
      writeFileSync(
        join(tempHome, ".opencorp", "daemon.pid"),
        JSON.stringify({
          pid: 9999,
          porta: 6789,
          iniciado_em: new Date().toISOString(),
        }),
      );

      const cfg = obterConfiguracaoServidor({ homeDir: tempHome });
      expect(cfg.porta).toBe(6789);
      expect(cfg.urlBase).toBe("http://127.0.0.1:6789");
    });

    it("prioriza variáveis de ambiente sobre o arquivo api.pid", () => {
      writeFileSync(
        join(tempHome, ".opencorp", "api.pid"),
        JSON.stringify({
          pid: 1234,
          porta: 5432,
          token: "token-do-pidfile",
        }),
      );

      process.env.OPENCORP_PORT = "7777";
      process.env.OPENCORP_TOKEN = "token-da-env";

      const cfg = obterConfiguracaoServidor({ homeDir: tempHome });
      expect(cfg.porta).toBe(7777);
      expect(cfg.token).toBe("token-da-env");
      expect(cfg.urlBase).toBe("http://127.0.0.1:7777");
    });
  });

  describe("cliFetch", () => {
    it("injeta token Bearer e faz requisição com sucesso", async () => {
      let authRecebido: string | undefined;
      let urlRecebida: string | undefined;

      const server = http.createServer((req, res) => {
        authRecebido = req.headers["authorization"];
        urlRecebida = req.url;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
      });

      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address() as { port: number };

      try {
        process.env.OPENCORP_PORT = String(address.port);
        process.env.OPENCORP_TOKEN = "meu-bearer-token";

        const response = await cliFetch("/teste-endpoint", {
          headers: { "X-Custom": "meu-header" },
        });

        expect(response.ok).toBe(true);
        const json = await response.json();
        expect(json).toEqual({ status: "ok" });
        expect(authRecebido).toBe("Bearer meu-bearer-token");
        expect(urlRecebida).toBe("/teste-endpoint");
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it("lança CliHttpError descritivo quando servidor está offline", async () => {
      process.env.OPENCORP_PORT = "39999"; // porta sabidamente fechada
      process.env.OPENCORP_HOST = "127.0.0.1";

      await expect(
        cliFetch("/health", undefined, { timeoutMs: 1000 }),
      ).rejects.toThrow(CliHttpError);

      try {
        await cliFetch("/health", undefined, { timeoutMs: 1000 });
      } catch (erro: any) {
        expect(erro.message).toContain("Servidor OpenCorp offline ou inacessível");
        expect(erro.message).toContain("http://127.0.0.1:39999");
        expect(erro.message).toContain("opencorp serve");
      }
    });
  });

  describe("Comandos com flag --json universal", () => {
    it("workspace list --json emite JSON parseável válido", async () => {
      const manager = new WorkspaceManager({ homeDir: tempHome, cwd: tempWs });
      await manager.criar("corpo-alfa", { template: "default" });

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: any[]) => logs.push(args.join(" "));

      try {
        const program = buildProgram(true);
        await program.parseAsync(["node", "oc", "workspace", "list", "--json"]);

        const output = logs.join("\n");
        expect(output).not.toContain("nenhum workspace");
        const parsed = JSON.parse(output);
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed.length).toBeGreaterThan(0);
        expect(parsed.some((w: any) => w.id === "corpo-alfa")).toBe(true);
      } finally {
        console.log = originalLog;
      }
    });

    it("workspace --json emite JSON parseável válido", async () => {
      const manager = new WorkspaceManager({ homeDir: tempHome, cwd: tempWs });
      await manager.criar("corpo-beta", { template: "default" });

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: any[]) => logs.push(args.join(" "));

      try {
        const program = buildProgram(true);
        await program.parseAsync(["node", "oc", "workspace", "--json"]);

        const output = logs.join("\n");
        const parsed = JSON.parse(output);
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed.some((w: any) => w.id === "corpo-beta")).toBe(true);
      } finally {
        console.log = originalLog;
      }
    });

    it("flow list --json emite JSON parseável válido", async () => {
      const manager = new WorkspaceManager({ homeDir: tempHome, cwd: tempWs });
      const ws = await manager.criar("flow-ws", { template: "default" });
      const store = new FlowStore();
      await store.criar(ws.path, "meu-fluxo", "Meu Fluxo de Teste");

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: any[]) => logs.push(args.join(" "));

      try {
        const program = buildProgram(true);
        await program.parseAsync(["node", "oc", "flow", "list", "--workspace", ws.id, "--json"]);

        const output = logs.join("\n");
        const parsed = JSON.parse(output);
        expect(Array.isArray(parsed)).toBe(true);
        const meuFluxo = parsed.find((f: any) => f.id === "meu-fluxo");
        expect(meuFluxo).toBeDefined();
        expect(meuFluxo.nome).toBe("Meu Fluxo de Teste");
      } finally {
        console.log = originalLog;
      }
    });

    it("meeting list --json emite array JSON parseável mesmo vazio", async () => {
      const manager = new WorkspaceManager({ homeDir: tempHome, cwd: tempWs });
      const ws = await manager.criar("meeting-ws", { template: "default" });

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: any[]) => logs.push(args.join(" "));

      try {
        const program = buildProgram(true);
        await program.parseAsync(["node", "oc", "meeting", "list", "--workspace", ws.id, "--json"]);

        const output = logs.join("\n");
        const parsed = JSON.parse(output);
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed.length).toBe(0);
      } finally {
        console.log = originalLog;
      }
    });

    it("flow --json emite JSON parseável válido", async () => {
      const manager = new WorkspaceManager({ homeDir: tempHome, cwd: tempWs });
      const ws = await manager.criar("flow-ws-direto", { template: "default" });
      const store = new FlowStore();
      await store.criar(ws.path, "fluxo-direto", "Fluxo Direto");

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: any[]) => logs.push(args.join(" "));

      try {
        const program = buildProgram(true);
        await program.parseAsync(["node", "oc", "flow", "--workspace", ws.id, "--json"]);

        const output = logs.join("\n");
        const parsed = JSON.parse(output);
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed.some((f: any) => f.id === "fluxo-direto")).toBe(true);
      } finally {
        console.log = originalLog;
      }
    });

    it("workspace show --json emite objeto JSON parseável", async () => {
      const manager = new WorkspaceManager({ homeDir: tempHome, cwd: tempWs });
      const ws = await manager.criar("ws-detalhes", { template: "default" });

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: any[]) => logs.push(args.join(" "));

      try {
        const program = buildProgram(true);
        await program.parseAsync(["node", "oc", "workspace", "show", ws.id, "--json"]);

        const output = logs.join("\n");
        const parsed = JSON.parse(output);
        expect(typeof parsed).toBe("object");
        expect(parsed.id).toBe("ws-detalhes");
        expect(parsed.path).toBe(ws.path);
      } finally {
        console.log = originalLog;
      }
    });

    it("flow show --json emite objeto JSON parseável", async () => {
      const manager = new WorkspaceManager({ homeDir: tempHome, cwd: tempWs });
      const ws = await manager.criar("ws-flow-show", { template: "default" });
      const store = new FlowStore();
      await store.criar(ws.path, "flow-detalhes", "Flow Detalhes");

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: any[]) => logs.push(args.join(" "));

      try {
        const program = buildProgram(true);
        await program.parseAsync(["node", "oc", "flow", "show", "flow-detalhes", "--workspace", ws.id, "--json"]);

        const output = logs.join("\n");
        const parsed = JSON.parse(output);
        expect(typeof parsed).toBe("object");
        expect(parsed.id).toBe("flow-detalhes");
        expect(parsed.nome).toBe("Flow Detalhes");
      } finally {
        console.log = originalLog;
      }
    });

    it("meeting --json emite array JSON parseável mesmo vazio", async () => {
      const manager = new WorkspaceManager({ homeDir: tempHome, cwd: tempWs });
      const ws = await manager.criar("meeting-ws-direto", { template: "default" });

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: any[]) => logs.push(args.join(" "));

      try {
        const program = buildProgram(true);
        await program.parseAsync(["node", "oc", "meeting", "--workspace", ws.id, "--json"]);

        const output = logs.join("\n");
        const parsed = JSON.parse(output);
        expect(Array.isArray(parsed)).toBe(true);
      } finally {
        console.log = originalLog;
      }
    });
  });
});
