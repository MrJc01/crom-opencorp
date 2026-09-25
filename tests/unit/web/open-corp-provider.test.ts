import { describe, expect, it } from "vitest";
import {
  eventoSsePertenceAoWorkspace,
  extrairWorkspaceDoEventoSse,
} from "../../../src/web/providers/OpenCorpProvider.js";

describe("isolamento SSE por workspace", () => {
  it("extrai as variantes de nome no envelope e no payload", () => {
    expect(extrairWorkspaceDoEventoSse({ dados: { workspace: "corp-a" } })).toBe("corp-a");
    expect(extrairWorkspaceDoEventoSse({ dados: { workspace_id: "corp-b" } })).toBe("corp-b");
    expect(extrairWorkspaceDoEventoSse({ workspaceId: "corp-c" })).toBe("corp-c");
  });

  it("aceita eventos do workspace ativo e eventos globais", () => {
    expect(eventoSsePertenceAoWorkspace({ dados: { workspace: "corp-a" } }, "corp-a")).toBe(true);
    expect(eventoSsePertenceAoWorkspace({ dados: { titulo: "global" } }, "corp-a")).toBe(true);
  });

  it("descarta eventos explicitamente atribuídos a outro workspace", () => {
    expect(eventoSsePertenceAoWorkspace({ dados: { workspaceId: "corp-b" } }, "corp-a")).toBe(false);
  });
});
