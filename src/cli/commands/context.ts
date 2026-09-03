import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import type { Command } from "commander";
import { WorkspaceManager } from "../../core/workspace-manager.js";
import { writeFileAtomic } from "../../utils/fs-safe.js";

const aqui = dirname(fileURLToPath(import.meta.url));
const templateSistemaPath = join(aqui, "../../../templates/contexto.template.json");

function reportar(erro: unknown): void {
  if (erro instanceof Error) {
    const exitCode = (erro as { exitCode?: number }).exitCode;
    console.error(`erro: ${erro.message}`);
    process.exitCode = exitCode ?? 1;
    return;
  }
  console.error(`erro inesperado: ${String(erro)}`);
  process.exitCode = 1;
}

async function comErros(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (erro) {
    reportar(erro);
  }
}

function wsDe(program: Command, opts: { workspace?: string }): string | undefined {
  return opts.workspace ?? (program.opts() as { workspace?: string }).workspace;
}

function carregarContexto(wsPath: string): Record<string, unknown> {
  const caminho = join(wsPath, ".opencorp", "contexto.json");
  if (!existsSync(caminho)) return {};
  try {
    return JSON.parse(readFileSync(caminho, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function salvarContexto(wsPath: string, dados: Record<string, unknown>): Promise<void> {
  const caminho = join(wsPath, ".opencorp", "contexto.json");
  await writeFileAtomic(caminho, `${JSON.stringify(dados, null, 2)}\n`);
}

export function registerContextCommand(program: Command): void {
  const manager = new WorkspaceManager();

  function workspaceAlvo(opts: { workspace?: string }) {
    return manager.resolver(wsDe(program, opts));
  }

  const contextCmd = program
    .command("context")
    .description("contexto adaptativo vivo do workspace (contexto.json e template)");

  contextCmd
    .command("get [chave]")
    .description("lê o contexto adaptativo do workspace ou uma chave específica")
    .option("--json", "exibe em formato JSON")
    .action((chave?: string, opts?: { workspace?: string; json?: boolean }) =>
      comErros(async () => {
        const ws = await workspaceAlvo(opts ?? {});
        const dados = carregarContexto(ws.path);
        if (chave) {
          const val = dados[chave];
          if (val === undefined) {
            console.log(`chave "${chave}" não definida no contexto de "${ws.id}"`);
            return;
          }
          if (typeof val === "object" || opts?.json) {
            console.log(JSON.stringify(val, null, 2));
          } else {
            console.log(String(val));
          }
          return;
        }
        console.log(JSON.stringify(dados, null, 2));
      }),
    );

  contextCmd
    .command("set <chave> <valor>")
    .description("define uma chave no contexto adaptativo (.opencorp/contexto.json)")
    .action((chave: string, valor: string, opts?: { workspace?: string }) =>
      comErros(async () => {
        const ws = await workspaceAlvo(opts ?? {});
        const dados = carregarContexto(ws.path);
        let parsed: unknown = valor;
        try {
          parsed = JSON.parse(valor);
        } catch {
          parsed = valor;
        }
        dados[chave] = parsed;
        await salvarContexto(ws.path, dados);
        console.log(`ok: chave "${chave}" atualizada no contexto de "${ws.id}"`);
      }),
    );

  contextCmd
    .command("push <campo> <item>")
    .description("adiciona um item a uma lista do contexto (ex: notas_operacionais ou regras_de_negocio)")
    .action((campo: string, item: string, opts?: { workspace?: string }) =>
      comErros(async () => {
        const ws = await workspaceAlvo(opts ?? {});
        const dados = carregarContexto(ws.path);
        if (!Array.isArray(dados[campo])) {
          dados[campo] = [];
        }
        (dados[campo] as unknown[]).push(item);
        await salvarContexto(ws.path, dados);
        console.log(`ok: item adicionado a "${campo}" no contexto de "${ws.id}"`);
      }),
    );

  contextCmd
    .command("template")
    .description("exibe o template do sistema (somente-leitura) com a documentação de cada campo")
    .action(() =>
      comErros(async () => {
        if (!existsSync(templateSistemaPath)) {
          console.error("erro: template de contexto do sistema não encontrado.");
          return;
        }
        console.log(readFileSync(templateSistemaPath, "utf8"));
      }),
    );
}
