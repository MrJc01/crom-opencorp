import { escapeHtml } from "../format";

function inline(texto: string): string {
  let r = escapeHtml(texto);
  // code inline
  r = r.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 font-mono text-[11px] text-emerald-300 font-medium">$1</code>');
  // bold
  r = r.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold text-zinc-100">$1</strong>');
  // italic
  r = r.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em class="italic text-zinc-300">$2</em>');
  // strikethrough
  r = r.replace(/~~([^~]+)~~/g, '<del class="line-through text-zinc-500">$1</del>');
  // links [texto](url)
  r = r.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s"']+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-emerald-400 hover:text-emerald-300 underline underline-offset-4 decoration-emerald-500/40 hover:decoration-emerald-400 transition-colors font-medium">$1</a>');
  // autolinks
  r = r.replace(/(?<!["'>])(https?:\/\/[^\s"'<>]+)/g, (m) => {
    let url = m;
    let punct = "";
    const fim = /[.,;:!?)]+$/.exec(url);
    if (fim) {
      punct = fim[0];
      url = url.slice(0, url.length - punct.length);
    }
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-emerald-400 hover:text-emerald-300 underline underline-offset-4 decoration-emerald-500/40 hover:decoration-emerald-400 transition-colors font-medium">${url}</a>${punct}`;
  });
  return r;
}

interface Bloco {
  tipo: "code" | "text";
  lang?: string;
  conteudo: string;
}

function separarFences(markdown: string): Bloco[] {
  const blocos: Bloco[] = [];
  const regex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let ultimoIndice = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(markdown)) !== null) {
    if (match.index > ultimoIndice) {
      blocos.push({ tipo: "text", conteudo: markdown.slice(ultimoIndice, match.index) });
    }
    blocos.push({
      tipo: "code",
      lang: match[1]?.trim() || "",
      conteudo: match[2] || "",
    });
    ultimoIndice = regex.lastIndex;
  }

  if (ultimoIndice < markdown.length) {
    blocos.push({ tipo: "text", conteudo: markdown.slice(ultimoIndice) });
  }

  return blocos;
}

function renderTabela(linhas: string[]): string {
  if (linhas.length < 2) return "";
  const headerCells = linhas[0].split("|").slice(1, -1).map(c => c.trim());
  const separator = linhas[1].split("|").slice(1, -1).map(c => c.trim());
  if (!separator.every(s => /^:?-+:?$/.test(s))) return "";

  const thead = `<thead class="bg-zinc-900/90 text-zinc-100 font-semibold border-b border-zinc-800"><tr>${headerCells.map(c => `<th class="px-4 py-3 text-xs uppercase tracking-wider font-semibold">${inline(c)}</th>`).join("")}</tr></thead>`;

  const bodyRows = linhas.slice(2).map((linha, idx) => {
    const cells = linha.split("|").slice(1, -1).map(c => c.trim());
    const bgRow = idx % 2 === 0 ? "bg-zinc-950/40" : "bg-zinc-900/20";
    return `<tr class="${bgRow} hover:bg-zinc-800/40 transition-colors">${cells.map(c => `<td class="px-4 py-3 text-xs sm:text-sm text-zinc-300 border-t border-zinc-800/60 leading-relaxed">${inline(c)}</td>`).join("")}</tr>`;
  }).join("");

  return `<div class="my-6 overflow-x-auto rounded-xl border border-zinc-800/90 bg-zinc-950/60 shadow-lg shadow-black/40"><table class="w-full text-left text-xs sm:text-sm border-collapse min-w-[32rem]">${thead}<tbody>${bodyRows}</tbody></table></div>`;
}

function renderCallout(tipo: string, linhas: string[]): string {
  const configs: Record<string, { titulo: string; borda: string; fundo: string; badge: string; texto: string }> = {
    NOTE: { titulo: "Nota", borda: "border-sky-500/40", fundo: "bg-sky-950/20", badge: "bg-sky-950/80 text-sky-400 border-sky-800/70", texto: "text-sky-200" },
    TIP: { titulo: "Dica", borda: "border-emerald-500/40", fundo: "bg-emerald-950/20", badge: "bg-emerald-950/80 text-emerald-400 border-emerald-800/70", texto: "text-emerald-200" },
    IMPORTANT: { titulo: "Importante", borda: "border-purple-500/40", fundo: "bg-purple-950/20", badge: "bg-purple-950/80 text-purple-400 border-purple-800/70", texto: "text-purple-200" },
    WARNING: { titulo: "Atenção", borda: "border-amber-500/40", fundo: "bg-amber-950/20", badge: "bg-amber-950/80 text-amber-400 border-amber-800/70", texto: "text-amber-200" },
    CAUTION: { titulo: "Cuidado", borda: "border-rose-500/40", fundo: "bg-rose-950/20", badge: "bg-rose-950/80 text-rose-400 border-rose-800/70", texto: "text-rose-200" },
  };

  const cfg = configs[tipo.toUpperCase()] || configs.NOTE!;
  const corpo = linhas.map(l => inline(l)).join("<br>");

  return `<div class="my-5 p-4 sm:p-5 rounded-xl border ${cfg.borda} ${cfg.fundo} space-y-2 shadow-sm"><div class="flex items-center gap-2"><span class="text-[10px] font-mono px-2.5 py-0.5 rounded-full border ${cfg.badge} uppercase font-bold tracking-wider">${cfg.titulo}</span></div><div class="text-xs sm:text-sm ${cfg.texto} leading-relaxed pl-1">${corpo}</div></div>`;
}

function renderTexto(texto: string): string {
  const linhas = texto.split("\n");
  const saida: string[] = [];

  let i = 0;
  while (i < linhas.length) {
    const linhaBruta = linhas[i]!;
    const linha = linhaBruta.trim();

    // 1. Tabela
    if (linha.startsWith("|") && linha.endsWith("|") && i + 1 < linhas.length && linhas[i + 1]!.trim().startsWith("|")) {
      const linhasTabela: string[] = [];
      while (i < linhas.length && linhas[i]!.trim().startsWith("|") && linhas[i]!.trim().endsWith("|")) {
        linhasTabela.push(linhas[i]!.trim());
        i++;
      }
      saida.push(renderTabela(linhasTabela));
      continue;
    }

    // 2. Callout GitHub [!NOTE], [!TIP], etc. ou Blockquote
    if (linha.startsWith(">")) {
      const linhasQuote: string[] = [];
      while (i < linhas.length && linhas[i]!.trim().startsWith(">")) {
        const conteudoLinha = linhas[i]!.trim().replace(/^>\s?/, "");
        linhasQuote.push(conteudoLinha);
        i++;
      }

      const matchAlert = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i.exec(linhasQuote[0] || "");
      if (matchAlert) {
        linhasQuote.shift();
        saida.push(renderCallout(matchAlert[1]!, linhasQuote));
      } else {
        saida.push(`<blockquote class="my-4 pl-4 border-l-3 border-emerald-500/70 bg-zinc-900/40 p-3 rounded-r-xl text-xs sm:text-sm text-zinc-300 italic leading-relaxed">${linhasQuote.map(l => inline(l)).join("<br>")}</blockquote>`);
      }
      continue;
    }

    // 3. Headings
    const h = /^(#{1,4})\s+(.*)$/.exec(linha);
    if (h) {
      const nivel = h[1]!.length;
      const tit = inline(h[2]!);
      if (nivel === 1) {
        saida.push(`<h1 class="text-2xl sm:text-3xl font-extrabold text-zinc-100 tracking-tight mt-10 mb-5 pb-3 border-b border-zinc-800 flex items-center gap-2.5">${tit}</h1>`);
      } else if (nivel === 2) {
        saida.push(`<h2 class="text-lg sm:text-xl font-bold text-zinc-100 tracking-tight mt-8 mb-4 pb-2 border-b border-zinc-800/80 flex items-center gap-2">${tit}</h2>`);
      } else if (nivel === 3) {
        saida.push(`<h3 class="text-sm sm:text-base font-semibold text-emerald-400 mt-6 mb-3">${tit}</h3>`);
      } else {
        saida.push(`<h4 class="text-xs font-bold text-zinc-300 mt-5 mb-2 uppercase tracking-wider font-mono">${tit}</h4>`);
      }
      i++;
      continue;
    }

    // 4. Horizontal Rule
    if (/^(-{3,}|\*{3,})$/.test(linha)) {
      saida.push('<hr class="border-zinc-800/80 my-8" />');
      i++;
      continue;
    }

    // 5. Lista não ordenada
    if (/^[-*]\s+/.test(linha)) {
      const itens: string[] = [];
      while (i < linhas.length && /^[-*]\s+/.test(linhas[i]!.trim())) {
        itens.push(inline(linhas[i]!.trim().replace(/^[-*]\s+/, "")));
        i++;
      }
      saida.push(`<ul class="list-disc pl-6 my-4 space-y-2 text-xs sm:text-sm text-zinc-300 leading-relaxed">${itens.map(it => `<li>${it}</li>`).join("")}</ul>`);
      continue;
    }

    // 6. Lista ordenada
    if (/^\d+[.)]\s+/.test(linha)) {
      const itens: string[] = [];
      while (i < linhas.length && /^\d+[.)]\s+/.test(linhas[i]!.trim())) {
        itens.push(inline(linhas[i]!.trim().replace(/^\d+[.)]\s+/, "")));
        i++;
      }
      saida.push(`<ol class="list-decimal pl-6 my-4 space-y-2 text-xs sm:text-sm text-zinc-300 leading-relaxed">${itens.map(it => `<li>${it}</li>`).join("")}</ol>`);
      continue;
    }

    // 7. Linha em branco
    if (!linha) {
      i++;
      continue;
    }

    // 8. Parágrafo comum
    const linhasParagrafo: string[] = [];
    while (
      i < linhas.length &&
      linhas[i]!.trim() &&
      !linhas[i]!.trim().startsWith("#") &&
      !linhas[i]!.trim().startsWith(">") &&
      !linhas[i]!.trim().startsWith("|") &&
      !/^[-*]\s+/.test(linhas[i]!.trim()) &&
      !/^\d+[.)]\s+/.test(linhas[i]!.trim()) &&
      !/^(-{3,}|\*{3,})$/.test(linhas[i]!.trim())
    ) {
      linhasParagrafo.push(inline(linhas[i]!.trim()));
      i++;
    }

    if (linhasParagrafo.length > 0) {
      saida.push(`<p class="my-3.5 text-xs sm:text-sm leading-relaxed text-zinc-300/90 font-normal">${linhasParagrafo.join("<br>")}</p>`);
    }
  }

  return saida.join("");
}

export function renderDocMarkdown(markdown: string): string {
  if (!markdown) return "";
  const blocos = separarFences(markdown);

  return blocos.map((bloco) => {
    if (bloco.tipo === "text") {
      return renderTexto(bloco.conteudo);
    }

    const lang = bloco.lang ? escapeHtml(bloco.lang) : "código";
    const codigoEscapado = escapeHtml(bloco.conteudo.replace(/\n$/, ""));

    return `<div class="my-5 rounded-xl border border-zinc-800 bg-[#0d0f12] overflow-hidden group shadow-md">
      <div class="flex items-center justify-between px-4 py-2 bg-zinc-900/80 border-b border-zinc-800/80 text-[11px] font-mono text-zinc-400">
        <span class="text-zinc-400 font-semibold uppercase tracking-wider">${lang}</span>
        <button
          type="button"
          class="text-[11px] font-medium text-zinc-400 hover:text-emerald-400 !bg-transparent hover:!bg-zinc-800 px-2.5 py-1 rounded-md cursor-pointer transition-colors border border-transparent hover:border-zinc-700"
          onclick="navigator.clipboard.writeText(this.closest('.group').querySelector('code').textContent); const t = this.textContent; this.textContent='Copiado!'; setTimeout(() => this.textContent=t, 1500);"
        >
          Copiar
        </button>
      </div>
      <pre class="p-4 sm:p-5 overflow-x-auto text-xs sm:text-sm font-mono text-zinc-200 leading-relaxed scrollbar-thin selection:bg-emerald-950 selection:text-emerald-200"><code>${codigoEscapado}</code></pre>
    </div>`;
  }).join("");
}
