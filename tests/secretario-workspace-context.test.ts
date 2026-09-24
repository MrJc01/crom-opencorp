import { describe, it, expect } from "vitest";
import { construirContextoWorkspace } from "../src/server/routes/secretario/context-builder.js";
import { limparPrefixoWorkspace } from "../src/core/contexts/execution/opencode-server.js";
import { join } from "node:path";
import { existsSync } from "node:fs";

describe("Secretário — Contexto Automático de Workspace e Isolamento", () => {
  it("construirContextoWorkspace injeta dados de config.json, AGENTS.md e fluxos", async () => {
    const wsPath = "/home/j/.opencorp/workspaces/yt-factory-01";
    if (!existsSync(wsPath)) {
      // Se não existir na máquina local de teste, pula ou testa com mock
      return;
    }

    const contexto = await construirContextoWorkspace({
      id: "yt-factory-01",
      path: wsPath,
    });

    // Deve identificar o cabeçalho estruturado do workspace
    expect(contexto).toContain('[CONTEXTO OPERACIONAL DO WORKSPACE: "yt-factory-01"]');
    expect(contexto).toContain(wsPath);

    // Deve conter os dados de negócio do config.json
    expect(contexto).toContain("tech-aberto");
    expect(contexto).toContain("Regra de Temas");

    // Deve conter as diretrizes de governança do AGENTS.md
    expect(contexto).toContain("Paradigma n8n");
    expect(contexto).toContain("Português do Brasil (PT-BR)");
    expect(contexto).toContain("--workspace yt-factory-01");

    // Deve conter delimitador final
    expect(contexto).toContain("---\n");
  });

  it("limparPrefixoWorkspace remove preâmbulo estruturado e preserva texto do usuário", () => {
    const textoComContextoEstruturado = `[CONTEXTO OPERACIONAL DO WORKSPACE: "yt-factory-01"]
Caminho Base: /home/j/.opencorp/workspaces/yt-factory-01

Configuração de Negócio do Workspace:
- Nicho: tech-aberto
- Regra de Temas: PROIBIDO banco fixo de temas

Diretrizes de Governança e Engenharia (AGENTS.md):
1. Paradigma n8n: toda automação periódica reside em fluxos
2. Idioma: Português do Brasil (PT-BR)
---

verifique por que nao temos novos shorts e videos publicados no youtube`;

    const limpo = limparPrefixoWorkspace(textoComContextoEstruturado);
    expect(limpo).toBe("verifique por que nao temos novos shorts e videos publicados no youtube");
  });

  it("limparPrefixoWorkspace também remove preâmbulo legado de linha simples", () => {
    const textoLegado = `[WORKSPACE ATIVO: "yt-factory-01" | CAMINHO: /home/j/.opencorp/workspaces/yt-factory-01]
(Atenção Secretário: O usuário está operando estritamente no workspace "yt-factory-01". Ao rodar comandos 'oc', use SEMPRE a flag '--workspace yt-factory-01'. Suas análises, listagens e tarefas devem ser restritas exclusivamente a este workspace. Não consulte outros workspaces.)

verifique por que nao temos novos shorts e videos publicados no youtube`;

    const limpo = limparPrefixoWorkspace(textoLegado);
    expect(limpo).toBe("verifique por que nao temos novos shorts e videos publicados no youtube");
  });

  it("limparPrefixoWorkspace preserva mensagens normais sem modificação", () => {
    const mensagemNormal = "olá secretário, como estão as tarefas hoje?";
    expect(limparPrefixoWorkspace(mensagemNormal)).toBe(mensagemNormal);
  });
});
