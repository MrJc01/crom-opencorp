import type { Command } from "commander";
import { AppStore } from "../../core/app-store.js";
import { WorkspaceManager } from "../../core/workspace-manager.js";

function reportar(erro: unknown): void {
  if (erro instanceof Error) {
    console.error(`erro: ${erro.message}`);
    process.exitCode = 1;
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

export function registerAppCommand(program: Command): void {
  const store = new AppStore();
  const manager = new WorkspaceManager();

  function wsDe(opts: { workspace?: string }): string | undefined {
    return opts.workspace ?? (program.opts() as { workspace?: string }).workspace;
  }

  const app = program
    .command("app")
    .description(
      "mini-apps internas: specs declarativos JSON em <ws>/.opencorp/apps/ renderizados pelo servidor web em /#/app/<id> — widgets consultam rotas da API (tabela, kanban, métrica, gráfico, formulário)",
    );

  app
    .command("create")
    .argument("<id>", "id do app (kebab-case)")
    .requiredOption("--titulo <titulo>", "título do app")
    .description("cria um app vazio (edite o spec para adicionar widgets)")
    .action((id: string, opts: { titulo: string; workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        const a = await store.criar(ws.path, id, opts.titulo);
        console.log(`ok: app "${a.id}" criado — edite ${store.caminho(ws.path, a.id)}`);
        console.log(`    renderize com: opencorp web → /#/app/${a.id}`);
      }),
    );

  app
    .command("list")
    .description("lista os apps do workspace")
    .action((opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        const lista = store.listar(ws.path);
        if (lista.length === 0) {
          console.log('nenhum app — crie com: opencorp app create <id> --titulo "..." ou use "opencorp app seed painel-tarefas"');
          return;
        }
        for (const a of lista) console.log(`${a.id.padEnd(20)}${String(a.widgets).padEnd(4)}${a.titulo}`);
      }),
    );

  app
    .command("show")
    .argument("<id>", "id do app")
    .description("mostra o spec do app")
    .action((id: string, opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        console.log(JSON.stringify(store.obter(ws.path, id), null, 2));
      }),
    );

  app
    .command("validate")
    .argument("<id>", "id do app")
    .description("valida o spec do app")
    .action((id: string, opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        store.obter(ws.path, id);
        console.log(`ok: spec "${id}" válido`);
      }),
    );

  app
    .command("delete")
    .argument("<id>", "id do app")
    .description("exclui o app")
    .action((id: string, opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        await store.excluir(ws.path, id);
        console.log(`ok: ${id} excluído`);
      }),
    );

  app
    .command("seed")
    .argument("<modelo>", "painel-tarefas | custos")
    .description("instala um app de exemplo no workspace")
    .action((modelo: string, opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        const seeds = store.seeds();
        const def = seeds[modelo];
        if (!def) {
          console.error(`erro: seed "${modelo}" não existe — opções: ${Object.keys(seeds).join(", ")}`);
          process.exitCode = 1;
          return;
        }
        await store.salvar(ws.path, def);
        console.log(`ok: app "${modelo}" instalado — /#/app/${modelo}`);
      }),
    );
}
