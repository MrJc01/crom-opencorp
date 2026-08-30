import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
import type { Command } from "commander";
import { createApiServer } from "../../server/index.js";
import { WorkspaceManager } from "../../core/workspace-manager.js";
import { tokenAleatorio } from "../../server/index.js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { opencorpHome } from "../../utils/paths.js";

function abrirBrowser(url: string): void {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", url] : [url];
  const filho = spawn(cmd, args, { stdio: "ignore", detached: true });
  filho.unref();
}

function tokenPersistido(): string {
  const { mkdirRecursive, writeFileAtomic } = require("../../utils/fs-safe.js") as {
    mkdirRecursive: (p: string) => Promise<void>;
    writeFileAtomic: (p: string, c: string, o?: { mode?: number }) => Promise<void>;
  };
  try {
    const dir = join(opencorpHome(), ".opencorp");
    const caminho = join(dir, "secrets.json");
    let segredos: Record<string, unknown> = {};
    try {
      segredos = JSON.parse(readFileSync(caminho, "utf8")) as Record<string, unknown>;
    } catch {
      segredos = {};
    }
    if (typeof segredos.api_token === "string" && segredos.api_token.length > 0) {
      return segredos.api_token as string;
    }
    const token = tokenAleatorio();
    segredos.api_token = token;
    void (async () => {
      await mkdirRecursive(dir);
      await writeFileAtomic(caminho, `${JSON.stringify(segredos, null, 2)}\n`, { mode: 0o600 });
    })();
    return token;
  } catch {
    return tokenAleatorio();
  }
}

export function registerWebCommand(program: Command): void {
  program
    .command("web")
    .description("sobe a API + interface web e abre o navegador (estilo opencode web)")
    .option("--port <porta>", "porta (padrão 4100)", "4100")
    .option("--token <token>", "token de acesso (reutiliza ~/.opencorp/secrets.json se omitido)")
    .option("--workspace <id>", "workspace padrão da UI")
    .option("--host <host>", "interface de escuta (padrão 127.0.0.1)", "127.0.0.1")
    .option("--no-open", "não abrir o navegador")
    .action(async (opts: { port?: string; token?: string; workspace?: string; host?: string; open?: boolean }) => {
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
      const token = opts.token ?? tokenPersistido();
      const { server, porta: portaPromessa } = createApiServer({ token, workspace: wsPadrao });
      server.listen(Number(opts.port ?? 4100), opts.host ?? "127.0.0.1");
      const porta = await portaPromessa;
      const url = `http://127.0.0.1:${porta}`;
      console.log(`opencorp web em ${url}`);
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
