/**
 * @file Testes unitários para o módulo de domínio puro de DAG.
 *
 * Cobre:
 * 1. Grafo linear simples (A → B → C)
 * 2. Arestas duplicadas (explícita + condicional) — caso real do OpenCorp
 * 3. Nós desconectados e referências a nós inexistentes
 * 4. Decisão com múltiplas opções
 * 5. Loop com back-edges (excluídas do grau de entrada)
 * 6. Fan-in genuíno (múltiplos ramos paralelos convergindo)
 */
import { describe, it, expect } from "vitest";
import {
  construirAdjacencia,
  alcancaveis,
  grauEntradaJoin,
  type DagFlow,
} from "../../../src/core/domain/flow/dag.js";

// ── Helpers ──────────────────────────────────────────────────────────

function no(id: string, tipo = "agente", config: Record<string, unknown> = {}) {
  return { id, tipo, config };
}

function aresta(de: string, para: string) {
  return { de, para };
}

// ── Testes ───────────────────────────────────────────────────────────

describe("dag.ts — construirAdjacencia", () => {
  it("constrói adjacência de grafo linear A → B → C", () => {
    const flow: DagFlow = {
      nos: [no("a"), no("b"), no("c")],
      arestas: [aresta("a", "b"), aresta("b", "c")],
    };

    const { adj, rev } = construirAdjacencia(flow);

    expect([...adj.get("a")!]).toEqual(["b"]);
    expect([...adj.get("b")!]).toEqual(["c"]);
    expect(adj.get("c")!.size).toBe(0);

    expect(rev.get("a")!.size).toBe(0);
    expect([...rev.get("b")!]).toEqual(["a"]);
    expect([...rev.get("c")!]).toEqual(["b"]);
  });

  it("ignora arestas para nós inexistentes", () => {
    const flow: DagFlow = {
      nos: [no("a"), no("b")],
      arestas: [aresta("a", "b"), aresta("a", "fantasma"), aresta("fantasma", "b")],
    };

    const { adj, rev } = construirAdjacencia(flow);

    expect([...adj.get("a")!]).toEqual(["b"]);
    expect([...rev.get("b")!]).toEqual(["a"]);
    // "fantasma" não aparece nos mapas
    expect(adj.has("fantasma")).toBe(false);
  });

  it("ignora self-loops (de === para)", () => {
    const flow: DagFlow = {
      nos: [no("a")],
      arestas: [aresta("a", "a")],
    };

    const { adj } = construirAdjacencia(flow);
    expect(adj.get("a")!.size).toBe(0);
  });

  it("arestas duplicadas no array são deduplicadas pelo Set", () => {
    const flow: DagFlow = {
      nos: [no("a"), no("b")],
      arestas: [aresta("a", "b"), aresta("a", "b"), aresta("a", "b")],
    };

    const { adj, rev } = construirAdjacencia(flow);

    expect(adj.get("a")!.size).toBe(1);
    expect(rev.get("b")!.size).toBe(1);
  });

  it("extrai arestas implícitas de nó condicao (entao + senao)", () => {
    const flow: DagFlow = {
      nos: [
        no("inicio", "agente"),
        no("cond", "condicao", { entao: "ramo-a", senao: "ramo-b" }),
        no("ramo-a", "agente"),
        no("ramo-b", "agente"),
      ],
      arestas: [aresta("inicio", "cond")],
    };

    const { adj } = construirAdjacencia(flow);

    expect(adj.get("cond")!.has("ramo-a")).toBe(true);
    expect(adj.get("cond")!.has("ramo-b")).toBe(true);
    expect(adj.get("cond")!.size).toBe(2);
  });

  it("extrai arestas implícitas de nó decisao com múltiplas opções", () => {
    const flow: DagFlow = {
      nos: [
        no("d", "decisao", { opcoes: [{ proximo: "x" }, { proximo: "y" }, { proximo: "z" }] }),
        no("x", "agente"),
        no("y", "agente"),
        no("z", "agente"),
      ],
      arestas: [],
    };

    const { adj } = construirAdjacencia(flow);

    expect(adj.get("d")!.size).toBe(3);
    expect(adj.get("d")!.has("x")).toBe(true);
    expect(adj.get("d")!.has("y")).toBe(true);
    expect(adj.get("d")!.has("z")).toBe(true);
  });

  it("extrai arestas implícitas de nó loop (retornar_para + saida_final)", () => {
    const flow: DagFlow = {
      nos: [
        no("corpo", "agente"),
        no("lp", "loop", { retornar_para: "corpo", saida_final: "fim" }),
        no("fim", "saida"),
      ],
      arestas: [aresta("corpo", "lp")],
    };

    const { adj } = construirAdjacencia(flow);

    expect(adj.get("lp")!.has("corpo")).toBe(true);  // back-edge
    expect(adj.get("lp")!.has("fim")).toBe(true);     // saída
  });
});

describe("dag.ts — alcancaveis", () => {
  it("retorna descendentes transitivos", () => {
    const flow: DagFlow = {
      nos: [no("a"), no("b"), no("c"), no("d")],
      arestas: [aresta("a", "b"), aresta("b", "c"), aresta("c", "d")],
    };

    const { adj } = construirAdjacencia(flow);
    const desc = alcancaveis(adj, "a");

    expect(desc.has("b")).toBe(true);
    expect(desc.has("c")).toBe(true);
    expect(desc.has("d")).toBe(true);
    expect(desc.has("a")).toBe(false); // não inclui a si mesmo
  });

  it("nó folha não alcança ninguém", () => {
    const flow: DagFlow = {
      nos: [no("a"), no("b")],
      arestas: [aresta("a", "b")],
    };

    const { adj } = construirAdjacencia(flow);
    expect(alcancaveis(adj, "b").size).toBe(0);
  });
});

describe("dag.ts — grauEntradaJoin", () => {
  it("grafo linear A → B → C: graus são 0, 1, 1", () => {
    const flow: DagFlow = {
      nos: [no("a"), no("b"), no("c")],
      arestas: [aresta("a", "b"), aresta("b", "c")],
    };

    const graus = grauEntradaJoin(flow);

    expect(graus.get("a")).toBe(0);
    expect(graus.get("b")).toBe(1);
    expect(graus.get("c")).toBe(1);
  });

  it("fan-in genuíno: dois ramos paralelos convergindo em um nó", () => {
    //   inicio → ramo-a → juncao
    //   inicio → ramo-b → juncao
    const flow: DagFlow = {
      nos: [no("inicio"), no("ramo-a"), no("ramo-b"), no("juncao")],
      arestas: [
        aresta("inicio", "ramo-a"),
        aresta("inicio", "ramo-b"),
        aresta("ramo-a", "juncao"),
        aresta("ramo-b", "juncao"),
      ],
    };

    const graus = grauEntradaJoin(flow);

    expect(graus.get("inicio")).toBe(0);
    expect(graus.get("ramo-a")).toBe(1);
    expect(graus.get("ramo-b")).toBe(1);
    expect(graus.get("juncao")).toBe(2); // genuíno fan-in
  });

  it("BUG CORRIGIDO: aresta explícita + config.senao para o mesmo nó NÃO duplica grau", () => {
    // Cenário real do OpenCorp (yt-boletim-diário):
    //   verificador (condicao) → tem-boletim via config.senao
    //   verificador → tem-boletim via arestas[] (explícita duplicada)
    //
    // Com string[] (bug antigo): inDegree = 2
    // Com Set<string> (corrigido): inDegree = 1
    const flow: DagFlow = {
      nos: [
        no("verificador", "condicao", { entao: "gerar-video", senao: "tem-boletim" }),
        no("gerar-video", "agente"),
        no("tem-boletim", "saida"),
      ],
      arestas: [
        aresta("verificador", "gerar-video"),
        aresta("verificador", "tem-boletim"), // DUPLICA a aresta implícita do config.senao!
      ],
    };

    const graus = grauEntradaJoin(flow);

    // A correção garante que Set deduplica e o grau fica correto
    expect(graus.get("verificador")).toBe(0);
    expect(graus.get("gerar-video")).toBe(1);
    expect(graus.get("tem-boletim")).toBe(1); // ← ERA 2 COM O BUG
  });

  it("back-edge de loop NÃO conta no grau de entrada", () => {
    //  inicio → corpo → lp
    //  lp → corpo (back-edge)
    //  lp → fim
    const flow: DagFlow = {
      nos: [
        no("inicio", "agente"),
        no("corpo", "agente"),
        no("lp", "loop", { retornar_para: "corpo", saida_final: "fim" }),
        no("fim", "saida"),
      ],
      arestas: [aresta("inicio", "corpo"), aresta("corpo", "lp")],
    };

    const graus = grauEntradaJoin(flow);

    expect(graus.get("inicio")).toBe(0);
    // corpo tem predecessores: inicio + lp (back-edge)
    // lp é descendente de corpo (corpo→lp), logo lp como predecessor é
    // descendente de corpo — o back-edge NÃO conta. Grau efetivo = 1 (só inicio)
    expect(graus.get("corpo")).toBe(1);
    // lp tem predecessor: corpo. Mas corpo é alcançável a partir de lp
    // (via retornar_para back-edge), portanto corpo como predecessor é
    // descendente — excluído. Grau efetivo de lp = 0
    expect(graus.get("lp")).toBe(0);
    expect(graus.get("fim")).toBe(1);
  });

  it("nó isolado (sem arestas) tem grau 0", () => {
    const flow: DagFlow = {
      nos: [no("sozinho")],
      arestas: [],
    };

    const graus = grauEntradaJoin(flow);
    expect(graus.get("sozinho")).toBe(0);
  });

  it("decisão com 3 opções convergindo: fan-in correto", () => {
    //   decisao → (x, y, z) → convergencia
    const flow: DagFlow = {
      nos: [
        no("d", "decisao", { opcoes: [{ proximo: "x" }, { proximo: "y" }, { proximo: "z" }] }),
        no("x", "agente"),
        no("y", "agente"),
        no("z", "agente"),
        no("convergencia", "agente"),
      ],
      arestas: [
        aresta("x", "convergencia"),
        aresta("y", "convergencia"),
        aresta("z", "convergencia"),
      ],
    };

    const graus = grauEntradaJoin(flow);

    expect(graus.get("d")).toBe(0);
    expect(graus.get("x")).toBe(1);
    expect(graus.get("y")).toBe(1);
    expect(graus.get("z")).toBe(1);
    expect(graus.get("convergencia")).toBe(3);
  });
});
