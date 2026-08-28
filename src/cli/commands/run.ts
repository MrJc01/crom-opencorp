import type { Command } from "commander";
import { SessionManager } from "../../core/session-manager.js";

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

export function registerRunCommand(program: Command): void {
  const sessoes = new SessionManager();

  program
    .command("run")
    .argument("<ordem>", "instrução enviada ao agente do workspace ativo")
    .option("--agent <id>", "agente executor (padrão: executor-padrao)", "executor-padrao")
    .option("--model <provider/model>", "sobrepõe o modelo do agente")
    .option("--session <id>", "continua uma sessão opencode existente")
    .option("--file <arquivo>", "lê a ordem de um arquivo (sobrepõe o texto posicional)")
    .option("--title <titulo>", "título da sessão opencode")
    .description("atalho de agent run no workspace ativo (padrão: executor-padrao)")
    .action(
      (
        ordem: string,
        opts: {
          agent?: string;
          model?: string;
          session?: string;
          file?: string;
          title?: string;
          workspace?: string;
        },
      ) =>
        comErros(async () => {
          const r = await sessoes.rodar({
            agente: opts.agent ?? "executor-padrao",
            ordem,
            model: opts.model,
            session: opts.session,
            file: opts.file,
            title: opts.title,
            workspaceId: opts.workspace,
          });
          console.log(
            `\n[opencorp] sessão ${r.id} — status: ${r.status} · exit: ${r.exit_code ?? "?"} · duração: ${((r.duracao_ms ?? 0) / 1000).toFixed(1)}s · log: ${r.log}`,
          );
          process.exitCode = r.exit_code === null ? 1 : r.exit_code;
        }),
    );
}
