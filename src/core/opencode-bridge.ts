import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, rmSync, symlinkSync, readFileSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import Database from "better-sqlite3";
import type { Agente } from "../schemas/agent.js";
import { writeFileAtomic } from "../utils/fs-safe.js";

const TOOLS_OPENCODE = [
  "bash",
  "edit",
  "write",
  "read",
  "grep",
  "glob",
  "list",
  "patch",
  "todowrite",
  "todoread",
  "webfetch",
  "task",
  "doom_loop",
] as const;

function permissoesParaOpencode(agente: Agente): Record<string, string> {
  const editaArquivos = agente.tools.includes("write") || agente.tools.includes("edit");
  const edit = editaArquivos ? "allow" : "deny";
  // external_directory precisa ser allow para o secretário ler ~/.opencorp (home isolado)
  if (agente.permissions === "level-1") {
    return { edit, bash: "deny", webfetch: "deny", external_directory: "allow" };
  }
  if (agente.permissions === "level-2") {
    return { edit, bash: "allow", webfetch: "deny", external_directory: "allow" };
  }
  return { edit, bash: "allow", webfetch: "allow", external_directory: "allow" };
}

function yamlString(valor: string): string {
  return `"${valor.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Guidance da tool `notificar` (Etapa 7 / P-24) — injetado no system prompt de
 *  TODOS os agentes: o corpo do agente vira o prompt do arquivo
 *  `.opencorp/opencode/agent/<id>.md` que o opencode carrega. */
const GUIDANCE_NOTIFICAR =
  "Ao finalizar uma execução relevante, chame a tool notificar com um resumo do que foi feito (titulo ≤80 chars, corpo ≤500 chars) para o painel mostrar ao usuário.";

function detectarSiteWorkspace(wsPath: string, wsId: string): string | null {
  try {
    const configPath = join(wsPath, ".opencorp", "config.json");
    if (existsSync(configPath)) {
      const cfg = JSON.parse(readFileSync(configPath, "utf8"));
      if (cfg.site_url) return String(cfg.site_url);
      if (cfg.url) return String(cfg.url);
    }
  } catch {}

  try {
    const scriptsDir = join(wsPath, "scripts");
    if (existsSync(scriptsDir)) {
      for (const arq of readdirSync(scriptsDir)) {
        if (arq.endsWith(".py") || arq.endsWith(".cjs") || arq.endsWith(".js") || arq.endsWith(".sh")) {
          const conteudo = readFileSync(join(scriptsDir, arq), "utf8").slice(0, 4000);
          const match = /https?:\/\/[a-zA-Z0-9.-]+\.(?:wp\.crom\.me|crom\.me|com\.br|com|org)[^\s"'\`)]*/.exec(conteudo);
          if (match) {
            try {
              const u = new URL(match[0]);
              return `${u.protocol}//${u.host}/`;
            } catch {}
          }
        }
      }
    }
  } catch {}

  if (wsId && wsId !== "default" && !wsId.includes(".") && !wsId.includes("corp-teste")) {
    return `https://${wsId}.wp.crom.me/`;
  }
  return null;
}

function obterTarefasAtivasResumo(wsPath: string): string[] {
  try {
    const dbPath = join(wsPath, ".opencorp", "tasks.db");
    if (existsSync(dbPath)) {
      const db = new Database(dbPath, { readonly: true });
      const rows = db
        .prepare("SELECT id, titulo, coluna, responsavel FROM tasks WHERE coluna != 'feito' ORDER BY pos ASC LIMIT 5")
        .all() as Array<{ id: string; titulo: string; coluna: string; responsavel: string }>;
      db.close();
      return rows.map((r) => `- [${r.coluna.toUpperCase()}] ${r.id}: ${r.titulo} (responsável: @${r.responsavel || "não atribuído"})`);
    }
  } catch {}
  return [];
}

/**
 * CTX-02: Baseado em agent.memory.reads (ou 'documentos'), busca o documento mais
 * recentemente modificado ou criado no workspace e injeta uma prévia de entrada.
 */
export function obterUltimoDocumentoRelevante(wsPath: string, agente: Agente): string | null {
  try {
    const categorias = (agente.memory?.reads && agente.memory.reads.length > 0)
      ? agente.memory.reads
      : ["documentos"];

    let melhorArquivo: { name: string; path: string; relPath: string; cat: string; mtime: number } | null = null;

    for (const cat of categorias) {
      const catDir = join(wsPath, ".opencorp", "registries", cat);
      if (!existsSync(catDir)) continue;

      const entries = readdirSync(catDir, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isFile() || ent.name.startsWith(".")) continue;
        if (!ent.name.endsWith(".md") && !ent.name.endsWith(".json")) continue;
        const fullPath = join(catDir, ent.name);
        try {
          const st = statSync(fullPath);
          const deveSubstituir = !melhorArquivo ||
            st.mtimeMs > melhorArquivo.mtime ||
            (st.mtimeMs === melhorArquivo.mtime && ent.name.localeCompare(melhorArquivo.name) > 0);

          if (deveSubstituir) {
            melhorArquivo = {
              name: ent.name,
              path: fullPath,
              relPath: `.opencorp/registries/${cat}/${ent.name}`,
              cat,
              mtime: st.mtimeMs,
            };
          }
        } catch {}
      }
    }

    if (!melhorArquivo) return null;

    const conteudoBruto = readFileSync(melhorArquivo.path, "utf8");
    const previa = conteudoBruto.length > 1500
      ? conteudoBruto.slice(0, 1500) + "\n... [conteúdo truncado para contexto inicial]"
      : conteudoBruto;

    return `\n## Documento Recente Relevante (${melhorArquivo.cat})\n> Arquivo: ${melhorArquivo.relPath}\n\`\`\`markdown\n${previa.trim()}\n\`\`\``;
  } catch {
    return null;
  }
}

/**
 * CTX-03: Injeta catálogo compacto de ferramentas e scripts do workspace
 * eliminando a necessidade de o agente rodar comandos exploratórios no turno 1.
 */
export function obterCatalogoFerramentasEScripts(wsPath: string): string | null {
  const itens: string[] = [];

  try {
    const scriptsDir = join(wsPath, "scripts");
    if (existsSync(scriptsDir)) {
      const arquivos = readdirSync(scriptsDir, { withFileTypes: true });
      for (const arq of arquivos) {
        if (!arq.isFile() || arq.name.startsWith(".") || arq.name.endsWith(".db")) continue;
        const fullPath = join(scriptsDir, arq.name);
        let descricao = "";
        try {
          const trecho = readFileSync(fullPath, "utf8").slice(0, 500);
          const linhas = trecho.split("\n");
          for (const l of linhas) {
            const limpa = l.trim();
            if (limpa.startsWith("#") || limpa.startsWith("//") || limpa.startsWith("*")) {
              const semComentario = limpa.replace(/^([#/\\*]+)\s*/, "").trim();
              if (semComentario && !semComentario.startsWith("!") && !semComentario.startsWith("@") && semComentario.length > 5) {
                descricao = semComentario;
                break;
              }
            }
          }
        } catch {}

        let comando = `scripts/${arq.name}`;
        if (arq.name.endsWith(".js") || arq.name.endsWith(".cjs") || arq.name.endsWith(".mjs")) {
          comando = `node scripts/${arq.name}`;
        } else if (arq.name.endsWith(".py")) {
          comando = `python3 scripts/${arq.name}`;
        } else if (arq.name.endsWith(".sh")) {
          comando = `bash scripts/${arq.name}`;
        }
        itens.push(`- \`${comando}\`${descricao ? `: ${descricao}` : ""}`);
      }
    }
  } catch {}

  try {
    const caminhosDocs = [
      join(wsPath, "FERRAMENTAS.md"),
      join(wsPath, "docs", "FERRAMENTAS.md"),
      join(wsPath, ".opencorp", "FERRAMENTAS.md"),
    ];
    for (const doc of caminhosDocs) {
      if (existsSync(doc)) {
        const conteudo = readFileSync(doc, "utf8").slice(0, 1000);
        itens.push(`\n### Resumo de FERRAMENTAS.md:\n${conteudo.trim()}`);
        break;
      }
    }
  } catch {}

  if (itens.length === 0) return null;
  return `\n## Ferramentas e Scripts do Workspace\n${itens.join("\n")}`;
}

function obterContextoAdaptativo(wsPath: string, wsId: string, agente: Agente): string {
  const partes: string[] = [
    "\n## Contexto Operacional Primário (OpenCorp)",
    `- Agente Ativo: ${agente.id} (${agente.role} - categoria ${agente.category})`,
    `- Workspace ID: ${wsId}`,
    `- Diretório Raiz: ${wsPath}`,
    "- Linha de Comando Oficial: 'opencorp' e o atalho 'oc' (ex: 'opencorp status' ou 'oc status'; 'opencorp task' ou 'oc task'). Ambos estão disponíveis no terminal.",
  ];

  const siteUrl = detectarSiteWorkspace(wsPath, wsId);
  if (siteUrl) {
    partes.push(`- Site Principal do Workspace: ${siteUrl}`);
    partes.push(`- WordPress REST API Base: ${siteUrl.replace(/\/+$/, "")}/wp-json/wp/v2/`);
  }

  try {
    const sandboxDir = join(wsPath, "sandbox");
    if (existsSync(sandboxDir)) {
      const pastas = readdirSync(sandboxDir).filter((f) => !f.startsWith("."));
      if (pastas.length > 0) {
        partes.push(`- Sandbox / Testes de Layout: sandbox/ (contém: ${pastas.slice(0, 6).join(", ")})`);
      }
    }
  } catch {}

  try {
    const scriptsDir = join(wsPath, "scripts");
    if (existsSync(scriptsDir)) {
      const scripts = readdirSync(scriptsDir).filter((f) => !f.startsWith("."));
      if (scripts.length > 0) {
        partes.push(`- Scripts Executáveis: ${scripts.map((s) => `scripts/${s}`).join(", ")}`);
      }
    }
  } catch {}

  try {
    const docsDir = join(wsPath, ".opencorp", "registries", "documentos");
    if (existsSync(docsDir)) {
      const arquivos = readdirSync(docsDir)
        .filter((f) => f.endsWith(".md"))
        .sort()
        .reverse()
        .slice(0, 5);
      if (arquivos.length > 0) {
        partes.push(`- Documentos e SOPs Recentes: ${arquivos.join(", ")}`);
      }
    }
  } catch {}

  try {
    const teamsDir = join(wsPath, ".opencorp", "teams");
    if (existsSync(teamsDir)) {
      const arquivos = readdirSync(teamsDir).filter((f) => f.endsWith(".json"));
      if (arquivos.length > 0) {
        partes.push(`- Grupos Multi-Agente: ${arquivos.map((f) => f.replace(/\.json$/, "")).join(", ")} (executáveis via opencorp team run <id>)`);
      }
    }
  } catch {}

  const tarefas = obterTarefasAtivasResumo(wsPath);
  if (tarefas.length > 0) {
    partes.push("- Tarefas Ativas no Kanban:");
    for (const t of tarefas) {
      partes.push(`  ${t}`);
    }
  }

  // Perfil da Empresa (projeto.json) — diretrizes centrais de qualquer empresa/workspace
  try {
    const projetoPath = join(wsPath, ".opencorp", "projeto.json");
    if (existsSync(projetoPath)) {
      const p = JSON.parse(readFileSync(projetoPath, "utf8"));
      partes.push("\n## Perfil do Negócio / Empresa (projeto.json)");
      if (p.empresa) partes.push(`- Empresa: ${p.empresa}`);
      if (p.nicho) partes.push(`- Nicho: ${p.nicho}`);
      if (p.publico) partes.push(`- Público-Alvo: ${p.publico}`);
      if (p.tom) partes.push(`- Tom de Comunicação: ${p.tom}`);
      if (Array.isArray(p.topicos_editoriais) && p.topicos_editoriais.length > 0) {
        partes.push(`- Tópicos Principais: ${p.topicos_editoriais.join(", ")}`);
      }
      if (Array.isArray(p.tom_evitar) && p.tom_evitar.length > 0) {
        partes.push(`- Diretrizes / Evitar: ${p.tom_evitar.join(", ")}`);
      }
    }
  } catch {}

  // Contexto Adaptativo Mutável (contexto.json) — aprendizados vivos do workspace
  try {
    const contextoPath = join(wsPath, ".opencorp", "contexto.json");
    if (existsSync(contextoPath)) {
      const c = JSON.parse(readFileSync(contextoPath, "utf8"));
      partes.push("\n## Contexto Adaptativo do Workspace (contexto.json)");
      if (c.descricao_curta) partes.push(`- Descrição: ${c.descricao_curta}`);
      if (c.tom_de_voz) partes.push(`- Tom de Voz: ${c.tom_de_voz}`);
      if (Array.isArray(c.regras_de_negocio) && c.regras_de_negocio.length > 0) {
        partes.push("- Regras de Negócio Inegociáveis:");
        for (const r of c.regras_de_negocio) partes.push(`  * ${r}`);
      }
      if (Array.isArray(c.notas_operacionais) && c.notas_operacionais.length > 0) {
        partes.push("- Notas Operacionais & Aprendizados:");
        for (const n of c.notas_operacionais) partes.push(`  * ${n}`);
      }
      if (c.glossario && typeof c.glossario === "object") {
        const termos = Object.entries(c.glossario).map(([k, v]) => `${k}: ${v}`);
        if (termos.length > 0) partes.push(`- Glossário Interno: ${termos.slice(0, 8).join(" | ")}`);
      }
    }
  } catch {}

  partes.push("- Registros Corporativos: utilize sempre .opencorp/registries/ (documentos, execucoes, chats). NUNCA duplique como .opencorp/.opencorp/.");

  // Ferramentas & Scripts do Workspace (CTX-03)
  const catalogoFerramentas = obterCatalogoFerramentasEScripts(wsPath);
  if (catalogoFerramentas) {
    partes.push(catalogoFerramentas);
  }

  // Último Documento Relevante de Entrada (CTX-02)
  const ultimoDoc = obterUltimoDocumentoRelevante(wsPath, agente);
  if (ultimoDoc) {
    partes.push(ultimoDoc);
  }

  return partes.join("\n") + "\n";
}

export function gerarAgenteOpencode(agente: Agente, corpo: string): string {
  const linhas: string[] = ["---"];
  const description = `${agente.role} (agente opencorp "${agente.id}", categoria ${agente.category})`;
  linhas.push(`description: ${yamlString(description)}`);
  linhas.push("mode: all");
  linhas.push(`model: ${yamlString(agente.model)}`);
  linhas.push("tools:");
  for (const tool of TOOLS_OPENCODE) {
    linhas.push(`  ${tool}: ${agente.tools.includes(tool) ? "true" : "false"}`);
  }
  linhas.push("permission:");
  for (const [chave, valor] of Object.entries(permissoesParaOpencode(agente))) {
    linhas.push(`  ${chave}: ${valor}`);
  }
  linhas.push("---", "");
  return `${linhas.join("\n")}\n${corpo.trimEnd()}\n\n${GUIDANCE_NOTIFICAR}\n`;
}

export class OpenCodeBridge {
  async sincronizarAgente(wsPath: string, agente: Agente, corpo: string): Promise<string> {
    const dir = join(wsPath, ".opencorp", "opencode", "agent");
    const destino = join(dir, `${agente.id}.md`);
    // Substitui {{workspace}} pelo id real (basename do wsPath) — prompts de
    // template citam o workspace; sem isto o agente recebe o literal.
    const wsId = basename(wsPath);
    const priming = obterContextoAdaptativo(wsPath, wsId, agente);
    const corpoFinal = corpo.replaceAll("{{workspace}}", wsId) + "\n" + priming;
    await writeFileAtomic(destino, gerarAgenteOpencode(agente, corpoFinal));
    this.vincular(wsPath, agente.id, destino);
    return destino;
  }

  private vincular(wsPath: string, id: string, arquivoFonte: string): void {
    const alvo = join(wsPath, ".opencode");
    const origemRelativa = join(".opencorp", "opencode");
    let estado: "ausente" | "link-ok" | "link-outro" | "dir" = "ausente";
    try {
      const st = lstatSync(alvo);
      if (st.isSymbolicLink()) {
        estado = readlinkSync(alvo) === origemRelativa ? "link-ok" : "link-outro";
      } else if (st.isDirectory()) {
        estado = "dir";
      }
    } catch {
      estado = "ausente";
    }
    if (estado === "link-ok") return;
    if (estado === "dir") {
      this.copiar(alvo, arquivoFonte, id);
      return;
    }
    try {
      if (estado === "link-outro") rmSync(alvo);
      symlinkSync(origemRelativa, alvo, "dir");
    } catch {
      this.copiar(alvo, arquivoFonte, id);
    }
  }

  private copiar(dirOpencode: string, arquivoFonte: string, id: string): void {
    mkdirSync(join(dirOpencode, "agent"), { recursive: true });
    copyFileSync(arquivoFonte, join(dirOpencode, "agent", `${id}.md`));
  }
}
