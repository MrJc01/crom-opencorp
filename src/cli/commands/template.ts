import type { Command } from "commander";
import { TemplateStore } from "../../core/template-store.js";
import { WorkspaceManager } from "../../core/workspace-manager.js";

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

export function registerTemplateCommand(program: Command): void {
  const manager = new WorkspaceManager();
  const store = new TemplateStore();

  const template = program.command("template").description("templates de workspace (.corp)");

  template
    .command("list")
    .description("lista templates (default do projeto + seus pacotes em ~/.opencorp/templates)")
    .action(() =>
      comErros(async () => {
        const lista = await store.listar();
        for (const t of lista) {
          console.log(`${t.id.padEnd(20)} ${t.tipo.padEnd(18)} ${t.descricao}`);
        }
      }),
    );

  template
    .command("create")
    .argument("<id>", "id do novo template (kebab-case)")
    .description("cria um template vazio editável em ~/.opencorp/templates/<id>")
    .action((id: string) =>
      comErros(async () => {
        const dir = await store.criar(id);
        console.log(`ok: template "${id}" criado em ${dir}`);
        console.log("edite template.json, agents/, registries/, config.json e security_policy.json");
      }),
    );

  template
    .command("export")
    .argument("<ws>", "workspace a exportar")
    .option("-o, --output <destino>", "arquivo .corp (tar.gz) ou pasta; padrão: instala em ~/.opencorp/templates/<ws>")
    .description("exporta um workspace vivo para template (nunca inclui segredos)")
    .action((wsRef: string, opts: { output?: string }) =>
      comErros(async () => {
        const alvo = await manager.resolver(wsRef);
        const r = await store.exportar(alvo.path, alvo.id, opts.output);
        console.log(`ok: template exportado para ${r.destino}`);
        console.log(
          `ok: ${r.excluidos.length} item(ns) excluído(s) por padrão de segredo (*secret*, *key*, .env*)`,
        );
        for (const item of r.excluidos) {
          console.log(`  excluído: ${item}`);
        }
      }),
    );

  template
    .command("import")
    .argument("<fonte>", "pasta | arquivo.corp | url git https")
    .option("--as <id>", "id do template importado")
    .description("importa um template (pasta, .corp tar.gz ou url git)")
    .action((fonte: string, opts: { as?: string }) =>
      comErros(async () => {
        const r = await store.importar(fonte, opts.as);
        console.log(`ok: template "${r.id}" importado em ${r.dir}`);
        console.log(`use em um novo workspace: opencorp workspace create <id> --template ${r.id}`);
      }),
    );
}
