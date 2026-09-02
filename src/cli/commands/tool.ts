import { createInterface } from "node:readline";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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

/* ── Token do MCP serve (hardening, fail-closed) ───────────────────────────
 * O arquivo <home>/.opencorp/mcp-token é a ÚNICA fonte do token. `mcp serve`
 * só expõe tools com --token/env OPENCORP_MCP_TOKEN IGUAL ao do arquivo —
 * registrar o MCP na config não basta mais para ganhar acesso. */

export function caminhoMcpToken(home: string): string {
  return join(home, ".opencorp", "mcp-token");
}

/** Grava o token com modo 0600 (cria o diretório se faltar). */
export function gravarMcpToken(home: string, token: string): void {
  const path = caminhoMcpToken(home);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${token}\n`, { mode: 0o600 });
  try {
    chmodSync(path, 0o600); // umask pode ter afrouxado o modo na criação
  } catch { /* best effort */ }
}

/** Garante que o token exista (gera com crypto.randomBytes se faltar) e o retorna. */
export function garantirMcpToken(home: string): string {
  const path = caminhoMcpToken(home);
  if (existsSync(path)) {
    try {
      const atual = readFileSync(path, "utf8").trim();
      if (atual.length > 0) {
        gravarMcpToken(home, atual); // reafirma o modo 0600
        return atual;
      }
    } catch { /* ilegível/vazio — regenera abaixo */ }
  }
  const token = randomBytes(24).toString("hex");
  gravarMcpToken(home, token);
  return token;
}

/** Validação pura (testável): null se o token está ok; mensagem de erro caso contrário. */
export function validarMcpToken(fornecido: string | undefined, armazenado: string): string | null {
  if (fornecido === undefined || fornecido.length === 0) {
    return "erro: token obrigatório — passe --token <t> (ou env OPENCORP_MCP_TOKEN); o token está em ~/.opencorp/mcp-token (gerado na primeira vez)";
  }
  const a = Buffer.from(fornecido, "utf8");
  const b = Buffer.from(armazenado, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return "erro: token inválido — o valor informado não confere com ~/.opencorp/mcp-token";
  }
  return null;
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
    .option("--token <t>", "token de acesso (ou env OPENCORP_MCP_TOKEN) — deve conferir com ~/.opencorp/mcp-token")
    .description(
      "expõe as tools do opencorp via stdio MCP (JSON-RPC por linhas); exige token — sem ele nenhuma tool é servida",
    )
    .action((opts: { workspace?: string; token?: string }) =>
      (async () => {
        // fail-closed: valida ANTES de servir qualquer tool/resolver workspace
        const home = opencorpHome();
        const armazenado = garantirMcpToken(home);
        const fornecido = opts.token ?? process.env.OPENCORP_MCP_TOKEN;
        const erroToken = validarMcpToken(fornecido, armazenado);
        if (erroToken) {
          console.error(erroToken);
          process.exitCode = 1;
          return;
        }
        await servirMcp(home, opts.workspace ?? (program.opts() as { workspace?: string }).workspace);
      })().catch((erro) => {
        console.error(`erro: ${erro instanceof Error ? erro.message : String(erro)}`);
        process.exitCode = 1;
      }),
    );
}
