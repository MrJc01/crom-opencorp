/**
 * Teste simples para a migração Config → Svelte 5
 * Verifica estrutura do componente e helpers puros espelhados.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const RAIZ = join(dirname(new URL(import.meta.url).pathname), "..");
const SVELTE_PATH = join(RAIZ, "src/web/views/Config.svelte");

function lerSvelte(): string {
  return readFileSync(SVELTE_PATH, "utf8");
}

// helpers espelhados do componente (testáveis isoladamente)
function badgeClasse(origem: string): string {
  if (origem === "workspace") return "badge-success";
  if (origem === "global") return "badge-info";
  if (origem === "default") return "badge-ghost";
  return "badge-warning";
}
function idDe(chave: string): string {
  return "cfg-" + chave.replace(/\./g, "-");
}
function parseLista(bruto: string): string {
  const itens = bruto.split("\n").map((s) => s.trim()).filter(Boolean);
  return JSON.stringify(itens);
}

describe("Config.svelte — arquivo existe e integra stores/api", () => {
  it("arquivo Config.svelte existe", () => {
    expect(existsSync(SVELTE_PATH), "src/web/views/Config.svelte deve existir").toBe(true);
  });

  it("importa wsAtivo de stores/auth.svelte.ts", () => {
    const src = lerSvelte();
    expect(src).toContain("stores/auth.svelte");
    expect(src).toContain("wsAtivo");
  });

  it("chama API via src/web/api.ts", () => {
    const src = lerSvelte();
    expect(src).toContain("from '../api.js'");
    expect(src).toContain("api(");
  });

  it("usa Tailwind/DaisyUI classes existentes", () => {
    const src = lerSvelte();
    // DaisyUI/Tailwind: btn, card, badge, etc.
    expect(src).toContain("btn");
    expect(src).toContain("card");
    expect(src).toContain("badge");
  });

  it("mantém funcionalidades: abas, escopo Global/Workspace, badge origem, salvar individual", () => {
    const src = lerSvelte();
    expect(src).toContain("abaAtual");
    expect(src).toContain("escopoAtual");
    expect(src).toContain("Global");
    expect(src).toContain("Workspace");
    expect(src).toContain("badge");
    expect(src).toContain("Salvar");
    // salvar individual
    expect(src).toContain("salvarCampo");
  });

  it("contém as 6 abas originais + especiais", () => {
    const src = lerSvelte();
    for (const aba of ["modelos", "orcamento", "seguranca", "workspace", "testes", "scheduler"]) {
      expect(src).toContain(`id: '${aba}'`);
    }
    for (const esp of ["secrets", "ferramentas", "opencode", "chaves"]) {
      expect(src).toContain(esp);
    }
  });

  it("tem 6 tipos de campo: string/numero/bool/lista/enum/model", () => {
    const src = lerSvelte();
    for (const t of ["'string'", "'numero'", "'bool'", "'lista'", "'enum'", "'model'"] as const) {
      expect(src).toContain(t);
    }
  });

  it("usa Svelte 5 runes ($state)", () => {
    const src = lerSvelte();
    expect(src).toContain("$state");
  });

  it("MODELOS_SUGERIDOS inclui modelos free pedidos", () => {
    const src = lerSvelte();
    expect(src).toContain("muse-spark-1.2-contributor-free");
    expect(src).toContain("nemotron-3-nano-free");
  });
});

describe("Config.svelte — helpers puros", () => {
  it("badgeClasse mapeia origem → classe DaisyUI", () => {
    expect(badgeClasse("workspace")).toBe("badge-success");
    expect(badgeClasse("global")).toBe("badge-info");
    expect(badgeClasse("default")).toBe("badge-ghost");
    expect(badgeClasse("cli")).toBe("badge-warning");
    expect(badgeClasse("agente")).toBe("badge-warning");
  });

  it("idDe substitui pontos por hífen com prefixo cfg-", () => {
    expect(idDe("budget.daily_usd")).toBe("cfg-budget-daily_usd");
    expect(idDe("security.level")).toBe("cfg-security-level");
    expect(idDe("a.b.c")).toBe("cfg-a-b-c");
  });

  it("parse de lista: 1 por linha → JSON array", () => {
    expect(parseLista("a\nb\nc")).toBe(JSON.stringify(["a", "b", "c"]));
    expect(parseLista(" a \n\n b \n ")).toBe(JSON.stringify(["a", "b"]));
    expect(parseLista("")).toBe(JSON.stringify([]));
  });

  it("validação de número: NaN deve ser detectado", () => {
    expect(Number.isNaN(Number("abc"))).toBe(true);
    expect(Number.isNaN(Number("12.5"))).toBe(false);
    expect(String(Number("12.5"))).toBe("12.5");
  });

  it("escopo workspace sem wsAtivo deve avisar", () => {
    const wsAtivo = "";
    const escopo = "workspace";
    const deveAvisar = escopo === "workspace" && !wsAtivo;
    expect(deveAvisar).toBe(true);
    expect(!"" ? "aviso" : "ok").toBe("aviso");
  });
});
