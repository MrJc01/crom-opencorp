import { createInterface } from "node:readline";
import type { Command } from "commander";
import { ToolRegistry, type ManifestFerramenta } from "../../core/tool-registry.js";
import { WorkspaceManager } from "../../core/workspace-manager.js";
import { opencorpHome } from "../../utils/paths.js";
import { ToolError } from "../../core/errors.js";

function paraToolMcp(f: ManifestFerramenta): Record<string, unknown> {
  return {
    name: f.id,
    title: f.titulo,
    description: f.descricao,
    inputSchema: f.inputSchema,
  };
}

/** Servidor MCP via stdio (JSON-RPC por linhas) — expõe as tools do opencorp a qualquer cliente MCP. */
async function servirMcp(homeDir: string, workspace: string | undefined): Promise<void> {
  const registry = new ToolRegistry({ homeDir });
  const manager = new WorkspaceManager({ homeDir });
  const ws = await manager.resolver(workspace);

  const rl = createInterface({ input: process.stdin, terminal: false });
  const responder = (msg: Record<string, unknown>): void => {
    process.stdout.write(`${JSON.stringify(msg)}\n`);
  };

  rl.on("line", (linha) => {
    const texto = linha.trim();
    if (texto.length === 0) return;
    let req: Record<string, unknown>;
    try {
      req = JSON.parse(texto) as Record<string, unknown>;
    } catch {
      responder({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido" } });
      return;
    }
    const id = req.id ?? null;
    const metodo = String(req.method ?? "");
    const params = (req.params ?? {}) as Record<string, unknown>;
    void (async () => {
      try {
        if (metodo === "initialize") {
          responder({
            jsonrpc: "2.0",
            id,
            result: {
              protocolVersion: "2025-06-18",
              capabilities: { tools: { listChanged: false } },
              serverInfo: { name: "opencorp", version: "0.1.0" },
            },
          });
          return;
        }
        if (metodo === "notifications/initialized" || metodo.startsWith("notifications/")) {
          return; // notificações não recebem resposta
        }
        if (metodo === "tools/list") {
          const ferramentas = registry.listar(ws.path, true).map(paraToolMcp);
          responder({ jsonrpc: "2.0", id, result: { tools: ferramentas } });
          return;
        }
        if (metodo === "tools/call") {
          const nome = String(params.name ?? "");
          const argumentos = (params.arguments ?? {}) as Record<string, unknown>;
          try {
            const r = await registry.executar(nome, argumentos, ws.path, { aprovado: true });
            responder({
              jsonrpc: "2.0",
              id,
              result: { content: [{ type: "text", text: r.resultado }], isError: false },
            });
          } catch (erro) {
            const mensagem = erro instanceof Error ? erro.message : String(erro);
            responder({
              jsonrpc: "2.0",
              id,
              result: { content: [{ type: "text", text: mensagem }], isError: true },
            });
          }
          return;
        }
        responder({ jsonrpc: "2.0", id, error: { code: -32601, message: `método desconhecido: ${metodo}` } });
      } catch (erro) {
        responder({
          jsonrpc: "2.0",
          id,
          error: { code: -32603, message: erro instanceof Error ? erro.message : String(erro) },
        });
      }
    })();
  });

  process.stdin.on("end", () => process.exit(0));
  console.error(`[opencorp mcp] ativo — workspace "${ws.id}" (${registry.listar(ws.path, true).length} tools)`);
}

export function registerToolCommands(program: Command): void {
  const registry = new ToolRegistry();
  const manager = new WorkspaceManager();

  function wsDe(opts: { workspace?: string }): string | undefined {
    return opts.workspace ?? (program.opts() as { workspace?: string }).workspace;
  }

  const tool = program
    .command("tool")
    .description(
      "ferramentas plugáveis: built-ins (task.*, query.sql, http.get) + manifests JSON em ~/.opencorp/tools/ e <ws>/.opencorp/tools/ (hot-reload)",
    );

  tool
    .command("list")
    .description("lista as ferramentas disponíveis")
    .action((opts: { workspace?: string }) =>
      (async () => {
        try {
          const ws = await manager.resolver(wsDe(opts));
          for (const f of registry.listar(ws.path, true)) {
            const aprov = f.approval === "sempre" ? " [exige aprovação]" : "";
            console.log(`${f.id.padEnd(16)}${f.titulo}${aprov}`);
          }
        } catch (erro) {
          console.error(`erro: ${erro instanceof Error ? erro.message : String(erro)}`);
          process.exitCode = 1;
        }
      })(),
    );

  tool
    .command("run")
    .argument("<id>", "id da ferramenta")
    .option("--input <json>", "input JSON", "{}")
    .option("--aprovado", "confirma aprovação humana para ferramentas que exigem")
    .description("executa uma ferramenta")
    .action((id: string, opts: { input?: string; aprovado?: boolean; workspace?: string }) =>
      (async () => {
        try {
          const ws = await manager.resolver(wsDe(opts));
          let input: unknown = {};
          try {
            input = JSON.parse(opts.input ?? "{}");
          } catch {
            throw new ToolError("--input não é JSON válido");
          }
          const r = await registry.executar(id, input, ws.path, { aprovado: opts.aprovado });
          console.log(r.resultado);
        } catch (erro) {
          console.error(`erro: ${erro instanceof Error ? erro.message : String(erro)}`);
          process.exitCode = 1;
        }
      })(),
    );

  tool
    .command("inspect")
    .argument("<id>", "id da ferramenta")
    .description("mostra o manifesto completo da ferramenta")
    .action((id: string, opts: { workspace?: string }) =>
      (async () => {
        try {
          const ws = await manager.resolver(wsDe(opts));
          console.log(JSON.stringify(registry.obter(id, ws.path), null, 2));
        } catch (erro) {
          console.error(`erro: ${erro instanceof Error ? erro.message : String(erro)}`);
          process.exitCode = 1;
        }
      })(),
    );

  const mcp = program
    .command("mcp")
    .description("servidor MCP (Model Context Protocol) do opencorp");

  mcp
    .command("serve")
    .option("--workspace <id>", "workspace alvo (padrão: ativo)")
    .description("expõe as tools do opencorp via stdio MCP (JSON-RPC por linhas)")
    .action((opts: { workspace?: string }) =>
      (async () => {
        await servirMcp(opencorpHome(), opts.workspace ?? (program.opts() as { workspace?: string }).workspace);
      })().catch((erro) => {
        console.error(`erro: ${erro instanceof Error ? erro.message : String(erro)}`);
        process.exitCode = 1;
      }),
    );
}
