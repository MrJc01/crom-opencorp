import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpenCodeBridge } from "../src/core/opencode-bridge.js";
import type { Agente } from "../src/schemas/agent.js";
import { readFile } from "node:fs/promises";

describe("Contexto Dinâmico Nativo (projeto.json e contexto.json)", () => {
  let tempWs: string;
  const bridge = new OpenCodeBridge();

  const agenteTeste: Agente = {
    id: "redator-teste",
    role: "Redator Especialista",
    category: "operario",
    ativo: true,
    model: "openrouter/nvidia/nemotron-3.5-lightning:free",
    tools: ["read", "write", "edit", "bash"],
    permissions: "level-2",
    budget: { daily_usd: 1.0, max_turns: 20 },
    memory: { reads: ["documentos"], writes: ["documentos", "logs"] },
  };

  beforeEach(() => {
    tempWs = mkdtempSync(join(tmpdir(), "opencorp-dyn-ctx-"));
    mkdirSync(join(tempWs, ".opencorp"), { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(tempWs, { recursive: true, force: true });
    } catch {}
  });

  it("injeta projeto.json automaticamente no prompt do agente quando existe", async () => {
    const projeto = {
      empresa: "TechSoluções",
      nicho: "SaaS de Logística",
      publico: "Diretores de Supply Chain",
      tom: "Analítico e baseado em dados",
      topicos_editoriais: ["Otimização de rotas", "Redução de combustível"],
      tom_evitar: ["Clichês de IA generativa"],
    };
    writeFileSync(join(tempWs, ".opencorp", "projeto.json"), JSON.stringify(projeto, null, 2));

    const pathDestino = await bridge.sincronizarAgente(tempWs, agenteTeste, "Você é o redator do workspace {{workspace}}.");
    const conteudo = await readFile(pathDestino, "utf8");

    expect(conteudo).toContain("## Perfil do Negócio / Empresa (projeto.json)");
    expect(conteudo).toContain("Empresa: TechSoluções");
    expect(conteudo).toContain("Nicho: SaaS de Logística");
    expect(conteudo).toContain("Tom de Comunicação: Analítico e baseado em dados");
    expect(conteudo).toContain("Tópicos Principais: Otimização de rotas, Redução de combustível");
    expect(conteudo).toContain("Diretrizes / Evitar: Clichês de IA generativa");
  });

  it("injeta contexto.json com regras de negócio e notas operacionais", async () => {
    const contexto = {
      descricao_curta: "Plataforma de automação logística",
      tom_de_voz: "Técnico e preciso",
      regras_de_negocio: [
        "Sempre calcular o ROI estimado antes de publicar",
        "Validar o CNPJ da transportadora citada",
      ],
      notas_operacionais: [
        "O banco de dados de rotas é atualizado diariamente às 04:00 BRT",
      ],
      glossario: {
        TMS: "Transportation Management System",
        WMS: "Warehouse Management System",
      },
    };
    writeFileSync(join(tempWs, ".opencorp", "contexto.json"), JSON.stringify(contexto, null, 2));

    const pathDestino = await bridge.sincronizarAgente(tempWs, agenteTeste, "Ordem base.");
    const conteudo = await readFile(pathDestino, "utf8");

    expect(conteudo).toContain("## Contexto Adaptativo do Workspace (contexto.json)");
    expect(conteudo).toContain("Descrição: Plataforma de automação logística");
    expect(conteudo).toContain("Regras de Negócio Inegociáveis:");
    expect(conteudo).toContain("Sempre calcular o ROI estimado antes de publicar");
    expect(conteudo).toContain("Notas Operacionais & Aprendizados:");
    expect(conteudo).toContain("O banco de dados de rotas é atualizado diariamente às 04:00 BRT");
    expect(conteudo).toContain("Glossário Interno: TMS: Transportation Management System | WMS: Warehouse Management System");
  });

  it("funciona normalmente e com tolerância quando projeto.json ou contexto.json não existem", async () => {
    const pathDestino = await bridge.sincronizarAgente(tempWs, agenteTeste, "Ordem simples.");
    const conteudo = await readFile(pathDestino, "utf8");

    expect(conteudo).toContain("## Contexto Operacional Primário (OpenCorp)");
    expect(conteudo).not.toContain("## Perfil do Negócio / Empresa (projeto.json)");
    expect(conteudo).not.toContain("## Contexto Adaptativo do Workspace (contexto.json)");
  });
});
