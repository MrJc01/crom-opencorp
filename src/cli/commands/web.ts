import { spawn } from "node:child_process";
import type { Command } from "commander";
import { createApiServer } from "../../server/index.js";
import { WorkspaceManager } from "../../core/workspace-manager.js";
import { tokenAleatorio } from "../../server/index.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

function abrirBrowser(url: string): void {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", url] : [url];
  const filho = spawn(cmd, args, { stdio: "ignore", detached: true });
  filho.unref();
}

export function registerWebCommand(program: Command): void {
  program
    .command("web")
    .description("sobe a API + interface web e abre o navegador (estilo opencode web)")
    .option("--port <porta>", "porta (padrão 4100)", "4100")
    .option("--token [token]", "token de acesso — sem a flag: acesso ABERTO (padrão); --token (sem valor): gera aleatório e imprime; --token valor: usa o informado")
    .option("--workspace <id>", "workspace padrão da UI")
    .option("--host <host>", "interface de escuta (padrão 127.0.0.1)", "127.0.0.1")
    .option("--no-open", "não abrir o navegador")
    .action(async (opts: { port?: string; token?: string | boolean; workspace?: string; host?: string; open?: boolean }) => {
      const ui = join(process.cwd(), "web-dist", "index.html");
      if (!existsSync(ui)) {
        console.error("erro: web-dist/index.html não encontrada — rode no diretório do projeto opencorp");
        process.exitCode = 1;
        return;
      }
      const manager = new WorkspaceManager();
      let wsPadrao: string | undefined = opts.workspace;
      if (!wsPadrao) {
        try {
          wsPadrao = (await manager.resolver(undefined)).id;
        } catch {
          /* sem ativo — a UI pede para escolher */
        }
      }
      // padrão: acesso ABERTO (""). --token sem valor → gera aleatório e imprime. --token valor → usa.
      let token = "";
      if (opts.token === true) {
        token = tokenAleatorio();
        console.log(`──────────────────────────────────────────────`);
        console.log(`  token de acesso: ${token}`);
        console.log(`──────────────────────────────────────────────`);
      } else if (typeof opts.token === "string" && opts.token.length > 0) {
        token = opts.token;
      }
      const { server, porta: portaPromessa } = createApiServer({ token, workspace: wsPadrao });
      server.listen(Number(opts.port ?? 4100), opts.host ?? "127.0.0.1");
      const porta = await portaPromessa;
      const url = `http://127.0.0.1:${porta}`;
      console.log(`opencorp web em ${url}`);
      if (token === "") console.log("acesso ABERTO (sem token) — use --token para proteger o painel");
      console.log(`workspace padrão: ${wsPadrao ?? "(nenhum — escolha na UI)"}`);
      console.log("Ctrl+C para encerrar");
      if (opts.open !== false) abrirBrowser(`${url}?ws=${wsPadrao ?? ""}`);
      process.on("SIGINT", () => {
        console.log("\n[web] encerrando...");
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 1500).unref();
      });
    });
}
