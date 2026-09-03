import { spawn, type SpawnOptions } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { opencorpHome } from "../utils/paths.js";
import { eventBus } from "./event-bus.js";
import { WorkspaceManager } from "./workspace-manager.js";
import { SettingsStore } from "./settings-store.js";
import { OpencorpError } from "./errors.js";
import { OpenCodeBridge, gerarAgenteOpencode } from "./opencode-bridge.js";
import { parseAgenteMd } from "../schemas/agent.js";
import { garantirMcpToken, gravarMcpToken } from "../cli/commands/tool.js";

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
  // pid 0/undefined em POSIX significa "grupo de processos do chamador" —
  // kill(0, sinal) derrubaria o PRÓPRIO servidor (e todos os filhos). Nunca sinalize.
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/* ── Isolamento do opencode do opencorp (sem fork) ─────────────────────────
 * Tudo que o opencode do opencorp usa fica DENTRO de ~/.opencorp:
 *   .opencorp/opencode-home/   → cwd/projeto do serve (config do projeto + agentes .opencode/agent)
 *   .opencorp/opencode-data/   → XDG_DATA_HOME (sessões, auth, db, log — isolado do usuário)
 *   .opencorp/opencode-config/ → XDG_CONFIG_HOME (não lê a config global do usuário)
 * O opencode respeita XDG_DATA_HOME/XDG_CONFIG_HOME (verificado empiricamente). */

export function dirOpencodeHome(homeDir: string): string {
  return join(homeDir, ".opencorp", "opencode-home");
}

export function dirOpencodeData(homeDir: string): string {
  return join(homeDir, ".opencorp", "opencode-data");
}

/* ── Chaves de API dos provedores (auth.json do opencode do opencorp) ── */

export const PROVEEDOR_RE = /^[a-z0-9_-]+$/i;

export interface EntradaAuth {
  type?: string;
  key?: string;
}

export function authOpencodePath(homeDir: string): string {
  return join(dirOpencodeData(homeDir), "opencode", "auth.json");
}

/** Preview seguro — a chave NUNCA volta inteira pela API */
export function mascararChave(k: string): string {
  const t = k.trim();
  if (t.length <= 8) return "••••";
  return t.slice(0, 7) + "…" + t.slice(-4);
}

/** Upsert de provider no auth.json (formato do opencode: {provider: {type, key}}) */
export function fundirAuth(
  auth: Record<string, EntradaAuth> | null,
  provider: string,
  key: string,
): Record<string, EntradaAuth> {
  return { ...(auth ?? {}), [provider]: { type: "api", key: key.trim() } };
}

/** auth.json do usuário → data global (bootstrap 1×; o gerenciamento normal é pelo painel) */
function copiarAuthSeNovo(homeDir: string, dataHome: string): void {
  const origem = join(homeDir, ".local", "share", "opencode", "auth.json");
  const destino = join(dataHome, "opencode", "auth.json");
  if (!existsSync(origem)) return;
  try {
    const novo = !existsSync(destino) || statSync(origem).mtimeMs > statSync(destino).mtimeMs;
    if (novo) {
      mkdirSync(dirname(destino), { recursive: true });
      copyFileSync(origem, destino);
    }
  } catch { /* best effort — opencode lida com auth ausente */ }
}

/** data-dir POR WORKSPACE: `~/.opencorp/opencode-data/workspaces/<id>/` — auth e
 *  sessões da empresa isolados das outras e do opencode pessoal do dono. */
export function dirDadosWorkspace(homeDir: string, wsId: string): string {
  return join(dirOpencodeData(homeDir), "workspaces", wsId);
}

/** Overrides de chaves DO workspace (arquivo que o painel edita; o auth.json
 *  gerado nunca é editado à mão — ele é o merge global ⊕ overrides). */
export function authOverridesPathWorkspace(homeDir: string, wsId: string): string {
  return join(dirDadosWorkspace(homeDir, wsId), "opencode", "auth.overrides.json");
}

/** Prepara o auth.json do workspace: merge global ⊕ overrides do workspace
 *  (workspace vence por provedor; global é o fallback). Fonte SEMPRE é o
 *  opencorp — nunca o auth do opencode pessoal do dono. */
export function prepararAuthWorkspace(homeDir: string, wsId: string): string {
  const dir = join(dirDadosWorkspace(homeDir, wsId), "opencode");
  mkdirSync(dir, { recursive: true });
  const authPath = join(dir, "auth.json");
  const overridesPath = authOverridesPathWorkspace(homeDir, wsId);
  const ler = (p: string): Record<string, EntradaAuth> => {
    try {
      const parsed = JSON.parse(readFileSync(p, "utf8")) as Record<string, EntradaAuth>;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch { return {}; }
  };
  const mesclado = { ...ler(authOpencodePath(homeDir)), ...ler(overridesPath) };
  writeFileSync(authPath, `${JSON.stringify(mesclado, null, 2)}\n`);
  return authPath;
}

/** Env isolado para QUALQUER processo opencode spawnado pelo opencorp.
 *  Com wsId: data-dir do workspace (auth = global ⊕ overrides do workspace). */
export function envOpencodeIsolado(homeDir: string, wsId?: string, wsPath?: string): NodeJS.ProcessEnv {
  const configHome = join(homeDir, ".opencorp", "opencode-config");
  const dataHome = wsId ? dirDadosWorkspace(homeDir, wsId) : dirOpencodeData(homeDir);
  mkdirSync(join(dataHome, "opencode"), { recursive: true });
  mkdirSync(join(configHome, "opencode"), { recursive: true });
  if (wsId) {
    prepararAuthWorkspace(homeDir, wsId);
  } else {
    copiarAuthSeNovo(homeDir, dataHome);
  }
  return {
    ...process.env,
    OPENCORP_HOME: homeDir,
    ...(wsId ? { OPENCORP_WORKSPACE: wsId } : {}),
    ...(wsPath ? { OPENCORP_WORKSPACE_DIR: wsPath } : {}),
    XDG_DATA_HOME: dataHome,
    XDG_CONFIG_HOME: configHome,
  };
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

async function esperarPortaResponder(porta: number, homeDir: string, timeoutMs = 25000): Promise<void> {
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

/**
 * Adota um "órfão saudável": instância que sobreviveu a um boot abortado (pidfile perdido).
 * Procura no log do servidor a última linha `opencorp-ativa {...}` escrita após health-check OK;
 * se o pid continua vivo e a porta responde, regrava o pidfile e reusa a instância.
 */
async function adotarOrfaoSaudavel(homeDir: string): Promise<OpencodeServerInfo | null> {
  const logPath = join(homeDir, "logs", "opencode-server.log");
  if (!existsSync(logPath)) return null;
  let texto: string;
  try {
    texto = readFileSync(logPath, "utf8");
  } catch {
    return null;
  }
  const linhas = texto.split("\n").filter((l) => l.includes("opencorp-ativa"));
  for (let i = linhas.length - 1; i >= 0; i--) {
    try {
      const info = JSON.parse(linhas[i].slice(linhas[i].indexOf("{"))) as OpencodeServerInfo;
      if (!info.pid || !info.porta) continue;
      if (!(await processoVivo(info.pid))) break; // última ativa morreu — nada mais recente para adotar
      try {
        const res = await fetch(`http://127.0.0.1:${info.porta}/health`, { signal: AbortSignal.timeout(2000) });
        if (res.ok || res.status === 401 || res.status === 404) return info;
      } catch {
        break; // pid vivo mas porta sem resposta — não adotar
      }
    } catch {
      continue; // linha corrompida — tenta a anterior
    }
  }
  return null;
}

function binOpencodePath(): string {
  const aqui = dirname(fileURLToPath(import.meta.url));
  const bin = resolve(aqui, "..", "..", "bin", "opencorp.mjs");
  return bin;
}

async function garantirOpencodeConfig(homeDir: string, homeOpencorp: string): Promise<boolean> {
  const configPath = join(homeDir, "opencode.json");
  if (existsSync(configPath)) return false;

  const binPath = binOpencodePath();
  if (!existsSync(binPath)) {
    console.warn(`[opencode-server] bin não encontrado em ${binPath} — MCP não configurado`);
    return false;
  }

  // token do MCP (fail-closed): mesma fonte usada por `opencorp mcp serve`.
  // O filho do MCP herda OPENCORP_HOME=<homeDir> (environment abaixo), então ele
  // valida o token contra <homeDir>/.opencorp/mcp-token — garanta o MESMO token lá.
  const token = garantirMcpToken(homeOpencorp);
  gravarMcpToken(homeDir, token);

  const config = {
    $schema: "https://opencode.ai/config.json",
    // padrão do opencorp: modelos free (não usa a config global do usuário, que pode apontar modelo pago)
    model: "opencode/nemotron-3-ultra-free",
    small_model: "opencode/nemotron-3-ultra-free",
    mcp: {
      opencorp: {
        type: "local",
        command: ["node", binPath, "mcp", "serve", "--token", token],
        environment: { OPENCORP_HOME: homeDir },
      },
    },
  };

  const dir = dirname(configPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return true;
}

/** Agentes do secretário: home isolado (cwd do serve) + sync por workspace via bridge */
async function garantirAgentesSecretario(homeDir: string): Promise<AgentesConfig> {
  const manager = new WorkspaceManager({ homeDir });
  const workspaces = await manager.listar();
  const templateDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "templates", "default", ".opencorp", "agents");
  const bridge = new OpenCodeBridge();
  let total = 0;
  const wsNomes: string[] = [];

  // override opcional do modelo via settings (secretary.model) — default: o do template
  let modeloOverride: string | undefined;
  try {
    const resolucao = await new SettingsStore({ homeDir }).resolve();
    modeloOverride = resolucao.settings?.secretary?.model;
  } catch { /* settings ausente/inválida → usa o do template */ }

  const agentDir = join(dirOpencodeHome(homeDir), ".opencode", "agent");
  mkdirSync(agentDir, { recursive: true });

  // home isolado: .md direto em <opencode-home>/.opencode/agent/ — NUNCA em $HOME/.opencode
  // (o symlink $HOME/.opencode era o vazamento para o opencode global do usuário)
  for (const agente of ["secretario", "secretario-exec"]) {
    const origem = join(templateDir, `${agente}.md`);
    if (!existsSync(origem)) {
      console.warn(`[opencode-server] template ${agente}.md não encontrado em ${origem}`);
      continue;
    }
    const { frontmatter, corpo } = parseAgenteMd(readFileSync(origem, "utf8"));
    const fm = modeloOverride ? { ...frontmatter, model: modeloOverride } : frontmatter;
    writeFileSync(join(agentDir, `${fm.id ?? agente}.md`), gerarAgenteOpencode(fm, corpo.replaceAll("{{workspace}}", "opencorp")));
    for (const ws of workspaces) {
      if (!ws.existe) continue;
      await bridge.sincronizarAgente(ws.path, fm, corpo);
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

/* ── Formato das mensagens do opencode (≥1.18: GET /session/:id/message) ── */

export interface ParteOc {
  type: string;
  text?: string;
  /** parts do tipo "tool" */
  tool?: string;
  state?: { status?: string; title?: string; input?: unknown };
}

export interface MensagemOc {
  info?: { id?: string; role?: string; time?: { created?: number; completed?: number } };
  parts?: ParteOc[];
}

/** Ação de tool do secretário(-exec) para exibição ao vivo no chat */
export interface AcaoOpencode {
  tool: string;
  status: string;
  resumo?: string;
}

/** Primeiro valor string do input da tool (titulo, pergunta, ordem…), truncado */
export function resumoDeInput(input: unknown, titulo: string | undefined, max = 64): string | undefined {
  if (typeof titulo === "string" && titulo.trim()) return titulo.trim().slice(0, max);
  if (input && typeof input === "object") {
    for (const valor of Object.values(input as Record<string, unknown>)) {
      if (typeof valor === "string" && valor.trim()) return valor.trim().slice(0, max);
      if (Array.isArray(valor)) {
        const s = valor.find((v) => typeof v === "string" && v.trim());
        if (typeof s === "string") return s.trim().slice(0, max);
      }
    }
  }
  return undefined;
}

/**
 * Extrai as ações (tool calls) das mensagens assistant NOVAS de um turno —
 * tudo depois da msg assistant `desdeId` (baseline da conversa). Mensagens
 * append-only do opencode: o índice do baseline é estável entre polls.
 */
export function extrairAcoesMensagens(
  mensagens: MensagemOc[],
  desdeId: string | null | undefined,
  limite = 12,
): { total: number; itens: AcaoOpencode[] } {
  const inicio = desdeId ? mensagens.findIndex((m) => m.info?.id === desdeId) : -1;
  const novas = inicio >= 0 ? mensagens.slice(inicio + 1) : mensagens;
  let total = 0;
  const itens: AcaoOpencode[] = [];
  for (const m of novas) {
    if (m.info?.role !== "assistant") continue;
    total++;
    for (const p of m.parts ?? []) {
      if (p.type !== "tool" || !p.tool) continue;
      if (itens.length < limite) {
        itens.push({
          tool: p.tool,
          status: p.state?.status ?? "pending",
          resumo: resumoDeInput(p.state?.input, p.state?.title),
        });
      }
    }
  }
  return { total, itens };
}

export interface PassoChat {
  tipo: "pensamento" | "acao" | "texto";
  texto?: string;
  ferramenta?: string;
  resumo?: string;
  sucesso?: boolean;
}

/**
 * Extrai a sequência cronológica exata de passos (pensamentos, ações e textos)
 * de uma lista de mensagens do assistente.
 */
export function extrairPassosMensagens(novasMsgs: MensagemOc[]): PassoChat[] {
  const passos: PassoChat[] = [];
  for (const m of novasMsgs) {
    if (m.info?.role !== "assistant") continue;
    for (const p of m.parts ?? []) {
      if (p.type === "reasoning" || p.type === "thinking") {
        const txt = (
          p.text ??
          (p as any).thought ??
          (p as any).metadata?.thought ??
          (p as any).metadata?.reasoning ??
          ""
        ).trim();
        if (txt) {
          const ult = passos[passos.length - 1];
          if (ult && ult.tipo === "pensamento") {
            ult.texto = `${ult.texto}\n\n${txt}`;
          } else {
            passos.push({ tipo: "pensamento", texto: txt });
          }
        }
      } else if (p.type === "tool" && p.tool) {
        passos.push({
          tipo: "acao",
          ferramenta: p.tool,
          resumo: resumoDeInput(p.state?.input, p.state?.title),
          sucesso: p.state?.status !== "error",
        });
      } else if (p.type === "text") {
        let bruto = p.text ?? "";
        // Detecta e extrai tags <think> ou <thought> incorporadas no texto
        const thinkMatch = /<(?:think|thought)>([\s\S]*?)(?:<\/(?:think|thought)>|$)/i.exec(bruto);
        if (thinkMatch) {
          const pensamentoTxt = (thinkMatch[1] ?? "").trim();
          if (pensamentoTxt) {
            const ult = passos[passos.length - 1];
            if (ult && ult.tipo === "pensamento") {
              ult.texto = `${ult.texto}\n\n${pensamentoTxt}`;
            } else {
              passos.push({ tipo: "pensamento", texto: pensamentoTxt });
            }
          }
          bruto = bruto.replace(/<(?:think|thought)>[\s\S]*?(?:<\/(?:think|thought)>|$)/gi, "").trim();
        }

        const txt = bruto.trim();
        if (txt) {
          const ult = passos[passos.length - 1];
          if (ult && ult.tipo === "texto") {
            ult.texto = `${ult.texto}\n\n${txt}`;
          } else {
            passos.push({ tipo: "texto", texto: txt });
          }
        }
      }
    }
  }
  return passos;
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

    // pidfile perdido/inválido mas há instância saudável de boot anterior → adota em vez de duplicar
    const orfao = await adotarOrfaoSaudavel(this.homeDir);
    if (orfao) {
      await gravarPidfile(this.homeDir, orfao);
      return { pid: orfao.pid, porta: orfao.porta };
    }

    const porta = await portaLivre();
    const logPath = join(this.homeDir, "logs", "opencode-server.log");
    const logDir = dirname(logPath);
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });

    // home isolado = cwd/projeto do serve (config do projeto + agentes ficam em ~/.opencorp)
    const opHome = dirOpencodeHome(this.homeDir);
    mkdirSync(opHome, { recursive: true });
    await garantirOpencodeConfig(opHome, this.homeDir);
    const agentes = await garantirAgentesSecretario(this.homeDir);

    const argv = ["serve", "--port", String(porta), "--hostname", "127.0.0.1"];
    const options: SpawnOptions = {
      cwd: opHome,
      env: envOpencodeIsolado(this.homeDir),
      detached: true,
      // stdout/stderr do filho vão para o log (antes era "ignore" — boot quebrado não deixava rastro)
      stdio: ["ignore", openSync(logPath, "a"), openSync(logPath, "a")],
    };

    const child = spawn(this.binario, argv, options);
    const pid = child.pid ?? 0;
    child.unref();

    // Falha do spawn (binário ausente/fora do PATH/não executável): marca o
    // erro para falhar RÁPIDO em vez de girar esperarPortaResponder por 25s.
    const erroSpawn: { msg: string | null } = { msg: null };
    child.on("error", (err) => {
      erroSpawn.msg = err.message;
      eventBus.emit("secretario.erro", { pid, porta, erro: err.message });
    });

    const info: OpencodeServerInfo = { pid, porta, iniciado_em: new Date().toISOString() };
    if (pid <= 0) {
      // spawn nem chegou a criar processo — nada a esperar nem a matar
      await removerPidfile(this.homeDir);
      throw new Error(
        `opencode não pôde ser spawnado (${this.binario}) — verifique PATH/execução (log: ${logPath})`,
      );
    }
    await gravarPidfile(this.homeDir, info);

    try {
      let concluido = false;
      await Promise.race([
        esperarPortaResponder(porta, this.homeDir).then((r) => { concluido = true; return r; }),
        (async () => {
          while (!erroSpawn.msg && !concluido) await sleep(150);
          if (erroSpawn.msg) throw new Error(`spawn do secretário falhou: ${erroSpawn.msg} — verifique PATH/execução (log: ${logPath})`);
        })(),
      ]);
    } catch (erro) {
      // boot falhou: matar o filho para não virar órfão em porta aleatória
      // (pid > 0 garantido — processoVivo nunca sinaliza pid 0: grupo de processos)
      try {
        if (await processoVivo(pid)) process.kill(pid, "SIGTERM");
      } catch {
        /* filho já morreu */
      }
      await removerPidfile(this.homeDir);
      throw erro;
    }

    // marca a instância como saudável no log (permite adoção se o pidfile se perder)
    try {
      appendFileSync(logPath, `opencorp-ativa ${JSON.stringify(info)}\n`);
    } catch {
      /* log é best-effort */
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
    const configPath = join(dirOpencodeHome(this.homeDir), "opencode.json");
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