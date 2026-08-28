import { Command, CommanderError } from "commander";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { registerAgentCommand } from "./commands/agent.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerRunCommand } from "./commands/run.js";
import { registerSessionCommand } from "./commands/session.js";
import { registerRegistryCommand } from "./commands/registry.js";
import { registerSettingsCommand } from "./commands/settings.js";
import { registerWorkspaceCommands } from "./commands/workspace.js";
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

  const approvals = program.command("approvals").description("fila HITL (humano no loop)");
  approvals
    .command("list")
    .description("lista as aprovações pendentes")
    .action(notImplementedAction("opencorp approvals list"));
  approvals
    .command("approve")
    .argument("<id>", "id da aprovação")
    .description("aprova uma ação pendente")
    .action(notImplementedAction("opencorp approvals approve"));
  approvals
    .command("reject")
    .argument("<id>", "id da aprovação")
    .option("--motivo <texto>", "motivo da rejeição")
    .description("rejeita uma ação pendente")
    .action(notImplementedAction("opencorp approvals reject"));

  const budget = program.command("budget").description("orçamento e consumo");
  budget
    .command("status")
    .option("--workspace <id>", "workspace alvo (padrão: ativo)")
    .description("mostra consumo e tetos")
    .action(notImplementedAction("opencorp budget status"));
  budget
    .command("set")
    .option("--daily-usd <valor>", "teto diário do workspace em USD")
    .option("--per-agent-usd <valor>", "teto diário por agente em USD")
    .description("define os tetos de orçamento")
    .action(notImplementedAction("opencorp budget set"));

  const template = program.command("template").description("templates de workspace (.corp)");
  template
    .command("list")
    .description("lista os templates disponíveis")
    .action(notImplementedAction("opencorp template list"));
  template
    .command("create")
    .argument("<id>", "id do novo template")
    .description("cria um template")
    .action(notImplementedAction("opencorp template create"));
  template
    .command("export")
    .argument("<ws>", "workspace a exportar")
    .option("-o, --output <arquivo>", "arquivo .corp de saída")
    .description("empacota um workspace em .corp")
    .action(notImplementedAction("opencorp template export"));
  template
    .command("import")
    .argument("<fonte>", "pasta | arquivo.corp | url")
    .option("--as <id>", "id do template importado")
    .description("importa um template")
    .action(notImplementedAction("opencorp template import"));

  const subcorp = program.command("subcorp").description("workspaces filhos delegáveis");
  subcorp
    .command("add")
    .argument("<fonte>", "path ou template do subcorp")
    .requiredOption("--as <id>", "id do subcorp")
    .option("--perm <nivel>", "read | ask | write", "read")
    .description("importa um subcorp com permissões limitadas")
    .action(notImplementedAction("opencorp subcorp add"));
  subcorp
    .command("list")
    .description("lista os subcorps do workspace")
    .action(notImplementedAction("opencorp subcorp list"));
  subcorp
    .command("remove")
    .argument("<id>", "id do subcorp")
    .description("remove um subcorp")
    .action(notImplementedAction("opencorp subcorp remove"));

  const test = program.command("test").description("teste cego (QA black-box via OpenCode)");
  test
    .command("blind")
    .argument("<etapa>", "etapa a testar (ex.: 01)")
    .option("--model <provider/model>", "modelo do testador cego")
    .option("--spec <arquivo>", "spec a executar (docs/tests/ETAPA-0X.md)")
    .description("dispara o testador cego para uma etapa")
    .action(notImplementedAction("opencorp test blind"));

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
