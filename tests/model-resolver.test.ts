import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  parsearModelo,
  normalizarModelo,
  ehModeloGratuito,
  resolverCadeiaModelosAgente,
  proximoModeloDaCadeia,
  ModelResolverError,
} from "../src/core/model-resolver.js";
import { WorkspaceManager } from "../src/core/workspace-manager.js";

describe("Módulo Central de Resolução de Modelos e Isolamento de Workspace (4 Camadas)", () => {
  let tempDir: string;
  let fakeHome: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `opencorp-test-resolver-${randomUUID()}`);
    fakeHome = join(tempDir, "fake-home");
    mkdirSync(tempDir, { recursive: true });
    mkdirSync(fakeHome, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  describe("1. parsearModelo", () => {
    it("preserva o prefixo do provider sem remoção destrutiva", () => {
      const m1 = parsearModelo("opencode/nemotron-3-ultra-free");
      expect(m1).toEqual({
        providerID: "opencode",
        modelID: "nemotron-3-ultra-free",
        modeloCompleto: "opencode/nemotron-3-ultra-free",
      });

      const m2 = parsearModelo("openrouter/liquid/lfm-2.5-2.6b:free");
      expect(m2).toEqual({
        providerID: "openrouter",
        modelID: "liquid/lfm-2.5-2.6b:free",
        modeloCompleto: "openrouter/liquid/lfm-2.5-2.6b:free",
      });

      const m3 = parsearModelo("opencode-go/glm-5.3-flash");
      expect(m3).toEqual({
        providerID: "opencode-go",
        modelID: "glm-5.3-flash",
        modeloCompleto: "opencode-go/glm-5.3-flash",
      });
    });

    it("trata modelos sem provider prefix", () => {
      const m = parsearModelo("gpt-4o");
      expect(m).toEqual({
        providerID: "",
        modelID: "gpt-4o",
        modeloCompleto: "gpt-4o",
      });
    });
  });

  describe("2. normalizarModelo & ehModeloGratuito", () => {
    it("normaliza modelos legados para versões estáveis", () => {
      expect(normalizarModelo("openrouter/nvidia/nemotron-3.5-lightning:free")).toBe("openrouter/openrouter/free");
      expect(normalizarModelo("openrouter/nvidia/nemotron-3-ultra-550b-a55b:free")).toBe("opencode/nemotron-3-ultra-free");
      expect(normalizarModelo("openrouter/z-ai/glm-5.2:free")).toBe("opencode-go/glm-5.3-flash");
    });

    it("identifica corretamente modelos gratuitos", () => {
      expect(ehModeloGratuito("openrouter/openrouter/free")).toBe(true);
      expect(ehModeloGratuito("opencode/nemotron-3-ultra-free")).toBe(true);
      expect(ehModeloGratuito("openrouter/liquid/lfm-2.5-2.6b:free")).toBe(true);
      expect(ehModeloGratuito("opencode-go/glm-5.3-flash")).toBe(true);
      expect(ehModeloGratuito("openrouter/google/gemini-2.5-flash")).toBe(false);
    });
  });

  describe("3. resolverCadeiaModelosAgente (Camadas 1 e 2)", () => {
    it("resolve cadeia priorizando Camada 1 (solicitado -> agente.model -> agente.rotation)", () => {
      const wsDir = join(tempDir, "workspace-1");
      const ocDir = join(wsDir, ".opencorp");
      mkdirSync(ocDir, { recursive: true });
      writeFileSync(
        join(ocDir, "config.json"),
        JSON.stringify({
          modelos: {
            padrao: "openrouter/google/gemini-2.5-flash",
            rotacao: ["openrouter/google/gemini-2.5-flash", "opencode-go/glm-5.3-flash"],
          },
        }),
      );

      const res = resolverCadeiaModelosAgente({
        agente: {
          model: "openrouter/openrouter/free",
          rotation: ["opencode/nemotron-3-ultra-free"],
          workspace_rotation_fallback: true,
        },
        wsPath: wsDir,
        modeloSolicitado: "openrouter/liquid/lfm-2.5-2.6b:free",
      });

      expect(res.modeloPrimario).toBe("openrouter/liquid/lfm-2.5-2.6b:free");
      expect(res.camada1Agente).toEqual([
        "openrouter/liquid/lfm-2.5-2.6b:free",
        "openrouter/openrouter/free",
        "opencode/nemotron-3-ultra-free",
      ]);
      expect(res.camada2Workspace).toEqual([
        "openrouter/google/gemini-2.5-flash",
        "opencode-go/glm-5.3-flash",
      ]);
      expect(res.cadeia).toEqual([
        "openrouter/liquid/lfm-2.5-2.6b:free",
        "openrouter/openrouter/free",
        "opencode/nemotron-3-ultra-free",
        "openrouter/google/gemini-2.5-flash",
        "opencode-go/glm-5.3-flash",
      ]);
    });

    it("respeita workspace_rotation_fallback: false ignorando Camada 2", () => {
      const wsDir = join(tempDir, "workspace-2");
      const ocDir = join(wsDir, ".opencorp");
      mkdirSync(ocDir, { recursive: true });
      writeFileSync(
        join(ocDir, "config.json"),
        JSON.stringify({
          modelos: {
            rotacao: ["openrouter/google/gemini-2.5-flash"],
          },
        }),
      );

      const res = resolverCadeiaModelosAgente({
        agente: {
          model: "openrouter/openrouter/free",
          rotation: ["opencode/nemotron-3-ultra-free"],
          workspace_rotation_fallback: false,
        },
        wsPath: wsDir,
      });

      expect(res.herdarWorkspace).toBe(false);
      expect(res.camada2Workspace).toEqual([]);
      expect(res.cadeia).toEqual([
        "openrouter/openrouter/free",
        "opencode/nemotron-3-ultra-free",
      ]);
    });

    it("REGRA DE OURO 1: Falha explicitamente se o workspace não tiver modelos e o agente não tiver modelo", () => {
      const wsDir = join(tempDir, "workspace-vazio");
      const ocDir = join(wsDir, ".opencorp");
      mkdirSync(ocDir, { recursive: true });
      writeFileSync(join(ocDir, "config.json"), JSON.stringify({ version: 1 }));

      expect(() => {
        resolverCadeiaModelosAgente({
          agente: {},
          wsPath: wsDir,
          wsId: "workspace-vazio",
        });
      }).toThrowError(/Workspace "workspace-vazio" não possui lista 'modelos.rotacao'/);
    });
  });

  describe("4. proximoModeloDaCadeia", () => {
    it("avança para o próximo modelo sem repetir os já tentados", () => {
      const cadeia = [
        "openrouter/openrouter/free",
        "opencode/nemotron-3-ultra-free",
        "openrouter/liquid/lfm-2.5-2.6b:free",
      ];

      const prox1 = proximoModeloDaCadeia({
        cadeia,
        modeloAtual: "openrouter/openrouter/free",
      });
      expect(prox1).toBe("opencode/nemotron-3-ultra-free");

      const prox2 = proximoModeloDaCadeia({
        cadeia,
        modeloAtual: "opencode/nemotron-3-ultra-free",
        modelosJaTentados: ["openrouter/openrouter/free"],
      });
      expect(prox2).toBe("openrouter/liquid/lfm-2.5-2.6b:free");

      const prox3 = proximoModeloDaCadeia({
        cadeia,
        modeloAtual: "openrouter/liquid/lfm-2.5-2.6b:free",
        modelosJaTentados: ["openrouter/openrouter/free", "opencode/nemotron-3-ultra-free"],
      });
      expect(prox3).toBeNull();
    });

    it("filtra apenas gratuitos quando solicitado (falha de crédito/saldo)", () => {
      const cadeia = [
        "openrouter/google/gemini-2.5-flash", // pago
        "opencode/nemotron-3-ultra-free",    // gratuito
      ];

      const prox = proximoModeloDaCadeia({
        cadeia,
        modeloAtual: "openrouter/google/gemini-2.5-flash",
        apenasGratuitos: true,
      });
      expect(prox).toBe("opencode/nemotron-3-ultra-free");
    });
  });

  describe("5. Sementeira de Workspace na Criação", () => {
    it("WorkspaceManager sementeia modelos do global para o config.json do novo workspace", async () => {
      const globalDir = join(fakeHome, ".opencorp");
      mkdirSync(globalDir, { recursive: true });
      writeFileSync(
        join(globalDir, "settings.json"),
        JSON.stringify({
          modelos: {
            padrao: "openrouter/google/gemini-2.5-flash",
            rotacao: [
              "openrouter/google/gemini-2.5-flash",
              "opencode/nemotron-3-ultra-free",
            ],
          },
          execution_driver: "sandbox",
        }),
      );

      const wm = new WorkspaceManager({ homeDir: fakeHome, cwd: fakeHome });
      const wsCriado = await wm.criar("novo-workspace-teste");

      const wsConfigPath = join(wsCriado.path, ".opencorp", "config.json");
      expect(existsSync(wsConfigPath)).toBe(true);

      const wsConfig = JSON.parse(readFileSync(wsConfigPath, "utf8"));
      expect(wsConfig.modelos).toBeDefined();
      expect(wsConfig.modelos.padrao).toBe("openrouter/google/gemini-2.5-flash");
      expect(wsConfig.modelos.rotacao).toEqual([
        "openrouter/google/gemini-2.5-flash",
        "opencode/nemotron-3-ultra-free",
      ]);
      expect(wsConfig.execution_driver).toBe("sandbox");
    });
  });
});
