import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/web/md.js";

describe("md.ts — chat rico", () => {
  it("autolinka URLs cruas com target _blank (referências clicáveis)", () => {
    const html = renderMarkdown("Veja https://pulso-diario.wp.crom.me/2026/08/31/post-35/ no site.");
    expect(html).toContain('<a href="https://pulso-diario.wp.crom.me/2026/08/31/post-35/"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("autolink preserva pontuação final fora do link", () => {
    const html = renderMarkdown("Fonte: https://exemplo.com/noticia, publicada hoje.");
    expect(html).toContain('<a href="https://exemplo.com/noticia"');
    expect(html).toMatch(/<\/a>, publicada/);
  });

  it("markdown link [texto](url) continua funcionando e não duplica autolink", () => {
    const html = renderMarkdown("[pulso-diario](https://pulso-diario.wp.crom.me)");
    const links = html.match(/<a /g);
    expect(links?.length).toBe(1);
    expect(html).toContain('>pulso-diario</a>');
  });

  it("code fence com linguagem preserva o corpo inteiro (não mostra menos)", () => {
    const html = renderMarkdown("Texto:\n```bash\n*/5 * * * * gera_noticia.sh >> log\n```\nFim.");
    expect(html).toContain("md-code");
    expect(html).toContain("*/5 * * * * gera_noticia.sh &gt;&gt; log");
    expect(html).not.toContain("&gt;&gt; log\nbash");
  });

  it("corpo do fence que começa com palavra única não perde a 1ª linha (bug do double-strip)", () => {
    const html = renderMarkdown("```\nresultado\nlinha2\n```");
    expect(html).toContain("resultado");
    expect(html).toContain("linha2");
  });

  it("fence de diagrama ASCII preserva caracteres de caixa", () => {
    const diagrama = renderMarkdown("```\n┌─ A CADA 5 MIN ─┐\n│ 1. COLETAR     │\n└────────────────┘\n```");
    expect(diagrama).toContain("┌─ A CADA 5 MIN ─┐");
    expect(diagrama).toContain("COLETAR");
  });

  it("escapa HTML bruto no texto (segurança)", () => {
    const html = renderMarkdown("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("conteúdo longo com seções, tabela de linhas e links — tudo presente no HTML", () => {
    const texto = [
      "Intro.",
      "## Seção A",
      "```",
      "┌─ x ─┐",
      "```",
      "**1. Item** — detalhe em https://site.com/pagina.",
      "### ⚠️ Aviso",
      "- ponto 1",
      "- ponto 2",
      "Conclusão: **pronto e rodando.**",
    ].join("\n");
    const html = renderMarkdown(texto);
    for (const pedaco of ["Seção A", "┌─ x ─┐", "Item", "https://site.com/pagina", "Aviso", "ponto 1", "ponto 2", "pronto e rodando"]) {
      expect(html).toContain(pedaco);
    }
  });
});
