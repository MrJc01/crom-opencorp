/**
 * Renderer de markdown rico para o chat — seguro por construção:
 * escapeHtml ANTES de qualquer transformação; links só http(s).
 * Suporta: headings, negrito, itálico, inline code, code fences (com copy),
 * listas, blockquote, hr, links e quebras de linha.
 */

import { escapeHtml } from "./format.js";

/** Instala (uma vez) o global de copy dos code fences */
function garantirCopyGlobal(): void {
  if (typeof window === "undefined") return; // testes em node
  const g = window as unknown as Record<string, unknown>;
  g.__mdCopy = (btn: HTMLButtonElement) => {
    const pre = btn.parentElement?.querySelector("code");
    const texto = pre?.textContent ?? "";
    void navigator.clipboard.writeText(texto).then(() => {
      const original = btn.textContent;
      btn.textContent = "copiado ✓";
      setTimeout(() => { btn.textContent = original ?? "copy"; }, 1500);
    });
  };
}

interface Bloco {
  tipo: "code" | "html";
  conteudo: string;
}

/** Separa code fences do resto (antes do escape, para preservar conteúdo cru) */
function separarFences(texto: string): Bloco[] {
  const blocos: Bloco[] = [];
  const partes = texto.split(/```/);
  for (let i = 0; i < partes.length; i++) {
    if (i % 2 === 1) {
      // fence: primeira linha pode ter linguagem
      const linhas = partes[i]!.split("\n");
      const corpo = linhas.slice(1).join("\n");
      blocos.push({ tipo: "code", conteudo: linhas[0] !== "" || corpo ? corpo || "" : partes[i] ?? "" });
    } else {
      blocos.push({ tipo: "html", conteudo: partes[i] ?? "" });
    }
  }
  return blocos;
}

/** Inline: code, bold, italic, links, autolink de URLs cruas, strikethrough — sobre texto JÁ escapado */
function inline(escapado: string): string {
  let r = escapado;
  r = r.replace(/`([^`]+)`/g, '<code class="md-code-inline">$1</code>');
  r = r.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  r = r.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  r = r.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  // links [texto](url) — só http(s), aspas proibidas no url
  r = r.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s"']+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  // autolink de URLs cruas — não dentro de atributos/links já gerados (precedidos por " ou >)
  r = r.replace(/(?<!["'>])(https?:\/\/[^\s"'<>]+)/g, (m) => {
    let url = m;
    let punct = "";
    const fim = /[.,;:!?)]+$/.exec(url);
    if (fim) {
      punct = fim[0];
      url = url.slice(0, url.length - punct.length);
    }
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>${punct}`;
  });
  return r;
}

/** Renderiza um trecho NÃO-code em HTML (linhas, listas, headings) */
function renderTexto(bruto: string): string {
  const esc = escapeHtml(bruto);
  const linhas = esc.split("\n");
  const saida: string[] = [];
  let lista: { tipo: "ul" | "ol"; itens: string[] } | null = null;
  let paragrafo: string[] = [];

  const fecharLista = () => {
    if (lista) {
      saida.push(`<${lista.tipo} class="md-lista">${lista.itens.map((i) => `<li>${i}</li>`).join("")}</${lista.tipo}>`);
      lista = null;
    }
  };
  const fecharParagrafo = () => {
    if (paragrafo.length) {
      saida.push(`<p class="md-p">${paragrafo.map(inline).join("<br>")}</p>`);
      paragrafo = [];
    }
  };

  for (const linhaBruta of linhas) {
    const linha = linhaBruta.trimEnd();
    const ul = /^[-*]\s+(.*)$/.exec(linha);
    const ol = /^(\d+)[.)]\s+(.*)$/.exec(linha);
    const h = /^(#{1,4})\s+(.*)$/.exec(linha);
    const bq = /^&gt;\s?(.*)$/.exec(linha);
    const hr = /^(-{3,}|\*{3,})$/.test(linha);

    if (ul) {
      fecharParagrafo();
      if (!lista || lista.tipo !== "ul") { fecharLista(); lista = { tipo: "ul", itens: [] }; }
      lista.itens.push(inline(ul[1]!));
    } else if (ol) {
      fecharParagrafo();
      if (!lista || lista.tipo !== "ol") { fecharLista(); lista = { tipo: "ol", itens: [] }; }
      lista.itens.push(inline(ol[2]!));
    } else if (h) {
      fecharParagrafo();
      fecharLista();
      const nivel = Math.min(h[1]!.length, 4);
      saida.push(`<p class="md-h md-h${nivel}">${inline(h[2]!)}</p>`);
    } else if (bq) {
      fecharParagrafo();
      fecharLista();
      saida.push(`<blockquote class="md-quote">${inline(bq[1]!)}</blockquote>`);
    } else if (hr) {
      fecharParagrafo();
      fecharLista();
      saida.push('<hr class="md-hr"/>');
    } else if (linha.trim() === "") {
      fecharParagrafo();
      fecharLista();
    } else {
      fecharLista();
      paragrafo.push(linha);
    }
  }
  fecharParagrafo();
  fecharLista();
  return saida.join("");
}

/** Renderiza markdown completo para HTML seguro */
export function renderMarkdown(texto: string): string {
  garantirCopyGlobal();
  if (!texto) return "";
  const blocos = separarFences(texto);
  return blocos.map((b) => {
    if (b.tipo === "html") return renderTexto(b.conteudo);
    // separarFences já removeu a linha de linguagem; conteúdo cru vai para <pre><code> escapado
    return `
      <div class="md-code">
        <button class="md-copy" onclick="window.__mdCopy(this)" aria-label="Copiar código">copy</button>
        <pre><code>${escapeHtml(b.conteudo.replace(/\n$/, ""))}</code></pre>
      </div>`;
  }).join("");
}
