import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { join, resolve, relative, isAbsolute } from "node:path";
import { stat, readdir, readFile } from "node:fs/promises";
import { WorkspaceManager } from "../core/workspace-manager.js";
import { AgentStore } from "../core/agent-store.js";
import { SessionManager, type OpcoesRun, type ResultadoRun } from "../core/session-manager.js";
import { RegistryStore } from "../core/registry-store.js";
import { BudgetManager } from "../core/budget-manager.js";
import { ApprovalsStore } from "../core/approvals-store.js";
import { SettingsError, SettingsStore } from "../core/settings-store.js";
import { FlowStore, type SessaoFlow } from "../core/flow-store.js";
import { MeetingManager } from "../core/meeting-manager.js";
import { eventBus, type EventoBus } from "../core/event-bus.js";
import { AgentError, OpencorpError, RegistryError, WorkspaceError } from "../core/errors.js";

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
  { method: "GET", path: "/flows", descricao: "Lista flows disponíveis" },
  { method: "POST", path: "/flows", descricao: "Cria novo flow", corpo: true },
  { method: "GET", path: "/flows/:id", descricao: "Obtém detalhes de um flow" },
  { method: "POST", path: "/flows/:id/run", descricao: "Executa um flow", corpo: true },
  { method: "POST", path: "/meetings", descricao: "Inicia nova reunião", corpo: true },
  { method: "POST", path: "/meetings/:id/stop", descricao: "Solicita interrupção de reunião ativa" },
  { method: "GET", path: "/events", descricao: "Stream SSE de eventos do servidor" },
  { method: "GET", path: "/files", descricao: "Lista diretório ou lê arquivo do workspace", publico: false },
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

function statusHttpDe(erro: unknown): number {
  const code = (erro as { exitCode?: number }).exitCode;
  if (code === 3) return 403;
  if (code === 4) return 402;
  if (code === 5) return 409;
  if (erro instanceof RegistryError || erro instanceof WorkspaceError || erro instanceof AgentError) return 422;
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
  const sessoes: SessaoApi = opcoes.sessoes ?? (new SessionManager(base) as unknown as SessaoApi);

  const token = opcoes.token ?? randomBytes(24).toString("hex");

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
      if (rota === "/health") {
        enviar(res, 200, { ok: true, versao: version });
        return;
      }
      // GET /doc — público (sem auth), retorna OpenAPI 3.0
      if (rota === "/doc" && req.method === "GET") {
        enviar(res, 200, gerarOpenApiSpec());
        return;
      }
      if ((req.headers.authorization ?? "") !== `Bearer ${token}`) {
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
          const corpo = (await lerCorpo(req)) as { id?: string };
          const criado = await workspaces.criar(corpo.id ?? "");
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
