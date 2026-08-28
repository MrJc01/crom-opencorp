import type { Command } from "commander";
import { SettingsError } from "../../core/settings-store.js";
import { WorkspaceError, WorkspaceManager } from "../../core/workspace-manager.js";
import { notImplementedAction } from "../placeholder.js";

async function comErros(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (erro) {
    if (erro instanceof WorkspaceError) {
      console.error(`erro: ${erro.message}`);
      process.exitCode = erro.exitCode;
      return;
    }
    if (erro instanceof SettingsError) {
      console.error(`erro: ${erro.message}`);
      process.exitCode = erro.exitCode;
      return;
    }
    console.error(`erro inesperado: ${erro instanceof Error ? erro.message : String(erro)}`);
    process.exitCode = 1;
  }
}

export function registerAgentCommand(program: Command): void {
  const manager = new WorkspaceManager();

  const agent = program.command("agent").description("CRUD e execução de agentes");

  agent
    .command("create")
    .argument("<id>", "id do agente (kebab-case)")
    .option("--from <agente>", "clona a estrutura de outro agente")
    .option("--model <provider/model>", "modelo padrão do agente")
    .description("cria um agente (.md com frontmatter)")
    .action(notImplementedAction("opencorp agent create"));
  agent
    .command("list")
    .option("--categoria <categoria>", "ceo | secretario | operario | custom")
    .description("lista os agentes do workspace ativo")
    .action((opts: { categoria?: string; workspace?: string }) =>
      comErros(async () => {
        const alvo = await manager.resolver(opts.workspace);
        let agentes = await manager.listarAgentes(alvo.id);
        if (opts.categoria) {
          agentes = agentes.filter((a) => a.category === opts.categoria);
        }
        if (agentes.length === 0) {
          console.log(
            `nenhum agente em ${alvo.path}/.opencorp/agents (workspace: "${alvo.id}")`,
          );
          return;
        }
        const wId = Math.max(...agentes.map((a) => a.id.length), 2);
        const wCat = Math.max(...agentes.map((a) => (a.category ?? "-").length), 9);
        const wModel = Math.max(...agentes.map((a) => (a.model ?? "-").length), 6);
        console.log(
          `id${" ".repeat(wId - 2)}  categoria${" ".repeat(wCat - 9)}  modelo${" ".repeat(wModel - 6)}  permissões`,
        );
        for (const a of agentes) {
          const cat = a.category ?? "-";
          const model = a.model ?? "-";
          console.log(
            `${a.id}${" ".repeat(wId - a.id.length)}  ${cat}${" ".repeat(wCat - cat.length)}  ${model}${" ".repeat(wModel - model.length)}  ${a.permissions ?? "-"}`,
          );
        }
      }),
    );
  agent
    .command("show")
    .argument("<id>", "id do agente")
    .description("mostra a definição do agente")
    .action(notImplementedAction("opencorp agent show"));
  agent
    .command("edit")
    .argument("<id>", "id do agente")
    .description("abre $EDITOR no .md do agente")
    .action(notImplementedAction("opencorp agent edit"));
  agent
    .command("clone")
    .argument("<origem>", "agente de origem")
    .argument("<destino>", "id do novo agente")
    .description("clona um agente")
    .action(notImplementedAction("opencorp agent clone"));
  agent
    .command("run")
    .argument("<id>", "id do agente")
    .argument("<ordem>", "instrução para o agente")
    .option("--model <provider/model>", "sobrepõe o modelo do agente")
    .option("--session <id>", "continua uma sessão existente")
    .option("--file <arquivo>", "lê a ordem de um arquivo")
    .description("executa uma ordem em uma sessão OpenCode")
    .action(notImplementedAction("opencorp agent run"));
  agent
    .command("history")
    .argument("<id>", "id do agente")
    .description("últimas execuções (registries/execucoes)")
    .action(notImplementedAction("opencorp agent history"));
  agent
    .command("cost")
    .argument("<id>", "id do agente")
    .description("gasto acumulado (registries/custos)")
    .action(notImplementedAction("opencorp agent cost"));
}
