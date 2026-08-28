import type { Command } from "commander";
import { SubcorpStore } from "../../core/subcorp-store.js";
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

function wsDe(program: Command, opts: { workspace?: string }): string | undefined {
  return opts.workspace ?? (program.opts() as { workspace?: string }).workspace;
}

async function comErros(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (erro) {
    reportar(erro);
  }
}

export function registerSubcorpCommand(program: Command): void {
  const manager = new WorkspaceManager();
  const store = new SubcorpStore();

  function wsPai(opts: { workspace?: string }) {
    return manager.resolver(wsDe(program, opts));
  }

  const subcorp = program.command("subcorp").description("workspaces filhos delegáveis");

  subcorp
    .command("add")
    .argument("<fonte>", "caminho do workspace filho (ou template id instanciado)")
    .requiredOption("--as <id>", "id do subcorp no pai")
    .option("--perm <nivel>", "read | ask | write", "read")
    .description("importa um subcorp com permissões limitadas (grava no config.json do pai)")
    .action((fonte: string, opts: { as: string; perm?: string; workspace?: string }) =>
      comErros(async () => {
        const pai = await wsPai(opts);
        const entrada = await store.adicionar(pai.path, {
          fonte,
          id: opts.as,
          perm: (opts.perm ?? "read") as "read" | "ask" | "write",
        });
        console.log(`ok: subcorp "${entrada.id}" adicionado (${entrada.source})`);
        console.log(`ok: perm "${entrada.permissions}" · agentes expostos: ${entrada.exposed_agents.join(", ") || "nenhum"}`);
        if (entrada.permissions === "write") {
          console.log('aviso: write cross-corp chega na etapa 7 — a flag foi aceita e registrada');
        }
        console.log(`invocar: opencorp agent run ${entrada.id}/<agente> "<ordem>"`);
      }),
    );

  subcorp
    .command("list")
    .description("lista os subcorps do workspace ativo")
    .action((opts: { workspace?: string }) =>
      comErros(async () => {
        const pai = await wsPai(opts);
        const entradas = await store.listar(pai.path);
        if (entradas.length === 0) {
          console.log('nenhum subcorp — adicione com: opencorp subcorp add <caminho> --as <id>');
          return;
        }
        console.log("id            perm   agentes  registries  fonte");
        for (const e of entradas) {
          console.log(
            `${e.id.padEnd(14)}${e.permissions.padEnd(7)}${String(e.exposed_agents.length).padEnd(9)}${String(e.exposed_registries.length).padEnd(12)}${e.source}`,
          );
        }
      }),
    );

  subcorp
    .command("remove")
    .argument("<id>", "id do subcorp")
    .description("remove apenas a referência no pai (nunca apaga o subcorp em si)")
    .action((id: string, opts: { workspace?: string }) =>
      comErros(async () => {
        const pai = await wsPai(opts);
        const entrada = await store.remover(pai.path, id);
        console.log(`ok: referência "${id}" removida (pasta do subcorp preservada: ${entrada.source})`);
      }),
    );
}
