import { describe, expect, it } from "vitest";
import { extrairPassosMensagens, type MensagemOc } from "../src/core/opencode-server.js";
import { renderMarkdown } from "../src/web/md.js";

describe("Secretário — Ordem Cronológica e Separação de Passos (Pensamento -> Tool -> Pensamento -> Texto)", () => {
  it("extrai e separa pensamentos intercalados com tools sem unificá-los", () => {
    const mensagens: MensagemOc[] = [
      {
        info: { id: "m1", role: "assistant", time: { created: 1000 } },
        parts: [
          { type: "step-start" },
          { type: "reasoning", text: "Primeiro pensamento: analisando o problema" },
          {
            type: "tool",
            tool: "bash",
            state: {
              status: "completed",
              title: "Verificar tag GA4",
              input: { command: "curl -s https://exemplo.com | grep gtag" },
            },
          },
          { type: "step-finish" },
        ],
      },
      {
        info: { id: "m2", role: "assistant", time: { created: 2000 } },
        parts: [
          { type: "step-start" },
          { type: "reasoning", text: "Segundo pensamento: a tag não está no head, preciso corrigir" },
          {
            type: "tool",
            tool: "bash",
            state: {
              status: "completed",
              title: "Editar template header",
              input: { command: "wp theme mod set header ..." },
            },
          },
          { type: "step-finish" },
        ],
      },
      {
        info: { id: "m3", role: "assistant", time: { created: 3000 } },
        parts: [
          { type: "step-start" },
          { type: "reasoning", text: "Terceiro pensamento: verifiquei e agora está ok" },
          { type: "text", text: "**Sim, foi corrigido.**\n\nA Google tag agora está ativa no `<head>`." },
          { type: "step-finish" },
        ],
      },
    ];

    const passos = extrairPassosMensagens(mensagens);

    // Deve ter exatamente 6 passos distintos, preservando a ordem cronológica
    expect(passos).toHaveLength(6);
    expect(passos[0]).toEqual({
      tipo: "pensamento",
      texto: "Primeiro pensamento: analisando o problema",
    });
    expect(passos[1]).toMatchObject({
      tipo: "acao",
      ferramenta: "bash",
      sucesso: true,
    });
    expect(passos[2]).toEqual({
      tipo: "pensamento",
      texto: "Segundo pensamento: a tag não está no head, preciso corrigir",
    });
    expect(passos[3]).toMatchObject({
      tipo: "acao",
      ferramenta: "bash",
      sucesso: true,
    });
    expect(passos[4]).toEqual({
      tipo: "pensamento",
      texto: "Terceiro pensamento: verifiquei e agora está ok",
    });
    expect(passos[5]).toEqual({
      tipo: "texto",
      texto: "**Sim, foi corrigido.**\n\nA Google tag agora está ativa no `<head>`.",
    });
  });

  it("consolida múltiplos blocos de raciocínio consecutivos em um único pensamento", () => {
    const mensagens: MensagemOc[] = [
      {
        info: { id: "m1", role: "assistant", time: { created: 1000 } },
        parts: [
          { type: "reasoning", text: "Parte 1 do pensamento." },
          { type: "reasoning", text: "Parte 2 do mesmo pensamento." },
          { type: "text", text: "Resposta final" },
        ],
      },
    ];

    const passos = extrairPassosMensagens(mensagens);
    expect(passos).toHaveLength(2);
    expect(passos[0].tipo).toBe("pensamento");
    expect(passos[0].texto).toBe("Parte 1 do pensamento.\n\nParte 2 do mesmo pensamento.");
    expect(passos[1].tipo).toBe("texto");
    expect(passos[1].texto).toBe("Resposta final");
  });

  it("renderMarkdown formata corretamente blocos de markdown rico com negrito, código e tags", () => {
    const markdownTexto = `**Sim, foi corrigido.**

A Google tag (\`G-PSMPCGFS27\`) agora está no \`<head>\`:
\`\`\`html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-PSMPCGFS27"></script>
\`\`\`

- Ponto 1: validado
- Ponto 2: concluído`;

    const html = renderMarkdown(markdownTexto);

    // Valida que negrito foi transformado em <strong>
    expect(html).toContain("<strong>Sim, foi corrigido.</strong>");
    // Valida que inline code foi transformado em <code class="md-code-inline">
    expect(html).toContain('<code class="md-code-inline">G-PSMPCGFS27</code>');
    // Valida que HTML bruto dentro de inline code foi escapado
    expect(html).toContain("&lt;head&gt;");
    // Valida que o code fence foi renderizado com classe md-code
    expect(html).toContain('class="md-code"');
    expect(html).toContain("googletagmanager.com");
    // Valida que listas foram renderizadas
    expect(html).toContain("md-lista");
    expect(html).toContain("Ponto 1: validado");
  });

  it("não agrupa pensamentos em um único bloco mesmo quando recebidos como string concatenada com separador", () => {
    const pensamentosAcumulados = "Pensamento 1: analisando o banco\n\n---\n\nPensamento 2: verificando índices\n\n---\n\nPensamento 3: concluindo";
    const partes = pensamentosAcumulados.split("\n\n---\n\n").filter(Boolean);
    expect(partes).toHaveLength(3);
    expect(partes[0]).toBe("Pensamento 1: analisando o banco");
    expect(partes[1]).toBe("Pensamento 2: verificando índices");
    expect(partes[2]).toBe("Pensamento 3: concluindo");
  });
});
