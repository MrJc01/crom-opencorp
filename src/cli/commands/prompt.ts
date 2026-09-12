import { readFile } from "node:fs/promises";
import type { Command } from "commander";
import { WorkspaceManager } from "../../core/workspace-manager.js";
import { PromptStore } from "../../core/prompt-store.js";

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

export function registerPromptCommand(program: Command): void {
  const manager = new WorkspaceManager();
  const store = new PromptStore();

  function wsDe(opts: { workspace?: string }): string | undefined {
    return opts.workspace ?? (program.opts() as { workspace?: string }).workspace;
  }

  const prompt = program
    .command("prompt")
    .description("gerencia prompts reutilizáveis (.opencorp/prompts.json com {{vars}})");

  prompt
    .command("listar")
    .option("--json", "saída em formato JSON")
    .description("lista as chaves de prompt do workspace")
    .action((opts: { json?: boolean; workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        const lista = await store.listar(ws.path);
        if (opts.json) {
          console.log(JSON.stringify(lista, null, 2));
          return;
        }
        if (lista.length === 0) {
          console.log(`nenhum prompt em ${store.caminho(ws.path)}`);
          return;
        }
        for (const p of lista) {
          console.log(`- ${p.chave}: ${p.texto}`);
        }
      }),
    );

  prompt
    .command("mostrar")
    .argument("<chave>", "chave do prompt")
    .option("--json", "saída em formato JSON")
    .description("mostra o texto de um prompt")
    .action((chave: string, opts: { json?: boolean; workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        const texto = await store.get(ws.path, chave);
        if (opts.json) {
          console.log(JSON.stringify({ chave, texto }, null, 2));
          return;
        }
        console.log(texto);
      }),
    );

  prompt
    .command("set")
    .argument("<chave>", "chave do prompt")
    .argument("[texto]", "texto do prompt (aceita {{vars}}); use --file para ler de um arquivo")
    .option("--file <arquivo>", "lê o texto de um arquivo")
    .description("define (cria ou sobrescreve) um prompt no workspace")
    .action((chave: string, texto: string | undefined, opts: { file?: string; workspace?: string }) =>
      comErros(async () => {
        if (!opts.file && (texto === undefined || texto.length === 0)) {
          throw new Error(`informe o texto do prompt ou use --file <arquivo> para "prompt set ${chave}"`);
        }
        const conteudo = opts.file ? (await readFile(opts.file, "utf8")).trim() : texto!;
        const ws = await manager.resolver(wsDe(opts));
        await store.set(ws.path, chave, conteudo);
        console.log(`ok: prompt "${chave}" salvo em ${store.caminho(ws.path)}`);
      }),
    );

  prompt
    .command("remover")
    .argument("<chave>", "chave do prompt")
    .description("remove um prompt do workspace")
    .action((chave: string, opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        await store.remover(ws.path, chave);
        console.log(`ok: prompt "${chave}" removido`);
      }),
    );
}
