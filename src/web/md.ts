/**
 * Renderer de markdown rico para o chat — seguro por construção:
 * escapeHtml ANTES de qualquer transformação; links só http(s).
 * Suporta: tabelas GFM, diagramas/fluxogramas/gráficos Mermaid,
 * headings, negrito, itálico, inline code, code fences (com copy),
 * listas, blockquote, hr, links e quebras de linha.
 */

import { escapeHtml } from "./format.js";

/** Instala (uma vez) o global de copy dos code fences e toggle do mermaid */
export function garantirCopyGlobal(): void {
  if (typeof window === "undefined") return; // testes em node
  const g = window as unknown as Record<string, unknown>;

  if (!g.__mdCopy) {
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

  if (!g.__mdToggleMermaid) {
    g.__mdToggleMermaid = (btn: HTMLButtonElement) => {
      const parent = btn.closest(".md-mermaid-container");
      if (!parent) return;
      const svg = parent.querySelector<HTMLElement>(".md-mermaid-svg");
      const code = parent.querySelector<HTMLElement>(".md-mermaid-code");
      if (!svg || !code) return;
      const mostrandoCodigo = code.style.display !== "none";
      if (mostrandoCodigo) {
        code.style.display = "none";
        svg.style.display = "flex";
        btn.textContent = "Ver Código";
      } else {
        code.style.display = "block";
        svg.style.display = "none";
        btn.textContent = "Ver Diagrama";
      }
    };
  }
}

garantirCopyGlobal();

let mermaidIdCounter = 0;

/** Processa e renderiza todos os blocos de fluxogramas e gráficos Mermaid no DOM */
export async function processarDiagramasMermaid(container?: HTMLElement): Promise<void> {
  garantirCopyGlobal();
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const raiz = container ?? document.body;
  const elementos = raiz.querySelectorAll<HTMLElement>(".md-mermaid-container:not([data-rendered='true'])");
  if (!elementos.length) return;

  try {
    const m = (await import("mermaid")).default;
    m.initialize({
      startOnLoad: false,
      theme: "dark",
      themeVariables: {
        darkMode: true,
        background: "#09090b",
        primaryColor: "#2563eb",
        primaryTextColor: "#f4f4f5",
        primaryBorderColor: "#3b82f6",
        lineColor: "#a1a1aa",
        secondaryColor: "#1e1b4b",
        tertiaryColor: "#18181b",
      },
      securityLevel: "loose",
    });

    for (const el of Array.from(elementos)) {
      el.setAttribute("data-rendered", "true");
      const raw = el.getAttribute("data-code") || "";
      const alvoSvg = el.querySelector<HTMLElement>(".md-mermaid-svg");
      if (!alvoSvg) continue;
      const idUnico = `mermaid-svg-${Date.now()}-${++mermaidIdCounter}`;
      try {
        const { svg } = await m.render(idUnico, raw);
        alvoSvg.innerHTML = svg;
      } catch (err: any) {
        alvoSvg.innerHTML = `<div class="p-3 text-xs text-rose-300 font-mono bg-rose-950/40 rounded border border-rose-800/80">Falha ao renderizar diagrama: ${escapeHtml(err?.message ?? String(err))}</div>`;
      }
    }
  } catch (err) {
    console.error("[mermaid] erro ao inicializar renderizador:", err);
  }
}

interface Bloco {
  tipo: "code" | "html" | "mermaid";
  conteudo: string;
  linguagem?: string;
}

/** Separa code fences do resto (preserva conteúdo cru e identifica diagramas mermaid) */
function separarFences(texto: string): Bloco[] {
  const blocos: Bloco[] = [];
  const partes = texto.split(/```/);
  for (let i = 0; i < partes.length; i++) {
    if (i % 2 === 1) {
      const linhas = partes[i]!.split("\n");
      const primeiraLinha = (linhas[0] ?? "").trim().toLowerCase();
      const corpo = linhas.slice(1).join("\n");
      const conteudo = (linhas[0] !== "" || corpo ? corpo || "" : partes[i] ?? "").trim();

      const ehMermaid =
        primeiraLinha === "mermaid" ||
        primeiraLinha.startsWith("mermaid") ||
        /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|xychart-beta)\b/m.test(conteudo);

      blocos.push({
        tipo: ehMermaid ? "mermaid" : "code",
        linguagem: primeiraLinha,
        conteudo,
      });
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

function quebrarLinhaTabela(linha: string): string[] {
  let limpa = linha.trim();
  if (limpa.startsWith("|")) limpa = limpa.slice(1);
  if (limpa.endsWith("|")) limpa = limpa.slice(0, -1);
  return limpa.split("|").map((c) => c.trim());
}

function ehSeparadorTabela(linha: string): boolean {
  const pedacos = quebrarLinhaTabela(linha);
  if (pedacos.length === 0) return false;
  return pedacos.every((p) => /^:?-+:?$/.test(p));
}

function parseAlinhamento(celula: string): "left" | "center" | "right" {
  const c = celula.trim();
  const comeca = c.startsWith(":");
  const termina = c.endsWith(":");
  if (comeca && termina) return "center";
  if (termina) return "right";
  return "left";
}

interface TabelaState {
  cabecalho: string[];
  alinhamentos: Array<"left" | "center" | "right">;
  linhas: string[][];
}

function renderTabelaHtml(tabela: TabelaState): string {
  const thead = `<thead><tr>${tabela.cabecalho
    .map((h, i) => {
      const align = tabela.alinhamentos[i] || "left";
      return `<th style="text-align:${align}">${inline(h)}</th>`;
    })
    .join("")}</tr></thead>`;

  const tbody = `<tbody>${tabela.linhas
    .map((row) => {
      return `<tr>${row
        .map((cell, i) => {
          const align = tabela.alinhamentos[i] || "left";
          return `<td style="text-align:${align}">${inline(cell)}</td>`;
        })
        .join("")}</tr>`;
    })
    .join("")}</tbody>`;

  return `<div class="md-table-wrap"><table class="md-table">${thead}${tbody}</table></div>`;
}

/** Renderiza um trecho NÃO-code em HTML (linhas, tabelas, listas, headings) */
function renderTexto(bruto: string): string {
  const esc = escapeHtml(bruto);
  const linhas = esc.split("\n");
  const saida: string[] = [];
  let lista: { tipo: "ul" | "ol"; itens: string[] } | null = null;
  let paragrafo: string[] = [];
  let tabela: TabelaState | null = null;

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
  const fecharTabela = () => {
    if (tabela) {
      saida.push(renderTabelaHtml(tabela));
      tabela = null;
    }
  };

  for (let i = 0; i < linhas.length; i++) {
    const linhaBruta = linhas[i]!;
    const linha = linhaBruta.trimEnd();

    // Verificação de Tabela GFM
    if (!tabela && linha.includes("|")) {
      const prox = i + 1 < linhas.length ? linhas[i + 1]!.trim() : "";
      if (prox && ehSeparadorTabela(prox)) {
        fecharParagrafo();
        fecharLista();
        const cabecalho = quebrarLinhaTabela(linha);
        const sep = quebrarLinhaTabela(prox);
        const alinhamentos = sep.map(parseAlinhamento);
        tabela = { cabecalho, alinhamentos, linhas: [] };
        i++; // avança a linha separadora
        continue;
      }
    }

    if (tabela) {
      if (linha.includes("|") && linha.trim() !== "") {
        tabela.linhas.push(quebrarLinhaTabela(linha));
        continue;
      } else {
        fecharTabela();
      }
    }

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
  fecharTabela();
  return saida.join("");
}

/** Renderiza markdown completo para HTML seguro com suporte a tabelas e fluxogramas */
export function renderMarkdown(texto: string): string {
  garantirCopyGlobal();
  if (!texto) return "";
  const blocos = separarFences(texto);
  return blocos
    .map((b) => {
      if (b.tipo === "html") return renderTexto(b.conteudo);
      if (b.tipo === "mermaid") {
        return `
          <div class="md-mermaid-container" data-code="${escapeHtml(b.conteudo)}">
            <div class="md-mermaid-header">
              <span class="md-mermaid-title">📊 Fluxograma / Diagrama</span>
              <button type="button" class="md-mermaid-toggle" onclick="window.__mdToggleMermaid(this)">Ver Código</button>
            </div>
            <div class="md-mermaid-svg">
              <div class="text-xs text-zinc-500 font-mono flex items-center gap-1.5 py-4">
                <span class="animate-spin">⏳</span> Carregando diagrama...
              </div>
            </div>
            <pre class="md-mermaid-code" style="display:none"><code>${escapeHtml(b.conteudo)}</code></pre>
          </div>`;
      }
      // code block padrão
      return `
        <div class="md-code">
          <button type="button" class="md-copy" onclick="window.__mdCopy(this)" aria-label="Copiar código">copy</button>
          <pre><code>${escapeHtml(b.conteudo.replace(/\n$/, ""))}</code></pre>
        </div>`;
    })
    .join("");
}
