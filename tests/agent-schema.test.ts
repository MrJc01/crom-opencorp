import { describe, expect, it } from "vitest";
import {
  AgentSchemaError,
  normalizarIdAgente,
  parseAgenteMd,
  parseYamlSimples,
  validarIdAgente,
} from "../src/schemas/agent.js";

const EXEMPLO_DOC04 = `---
id: executor-padrao
role: Operário
category: operario
model: opencode/grok-code
inherits: null
tools: [read, write, edit, bash, registry]
permissions: level-2
budget:
  daily_usd: 1.00
  max_turns: 40
memory:
  reads: [documentos, execucoes]
  writes: [execucoes, logs]
---

Você é o executor padrão do workspace {{workspace}}.

Regras:
1. Execute a ordem recebida sem reescrever o escopo.
`;

describe("parseYamlSimples", () => {
  it("interpreta escalares, listas inline e mapas aninhados", () => {
    const dados = parseYamlSimples(EXEMPLO_DOC04.split("---")[1] ?? "");
    expect(dados.id).toBe("executor-padrao");
    expect(dados.tools).toEqual(["read", "write", "edit", "bash", "registry"]);
    expect(dados.budget).toEqual({ daily_usd: 1, max_turns: 40 });
    expect(dados.memory).toEqual({
      reads: ["documentos", "execucoes"],
      writes: ["execucoes", "logs"],
    });
  });

  it("lida com aspas, booleanos, null e comentários", () => {
    const dados = parseYamlSimples('role: "Operário"\nativo: true\nherits: null\n# comentário\n');
    expect(dados.role).toBe("Operário");
    expect(dados.ativo).toBe(true);
    expect(dados.herits).toBeNull();
  });
});

describe("parseAgenteMd", () => {
  it("interpreta o exemplo da doc 04 por completo", () => {
    const r = parseAgenteMd(EXEMPLO_DOC04);
    expect(r.frontmatter.id).toBe("executor-padrao");
    expect(r.frontmatter.category).toBe("operario");
    expect(r.frontmatter.permissions).toBe("level-2");
    expect(r.frontmatter.budget.daily_usd).toBe(1);
    expect(r.frontmatter.memory.reads).toEqual(["documentos", "execucoes"]);
    expect(r.corpo).toContain("{{workspace}}");
    expect(r.corpo).toContain("1. Execute a ordem recebida");
  });

  it("falha apontando o campo quando category é inválido", () => {
    const err = (() => {
      try {
        parseAgenteMd(EXEMPLO_DOC04.replace("category: operario", "category: patrao"));
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(AgentSchemaError);
    expect((err as Error).message).toContain('"category"');
  });

  it("falha apontando budget.daily_usd quando o valor não é número", () => {
    const err = (() => {
      try {
        parseAgenteMd(EXEMPLO_DOC04.replace("daily_usd: 1.00", "daily_usd: muito"));
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(AgentSchemaError);
    expect((err as Error).message).toContain("budget.daily_usd");
  });

  it("falha apontando model sem provider/model", () => {
    const err = (() => {
      try {
        parseAgenteMd(EXEMPLO_DOC04.replace("model: opencode/grok-code", "model: grok-code"));
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(AgentSchemaError);
    expect((err as Error).message).toContain('"model"');
  });

  it("falha quando não há frontmatter", () => {
    const err = (() => {
      try {
        parseAgenteMd("apenas texto livre");
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(AgentSchemaError);
    expect((err as Error).message).toContain("sem frontmatter");
  });
});

describe("normalizarIdAgente / validarIdAgente", () => {
  it("normaliza espaços, underscores e maiúsculas", () => {
    expect(normalizarIdAgente("Auditor Fiscal_X")).toBe("auditor-fiscal-x");
    expect(normalizarIdAgente("--Abrir--Arquivo__")).toBe("abrir-arquivo");
  });

  it("validarIdAgente rejeita o que não vira kebab-case", () => {
    expect(() => validarIdAgente("!!!")).toThrow(AgentSchemaError);
    expect(() => validarIdAgente("   ")).toThrow(AgentSchemaError);
    expect(validarIdAgente("Auditor_X")).toBe("auditor-x");
  });
});
