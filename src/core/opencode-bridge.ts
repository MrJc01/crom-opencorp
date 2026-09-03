import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, rmSync, symlinkSync, readFileSync } from "node:fs";
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

  partes.push("- Registros Corporativos: utilize sempre .opencorp/registries/ (documentos, execucoes, chats). NUNCA duplique como .opencorp/.opencorp/.");
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
