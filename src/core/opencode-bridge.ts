import { copyFileSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import { join, basename } from "node:path";
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
    const corpoFinal = corpo.replaceAll("{{workspace}}", wsId);
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
