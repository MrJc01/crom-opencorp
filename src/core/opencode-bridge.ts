import { copyFileSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
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
  if (agente.permissions === "level-1") {
    return { edit, bash: "deny", webfetch: "deny" };
  }
  if (agente.permissions === "level-2") {
    return { edit, bash: "allow", webfetch: "deny" };
  }
  return { edit, bash: "allow", webfetch: "allow" };
}

function yamlString(valor: string): string {
  return `"${valor.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
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
  return `${linhas.join("\n")}\n${corpo.trimEnd()}\n`;
}

export class OpenCodeBridge {
  async sincronizarAgente(wsPath: string, agente: Agente, corpo: string): Promise<string> {
    const dir = join(wsPath, ".opencorp", "opencode", "agent");
    const destino = join(dir, `${agente.id}.md`);
    await writeFileAtomic(destino, gerarAgenteOpencode(agente, corpo));
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
