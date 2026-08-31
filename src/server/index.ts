import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { join, resolve, relative, isAbsolute } from "node:path";
import { stat, readdir, readFile } from "node:fs/promises";
import { existsSync, statSync, readFileSync } from "node:fs";
import { WorkspaceManager } from "../core/workspace-manager.js";
import { writeFileAtomic } from "../utils/fs-safe.js";
import { opencorpHome } from "../utils/paths.js";
import { AgentStore } from "../core/agent-store.js";
import { SessionManager, type OpcoesRun, type ResultadoRun } from "../core/session-manager.js";
import { RegistryStore } from "../core/registry-store.js";
import { BudgetManager } from "../core/budget-manager.js";
import { ApprovalsStore } from "../core/approvals-store.js";
import { SettingsError, SettingsStore } from "../core/settings-store.js";
import { FlowStore, type SessaoFlow } from "../core/flow-store.js";
import { MeetingManager } from "../core/meeting-manager.js";
import { TaskStore, type Task } from "../core/task-store.js";
import { Scheduler } from "../core/scheduler.js";
import type { Agenda } from "../core/scheduler.js";
import { HookStore, type Hook, type AlvoHook, type PayloadHook } from "../core/hook-store.js";
import { AppStore } from "../core/app-store.js";
import { TeamStore } from "../core/team-store.js";
import { OrquestradorDeTeams } from "../core/team-orchestrator.js";
import { instalarMencoes } from "../core/mention-runner.js";
import { TaskError, SchedulerError, HookError, AppError, TeamError } from "../core/errors.js";
import { eventBus, type EventoBus } from "../core/event-bus.js";
import { AgentError, OpencorpError, RegistryError, WorkspaceError } from "../core/errors.js";
import { OpencodeServerManager, SecretarioError } from "../core/opencode-server.js";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json") as { version: string };
import { createRequire } from "node:module";

/** Definição de rotas para documentação OpenAPI e sugestões de 404 */
interface DefinicaoRota {
  method: string;
  path: string;
  descricao: string;
  corpo?: boolean;
  publico?: boolean;
}

const ROUTES: DefinicaoRota[] = [
  { method: "GET", path: "/health", descricao: "Verifica saúde do servidor e versão", publico: true },
  { method: "GET", path: "/status", descricao: "Saúde agregada: scheduler daemon + secretário" },
  { method: "GET", path: "/doc", descricao: "Especificação OpenAPI 3.0 de todas as rotas", publico: true },
  { method: "GET", path: "/workspaces", descricao: "Lista workspaces disponíveis" },
  { method: "POST", path: "/workspaces", descricao: "Cria novo workspace", corpo: true },
  { method: "GET", path: "/workspaces/current", descricao: "Retorna workspace atual" },
  { method: "GET", path: "/agents", descricao: "Lista agentes do workspace" },
  { method: "POST", path: "/agents", descricao: "Cria novo agente", corpo: true },
  { method: "POST", path: "/agents/:id/run", descricao: "Executa agente com ordem", corpo: true },
  { method: "GET", path: "/sessions", descricao: "Lista execuções/sessões" },
  { method: "GET", path: "/sessions/:id/log", descricao: "Retorna log de uma execução" },
  { method: "GET", path: "/registries/:categoria", descricao: "Lista registros de uma categoria" },
  { method: "POST", path: "/registries/:categoria", descricao: "Cria registro em uma categoria", corpo: true },
  { method: "GET", path: "/registries/:categoria/:id", descricao: "Obtém um registro específico" },
  { method: "PUT", path: "/registries/:categoria/:id", descricao: "Atualiza conteúdo de um registro", corpo: true },
  { method: "GET", path: "/approvals", descricao: "Lista aprovações pendentes" },
  { method: "POST", path: "/approvals/:id/approve", descricao: "Aprova uma solicitação" },
  { method: "POST", path: "/approvals/:id/reject", descricao: "Rejeita uma solicitação", corpo: true },
  { method: "GET", path: "/budget/status", descricao: "Status e limites do orçamento" },
  { method: "POST", path: "/budget/set", descricao: "Define limites de orçamento", corpo: true },
  { method: "GET", path: "/settings", descricao: "Lista configurações" },
  { method: "GET", path: "/settings/:chave", descricao: "Obtém uma configuração específica" },
  { method: "PUT", path: "/settings", descricao: "Define uma configuração", corpo: true },
  { method: "GET", path: "/secrets", descricao: "Lista NOMES de segredos (valores nunca expostos)" },
  { method: "PUT", path: "/secrets/:chave", descricao: "Define/altera um segredo", corpo: true },
  { method: "DELETE", path: "/secrets/:chave", descricao: "Remove um segredo" },
  { method: "GET", path: "/tools", descricao: "Lista ferramentas declarativas do workspace (.opencorp/tools/*.json — só a spec, sem executar)" },
  { method: "GET", path: "/flows", descricao: "Lista flows disponíveis" },
  { method: "POST", path: "/flows", descricao: "Cria novo flow", corpo: true },
  { method: "GET", path: "/flows/:id", descricao: "Obtém detalhes de um flow" },
  { method: "POST", path: "/flows/:id/run", descricao: "Executa um flow", corpo: true },
  { method: "POST", path: "/meetings", descricao: "Inicia nova reunião", corpo: true },
  { method: "GET", path: "/meetings", descricao: "Lista reuniões do workspace" },
  { method: "POST", path: "/meetings/:id/stop", descricao: "Solicita interrupção de reunião ativa" },
  { method: "GET", path: "/events", descricao: "Stream SSE de eventos do servidor" },
  { method: "GET", path: "/files", descricao: "Lista diretório ou lê arquivo do workspace", publico: false },
  { method: "GET", path: "/hooks", descricao: "Lista hooks do workspace" },
  { method: "POST", path: "/hooks", descricao: "Cria hook de entrada", corpo: true },
  { method: "GET", path: "/hooks/:id", descricao: "Detalhes do hook (inclui token)" },
  { method: "DELETE", path: "/hooks/:id", descricao: "Exclui hook" },
  { method: "POST", path: "/hooks/:workspace/:id", descricao: "Disparo público do hook (header x-opencorp-token)" },
  { method: "GET", path: "/apps", descricao: "Lista mini-apps do workspace" },
  { method: "GET", path: "/apps/:id/spec", descricao: "Spec declarativo de um app" },
  { method: "POST", path: "/apps", descricao: "Cria/salva spec de app (validado)", corpo: true },
  { method: "DELETE", path: "/apps/:id", descricao: "Exclui app" },
  { method: "GET", path: "/teams", descricao: "Lista teams do workspace" },
  { method: "POST", path: "/teams", descricao: "Cria/salva spec de team (validado)", corpo: true },
  { method: "GET", path: "/teams/:id", descricao: "Obtém spec de um team" },
  { method: "DELETE", path: "/teams/:id", descricao: "Exclui team" },
  { method: "POST", path: "/teams/:id/run", descricao: "Executa team via orquestrador", corpo: true },
  { method: "GET", path: "/secretario/status", descricao: "Status do secretário (opencode server)", publico: false },
  { method: "POST", path: "/secretario/start", descricao: "Inicia o secretário (opencode serve)", corpo: false },
  { method: "POST", path: "/secretario/stop", descricao: "Para o secretário", corpo: false },
  { method: "GET", path: "/secretario/sessoes", descricao: "Lista sessões do opencode (proxy)", publico: false },
  { method: "GET", path: "/secretario/sessoes/:id/mensagens", descricao: "Mensagens de uma sessão (proxy, normalizado [{role,content}])", publico: false },
  { method: "POST", path: "/secretario/conversa", descricao: "Envia mensagem ao secretário (proxy create session + message)", corpo: true },
  { method: "GET", path: "/secretario/sessoes/:id", descricao: "Detalhe/mensagens de uma sessão do opencode (proxy)", publico: false },
];

export interface SessaoApi {
  rodar(opcoes: OpcoesRun): Promise<ResultadoRun>;
  listarExecucoes(wsPath: string, filtro?: { agente?: string }): Promise<unknown[]>;
  logDe(wsPath: string, id: string): Promise<string>;
}

export interface ApiServerOptions {
  homeDir?: string;
  cwd?: string;
  sessoes?: SessaoApi;
  token?: string;
  workspace?: string;
  instalarMencoes?: boolean;
  opencodeServer?: OpencodeServerManager;
}


/** Gera especificação OpenAPI 3.0 a partir do array ROUTES */
function gerarOpenApiSpec(): object {
  const paths: Record<string, object> = {};
  for (const rota of ROUTES) {
    const pathKey = rota.path;
    if (!paths[pathKey]) paths[pathKey] = {};
    const method = rota.method.toLowerCase();
    const isPublic = rota.publico === true;
    (paths[pathKey] as Record<string, object>)[method] = {
      summary: rota.descricao,
      operationId: `${method}_${pathKey.replace(/[/:]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")}`,
      security: isPublic ? [] : [{ bearerAuth: [] }],
      responses: {
        "200": { description: "Sucesso", content: { "application/json": { schema: { type: "object" } } } },
        "401": { description: "Token ausente ou inválido" },
        "404": { description: "Não encontrado" },
        "500": { description: "Erro interno" },
      },
      ...(rota.corpo && {
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
      }),
    };
  }
  return {
    openapi: "3.0.3",
    info: { title: "opencorp API", version, description: "API REST do opencorp — sistema operacional de empresas autônomas" },
    servers: [{ url: "http://localhost", description: "Servidor local (porta dinâmica)" }],
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
    },
    paths,
  };
}

/** Calcula similaridade simples entre strings (Levenshtein aproximado) para sugestões de 404 */
function similaridade(a: string, b: string): number {
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  if (al === bl) return 1;
  if (al.includes(bl) || bl.includes(al)) return 0.8;
  let matches = 0;
  for (let i = 0; i < Math.min(al.length, bl.length); i++) if (al[i] === bl[i]) matches++;
  return matches / Math.max(al.length, bl.length);
}

/** Sugere rotas parecidas para mensagem de erro 404 */
function sugerirRotas(rota: string, max = 3): string[] {
  return ROUTES
    .map((r) => ({ path: r.path, score: similaridade(rota, r.path) }))
    .filter((r) => r.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((r) => r.path);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Valida e resolve caminho dentro do workspace (anti path-traversal) */
async function resolverCaminhoWorkspace(wsPath: string, pathParam: string): Promise<string> {
  const base = resolve(wsPath);
  const solicitado = pathParam ? decodeURIComponent(pathParam) : "";
  // Normaliza: remove prefixo "./" e múltiplos // — mas preserva dot-files (.opencorp)
  const normalizado = solicitado.replace(/^\.\//, "").replace(/\/+/g, "/");
  const alvo = resolve(base, normalizado);
  // Verifica se está dentro do workspace (path traversal protection)
  const relativo = relative(base, alvo);
  if (relativo.startsWith("..") || isAbsolute(relativo)) {
    throw new WorkspaceError("caminho fora do workspace (path traversal bloqueado)", { exitCode: 3 });
  }
  return alvo;
}

/** Lê arquivo com limite de 512KB, retorna {tipo, conteudo} ou {tipo, conteudo: null, motivo} */
async function lerArquivoWorkspace(alvo: string): Promise<{ tipo: "arquivo"; conteudo: string | null; motivo?: string }> {
  const info = await stat(alvo);
  if (info.size > 512 * 1024) {
    return { tipo: "arquivo", conteudo: null, motivo: "arquivo excede 512KB" };
  }
  const ext = alvo.slice(alvo.lastIndexOf(".")).toLowerCase();
  const extPermitidas = [".md", ".json", ".txt", ".jsonl", ".log"];
  if (!extPermitidas.includes(ext)) {
    return { tipo: "arquivo", conteudo: null, motivo: "binário" };
  }
  const conteudo = await readFile(alvo, "utf8");
  return { tipo: "arquivo", conteudo };
}

/**
 * Serve a UI estática de web-dist/ (HTML, JS, CSS) — 404 via null.
 *
 * Obs: NÃO injetamos cache-buster (?v=...) no <script> porque o ES Module
 * cacheia por URL completa — o import dinâmico relativo "./main.js" usado
 * internamente resolve sem o query string e vira uma SEGUNDA instância de
 * módulo (boot Roda duas vezes, ícones duplicam, estado fica inconsistente).
 * O cache-control: no-cache já garante reload do HTML/JS no boot.
 */

function servirEstatico(rota: string): { tipo: string; corpo: string } | null {
  try {
    const raiz = resolve(import.meta.dirname ?? ".", "..", "..", "web-dist");
    const caminhoRel = rota === "/" ? "index.html" : rota.replace(/^\/+/, "");
    const alvo = resolve(raiz, caminhoRel);
    if (!alvo.startsWith(raiz)) return null;
    if (!existsSync(alvo) || !statSync(alvo).isFile()) {
      if (caminhoRel.includes(".")) return null;
      return { tipo: "text/html; charset=utf-8", corpo: readFileSync(join(raiz, "index.html"), "utf8") };
    }
    const ext = caminhoRel.split(".").pop() ?? "";
    const tipos: Record<string, string> = {
      html: "text/html; charset=utf-8",
      js: "text/javascript",
      css: "text/css",
      json: "application/json",
      svg: "image/svg+xml",
      png: "image/png",
      ico: "image/x-icon",
    };
    if (ext === "html") {
      return { tipo: tipos[ext]!, corpo: readFileSync(alvo, "utf8") };
    }
    return { tipo: tipos[ext] ?? "application/octet-stream", corpo: readFileSync(alvo, "utf8") };
  } catch {
    return null;
  }
}

function statusHttpDe(erro: unknown): number {
  const code = (erro as { exitCode?: number }).exitCode;
  if (code === 3) return 403;
  if (code === 4) return 402;
  if (code === 5) return 409;
  if (erro instanceof TaskError) return (erro as TaskError).status ?? 400;
  if (erro instanceof TeamError) return (erro as TeamError).status ?? 400;
  if (erro instanceof SchedulerError) return 400;
  if (erro instanceof HookError) return ((erro as unknown as { status?: number }).status ?? 400);
  if (erro instanceof AppError) return ((erro as unknown as { status?: number }).status ?? 404);
  if (erro instanceof RegistryError || erro instanceof WorkspaceError || erro instanceof AgentError) return 422;
  if (erro instanceof SecretarioError) return (erro as SecretarioError).status ?? 500;
  return 500;
}

function enviar(res: ServerResponse, status: number, corpo: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "authorization,content-type",
  });
  res.end(JSON.stringify(corpo));
}

function enviarErro(res: ServerResponse, erro: unknown): void {
  if (erro instanceof SyntaxError) {
    enviar(res, 422, { erro: `JSON inválido no corpo: ${erro.message}` });
    return;
  }
  if (erro instanceof SettingsError) {
    enviar(res, 404, { erro: erro.message, chave: erro.chave });
    return;
  }
  if (erro instanceof OpencorpError) {
    enviar(res, statusHttpDe(erro), { erro: erro.message });
    return;
  }
  enviar(res, 500, { erro: erro instanceof Error ? erro.message : String(erro) });
}

async function lerCorpo(req: IncomingMessage): Promise<unknown> {
  const partes: Buffer[] = [];
  for await (const parte of req) partes.push(parte as Buffer);
  const texto = Buffer.concat(partes).toString("utf8").trim();
  if (!texto) return {};
  return JSON.parse(texto) as unknown;
}

function gerarIdExec(): string {
  return `exec-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function iniciarPollExecucoes(
  workspaces: WorkspaceManager,
  registros: RegistryStore,
  intervaloMs = 2000,
): NodeJS.Timeout {
  const vistos = new Map<string, string>();
  let semeado = false;
  return setInterval(() => {
    void (async () => {
      try {
        const ws = await workspaces.resolver(undefined);
        const metas = await registros.listar(ws.path, "execucoes");
        for (const meta of metas) {
          const extras = (meta.extras ?? {}) as { status?: string };
          const status = extras.status ?? "desconhecido";
          if (!semeado) {
            vistos.set(meta.id, status);
            continue;
          }
          const anterior = vistos.get(meta.id);
          if (anterior !== status) {
            vistos.set(meta.id, status);
            if (anterior !== undefined || status !== "executando") {
              eventBus.emit("sessao", { id: meta.id, agente: meta.criado_por, status, origem: "poll" });
              if (status === "concluido" || status === "falhou") {
                eventBus.emit("sessao.concluida", { id: meta.id, agente: meta.criado_por, status });
              }
            }
          }
        }
        semeado = true;
      } catch {
        /* sem workspace ativo — tenta no próximo tick */
      }
    })();
  }, intervaloMs);
}

export function createApiServer(opcoes: ApiServerOptions = {}): {
  server: Server;
  token: string;
  porta: Promise<number>;
} {
  const base = { homeDir: opcoes.homeDir, cwd: opcoes.cwd };
  const workspaces = new WorkspaceManager(base);
  const agentes = new AgentStore({ templatesDir: opcoes.homeDir ? join(opcoes.homeDir, "templates") : undefined });
  const registros = new RegistryStore();
  const budget = new BudgetManager(base);
  const approvals = new ApprovalsStore();
  const settings = new SettingsStore(base);
  const flows = new FlowStore({ ...base, sessoes: opcoes.sessoes as unknown as SessaoFlow | undefined });
  const meetings = new MeetingManager({ ...base, sessoes: opcoes.sessoes as never });
  const tasks = new TaskStore();
  const scheduler = new Scheduler({ homeDir: opcoes.homeDir });
  const apps = new AppStore();
  const teams = new TeamStore();
  const orquestrador = new OrquestradorDeTeams();
  const hooks = new HookStore({
    executores: {
      agentRun: async (agente: string, ordem: string, wsPath: string) => {
        const r = await sessoes.rodar({
          agente,
          ordem,
          workspaceDir: wsPath,
          execId: gerarIdExec(),
        } as OpcoesRun);
        return { id: r.id, captura: r.captura };
      },
      flowRun: async (flow: string, entrada: string, wsPath: string) => {
        const r = await flows.executar(wsPath, flow, { entrada });
        return { id: r.execId, captura: r.contextoFinal };
      },
    },
  });
  const sessoes: SessaoApi = opcoes.sessoes ?? (new SessionManager(base) as unknown as SessaoApi);

  if (opcoes.instalarMencoes !== false) {
    instalarMencoes({
      executores: {
        rodar: async (agente: string, ordem: string, wsPath: string) => {
          const r = await sessoes.rodar({
            agente,
            ordem,
            workspaceDir: wsPath,
            execId: gerarIdExec(),
          } as OpcoesRun);
          return { id: r.id, captura: r.captura };
        },
      },
    });
  }

  const token = opcoes.token ?? randomBytes(24).toString("hex");

  // OpencodeServerManager para o secretário (injetaável para testes)
  const opencodeServer = opcoes.opencodeServer ?? new OpencodeServerManager({ homeDir: opcoes.homeDir });

  async function resolverWs(url: URL): Promise<{ id: string; path: string }> {
    const id = url.searchParams.get("workspace") ?? opcoes.workspace ?? undefined;
    return workspaces.resolver(id) as unknown as { id: string; path: string };
  }

  const server: Server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://local");
      const rota = url.pathname;

      if (req.method === "OPTIONS") {
        enviar(res, 204, {});
        return;
      }
      // ── UI estática PÚBLICA (a UI pede o token; os dados continuam protegidos) ──
      if (req.method === "GET" && (rota === "/" || /\.[a-z0-9]+$/i.test(rota)) && rota !== "/events" && !rota.startsWith("/settings/") && rota !== "/doc") {
        const estatico = servirEstatico(rota);
        if (estatico !== null) {
          res.writeHead(200, { "content-type": estatico.tipo, "access-control-allow-origin": "*", "cache-control": "no-cache" });
          res.end(estatico.corpo);
          return;
        }
      }
      if (rota === "/health") {
        enviar(res, 200, { ok: true, versao: version });
        return;
      }
      // GET /status — saúde agregada (scheduler daemon + secretário)
      if (rota === "/status" && req.method === "GET") {
        const home = opcoes.homeDir ?? opencorpHome();
        let scheduler = false;
        try {
          const pidInfo = JSON.parse(readFileSync(join(home, ".opencorp", "scheduler.pid"), "utf8")) as { pid?: number };
          if (typeof pidInfo.pid === "number") {
            try { process.kill(pidInfo.pid, 0); scheduler = true; } catch (e) {
              scheduler = (e as NodeJS.ErrnoException).code === "EPERM";
            }
          }
        } catch {}
        let secretario = false;
        try { secretario = (await opencodeServer.status()).rodando === true; } catch {}
        enviar(res, 200, { scheduler, secretario });
        return;
      }
      // GET /doc — público (sem auth), retorna OpenAPI 3.0
      if (rota === "/doc" && req.method === "GET") {
        enviar(res, 200, gerarOpenApiSpec());
        return;
      }
      const tokenQuery = url.searchParams.get("token") ?? "";
      const rotaHookPublica = /^\/hooks\/[^/]+\/[^/]+$/.test(rota);
      const autenticado =
        (req.headers.authorization ?? "") === `Bearer ${token}` ||
        tokenQuery === token ||
        rotaHookPublica; // rota pública de disparo tem auth própria (x-opencorp-token)
      if (!autenticado) {
        enviar(res, 401, { erro: "token ausente ou inválido — Authorization: Bearer <token>" });
        return;
      }

      try {
        // ── workspaces ──────────────────────────────────────────────
        if (rota === "/workspaces" && req.method === "GET") {
          enviar(res, 200, await workspaces.listar());
          return;
        }
        if (rota === "/workspaces" && req.method === "POST") {
          const corpo = (await lerCorpo(req)) as {
            id?: string;
            perfil?: { empresa?: string; nicho?: string; publico?: string; tom?: string; tom_evitar?: unknown[]; topicos?: unknown[]; diferenciais?: unknown[] };
          };
          const criado = await workspaces.criar(corpo.id ?? "");
          // Perfil editorial opcional → grava .opencorp/projeto.json no workspace
          // (mesmo schema consumido pelos flows de conteúdo). Compat: sem perfil = comportamento atual.
          if (corpo.perfil && typeof corpo.perfil === "object") {
            const p = corpo.perfil;
            const projeto: Record<string, unknown> = {
              empresa: String(p.empresa ?? criado.id),
              nicho: String(p.nicho ?? ""),
              publico: String(p.publico ?? ""),
              tom: String(p.tom ?? ""),
              tom_evitar: Array.isArray(p.tom_evitar) ? p.tom_evitar.map(String) : [],
              topicos_editoriais: Array.isArray(p.topicos) ? p.topicos.map(String) : [],
            };
            if (Array.isArray(p.diferenciais)) projeto.diferenciais = p.diferenciais.map(String);
            writeFileAtomic(join(criado.path, ".opencorp", "projeto.json"), `${JSON.stringify(projeto, null, 2)}\n`);
          }
          enviar(res, 201, { id: criado.id, caminho: criado.path });
          return;
        }
        if (rota === "/workspaces/current" && req.method === "GET") {
          const ws = await resolverWs(url);
          enviar(res, 200, { id: ws.id, caminho: ws.path });
          return;
        }

        // ── agentes ─────────────────────────────────────────────────
        if (rota === "/agents" && req.method === "GET") {
          const ws = await resolverWs(url);
          enviar(res, 200, await agentes.listar(ws.path));
          return;
        }
        if (rota === "/agents" && req.method === "POST") {
          const ws = await resolverWs(url);
          const corpo = (await lerCorpo(req)) as { id?: string; from?: string; model?: string };
          const criado = await agentes.criar(ws.path, corpo.id ?? "", { de: corpo.from, model: corpo.model });
          enviar(res, 201, { id: criado.frontmatter.id, modelo: criado.frontmatter.model });
          return;
        }
        const mAgenteRun = /^\/agents\/([^/]+)\/run$/.exec(rota);
        if (mAgenteRun && req.method === "POST") {
          const ws = await resolverWs(url);
          const corpo = (await lerCorpo(req)) as { ordem?: string; model?: string };
          const execId = gerarIdExec();
          const opcoes: OpcoesRun = {
            agente: decodeURIComponent(mAgenteRun[1]!),
            ordem: corpo.ordem ?? "",
            model: corpo.model,
            workspaceDir: ws.path,
            workspaceId: ws.id,
            execId,
          };
          void sessoes.rodar(opcoes).catch(() => undefined);
          enviar(res, 202, { exec_id: execId, status: "iniciado" });
          return;
        }

        // ── sessões ─────────────────────────────────────────────────
        if (rota === "/sessions" && req.method === "GET") {
          const ws = await resolverWs(url);
          const agente = url.searchParams.get("agent") ?? undefined;
          enviar(res, 200, await sessoes.listarExecucoes(ws.path, agente ? { agente } : undefined));
          return;
        }
        const mSessaoLog = /^\/sessions\/([^/]+)\/log$/.exec(rota);
        if (mSessaoLog && req.method === "GET") {
          const ws = await resolverWs(url);
          const id = decodeURIComponent(mSessaoLog[1]!);
          enviar(res, 200, { id, log: await sessoes.logDe(ws.path, id) });
          return;
        }

        // ── registros ───────────────────────────────────────────────
        const mReg = /^\/registries\/([^/]+)(?:\/([^/]+))?$/.exec(rota);
        if (mReg) {
          const ws = await resolverWs(url);
          const cat = decodeURIComponent(mReg[1]!);
          const regId = mReg[2] ? decodeURIComponent(mReg[2]) : undefined;
          if (!regId && req.method === "GET") {
            enviar(res, 200, await registros.listar(ws.path, cat));
            return;
          }
          if (!regId && req.method === "POST") {
            const corpo = (await lerCorpo(req)) as { id?: string; descricao?: string };
            const meta = await registros.criar(ws.path, {
              categoria: cat,
              id: corpo.id ?? "",
              descricao: corpo.descricao ?? "",
              criadoPor: "api",
            });
            enviar(res, 201, { id: `${cat}/${meta.id}` });
            return;
          }
          if (regId && req.method === "GET") {
            enviar(res, 200, await registros.obter(ws.path, cat, regId));
            return;
          }
          if (regId && req.method === "PUT") {
            const corpo = (await lerCorpo(req)) as { conteudo?: string };
            await registros.atualizar(ws.path, cat, regId, "api", { conteudo: corpo.conteudo });
            enviar(res, 200, { ok: true });
            return;
          }
        }

        // ── approvals ───────────────────────────────────────────────
        if (rota === "/approvals" && req.method === "GET") {
          const ws = await resolverWs(url);
          enviar(res, 200, await approvals.listar(ws.path));
          return;
        }
        const mAprov = /^\/approvals\/([^/]+)\/(approve|reject)$/.exec(rota);
        if (mAprov && req.method === "POST") {
          const ws = await resolverWs(url);
          const id = decodeURIComponent(mAprov[1]!);
          if (mAprov[2] === "approve") {
            const p = await approvals.aprovar(ws.path, id);
            enviar(res, 200, { id: p.id, status: p.status });
          } else {
            const corpo = (await lerCorpo(req)) as { motivo?: string };
            const p = await approvals.rejeitar(ws.path, id, corpo.motivo ?? "");
            enviar(res, 200, { id: p.id, status: p.status });
          }
          return;
        }

        // ── budget ──────────────────────────────────────────────────
        if (rota === "/budget/status" && req.method === "GET") {
          const ws = await resolverWs(url);
          const estado = await budget.carregar(ws.path);
          enviar(res, 200, { estado, limites: await budget.limites(ws.path) });
          return;
        }
        if (rota === "/budget/set" && req.method === "POST") {
          const ws = await resolverWs(url);
          const corpo = (await lerCorpo(req)) as { daily_usd?: number; per_agent_usd?: number };
          if (corpo.daily_usd !== undefined) {
            await settings.set("budget.daily_usd", String(corpo.daily_usd), { workspaceDir: ws.path, scope: "workspace" });
          }
          if (corpo.per_agent_usd !== undefined) {
            await settings.set("budget.per_agent_usd", String(corpo.per_agent_usd), { workspaceDir: ws.path, scope: "workspace" });
          }
          enviar(res, 200, { ok: true, estado: await budget.carregar(ws.path) });
          return;
        }

        // ── settings ────────────────────────────────────────────────
        if (rota === "/settings" && req.method === "GET") {
          const ws = await resolverWs(url);
          const entradas = await settings.list({ workspaceDir: ws.path });
          enviar(res, 200, entradas);
          return;
        }
        const mSetting = /^\/settings\/([^/]+)$/.exec(rota);
        if (mSetting && req.method === "GET") {
          const ws = await resolverWs(url);
          const chave = decodeURIComponent(mSetting[1]!);
          const r = await settings.get(chave, { workspaceDir: ws.path });
          enviar(res, 200, r);
          return;
        }
        if (rota === "/settings" && req.method === "PUT") {
          const corpo = (await lerCorpo(req)) as { chave?: string; valor?: unknown; scope?: string };
          const r = await settings.set(corpo.chave ?? "", String(corpo.valor), {
            scope: corpo.scope === "workspace" ? "workspace" : "global",
            workspaceDir: (await resolverWs(url)).path,
          });
          enviar(res, 200, r);
          return;
        }

        // ── secrets (NUNCA retornam valores — só nomes/máscara) ────
        const secretsPath = join(opcoes.homeDir ?? opencorpHome(), ".opencorp", "secrets.json");
        if (rota === "/secrets" && req.method === "GET") {
          let nomes: string[] = [];
          try {
            const bruto = JSON.parse(readFileSync(secretsPath, "utf8")) as Record<string, unknown>;
            nomes = Object.keys(bruto).sort();
          } catch {}
          enviar(res, 200, nomes.map((nome) => ({ nome, definido: true })));
          return;
        }
        const mSecret = /^\/secrets\/([^/]+)$/.exec(rota);
        if (mSecret && req.method === "PUT") {
          const corpo = (await lerCorpo(req)) as { valor?: string };
          if (typeof corpo.valor !== "string" || corpo.valor.length === 0) {
            enviar(res, 400, { erro: "valor obrigatório" });
            return;
          }
          let atual: Record<string, unknown> = {};
          try { atual = JSON.parse(readFileSync(secretsPath, "utf8")) as Record<string, unknown>; } catch {}
          atual[decodeURIComponent(mSecret[1]!)] = corpo.valor;
          writeFileAtomic(secretsPath, `${JSON.stringify(atual, null, 2)}\n`, { mode: 0o600 });
          enviar(res, 200, { ok: true });
          return;
        }
        if (mSecret && req.method === "DELETE") {
          let atual: Record<string, unknown> = {};
          try { atual = JSON.parse(readFileSync(secretsPath, "utf8")) as Record<string, unknown>; } catch {}
          delete atual[decodeURIComponent(mSecret[1]!)];
          writeFileAtomic(secretsPath, `${JSON.stringify(atual, null, 2)}\n`, { mode: 0o600 });
          enviar(res, 200, { ok: true });
          return;
        }

        // ── tools (só LISTA a spec — executar fica no CLI/MCP) ─────
        if (rota === "/tools" && req.method === "GET") {
          const ws = await resolverWs(url);
          const dir = join(ws.path, ".opencorp", "tools");
          const itens: Array<{ id: string; spec?: unknown; erro?: string }> = [];
          if (existsSync(dir)) {
            const arquivos = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
            for (const f of arquivos) {
              const id = f.replace(/\.json$/, "");
              try {
                itens.push({ id, spec: JSON.parse(readFileSync(join(dir, f), "utf8")) });
              } catch (erro) {
                itens.push({ id, erro: `JSON inválido: ${erro instanceof Error ? erro.message : String(erro)}` });
              }
            }
          }
          enviar(res, 200, itens);
          return;
        }

        // ── flows ───────────────────────────────────────────────────
        if (rota === "/flows" && req.method === "GET") {
          const ws = await resolverWs(url);
          enviar(res, 200, await flows.listar(ws.path));
          return;
        }
        if (rota === "/flows" && req.method === "POST") {
          const ws = await resolverWs(url);
          const corpo = (await lerCorpo(req)) as { id?: string; nome?: string };
          const f = await flows.criar(ws.path, corpo.id ?? "", corpo.nome ?? corpo.id ?? "");
          enviar(res, 201, f);
          return;
        }
        const mFlow = /^\/flows\/([^/]+)$/.exec(rota);
        if (mFlow && req.method === "GET") {
          const ws = await resolverWs(url);
          enviar(res, 200, await flows.obter(ws.path, decodeURIComponent(mFlow[1]!)));
          return;
        }
        const mFlowRun = /^\/flows\/([^/]+)\/run$/.exec(rota);
        if (mFlowRun && req.method === "POST") {
          const ws = await resolverWs(url);
          const corpo = (await lerCorpo(req)) as { entrada?: string; model?: string };
          const flowId = decodeURIComponent(mFlowRun[1]!);
          void flows.executar(ws.path, flowId, { entrada: corpo.entrada, model: corpo.model }).catch(() => undefined);
          enviar(res, 202, { status: "iniciado", flow: flowId });
          return;
        }

        // ── reuniões ────────────────────────────────────────────────
        if (rota === "/meetings" && req.method === "GET") {
          const ws = await resolverWs(url);
          enviar(res, 200, await meetings.listar(ws.path));
          return;
        }
        if (rota === "/meetings" && req.method === "POST") {
          const ws = await resolverWs(url);
          const corpo = (await lerCorpo(req)) as { pauta?: string; agentes?: string; model?: string };
          void meetings
            .iniciar({ pauta: corpo.pauta ?? "", agentes: corpo.agentes, model: corpo.model, workspaceDir: ws.path, workspaceId: ws.id })
            .catch(() => undefined);
          enviar(res, 202, { status: "iniciado" });
          return;
        }

        // ── GET /files — lista diretório ou lê arquivo do workspace
        if (rota === "/files" && req.method === "GET") {
          const ws = await resolverWs(url);
          const pathParam = url.searchParams.get("path") ?? "";
          try {
            const alvo = await resolverCaminhoWorkspace(ws.path, pathParam);
            const info = await stat(alvo);
            if (info.isDirectory()) {
              const entradas = await readdir(alvo, { withFileTypes: true });
              const itensComTamanho = await Promise.all(
                entradas.map(async (e) => {
                  const fullPath = join(alvo, e.name);
                  let tamanho = 0;
                  try {
                    const st = await stat(fullPath);
                    tamanho = st.size;
                  } catch {}
                  return { nome: e.name, tipo: e.isDirectory() ? "dir" : "arquivo", tamanho };
                })
              );
              enviar(res, 200, { tipo: "dir", itens: itensComTamanho });
            } else {
              const resultado = await lerArquivoWorkspace(alvo);
              enviar(res, 200, resultado);
            }
          } catch (erro) {
            if (erro instanceof WorkspaceError && erro.exitCode === 3) {
              enviar(res, 403, { erro: "caminho fora do workspace (path traversal bloqueado)" });
            } else if ((erro as NodeJS.ErrnoException).code === "ENOENT") {
              enviar(res, 404, { erro: "arquivo ou diretório não encontrado" });
            } else {
              throw erro;
            }
          }
          return;
        }

        // ── POST /meetings/:id/stop — solicita interrupção de reunião ativa
        const mMeetingStop = /^\/meetings\/([^/]+)\/stop$/.exec(rota);
        if (mMeetingStop && req.method === "POST") {
          const ws = await resolverWs(url);
          const meetingId = decodeURIComponent(mMeetingStop[1]!);
          // Verifica se existe reunião ativa no workspace
          const reunioes = await meetings.listar(ws.path);
          const ativa = reunioes.find((r) => r.id === meetingId && r.status === "em-andamento");
          if (!ativa) {
            enviar(res, 409, { erro: "nenhuma reunião ativa neste servidor" });
            return;
          }
          // Solicita interrupção
          meetings.solicitarInterrupcao();
          enviar(res, 200, { ok: true, detalhe: `interrupção solicitada para reunião ${meetingId}` });
          return;
        }

        // ── SSE ─────────────────────────────────────────────────────
        if (rota === "/events" && req.method === "GET") {
          res.writeHead(200, {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
            "access-control-allow-origin": "*",
          });
          res.write(`event: conectado\ndata: {}\n\n`);
          const off = eventBus.on((ev: EventoBus) => {
            try {
              res.write(`data: ${JSON.stringify(ev)}\n\n`);
            } catch {
              off();
            }
          });
          req.on("close", off);
          return;
        }

        if (rota === "/tasks" && req.method === "GET") {
          const ws = await resolverWs(url);
          enviar(res, 200, await tasks.listar(ws.path, {
            coluna: url.searchParams.get("coluna") ?? undefined,
            responsavel: url.searchParams.get("responsavel") ?? undefined,
          }));
          return;
        }
        if (rota === "/tasks" && req.method === "POST") {
          const ws = await resolverWs(url);
          const corpo = (await lerCorpo(req)) as Record<string, unknown>;
          const t = await tasks.criar(ws.path, {
            titulo: String(corpo.titulo ?? ""),
            descricao: corpo.descricao !== undefined ? String(corpo.descricao) : undefined,
            coluna: corpo.coluna !== undefined ? String(corpo.coluna) : undefined,
            prioridade: corpo.prioridade as "baixa" | "media" | "alta" | undefined,
            labels: Array.isArray(corpo.labels) ? (corpo.labels as unknown[]).map(String) : undefined,
            responsavel: corpo.responsavel !== undefined ? String(corpo.responsavel) : undefined,
            due: corpo.due !== undefined ? String(corpo.due) : undefined,
            task_pai: corpo.task_pai !== undefined ? String(corpo.task_pai) : undefined,
            bloqueado_por: Array.isArray(corpo.bloqueado_por) ? (corpo.bloqueado_por as unknown[]).map(String) : undefined,
          }, "api");
          enviar(res, 201, t);
          return;
        }
        if (rota === "/schedules" && req.method === "GET") {
          const wsFiltro = url.searchParams.get("workspace");
          const jobs = await scheduler.listar();
          // ?all=1 (ou sem workspace) = escopo "todas as empresas"
          enviar(res, 200, !wsFiltro || url.searchParams.has("all") ? jobs : jobs.filter((j) => j.workspace === wsFiltro));
          return;
        }
        if (rota === "/schedules" && req.method === "POST") {
          const corpo = (await lerCorpo(req)) as Record<string, unknown>;
          const agenda: Agenda =
            corpo.agenda_tipo === "cron"
              ? { tipo: "cron", valor: String(corpo.agenda_valor ?? "") }
              : corpo.agenda_tipo === "data_unica"
                ? { tipo: "data_unica", valor: String(corpo.agenda_valor ?? "") }
                : { tipo: "intervalo_min", valor: Number(corpo.agenda_valor ?? 0) };
          const j = await scheduler.criar({
            nome: String(corpo.nome ?? ""),
            agenda,
            args: Array.isArray(corpo.args) ? (corpo.args as unknown[]).map(String) : String(corpo.args ?? "").split(/\s+/).filter(Boolean),
            workspace: corpo.workspace !== undefined ? String(corpo.workspace) : (await resolverWs(url)).id,
            graca_min: typeof corpo.graca_min === "number" ? corpo.graca_min : undefined,
          });
          enviar(res, 201, j);
          return;
        }
        const mSchedRun = /^\/schedules\/([^/]+)\/run$/.exec(rota);
        if (mSchedRun && req.method === "POST") {
          const id = decodeURIComponent(mSchedRun[1]!);
          const { resultado } = await scheduler.runNow(id);
          enviar(res, 200, { ok: true, resultado });
          return;
        }
        const mSched = /^\/schedules\/([^/]+)$/.exec(rota);
        if (mSched) {
          const id = decodeURIComponent(mSched[1]!);
          if (req.method === "GET") {
            enviar(res, 200, await scheduler.obter(id));
            return;
          }
          if (req.method === "PATCH") {
            const corpo = (await lerCorpo(req)) as Record<string, unknown>;
            if (corpo.ativo === false) {
              enviar(res, 200, await scheduler.pausar(id));
            } else if (corpo.ativo === true) {
              enviar(res, 200, await scheduler.retomar(id));
            } else {
              enviar(res, 400, { erro: "use {ativo: true|false}" });
            }
            return;
          }
          if (req.method === "DELETE") {
            await scheduler.excluir(id);
            enviar(res, 200, { ok: true, id });
            return;
          }
          if (req.method === "POST") {
            const { resultado } = await scheduler.runNow(id);
            enviar(res, 200, { ok: true, resultado });
            return;
          }
        }

        if (rota === "/apps" && req.method === "GET") {
          const ws = await resolverWs(url);
          enviar(res, 200, apps.listar(ws.path));
          return;
        }
        const mApp = /^\/apps\/([^/]+)\/spec$/.exec(rota);
        if (mApp && req.method === "GET") {
          const ws = await resolverWs(url);
          enviar(res, 200, apps.obter(ws.path, decodeURIComponent(mApp[1]!)));
          return;
        }
        if (rota === "/apps" && req.method === "POST") {
          const ws = await resolverWs(url);
          const corpo = (await lerCorpo(req)) as Record<string, unknown>;
          const spec = apps.validarTexto(JSON.stringify(corpo), "POST /apps");
          await apps.salvar(ws.path, spec);
          enviar(res, 201, spec);
          return;
        }
        const mAppDel = /^\/apps\/([^/]+)$/.exec(rota);
        if (mAppDel && req.method === "DELETE") {
          const ws = await resolverWs(url);
          await apps.excluir(ws.path, decodeURIComponent(mAppDel[1]!));
          enviar(res, 200, { ok: true, id: mAppDel[1] });
          return;
        }

        // ── /teams ─────────────────────────────────────────────────────
        if (rota === "/teams" && req.method === "GET") {
          const ws = await resolverWs(url);
          enviar(res, 200, teams.listar(ws.path));
          return;
        }
        if (rota === "/teams" && req.method === "POST") {
          const ws = await resolverWs(url);
          const corpo = (await lerCorpo(req)) as Record<string, unknown>;
          // criado_em é opcional na API (o CLI sempre preenche)
          if (typeof corpo.criado_em !== "string" || corpo.criado_em.length === 0) {
            corpo.criado_em = new Date().toISOString();
          }
          const spec = teams.validarTexto(JSON.stringify(corpo), "POST /teams");
          await teams.salvar(ws.path, spec);
          enviar(res, 201, spec);
          return;
        }
        const mTeam = /^\/teams\/([^/]+)(?:\/(run))?$/.exec(rota);
        if (mTeam) {
          const ws = await resolverWs(url);
          const teamId = decodeURIComponent(mTeam[1]!);
          const acao = mTeam[2];
          if (!acao && req.method === "GET") {
            enviar(res, 200, teams.obter(ws.path, teamId));
            return;
          }
          if (!acao && req.method === "DELETE") {
            await teams.excluir(ws.path, teamId);
            enviar(res, 200, { ok: true, id: teamId });
            return;
          }
          if (acao === "run" && req.method === "POST") {
            const corpo = (await lerCorpo(req)) as { entrada?: string };
            const resOrq = await orquestrador.executar(ws.path, teamId, String(corpo.entrada ?? ""));
            enviar(res, 200, resOrq);
            return;
          }
        }

        if (rota === "/hooks" && req.method === "GET") {
          const ws = await resolverWs(url);
          enviar(res, 200, hooks.listar(ws.path));
          return;
        }
        if (rota === "/hooks" && req.method === "POST") {
          const ws = await resolverWs(url);
          const corpo = (await lerCorpo(req)) as Record<string, unknown>;
          const alvo = corpo.alvo as AlvoHook;
          const h = await hooks.criar(ws.path, ws.id, {
            nome: String(corpo.nome ?? ""),
            alvo,
            respond: corpo.respond as "imediato" | "final" | undefined,
            dedup_seg: typeof corpo.dedup_seg === "number" ? corpo.dedup_seg : undefined,
          });
          enviar(res, 201, { ...h, url: `/hooks/${ws.id}/${h.id}` });
          return;
        }
        const mHook = /^\/hooks\/([^/]+)$/.exec(rota);
        if (mHook && req.method === "GET") {
          const ws = await resolverWs(url);
          enviar(res, 200, hooks.obter(ws.path, decodeURIComponent(mHook[1]!)));
          return;
        }
        if (mHook && req.method === "DELETE") {
          const ws = await resolverWs(url);
          await hooks.excluir(ws.path, decodeURIComponent(mHook[1]!));
          enviar(res, 200, { ok: true, id: mHook[1] });
          return;
        }
        // ── rota PÚBLICA de disparo (auth por token do hook) ──
        const mHookPublico = /^\/hooks\/([^/]+)\/([^/]+)$/.exec(rota);
        if (mHookPublico && (req.method === "POST" || req.method === "GET")) {
          const wsId = decodeURIComponent(mHookPublico[1]!);
          const hookId = decodeURIComponent(mHookPublico[2]!);
          const ws = await workspaces.resolver(wsId) as unknown as { id: string; path: string };
          const h: Hook = hooks.obter(ws.path, hookId);
          if (!h.metodos.includes(req.method ?? "POST")) {
            enviar(res, 405, { erro: `método ${req.method} não permitido (aceitos: ${h.metodos.join(", ")})` });
            return;
          }
          const tokenRecebido = req.headers["x-opencorp-token"] ?? url.searchParams.get("token") ?? "";
          if (tokenRecebido !== h.token) {
            enviar(res, 401, { erro: "token do hook ausente ou inválido" });
            return;
          }
          let corpoPayload: Record<string, unknown> = {};
          if (req.method === "POST") {
            try {
              corpoPayload = ((await lerCorpo(req)) ?? {}) as Record<string, unknown>;
            } catch {
              corpoPayload = {};
            }
          }
          const query: Record<string, string> = {};
          url.searchParams.forEach((v, k) => {
            if (k !== "token") query[k] = v;
          });
          const payload: PayloadHook = { corpo: corpoPayload, query };
          if (h.respond === "final") {
            const r = await hooks.disparar(ws.path, h, payload);
            enviar(res, 200, { ok: true, exec_id: r.exec_id, resultado: r.resultado.slice(0, 4096) });
          } else {
            void hooks.disparar(ws.path, h, payload).catch(() => undefined);
            enviar(res, 202, { ok: true, modo: "imediato" });
          }
          return;
        }

        if (rota === "/tasks/colunas" && req.method === "GET") {
          const ws = await resolverWs(url);
          enviar(res, 200, await tasks.colunas(ws.path));
          return;
        }
        const mTask = /^\/tasks\/([^/]+)(?:\/(chat))?$/.exec(rota);
        if (mTask) {
          const ws = await resolverWs(url);
          const id = decodeURIComponent(mTask[1]!);
          if (mTask[2] === "chat") {
            if (req.method === "GET") {
              enviar(res, 200, await tasks.chat(ws.path, id));
              return;
            }
            if (req.method === "POST") {
              const corpo = (await lerCorpo(req)) as Record<string, unknown>;
              const m = await tasks.mensagem(ws.path, id, {
                autor: String(corpo.autor ?? "humano"),
                corpo: String(corpo.corpo ?? ""),
                tipo: corpo.tipo as "comentario" | "handoff" | "sistema" | "artefato" | "decisao" | undefined,
                refs: Array.isArray(corpo.refs) ? (corpo.refs as unknown[]).map(String) : undefined,
              });
              enviar(res, 201, m);
              return;
            }
          } else if (req.method === "GET") {
            const t = await tasks.obter(ws.path, id);
            enviar(res, 200, { ...t, bloqueada: tasks.bloqueado(ws.path, t) });
            return;
          } else if (req.method === "PATCH") {
            const corpo = (await lerCorpo(req)) as Record<string, unknown>;
            let t: Task = await tasks.obter(ws.path, id);
            if (typeof corpo.titulo === "string" || typeof corpo.descricao === "string" ||
                typeof corpo.prioridade === "string" || corpo.due !== undefined) {
              t = await tasks.editar(ws.path, id, {
                titulo: typeof corpo.titulo === "string" ? corpo.titulo : undefined,
                descricao: typeof corpo.descricao === "string" ? corpo.descricao : undefined,
                prioridade: typeof corpo.prioridade === "string" ? corpo.prioridade : undefined,
                due: corpo.due === null ? null : typeof corpo.due === "string" ? corpo.due : undefined,
              });
            }
            if (typeof corpo.coluna === "string") {
              t = await tasks.mover(ws.path, id, corpo.coluna, typeof corpo.pos === "number" ? corpo.pos : undefined);
            }
            if (typeof corpo.responsavel === "string") {
              t = await tasks.atribuir(ws.path, id, corpo.responsavel);
            }
            if (Array.isArray(corpo.labels)) {
              t = await tasks.label(ws.path, id, "add", (corpo.labels as unknown[]).map(String));
            }
            enviar(res, 200, t);
            return;
          } else if (req.method === "DELETE") {
            await tasks.excluir(ws.path, id);
            enviar(res, 200, { ok: true, id });
            return;
          }
        }
        if (rota === "/tasks/colunas" && req.method === "GET") {
          const ws = await resolverWs(url);
          enviar(res, 200, await tasks.colunas(ws.path));
          return;
        }

        // ── /secretario/status ──
        if (rota === "/secretario/status" && req.method === "GET") {
          const status = await opencodeServer.status();
          const configurado = await opencodeServer.configurado();
          enviar(res, 200, { ...status, configurado });
          return;
        }

        // ── /secretario/start ──
        if (rota === "/secretario/start" && req.method === "POST") {
          try {
            const { pid, porta } = await opencodeServer.iniciar();
            const status = await opencodeServer.status();
            enviar(res, 200, { pid, porta, agentes: status.rodando ? "configurados" : 0 });
          } catch (erro) {
            const mensagem = erro instanceof Error ? erro.message : String(erro);
            enviar(res, 500, { erro: `falha ao iniciar secretário: ${mensagem}` });
          }
          return;
        }

        // ── /secretario/stop ──
        if (rota === "/secretario/stop" && req.method === "POST") {
          await opencodeServer.parar();
          enviar(res, 200, { ok: true });
          return;
        }

        // Helper: obtém porta do opencode server ou lança 409
        async function portaOpencodeOuErro(): Promise<number> {
          const status = await opencodeServer.status();
          if (!status.rodando || !status.porta) {
            throw new SecretarioError("secretário não iniciado — POST /secretario/start", { status: 409 });
          }
          return status.porta;
        }

        // ── /secretario/sessoes (proxy GET /session) ──
        if (rota === "/secretario/sessoes" && req.method === "GET") {
          try {
            const porta = await portaOpencodeOuErro();
            const opencodeUrl = `http://127.0.0.1:${porta}/session`;
            const resOpencode = await fetch(opencodeUrl, { signal: AbortSignal.timeout(5000) });
            if (!resOpencode.ok) {
              enviar(res, 502, { erro: `opencode respondeu ${resOpencode.status}` });
              return;
            }
            const data = await resOpencode.json();
            enviar(res, 200, data);
          } catch (erro) {
            if (erro instanceof SecretarioError) {
              enviar(res, erro.status ?? 409, { erro: erro.message });
            } else {
              enviar(res, 502, { erro: `proxy falhou: ${erro instanceof Error ? erro.message : String(erro)}` });
            }
          }
          return;
        }

        // ── /secretario/sessoes/:id/mensagens (proxy GET /session/:id → [{role,content}]) ──
        const mMensagens = /^\/secretario\/sessoes\/([^/]+)\/mensagens$/.exec(rota);
        if (mMensagens && req.method === "GET") {
          try {
            const porta = await portaOpencodeOuErro();
            const sessionId = decodeURIComponent(mMensagens[1]!);
            const opencodeUrl = `http://127.0.0.1:${porta}/session/${sessionId}`;
            const resOpencode = await fetch(opencodeUrl, { signal: AbortSignal.timeout(5000) });
            if (!resOpencode.ok) {
              enviar(res, resOpencode.status === 404 ? 404 : 502, { erro: resOpencode.status === 404 ? "sessão não encontrada" : `opencode respondeu ${resOpencode.status}` });
              return;
            }
            const data = (await resOpencode.json()) as {
              messages?: Array<{ role: string; parts?: Array<{ type: string; text?: string }>; time?: { created?: number; completed?: number } }>;
            };
            const mensagens = (data.messages ?? [])
              .filter((m) => m.role === "user" || m.role === "assistant")
              .map((m) => ({
                role: m.role,
                content: (m.parts ?? []).filter((p) => p.type === "text").map((p) => p.text ?? "").join("\n").trim(),
                criado_em: m.time?.created ? new Date(m.time.created).toISOString() : undefined,
              }))
              .filter((m) => m.content.length > 0);
            enviar(res, 200, mensagens);
          } catch (erro) {
            if (erro instanceof SecretarioError) {
              enviar(res, erro.status ?? 409, { erro: erro.message });
            } else {
              enviar(res, 502, { erro: `proxy falhou: ${erro instanceof Error ? erro.message : String(erro)}` });
            }
          }
          return;
        }

        // ── /secretario/sessoes/:id (proxy GET /session/:id) ──
        const mSessaoDetalhe = /^\/secretario\/sessoes\/([^/]+)$/.exec(rota);
        if (mSessaoDetalhe && req.method === "GET") {
          try {
            const porta = await portaOpencodeOuErro();
            const sessionId = decodeURIComponent(mSessaoDetalhe[1]!);
            const opencodeUrl = `http://127.0.0.1:${porta}/session/${sessionId}`;
            const resOpencode = await fetch(opencodeUrl, { signal: AbortSignal.timeout(5000) });
            if (!resOpencode.ok) {
              if (resOpencode.status === 404) {
                enviar(res, 404, { erro: "sessão não encontrada" });
              } else {
                enviar(res, 502, { erro: `opencode respondeu ${resOpencode.status}` });
              }
              return;
            }
            const data = await resOpencode.json();
            enviar(res, 200, data);
          } catch (erro) {
            if (erro instanceof SecretarioError) {
              enviar(res, erro.status ?? 409, { erro: erro.message });
            } else {
              enviar(res, 502, { erro: `proxy falhou: ${erro instanceof Error ? erro.message : String(erro)}` });
            }
          }
          return;
        }

        // ── /secretario/conversa (proxy POST /session + POST /session/:id/message + poll) ──
        if (rota === "/secretario/conversa" && req.method === "POST") {
          try {
            const porta = await portaOpencodeOuErro();
            const corpo = (await lerCorpo(req)) as { mensagem: string; sessao_id?: string; agente?: string };
            const mensagem = corpo.mensagem?.trim();
            if (!mensagem) {
              enviar(res, 400, { erro: "mensagem obrigatória" });
              return;
            }
            let sessaoId = corpo.sessao_id;
            const baseUrl = `http://127.0.0.1:${porta}`;

            // 1. Se não há sessao_id, cria nova sessão
            if (!sessaoId) {
              const createRes = await fetch(`${baseUrl}/session`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  title: mensagem.slice(0, 60),
                  agent: corpo.agente,
                }),
                signal: AbortSignal.timeout(10000),
              });
              if (!createRes.ok) {
                enviar(res, 502, { erro: `falha ao criar sessão: ${createRes.status}` });
                return;
              }
              const sessionData = (await createRes.json()) as { id: string };
              sessaoId = sessionData.id;
            }

            // 2. Envia mensagem — o POST /message do opencode serve é SÍNCRONO: aguarda o processamento
            //    e retorna a mensagem do assistant. O modelo vem do agente (frontmatter) ou do config (free).
            const msgRes = await fetch(`${baseUrl}/session/${sessaoId}/message`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                sessionID: sessaoId,
                agent: corpo.agente ?? "secretario",
                parts: [{ type: "text", text: mensagem }],
              }),
              signal: AbortSignal.timeout(240_000),
            });
            if (!msgRes.ok) {
              enviar(res, 502, { erro: `falha ao enviar mensagem: ${msgRes.status}` });
              return;
            }
            const msgData = (await msgRes.json()) as {
              info?: { role?: string };
              parts?: Array<{ type: string; text?: string }>;
            };

            // 3. Extrai a resposta: o POST retorna a mensagem do assistant; se vier a do user (fallback), faz poll
            let respostaTexto = "";
            const extrair = (m: { parts?: Array<{ type: string; text?: string }> }): string =>
              (m.parts ?? []).filter((p) => p.type === "text").map((p) => p.text ?? "").join("\n").trim();
            if (msgData.info?.role === "assistant") {
              respostaTexto = extrair(msgData);
            }
            if (!respostaTexto) {
              const timeoutMs = 180_000;
              const inicio = Date.now();
              while (Date.now() - inicio < timeoutMs) {
                await sleep(2000);
                const getRes = await fetch(`${baseUrl}/session/${sessaoId}`, { signal: AbortSignal.timeout(5000) });
                if (!getRes.ok) continue;
                const sessionData = (await getRes.json()) as {
                  messages?: Array<{ role: string; parts: Array<{ type: string; text?: string }>; time?: { completed?: number } }>;
                };
                const messages = sessionData.messages ?? [];
                for (let i = messages.length - 1; i >= 0; i--) {
                  const msg = messages[i];
                  if (msg.role === "assistant" && msg.time?.completed) {
                    const textos = msg.parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join("\n");
                    if (textos.trim()) {
                      respostaTexto = textos;
                      break;
                    }
                  }
                }
                if (respostaTexto) break;
              }
            }

            if (!respostaTexto) {
              enviar(res, 504, { erro: "timeout aguardando resposta do assistant (180s)", sessao_id: sessaoId });
              return;
            }

            enviar(res, 200, { sessao_id: sessaoId, resposta: respostaTexto });
          } catch (erro) {
            if (erro instanceof SecretarioError) {
              enviar(res, erro.status ?? 409, { erro: erro.message });
            } else {
              enviar(res, 502, { erro: `proxy falhou: ${erro instanceof Error ? erro.message : String(erro)}` });
            }
          }
          return;
        }

        if (req.method === "GET" && rota !== "/events") {
          // ── fallback estático: UI web (estilo opencode — servidor embute a web) ──
          const estatico = servirEstatico(rota);
          if (estatico !== null) {
            res.writeHead(200, { "content-type": estatico.tipo, "access-control-allow-origin": "*", "cache-control": "no-cache" });
            res.end(estatico.corpo);
            return;
          }
        }

        const sugestoes = sugerirRotas(rota);
        const msg = sugestoes.length > 0 ? `rota não encontrada: ${rota} — rotas similares: ${sugestoes.join(", ")}` : `rota não encontrada: ${rota}`;
        enviar(res, 404, { erro: msg, sugestoes });
      } catch (erro) {
        enviarErro(res, erro);
      }
    })().catch(() => undefined);
  });

  let resolvePorta!: (p: number) => void;
  const porta = new Promise<number>((r) => (resolvePorta = r));
  server.on("listening", () => {
    iniciarPollExecucoes(workspaces, registros);
    const addr = server.address();
    if (addr && typeof addr === "object") resolvePorta(addr.port);
  });

  return { server, token, porta };
}

export function tokenAleatorio(): string {
  return randomBytes(24).toString("hex");
}
