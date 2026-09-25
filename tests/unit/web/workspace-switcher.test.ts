import { describe, expect, it } from "vitest";
import { extrairModuloAtual } from "../../../src/web/shared/layout/WorkspaceSwitcher.js";
import { workspacePath } from "../../../src/web/lib/routes.js";

describe("WorkspaceSwitcher - navegação e preservação de tela", () => {
  it("extrai o módulo atual a partir de caminhos no padrão /w/:workspaceId/*", () => {
    expect(extrairModuloAtual("/w/projeto-a/tasks")).toBe("tasks");
    expect(extrairModuloAtual("/w/projeto-a/fluxos/editor/123")).toBe("fluxos/editor/123");
    expect(extrairModuloAtual("/w/projeto-a")).toBe("");
    expect(extrairModuloAtual("/w/projeto-a/")).toBe("");
  });

  it("extrai o módulo a partir de rotas legadas conhecidas", () => {
    expect(extrairModuloAtual("/tasks")).toBe("tasks");
    expect(extrairModuloAtual("/fluxos")).toBe("fluxos");
    expect(extrairModuloAtual("/secretario")).toBe("secretario");
    expect(extrairModuloAtual("/config")).toBe("config");
  });

  it("retorna string vazia para rotas globais ou não-módulos", () => {
    expect(extrairModuloAtual("/workspaces")).toBe("");
    expect(extrairModuloAtual("/docs")).toBe("");
    expect(extrairModuloAtual("/")).toBe("");
  });

  it("preserva tela ao trocar de workspace com workspacePath", () => {
    const moduloAtual = extrairModuloAtual("/w/projeto-a/tasks");
    const novoCaminho = workspacePath("projeto-b", moduloAtual, { filtro: "concluidas" });
    expect(novoCaminho).toBe("/w/projeto-b/tasks?filtro=concluidas");
  });
});
