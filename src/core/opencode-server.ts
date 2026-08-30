import { spawn, type SpawnOptions } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { opencorpHome } from "../utils/paths.js";
import { eventBus } from "./event-bus.js";
import { WorkspaceManager } from "./workspace-manager.js";
import { OpencorpError } from "./errors.js";
import { OpenCodeBridge } from "./opencode-bridge.js";
import { parseAgenteMd } from "../schemas/agent.js";

export interface OpencodeServerInfo {
  pid: number;
  porta: number;
  iniciado_em: string;
}

export interface OpencodeServerStatus {
  rodando: boolean;
  pid: number | null;
  porta: number | null;
}

export interface AgentesConfig {
  total: number;
  workspaces: string[];
}

function pidfilePath(homeDir: string): string {
  return join(homeDir, ".opencorp", "opencode-server.json");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function portaLivre(): Promise<number> {
  const { createServer } = await import("node:net");
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      server.close(() => {
        if (addr && typeof addr === "object") resolve(addr.port);
        else reject(new Error("não foi possível obter porta livre"));
      });
    });
    server.on("error", reject);
  });
}

async function processoVivo(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function lerPidfile(homeDir: string): Promise<OpencodeServerInfo | null> {
  const path = pidfilePath(homeDir);
  if (!existsSync(path)) return null;
  try {
    const content = readFileSync(path, "utf8");
    return JSON.parse(content) as OpencodeServerInfo;
  } catch {
    return null;
  }
}

async function gravarPidfile(homeDir: string, info: OpencodeServerInfo): Promise<void> {
  const path = pidfilePath(homeDir);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, `${JSON.stringify(info, null, 2)}\n`);
}

async function removerPidfile(homeDir: string): Promise<void> {
  const path = pidfilePath(homeDir);
  if (existsSync(path)) rmSync(path, { force: true });
}

async function esperarPortaResponder(porta: number, homeDir: string, timeoutMs = 15000): Promise<void> {
  const inicio = Date.now();
  const urls = [
    `http://127.0.0.1:${porta}/health`,
    `http://127.0.0.1:${porta}/session`,
  ];
  // Pequeno delay inicial para dar tempo do processo filho iniciar
  await sleep(300);
  while (Date.now() - inicio < timeoutMs) {
    for (const url of urls) {
      try {
        const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(2000) });
        if (res.ok || res.status === 401 || res.status === 404) return;
      } catch {
        // ignora e tenta próxima URL ou próximo ciclo
      }
    }
    await sleep(100);
  }
  throw new Error(
    `opencode serve não respondeu na porta ${porta} após ${timeoutMs}ms — verifique logs em ${homeDir}/logs/opencode-server.log`,
  );
}

function binOpencodePath(): string {
  const aqui = dirname(fileURLToPath(import.meta.url));
  const bin = resolve(aqui, "..", "..", "bin", "opencorp.mjs");
  return bin;
}

async function garantirOpencodeConfig(homeDir: string): Promise<boolean> {
  const configPath = join(homeDir, "opencode.json");
  if (existsSync(configPath)) return false;

  const binPath = binOpencodePath();
  if (!existsSync(binPath)) {
    console.warn(`[opencode-server] bin não encontrado em ${binPath} — MCP não configurado`);
    return false;
  }

  const config = {
    $schema: "https://opencode.ai/config.json",
    // padrão do opencorp: modelos free (não usa a config global do usuário, que pode apontar modelo pago)
    model: "opencode/nemotron-3-ultra-free",
    small_model: "opencode/nemotron-3-ultra-free",
    mcp: {
      opencorp: {
        type: "local",
        command: ["node", binPath, "mcp", "serve"],
        environment: { OPENCORP_HOME: homeDir },
      },
    },
  };

  const dir = dirname(configPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return true;
}

async function garantirAgentesSecretario(homeDir: string): Promise<AgentesConfig> {
  const manager = new WorkspaceManager({ homeDir });
  const workspaces = await manager.listar();
  const templateDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "templates", "default", ".opencorp", "agents");
  const bridge = new OpenCodeBridge();
  let total = 0;
  const wsNomes: string[] = [];

  // sincroniza via bridge (converte frontmatter p/ formato do opencode — tools como mapa, permissões etc.)
  for (const agente of ["secretario", "secretario-exec"]) {
    const origem = join(templateDir, `${agente}.md`);
    if (!existsSync(origem)) {
      console.warn(`[opencode-server] template ${agente}.md não encontrado em ${origem}`);
      continue;
    }
    const { frontmatter, corpo } = parseAgenteMd(readFileSync(origem, "utf8"));
    await bridge.sincronizarAgente(homeDir, frontmatter, corpo); // <home>/.opencode/agent (cwd do opencode serve)
    for (const ws of workspaces) {
      if (!ws.existe) continue;
      await bridge.sincronizarAgente(ws.path, frontmatter, corpo);
    }
    total++;
  }

  for (const ws of workspaces) {
    if (!ws.existe) continue;
    wsNomes.push(ws.id);
  }
  return { total, workspaces: wsNomes };
}

export class SecretarioError extends OpencorpError {
  readonly status?: number;
  constructor(mensagem: string, opts: { exitCode?: number; status?: number } = {}) {
    super(mensagem, { exitCode: opts.exitCode ?? 1 });
    this.status = opts.status;
    this.name = "SecretarioError";
  }
}

export class OpencodeServerManager {
  private readonly homeDir: string;
  private readonly binario: string;

  constructor(opcoes: { homeDir?: string; binario?: string } = {}) {
    this.homeDir = opcoes.homeDir ?? opencorpHome();
    this.binario = opcoes.binario ?? process.env.OPENCODE_SERVER_BIN ?? "opencode";
  }

  async iniciar(): Promise<{ pid: number; porta: number }> {
    const existente = await this.status();
    if (existente.rodando && existente.pid && existente.porta) {
      return { pid: existente.pid, porta: existente.porta };
    }

    const porta = await portaLivre();
    const logPath = join(this.homeDir, "logs", "opencode-server.log");
    const logDir = dirname(logPath);
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });

    await garantirOpencodeConfig(this.homeDir);
    const agentes = await garantirAgentesSecretario(this.homeDir);

    const argv = ["serve", "--port", String(porta), "--hostname", "127.0.0.1"];
    const options: SpawnOptions = {
      cwd: this.homeDir,
      env: { ...process.env, OPENCORP_HOME: this.homeDir },
      detached: true,
      stdio: "ignore",
    };

    const child = spawn(this.binario, argv, options);
    const pid = child.pid ?? 0;
    child.unref();

    // Se o binário não existir/não for executável, o 'error' event sem
    // listener viraria uncaughtException e DERRUBARIA o servidor inteiro.
    child.on("error", (err) => {
      eventBus.emit("secretario.erro", { pid, porta, erro: err.message });
    });

    const info: OpencodeServerInfo = { pid, porta, iniciado_em: new Date().toISOString() };
    await gravarPidfile(this.homeDir, info);

    try {
      await esperarPortaResponder(porta, this.homeDir);
    } catch (erro) {
      await removerPidfile(this.homeDir);
      throw erro;
    }

    eventBus.emit("secretario.iniciado", { pid, porta, agentes: agentes.total });
    return { pid, porta };
  }

  async status(): Promise<OpencodeServerStatus> {
    const info = await lerPidfile(this.homeDir);
    if (!info) return { rodando: false, pid: null, porta: null };
    const vivo = await processoVivo(info.pid);
    if (!vivo) {
      await removerPidfile(this.homeDir);
      return { rodando: false, pid: null, porta: null };
    }
    try {
      const res = await fetch(`http://127.0.0.1:${info.porta}/health`, { signal: AbortSignal.timeout(2000) });
      if (!res.ok && res.status !== 401 && res.status !== 404) {
        await removerPidfile(this.homeDir);
        return { rodando: false, pid: null, porta: null };
      }
    } catch {
      await removerPidfile(this.homeDir);
      return { rodando: false, pid: null, porta: null };
    }
    return { rodando: true, pid: info.pid, porta: info.porta };
  }

  async parar(): Promise<void> {
    const info = await lerPidfile(this.homeDir);
    if (!info) return;
    if (await processoVivo(info.pid)) {
      process.kill(info.pid, "SIGTERM");
      for (let i = 0; i < 30; i++) {
        await sleep(100);
        if (!(await processoVivo(info.pid))) break;
      }
    }
    await removerPidfile(this.homeDir);
    eventBus.emit("secretario.parado", { pid: info.pid });
  }

  async configurado(): Promise<boolean> {
    const configPath = join(this.homeDir, "opencode.json");
    return existsSync(configPath);
  }
}

const singleton = new OpencodeServerManager();
export function getOpencodeServerManager(opcoes?: { homeDir?: string; binario?: string }): OpencodeServerManager {
  if (opcoes?.homeDir || opcoes?.binario) {
    return new OpencodeServerManager(opcoes);
  }
  return singleton;
}