import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, resolve, relative, isAbsolute, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stat, readdir, readFile, realpath, open, mkdir, rename, rm, unlink } from "node:fs/promises";
import { existsSync, rmSync, statSync, readFileSync } from "node:fs";
import { WorkspaceManager } from "../core/workspace-manager.js";
import { mkdirRecursive, writeFileAtomic } from "../utils/fs-safe.js";
import { opencorpHome } from "../utils/paths.js";
import { AgentStore } from "../core/agent-store.js";
import { SessionManager, type OpcoesRun, type ResultadoRun } from "../core/session-manager.js";
import { RegistryStore } from "../core/registry-store.js";
import { BudgetManager } from "../core/budget-manager.js";
import { ApprovalsStore } from "../core/approvals-store.js";
import { SettingsError, SettingsStore } from "../core/settings-store.js";
import { FlowStore, type Flow, type SessaoFlow } from "../core/flow-store.js";
import { migrarTeamsParaFlows } from "../core/flow-migrate.js";
import { MeetingManager, gerarIdReuniao } from "../core/meeting-manager.js";
import { TaskStore, type Task } from "../core/task-store.js";
import { Scheduler, parseAgendaTask } from "../core/scheduler.js";
import type { Agenda } from "../core/scheduler.js";
import { HookStore, type Hook, type AlvoHook, type PayloadHook } from "../core/hook-store.js";
import { NotificationStore, type TipoNotificacao } from "../core/notification-store.js";
import { AppStore } from "../core/app-store.js";
import { TeamStore } from "../core/team-store.js";
import { OrquestradorDeTeams } from "../core/team-orchestrator.js";
import { instalarMencoes } from "../core/mention-runner.js";
import { TaskError, SchedulerError, HookError, AppError, TeamError, MeetingError, NotificationError, AgentError, OpencorpError, RegistryError, WorkspaceError } from "../core/errors.js";
import { FlowError } from "../core/errors.js";
import { eventBus, type EventoBus } from "../core/event-bus.js";
import { OpencodeServerManager, SecretarioError, extrairAcoesMensagens, resumoDeInput, dirOpencodeHome, dirOpencodeData, authOpencodePath, authOverridesPathWorkspace, mascararChave, fundirAuth, PROVEEDOR_RE, type EntradaAuth, type MensagemOc, type ParteOc } from "../core/opencode-server.js";
import { taskCreateSchema } from "../schemas/task.js";
import { tipoDeNomeApp, validarPerfilApp } from "../schemas/app-perfil.js";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json") as { version: string };
import { createRequire } from "node:module";

const docsRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs");

/** Definição de rotas para documentação OpenAPI e sugestões de 404 */
interface DefinicaoRota {
  method: string;
  path: string;
  descricao: string;
  corpo?: boolean;
  publico?: boolean;
}

/** Whitelist de comandos que uma rotina (schedule) pode executar — job inválido
 *  é barrado na criação/edição, não descoberto em produção (PLANO-WEB-CRUD B1). */
const COMANDOS_AGENDA = new Set([
  "agent", "task", "flow", "team", "meeting", "schedule", "workspace", "doctor", "settings",
  "budget", "approvals", "template", "hook", "tool", "monitor", "app", "registry", "subcorp",
  "supervisor", "scheduler", "serve", "web", "test",
]);

/** Normaliza args de rotina: array → strings; string → split por espaços. */
function normalizarArgsAgenda(args: unknown): string[] {
  return Array.isArray(args) ? (args as unknown[]).map(String) : String(args ?? "").split(/\s+/).filter(Boolean);
}

/** Monta a Agenda a partir de agenda_tipo/agenda_valor do corpo HTTP. */
function parseAgendaCorpo(corpo: Record<string, unknown>): Agenda {
  return corpo.agenda_tipo === "cron"
    ? { tipo: "cron", valor: String(corpo.agenda_valor ?? "") }
    : corpo.agenda_tipo === "data_unica"
      ? { tipo: "data_unica", valor: String(corpo.agenda_valor ?? "") }
      : { tipo: "intervalo_min", valor: Number(corpo.agenda_valor ?? 0) };
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
  { method: "GET", path: "/agents/:id", descricao: "Detalhe do agente (frontmatter + prompt)" },
  { method: "PUT", path: "/agents/:id", descricao: "Edita frontmatter do agente (model, permissions, budget, tools, role, ativo)", corpo: true },
  { method: "DELETE", path: "/agents/:id", descricao: "Exclui agente (409 se citado em teams/flows/tasks)" },
  { method: "POST", path: "/agents/semear-catalogo", descricao: "Semeia agentes do catálogo no workspace (idempotente; nascem desativados)" },
  { method: "POST", path: "/agents/:id/run", descricao: "Executa agente com ordem (409 se desativado)", corpo: true },
  { method: "GET", path: "/sessions", descricao: "Lista execuções/sessões" },
  { method: "GET", path: "/historico", descricao: "Histórico unificado (execuções + tasks + rotinas + conversas da secretária) — query: agente, tipo, limite" },
  { method: "GET", path: "/execucoes", descricao: "Ledger unificado de execuções com gatilho (query: agente, gatilho, origem, status, limite)" },
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
  { method: "GET", path: "/settings", descricao: "Lista configurações (?escopo=global|workspace — sem o parâmetro: mesclada)" },
  { method: "GET", path: "/settings/:chave", descricao: "Obtém uma configuração específica" },
  { method: "PUT", path: "/settings", descricao: "Define uma configuração", corpo: true },
  { method: "GET", path: "/secrets", descricao: "Lista NOMES de segredos (valores nunca expostos; perfis app:<tipo>:<id> incluem tipo_app)" },
  { method: "PUT", path: "/secrets/:chave", descricao: "Define/altera um segredo (perfis app:* validam o valor como JSON por tipo)", corpo: true },
  { method: "DELETE", path: "/secrets/:chave", descricao: "Remove um segredo" },
  { method: "GET", path: "/tools", descricao: "Lista ferramentas declarativas do workspace (.opencorp/tools/*.json — só a spec, sem executar)" },
  { method: "GET", path: "/flows", descricao: "Lista flows disponíveis" },
  { method: "POST", path: "/flows", descricao: "Cria novo flow", corpo: true },
  { method: "POST", path: "/flows/migrate-teams", descricao: "Migra teams legados para flows (fusão team×fluxo)" },
  { method: "PUT", path: "/flows/:id", descricao: "Salva o grafo completo do flow (valida semântica)", corpo: true },
  { method: "DELETE", path: "/flows/:id", descricao: "Exclui flow" },
  { method: "GET", path: "/flows/:id", descricao: "Obtém detalhes de um flow" },
  { method: "GET", path: "/flows/:id/status", descricao: "Última execução do flow (status por nó)" },
  { method: "POST", path: "/flows/:id/run", descricao: "Executa um flow", corpo: true },
  { method: "POST", path: "/flows/:id/resume", descricao: "Retoma execução falha do último nó ok (corpo: { exec_id })", corpo: true },
  { method: "POST", path: "/meetings", descricao: "Inicia nova reunião (202 com id — sala consultável em tempo real)", corpo: true },
  { method: "GET", path: "/meetings", descricao: "Lista reuniões: salas vivas em memória + históricas do disco" },
  { method: "GET", path: "/meetings/:id", descricao: "Estado em tempo real da sala (turno, mensagens do buffer vivo, consenso)" },
  { method: "POST", path: "/meetings/:id/stop", descricao: "Solicita interrupção de reunião ativa (404 se desconhecida)" },
  { method: "GET", path: "/events", descricao: "Stream SSE de eventos do servidor" },
  { method: "GET", path: "/files", descricao: "Lista diretório ou lê arquivo do workspace", publico: false },
  { method: "GET", path: "/files/tree", descricao: "Árvore recursiva de arquivos do workspace (query: workspace, profundidade máx 6 default 4; cap 800 nós)", publico: false },
  { method: "PUT", path: "/files", descricao: "Salva conteúdo de arquivo EXISTENTE do workspace (query: workspace, path) — corpo { conteudo }, cap 1MB, não cria paths novos", corpo: true },
  { method: "POST", path: "/terminal", descricao: "Executa comando opencorp whitelistado (composer !) — corpo { comando }, retorna { saida, codigo }", corpo: true },
  { method: "GET", path: "/hooks", descricao: "Lista hooks do workspace" },
  { method: "POST", path: "/hooks", descricao: "Cria hook de entrada", corpo: true },
  { method: "GET", path: "/hooks/:id", descricao: "Detalhes do hook (inclui token)" },
  { method: "DELETE", path: "/hooks/:id", descricao: "Exclui hook" },
  { method: "POST", path: "/hooks/:workspace/:id", descricao: "Disparo público do hook (header x-opencorp-token)" },
  { method: "GET", path: "/notifications", descricao: "Lista notificações do workspace (query: nao_lidas=1) — inclui resumo.nao_lidas" },
  { method: "POST", path: "/notifications", descricao: "Cria notificação (titulo, corpo, tipo: resumo|aviso|erro|info, origem)", corpo: true },
  { method: "POST", path: "/notifications/lidas", descricao: "Marca todas as notificações como lidas" },
  { method: "POST", path: "/notifications/:id/lida", descricao: "Marca uma notificação como lida" },
  { method: "DELETE", path: "/notifications", descricao: "Limpa todas as notificações do workspace" },
  { method: "GET", path: "/apps", descricao: "Lista mini-apps do workspace" },
  { method: "GET", path: "/apps/:id/spec", descricao: "Spec declarativo de um app" },
  { method: "POST", path: "/apps", descricao: "Cria/salva spec de app (validado)", corpo: true },
  { method: "DELETE", path: "/apps/:id", descricao: "Exclui app" },
  { method: "GET", path: "/teams", descricao: "Lista teams do workspace" },
  { method: "POST", path: "/teams", descricao: "Cria/salva spec de team (validado)", corpo: true },
  { method: "PUT", path: "/teams/:id", descricao: "Edita spec de team (validado)", corpo: true },
  { method: "GET", path: "/teams/:id", descricao: "Obtém spec de um team" },
  { method: "DELETE", path: "/teams/:id", descricao: "Exclui team" },
  { method: "POST", path: "/teams/:id/run", descricao: "Executa team via orquestrador", corpo: true },
  { method: "GET", path: "/secretario/status", descricao: "Status do secretário (opencode server)", publico: false },
  { method: "POST", path: "/secretario/start", descricao: "Inicia o secretário (opencode serve)", corpo: false },
  { method: "POST", path: "/secretario/stop", descricao: "Para o secretário", corpo: false },
  { method: "GET", path: "/secretario/sessoes", descricao: "Lista sessões do opencode (proxy)", publico: false },
  { method: "GET", path: "/secretario/sessoes/:id/mensagens", descricao: "Mensagens de uma sessão (proxy, normalizado [{role,content,concluida}])", publico: false },
  { method: "POST", path: "/secretario/conversa", descricao: "Envia mensagem ao secretário (proxy create session + message)", corpo: true },
  { method: "POST", path: "/secretario/conversa/stream", descricao: "Envia mensagem ao secretário com resposta em streaming (SSE: inicio/delta/fim/erro)", corpo: true },
  { method: "GET", path: "/provider-keys", descricao: "Lista provedores com chave de API configurada (preview mascarado)", publico: false },
  { method: "PUT", path: "/provider-keys", descricao: "Define/atualiza a chave de API de um provedor (provider, key)", corpo: true, publico: false },
  { method: "DELETE", path: "/provider-keys/:provider", descricao: "Remove a chave de API de um provedor", publico: false },
  { method: "GET", path: "/tasks", descricao: "Lista tasks do board" },
  { method: "POST", path: "/tasks", descricao: "Cria task", corpo: true },
  { method: "GET", path: "/tasks/colunas", descricao: "Lista colunas do board" },
  { method: "GET", path: "/tasks/:id", descricao: "Detalhe da task" },
  { method: "PATCH", path: "/tasks/:id", descricao: "Edita task (coluna, prioridade, responsável, due, labels, descrição)", corpo: true },
  { method: "DELETE", path: "/tasks/:id", descricao: "Exclui task" },
  { method: "GET", path: "/tasks/:id/chat", descricao: "Mensagens do chat da task" },
  { method: "POST", path: "/tasks/:id/chat", descricao: "Comenta na task (autor humano/agente)", corpo: true },
  { method: "GET", path: "/schedules", descricao: "Lista rotinas agendadas (query: workspace | all=1)" },
  { method: "POST", path: "/schedules", descricao: "Cria rotina agendada (valida args na criação)", corpo: true },
  { method: "GET", path: "/schedules/:id", descricao: "Detalhe da rotina" },
  { method: "PATCH", path: "/schedules/:id", descricao: "Edita rotina (ativo, nome, agenda_tipo/valor, args, graca_min)", corpo: true },
  { method: "DELETE", path: "/schedules/:id", descricao: "Exclui rotina" },
  { method: "POST", path: "/schedules/:id/run", descricao: "Executa rotina imediatamente (run-now)" },
  { method: "POST", path: "/schedules/:id", descricao: "Alias de /schedules/:id/run" },
  { method: "GET", path: "/schedules/:id/runs", descricao: "Histórico de execuções da rotina (job_runs)" },
  { method: "GET", path: "/secretario/sessoes/:id", descricao: "Detalhe/mensagens de uma sessão do opencode (proxy)", publico: false },
  { method: "GET", path: "/opencode-config", descricao: "Config do opencode do opencorp (<home>/.opencorp/opencode-home/opencode.json) → { config, path }", publico: false },
  { method: "PUT", path: "/opencode-config", descricao: "Salva a config do opencode do opencorp (valida objeto JSON, cap 64KB, preserva $schema) — vale após reiniciar o secretário", corpo: true, publico: false },
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

/** Valida e resolve caminho dentro do workspace (anti path-traversal).
 *  pathParam já vem decodificado de searchParams.get — NÃO decodificar de novo. */
async function resolverCaminhoWorkspace(wsPath: string, pathParam: string): Promise<string> {
  const base = resolve(wsPath);
  const solicitado = pathParam ?? "";
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

/** Lê arquivo com limite de 512KB, retorna {tipo, conteudo} ou {tipo, conteudo: null, motivo}.
 *  realpath no alvo: symlink dentro do workspace apontando para FORA é bloqueado.
 *  Qualquer arquivo de texto abre (sem whitelist de extensão): binário é detectado
 *  por sniffing de byte NUL nos primeiros 8KB — cobre .ts/.js/.css/.sh/.yml etc. */
async function lerArquivoWorkspace(alvo: string, base: string): Promise<{ tipo: "arquivo"; conteudo: string | null; motivo?: string }> {
  const real = await realpath(alvo).catch(() => null);
  if (!real || (!isAbsolute(base) ? false : relative(resolve(base), real).startsWith(".."))) {
    return { tipo: "arquivo", conteudo: null, motivo: "symlink fora do workspace (bloqueado)" };
  }
  const info = await stat(alvo);
  if (info.size > 512 * 1024) {
    return { tipo: "arquivo", conteudo: null, motivo: "arquivo excede 512KB" };
  }
  if (info.size > 0) {
    const fd = await open(alvo, "r");
    try {
      const sniff = Buffer.alloc(Math.min(info.size, 8 * 1024));
      await fd.read(sniff, 0, sniff.length, 0);
      if (sniff.includes(0)) {
        return { tipo: "arquivo", conteudo: null, motivo: "binário (abertura só para texto)" };
      }
    } finally {
      await fd.close();
    }
  }
  const conteudo = await readFile(alvo, "utf8");
  return { tipo: "arquivo", conteudo };
}

/** Nó da árvore de arquivos (GET /files/tree — PLANO-PAINEL-V2 Etapa 3.1) */
interface NoArvore {
  nome: string;
  /** caminho relativo à raiz do workspace */
  caminho: string;
  tipo: "dir" | "arquivo";
  tamanho?: number;
  filhos?: NoArvore[];
}

/** Lista FIXA de diretórios ignorados pela árvore (não configurável nesta etapa) */
const ARVORE_IGNORAR_DIRS = new Set(["node_modules", ".git", "dist", "web-dist", "__pycache__"]);
/** Cap total de nós — evita varreduras gigantes; excedido → flag truncado:true */
const ARVORE_CAP_NOS = 3000;

/**
 * Constrói a árvore recursiva a partir da raiz do workspace: dirs primeiro,
 * alfabética em cada nível; *.log e .opencorp/logs fora. Ao estourar o cap,
 * para de listar e marca truncado.
 */
async function construirArvore(raiz: string, profundidadeMax: number): Promise<{ arvore: NoArvore[]; truncado: boolean }> {
  let total = 0;
  let truncado = false;
  async function listar(dirAbs: string, rel: string, profundidade: number): Promise<NoArvore[]> {
    if (total >= ARVORE_CAP_NOS) {
      truncado = true;
      return [];
    }
    let entradas;
    try {
      entradas = await readdir(dirAbs, { withFileTypes: true });
    } catch {
      return []; // ramo sem permissão/que sumiu — segue sem ele
    }
    const visiveis = entradas.filter((e) => {
      if (ARVORE_IGNORAR_DIRS.has(e.name)) return false;
      if (e.name === "logs" && rel === ".opencorp") return false;
      if ((e.name === "chats" || e.name === "execucoes") && rel === ".opencorp/registries") return false;
      return true;
    });
    const porNome = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
    const dirs = visiveis.filter((e) => e.isDirectory()).sort(porNome);
    const arquivos = visiveis.filter((e) => !e.isDirectory()).sort(porNome);
    const nos: NoArvore[] = [];

    // Adiciona todos os nós do nível atual primeiro para garantir que pastas irmãs na raiz nunca sejam omitidas
    for (const e of [...dirs, ...arquivos]) {
      if (total >= ARVORE_CAP_NOS) {
        truncado = true;
        break;
      }
      const caminhoRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        const no: NoArvore = { nome: e.name, caminho: caminhoRel, tipo: "dir", filhos: [] };
        nos.push(no);
        total++;
      } else {
        let tamanho = 0;
        try {
          tamanho = (await stat(join(dirAbs, e.name))).size;
        } catch {
          /* sumiu entre readdir e stat — tamanho 0 */
        }
        nos.push({ nome: e.name, caminho: caminhoRel, tipo: "arquivo", tamanho });
        total++;
      }
    }

    // Depois desce recursivamente nos subdiretórios
    for (const no of nos) {
      if (no.tipo === "dir" && profundidade + 1 < profundidadeMax && total < ARVORE_CAP_NOS) {
        no.filhos = await listar(join(dirAbs, no.nome), no.caminho, profundidade + 1);
      }
    }

    return nos;
  }
  const arvore = await listar(raiz, "", 0);
  return { arvore, truncado };
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
  if (erro instanceof NotificationError) return ((erro as unknown as { status?: number }).status ?? 400);
  if (erro instanceof AppError) return ((erro as unknown as { status?: number }).status ?? 404);
  if (erro instanceof RegistryError || erro instanceof WorkspaceError || erro instanceof AgentError) return 422;
  if (erro instanceof FlowError) return /não encontrado/i.test(erro.message) ? 404 : 400;
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

async function lerCorpo(req: IncomingMessage, maxBytes = 30 * 1024 * 1024): Promise<unknown> {
  const partes: Buffer[] = [];
  let total = 0;
  for await (const parte of req) {
    total += (parte as Buffer).length;
    if (total > maxBytes) {
      req.destroy(); // corta o stream — evita buffering de corpos gigantes
      throw new Error(`corpo excede ${maxBytes} bytes`);
    }
    partes.push(parte as Buffer);
  }
  const texto = Buffer.concat(partes).toString("utf8").trim();
  if (!texto) return {};
  return JSON.parse(texto) as unknown;
}

async function lerCorpoComTexto(req: IncomingMessage, maxBytes = 30 * 1024 * 1024): Promise<{ json: Record<string, unknown>; raw: string }> {
  const partes: Buffer[] = [];
  let total = 0;
  for await (const parte of req) {
    total += (parte as Buffer).length;
    if (total > maxBytes) {
      req.destroy();
      throw new Error(`corpo excede ${maxBytes} bytes`);
    }
    partes.push(parte as Buffer);
  }
  const raw = Buffer.concat(partes).toString("utf8");
  const texto = raw.trim();
  if (!texto) return { json: {}, raw };
  try {
    const json = JSON.parse(texto) as Record<string, unknown>;
    return { json, raw };
  } catch {
    return { json: { _raw: texto }, raw };
  }
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

/** Onde um agente é citado: specs de teams (.opencorp/teams/*.json), grafos de flows
 *  (.opencorp/flows/*.json, nós agente/decisao) e tasks abertas (responsavel=agente:id).
 *  Usado pela guarda de exclusão (PUT DELETE /agents/:id → 409). */
async function citacoesAgente(
  wsPath: string,
  idAgente: string,
  listarTasks: (p: string) => Promise<Array<{ responsavel?: string; coluna: string; id: string; titulo: string }>>,
): Promise<string[]> {
  const citacoes: string[] = [];
  const { readdirSync, readFileSync, existsSync } = await import("node:fs");
  const { join } = await import("node:path");

  const varreDirJson = (dir: string, rotulo: string, contemAgente: (obj: Record<string, unknown>, id: string) => boolean): void => {
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      try {
        const obj = JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, unknown>;
        if (contemAgente(obj, String(obj.id ?? f.replace(/\.json$/, "")))) citacoes.push(`${rotulo} ${obj.id ?? f.replace(/\.json$/, "")}`);
      } catch {
        /* arquivo ilegível não bloqueia exclusão */
      }
    }
  };

  /** Teams/flows: confere o JSON inteiro — pega nós agente E os nós da fusão
   *  (fanout.paralelos/sintese, review.executor/revisor, debate.proponentes/moderador),
   *  que todos usam a forma { "agente": "<id>" } (achado da auditoria #2). */
  const jsonCita = (obj: Record<string, unknown>): boolean =>
    JSON.stringify(obj).includes(`"agente":"${idAgente}"`) || JSON.stringify(obj).includes(`"agente": "${idAgente}"`);

  varreDirJson(join(wsPath, ".opencorp", "teams"), "team", (obj) => jsonCita(obj));
  varreDirJson(join(wsPath, ".opencorp", "flows"), "flow", (obj) => jsonCita(obj));

  try {
    const abertas = await listarTasks(wsPath);
    for (const t of abertas) {
      if (t.responsavel === `agente:${idAgente}` && t.coluna !== "feito") citacoes.push(`task ${t.id} (${t.titulo})`);
    }
  } catch {
    /* board indisponível não bloqueia */
  }

  return citacoes;
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
  const notificacoes = new NotificationStore();
  const orquestrador = new OrquestradorDeTeams();
  const hooks = new HookStore({
    executores: {
      agentRun: async (agente: string, ordem: string, wsPath: string, gatilho?: { tipo: string; origem: string }) => {
        const r = await sessoes.rodar({
          agente,
          ordem,
          workspaceDir: wsPath,
          execId: gerarIdExec(),
          gatilho,
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
        rodar: async (agente: string, ordem: string, wsPath: string, gatilho?: { tipo: string; origem: string }) => {
          const r = await sessoes.rodar({
            agente,
            ordem,
            workspaceDir: wsPath,
            execId: gerarIdExec(),
            gatilho,
          } as OpcoesRun);
          return { id: r.id, captura: r.captura };
        },
      },
    });
  }

  // token === "" → modo ABERTO (sem autenticação) — usado por `opencorp web` por padrão;
  // `--token` (sem valor) gera aleatório; `--token valor` usa o informado.
  const semAuth = opcoes.token === "";
  const token = opcoes.token === undefined ? randomBytes(24).toString("hex") : opcoes.token;

  // OpencodeServerManager para o secretário (injetaável para testes)
  const opencodeServer = opcoes.opencodeServer ?? new OpencodeServerManager({ homeDir: opcoes.homeDir });

  function obterChaveOpenRouter(homeDir: string): string | null {
    const caminhos = [
      join(homeDir, ".local", "share", "opencode", "auth.json"),
      join(homeDir, ".opencorp", "opencode-data", "opencode", "auth.json"),
      join(homeDir, ".opencorp", "secrets.json"),
    ];
    for (const c of caminhos) {
      if (existsSync(c)) {
        try {
          const j = JSON.parse(readFileSync(c, "utf8"));
          if (j.openrouter?.key) return String(j.openrouter.key).trim();
          if (j.openrouter_key) return String(j.openrouter_key).trim();
        } catch {}
      }
    }
    return process.env.OPENROUTER_API_KEY || null;
  }

  async function gerarPromptComIA(
    homeDir: string,
    descricao: string,
    modeloPreferido?: string,
    modelosFallback: string[] = [],
  ): Promise<{ prompt: string; modelo: string }> {
    const chave = obterChaveOpenRouter(homeDir);
    const modelosCandidatos = [
      modeloPreferido,
      ...modelosFallback,
      "nvidia/nemotron-3.5-lightning:free",
      "nvidia/nemotron-3-ultra-550b-a55b:free",
      "minimax/minimax-m3:free",
    ]
      .filter(Boolean)
      .map((m) => String(m).replace(/^openrouter\//, "").trim());

    if (chave) {
      for (const mod of modelosCandidatos) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 28000);
          const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${chave}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: mod,
              messages: [
                {
                  role: "system",
                  content:
                    "Você é um arquiteto especialista em Agentes Autônomos de Inteligência Artificial. " +
                    "Crie um System Prompt em formato Markdown profissional, detalhado, rico e em português para o agente solicitado. " +
                    "Estruture o prompt com as seções: # [Nome do Agente], ## Papel & Missão Principal, ## Diretrizes & Regras de Ação, ## Formato de Resposta & Comunicação, ## Restrições & Segurança. " +
                    "IMPORTANTE: Não inclua processos de pensamento (thinking). Comece a resposta imediatamente com '# System Prompt:'. Retorne apenas o markdown do prompt, sem blocos de código envolvendo tudo.",
                },
                {
                  role: "user",
                  content: `Gere o System Prompt completo para este agente: ${descricao}`,
                },
              ],
              max_tokens: 1200,
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (res.ok) {
            const data = (await res.json()) as any;
            let content = data.choices?.[0]?.message?.content;
            if (typeof content === "string" && content.trim().length > 50) {
              if (content.includes("# ")) {
                content = content.slice(content.indexOf("# "));
              }
              content = content.replace(/^```markdown\s*/i, "").replace(/\s*```$/, "").trim();
              return { prompt: content, modelo: `openrouter/${mod}` };
            }
          }
        } catch {}
      }
    }

    // Fallback estruturado caso a API externa não responda
    const promptFallback = [
      `# System Prompt: ${descricao.split("\n")[0]?.slice(0, 60) || "Agente Especialista"}`,
      "",
      "## Papel & Missão Principal",
      `Você é um agente autônomo especialista encarregado da seguinte missão: ${descricao}`,
      "Sua função é atuar com excelência, pensamento crítico e foco em entregar resultados concretos de alto valor para o workspace.",
      "",
      "## Diretrizes & Regras de Ação",
      "1. Analise o contexto completo antes de iniciar qualquer execução.",
      "2. Execute tarefas de forma precisa, modular e documentada.",
      "3. Siga boas práticas de engenharia de software e padrões corporativos.",
      "4. Priorize decisões estratégicas que otimizem tempo e recursos.",
      "5. Valide seus passos antes de concluir para garantir precisão máxima.",
      "",
      "## Formato de Resposta & Comunicação",
      "- Seja direto, profissional e objetivo.",
      "- Utilize Markdown para estruturar tópicos, passos e relatórios.",
      "- Apresente dados em tabelas ou listas quando facilitar a compreensão.",
      "- Justifique decisões técnicas com clareza.",
      "",
      "## Restrições & Segurança",
      "- Não execute comandos destrutivos sem verificação de impacto.",
      "- Respeite os limites operacionais e políticas de segurança do workspace.",
      "- Em caso de ambiguidade crítica, documente as premissas adotadas.",
    ].join("\n");

    return { prompt: promptFallback, modelo: modeloPreferido || "fallback-local" };
  }

  async function resolverWs(url: URL): Promise<{ id: string; path: string }> {
    const id = url.searchParams.get("workspace") ?? opcoes.workspace ?? undefined;
    return workspaces.resolver(id) as unknown as { id: string; path: string };
  }

  // Rejeições órfãs de operações em background (fire-and-forget) não podem
  // derrubar o server silenciosamente — loga e segue servindo.
  process.on("unhandledRejection", (motivo) => {
    console.error("[server] unhandledRejection:", motivo);
  });
  process.on("uncaughtException", (erro) => {
    console.error("[server] uncaughtException:", erro);
  });

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
      // SPA fallback para URLs limpas (/secretario, /workspace, /docs...) — history API sem # (só para navegação, não para API JSON)
      const accept = String(req.headers.accept || "");
      const querHtml = accept.includes("text/html");
      if (req.method === "GET" && querHtml && /^\/(home|tasks|agentes|secretario|workspace|agenda|fluxos|hooks|apps|historico|notificacoes|docs|config|app)(\/.*)?$/.test(rota)) {
        const index = servirEstatico("/");
        if (index) {
          res.writeHead(200, { "content-type": index.tipo, "access-control-allow-origin": "*", "cache-control": "no-cache" });
          res.end(index.corpo);
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
        semAuth ||
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
            template?: string;
            path?: string;
            perfil?: { empresa?: string; nicho?: string; publico?: string; tom?: string; tom_evitar?: unknown[]; topicos?: unknown[]; diferenciais?: unknown[] };
          };
          const criado = await workspaces.criar(corpo.id ?? "", { template: corpo.template, path: corpo.path });
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
            await writeFileAtomic(join(criado.path, ".opencorp", "projeto.json"), `${JSON.stringify(projeto, null, 2)}\n`);
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
          const corpo = (await lerCorpo(req)) as {
            id?: string;
            from?: string;
            model?: string;
            role?: string;
            corpo_prompt?: string;
            permissions?: string;
            ativo?: boolean;
          };
          const criado = await agentes.criar(ws.path, corpo.id ?? "", { de: corpo.from, model: corpo.model });
          // Se vieram campos extras (role, corpo_prompt, permissions), aplica via editar()
          const temExtras = corpo.role || corpo.corpo_prompt || corpo.permissions || corpo.ativo !== undefined;
          if (temExtras) {
            const editado = await agentes.editar(ws.path, criado.frontmatter.id, {
              role: corpo.role,
              model: corpo.model,
              permissions: corpo.permissions as "level-1" | "level-2" | "level-3" | undefined,
              corpo: corpo.corpo_prompt,
              ativo: corpo.ativo,
            });
            enviar(res, 201, { id: editado.id, modelo: editado.model, role: editado.role });
          } else {
            enviar(res, 201, { id: criado.frontmatter.id, modelo: criado.frontmatter.model });
          }
          return;
        }
        if (rota === "/agents/gerar-prompt" && req.method === "POST") {
          const ws = await resolverWs(url);
          const corpo = (await lerCorpo(req)) as { descricao?: string; modelo?: string };
          const descricao = String(corpo.descricao ?? "").trim();
          if (!descricao) {
            enviar(res, 400, { erro: "campo 'descricao' é obrigatório para gerar o prompt" });
            return;
          }

          const s = await settings.resolve({ workspaceDir: ws.path });
          const modeloPref = corpo.modelo?.trim() || s.settings.default_model;
          const fallbackList = s.settings.tests?.rotation || [];
          const home = opcoes.homeDir ?? opencorpHome();

          const resultado = await gerarPromptComIA(home, descricao, modeloPref, fallbackList);
          enviar(res, 200, resultado);
          return;
        }

        if (rota === "/agents/aplicar-modelo-global" && req.method === "POST") {
          const ws = await resolverWs(url);
          const corpo = (await lerCorpo(req)) as { model?: string };
          const s = await settings.resolve({ workspaceDir: ws.path });
          const modeloAlvo = corpo.model?.trim() || s.settings.default_model || "openrouter/nvidia/nemotron-3.5-lightning:free";
          const lista = await agentes.listar(ws.path);
          let alterados = 0;
          for (const ag of lista) {
            try {
              await agentes.editar(ws.path, ag.id, { model: modeloAlvo });
              alterados++;
            } catch {}
          }
          eventBus.emit("agentes.atualizados", { total: alterados, modelo: modeloAlvo });
          enviar(res, 200, { ok: true, alterados, modelo: modeloAlvo });
          return;
        }

        if (rota === "/agents/semear-catalogo" && req.method === "POST") {
          // Etapa 5 — copia os agentes do catálogo que ainda não existem (idempotente)
          const ws = await resolverWs(url);
          const resultado = await agentes.semearCatalogo(ws.path);
          enviar(res, 200, resultado);
          return;
        }
        const mAgente = /^\/agents\/([^/]+)$/.exec(rota);
        if (mAgente && req.method === "GET") {
          const ws = await resolverWs(url);
          const carregado = await agentes.carregar(ws.path, decodeURIComponent(mAgente[1]!));
          enviar(res, 200, { ...carregado.frontmatter, corpo_prompt: carregado.corpo });
          return;
        }
        if (mAgente && req.method === "PUT") {
          // edição do frontmatter (PLANO-WEB-CRUD C2) — zod + bridge no AgentStore.editar
          const ws = await resolverWs(url);
          const id = decodeURIComponent(mAgente[1]!);
          const corpo = (await lerCorpo(req)) as Record<string, unknown>;
          if (corpo.ativo !== undefined && typeof corpo.ativo !== "boolean") {
            enviar(res, 422, { erro: "campo 'ativo' deve ser boolean (true/false)" });
            return;
          }
          // agentes de sistema: o Secretário inteiro depende deles — desativação é bloqueada
          if (corpo.ativo === false && (id === "secretario" || id === "secretario-exec")) {
            enviar(res, 422, { erro: "secretário e secretário-exec são agentes de sistema e não podem ser desativados" });
            return;
          }
          const salvo = await agentes.editar(ws.path, id, {
            role: corpo.role !== undefined ? String(corpo.role) : undefined,
            model: corpo.model !== undefined ? String(corpo.model) : undefined,
            permissions: corpo.permissions !== undefined ? (String(corpo.permissions) as "level-1" | "level-2" | "level-3") : undefined,
            tools: Array.isArray(corpo.tools) ? (corpo.tools as unknown[]).map(String).filter(Boolean) : undefined,
            budget_daily_usd: typeof corpo.budget_daily_usd === "number" ? corpo.budget_daily_usd : undefined,
            budget_max_turns: typeof corpo.budget_max_turns === "number" ? corpo.budget_max_turns : undefined,
            ativo: corpo.ativo as boolean | undefined,
            corpo: typeof corpo.corpo_prompt === "string" ? corpo.corpo_prompt : (typeof corpo.corpo === "string" ? corpo.corpo : undefined),
          });
          eventBus.emit("agente.editado", { agente: id });
          enviar(res, 200, salvo);
          return;
        }
        if (mAgente && req.method === "DELETE") {
          // guarda: agente citado em teams/flows/task responsável → 409 (PLANO-WEB-CRUD C3, decisão do dono: bloquear)
          const ws = await resolverWs(url);
          const id = decodeURIComponent(mAgente[1]!);
          const citacoes = await citacoesAgente(ws.path, id, (p) => tasks.listar(p));
          try {
            for (const h of hooks.listar(ws.path)) {
              const alvo = h.alvo as { tipo?: string; agente?: string };
              if (alvo?.tipo === "agent_run" && alvo.agente === id) citacoes.push(`hook ${h.id}`);
            }
          } catch {
            /* hooks indisponíveis não bloqueiam */
          }
          if (citacoes.length) {
            enviar(res, 409, {
              erro: `agente "${id}" está em uso e não pode ser excluído — remova-o primeiro de: ${citacoes.slice(0, 8).join(", ")}${citacoes.length > 8 ? ` (+${citacoes.length - 8})` : ""}`,
              citacoes,
            });
            return;
          }
          await agentes.excluir(ws.path, id);
          eventBus.emit("agente.excluido", { agente: id });
          enviar(res, 200, { ok: true, id });
          return;
        }
        const mAgenteRun = /^\/agents\/([^/]+)\/run$/.exec(rota);
        if (mAgenteRun && req.method === "POST") {
          const ws = await resolverWs(url);
          const idRun = decodeURIComponent(mAgenteRun[1]!);
          const corpo = (await lerCorpo(req)) as { ordem?: string; model?: string };
          // Etapa 5 — guard antes do 202: agente desativado não entra em execução
          const alvo = await agentes.carregar(ws.path, idRun);
          if (alvo.frontmatter.ativo === false) {
            enviar(res, 409, { erro: `agente '${idRun}' está desativado — ative no painel de agentes` });
            return;
          }
          const execId = gerarIdExec();
          const opcoes: OpcoesRun = {
            agente: idRun,
            ordem: corpo.ordem ?? "",
            model: corpo.model,
            workspaceDir: ws.path,
            workspaceId: ws.id,
            execId,
            gatilho: { tipo: "manual", origem: `api:${ws.id}` },
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

        // ── /historico — fonte única p/ a view Histórico (filtro por agente server-side) ──
        if (rota === "/historico" && req.method === "GET") {
          const ws = await resolverWs(url);
          const agente = url.searchParams.get("agente")?.trim() || undefined;
          const tipo = url.searchParams.get("tipo")?.trim() || undefined;
          const limite = Math.min(Number(url.searchParams.get("limite")) || 200, 500);
          const itens: Array<{ id: string; tipo: string; titulo: string; agente: string; quando: string | null; status?: string; gatilho?: { tipo: string; origem: string } }> = [];

          if (!tipo || tipo === "execucao") {
            const execs = (await sessoes.listarExecucoes(ws.path, agente ? { agente } : undefined)) as Array<{
              id: string;
              agente: string;
              inicio: string;
              status: string;
              gatilho?: { tipo: string; origem: string };
            }>;
            for (const e of execs.slice(0, limite)) {
              itens.push({ id: e.id, tipo: "execucao", titulo: e.id, agente: e.agente, quando: e.inicio, status: e.status, gatilho: e.gatilho });
            }
          }
          if (!tipo || tipo === "task") {
            const todas = await tasks.listar(ws.path);
            for (const t of todas) {
              const resp = (t.responsavel ?? "").replace(/^agente:/, "");
              if (agente && resp !== agente) continue;
              itens.push({ id: t.id, tipo: "task", titulo: t.titulo, agente: resp, quando: t.criado_em || null, status: t.coluna });
            }
          }
          if (!tipo || tipo === "rotina") {
            const jobs = await scheduler.listar();
            for (const j of jobs.filter((j) => j.workspace === ws.id)) {
              if (agente) continue; // rotinas não pertencem a um agente específico
              itens.push({ id: j.id, tipo: "rotina", titulo: j.nome, agente: "", quando: j.ultima_exec ?? j.criado_em ?? null, status: j.ativo ? "ativa" : "pausada" });
            }
          }
          if (!tipo || tipo === "conversa") {
            // conversas da secretária espelhadas no corp.db
            if (!agente || agente.startsWith("secretario")) {
              const conversas = registros.corpDb(ws.path).listarSessoes({ agentePrefixo: "secretario", limite });
              for (const c of conversas) {
                if (agente && c.agente !== agente) continue;
                itens.push({ id: c.id, tipo: "conversa", titulo: "Conversa — " + c.agente, agente: c.agente, quando: c.inicio, status: c.status });
              }
            }
          }

          itens.sort((a, b) => (b.quando ?? "").localeCompare(a.quando ?? ""));
          enviar(res, 200, itens.slice(0, limite));
          return;
        }

        // ── /docs — Documentação unificada para Web UI e Agentes ──
        if (rota === "/docs" && req.method === "GET") {
          const itens = [
            { slug: "estudo-padronizacao", titulo: "Estudo de Arquitetura e Padronização", arquivo: "ESTUDO-ARQUITETURA-E-PADRONIZACAO-AGENTES.md", categoria: "Guia & Padronização" },
            { slug: "01-visao-geral", titulo: "01. Visão Geral da Plataforma", arquivo: "01-visao-geral.md", categoria: "Conceitos" },
            { slug: "02-arquitetura", titulo: "02. Arquitetura do Sistema", arquivo: "02-arquitetura.md", categoria: "Conceitos" },
            { slug: "03-workspaces", titulo: "03. Workspaces e Templates", arquivo: "03-workspaces-templates-subcorp.md", categoria: "Operação" },
            { slug: "04-agentes", titulo: "04. Agentes e Papéis", arquivo: "04-agentes.md", categoria: "Operação" },
            { slug: "05-registros", titulo: "05. Registros e Memória", arquivo: "05-registros-e-memoria.md", categoria: "Operação" },
            { slug: "06-painel", titulo: "06. Painel e Configurações", arquivo: "06-painel-configuracoes.md", categoria: "Interface" },
            { slug: "07-seguranca", titulo: "07. Segurança e Orçamento", arquivo: "07-seguranca-custos.md", categoria: "Governança" },
            { slug: "08-cli", titulo: "08. Referência do CLI e oc", arquivo: "08-cli-referencia.md", categoria: "Referência" },
            { slug: "capacidades", titulo: "Capacidades da Empresa", arquivo: "CAPACIDADES-EMPRESA.md", categoria: "Referência" },
          ];
          enviar(res, 200, itens);
          return;
        }
        const mDoc = /^\/docs\/([^/]+)$/.exec(rota);
        if (mDoc && req.method === "GET") {
          const slug = decodeURIComponent(mDoc[1]!);
          const mapaArquivos: Record<string, { titulo: string; arquivo: string; categoria: string }> = {
            "estudo-padronizacao": { titulo: "Estudo de Arquitetura e Padronização", arquivo: "ESTUDO-ARQUITETURA-E-PADRONIZACAO-AGENTES.md", categoria: "Guia & Padronização" },
            "01-visao-geral": { titulo: "01. Visão Geral da Plataforma", arquivo: "01-visao-geral.md", categoria: "Conceitos" },
            "02-arquitetura": { titulo: "02. Arquitetura do Sistema", arquivo: "02-arquitetura.md", categoria: "Conceitos" },
            "03-workspaces": { titulo: "03. Workspaces e Templates", arquivo: "03-workspaces-templates-subcorp.md", categoria: "Operação" },
            "04-agentes": { titulo: "04. Agentes e Papéis", arquivo: "04-agentes.md", categoria: "Operação" },
            "05-registros": { titulo: "05. Registros e Memória", arquivo: "05-registros-e-memoria.md", categoria: "Operação" },
            "06-painel": { titulo: "06. Painel e Configurações", arquivo: "06-painel-configuracoes.md", categoria: "Interface" },
            "07-seguranca": { titulo: "07. Segurança e Orçamento", arquivo: "07-seguranca-custos.md", categoria: "Governança" },
            "08-cli": { titulo: "08. Referência do CLI e oc", arquivo: "08-cli-referencia.md", categoria: "Referência" },
            "capacidades": { titulo: "Capacidades da Empresa", arquivo: "CAPACIDADES-EMPRESA.md", categoria: "Referência" },
          };
          const item = mapaArquivos[slug];
          const arquivoNome = item?.arquivo || (slug.endsWith(".md") ? slug : `${slug}.md`);
          const arquivoPath = join(docsRoot, arquivoNome);
          if (!existsSync(arquivoPath)) {
            enviar(res, 404, { erro: `documento "${slug}" não encontrado` });
            return;
          }
          const conteudo = readFileSync(arquivoPath, "utf8");
          enviar(res, 200, {
            slug,
            titulo: item?.titulo || slug,
            categoria: item?.categoria || "Documentação",
            arquivo: arquivoNome,
            conteudo,
          });
          return;
        }

        // ── /execucoes — ledger unificado (PLANO-UNIFICACAO): toda ativação de agente, de qualquer
        // motor, com gatilho (cron/mencao/dependencia/padrao/turno/evento/manual) — a leitura cross-motor ──
        if (rota === "/execucoes" && req.method === "GET") {
          const ws = await resolverWs(url);
          const filtro = {
            agente: url.searchParams.get("agente")?.trim() || undefined,
            gatilho_tipo: url.searchParams.get("gatilho")?.trim() || undefined,
            gatilho_origem: url.searchParams.get("origem")?.trim() || undefined,
            status: url.searchParams.get("status")?.trim() || undefined,
            limite: Math.min(Number(url.searchParams.get("limite")) || 100, 500),
          };
          enviar(res, 200, registros.corpDb(ws.path).listarExecucoes(filtro));
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
        const mAprov = /^(?:\/approvals\/([^/]+)\/(approve|reject)|\/secretario\/hitl\/([^/]+)\/(aprovar|rejeitar))$/.exec(rota);
        if (mAprov && req.method === "POST") {
          const ws = await resolverWs(url);
          const id = decodeURIComponent(mAprov[1] || mAprov[3]!);
          const acao = (mAprov[2] || mAprov[4]) === "approve" || (mAprov[2] || mAprov[4]) === "aprovar" ? "approve" : "reject";
          if (acao === "approve") {
            const p = await approvals.aprovar(ws.path, id);
            // retoma imediatamente sem esperar o tick (15min) — dispara o agente para a mesma ordem com pularGuard
            if (p.padrao?.startsWith("hook:")) {
              void (async () => {
                try {
                  const sessoes = new SessionManager({ homeDir: opcoes.homeDir ?? opencorpHome() });
                  await sessoes.rodar({
                    agente: p.agente || "executor-padrao",
                    ordem: p.ordem,
                    workspaceDir: ws.path,
                    pularGuard: true,
                    gatilho: { tipo: "webhook", origem: p.padrao },
                  }).catch((e) => console.error(`[approval hook] falha ao rodar ordem aprovada:`, e));
                } catch (e) {
                  console.error(`[approval hook] erro:`, e);
                }
              })();
            } else if (p.exec_id) {
              void (async () => {
                try {
                  const registros = new RegistryStore();
                  const meta = await registros.lerMeta(ws.path, "execucoes", p.exec_id).catch(() => null);
                  if (meta && (meta.extras as Record<string, unknown>)?.status === "hitl_pendente") {
                    const ordem = String((meta.extras as Record<string, unknown>)?.ordem ?? p.ordem ?? "");
                    const agente = String(p.agente || (meta as unknown as { criadoPor: string }).criadoPor || "wp-admin");
                    const sessoes = new SessionManager({ homeDir: opcoes.homeDir ?? opencorpHome() });
                    const extras = (meta.extras ?? {}) as Record<string, unknown>;
                    extras.status = "executando";
                    meta.extras = extras;
                    await registros.salvarMeta(ws.path, "execucoes", meta.id, meta);
                    await (sessoes as unknown as { rodar: (o: unknown) => Promise<unknown> }).rodar({
                      agente,
                      ordem,
                      workspaceDir: ws.path,
                      pularGuard: true,
                    }).catch(() => {});
                  }
                } catch {}
              })();
            }
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
          // P-27: o painel (web/views/config.ts) injeta ?escopo= explicitamente
          // porque o api() do front acrescenta ?workspace=<ativo> em TODA request —
          // sem isso o toggle Global ⇄ Workspace era ignorado (lista sempre mesclada).
          // Escolha: ?escopo=global lista SÓ o settings global (+ defaults), IGNORANDO
          // o ?workspace= da query; ?escopo=workspace mantém a lista mesclada com as
          // badges de origem reais; SEM o parâmetro, comportamento legado (mesclada)
          // para CLI e consumidores antigos.
          if (url.searchParams.get("escopo") === "global") {
            const entradas = await settings.list({ scope: "global" });
            enviar(res, 200, entradas);
            return;
          }
          const ws = await resolverWs(url);
          const entradas = await settings.list({ workspaceDir: ws.path });
          enviar(res, 200, entradas);
          return;
        }

        if (rota === "/settings/modelos" && req.method === "GET") {
          const ws = await resolverWs(url);
          const s = await settings.resolve({ workspaceDir: ws.path });
          const policyFile = join(ws.path, ".opencorp", "security_policy.json");
          let secPolicy: any = {};
          if (existsSync(policyFile)) {
            try { secPolicy = JSON.parse(readFileSync(policyFile, "utf8")); } catch {}
          }
          enviar(res, 200, {
            default_model: s.settings.default_model || "openrouter/nvidia/nemotron-3.5-lightning:free",
            rotation: s.settings.tests?.rotation || [
              "openrouter/nvidia/nemotron-3.5-lightning:free",
              "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
              "openrouter/minimax/minimax-m3:free",
            ],
            global_full_access: secPolicy.global_full_access === true || secPolicy.level === "permissive",
          });
          return;
        }

        if (rota === "/settings/modelos" && req.method === "PUT") {
          const ws = await resolverWs(url);
          const corpo = (await lerCorpo(req)) as {
            default_model?: string;
            rotation?: string[];
            global_full_access?: boolean;
          };
          if (corpo.default_model && corpo.default_model.trim()) {
            await settings.set("default_model", corpo.default_model.trim(), { scope: "global" });
          }
          if (Array.isArray(corpo.rotation)) {
            const limpa = corpo.rotation.map((s) => String(s).trim()).filter(Boolean);
            const sPath = join(opcoes.homeDir ?? opencorpHome(), ".opencorp", "settings.json");
            try {
              let cur: any = {};
              if (existsSync(sPath)) cur = JSON.parse(readFileSync(sPath, "utf8"));
              cur.tests = cur.tests || {};
              cur.tests.rotation = limpa;
              if (corpo.default_model) cur.default_model = corpo.default_model.trim();
              await writeFileAtomic(sPath, `${JSON.stringify(cur, null, 2)}\n`);
            } catch {}
          }
          if (corpo.global_full_access !== undefined) {
            const policyDir = join(ws.path, ".opencorp");
            await mkdirRecursive(policyDir);
            const policyFile = join(policyDir, "security_policy.json");
            let atual: any = {};
            if (existsSync(policyFile)) {
              try { atual = JSON.parse(readFileSync(policyFile, "utf8")); } catch {}
            }
            atual.global_full_access = Boolean(corpo.global_full_access);
            if (atual.global_full_access) {
              atual.level = "permissive";
            }
            await writeFileAtomic(policyFile, `${JSON.stringify(atual, null, 2)}\n`);
          }
          enviar(res, 200, { ok: true });
          return;
        }

        if (rota === "/settings/security" && req.method === "GET") {
          const ws = await resolverWs(url);
          const policyFile = join(ws.path, ".opencorp", "security_policy.json");
          let policy = {
            level: "permissive",
            blocklist: ["rm -rf /", "shutdown", "reboot", "curl * | bash", "git push --force"],
            allowlist_extra: ["git", "node", "npm", "python3", "pytest", "curl", "wget"],
            network_allowlist: ["pulso-diario.wp.crom.me", "*.crom.me", "*.wp.crom.me", "registry.npmjs.org", "github.com", "*"],
            hitl_patterns: ["DROP TABLE", "DELETE FROM users"],
            prompt_regras: "Permitir curl, inspeção de páginas e comandos de rotina de agentes sem requerer aprovação manual.",
            auto_aprovar_rotinas: true,
          };
          if (existsSync(policyFile)) {
            try {
              policy = { ...policy, ...JSON.parse(readFileSync(policyFile, "utf8")) };
            } catch {}
          }
          enviar(res, 200, policy);
          return;
        }

        if (rota === "/settings/security" && req.method === "PUT") {
          const ws = await resolverWs(url);
          const corpo = (await lerCorpo(req)) as Record<string, unknown>;
          const policyDir = join(ws.path, ".opencorp");
          await mkdirRecursive(policyDir);
          const policyFile = join(policyDir, "security_policy.json");
          let atual: Record<string, unknown> = {};
          if (existsSync(policyFile)) {
            try { atual = JSON.parse(readFileSync(policyFile, "utf8")); } catch {}
          }
          const merged = { ...atual, ...corpo };
          await writeFileAtomic(policyFile, `${JSON.stringify(merged, null, 2)}\n`);
          enviar(res, 200, { ok: true, policy: merged });
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
        if (rota === "/settings/runner" && req.method === "GET") {
          const rPath = join(opcoes.homeDir ?? opencorpHome(), ".opencorp", "runner.json");
          let runner = { engine: "opencode", binary_path: "opencode", timeout_min: 20 };
          if (existsSync(rPath)) {
            try { runner = JSON.parse(readFileSync(rPath, "utf8")); } catch {}
          }
          enviar(res, 200, runner);
          return;
        }

        if ((rota === "/settings/runner" || rota === "/settings") && req.method === "PUT") {
          const corpo = (await lerCorpo(req)) as { chave?: string; valor?: unknown; scope?: string; runner?: unknown };
          if (corpo.runner && typeof corpo.runner === "object") {
            const rPath = join(opcoes.homeDir ?? opencorpHome(), ".opencorp", "runner.json");
            await writeFileAtomic(rPath, `${JSON.stringify(corpo.runner, null, 2)}\n`);
            enviar(res, 200, { ok: true, runner: corpo.runner });
            return;
          }
          if (rota === "/settings/runner") {
            const rPath = join(opcoes.homeDir ?? opencorpHome(), ".opencorp", "runner.json");
            await writeFileAtomic(rPath, `${JSON.stringify(corpo, null, 2)}\n`);
            enviar(res, 200, { ok: true, runner: corpo });
            return;
          }
          const chave = String(corpo.chave ?? "").trim();
          const valorRaw = String(corpo.valor ?? "");
          if (chave === "secretary.model" && valorRaw.trim() === "") {
            const r = await settings.reset(chave, {
              scope: corpo.scope === "workspace" ? "workspace" : "global",
              workspaceDir: (await resolverWs(url)).path,
            });
            enviar(res, 200, r);
            return;
          }
          const r = await settings.set(chave, String(corpo.valor), {
            scope: corpo.scope === "workspace" ? "workspace" : "global",
            workspaceDir: (await resolverWs(url)).path,
          });
          enviar(res, 200, r);
          return;
        }

        // ── secrets (NUNCA retornam valores — só nomes/máscara/tipo de app) ────
        const secretsPath = join(opcoes.homeDir ?? opencorpHome(), ".opencorp", "secrets.json");
        if (rota === "/secrets" && req.method === "GET") {
          let nomes: string[] = [];
          try {
            const bruto = JSON.parse(readFileSync(secretsPath, "utf8")) as Record<string, unknown>;
            nomes = Object.keys(bruto).sort();
          } catch {}
          enviar(res, 200, nomes.map((nome) => ({ nome, definido: true, tipo_app: tipoDeNomeApp(nome) })));
          return;
        }
        if (rota === "/secrets" && req.method === "POST") {
          const corpo = (await lerCorpo(req)) as { nome?: string; valor?: string };
          if (!corpo.nome || typeof corpo.valor !== "string") {
            enviar(res, 400, { erro: "nome e valor obrigatórios" });
            return;
          }
          const erroPerfil = validarPerfilApp(corpo.nome, corpo.valor);
          if (erroPerfil) {
            enviar(res, 422, { erro: erroPerfil });
            return;
          }
          let atual: Record<string, unknown> = {};
          try { atual = JSON.parse(readFileSync(secretsPath, "utf8")) as Record<string, unknown>; } catch {}
          atual[corpo.nome] = corpo.valor;
          await writeFileAtomic(secretsPath, `${JSON.stringify(atual, null, 2)}\n`, { mode: 0o600 });
          enviar(res, 201, { ok: true, nome: corpo.nome });
          return;
        }
        const mSecret = /^\/secrets\/([^/]+)$/.exec(rota);
        if (mSecret && req.method === "PUT") {
          const corpo = (await lerCorpo(req)) as { valor?: string };
          if (typeof corpo.valor !== "string" || corpo.valor.length === 0) {
            enviar(res, 400, { erro: "valor obrigatório" });
            return;
          }
          const nomeSecret = decodeURIComponent(mSecret[1]!);
          // Perfis de app (app:<tipo>:<id>): valor DEVE ser JSON válido contra o schema do tipo
          const erroPerfil = validarPerfilApp(nomeSecret, corpo.valor);
          if (erroPerfil) {
            enviar(res, 422, { erro: erroPerfil });
            return;
          }
          let atual: Record<string, unknown> = {};
          try { atual = JSON.parse(readFileSync(secretsPath, "utf8")) as Record<string, unknown>; } catch {}
          atual[nomeSecret] = corpo.valor;
          await writeFileAtomic(secretsPath, `${JSON.stringify(atual, null, 2)}\n`, { mode: 0o600 });
          enviar(res, 200, { ok: true });
          return;
        }
        if (mSecret && req.method === "DELETE") {
          let atual: Record<string, unknown> = {};
          try { atual = JSON.parse(readFileSync(secretsPath, "utf8")) as Record<string, unknown>; } catch {}
          delete atual[decodeURIComponent(mSecret[1]!)];
          await writeFileAtomic(secretsPath, `${JSON.stringify(atual, null, 2)}\n`, { mode: 0o600 });
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
          const corpo = (await lerCorpo(req)) as {
            id?: string; nome?: string;
            nos?: Flow["nos"];
            arestas?: Flow["arestas"];
          };
          const flowId = (corpo.id ?? "").trim();
          const jaExiste = flowId ? existsSync(flows.caminho(ws.path, flowId)) : false;

          // se o flow já existe no workspace e recebeu grafo completo, atualiza de forma idempotente (upsert)
          if (jaExiste && Array.isArray(corpo.nos)) {
            const atual = await flows.obter(ws.path, flowId);
            await flows.salvar(ws.path, {
              id: flowId,
              nome: corpo.nome ?? atual.nome,
              nos: corpo.nos,
              arestas: corpo.arestas ?? [],
            });
            eventBus.emit("flow-salvo", { flow: flowId });
            enviar(res, 200, await flows.obter(ws.path, flowId));
            return;
          }

          // com grafo no corpo (editor da web), valida e salva inteiro — senão cria só o gatilho
          const f = Array.isArray(corpo.nos) && corpo.nos.length > 0
            ? await flows.salvarComId(ws.path, {
                id: flowId,
                nome: corpo.nome ?? flowId,
                nos: corpo.nos,
                arestas: corpo.arestas ?? [],
              })
            : await flows.criar(ws.path, flowId, corpo.nome ?? flowId);
          enviar(res, 201, f);
          return;
        }
        if (rota === "/flows/migrate-teams" && req.method === "POST") {
          // fusão team×fluxo (PLANO-WEB-CRUD F3): converte teams legados em flows
          const ws = await resolverWs(url);
          enviar(res, 200, await migrarTeamsParaFlows(ws.path, teams, flows));
          return;
        }
        const mFlow = /^\/flows\/([^/]+)$/.exec(rota);
        if (mFlow && req.method === "GET") {
          const ws = await resolverWs(url);
          enviar(res, 200, await flows.obter(ws.path, decodeURIComponent(mFlow[1]!)));
          return;
        }
        if (mFlow && req.method === "PUT") {
          // salva o grafo completo (PLANO-WEB-CRUD B2) — zod + semântica no FlowStore.salvar
          const ws = await resolverWs(url);
          const flowId = decodeURIComponent(mFlow[1]!);
          const corpo = (await lerCorpo(req)) as Record<string, unknown>;
          if (corpo.id && corpo.id !== flowId) {
            enviar(res, 422, { erro: `id do corpo ("${String(corpo.id)}") não bate com a rota ("${flowId}")` });
            return;
          }
          const atual = await flows.obter(ws.path, flowId); // 404 se não existe
          await flows.salvar(ws.path, { ...corpo, id: flowId, nome: String(corpo.nome ?? atual.nome) } as Parameters<typeof flows.salvar>[1]);          eventBus.emit("flow-salvo", { flow: flowId });
          enviar(res, 200, await flows.obter(ws.path, flowId));
          return;
        }
        if (mFlow && req.method === "DELETE") {
          const ws = await resolverWs(url);
          const flowId = decodeURIComponent(mFlow[1]!);
          await flows.deletar(ws.path, flowId);
          eventBus.emit("flow-excluido", { flow: flowId });
          enviar(res, 200, { ok: true, id: flowId });
          return;
        }
        const mFlowExecucoes = /^\/flows\/([^/]+)\/execucoes$/.exec(rota);
        if (mFlowExecucoes && req.method === "GET") {
          const ws = await resolverWs(url);
          const flowId = decodeURIComponent(mFlowExecucoes[1]!);
          enviar(res, 200, await flows.listarExecucoes(ws.path, flowId));
          return;
        }
        const mFlowStatus = /^\/flows\/([^/]+)\/status$/.exec(rota);
        if (mFlowStatus && req.method === "GET") {
          const ws = await resolverWs(url);
          enviar(res, 200, await flows.ultimaExecucao(ws.path, decodeURIComponent(mFlowStatus[1]!)));
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
        const mFlowResume = /^\/flows\/([^/]+)\/resume$/.exec(rota);
        if (mFlowResume && req.method === "POST") {
          const ws = await resolverWs(url);
          const corpo = (await lerCorpo(req)) as { exec_id?: string; model?: string };
          if (!corpo.exec_id) {
            enviar(res, 422, { erro: "corpo obrigatório: { exec_id } — id da execução falha a retomar" });
            return;
          }
          const flowId = decodeURIComponent(mFlowResume[1]!);
          void flows
            .executar(ws.path, flowId, { model: corpo.model, execId: corpo.exec_id, retomar: true })
            .catch(() => undefined);
          enviar(res, 202, { status: "retomando", flow: flowId, exec: corpo.exec_id });
          return;
        }

        // ── reuniões ────────────────────────────────────────────────
        if (rota === "/meetings" && req.method === "GET") {
          const ws = await resolverWs(url);
          const disco = await meetings.listar(ws.path);
          const vivas = meetings.salasVivas(ws.path);
          const idsVivas = new Set(vivas.map((v) => v.id));
          enviar(res, 200, [...vivas, ...disco.filter((s) => !idsVivas.has(s.id))]);
          return;
        }
        if (rota === "/meetings" && req.method === "POST") {
          const ws = await resolverWs(url);
          const corpo = (await lerCorpo(req)) as { pauta?: string; agentes?: string; model?: string };
          const pauta = String(corpo.pauta ?? "").trim();
          if (pauta.length === 0) {
            enviar(res, 422, { erro: 'pauta vazia — informe a pauta: POST /meetings { pauta }' });
            return;
          }
          const novoId = gerarIdReuniao();
          void meetings
            .iniciar({ pauta, agentes: corpo.agentes, model: corpo.model, workspaceDir: ws.path, workspaceId: ws.id, id: novoId })
            .catch(() => undefined);
          enviar(res, 202, { status: "iniciado", id: novoId });
          return;
        }
        const mMeetingGet = /^\/meetings\/([^/]+)$/.exec(rota);
        if (mMeetingGet && req.method === "GET") {
          const ws = await resolverWs(url);
          const meetingId = decodeURIComponent(mMeetingGet[1]!);
          try {
            enviar(res, 200, await meetings.estadoSala(ws.path, meetingId));
          } catch (erro) {
            if (erro instanceof MeetingError || erro instanceof RegistryError) {
              enviar(res, 404, { erro: `reunião "${meetingId}" não encontrada` });
              return;
            }
            throw erro;
          }
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
              const resultado = await lerArquivoWorkspace(alvo, ws.path);
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

        // ── GET /files/tree — árvore recursiva do workspace (Etapa 3.1) ──
        if (rota === "/files/tree" && req.method === "GET") {
          const ws = await resolverWs(url);
          const profBruta = Number(url.searchParams.get("profundidade"));
          const profundidade = Math.min(6, Math.max(1, Number.isFinite(profBruta) ? Math.floor(profBruta) : 4));
          const { arvore, truncado } = await construirArvore(ws.path, profundidade);
          enviar(res, 200, { tipo: "arvore", arvore, truncado });
          return;
        }

        // ── PUT /files — salva conteúdo de arquivo EXISTENTE (Etapa 3.1) ──
        // Guardas: resolverCaminhoWorkspace (403 fora), arquivo tem que existir
        // (404 — sem criar paths novos nesta etapa), cap 1MB (413). utf8 sem BOM.
        if (rota === "/files" && req.method === "PUT") {
          const ws = await resolverWs(url);
          const pathParam = url.searchParams.get("path") ?? "";
          // cap do corpo (1MB de conteúdo + overhead do JSON) — corta no stream, não depois
          let corpo: { conteudo?: unknown };
          try {
            corpo = (await lerCorpo(req, 1.5 * 1024 * 1024)) as { conteudo?: unknown };
          } catch {
            enviar(res, 413, { erro: "corpo excede o limite de 1MB" });
            return;
          }
          const conteudo = typeof corpo.conteudo === "string" ? corpo.conteudo : String(corpo.conteudo ?? "");
          if (Buffer.byteLength(conteudo, "utf8") > 1024 * 1024) {
            enviar(res, 413, { erro: "conteúdo excede 1MB" });
            return;
          }
          try {
            const alvo = await resolverCaminhoWorkspace(ws.path, pathParam);
            // realpath: uniformiza o guard do GET — symlink apontando para FORA do workspace é bloqueado
            const real = await realpath(alvo).catch(() => null);
            if (!real || relative(resolve(ws.path), real).startsWith("..")) {
              enviar(res, 403, { erro: "symlink fora do workspace (bloqueado)" });
              return;
            }
            const info = await stat(alvo).catch(() => null);
            if (!info?.isFile()) {
              enviar(res, 404, { erro: "arquivo não encontrado (escrita não cria paths novos nesta etapa)" });
              return;
            }
            await writeFileAtomic(alvo, conteudo, { encoding: "utf8", createDirs: false });
            enviar(res, 200, { ok: true });
          } catch (erro) {
            if (erro instanceof WorkspaceError && erro.exitCode === 3) {
              enviar(res, 403, { erro: "caminho fora do workspace (path traversal bloqueado)" });
            } else if ((erro as NodeJS.ErrnoException).code === "ENOENT") {
              enviar(res, 404, { erro: "arquivo não encontrado (escrita não cria paths novos nesta etapa)" });
            } else {
              throw erro;
            }
          }
          return;
        }

        // ── POST /files — cria arquivo ou pasta no workspace ──
        if (rota === "/files" && req.method === "POST") {
          const ws = await resolverWs(url);
          const corpo = (await lerCorpo(req)) as { path?: string; tipo?: "arquivo" | "dir"; conteudo?: string };
          const pathParam = String(corpo.path ?? "").trim();
          if (!pathParam) {
            enviar(res, 400, { erro: "caminho (path) é obrigatório" });
            return;
          }
          try {
            const alvo = await resolverCaminhoWorkspace(ws.path, pathParam);
            const tipo = corpo.tipo === "dir" ? "dir" : "arquivo";
            if (tipo === "dir") {
              await mkdir(alvo, { recursive: true });
            } else {
              await mkdir(dirname(alvo), { recursive: true });
              await writeFileAtomic(alvo, String(corpo.conteudo ?? ""), { encoding: "utf8", createDirs: true });
            }
            enviar(res, 201, { ok: true, path: pathParam, tipo });
          } catch (erro) {
            if (erro instanceof WorkspaceError && erro.exitCode === 3) {
              enviar(res, 403, { erro: "caminho fora do workspace (path traversal bloqueado)" });
            } else {
              enviar(res, 500, { erro: `erro ao criar: ${erro instanceof Error ? erro.message : String(erro)}` });
            }
          }
          return;
        }

        // ── DELETE /files — remove arquivo ou pasta no workspace ──
        if (rota === "/files" && req.method === "DELETE") {
          const ws = await resolverWs(url);
          const pathParam = String(url.searchParams.get("path") ?? "").trim();
          if (!pathParam || pathParam === "." || pathParam === "/") {
            enviar(res, 400, { erro: "caminho inválido para exclusão" });
            return;
          }
          try {
            const alvo = await resolverCaminhoWorkspace(ws.path, pathParam);
            const info = await stat(alvo).catch(() => null);
            if (!info) {
              enviar(res, 404, { erro: "arquivo ou pasta não encontrado" });
              return;
            }
            if (info.isDirectory()) {
              await rm(alvo, { recursive: true, force: true });
            } else {
              await unlink(alvo);
            }
            enviar(res, 200, { ok: true, path: pathParam });
          } catch (erro) {
            if (erro instanceof WorkspaceError && erro.exitCode === 3) {
              enviar(res, 403, { erro: "caminho fora do workspace (path traversal bloqueado)" });
            } else {
              enviar(res, 500, { erro: `erro ao excluir: ${erro instanceof Error ? erro.message : String(erro)}` });
            }
          }
          return;
        }

        // ── POST /files/rename — renomeia ou move arquivo/pasta ──
        if (rota === "/files/rename" && req.method === "POST") {
          const ws = await resolverWs(url);
          const corpo = (await lerCorpo(req)) as { antigo?: string; novo?: string };
          const antigoParam = String(corpo.antigo ?? "").trim();
          const novoParam = String(corpo.novo ?? "").trim();
          if (!antigoParam || !novoParam) {
            enviar(res, 400, { erro: "caminho antigo e novo são obrigatórios" });
            return;
          }
          try {
            const alvoAntigo = await resolverCaminhoWorkspace(ws.path, antigoParam);
            const alvoNovo = await resolverCaminhoWorkspace(ws.path, novoParam);
            await mkdir(dirname(alvoNovo), { recursive: true });
            await rename(alvoAntigo, alvoNovo);
            enviar(res, 200, { ok: true, antigo: antigoParam, novo: novoParam });
          } catch (erro) {
            if (erro instanceof WorkspaceError && erro.exitCode === 3) {
              enviar(res, 403, { erro: "caminho fora do workspace (path traversal bloqueado)" });
            } else {
              enviar(res, 500, { erro: `erro ao renomear: ${erro instanceof Error ? erro.message : String(erro)}` });
            }
          }
          return;
        }
        const mMeetingStop = /^\/meetings\/([^/]+)\/stop$/.exec(rota);
        if (mMeetingStop && req.method === "POST") {
          const ws = await resolverWs(url);
          const meetingId = decodeURIComponent(mMeetingStop[1]!);
          // sala viva NESTE processo e ainda em andamento: flag de interrupção por sala — o loop quebra entre turnos
          if (meetings.salaVivaEmAndamento(meetingId)) {
            meetings.solicitarInterrupcao(meetingId);
            enviar(res, 200, { ok: true, detalhe: `interrupção solicitada para reunião ${meetingId}` });
            return;
          }
          const reunioes = await meetings.listar(ws.path);
          const alvo = reunioes.find((r) => r.id === meetingId);
          if (!alvo) {
            enviar(res, 404, { erro: `reunião "${meetingId}" não encontrada` });
            return;
          }
          if (alvo.status !== "em-andamento") {
            enviar(res, 409, { erro: "nenhuma reunião ativa neste servidor" });
            return;
          }
          // sala de OUTRO processo (CLI/scheduler): marca no disco — o loop dono
          // confere o status entre turnos e encerra com ata
          await meetings.encerrar(ws.path, meetingId, "encerrada pelo humano (meeting end)");
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
          const valido = taskCreateSchema.safeParse(corpo);
          if (!valido.success) {
            enviar(res, 422, { erro: "task inválida", detalhes: valido.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
            return;
          }
          const c = valido.data;

          const agendaInfo = parseAgendaTask({
            quando: typeof corpo.quando === "string" ? corpo.quando : typeof corpo.at === "string" ? corpo.at : undefined,
            cron: typeof corpo.cron === "string" ? corpo.cron : typeof corpo.agendar === "string" ? corpo.agendar : undefined,
            repete: typeof corpo.repete === "string" ? corpo.repete : typeof corpo.repetir === "string" ? corpo.repetir : undefined,
            intervaloMin: typeof corpo.intervalo_min === "number" ? corpo.intervalo_min : undefined,
          });

          const labelsIniciais = [...(c.labels ?? [])];
          if (agendaInfo) {
            if (agendaInfo.agenda.tipo === "cron" || agendaInfo.agenda.tipo === "intervalo_min") {
              if (!labelsIniciais.includes("recorrente")) labelsIniciais.push("recorrente");
            } else {
              if (!labelsIniciais.includes("agendada")) labelsIniciais.push("agendada");
            }
          }

          const executarAgora = Boolean(corpo.executar_agora || corpo.imediato || corpo.run);

          const t = await tasks.criar(ws.path, {
            titulo: c.titulo,
            descricao: c.descricao,
            coluna: c.coluna || (executarAgora ? "fazendo" : undefined),
            prioridade: c.prioridade,
            labels: labelsIniciais.length > 0 ? labelsIniciais : undefined,
            responsavel: c.responsavel,
            due: c.due || (agendaInfo?.agenda.tipo === "data_unica" ? agendaInfo.agenda.valor : undefined),
            task_pai: c.task_pai,
            bloqueado_por: c.bloqueado_por,
          }, "api");

          let jobInfo: any = undefined;
          if (agendaInfo) {
            try {
              const jobNome = `task-${t.id}`;
              const job = await scheduler.criar({
                nome: jobNome,
                agenda: agendaInfo.agenda,
                args: ["task", "run", t.id],
                workspace: ws.id,
              });
              jobInfo = { id: job.id, proxima_exec: job.proxima_exec, descricao: agendaInfo.descricao };
              await tasks.mensagem(ws.path, t.id, {
                autor: "sistema",
                corpo: `📅 Agendamento configurado: ${agendaInfo.descricao} (Job: ${job.id}, Próxima: ${job.proxima_exec ? job.proxima_exec.slice(0, 16).replace("T", " ") : "-"})`,
                tipo: "sistema",
              });
            } catch (err) {
              console.error("[task schedule] erro ao criar job:", err);
            }
          }

          if (executarAgora) {
            void (async () => {
              try {
                const sessoes = new SessionManager({ homeDir: opcoes.homeDir ?? opencorpHome() });
                const agente = c.responsavel ? c.responsavel.replace(/^agente:/, "").trim() : "executor-padrao";
                await sessoes.rodar({
                  agente,
                  ordem: `Você é o agente "${agente}" executando a task ${t.id} no workspace "${ws.id}".\nTítulo: ${t.titulo}\n${t.descricao ? `Descrição:\n${t.descricao}` : ""}\nExecute todas as ações necessárias para resolver esta tarefa.`,
                  workspaceDir: ws.path,
                  gatilho: { tipo: "manual", origem: `task:${t.id}` },
                });
              } catch (err) {
                console.error("[task run imediato] falhou:", err);
              }
            })();
          }

          enviar(res, 201, { ...t, agendamento: jobInfo, executando_agora: executarAgora });
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
          const argsJob = normalizarArgsAgenda(corpo.args);
          // whitelist de comandos reais — job inválido é barrado na criação, não descoberto em produção
          if (argsJob.length === 0 || !COMANDOS_AGENDA.has(argsJob[0]!)) {
            enviar(res, 422, { erro: `args[0] inválido: "${String(argsJob[0] ?? "")}" não é um comando opencorp` });
            return;
          }
          const agenda: Agenda = parseAgendaCorpo(corpo);
          const j = await scheduler.criar({
            nome: String(corpo.nome ?? ""),
            agenda,
            args: argsJob,
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
        const mSchedRuns = /^\/schedules\/([^/]+)\/runs$/.exec(rota);
        if (mSchedRuns && req.method === "GET") {
          const id = decodeURIComponent(mSchedRuns[1]!);
          const limite = Math.min(Number(url.searchParams.get("limite")) || 20, 100);
          enviar(res, 200, await scheduler.listarRuns(id, limite));
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
            } else if (corpo.agenda_tipo !== undefined || corpo.agenda_valor !== undefined) {
              // edição de agenda exige o PAR (tipo, valor) — evita converter cron em intervalo sem querer (auditoria #4);
              // nome/args/graca_min podem vir no mesmo PATCH
              if (corpo.agenda_tipo === undefined || corpo.agenda_valor === undefined) {
                enviar(res, 422, { erro: "informe agenda_tipo E agenda_valor juntos para editar a agenda" });
                return;
              }
              const argsJob = corpo.args !== undefined ? normalizarArgsAgenda(corpo.args) : undefined;
              if (argsJob && (argsJob.length === 0 || !COMANDOS_AGENDA.has(argsJob[0]!))) {
                enviar(res, 422, { erro: `args[0] inválido: "${String(argsJob[0] ?? "")}" não é um comando opencorp` });
                return;
              }
              enviar(res, 200, await scheduler.atualizar(id, {
                nome: corpo.nome !== undefined ? String(corpo.nome) : undefined,
                agenda: parseAgendaCorpo(corpo),
                args: argsJob,
                graca_min: typeof corpo.graca_min === "number" ? corpo.graca_min : undefined,
              }));
            } else if (corpo.nome !== undefined || corpo.args !== undefined || corpo.graca_min !== undefined) {
              // edição plena (PLANO-WEB-CRUD B1) — mesma whitelist da criação
              const argsJob = corpo.args !== undefined ? normalizarArgsAgenda(corpo.args) : undefined;
              if (argsJob && (argsJob.length === 0 || !COMANDOS_AGENDA.has(argsJob[0]!))) {
                enviar(res, 422, { erro: `args[0] inválido: "${String(argsJob[0] ?? "")}" não é um comando opencorp` });
                return;
              }
              enviar(res, 200, await scheduler.atualizar(id, {
                nome: corpo.nome !== undefined ? String(corpo.nome) : undefined,
                agenda: parseAgendaCorpo(corpo),
                args: argsJob,
                graca_min: typeof corpo.graca_min === "number" ? corpo.graca_min : undefined,
              }));
            } else {
              enviar(res, 400, { erro: "corpo vazio — use {ativo}, {nome}, {agenda_tipo/agenda_valor}, {args} ou {graca_min}" });
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
          if (!acao && req.method === "PUT") {
            // edição plena do spec (PLANO-WEB-CRUD B3) — zod + validarPadrao no TeamStore.salvar
            const corpo = (await lerCorpo(req)) as Record<string, unknown>;
            if (corpo.id && corpo.id !== teamId) {
              enviar(res, 422, { erro: `id do corpo ("${String(corpo.id)}") não bate com a rota ("${teamId}")` });
              return;
            }
            const atual = teams.obter(ws.path, teamId); // 404 se não existe
            const spec = { ...corpo, id: teamId, criado_em: String(corpo.criado_em ?? atual.criado_em) };
            await teams.salvar(ws.path, spec as Parameters<typeof teams.salvar>[1]);
            eventBus.emit("team.salvo", { team: teamId });
            enviar(res, 200, spec);
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
          // token NÃO sai na lista — só em GET /hooks/:id (copiar cURL sob demanda)
          enviar(res, 200, hooks.listar(ws.path).map((h) => ({ ...h, token: undefined })));
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
            token: typeof corpo.token === "string" ? corpo.token : undefined,
            auth: corpo.auth as any,
            exige_aprovacao: Boolean(corpo.exige_aprovacao),
            reenvio_urls: Array.isArray(corpo.reenvio_urls) ? corpo.reenvio_urls : undefined,
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
        // ── rota PÚBLICA de disparo (auth por token / HMAC / aberta) ──
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

          let corpoPayload: Record<string, unknown> = {};
          let rawBody = "";
          if (req.method === "POST") {
            try {
              const resCorpo = await lerCorpoComTexto(req);
              corpoPayload = resCorpo.json;
              rawBody = resCorpo.raw;
            } catch {
              corpoPayload = {};
              rawBody = "";
            }
          }

          // Validação de Segurança (Token / HMAC-SHA256 / Aberta)
          const tipoAuth = h.auth?.tipo ?? "token";
          const secretEsperado = h.auth?.secret || h.token;

          if (tipoAuth === "token") {
            const authHeader = String(req.headers["authorization"] ?? "");
            const bearerToken = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
            const tokenRecebido = req.headers["x-opencorp-token"] ?? bearerToken ?? url.searchParams.get("token") ?? "";
            if (tokenRecebido !== secretEsperado) {
              enviar(res, 401, { erro: "token do hook ausente ou inválido (envie via x-opencorp-token, Authorization: Bearer, ou ?token=)" });
              return;
            }
          } else if (tipoAuth === "hmac_sha256") {
            const sigHeader = String(req.headers["x-hub-signature-256"] ?? req.headers["x-signature-sha256"] ?? "");
            const sigRecebida = sigHeader.startsWith("sha256=") ? sigHeader.slice(7).trim() : sigHeader.trim();
            if (!sigRecebida) {
              enviar(res, 401, { erro: "assinatura HMAC ausente (envie cabeçalho x-hub-signature-256: sha256=...)" });
              return;
            }
            const { createHmac, timingSafeEqual } = await import("node:crypto");
            const hmac = createHmac("sha256", secretEsperado);
            hmac.update(rawBody);
            const sigEsperada = hmac.digest("hex");
            try {
              const bufEsperado = Buffer.from(sigEsperada, "hex");
              const bufRecebido = Buffer.from(sigRecebida, "hex");
              if (bufEsperado.length !== bufRecebido.length || !timingSafeEqual(bufEsperado, bufRecebido)) {
                enviar(res, 401, { erro: "assinatura HMAC inválida para o secret configurado" });
                return;
              }
            } catch {
              enviar(res, 401, { erro: "formato de assinatura HMAC inválido" });
              return;
            }
          } else if (tipoAuth === "nenhuma") {
            // Acesso público livre
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
            void hooks
              .disparar(ws.path, h, payload)
              .catch((e: unknown) => console.error(`[hook] disparo de "${h.id}" falhou:`, e instanceof Error ? e.message : e));
            enviar(res, 202, {
              ok: true,
              modo: "imediato",
              status: h.exige_aprovacao ? "aguardando_aprovacao" : "iniciado",
              mensagem: h.exige_aprovacao ? "Webhook recebido e retido para aprovação humana" : "Disparo iniciado",
            });
          }
          return;
        }

        // ── notificações (Etapa 7 / P-24) ───────────────────────────
        if (rota === "/notifications" && req.method === "GET") {
          const ws = await resolverWs(url);
          const apenasNaoLidas = url.searchParams.get("nao_lidas") === "1";
          const lista = notificacoes.listar(ws.path, { apenasNaoLidas });
          enviar(res, 200, {
            notificacoes: lista,
            resumo: { nao_lidas: notificacoes.naoLidas(ws.path), total: lista.length },
          });
          return;
        }
        if (rota === "/notifications" && req.method === "POST") {
          const ws = await resolverWs(url);
          const corpo = (await lerCorpo(req)) as Record<string, unknown>;
          const n = await notificacoes.adicionar(ws.path, {
            titulo: String(corpo.titulo ?? ""),
            corpo: String(corpo.corpo ?? ""),
            tipo: corpo.tipo as TipoNotificacao | undefined,
            origem: corpo.origem !== undefined ? String(corpo.origem) : "painel",
          });
          enviar(res, 201, n);
          return;
        }
        if (rota === "/notifications/lidas" && req.method === "POST") {
          const ws = await resolverWs(url);
          const marcadas = await notificacoes.marcarTodasLidas(ws.path);
          enviar(res, 200, { ok: true, marcadas });
          return;
        }
        const mNotifLida = /^\/notifications\/([^/]+)\/lida$/.exec(rota);
        if (mNotifLida && req.method === "POST") {
          const ws = await resolverWs(url);
          const n = await notificacoes.marcarLida(ws.path, decodeURIComponent(mNotifLida[1]!));
          enviar(res, 200, n);
          return;
        }
        if (rota === "/notifications" && req.method === "DELETE") {
          const ws = await resolverWs(url);
          await notificacoes.limpar(ws.path);
          enviar(res, 200, { ok: true });
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

        // Helper: obtém porta do opencode server ou inicia automaticamente se estiver parado
        async function portaOpencodeOuErro(): Promise<number> {
          let status = await opencodeServer.status();
          if (!status.rodando || !status.porta) {
            try {
              const res = await opencodeServer.iniciar();
              if (res.porta) return res.porta;
              status = await opencodeServer.status();
            } catch (err) {
              console.error("[secretario] falha ao auto-iniciar opencode server:", err);
            }
          }
          if (!status.rodando || !status.porta) {
            throw new SecretarioError("secretário não iniciado — POST /secretario/start", { status: 409 });
          }
          return status.porta;
        }

        // Helper: espelha TODAS as mensagens de uma sessão no corp.db (ids reais do opencode —
        // idempotente; garante espelho completo independente de quem/cliente iniciou a conversa)
        async function sincronizarSessaoNoCorp(porta: number, sessaoId: string): Promise<void> {
          try {
            const res = await fetch(`http://127.0.0.1:${porta}/session/${sessaoId}/message`, { signal: AbortSignal.timeout(5000) });
            if (!res.ok) return;
            const msgs = (await res.json()) as Array<{
              info?: { id?: string; role?: string; agent?: string; time?: { created?: number; completed?: number } };
              parts?: Array<{ type: string; text?: string }>;
            }>;
            if (!Array.isArray(msgs) || msgs.length === 0) return;
            const ws = await resolverWs(new URL(req.url ?? "/", "http://local"));
            const db = registros.corpDb(ws.path);
            const agente = msgs.find((m) => m.info?.agent)?.info?.agent ?? "secretario";
            const iso = (ms?: number): string | undefined => (ms ? new Date(ms).toISOString() : undefined);
            const primeira = iso(msgs[0]?.info?.time?.created);
            const ultima = [...msgs].reverse().find((m) => m.info?.time?.completed)?.info?.time?.completed;
            db.upsertSessao({
              id: sessaoId, agente, modelo: "",
              inicio: primeira ?? new Date().toISOString(),
              fim: iso(ultima) ?? new Date().toISOString(),
              custo_usd: null, status: "concluida",
            });
            for (const m of msgs) {
              const role = m.info?.role;
              const id = m.info?.id;
              if (!id || (role !== "user" && role !== "assistant")) continue;
              const texto = (m.parts ?? []).filter((p) => p.type === "text").map((p) => p.text ?? "").join("\n").trim();
              if (!texto) continue;
              db.inserirMensagem({ id, sessao_id: sessaoId, agente, role, conteudo: texto, criado_em: iso(m.info?.time?.created) ?? null });
            }
          } catch {
            /* espelho é best-effort — nunca afeta o chat */
          }
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
            // enriquece com títulos REAIS (1ª msg do usuário) do espelho corp.db —
            // sessões de agente/CLI chegam como "New session - <timestamp>", o que é inútil na lista
            try {
              const itens = (data as Array<Record<string, unknown>>) ?? [];
              const ids = itens.map((s) => String(s.id ?? "")).filter(Boolean);
              if (ids.length) {
                // espelho vive no corp.db do workspace — tenta o ativo; sem ativo, usa o 1º existente
                let ws: { id: string; path: string };
                try {
                  ws = await resolverWs(url);
                } catch {
                  const todos = await workspaces.listar();
                  const primeiro = todos.find((w) => w.existe);
                  if (!primeiro) throw new Error("nenhum workspace para enriquecer");
                  ws = { id: primeiro.id, path: primeiro.path };
                }
                const db = registros.corpDb(ws.path);
                const primeiras = db.primeirasMensagensUsuario(ids);
                const primeiraPorSessao = new Map<string, string>();
                for (const p of primeiras) {
                  if (!primeiraPorSessao.has(p.sessao_id)) primeiraPorSessao.set(p.sessao_id, p.conteudo);
                }
                for (const s of itens) {
                  const id = String(s.id ?? "");
                  const tituloAtual = String(s.title ?? "").trim();
                  const real = primeiraPorSessao.get(id);
                  if (real) {
                    (s as Record<string, unknown>).titulo_real = real.length > 70 ? real.slice(0, 69) + "…" : real;
                    (s as Record<string, unknown>).sem_conteudo = false;
                  } else if (!tituloAtual || tituloAtual.startsWith("New session")) {
                    (s as Record<string, unknown>).sem_conteudo = true;
                  }
                }
              }
            } catch (erro) {
              console.error("[enriquecimento] falhou:", erro instanceof Error ? erro.message : erro);
            }
            // espelho completo: sincroniza as 5 sessões mais recentes em background
            try {
              const lista = (data as Array<{ id?: string; updated?: number; time?: { updated?: number } }>) ?? [];
              const recentes = [...lista]
                .sort((a, b) => (b.updated ?? b.time?.updated ?? 0) - (a.updated ?? a.time?.updated ?? 0))
                .slice(0, 5)
                .map((s) => s.id)
                .filter((id): id is string => !!id);
              for (const id of recentes) void sincronizarSessaoNoCorp(porta, id);
            } catch {
              /* espelho best-effort */
            }
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

        // ── /secretario/sessoes/:id/mensagens (GET /session/:id/message → [{role,content}]) ──
        const mMensagens = /^\/secretario\/sessoes\/([^/]+)\/mensagens$/.exec(rota);
        if (mMensagens && req.method === "GET") {
          try {
            const porta = await portaOpencodeOuErro();
            const sessionId = decodeURIComponent(mMensagens[1]!);
            // opencode ≥1.18: mensagens em GET /session/:id/message ([{info:{role,time},parts}])
            const opencodeUrl = `http://127.0.0.1:${porta}/session/${sessionId}/message`;
            const resOpencode = await fetch(opencodeUrl, { signal: AbortSignal.timeout(5000) });
            if (!resOpencode.ok) {
              enviar(res, resOpencode.status === 404 ? 404 : 502, { erro: resOpencode.status === 404 ? "sessão não encontrada" : `opencode respondeu ${resOpencode.status}` });
              return;
            }
            const rawMsgs = ((await resOpencode.json()) as MensagemOc[]) ?? [];
            const mensagens: Array<{
              role: string;
              content: string;
              passos?: Array<{ tipo: "pensamento" | "acao" | "texto"; texto?: string; ferramenta?: string; resumo?: string; sucesso?: boolean }>;
              pensamento?: string;
              criado_em?: string;
              concluida: boolean;
              acoes?: Array<{ ferramenta?: string; resumo?: string; sucesso?: boolean }>;
              imagens?: string[];
            }> = [];

            for (const m of rawMsgs) {
              const role = m.info?.role;
              if (role === "user") {
                const parts = m.parts ?? [];
                const content = parts.filter((p: ParteOc) => p.type === "text").map((p: ParteOc) => p.text ?? "").join("\n").trim();
                const imagens = parts.filter((p: any) => p.type === "file" && typeof p.url === "string" && p.url.startsWith("data:image/")).map((p: any) => p.url);
                mensagens.push({
                  role: "user",
                  content,
                  criado_em: m.info?.time?.created ? new Date(m.info.time.created).toISOString() : undefined,
                  concluida: true,
                  imagens: imagens.length > 0 ? imagens : undefined,
                });
              } else if (role === "assistant") {
                const parts = m.parts ?? [];
                const pensamento = parts.filter((p: ParteOc) => p.type === "reasoning" || p.type === "thinking").map((p: ParteOc) => p.text ?? "").join("\n").trim();
                const content = parts.filter((p: ParteOc) => p.type === "text").map((p: ParteOc) => p.text ?? "").join("\n").trim();
                const tools = parts.filter((p: ParteOc) => p.type === "tool" && p.tool).map((p: ParteOc) => ({
                  ferramenta: p.tool,
                  resumo: resumoDeInput(p.state?.input, p.state?.title),
                  sucesso: p.state?.status !== "error",
                }));

                // Sequência cronológica exata de passos (pensamento -> bash/ação -> texto -> pensamento...)
                const passos: Array<{ tipo: "pensamento" | "acao" | "texto"; texto?: string; ferramenta?: string; resumo?: string; sucesso?: boolean }> = [];
                for (const p of parts) {
                  if (p.type === "reasoning" || p.type === "thinking") {
                    const txt = (p.text ?? "").trim();
                    if (txt) {
                      const ultP = passos[passos.length - 1];
                      if (ultP && ultP.tipo === "pensamento") {
                        ultP.texto = `${ultP.texto}\n\n${txt}`;
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
                    const txt = (p.text ?? "").trim();
                    if (txt) {
                      const ultP = passos[passos.length - 1];
                      if (ultP && ultP.tipo === "texto") {
                        ultP.texto = `${ultP.texto}\n\n${txt}`;
                      } else {
                        passos.push({ tipo: "texto", texto: txt });
                      }
                    }
                  }
                }

                const agora = Date.now();
                const criadoEmMs = m.info?.time?.created ?? 0;
                // Se não tiver time.completed mas foi criada há mais de 90s, considera concluída/expirada
                const expirou = !m.info?.time?.completed && criadoEmMs > 0 && agora - criadoEmMs > 90_000;
                const isCompleted = (!!m.info?.time?.completed || expirou) && (m.info as any)?.finish !== "tool-calls";
                const textoFinal = content || (expirou ? "(geração anterior interrompida ou expirada)" : "");

                // Se a mensagem anterior já é do assistente (mesmo turno com múltiplos passos), consolida nela
                const ult = mensagens[mensagens.length - 1];
                if (ult && ult.role === "assistant") {
                  if (passos.length > 0) {
                    ult.passos = [...(ult.passos ?? []), ...passos];
                  }
                  if (pensamento) {
                    ult.pensamento = ult.pensamento ? `${ult.pensamento}\n\n---\n\n${pensamento}` : pensamento;
                  }
                  if (textoFinal) {
                    ult.content = ult.content ? `${ult.content}\n\n${textoFinal}` : textoFinal;
                  }
                  if (tools.length > 0) {
                    ult.acoes = [...(ult.acoes ?? []), ...tools];
                  }
                  ult.concluida = isCompleted;
                } else {
                  mensagens.push({
                    role: "assistant",
                    content: textoFinal,
                    passos: passos.length > 0 ? passos : undefined,
                    pensamento: pensamento || undefined,
                    criado_em: m.info?.time?.created ? new Date(m.info.time.created).toISOString() : undefined,
                    concluida: isCompleted,
                    acoes: tools.length > 0 ? tools : undefined,
                  });
                }
              }
            }
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

        // ── POST /secretario/sessoes/:id/truncar — edita prompt (trunca histórico para reenvio)
        const mTruncar = /^\/secretario\/sessoes\/([^/]+)\/truncar$/.exec(rota);
        if (mTruncar && req.method === "POST") {
          try {
            const porta = await portaOpencodeOuErro();
            const sessionId = decodeURIComponent(mTruncar[1]!);
            const corpo = (await lerCorpo(req)) as { manter_ate?: unknown };
            const manter = typeof corpo.manter_ate === "number" ? Math.floor(Number(corpo.manter_ate)) : -1;
            if (!Number.isInteger(manter) || manter < 0) {
              enviar(res, 400, { erro: "manter_ate deve ser número inteiro >=0" });
              return;
            }
            const opencodeUrl = `http://127.0.0.1:${porta}/session/${sessionId}/message`;
            const resOp = await fetch(opencodeUrl, { signal: AbortSignal.timeout(5000) });
            if (!resOp.ok) {
              enviar(res, resOp.status === 404 ? 404 : 502, { erro: resOp.status === 404 ? "sessão não encontrada" : `opencode respondeu ${resOp.status}` });
              return;
            }
            const raw = (await resOp.json()) as Array<{
              info?: { id?: string; role?: string; time?: { completed?: number } };
              parts?: Array<{ type: string; text?: string; url?: string }>;
            }>;
            const filtrados = (Array.isArray(raw) ? raw : [])
              .map((m) => {
                const pensamento = (m.parts ?? []).filter((p) => p.type === "reasoning" || p.type === "thinking").map((p) => p.text ?? "").join("\n").trim();
                return {
                  id: m.info?.id,
                  role: m.info?.role ?? "",
                  content: (m.parts ?? []).filter((p) => p.type === "text").map((p) => p.text ?? "").join("\n").trim(),
                  pensamento: pensamento || undefined,
                  imagens: (m.parts ?? []).filter((p) => p.type === "file" && typeof p.url === "string" && p.url.startsWith("data:image/")).map((p) => p.url as string),
                  concluida: m.info?.role === "assistant" ? !!m.info?.time?.completed : true,
                };
              })
              .filter((m) => (m.role === "user" || m.role === "assistant") && (m.content.length > 0 || (m as unknown as { pensamento?: string }).pensamento || (m.imagens && m.imagens.length > 0) || (m.role === "assistant" && m.concluida === false)));
            if (manter > filtrados.length) {
              enviar(res, 400, { erro: `manter_ate ${manter} fora do range (total ${filtrados.length})` });
              return;
            }
            if (manter === filtrados.length) {
              enviar(res, 200, { ok: true, removidos: 0 });
              return;
            }
            const paraRemover = filtrados.slice(manter);
            const idsParaRemover = paraRemover.map((m) => m.id).filter(Boolean) as string[];
            if (!idsParaRemover.length) {
              enviar(res, 200, { ok: true, removidos: 0 });
              return;
            }
            const homeDir = opcoes.homeDir ?? opencorpHome();
            const dataHome = dirOpencodeData(homeDir);
            const dbPath = join(dataHome, "opencode", "opencode.db");
            let removidos = 0;
            let dbErro: Error | null = null;
            try {
              const mod = await import("better-sqlite3");
              const BetterSqlite3 = (mod as unknown as { default: unknown }).default ?? mod;
              // @ts-ignore — construtor dinâmico
              const db: { prepare: (sql: string) => { run: (id: string) => { changes: number } }; close: () => void; transaction: (fn: (ids: string[]) => void) => (ids: string[]) => void } = new (BetterSqlite3 as unknown as new (path: string) => unknown)(dbPath) as unknown as never;
              const delPart = db.prepare("DELETE FROM part WHERE message_id = ?");
              const delMsg = db.prepare("DELETE FROM message WHERE id = ?");
              const tx = db.transaction((ids: string[]) => {
                for (const id of ids) {
                  delPart.run(id);
                  const inf = delMsg.run(id);
                  if (inf.changes) removidos++;
                }
              });
              tx(idsParaRemover);
              db.close();
            } catch (e) {
              dbErro = e as Error;
            }
            // fallback para fake-opencode (memória) quando DB não tem os dados ou falhou
            if (removidos === 0 && idsParaRemover.length > 0) {
              try {
                const truncRes = await fetch(`http://127.0.0.1:${porta}/session/${sessionId}/truncate`, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ manter_ate: manter }),
                  signal: AbortSignal.timeout(3000),
                });
                if (truncRes.ok) {
                  const j = (await truncRes.json().catch(() => ({}))) as { removidos?: number };
                  removidos = typeof j.removidos === "number" ? j.removidos : idsParaRemover.length;
                  dbErro = null;
                }
              } catch {}
            }
            if (dbErro && removidos === 0) {
              enviar(res, 500, { erro: `falha ao truncar no DB: ${dbErro.message}` });
              return;
            }
            void sincronizarSessaoNoCorp(porta, sessionId);
            eventBus.emit("secretario.mensagem", { sessao_id: sessionId, fase: "truncar" });
            enviar(res, 200, { ok: true, removidos });
          } catch (erro) {
            if (erro instanceof SecretarioError) enviar(res, erro.status ?? 409, { erro: erro.message });
            else enviar(res, 502, { erro: `proxy falhou: ${erro instanceof Error ? erro.message : String(erro)}` });
          }
          return;
        }

        // ── GET/PUT /opencode-config — config do opencode do opencorp (home isolado) ──
        // Arquivo: <opencorpHome>/.opencorp/opencode-home/opencode.json — editável pelo
        // painel (Config → Opencode). Alterações valem após reiniciar o secretário.
        if (rota === "/opencode-config" && req.method === "GET") {
          const configPath = join(dirOpencodeHome(opcoes.homeDir ?? opencorpHome()), "opencode.json");
          const bruto = await readFile(configPath, "utf8").catch((erro: NodeJS.ErrnoException) => {
            if (erro?.code === "ENOENT") return null;
            throw erro;
          });
          if (bruto === null) {
            enviar(res, 404, { erro: "config do opencode ainda não existe (inicie o secretário)", path: configPath });
            return;
          }
          try {
            enviar(res, 200, { config: JSON.parse(bruto), path: configPath });
          } catch {
            enviar(res, 500, { erro: "config existente não é JSON válido", path: configPath });
          }
          return;
        }
        if (rota === "/opencode-config" && req.method === "PUT") {
          const configPath = join(dirOpencodeHome(opcoes.homeDir ?? opencorpHome()), "opencode.json");
          let corpo: { config?: unknown };
          try {
            corpo = (await lerCorpo(req, 256 * 1024)) as { config?: unknown };
          } catch {
            enviar(res, 400, { erro: "corpo inválido (JSON malformado ou excede o limite)" });
            return;
          }
          const config = corpo?.config;
          // zod leve: objeto simples (não array/null) — o opencode aceita campos livres
          if (config === null || typeof config !== "object" || Array.isArray(config)) {
            enviar(res, 400, { erro: "campo 'config' deve ser um objeto JSON" });
            return;
          }
          const obj = { ...(config as Record<string, unknown>) };
          if (typeof obj.$schema !== "string" || !obj.$schema) {
            // preserva o $schema do arquivo em disco; sem arquivo, usa o padrão do opencode
            const schemaAtual = await readFile(configPath, "utf8")
              .then((t) => (JSON.parse(t) as { $schema?: unknown }).$schema)
              .catch(() => undefined);
            obj.$schema = typeof schemaAtual === "string" && schemaAtual ? schemaAtual : "https://opencode.ai/config.json";
          }
          const texto = `${JSON.stringify(obj, null, 2)}\n`;
          if (Buffer.byteLength(texto, "utf8") > 64 * 1024) {
            enviar(res, 400, { erro: "config excede o limite de 64KB" });
            return;
          }
          try {
            await writeFileAtomic(configPath, texto, { encoding: "utf8" });
          } catch (erro) {
            enviar(res, 500, { erro: `falha ao gravar config: ${erro instanceof Error ? erro.message : String(erro)}` });
            return;
          }
          enviar(res, 200, { ok: true, path: configPath });
          return;
        }

        // ── /provider-keys — chaves de API dos provedores, por escopo (global × workspace) ──
        // Auth NUNCA volta inteira (preview mascarado). Herança: workspace ⊕ global
        // (workspace vence por provedor). Fonte é o opencorp — nunca o opencode pessoal.
        // motor de agentes: hoje apenas "opencode" (futuros motores terão chaves próprias)
        const motorChaves = url.searchParams.get("motor") ?? "opencode";
        if (motorChaves !== "opencode") {
          enviar(res, 400, { erro: `motor desconhecido: "${motorChaves}" — hoje apenas "opencode"` });
          return;
        }
        const escopoChaves = (): { home: string; ws: string | null } => ({
          home: opcoes.homeDir ?? opencorpHome(),
          ws: url.searchParams.get("workspace"),
        });
        const lerAuth = (path: string): { auth: Record<string, EntradaAuth>; existe: boolean } => {
          try {
            const auth = JSON.parse(readFileSync(path, "utf8")) as Record<string, EntradaAuth>;
            return { auth, existe: Object.keys(auth).length > 0 };
          } catch { return { auth: {}, existe: false }; }
        };
        const chavesDe = (auth: Record<string, EntradaAuth>): Array<{ provider: string; tipo: string; preview: string }> =>
          Object.entries(auth)
            .filter(([, v]) => v && typeof v === "object")
            .map(([provider, v]) => ({
              provider,
              tipo: v.type ?? "api",
              preview: typeof v.key === "string" && v.key ? mascararChave(v.key) : "—",
            }));
        if (rota === "/provider-keys" && req.method === "GET") {
          const { home, ws } = escopoChaves();
          const gPath = authOpencodePath(home);
          const g = lerAuth(gPath);
          const gChaves = chavesDe(g.auth);
          let workspace: { id: string | null; existe: boolean; chaves: ReturnType<typeof chavesDe>; herdadas: ReturnType<typeof chavesDe> } = { id: null, existe: false, chaves: [], herdadas: [] };
          if (ws) {
            const wPath = authOverridesPathWorkspace(home, ws);
            const w = lerAuth(wPath);
            const wChaves = chavesDe(w.auth);
            const herdadas = gChaves.filter((gk) => !wChaves.some((wk) => wk.provider === gk.provider));
            workspace = { id: ws, existe: w.existe, chaves: wChaves, herdadas };
          }
          enviar(res, 200, { global: { existe: g.existe, chaves: gChaves, path: gPath }, workspace });
          return;
        }
        if (rota === "/provider-keys" && req.method === "PUT") {
          const corpo = (await lerCorpo(req)) as { provider?: string; key?: string; escopo?: string };
          const provider = String(corpo.provider ?? "").trim();
          const key = String(corpo.key ?? "").trim();
          const { home, ws } = escopoChaves();
          const escopo = corpo.escopo === "workspace" ? "workspace" : "global";
          if (escopo === "workspace" && !ws) {
            enviar(res, 400, { erro: "escopo workspace exige um workspace ativo" });
            return;
          }
          if (!PROVEEDOR_RE.test(provider) || !provider) {
            enviar(res, 400, { erro: "provider inválido — use letras/números/hífen (ex.: opencode-go, openrouter)" });
            return;
          }
          if (key.length < 8) {
            enviar(res, 400, { erro: "chave muito curta" });
            return;
          }
          const authPath = escopo === "workspace"
            ? authOverridesPathWorkspace(home, ws!)
            : authOpencodePath(home);
          const { auth } = lerAuth(authPath);
          try {
            await writeFileAtomic(authPath, `${JSON.stringify(fundirAuth(auth, provider, key), null, 2)}\n`, { encoding: "utf8" });
          } catch (erro) {
            enviar(res, 500, { erro: `falha ao gravar auth.json: ${erro instanceof Error ? erro.message : String(erro)}` });
            return;
          }
          enviar(res, 200, { ok: true, provider, escopo, preview: mascararChave(key) });
          return;
        }
        const mChaveDel = /^\/provider-keys\/([^/]+)$/.exec(rota);
        if (mChaveDel && req.method === "DELETE") {
          const provider = decodeURIComponent(mChaveDel[1]!).trim();
          const { home, ws } = escopoChaves();
          const escopo = url.searchParams.get("escopo") === "workspace" ? "workspace" : "global";
          if (escopo === "workspace" && !ws) {
            enviar(res, 400, { erro: "escopo workspace exige um workspace ativo" });
            return;
          }
          const authPath = escopo === "workspace"
            ? authOverridesPathWorkspace(home, ws!)
            : authOpencodePath(home);
          const { auth } = lerAuth(authPath);
          if (!(provider in auth)) {
            enviar(res, 404, { erro: `provedor "${provider}" não configurado neste escopo` });
            return;
          }
          const { [provider]: _removida, ...resto } = auth;
          try {
            if (Object.keys(resto).length === 0) rmSync(authPath, { force: true });
            else await writeFileAtomic(authPath, `${JSON.stringify(resto, null, 2)}\n`, { encoding: "utf8" });
          } catch (erro) {
            enviar(res, 500, { erro: `falha ao gravar auth.json: ${erro instanceof Error ? erro.message : String(erro)}` });
            return;
          }
          enviar(res, 200, { ok: true, provider, escopo });
          return;
        }

        // ── /secretario/conversa (proxy POST /session + POST /session/:id/message + poll) ──
        if (rota === "/secretario/conversa" && req.method === "POST") {
          try {
            const porta = await portaOpencodeOuErro();
            const corpo = (await lerCorpo(req)) as { mensagem: string; sessao_id?: string; agente?: string; imagens?: Array<{ nome?: string; mime?: string; url?: string }>; contexto?: string[] };
            const mensagemBruta = corpo.mensagem?.trim();
            const imagens = (corpo.imagens ?? []).filter((i) => i && typeof i.url === "string" && i.url.startsWith("data:image/")).slice(0, 4);
            if (!mensagemBruta && imagens.length === 0) {
              enviar(res, 400, { erro: "mensagem obrigatória" });
              return;
            }
            // Contexto @ do composer (Etapa 2): menciona os alvos; conteúdo dos arquivos na Etapa 3.
            const contexto = (Array.isArray(corpo.contexto) ? corpo.contexto : []).map((c) => String(c).replace(/^@/, "").slice(0, 120)).filter(Boolean).slice(0, 8);
            const mensagem = contexto.length ? `${mensagemBruta}\n\n(Contexto referenciado pelo usuário: ${contexto.map((c) => "@" + c).join(" ")})` : mensagemBruta;
            let sessaoId = corpo.sessao_id;
            const baseUrl = `http://127.0.0.1:${porta}`;

            // 1. Se há sessao_id, verifica se ela existe; senão cria nova sessão
            let sessaoExiste = false;
            if (sessaoId) {
              try {
                const checkRes = await fetch(`${baseUrl}/session/${encodeURIComponent(sessaoId)}`, {
                  signal: AbortSignal.timeout(3000),
                });
                if (checkRes.ok) sessaoExiste = true;
              } catch {}
            }

            if (!sessaoId || !sessaoExiste) {
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
                parts: [
                  { type: "text", text: mensagem },
                  ...imagens.map((i) => ({ type: "file", mime: i.mime ?? "image/png", url: i.url! })),
                ],
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
                const getRes = await fetch(`${baseUrl}/session/${sessaoId}/message`, { signal: AbortSignal.timeout(5000) });
                if (!getRes.ok) continue;
                const msgs = (await getRes.json()) as Array<{
                  info?: { role?: string; time?: { completed?: number } };
                  parts?: Array<{ type: string; text?: string }>;
                }>;
                for (let i = (msgs ?? []).length - 1; i >= 0; i--) {
                  const msg = msgs[i]!;
                  if (msg.info?.role === "assistant" && msg.info?.time?.completed) {
                    const textos = (msg.parts ?? []).filter((p) => p.type === "text").map((p) => p.text ?? "").join("\n");
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

            void sincronizarSessaoNoCorp(porta, sessaoId);
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

        // ── /secretario/conversa/stream (SSE: inicio → delta* → fim|erro) ──
        // O POST /message do opencode responde só ao concluir; o estado da sessão, porém, é atualizado
        // em tempo real — por isso o POST fica em voo e a resposta é polada (700ms) e diffada ao cliente.
        if (rota === "/secretario/conversa/stream" && req.method === "POST") {
          const sse = (evento: string, data: unknown): void => {
            res.write(`event: ${evento}\ndata: ${JSON.stringify(data)}\n\n`);
          };
          try {
            const porta = await portaOpencodeOuErro();
            const corpo = (await lerCorpo(req)) as { mensagem?: string; prompt?: string; sessao_id?: string; agente?: string; imagens?: Array<{ nome?: string; mime?: string; url?: string }>; contexto?: string[] };
            const mensagemBruta = (corpo.mensagem ?? corpo.prompt ?? "").trim();
            const imagens = (corpo.imagens ?? []).filter((i) => i && typeof i.url === "string" && i.url.startsWith("data:image/")).slice(0, 4);
            if (!mensagemBruta && imagens.length === 0) {
              enviar(res, 400, { erro: "mensagem obrigatória" });
              return;
            }
            // Contexto @ do composer (Etapa 2): menciona os alvos; conteúdo dos arquivos na Etapa 3.
            const contexto = (Array.isArray(corpo.contexto) ? corpo.contexto : []).map((c) => String(c).replace(/^@/, "").slice(0, 120)).filter(Boolean).slice(0, 8);
            const mensagem = contexto.length ? `${mensagemBruta}\n\n(Contexto referenciado pelo usuário: ${contexto.map((c) => "@" + c).join(" ")})` : mensagemBruta;

            res.writeHead(200, {
              "content-type": "text/event-stream; charset=utf-8",
              "cache-control": "no-cache",
              "connection": "keep-alive",
              "access-control-allow-origin": "*",
              "x-accel-buffering": "no",
            });

            const baseUrl = `http://127.0.0.1:${porta}`;
            const agente = corpo.agente ?? "secretario";
            let sessaoId = corpo.sessao_id || url.searchParams.get("sessao") || undefined;

            // Se sessaoId foi informado, verifica se ela realmente existe no opencode
            let sessaoExiste = false;
            if (sessaoId) {
              try {
                const checkRes = await fetch(`${baseUrl}/session/${encodeURIComponent(sessaoId)}`, {
                  signal: AbortSignal.timeout(3000),
                });
                if (checkRes.ok) sessaoExiste = true;
              } catch {}
            }

            if (!sessaoId || !sessaoExiste) {
              const createRes = await fetch(`${baseUrl}/session`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ title: mensagem.slice(0, 60), agent: agente }),
                signal: AbortSignal.timeout(10000),
              });
              if (!createRes.ok) {
                sse("erro", { erro: `falha ao criar sessão: ${createRes.status}` });
                res.end();
                return;
              }
              const sessionData = (await createRes.json()) as { id: string };
              sessaoId = sessionData.id;
            }
            sse("inicio", { sessao_id: sessaoId });
            // espelho no eventBus → todas as abas abertas (SSE /events) sincronizam o chat
            eventBus.emit("secretario.mensagem", { sessao_id: sessaoId, fase: "inicio" });

            // Formato opencode ≥1.18 — tipos estruturais em core/opencode-server.ts
            const baseUrlSessao = `${baseUrl}/session/${sessaoId}`;
            const listarMensagens = async (): Promise<MensagemOc[] | null> => {
              try {
                const getRes = await fetch(`${baseUrlSessao}/message`, { signal: AbortSignal.timeout(5000) });
                if (!getRes.ok) return null;
                const msgs = (await getRes.json()) as MensagemOc[];
                return Array.isArray(msgs) ? msgs : null;
              } catch {
                return null; // opencode lento/instável: pula o ciclo — não derruba o stream
              }
            };
            const textoDe = (m: MensagemOc): string =>
              (m.parts ?? []).filter((p) => p.type === "text").map((p) => p.text ?? "").join("\n");
            const pensamentoDe = (m: MensagemOc): string =>
              (m.parts ?? []).filter((p) => p.type === "reasoning" || p.type === "thinking").map((p) => p.text ?? "").join("\n");

            // baseline: última msg assistant pré-existente (continuação de sessão não deve re-streamar)
            const baseMsgs = (await listarMensagens()) ?? [];
            const baseAssistant = [...baseMsgs].reverse().find((m) => m.info?.role === "assistant");
            const baselineId = baseAssistant?.info?.id ?? null;

            // POST em voo: responde só ao concluir; a geração reflete no GET /session em tempo real.
            // Falha do POST é capturada (não engolida): quando o stream do modelo morre cedo
            // (ex.: limite de uso), a msg assistant fica sem parts e sem completed — e o
            // opencode pode nem responder o POST —, então o poll precisaria girar até o deadline.
            let postData: MensagemOc | null = null;
            let postConcluido = false;
            let postErro: string | null = null;
            void fetch(`${baseUrlSessao}/message`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ sessionID: sessaoId, agent: agente, parts: [{ type: "text", text: mensagem }, ...imagens.map((i) => ({ type: "file", mime: i.mime ?? "image/png", url: i.url! }))] }),
              signal: AbortSignal.timeout(240_000),
            }).then(async (r) => {
              if (!r.ok) {
                postErro = `opencode /message respondeu HTTP ${r.status}`;
              } else {
                try {
                  postData = (await r.json()) as MensagemOc;
                } catch {}
              }
              postConcluido = true;
            }).catch(() => {
              postErro = "opencode /message falhou (conexão)";
              postConcluido = true;
            });

            const inicio = Date.now();
            const deadline = 300_000;
            let enviado = "";
            let enviadoPensamento = "";
            let concluida = false;
            let vazioDesde: number | null = null;
            let acoesAvisadas = 0;
            let itensAssinatura = "";

            while (Date.now() - inicio < deadline) {
              await sleep(700);
              // o check de desconexão do cliente é no response (write side)
              if (res.destroyed || res.writableEnded) return;

              if (postErro && !concluida) {
                sse("erro", { erro: `falha ao enviar mensagem ao modelo (${postErro}) — ver ~/.local/share/opencode/log/opencode.log`, sessao_id: sessaoId });
                eventBus.emit("secretario.mensagem", { sessao_id: sessaoId, fase: "erro" });
                res.end();
                return;
              }

              const msgs = await listarMensagens();
              if (msgs) {
                const inicioIdx = baselineId ? msgs.findIndex((m) => m.info?.id === baselineId) : -1;
                const novasMsgs = inicioIdx >= 0 ? msgs.slice(inicioIdx + 1) : msgs;
                const assistentesNovas = novasMsgs.filter((m) => m.info?.role === "assistant");

                if (assistentesNovas.length > 0) {
                  // Turno com ferramentas: tools das mensagens assistant novas (o quê + status)
                  const { total: novas, itens } = extrairAcoesMensagens(msgs, baselineId);
                  const assinatura = JSON.stringify(itens);
                  if (novas > acoesAvisadas || assinatura !== itensAssinatura) {
                    acoesAvisadas = Math.max(acoesAvisadas, novas);
                    itensAssinatura = assinatura;
                    sse("acao", { acoes: novas, itens });
                  }

                  // Pensamento acumulado de TODAS as mensagens assistant do turno
                  const pensamentoAcumulado = assistentesNovas
                    .map((m) => pensamentoDe(m))
                    .filter(Boolean)
                    .join("\n\n---\n\n");
                  if (pensamentoAcumulado.length > enviadoPensamento.length) {
                    vazioDesde = null;
                    sse("pensamento", { delta: pensamentoAcumulado.slice(enviadoPensamento.length) });
                    enviadoPensamento = pensamentoAcumulado;
                    eventBus.emit("secretario.mensagem", { sessao_id: sessaoId, fase: "pensamento" });
                  }

                  // Texto acumulado de TODAS as mensagens assistant do turno
                  const textoAcumulado = assistentesNovas
                    .map((m) => textoDe(m))
                    .filter(Boolean)
                    .join("\n\n");
                  if (textoAcumulado.length > enviado.length) {
                    vazioDesde = null;
                    sse("delta", { delta: textoAcumulado.slice(enviado.length) });
                    enviado = textoAcumulado;
                    eventBus.emit("secretario.mensagem", { sessao_id: sessaoId, fase: "delta" });
                  }

                  const ultAssistant = assistentesNovas[assistentesNovas.length - 1];
                  const temToolEmCurso = (ultAssistant?.parts ?? []).some((p) => p.type === "tool" && p.state?.status !== "completed");
                  const temAtividade = textoAcumulado.length > 0 || pensamentoAcumulado.length > 0 || temToolEmCurso;
                  if (!temAtividade) {
                    if (vazioDesde === null) vazioDesde = Date.now();
                    else if (Date.now() - vazioDesde > 45_000) {
                      sse("erro", { erro: postErro ?? "modelo sem resposta (stream travado) — reenvie a mensagem", sessao_id: sessaoId });
                      eventBus.emit("secretario.mensagem", { sessao_id: sessaoId, fase: "erro" });
                      res.end();
                      return;
                    }
                  } else {
                    vazioDesde = null;
                  }
                }
              }

              // O turno só termina quando o POST /message síncrono do opencode completar!
              if (postConcluido) {
                concluida = true;
                break;
              }
            }

            if (!concluida) {
              sse("erro", { erro: "timeout aguardando resposta (300s)", sessao_id: sessaoId });
              eventBus.emit("secretario.mensagem", { sessao_id: sessaoId, fase: "erro" });
              res.end();
              return;
            }

            // Leitura final definitiva para garantir 100% do texto e pensamentos
            const msgsFinais = (await listarMensagens()) ?? [];
            const inicioFinalIdx = baselineId ? msgsFinais.findIndex((m) => m.info?.id === baselineId) : -1;
            const novasFinais = (inicioFinalIdx >= 0 ? msgsFinais.slice(inicioFinalIdx + 1) : msgsFinais).filter((m) => m.info?.role === "assistant");

            const textoFinal = novasFinais.map((m) => textoDe(m)).filter(Boolean).join("\n\n") || (postData ? textoDe(postData) : "");
            if (textoFinal.length > enviado.length) {
              sse("delta", { delta: textoFinal.slice(enviado.length) });
              enviado = textoFinal;
            }

            const pensamentoFinal = novasFinais.map((m) => pensamentoDe(m)).filter(Boolean).join("\n\n---\n\n") || (postData ? pensamentoDe(postData) : "");
            if (pensamentoFinal.length > enviadoPensamento.length) {
              sse("pensamento", { delta: pensamentoFinal.slice(enviadoPensamento.length) });
              enviadoPensamento = pensamentoFinal;
            }

            const { total: totalAcoes, itens: itensFinais } = extrairAcoesMensagens(msgsFinais, baselineId);
            if (totalAcoes > acoesAvisadas) {
              sse("acao", { acoes: totalAcoes, itens: itensFinais });
            }

            const respostaFinal = enviado || (totalAcoes > 0 ? "Ação concluída." : "Processamento concluído.");
            sse("fim", { sessao_id: sessaoId, resposta: respostaFinal });
            eventBus.emit("secretario.mensagem", { sessao_id: sessaoId, fase: "fim" });
            res.end();
            void sincronizarSessaoNoCorp(porta, sessaoId);
            return;
          } catch (erro) {
            if (!res.headersSent) {
              if (erro instanceof SecretarioError) {
                enviar(res, erro.status ?? 409, { erro: erro.message });
              } else {
                enviar(res, 502, { erro: `proxy falhou: ${erro instanceof Error ? erro.message : String(erro)}` });
              }
            } else {
              sse("erro", { erro: erro instanceof Error ? erro.message : String(erro) });
              res.end();
            }
            return;
          }
        }

        // ── POST /terminal — executa comando opencorp whitelistado (composer "!") ──
        // Mesma whitelist das rotinas de agenda (COMANDOS_AGENDA), MINUS subcomandos
        // operacionais (servidor/processos/testes); sem shell, timeout 20s com SIGKILL,
        // saída capped em 100KB; flags (--*) e paths são descartados dos args.
        if (rota === "/terminal" && req.method === "POST") {
          const TERMINAL_BLOQUEADOS = new Set(["serve", "web", "scheduler", "test", "daemon"]);
          const ws = await resolverWs(url);
          const corpo = (await lerCorpo(req)) as { comando?: string };
          const argsBrutos = String(corpo.comando ?? "").trim().split(/\s+/).filter(Boolean);
          if (argsBrutos.length === 0 || !COMANDOS_AGENDA.has(argsBrutos[0]!) || TERMINAL_BLOQUEADOS.has(argsBrutos[0]!)) {
            enviar(res, 422, { erro: "comando fora da whitelist" });
            return;
          }
          const args = argsBrutos.filter((a) => !a.startsWith("--") && !a.includes("/") && !a.includes("\\") && !a.includes(".."));
          console.log(`[terminal] ws=${ws.id} comando=${args.join(" ")}`);
          const bin = resolve(import.meta.dirname ?? ".", "..", "..", "bin", "opencorp.mjs");
          const home = opcoes.homeDir ?? opencorpHome();
          const CAP = 100 * 1024;
          const juntarSaida = (out: string, err: string): string =>
            (out + (err ? (out ? "\n" : "") + err : "")).trim().slice(0, CAP);
          try {
            const { stdout, stderr } = await promisify(execFile)(
              process.execPath,
              [bin, "--workspace", ws.id, ...args],
              {
                timeout: 20_000,
                killSignal: "SIGKILL",
                maxBuffer: CAP,
                encoding: "utf8",
                cwd: ws.path,
                env: { ...process.env, OPENCORP_HOME: home },
                windowsHide: true,
              },
            );
            enviar(res, 200, { saida: juntarSaida(stdout, stderr), codigo: 0 });
          } catch (erro) {
            const e = erro as { code?: number | string; killed?: boolean; signal?: string; stdout?: string; stderr?: string; message?: string };
            const codigo = typeof e.code === "number" ? e.code : e.killed ? 124 : 1;
            const saida =
              juntarSaida(e.stdout ?? "", e.stderr ?? "") ||
              (e.killed ? `comando interrompido (${e.signal ?? "timeout de 20s"})` : e.message ?? "falha ao executar comando");
            enviar(res, 200, { saida: saida.slice(0, CAP), codigo });
          }
          return;
        }

        if ((req.method === "GET" || req.method === "HEAD") && rota !== "/events") {
          // ── fallback estático: UI web (estilo opencode — servidor embute a web) ──
          const estatico = servirEstatico(rota);
          if (estatico !== null) {
            res.writeHead(200, { "content-type": estatico.tipo, "access-control-allow-origin": "*", "cache-control": "no-cache" });
            if (req.method === "HEAD") res.end();
            else res.end(estatico.corpo);
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
