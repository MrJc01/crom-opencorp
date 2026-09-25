import { describe, expect, it, vi } from "vitest";
import { resolverMencoes } from "../src/server/routes/secretario/mentions.js";

describe("Secretário — contexto do Flow Studio", () => {
  it("hidrata #flow:<id> com o grafo editável do workspace", async () => {
    const obter = vi.fn(async (_wsPath: string, id: string) => ({
      id,
      nome: "Publicar conteúdo",
      ativo: true,
      nos: [{ id: "gatilho", tipo: "manual" }],
      arestas: [],
    }));

    const resultado = await resolverMencoes(
      {
        agentes: { listar: vi.fn(async () => []) },
        flows: { obter },
      } as any,
      {
        mensagemBruta: "Adicione uma etapa de validação",
        corpoContexto: ["#flow:publicar-conteudo"],
        agenteAtual: "secretario-exec",
        ws: { id: "corp-a", path: "/tmp/corp-a" },
      },
    );

    expect(obter).toHaveBeenCalledWith("/tmp/corp-a", "publicar-conteudo");
    expect(resultado.contexto).toContain("#flow:publicar-conteudo");
    expect(resultado.mensagem).toContain('Fonte: fluxo ativo "publicar-conteudo"');
    expect(resultado.mensagem).toContain('"tipo": "manual"');
    expect(resultado.mensagem).toContain("atualizada em tempo real");
  });
});
