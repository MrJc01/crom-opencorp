import { Command, CommanderError } from "commander";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { registerAgentCommand } from "./commands/agent.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerRunCommand } from "./commands/run.js";
import { registerSessionCommand } from "./commands/session.js";
import { registerSettingsCommand } from "./commands/settings.js";
import { registerRegistryCommand } from "./commands/registry.js";
import { registerApprovalsCommand } from "./commands/approvals.js";
import { registerBudgetCommand } from "./commands/budget.js";
import { registerMeetingCommand } from "./commands/meeting.js";
import { registerSubcorpCommand } from "./commands/subcorp.js";
import { registerFlowCommand } from "./commands/flow.js";
import { registerTaskCommand } from "./commands/task.js";
import { registerScheduleCommands } from "./commands/schedule.js";
import { registerSupervisorCommand } from "./commands/supervisor.js";
import { registerServeCommand } from "./commands/serve.js";
import { registerWebCommand } from "./commands/web.js";
import { registerTemplateCommand } from "./commands/template.js";
import { registerWorkspaceCommands } from "./commands/workspace.js";
import { registerTestCommand } from "./commands/test.js";
import { notImplementedAction } from "./placeholder.js";

const require = createRequire(import.meta.url);

export function resolveVersion(): string {
  try {
    const pkg = require("../../package.json") as { version?: string };
    return typeof pkg?.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("opencorp")
    .description(
      "Sistema Operacional de Empresas Autônomas — orquestra sessões OpenCode em workspaces governados",
    )
    .version(resolveVersion(), "--version", "imprime a versão do opencorp")
    .helpOption("-h, --help", "mostra a ajuda do comando")
    .option("--workspace <id>", "opera no workspace indicado em vez do ativo");

  program
    .command("init")
    .argument("[dir]", "diretório alvo (padrão: .)")
    .description("prepara um repositório: estrutura, settings global e template default")
    .action(notImplementedAction("opencorp init"));

  registerRunCommand(program);

  registerSettingsCommand(program);

  registerWorkspaceCommands(program);

  registerAgentCommand(program);

  registerSessionCommand(program);

  registerRegistryCommand(program);

  registerApprovalsCommand(program);

  registerBudgetCommand(program);

  registerMeetingCommand(program);

  registerTemplateCommand(program);

  registerSubcorpCommand(program);

  registerSupervisorCommand(program);

  registerFlowCommand(program);

  registerTaskCommand(program);

  registerScheduleCommands(program);

  registerServeCommand(program);

  registerWebCommand(program);

  registerTestCommand(program);

  const cloud = program.command("cloud").description("backup/sync (opcional)");
  cloud
    .command("configure")
    .description("wizard de perfis (backup-local | backup-nuvem | mirror-remoto)")
    .action(notImplementedAction("opencorp cloud configure"));
  cloud
    .command("backup")
    .description("executa o backup agora")
    .action(notImplementedAction("opencorp cloud backup"));
  cloud
    .command("sync")
    .option("--dry-run", "simula sem alterar nada")
    .description("sincroniza os alvos do perfil")
    .action(notImplementedAction("opencorp cloud sync"));
  cloud
    .command("status")
    .description("último backup, diffs pendentes, saúde dos remotos")
    .action(notImplementedAction("opencorp cloud status"));

  registerDoctorCommand(program);
  return program;
}

function primeiraCitacao(mensagem: string): string | undefined {
  const m = /'([^']+)'/.exec(mensagem);
  return m?.[1];
}

function handleCommanderError(err: CommanderError): void {
  switch (err.code) {
    case "commander.version":
    case "commander.helpDisplayed":
    case "commander.help":
      process.exitCode = err.exitCode;
      return;
    case "commander.unknownCommand": {
      console.error('Dica: rode "opencorp --help" para listar os comandos disponíveis.');
      process.exitCode = 1;
      return;
    }
    case "commander.unknownOption": {
      console.error('Dica: use "opencorp <comando> --help" para ver as opções válidas.');
      process.exitCode = 1;
      return;
    }
    case "commander.missingArgument":
    case "commander.missingMandatoryParameterValue": {
      const nome = primeiraCitacao(err.message);
      console.error(
        `erro: argumento obrigatório ausente${nome ? ` (${nome})` : ""} — use "opencorp <comando> --help" para ver o uso.`,
      );
      process.exitCode = 1;
      return;
    }
    default: {
      console.error('Dica: rode "opencorp --help" para ajuda.');
      process.exitCode = err.exitCode || 1;
    }
  }
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const program = buildProgram();
  program.exitOverride();
  try {
    await program.parseAsync(argv);
  } catch (err) {
    if (err instanceof CommanderError) {
      handleCommanderError(err);
      return;
    }
    console.error(`erro inesperado: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}

const invocadoDireto =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invocadoDireto) {
  await main(process.argv);
}
