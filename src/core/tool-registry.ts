import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { mkdirRecursive } from "../utils/fs-safe.js";
import { ToolError } from "./errors.js";
import { eventBus } from "./event-bus.js";
import { opencorpHome } from "../utils/paths.js";
import { writeFileAtomic } from "../utils/fs-safe.js";

export interface ManifestFerramenta {
  id: string;
  titulo: string;
  descricao: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
  handler:
    | { tipo: "comando"; comando: string[] }
    | { tipo: "http"; url: string; metodo?: string }
    | { tipo: "interno"; id: string };
  approval?: "sempre" | "nunca";
  rate_limit_min?: number;
}

export interface ResultadoFerramenta {
  ok: boolean;
  resultado: string;
  erro?: string;
}

export interface OpcoesToolRegistry {
  homeDir?: string;
  agora?: () => Date;
  dados?: { taskListar: (wsPath: string) => Promise<unknown[]>; dbPath?: (wsPath: string) => string };
}

function msg(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

/** Validador JSON Schema mínimo (type/required/properties de primeiro nível) */
export function validarContraSchema(input: unknown, schema: ManifestFerramenta["inputSchema"]): string | null {
  if (schema.type !== "object") return null;
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return "input deve ser um objeto";
  }
  const obj = input as Record<string, unknown>;
  for (const campo of schema.required ?? []) {
    if (!(campo in obj)) return `campo obrigatório ausente: "${campo}"`;
  }
  for (const [nome, def] of Object.entries(schema.properties ?? {})) {
    if (!(nome in obj) || obj[nome] === undefined) continue;
    const tipos: Record<string, string> = {
      string: "string",
      number: "number",
      boolean: "boolean",
      object: "object",
      array: "object",
    };
    const esperado = tipos[def.type] ?? "object";
    const recebido = typeof obj[nome];
    if (def.type === "array" && !Array.isArray(obj[nome])) return `campo "${nome}" deve ser array`;
    if (def.type !== "array" && def.type !== "object" && recebido !== esperado) {
      return `campo "${nome}" deve ser ${def.type} (recebido ${recebido})`;
    }
  }
  return null;
}

function ferramentasInternas(): ManifestFerramenta[] {
  return [
    {
      id: "task.list",
      titulo: "Listar tasks",
      descricao: "Lista as tasks do quadro kanban do workspace",
      inputSchema: { type: "object", properties: { coluna: { type: "string", description: "filtra por coluna" } } },
      handler: { tipo: "interno", id: "task.list" },
      approval: "nunca",
    },
    {
      id: "task.create",
      titulo: "Criar task",
      descricao: "Cria uma task no quadro do workspace",
      inputSchema: {
        type: "object",
        properties: { titulo: { type: "string" }, prioridade: { type: "string" } },
        required: ["titulo"],
      },
      handler: { tipo: "interno", id: "task.create" },
      approval: "nunca",
    },
    {
      id: "task.move",
      titulo: "Mover task",
      descricao: "Move uma task para outra coluna (ex.: concluir)",
      inputSchema: { type: "object", properties: { id: { type: "string" }, coluna: { type: "string" } }, required: ["id", "coluna"] },
      handler: { tipo: "interno", id: "task.move" },
      approval: "nunca",
    },
    {
      id: "task.chat",
      titulo: "Chat da task",
      descricao: "posta uma mensagem no chat interno de uma task",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" }, autor: { type: "string" }, corpo: { type: "string" } },
        required: ["id", "autor", "corpo"],
      },
      handler: { tipo: "interno", id: "task.chat" },
      approval: "nunca",
    },
    {
      id: "query.sql",
      titulo: "Consulta SQL",
      descricao: "executa um SELECT somente-leitura no banco do workspace (corp.db)",
      inputSchema: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] },
      handler: { tipo: "interno", id: "query.sql" },
      approval: "nunca",
      rate_limit_min: 60,
    },
    {
      id: "http.get",
      titulo: "HTTP GET",
      descricao: "faz uma requisição GET e devolve o corpo (máx 4KB)",
      inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
      handler: { tipo: "interno", id: "http.get" },
      approval: "sempre",
      rate_limit_min: 30,
    },
  ];
}

export class ToolRegistry {
  private readonly homeDir: string;
  private readonly cache = new Map<string, { ferramentas: Map<string, ManifestFerramenta>; mtime: number }>();
  private readonly janelas = new Map<string, number[]>();

  constructor(opcoes: OpcoesToolRegistry = {}) {
    this.homeDir = opcoes.homeDir ?? opencorpHome();
  }

  dirHome(): string {
    return join(this.homeDir, ".opencorp", "tools");
  }

  dirWs(wsPath: string): string {
    return join(wsPath, ".opencorp", "tools");
  }

  private carregarDir(dir: string, saida: Map<string, ManifestFerramenta>): number {
    let mtime = 0;
    if (!existsSync(dir)) return mtime;
    try {
      mtime = statSync(dir).mtimeMs;
    } catch {
      return 0;
    }
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      try {
        const def = JSON.parse(readFileSync(join(dir, f), "utf8")) as ManifestFerramenta;
        if (def.id && def.handler?.tipo) saida.set(def.id, def);
      } catch {
        continue;
      }
    }
    return mtime;
  }

  listar(wsPath?: string, forcar = false): ManifestFerramenta[] {
    const chave = wsPath ?? "";
    const cached = this.cache.get(chave);
    const mtimeHome = existsSync(this.dirHome()) ? statSync(this.dirHome()).mtimeMs : 0;
    if (!forcar && cached && cached.mtime === mtimeHome) return [...cached.ferramentas.values()];
    const ferramentas = new Map<string, ManifestFerramenta>();
    for (const f of ferramentasInternas()) ferramentas.set(f.id, f);
    const m1 = this.carregarDir(this.dirHome(), ferramentas);
    let m2 = 0;
    if (wsPath) m2 = this.carregarDir(this.dirWs(wsPath), ferramentas);
    void m1;
    void m2;
    this.cache.set(chave, { ferramentas, mtime: mtimeHome });
    return [...ferramentas.values()];
  }

  obter(id: string, wsPath?: string): ManifestFerramenta {
    const f = this.listar(wsPath).find((x) => x.id === id);
    if (!f) {
      const e = new ToolError(`ferramenta "${id}" não encontrada — veja "opencorp tool list"`);
      (e as { status?: number }).status = 404;
      throw e;
    }
    return f;
  }

  private rateLimitOk(id: string, limite: number): boolean {
    const agora = Date.now();
    const janela = (this.janelas.get(id) ?? []).filter((t) => agora - t < 60_000);
    if (janela.length >= limite) {
      this.janelas.set(id, janela);
      return false;
    }
    janela.push(agora);
    this.janelas.set(id, janela);
    return true;
  }

  private async executarInterna(f: ManifestFerramenta, input: Record<string, unknown>, wsPath: string): Promise<string> {
    const { TaskStore } = await import("./task-store.js");
    const tasks = new TaskStore();
    switch ((f.handler as { tipo: "interno"; id: string }).id) {
      case "task.list":
        return JSON.stringify(await tasks.listar(wsPath, { coluna: input.coluna as string | undefined }), null, 1);
      case "task.create": {
        const t = await tasks.criar(wsPath, { titulo: String(input.titulo), prioridade: input.prioridade as "media" | undefined }, "tool");
        return `task ${t.id} criada em "${t.coluna}"`;
      }
      case "task.move": {
        const t = await tasks.mover(wsPath, String(input.id), String(input.coluna));
        return `task ${t.id} movida para "${t.coluna}"`;
      }
      case "task.chat": {
        const m = await tasks.mensagem(wsPath, String(input.id), {
          autor: String(input.autor ?? "tool"),
          corpo: String(input.corpo),
        });
        return `mensagem ${m.id} no chat de ${m.task_id}`;
      }
      case "query.sql": {
        const sql = String(input.sql).trim();
        if (!/^select\s/i.test(sql) || /;/.test(sql)) {
          throw new ToolError("query.sql aceita apenas um SELECT único (sem ;)");
        }
        const { CorpDb } = await import("./corp-db.js");
        const db = new CorpDb(join(wsPath, ".opencorp", "corp.db"));
        try {
          const linhas = db["db"].prepare(sql).all();
          return JSON.stringify(linhas).slice(0, 4096) || "[]";
        } finally {
          db.fechar();
        }
      }
      case "http.get": {
        const resp = await fetch(String(input.url), { headers: { "user-agent": "opencorp-tool" } });
        const texto = await resp.text();
        return `HTTP ${resp.status}: ${texto.slice(0, 4096)}`;
      }
      default:
        throw new ToolError(`ferramenta interna desconhecida: "${(f.handler as { id: string }).id}"`);
    }
  }

  async executar(id: string, input: unknown, wsPath: string, opcoes: { aprovado?: boolean } = {}): Promise<ResultadoFerramenta> {
    const f = this.obter(id, wsPath);
    if (f.approval === "sempre" && !opcoes.aprovado) {
      throw new ToolError(`ferramenta "${id}" exige aprovação humana — reexecute com aprovação explícita`);
    }
    if (f.rate_limit_min && !this.rateLimitOk(id, f.rate_limit_min)) {
      throw new ToolError(`rate limit: "${id}" excedeu ${f.rate_limit_min} execuções/minuto`);
    }
    const erroValidacao = validarContraSchema(input, f.inputSchema);
    if (erroValidacao) throw new ToolError(`input inválido para "${id}": ${erroValidacao}`);
    const obj = (input ?? {}) as Record<string, unknown>;
    let resultado: string;
    if (f.handler.tipo === "interno") {
      resultado = await this.executarInterna(f, obj, wsPath);
    } else if (f.handler.tipo === "comando") {
      resultado = await new Promise<string>((resolveP, rejeita) => {
        const cmd = (f.handler as { tipo: "comando"; comando: string[] }).comando;
        const filho = spawn(cmd[0]!, [...cmd.slice(1), JSON.stringify(obj)], {
          cwd: wsPath,
          timeout: 30_000,
        });
        let saida = "";
        filho.stdout?.on("data", (c) => (saida += c));
        filho.stderr?.on("data", (c) => (saida += c));
        filho.on("error", (e) => rejeita(new ToolError(`comando falhou: ${msg(e)}`)));
        filho.on("close", (code) => {
          if (code === 0) resolveP(saida.slice(0, 4096));
          else rejeita(new ToolError(`comando saiu com código ${code}: ${saida.slice(0, 200)}`));
        });
      });
    } else {
      const http = (f.handler as { tipo: "http"; url: string; metodo?: string });
      const resp = await fetch(http.url, {
        method: http.metodo ?? "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(obj),
      });
      resultado = `HTTP ${resp.status}: ${(await resp.text()).slice(0, 4096)}`;
    }
    eventBus.emit("tool.executada", { tool: id, workspace: wsPath });
    return { ok: true, resultado };
  }

  async criarManifesto(wsPath: string | null, def: ManifestFerramenta): Promise<void> {
    const dir = wsPath ? this.dirWs(wsPath) : this.dirHome();
    await mkdirRecursive(dir);
    if (!def.id || !def.descricao || !def.handler?.tipo) {
      throw new ToolError("manifesto precisa de id, descricao e handler");
    }
    await writeFileAtomic(join(dir, `${def.id.replace(/[^\w.]/g, "_")}.json`), `${JSON.stringify(def, null, 2)}\n`);
    this.cache.delete(wsPath ?? "");
  }
}
