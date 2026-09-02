import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import type { Command } from "commander";
import { WorkspaceError, WorkspaceManager } from "../../core/workspace-manager.js";
import { envOpencodeIsolado } from "../../core/opencode-server.js";
import { opencorpHome } from "../../utils/paths.js";

/**
 * `opencorp open [workspace] [--agente <id>]` — abre a TUI do opencode INTERATIVA
 * e direto no workspace, com o env isolado do opencorp (XDG_DATA_HOME/XDG_CONFIG_HOME
 * em ~/.opencorp — não mistura com o opencode pessoal do usuário).
 *
 * O processo herda o terminal (stdio inherit, em primeiro plano): o usuário usa
 * normalmente e sai com /quit (ou Ctrl+C). O exit code do opencode é propagado.
 *
 * Nota sobre flags (verificado no `opencode --help` v1.18): a TUI recebe o projeto
 * como argumento POSICIONAL ("opencode [project] — path to start opencode in") e
 * suporta `--agent <id>` no nível principal. `--dir` é usado pelo `opencode run`.
 */
export function registerOpenCommand(program: Command): void {
  program
    .command("open")
    .argument("[workspace]", "id do workspace (padrão: ativo)")
    .option("--agente <id>", "abre já com o agente carregado (passa --agent ao opencode)")
    .description(
      "abre a TUI interativa do opencode direto no workspace (env isolado do opencorp) — saia com /quit",
    )
    .action(
      async (workspace: string | undefined, opts: { agente?: string }) => {
        try {
          const manager = new WorkspaceManager();
          const ws = await manager.resolver(
            workspace ?? (program.opts() as { workspace?: string }).workspace,
          );
          if (!ws.existe || !existsSync(ws.path)) {
            console.error(
              `erro: a pasta do workspace "${ws.id}" não existe em ${ws.path} — recrie com "opencorp workspace create ${ws.id}" ou remova o registro com "opencorp workspace delete ${ws.id}"`,
            );
            process.exitCode = 1;
            return;
          }

          const args: string[] = [];
          if (opts.agente) args.push("--agent", opts.agente);
          args.push(ws.path);

          const child = spawn("opencode", args, {
            cwd: ws.path,
            env: envOpencodeIsolado(opencorpHome(), ws.id),
            stdio: "inherit",
          });
          child.on("error", (err) => {
            console.error(
              `erro: não foi possível iniciar o opencode: ${err.message} — ele está no PATH? (rode "opencorp doctor")`,
            );
            process.exitCode = 1;
          });
          child.on("close", (code) => {
            process.exitCode = code ?? 0;
          });
        } catch (erro) {
          if (erro instanceof WorkspaceError) {
            console.error(`erro: ${erro.message}`);
            process.exitCode = 1;
            return;
          }
          console.error(`erro inesperado: ${erro instanceof Error ? erro.message : String(erro)}`);
          process.exitCode = 1;
        }
      },
    );
}
