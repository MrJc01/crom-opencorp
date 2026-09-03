import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { validarPrePublicacao } from "../src/core/pre-publish.js";
import { RegistryStore } from "../src/core/registry-store.js";
import { eventBus } from "../src/core/event-bus.js";

describe("Orquestração e Governança Editorial (ORC-01 e ORC-02)", () => {
  let tempWs: string;

  beforeEach(() => {
    tempWs = mkdtempSync(join(tmpdir(), "opencorp-orc-test-"));
    mkdirSync(join(tempWs, ".opencorp", "registries", "documentos"), { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(tempWs, { recursive: true, force: true });
    } catch {}
  });

  it("ORC-01: bloqueia publicação se o conteúdo for muito curto ou vazio", async () => {
    const resCurto = await validarPrePublicacao(tempWs, {
      titulo: "Post Relâmpago",
      conteudo: "Texto com 30 caracteres apenas.",
      tipo: "post",
    });

    expect(resCurto.valido).toBe(false);
    expect(resCurto.erros.some((e) => e.includes("muito curto"))).toBe(true);

    const resVazio = await validarPrePublicacao(tempWs, {
      titulo: "Post Vazio",
      conteudo: "   ",
      tipo: "post",
    });

    expect(resVazio.valido).toBe(false);
    expect(resVazio.erros.some((e) => e.includes("Conteúdo vazio"))).toBe(true);
  });

  it("ORC-01: detecta e bloqueia snippet de script ou tracking solto no corpo (anti-regressão)", async () => {
    const snippetToxico = `
# Análise de Tendências em 2026
Aqui está uma análise excelente sobre pequenas e médias empresas.
(function() {
  var script = document.createElement("script");
  script.async = true;
  script.src = "https://www.googletagmanager.com/gtag/js?id=G-PSMPCGFS27";
  document.head.appendChild(script);
})();
Conclusão: o impacto da IA nas operações corporativas é imenso.
`.repeat(3);

    const res = await validarPrePublicacao(tempWs, {
      titulo: "Post com Script Solto",
      conteudo: snippetToxico,
      tipo: "post",
    });

    expect(res.valido).toBe(false);
    expect(
      res.erros.some((e) => e.includes("Código JavaScript solto detectado no corpo")),
    ).toBe(true);
  });

  it("ORC-01: detecta duplicidade de título existente no banco corporativo", async () => {
    const dbPath = join(tempWs, ".opencorp", "corp.db");
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE registros (
        id TEXT PRIMARY KEY,
        categoria TEXT,
        descricao TEXT,
        criado_por TEXT,
        criado_em TEXT,
        atualizado_em TEXT,
        tags TEXT,
        conteudo TEXT
      );
    `);

    db.prepare(`
      INSERT INTO registros (id, categoria, descricao, criado_por, criado_em, atualizado_em, tags, conteudo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "artigo-ia-2026",
      "documentos",
      "Como a IA Revoluciona Pequenas Empresas",
      "redator",
      new Date().toISOString(),
      new Date().toISOString(),
      "",
      "Conteudo existente",
    );
    db.close();

    const resDup = await validarPrePublicacao(tempWs, {
      titulo: "Como a IA Revoluciona Pequenas Empresas",
      conteudo: "Um artigo completamente novo com mais de 300 caracteres detalhando a evolução das ferramentas no mercado de forma séria e sem duplicidade intencional.".repeat(3),
      tipo: "post",
    });

    expect(resDup.valido).toBe(false);
    expect(resDup.erros.some((e) => e.includes("Conteúdo duplicado"))).toBe(true);
  });

  it("ORC-01: aprova post que atende aos critérios editoriais e de segurança", async () => {
    const artigoValido = `
# Estratégia de Automação para 2026
A governança corporativa moderna exige que agentes de inteligência artificial
trabalhem com supervisão clara, contexto contextualizado e limites rígidos.
Empresas que adotam esse formato reduzem o retrabalho e aumentam a assertividade
dos fluxos de entrega diários em mais de 40%.
`.repeat(3);

    const res = await validarPrePublicacao(tempWs, {
      titulo: "Estratégia de Automação para 2026",
      conteudo: artigoValido,
      tipo: "post",
    });

    expect(res.valido).toBe(true);
    expect(res.erros.length).toBe(0);
  });

  it("ORC-02: RegistryStore emite doc.criado no eventBus para viabilizar handoff reativo", async () => {
    const store = new RegistryStore();

    let eventoRecebido: any = null;
    const off = eventBus.on((ev) => {
      if (ev.tipo === "doc.criado") {
        eventoRecebido = ev.dados;
      }
    });

    try {
      await store.criar(tempWs, {
        categoria: "documentos",
        id: "pauta-executiva-01",
        descricao: "Pauta Editorial da Semana",
        criadoPor: "agente:secretario",
        conteudo: "# Pauta da Semana\n- Item 1\n- Item 2",
      });

      expect(eventoRecebido).toBeDefined();
      expect(eventoRecebido.doc_id).toBe("pauta-executiva-01");
      expect(eventoRecebido.categoria).toBe("documentos");
      expect(eventoRecebido.criado_por).toBe("agente:secretario");
      expect(eventoRecebido.caminho).toContain("conteudo.md");
    } finally {
      off();
    }
  });
});
