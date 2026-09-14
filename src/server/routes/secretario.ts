import { readFileSync, rmSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join, resolve, relative, isAbsolute } from "node:path";
import type { ServerResponse } from "node:http";
import { opencorpHome } from "../../utils/paths.js";
import { writeFileAtomic } from "../../utils/fs-safe.js";
import { eventBus } from "../../core/event-bus.js";
import {
  dirOpencodeHome,
  authOpencodePath,
  authOverridesPathWorkspace,
  mascararChave,
  fundirAuth,
  PROVEEDOR_RE,
  limparPrefixoWorkspace,
  extrairPassosMensagens,
  extrairAcoesMensagens,
  SecretarioError,
  type EntradaAuth,
  type MensagemOc,
} from "../../core/opencode-server.js";
import { EngineAccountStore } from "../../core/engines/index.js";
import { TelemetryCollector, gerarTraceId, type TraceContext } from "../../core/telemetry-collector.js";
import { WorkspaceError } from "../../core/errors.js";
import type { OpcoesRun } from "../../core/session-manager.js";
import type { RouteContext } from "./types.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── F3-T01: gramática de menções (@) ──
const RE_MENCAO_TIPADA = /@(agente|prompt|arquivo|task):([^\s@]+)/g;
const RE_MENCAO_SIMPLES = /(?:^|\s)@([A-Za-z0-9][A-Za-z0-9._/-]*)/g;
const CAP_KB_CONTEXTO = 12 * 1024;
const MAX_ITENS_CONTEXTO = 8;

/** Streams `/secretario/conversa/stream` em voo por sessão. */
const streamsSecretarioAtivos = new Map<string, { res: { destroyed: boolean; writableEnded: boolean } }>();

interface StreamEnfileirado {
  sessaoId: string;
  res: ServerResponse;
  run: () => void | Promise<void>;
  expiraEm: number;
  timer: NodeJS.Timeout | null;
}
const filaStreamsSecretario = new Map<string, StreamEnfileirado[]>();
const LEASE_STREAM_MS = 60_000;

function enfileirarStreamSecretario(
  sessaoId: string,
  res: ServerResponse,
  run: () => void | Promise<void>,
): number {
  const lista = filaStreamsSecretario.get(sessaoId) ?? [];
  const posicao = lista.length;
  const entrada: StreamEnfileirado = { sessaoId, res, run, expiraEm: Date.now() + LEASE_STREAM_MS, timer: null };
  entrada.timer = setTimeout(() => {
    removerDaFilaStream(sessaoId, entrada);
    try {
      if (!res.destroyed && !res.writableEnded) {
        res.writeHead(503, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" });
        res.end(JSON.stringify({ erro: "tempo de espera na fila esgotado — tente novamente" }));
      }
    } catch { }
  }, LEASE_STREAM_MS);
  lista.push(entrada);
  filaStreamsSecretario.set(sessaoId, lista);
  return posicao;
}

function removerDaFilaStream(sessaoId: string, entrada: StreamEnfileirado): void {
  const lista = filaStreamsSecretario.get(sessaoId);
  if (!lista) return;
  const idx = lista.indexOf(entrada);
  if (idx >= 0) lista.splice(idx, 1);
  if (lista.length === 0) filaStreamsSecretario.delete(sessaoId);
  if (entrada.timer) clearTimeout(entrada.timer);
}

function liberarStreamSecretario(sessaoId: string, res: { destroyed: boolean; writableEnded: boolean }): void {
  if (streamsSecretarioAtivos.get(sessaoId)?.res === res) {
    streamsSecretarioAtivos.delete(sessaoId);
    const lista = filaStreamsSecretario.get(sessaoId);
    const proximo = lista?.[0];
    if (proximo) {
      removerDaFilaStream(sessaoId, proximo);
      void Promise.resolve()
        .then(() => proximo.run())
        .catch(() => undefined);
    }
  }
}

function textoAjudaSlash(): string {
  return `Comandos rápidos disponíveis no chat (somente no início da linha):

- \`/status\`: diagnóstico rápido de serviços, scheduler e tasks em andamento
- \`/agents\`: catálogo de agentes do workspace
- \`/schedules\`: rotinas agendadas do scheduler
- \`/task list\`: quadro Kanban de tarefas
- \`/task status <id>\`: status detalhado de uma task
- \`/task run <id>\`: despacha a task para o agente responsável
- \`/doctor\`: verifica integridade do motor de IA, API, daemon e portas
- \`/git status|diff|restore|log\`: comandos git do workspace
- \`/help\`: esta lista

Comandos \`/\` não reconhecidos não são enviados ao modelo — são respondidos aqui.`;
}

function textoAjudaMencoes(): string {
  return `Menções \`@\` (em qualquer posição da linha):

- \`@agente:<id>\`: troca o destinatário da mensagem (só quando é a única menção)
- \`@arquivo:<caminho>\`: inclui o conteúdo real do arquivo como contexto
- \`@task:<id>\`: inclui os dados da task como contexto
- \`@prompt:<chave>\`: expande o prompt salvo para texto editável`;
}

async function resolverCaminhoLocal(wsPath: string, pathParam: string): Promise<string> {
  const base = resolve(wsPath);
  const solicitado = pathParam ?? "";
  const normalizado = solicitado.replace(/^\.\//, "").replace(/\/+/g, "/");
  const alvo = resolve(base, normalizado);
  const relativo = relative(base, alvo);
  if (relativo.startsWith("..") || isAbsolute(relativo)) {
    throw new WorkspaceError("caminho fora do workspace (path traversal bloqueado)", { exitCode: 3 });
  }
  return alvo;
}

export function parsearModelo(modelo: string): { providerID: string; modelID: string } {
  const m = String(modelo ?? "").trim();
  if (!m) return { providerID: "opencode", modelID: "default" };
  if (!m.includes("/")) {
    return { providerID: "opencode", modelID: m };
  }
  const idx = m.indexOf("/");
  return {
    providerID: m.slice(0, idx).trim(),
    modelID: m.slice(idx + 1).trim(),
  };
}

async function trocarModeloEngine(baseUrl: string, sessaoId: string, modeloCompleto: string): Promise<boolean> {
  try {
    const { providerID, modelID } = parsearModelo(modeloCompleto);
    const [res1, res2] = await Promise.all([
      fetch(`${baseUrl}/api/session/${encodeURIComponent(sessaoId)}/model`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: { id: modelID, providerID } }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => null),
      fetch(`${baseUrl}/session/${encodeURIComponent(sessaoId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: { id: modelID, providerID } }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => null),
    ]);
    return Boolean((res1 && (res1.ok || res1.status === 204)) || (res2 && res2.ok));
  } catch {
    return false;
  }
}

export async function handleSecretarioRoutes(ctx: RouteContext): Promise<boolean> {
  const {
    req,
    res,
    url,
    rota,
    resolverWs,
    lerCorpo,
    enviar,
    tasks,
    scheduler,
    agentes,
    prompts,
    sessoes,
    settings,
    opencodeServer,
    registros,
    homeDir,
    portaOpencodeOuErro,
    sincronizarSessaoNoCorp,
    approvals,
  } = ctx;

  const home = homeDir ?? opencorpHome();

  async function obterPorta(): Promise<number> {
    if (portaOpencodeOuErro) return portaOpencodeOuErro();
    if (!opencodeServer) throw new SecretarioError("servidor do motor de IA não configurado", { status: 500 });
    const st = await opencodeServer.status();
    if (!st.rodando || !st.porta) {
      throw new SecretarioError("motor do secretário não iniciado — execute POST /secretario/start", { status: 409 });
    }
    return st.porta;
  }

  async function sincronizarCorp(porta: number, sessaoId: string): Promise<void> {
    if (sincronizarSessaoNoCorp) {
      await sincronizarSessaoNoCorp(porta, sessaoId);
    }
  }

  // ── Resolução de Modelos e Motores de IA ──
  async function resolverModelos(opts: {
    modeloRequisicao?: string;
    agenteId?: string;
    wsPath?: string;
  }): Promise<{ modelos: string[]; motorPadrao: string }> {
    const { modeloRequisicao, agenteId, wsPath } = opts;

    let modeloAgente: string | undefined;
    if (agenteId && agentes && wsPath) {
      try {
        const ag = await agentes.carregar(wsPath, agenteId);
        modeloAgente = (ag as any)?.model || (ag as any)?.modelo;
      } catch { }
    }

    const cfgResolvido = settings
      ? await settings.resolve(wsPath ? { workspaceDir: wsPath } : undefined).catch(() => null)
      : null;

    const st = cfgResolvido?.settings as any;
    const motorPadrao = st?.runner || "opencode";

    const modelosRotacao = [
      ...(Array.isArray(st?.modelos?.rotacao) ? st.modelos.rotacao : []),
      ...(Array.isArray(st?.tests?.rotation) ? st.tests.rotation : []),
    ].filter((m): m is string => typeof m === "string" && m.trim().length > 0);

    const contingencia = [
      "opencode-go/glm-5.3-flash",
      "opencode/nemotron-3-ultra-free",
      "google/gemini-2.5-flash",
      "google/gemini-3.5-flash-lite",
      "openrouter/qwen/qwen3-coder-flash",
      "openrouter/minimax/minimax-m3",
    ];

    // Prioridade estrita:
    // 1. Modelo solicitado explicitamente (corpo.modelo / corpo.model)
    // 2. Modelo do Secretário (settings.secretary?.model) ou modelo do agente
    // 3. Modelo padrão do workspace (settings.default_model ou settings.modelos?.padrao)
    // 4. Lista de rotação real configurada (settings.modelos?.rotacao ou settings.tests?.rotation)
    // 5. Fallback final caso o array esteja vazio: modelos de contingência do sistema
    const listaBruta = [
      modeloRequisicao,
      st?.secretary?.model,
      modeloAgente,
      st?.default_model,
      st?.modelos?.padrao,
      ...modelosRotacao,
      ...(modelosRotacao.length === 0 ? contingencia : []),
      contingencia[0],
    ].filter(Boolean) as string[];

    const modelos = [...new Set(listaBruta.map((m) => String(m).trim()))];
    return { modelos, motorPadrao };
  }

  // ── Resolver Menções ──
  async function resolverMencoes(opts: {
    mensagemBruta: string;
    corpoContexto?: string[];
    agenteAtual: string;
    ws: { id: string; path: string };
  }): Promise<{ mensagem: string; contexto: string[]; agente: string }> {
    const { mensagemBruta, corpoContexto, agenteAtual, ws } = opts;

    const contextoBase = (Array.isArray(corpoContexto) ? corpoContexto : [])
      .map((c) => String(c).replace(/^@/, "").slice(0, 120))
      .filter(Boolean)
      .slice(0, MAX_ITENS_CONTEXTO);

    const tipadas = [...mensagemBruta.matchAll(RE_MENCAO_TIPADA)].map((m) => ({
      tipo: m[1]!.toLowerCase(),
      valor: m[2]!,
    }));
    const semTipadas = mensagemBruta.replace(RE_MENCAO_TIPADA, " ");
    const simples = [...semTipadas.matchAll(RE_MENCAO_SIMPLES)].map((m) => m[1]!);

    const idsAgentes = new Set(agentes ? (await agentes.listar(ws.path).catch(() => [])).map((a) => a.id) : []);
    const totalMencoes = tipadas.length + simples.length;

    let agente = agenteAtual;
    let mensagem = mensagemBruta;
    const hidratado: string[] = [];

    if (totalMencoes === 1) {
      let alvoAgente: string | null = null;
      if (tipadas.length === 1 && tipadas[0]!.tipo === "agente") alvoAgente = tipadas[0]!.valor;
      else if (simples.length === 1 && idsAgentes.has(simples[0]!)) alvoAgente = simples[0]!;
      if (alvoAgente && idsAgentes.has(alvoAgente)) {
        agente = alvoAgente;
        mensagem = mensagem
          .replace(RE_MENCAO_TIPADA, "")
          .replace(RE_MENCAO_SIMPLES, " ")
          .replace(/\s+/g, " ")
          .trim();
      }
    }

    for (const t of tipadas) {
      if (t.tipo === "arquivo") {
        try {
          const alvo = await resolverCaminhoLocal(ws.path, t.valor);
          const info = await stat(alvo).catch(() => null);
          if (info && info.isFile()) {
            const conteudo = await readFile(alvo, "utf8");
            const cortado = conteudo.length > CAP_KB_CONTEXTO;
            hidratado.push(
              `Fonte: arquivo "${t.valor}"\n${conteudo.slice(0, CAP_KB_CONTEXTO)}${cortado ? "\n…(truncado)" : ""}`,
            );
          } else {
            hidratado.push(`Fonte: arquivo "${t.valor}" — não encontrado ou não é um arquivo`);
          }
        } catch {
          hidratado.push(`Fonte: arquivo "${t.valor}" — não encontrado ou não é um arquivo`);
        }
      } else if (t.tipo === "task") {
        const tk = await tasks.obter(ws.path, t.valor).catch(() => null);
        hidratado.push(
          tk
            ? `Fonte: task "${tk.id}" (${tk.titulo}, coluna "${tk.coluna}", responsável "${tk.responsavel || "-"}")\n${tk.descricao || ""}`.trim()
            : `Fonte: task "${t.valor}" — não encontrada`,
        );
      } else if (t.tipo === "prompt") {
        try {
          if (prompts) {
            const texto = await prompts.get(ws.path, t.valor);
            hidratado.push(`Fonte: prompt "${t.valor}"\n${texto}`);
          }
        } catch (erro) {
          hidratado.push(`Fonte: prompt "${t.valor}" — ${erro instanceof Error ? erro.message : "não encontrado"}`);
        }
      }
    }

    mensagem = mensagem.replace(RE_MENCAO_TIPADA, "").replace(/\s+/g, " ").trim();
    const contexto = [...contextoBase, ...hidratado].slice(0, MAX_ITENS_CONTEXTO);

    if (hidratado.length > 0) {
      mensagem = `${mensagem || "(contexto referenciado)"}\n\n[CONTEXTO REFERENCIADO]\n${hidratado.join("\n\n---\n\n")}`;
    } else if (contextoBase.length > 0) {
      mensagem = mensagem
        ? `${mensagem}\n\n(Contexto referenciado pelo usuário: ${contextoBase.map((c) => "@" + c).join(" ")})`
        : mensagem;
    }

    return { mensagem, contexto, agente };
  }

  // ── Processar Slash Ações ──
  async function processarSlash(
    mensagem: string,
    ws: { id: string; path: string },
  ): Promise<{ tratado: boolean; mensagem: string }> {
    const pedacos = mensagem.trim().split(/\s+/).filter(Boolean);
    const token = (pedacos[0] ?? "").toLowerCase();

    if (token === "/help") return { tratado: true, mensagem: `${textoAjudaSlash()}\n\n${textoAjudaMencoes()}` };

    if (token === "/status") {
      const linhas: string[] = [];
      try {
        if (opencodeServer) {
          const st = await opencodeServer.status();
          const cfg = settings ? await settings.resolve({ workspaceDir: ws.path }).catch(() => null) : null;
          const motorNome = (cfg?.settings as any)?.runner || "opencode";
          linhas.push(`Motor do Secretário (${motorNome}): ${st.rodando ? "rodando" : "parado"}${st.porta ? ` (porta ${st.porta})` : ""}`);
        }
      } catch {
        linhas.push("Motor do Secretário: indisponível");
      }
      try {
        const pidInfo = JSON.parse(readFileSync(join(home, ".opencorp", "scheduler.pid"), "utf8")) as { pid?: number };
        let vivo = false;
        if (typeof pidInfo.pid === "number") {
          try { process.kill(pidInfo.pid, 0); vivo = true; } catch { vivo = false; }
        }
        linhas.push(`Scheduler (daemon): ${vivo ? "rodando" : "parado"}`);
      } catch {
        linhas.push("Scheduler (daemon): parado");
      }
      try {
        const emAndamento = (await tasks.listar(ws.path)).filter((t) => t.coluna === "fazendo" || t.coluna === "bloqueado");
        linhas.push(`Tasks: ${emAndamento.length} em andamento`);
      } catch {
        linhas.push("Tasks: indisponível");
      }
      return { tratado: true, mensagem: `Status do workspace "${ws.id}":\n${linhas.map((l) => `- ${l}`).join("\n")}` };
    }

    if (token === "/agents") {
      const lista = agentes ? await agentes.listar(ws.path).catch(() => []) : [];
      if (lista.length === 0) return { tratado: true, mensagem: "Nenhum agente configurado neste workspace." };
      return {
        tratado: true,
        mensagem: `Agentes do workspace "${ws.id}" (${lista.length}):\n${lista
          .map((a) => `- @${a.id}${a.role ? ` — ${a.role}` : ""}${a.ativo === false ? " (desativado)" : ""}`)
          .join("\n")}`,
      };
    }

    if (token === "/schedules") {
      const jobs = await scheduler.listar().catch(() => []);
      if (jobs.length === 0) return { tratado: true, mensagem: "Nenhuma rotina agendada." };
      return {
        tratado: true,
        mensagem: `Rotinas agendadas (${jobs.length}):\n${jobs
          .map((j) => `- ${j.nome} (${j.workspace}) — ${j.proxima_exec ? j.proxima_exec.slice(0, 16).replace("T", " ") : "sem próxima execução"}`)
          .join("\n")}`,
      };
    }

    if (token === "/task") {
      const sub = (pedacos[1] ?? "").toLowerCase();
      if (sub === "list" || sub === "") {
        const lista = await tasks.listar(ws.path).catch(() => []);
        if (lista.length === 0) return { tratado: true, mensagem: "Nenhuma task no quadro." };
        return {
          tratado: true,
          mensagem: `Quadro de tasks (${lista.length}):\n${lista
            .map((t) => `- ${t.id}: ${t.titulo} [${t.coluna}]`)
            .join("\n")}`,
        };
      }
      if (sub === "status" || sub === "run") {
        const id = pedacos[2];
        if (!id) return { tratado: true, mensagem: `Uso: /task ${sub} <id>` };
        const tk = await tasks.obter(ws.path, id).catch(() => null);
        if (!tk) return { tratado: true, mensagem: `Task "${id}" não encontrada no workspace.` };
        if (sub === "status") {
          return {
            tratado: true,
            mensagem: `Task ${tk.id}: ${tk.titulo}\nColuna: ${tk.coluna} · Prioridade: ${tk.prioridade} · Responsável: ${tk.responsavel || "-"}\n${tk.descricao || ""}`.trim(),
          };
        }
        const agenteTask = (tk.responsavel ?? "").replace(/^agente:/, "").trim() || "executor-padrao";
        void sessoes
          .rodar({
            agente: agenteTask,
            ordem: `Você é o agente "${agenteTask}" executando a task ${tk.id} no workspace "${ws.id}".\nTítulo: ${tk.titulo}\n${tk.descricao ? `Descrição:\n${tk.descricao}` : ""}\nExecute todas as ações necessárias para resolver esta tarefa.`,
            workspaceDir: ws.path,
            gatilho: { tipo: "manual", origem: `task:${tk.id}` },
          } as OpcoesRun)
          .catch(() => undefined);
        return {
          tratado: true,
          mensagem: `Task ${tk.id} despachada para o agente @${agenteTask} (execução em andamento).`,
        };
      }
      return { tratado: true, mensagem: `Subcomando de task não reconhecido. Use /task list, /task status <id> ou /task run <id>.` };
    }

    if (token === "/doctor") {
      const { runDoctor } = await import("../../core/doctor.js");
      const r = await runDoctor({ homeDir: home, workspacePath: ws.path });
      const linhas = r.checks.map((c) => `- [${c.status === "ok" ? "OK" : c.status.toUpperCase()}] ${c.label}${c.detail ? ` — ${c.detail}` : ""}`);
      return {
        tratado: true,
        mensagem: `Doctor (${r.ok ? "tudo ok" : "há pendências"}):\n${linhas.join("\n")}`,
      };
    }

    return { tratado: false, mensagem: "" };
  }

  // ─────────────────────────────────────────────────────────────────────
  // 1. STATUS, START & STOP
  // ─────────────────────────────────────────────────────────────────────
  if (rota === "/secretario/status" && req.method === "GET") {
    if (!opencodeServer) {
      enviar(res, 200, { rodando: false, configurado: false, erro: "servidor não disponível" });
      return true;
    }
    const status = await opencodeServer.status();
    const configurado = await opencodeServer.configurado();
    enviar(res, 200, { ...status, configurado });
    return true;
  }

  if (rota === "/secretario/start" && req.method === "POST") {
    if (!opencodeServer) {
      enviar(res, 500, { erro: "servidor do motor de IA não configurado" });
      return true;
    }
    try {
      const { pid, porta } = await opencodeServer.iniciar();
      const status = await opencodeServer.status();
      enviar(res, 200, { pid, porta, agentes: status.rodando ? "configurados" : 0 });
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      enviar(res, 500, { erro: `falha ao iniciar secretário: ${mensagem}` });
    }
    return true;
  }

  if (rota === "/secretario/stop" && req.method === "POST") {
    if (!opencodeServer) {
      enviar(res, 200, { ok: true });
      return true;
    }
    await opencodeServer.parar();
    enviar(res, 200, { ok: true });
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────
  // 2. CONTEXTO & SUGESTÕES (/secretario/contexto, /secretario/sugestoes)
  // ─────────────────────────────────────────────────────────────────────
  if (rota === "/secretario/contexto" && req.method === "GET") {
    const ws = await resolverWs(url);
    const listaAgentes = agentes ? await agentes.listar(ws.path).catch(() => []) : [];
    const listaTasks = await tasks.listar(ws.path).catch(() => []);
    const { modelos, motorPadrao } = await resolverModelos({ wsPath: ws.path });
    enviar(res, 200, {
      workspace: { id: ws.id, path: ws.path },
      agentes: listaAgentes.map((a) => ({ id: a.id, role: a.role, ativo: a.ativo })),
      tasks_em_andamento: listaTasks.filter((t) => t.coluna === "fazendo").length,
      total_tasks: listaTasks.length,
      motor_ativo: motorPadrao,
      modelo_principal: modelos[0] ?? null,
      modelos_disponiveis: modelos,
    });
    return true;
  }

  if (rota === "/secretario/sugestoes" && req.method === "GET") {
    enviar(res, 200, {
      sugestoes: [
        "/status",
        "/task list",
        "/agents",
        "/doctor",
        "/git status",
        "/schedules",
      ],
    });
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────
  // 3. COMANDOS GIT SLASH (/secretario/git, /secretario/git-slash)
  // ─────────────────────────────────────────────────────────────────────
  if ((rota === "/secretario/git" || rota === "/secretario/git-slash") && req.method === "POST") {
    const ws = await resolverWs(url);
    const corpo = (await lerCorpo(req)) as { comando?: string; mensagem?: string };
    const cmd = String(corpo.comando ?? corpo.mensagem ?? "").trim();
    if (!cmd) {
      enviar(res, 400, { erro: "comando git obrigatório" });
      return true;
    }
    const { processarComandoGitSecretario } = await import("../../core/secretario-git-slash.js");
    const resultado = await processarComandoGitSecretario(cmd, ws.path, ws.id);
    enviar(res, 200, { ok: true, ...resultado });
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4. DESPACHO DE ORDEM DIRETA (/secretario/ordem, /secretario/chat)
  // ─────────────────────────────────────────────────────────────────────
  if ((rota === "/secretario/ordem" || rota === "/secretario/chat") && req.method === "POST") {
    const ws = await resolverWs(url);
    const corpo = (await lerCorpo(req)) as {
      ordem?: string;
      mensagem?: string;
      agente?: string;
      modelo?: string;
      model?: string;
      motor?: string;
      engine?: string;
    };
    const textoOrdem = String(corpo.ordem ?? corpo.mensagem ?? "").trim();
    if (!textoOrdem) {
      enviar(res, 400, { erro: "ordem ou mensagem obrigatória" });
      return true;
    }
    const ag = corpo.agente || "secretario-exec";
    const modeloEspecificado = corpo.modelo || corpo.model;
    const motorEspecificado = corpo.motor || corpo.engine;

    const resRun = await sessoes.rodar({
      agente: ag,
      ordem: textoOrdem,
      workspaceDir: ws.path,
      gatilho: { tipo: "manual", origem: "api:secretario" },
      ...(modeloEspecificado ? { modelo: modeloEspecificado } : {}),
      ...(motorEspecificado ? { motor: motorEspecificado } : {}),
    } as OpcoesRun);
    enviar(res, 200, resRun);
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────
  // 5. CONVERSA SÍNCRONA COM POLLING (/secretario/conversa)
  // ─────────────────────────────────────────────────────────────────────
  if (rota === "/secretario/conversa" && req.method === "POST") {
    try {
      const corpo = (await lerCorpo(req)) as {
        mensagem?: string;
        sessao_id?: string;
        agente?: string;
        modelo?: string;
        model?: string;
        motor?: string;
        engine?: string;
        imagens?: Array<{ nome?: string; mime?: string; url?: string }>;
        contexto?: string[];
      };
      const mensagemBruta = limparPrefixoWorkspace(corpo.mensagem?.trim() || "");
      const imagens = (corpo.imagens ?? []).filter((i) => i && typeof i.url === "string" && i.url.startsWith("data:image/")).slice(0, 4);
      if (!mensagemBruta && imagens.length === 0) {
        enviar(res, 400, { erro: "mensagem obrigatória" });
        return true;
      }

      // Fast-path: git slash
      if (/^(\/git|\/restore|\/descartar|\/status-git|\/rollback)/i.test(mensagemBruta)) {
        const ws = await resolverWs(url);
        const { processarComandoGitSecretario } = await import("../../core/secretario-git-slash.js");
        const resultadoGit = await processarComandoGitSecretario(mensagemBruta, ws.path, ws.id);
        if (resultadoGit.tratado) {
          enviar(res, 200, {
            ok: true,
            sessao_id: corpo.sessao_id || `sessao-git-${Date.now()}`,
            resposta: resultadoGit.mensagem,
            content: resultadoGit.mensagem,
            gitStatus: resultadoGit.gitStatus,
            gitDiff: resultadoGit.gitDiff,
          });
          return true;
        }
      }

      // Fast-path: slash actions
      if (/^\//.test(mensagemBruta)) {
        const ws = await resolverWs(url);
        const acao = await processarSlash(mensagemBruta, ws);
        if (acao.tratado) {
          enviar(res, 200, {
            ok: true,
            sessao_id: corpo.sessao_id || `sessao-acao-${Date.now()}`,
            resposta: acao.mensagem,
            content: acao.mensagem,
          });
          return true;
        }
        enviar(res, 200, {
          ok: true,
          sessao_id: corpo.sessao_id || `sessao-acao-${Date.now()}`,
          resposta: `Comando "${mensagemBruta.split(/\s+/)[0]}" não reconhecido.\n\n${textoAjudaSlash()}`,
          content: `Comando "${mensagemBruta.split(/\s+/)[0]}" não reconhecido.\n\n${textoAjudaSlash()}`,
        });
        return true;
      }

      const ws = await resolverWs(url);
      const resolvido = await resolverMencoes({
        mensagemBruta,
        corpoContexto: corpo.contexto,
        agenteAtual: corpo.agente ?? "secretario",
        ws,
      });
      const mensagem = resolvido.mensagem;
      const agenteResolvido = resolvido.agente;
      const porta = await obterPorta();
      let sessaoId = corpo.sessao_id;
      const baseUrl = `http://127.0.0.1:${porta}`;

      const modeloSolicitado = corpo.modelo || corpo.model;
      const { modelos: modelosFallbackConv, motorPadrao } = await resolverModelos({
        modeloRequisicao: modeloSolicitado,
        agenteId: agenteResolvido,
        wsPath: ws.path,
      });

      const modeloInicial = modelosFallbackConv[0]!;
      const { providerID: pIdIni, modelID: mIdIni } = parsearModelo(modeloInicial);

      let sessaoExiste = false;
      if (sessaoId) {
        try {
          const checkRes = await fetch(`${baseUrl}/session/${encodeURIComponent(sessaoId)}`, {
            signal: AbortSignal.timeout(3000),
          });
          if (checkRes.ok) sessaoExiste = true;
        } catch { }
      }

      if (!sessaoId || !sessaoExiste) {
        const createRes = await fetch(`${baseUrl}/session`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: mensagem.slice(0, 60),
            agent: agenteResolvido,
            model: { providerID: pIdIni, modelID: mIdIni },
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!createRes.ok) {
          enviar(res, 502, { erro: `falha ao criar sessão no motor: ${createRes.status}` });
          return true;
        }
        const sessionData = (await createRes.json()) as { id: string };
        sessaoId = sessionData.id;
      } else if (modeloSolicitado) {
        await trocarModeloEngine(baseUrl, sessaoId, modeloSolicitado);
      }

      let respostaTexto = "";
      let modeloQueRespondeu = modeloInicial;
      const extrair = (m: { parts?: Array<{ type: string; text?: string }> }): string =>
        (m.parts ?? []).filter((p) => p.type === "text").map((p) => p.text ?? "").join("\n").trim();

      const wsPrefixo = `[WORKSPACE ATIVO: "${ws.id}" | CAMINHO: ${ws.path}]\n(Atenção Secretário: O usuário está operando estritamente no workspace "${ws.id}". Ao rodar comandos 'oc', use SEMPRE a flag '--workspace ${ws.id}'. Suas análises, listagens e tarefas devem ser restritas exclusivamente a este workspace. Não consulte outros workspaces.)\n\n`;
      const mensagemComWs = `${wsPrefixo}${mensagem}`;

      for (let mIdx = 0; mIdx < modelosFallbackConv.length; mIdx++) {
        const mod = modelosFallbackConv[mIdx]!;
        const { providerID: modProvider, modelID: modId } = parsearModelo(mod);
        const modelPayload = modProvider && modId ? { providerID: modProvider, modelID: modId } : undefined;

        if (mIdx > 0) {
          await fetch(`${baseUrl}/session/${sessaoId}/abort`, { method: "POST" }).catch(() => { });
          await sleep(300);
          await trocarModeloEngine(baseUrl, sessaoId, mod);
          await sleep(150);
        }

        try {
          const msgRes = await fetch(`${baseUrl}/session/${sessaoId}/message`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              sessionID: sessaoId,
              agent: agenteResolvido ?? "secretario",
              ...(modelPayload ? { model: modelPayload } : {}),
              parts: [
                { type: "text", text: mensagemComWs },
                ...imagens.map((i) => ({ type: "file", mime: i.mime ?? "image/png", url: i.url! })),
              ],
            }),
            signal: AbortSignal.timeout(30_000),
          });

          if (msgRes.ok) {
            const msgData = (await msgRes.json()) as {
              info?: { role?: string };
              parts?: Array<{ type: string; text?: string }>;
            };
            if (msgData.info?.role === "assistant") {
              respostaTexto = extrair(msgData);
            }
            if (respostaTexto) {
              modeloQueRespondeu = mod;
              break;
            }
          }
        } catch { }
      }

      if (!respostaTexto) {
        const timeoutMs = 60_000;
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
        enviar(res, 504, { erro: "timeout aguardando resposta do modelo assistente (60s)", sessao_id: sessaoId });
        return true;
      }

      void sincronizarCorp(porta, sessaoId);
      enviar(res, 200, {
        sessao_id: sessaoId,
        resposta: respostaTexto,
        agente: agenteResolvido,
        modelo: modeloQueRespondeu,
        motor: corpo.motor || corpo.engine || motorPadrao,
      });
      return true;
    } catch (erro) {
      if (erro instanceof SecretarioError) {
        enviar(res, erro.status ?? 409, { erro: erro.message });
      } else {
        enviar(res, 502, { erro: `proxy do motor falhou: ${erro instanceof Error ? erro.message : String(erro)}` });
      }
      return true;
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // 6. CONVERSA EM STREAMING SSE (/secretario/conversa/stream)
  // ─────────────────────────────────────────────────────────────────────
  if (rota === "/secretario/conversa/stream" && req.method === "POST") {
    let chaveStreamRegistrada: string | undefined;
    const sse = (evento: string, data: unknown): void => {
      if (res.writableEnded) return;
      res.write(`event: ${evento}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const corpo = (await lerCorpo(req)) as {
        mensagem?: string;
        prompt?: string;
        sessao_id?: string;
        agente?: string;
        modelo?: string;
        model?: string;
        motor?: string;
        engine?: string;
        imagens?: Array<{ nome?: string; mime?: string; url?: string }>;
        contexto?: string[];
      };
      const mensagemBruta = limparPrefixoWorkspace((corpo.mensagem ?? corpo.prompt ?? "").trim());
      const imagens = (corpo.imagens ?? []).filter((i) => i && typeof i.url === "string" && i.url.startsWith("data:image/")).slice(0, 4);
      if (!mensagemBruta && imagens.length === 0) {
        enviar(res, 400, { erro: "mensagem obrigatória" });
        return true;
      }

      const sessaoCandidata = corpo.sessao_id || url.searchParams.get("sessao") || undefined;

      const executarStream = async (): Promise<void> => {
        const emSegundoPlano = res.writableEnded;
        try {
          if (sessaoCandidata) {
            const ocupante = streamsSecretarioAtivos.get(sessaoCandidata);
            if (ocupante) {
              if (ocupante.res.destroyed || ocupante.res.writableEnded) {
                streamsSecretarioAtivos.delete(sessaoCandidata);
              } else {
                const posicao = enfileirarStreamSecretario(sessaoCandidata, res, executarStream);
                enviar(res, 429, { erro: "sessão ocupada em outra execução — requisição enfileirada", posicao });
                return;
              }
            }
            streamsSecretarioAtivos.set(sessaoCandidata, { res });
            chaveStreamRegistrada = sessaoCandidata;
          }

          // FAST-PATH: Comandos Git Slash
          if (/^(\/git|\/restore|\/descartar|\/status-git|\/rollback)/i.test(mensagemBruta)) {
            const ws = await resolverWs(url);
            const { processarComandoGitSecretario } = await import("../../core/secretario-git-slash.js");
            const resultadoGit = await processarComandoGitSecretario(mensagemBruta, ws.path, ws.id);
            if (resultadoGit.tratado) {
              if (!res.headersSent && !res.writableEnded) {
                res.writeHead(200, {
                  "content-type": "text/event-stream; charset=utf-8",
                  "cache-control": "no-cache",
                  "connection": "keep-alive",
                  "access-control-allow-origin": "*",
                  "x-accel-buffering": "no",
                });
              }
              const sId = corpo.sessao_id || url.searchParams.get("sessao") || `sessao-git-${Date.now()}`;
              sse("inicio", { sessao_id: sId });
              sse("delta", {
                delta: resultadoGit.mensagem,
                gitStatus: resultadoGit.gitStatus,
                gitDiff: resultadoGit.gitDiff,
              });
              sse("fim", {
                content: resultadoGit.mensagem,
                resposta: resultadoGit.mensagem,
                gitStatus: resultadoGit.gitStatus,
                gitDiff: resultadoGit.gitDiff,
              });
              if (chaveStreamRegistrada) liberarStreamSecretario(chaveStreamRegistrada, res);
              res.end();
              return;
            }
          }

          // FAST-PATH: ações `/` whitelistadas
          if (/^\//.test(mensagemBruta)) {
            const ws = await resolverWs(url);
            const acao = await processarSlash(mensagemBruta, ws);
            const respostaAcao = acao.tratado
              ? acao.mensagem
              : `Comando "${mensagemBruta.split(/\s+/)[0]}" não reconhecido.\n\n${textoAjudaSlash()}`;
            if (!res.headersSent && !res.writableEnded) {
              res.writeHead(200, {
                "content-type": "text/event-stream; charset=utf-8",
                "cache-control": "no-cache",
                "connection": "keep-alive",
                "access-control-allow-origin": "*",
                "x-accel-buffering": "no",
              });
            }
            const sId = corpo.sessao_id || url.searchParams.get("sessao") || `sessao-acao-${Date.now()}`;
            sse("inicio", { sessao_id: sId });
            sse("delta", { delta: respostaAcao });
            sse("fim", { content: respostaAcao, resposta: respostaAcao });
            if (chaveStreamRegistrada) liberarStreamSecretario(chaveStreamRegistrada, res);
            res.end();
            return;
          }

          const ws = await resolverWs(url);
          const resolvido = await resolverMencoes({
            mensagemBruta,
            corpoContexto: corpo.contexto,
            agenteAtual: corpo.agente ?? "secretario-exec",
            ws,
          });
          const mensagem = resolvido.mensagem;

          if (!res.headersSent && !res.writableEnded) {
            res.writeHead(200, {
              "content-type": "text/event-stream; charset=utf-8",
              "cache-control": "no-cache",
              "connection": "keep-alive",
              "access-control-allow-origin": "*",
              "x-accel-buffering": "no",
            });
          }

          const porta = await obterPorta();
          const baseUrl = `http://127.0.0.1:${porta}`;
          const agente = resolvido.agente ?? "secretario-exec";
          let sessaoId = corpo.sessao_id || url.searchParams.get("sessao") || undefined;

          const modeloSolicitado = corpo.modelo || corpo.model;
          const motorSolicitado = corpo.motor || corpo.engine;
          const { modelos: modelosFallback, motorPadrao } = await resolverModelos({
            modeloRequisicao: modeloSolicitado,
            agenteId: agente,
            wsPath: ws.path,
          });

          const modeloInicial = modelosFallback[0]!;
          const { providerID: pIdIni, modelID: mIdIni } = parsearModelo(modeloInicial);

          let sessaoExiste = false;
          if (sessaoId) {
            try {
              const checkRes = await fetch(`${baseUrl}/session/${encodeURIComponent(sessaoId)}`, {
                signal: AbortSignal.timeout(3000),
              });
              if (checkRes.ok) sessaoExiste = true;
            } catch { }
          }

          if (!sessaoId || !sessaoExiste) {
            const createRes = await fetch(`${baseUrl}/session`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                title: mensagem.slice(0, 60),
                agent: agente,
                model: { providerID: pIdIni, modelID: mIdIni },
              }),
              signal: AbortSignal.timeout(10000),
            });
            if (!createRes.ok) {
              sse("erro", { erro: `falha ao criar sessão no motor: ${createRes.status}` });
              res.end();
              return;
            }
            const sessionData = (await createRes.json()) as { id: string };
            sessaoId = sessionData.id;
          } else if (modeloSolicitado) {
            await trocarModeloEngine(baseUrl, sessaoId, modeloSolicitado);
          }

          sse("inicio", {
            sessao_id: sessaoId,
            agente,
            modelo: modeloInicial,
            motor: motorSolicitado || motorPadrao,
          });
          eventBus.emit("secretario.mensagem", {
            sessao_id: sessaoId,
            fase: "inicio",
            agente,
            modelo: modeloInicial,
          });

          if (chaveStreamRegistrada && chaveStreamRegistrada !== sessaoId) {
            streamsSecretarioAtivos.delete(chaveStreamRegistrada);
            streamsSecretarioAtivos.set(sessaoId, { res });
            chaveStreamRegistrada = sessaoId;
          } else if (!chaveStreamRegistrada) {
            streamsSecretarioAtivos.set(sessaoId, { res });
            chaveStreamRegistrada = sessaoId;
          }

          const baseUrlSessao = `${baseUrl}/session/${sessaoId}`;
          const listarMensagens = async (): Promise<MensagemOc[] | null> => {
            try {
              const getRes = await fetch(`${baseUrlSessao}/message`, { signal: AbortSignal.timeout(5000) });
              if (!getRes.ok) return null;
              const msgs = (await getRes.json()) as MensagemOc[];
              return Array.isArray(msgs) ? msgs : null;
            } catch {
              return null;
            }
          };
          const passosM = (m: MensagemOc) => extrairPassosMensagens([m]);
          const textoDe = (m: MensagemOc): string =>
            passosM(m).filter((p) => p.tipo === "texto").map((p) => p.texto ?? "").join("\n");
          const pensamentoDe = (m: MensagemOc): string =>
            passosM(m).filter((p) => p.tipo === "pensamento").map((p) => p.texto ?? "").join("\n\n---\n\n");

          const baseMsgs = (await listarMensagens()) ?? [];
          const baseAssistant = [...baseMsgs].reverse().find((m) => m.info?.role === "assistant");
          const baselineId = baseAssistant?.info?.id ?? null;

          let modeloIdx = 0;
          let tentativasTotais = 0;
          const maxTentativas = modelosFallback.length * 3;
          let concluida = false;
          let postData: MensagemOc | null = null;
          let enviado = "";
          let enviadoPensamento = "";
          let acoesAvisadas = 0;
          let itensAssinatura = "";
          let modeloAtivoFinal = modeloInicial;

          while (tentativasTotais < maxTentativas && !concluida) {
            const modeloAtual = modelosFallback[modeloIdx % modelosFallback.length]!;
            modeloAtivoFinal = modeloAtual;
            const { providerID: modProvider, modelID: modId } = parsearModelo(modeloAtual);
            const modelPayload = modProvider && modId ? { providerID: modProvider, modelID: modId } : undefined;

            if (tentativasTotais > 0) {
              sse("status", {
                tipo: "fallback_modelo",
                modelo: modeloAtual,
                aviso: `⚡ Alternando automaticamente para ${modeloAtual}...`,
              });
              eventBus.emit("secretario.mensagem", {
                sessao_id: sessaoId,
                fase: "alternando_modelo",
                modelo: modeloAtual,
              });

              await fetch(`${baseUrlSessao}/abort`, { method: "POST" }).catch(() => { });
              await sleep(350);
              await trocarModeloEngine(baseUrl, sessaoId, modeloAtual);
              await sleep(200);
            }

            const wsPrefixoStream = `[WORKSPACE ATIVO: "${ws.id}" | CAMINHO: ${ws.path}]\n(Atenção Secretário: O usuário está operando estritamente no workspace "${ws.id}". Ao rodar comandos 'oc', use SEMPRE a flag '--workspace ${ws.id}'. Suas análises, listagens e tarefas devem ser restritas exclusivamente a este workspace. Não consulte outros workspaces.)\n\n`;
            const mensagemStreamComWs = `${wsPrefixoStream}${mensagem}`;

            const msgsPreExistentes = (await listarMensagens()) ?? [];
            const assistentesPre = msgsPreExistentes.filter((m) => m.info?.role === "assistant");
            const hasExistingContinuation = msgsPreExistentes.some((m) => {
              if (m.info?.role !== "user") return false;
              const textPart = m.parts?.find((p) => p.type === "text");
              const content = textPart?.text ?? "";
              return typeof content === "string" && content.startsWith("Continue a execução");
            });
            const textoParaEnvio = assistentesPre.length > 0 && tentativasTotais > 0 && !hasExistingContinuation
              ? "Continue a execução anterior exatamente de onde parou. Conclua todas as análises e ações pendentes até finalizar a demanda por completo."
              : mensagemStreamComWs;

            let postConcluido = false;
            let postErro: string | null = null;
            void fetch(`${baseUrlSessao}/message`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                sessionID: sessaoId,
                agent: agente,
                ...(modelPayload ? { model: modelPayload } : {}),
                parts: [
                  { type: "text", text: textoParaEnvio },
                  ...imagens.map((i) => ({ type: "file", mime: i.mime ?? "image/png", url: i.url! })),
                ],
              }),
              signal: AbortSignal.timeout(3_600_000),
            }).then(async (r) => {
              if (!r.ok) {
                postErro = `motor /message respondeu HTTP ${r.status}`;
              } else {
                try {
                  postData = (await r.json()) as MensagemOc;
                } catch { }
              }
              postConcluido = true;
            }).catch((err) => {
              postErro = `motor /message falhou (${err.name === "AbortError" ? "timeout" : "conexão"})`;
              postConcluido = true;
            });

            let inicioTentativa = Date.now();
            const tentativaTimeoutMs = 3_600_000;
            let vazioDesde: number | null = null;
            let tentouFallback = false;

            while (Date.now() - inicioTentativa < tentativaTimeoutMs) {
              await sleep(700);
              if (!emSegundoPlano && (res.destroyed || res.writableEnded)) {
                liberarStreamSecretario(sessaoId, res);
                return;
              }

              if (!postErro) {
                try {
                  const statusRes = await fetch(`${baseUrl}/session/status`, { signal: AbortSignal.timeout(2000) });
                  if (statusRes.ok) {
                    const statusMap = (await statusRes.json()) as Record<string, any>;
                    const sessStatus = statusMap[sessaoId];
                    if (sessStatus?.type === "retry") {
                      const msgRetry = sessStatus.message || sessStatus.action?.message || "limite de cota atingido";
                      postErro = `motor status retry: ${msgRetry}`;
                      await fetch(`${baseUrlSessao}/abort`, { method: "POST" }).catch(() => { });
                    }
                  }
                } catch { }
              }

              if (postErro && !concluida) {
                if (modeloAtual.startsWith("opencode-go/") && postErro.includes("limit")) {
                  try {
                    const acctStore = new EngineAccountStore({ homeDir: home });
                    const proxConta = await acctStore.rotacionarProximaConta("opencode-go");
                    if (proxConta) {
                      await fetch(`${baseUrl}/abort`, { method: "POST" }).catch(() => { });
                      await sleep(500);
                    }
                  } catch { }
                }

                if (tentativasTotais < maxTentativas - 1) {
                  const proximo = modelosFallback[(modeloIdx + 1) % modelosFallback.length]!;
                  console.warn(`[secretario] Modelo ${modeloAtual} falhou (${postErro}). Alternando para ${proximo}...`);
                  sse("status", {
                    tipo: "fallback_modelo",
                    modelo: proximo,
                    aviso: `⚠️ O modelo ${modeloAtual} falhou (${postErro}). Alternando automaticamente para ${proximo}...`,
                  });
                  tentouFallback = true;
                  if ((modeloIdx + 1) % modelosFallback.length === 0) {
                    await sleep(2000);
                  }
                  break;
                } else {
                  sse("erro", { erro: `Falha ao conectar com o modelo (${postErro}). Todos os modelos de contingência foram tentados sem sucesso.`, sessao_id: sessaoId });
                  eventBus.emit("secretario.mensagem", { sessao_id: sessaoId, fase: "erro" });
                  liberarStreamSecretario(sessaoId, res);
                  res.end();
                  return;
                }
              }

              const msgs = await listarMensagens();
              if (msgs) {
                const inicioIdx = baselineId ? msgs.findIndex((m) => m.info?.id === baselineId) : -1;
                const novasMsgs = inicioIdx >= 0 ? msgs.slice(inicioIdx + 1) : msgs;
                const assistentesNovas = novasMsgs.filter((m) => m.info?.role === "assistant");

                const msgComErro = assistentesNovas.find((m) => Boolean((m.info as any)?.error));
                if (msgComErro && !postErro) {
                  const errObj = (msgComErro.info as any).error;
                  const desc = errObj?.data?.message || errObj?.message || errObj?.name || "erro na chamada de API do modelo";
                  postErro = `erro no modelo: ${desc}`;
                  await fetch(`${baseUrlSessao}/abort`, { method: "POST" }).catch(() => { });
                  continue;
                }

                if (assistentesNovas.length > 0) {
                  const passosEmTempoReal = extrairPassosMensagens(assistentesNovas);
                  if (passosEmTempoReal.length > 0) {
                    sse("passos", { passos: passosEmTempoReal });
                  }

                  const { total: novas, itens } = extrairAcoesMensagens(msgs, baselineId);
                  const assinatura = JSON.stringify(itens);
                  if (novas > acoesAvisadas || assinatura !== itensAssinatura) {
                    acoesAvisadas = Math.max(acoesAvisadas, novas);
                    itensAssinatura = assinatura;
                    sse("acao", { acoes: novas, itens });
                  }

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

                  const temToolEmCurso = assistentesNovas.some((m) =>
                    (m.parts ?? []).some((p) => (p.type === "tool" || p.type === "tool-call" || p.type === "tool-invocation") && p.state?.status !== "completed")
                  );
                  const temProgresso = textoAcumulado.length > 0 ||
                    pensamentoAcumulado.length > 0 ||
                    novas > 0 ||
                    passosEmTempoReal.length > 0 ||
                    temToolEmCurso;

                  if (temProgresso) {
                    inicioTentativa = Date.now();
                    vazioDesde = null;
                  } else {
                    if (vazioDesde === null) vazioDesde = Date.now();
                    else if (Date.now() - vazioDesde > 20_000) {
                      postErro = `modelo ${modeloAtual} não gerou resposta após 20s`;
                      await fetch(`${baseUrlSessao}/abort`, { method: "POST" }).catch(() => { });
                    }
                  }
                } else {
                  if (vazioDesde === null) vazioDesde = Date.now();
                  else if (Date.now() - vazioDesde > 20_000) {
                    postErro = `modelo ${modeloAtual} não iniciou após 20s`;
                    await fetch(`${baseUrlSessao}/abort`, { method: "POST" }).catch(() => { });
                  }
                }
              }

              if (postConcluido && !postErro) {
                concluida = true;
                break;
              }
            }

            if (concluida) break;
            modeloIdx++;
            tentativasTotais++;
            if (tentouFallback) {
              continue;
            }
          }

          if (!concluida) {
            sse("erro", { erro: "Todos os modelos candidatos esgotaram timeout ou falharam. Tente novamente em instantes.", sessao_id: sessaoId });
            eventBus.emit("secretario.mensagem", { sessao_id: sessaoId, fase: "erro" });
            liberarStreamSecretario(sessaoId, res);
            res.end();
            return;
          }

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

          const passosFinais = extrairPassosMensagens(novasFinais);
          if (passosFinais.length > 0) {
            sse("passos", { passos: passosFinais });

            try {
              const tc = TelemetryCollector.obter();
              const wsStream = ws;
              const db = registros.corpDb(wsStream.path);
              tc.conectar(db);
              const traceCtx: TraceContext = {
                trace_id: gerarTraceId(),
                sessao_id: sessaoId!,
                agente,
                modelo: modeloAtivoFinal,
                workspace: wsStream.path,
              };
              tc.registrarPassos(traceCtx, passosFinais);
              tc.flush();
            } catch (telErr) {
              console.warn("[telemetria] falha ao registrar passos:", telErr);
            }
          }

          const respostaFinal = enviado || (totalAcoes > 0 ? "Ação concluída." : "Processamento concluído.");
          sse("fim", {
            sessao_id: sessaoId,
            resposta: respostaFinal,
            agente,
            modelo: modeloAtivoFinal,
            motor: motorSolicitado || motorPadrao,
          });
          eventBus.emit("secretario.mensagem", {
            sessao_id: sessaoId,
            fase: "fim",
            agente,
            modelo: modeloAtivoFinal,
          });
          liberarStreamSecretario(sessaoId, res);
          res.end();
          void sincronizarCorp(porta, sessaoId);
          return;
        } catch (erro) {
          if (chaveStreamRegistrada) liberarStreamSecretario(chaveStreamRegistrada, res);
          if (!res.headersSent) {
            if (erro instanceof SecretarioError) {
              enviar(res, erro.status ?? 409, { erro: erro.message });
            } else {
              enviar(res, 502, { erro: `proxy do motor falhou: ${erro instanceof Error ? erro.message : String(erro)}` });
            }
          } else {
            sse("erro", { erro: erro instanceof Error ? erro.message : String(erro) });
            res.end();
          }
        }
      };

      await executarStream();
      return true;
    } catch (erro) {
      if (chaveStreamRegistrada) liberarStreamSecretario(chaveStreamRegistrada, res);
      if (!res.headersSent) {
        if (erro instanceof SecretarioError) {
          enviar(res, erro.status ?? 409, { erro: erro.message });
        } else {
          enviar(res, 502, { erro: `proxy do motor falhou: ${erro instanceof Error ? erro.message : String(erro)}` });
        }
      } else {
        sse("erro", { erro: erro instanceof Error ? erro.message : String(erro) });
        res.end();
      }
      return true;
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // 7. OPENCODE-CONFIG (/opencode-config)
  // ─────────────────────────────────────────────────────────────────────
  if (rota === "/opencode-config" && req.method === "GET") {
    const configPath = join(dirOpencodeHome(home), "opencode.json");
    const bruto = await readFile(configPath, "utf8").catch((erro: NodeJS.ErrnoException) => {
      if (erro?.code === "ENOENT") return null;
      throw erro;
    });
    if (bruto === null) {
      enviar(res, 404, { erro: "configuração do motor ainda não existe (inicie o secretário)", path: configPath });
      return true;
    }
    try {
      enviar(res, 200, { config: JSON.parse(bruto), path: configPath });
    } catch {
      enviar(res, 500, { erro: "config existente não é JSON válido", path: configPath });
    }
    return true;
  }

  if (rota === "/opencode-config" && req.method === "PUT") {
    const configPath = join(dirOpencodeHome(home), "opencode.json");
    let corpo: { config?: unknown };
    try {
      corpo = (await lerCorpo(req, 256 * 1024)) as { config?: unknown };
    } catch {
      enviar(res, 400, { erro: "corpo inválido (JSON malformado ou excede o limite)" });
      return true;
    }
    const config = corpo?.config;
    if (config === null || typeof config !== "object" || Array.isArray(config)) {
      enviar(res, 400, { erro: "campo 'config' deve ser um objeto JSON" });
      return true;
    }
    const obj = { ...(config as Record<string, unknown>) };
    if (typeof obj.$schema !== "string" || !obj.$schema) {
      const schemaAtual = await readFile(configPath, "utf8")
        .then((t) => (JSON.parse(t) as { $schema?: unknown }).$schema)
        .catch(() => undefined);
      obj.$schema = typeof schemaAtual === "string" && schemaAtual ? schemaAtual : "https://opencode.ai/config.json";
    }
    const texto = `${JSON.stringify(obj, null, 2)}\n`;
    if (Buffer.byteLength(texto, "utf8") > 64 * 1024) {
      enviar(res, 400, { erro: "config excede o limite de 64KB" });
      return true;
    }
    try {
      await writeFileAtomic(configPath, texto, { encoding: "utf8" });
    } catch (erro) {
      enviar(res, 500, { erro: `falha ao gravar configuração: ${erro instanceof Error ? erro.message : String(erro)}` });
      return true;
    }
    enviar(res, 200, { ok: true, path: configPath });
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────
  // 8. PROVIDER-KEYS (/provider-keys)
  // ─────────────────────────────────────────────────────────────────────
  const escopoChaves = (): { home: string; ws: string | null } => ({
    home,
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
    const { home: h, ws } = escopoChaves();
    const gPath = authOpencodePath(h);
    const g = lerAuth(gPath);
    const gChaves = chavesDe(g.auth);
    let workspace: { id: string | null; existe: boolean; chaves: ReturnType<typeof chavesDe>; herdadas: ReturnType<typeof chavesDe> } = { id: null, existe: false, chaves: [], herdadas: [] };
    if (ws) {
      const wPath = authOverridesPathWorkspace(h, ws);
      const w = lerAuth(wPath);
      const wChaves = chavesDe(w.auth);
      const herdadas = gChaves.filter((gk) => !wChaves.some((wk) => wk.provider === gk.provider));
      workspace = { id: ws, existe: w.existe, chaves: wChaves, herdadas };
    }
    enviar(res, 200, { global: { existe: g.existe, chaves: gChaves, path: gPath }, workspace });
    return true;
  }

  if (rota === "/provider-keys" && req.method === "PUT") {
    const corpo = (await lerCorpo(req)) as { provider?: string; key?: string; escopo?: string };
    const provider = String(corpo.provider ?? "").trim();
    const key = String(corpo.key ?? "").trim();
    const { home: h, ws } = escopoChaves();
    const escopo = corpo.escopo === "workspace" ? "workspace" : "global";
    if (escopo === "workspace" && !ws) {
      enviar(res, 400, { erro: "escopo workspace exige um workspace ativo" });
      return true;
    }
    if (!PROVEEDOR_RE.test(provider) || !provider) {
      enviar(res, 400, { erro: "provider inválido — use letras/números/hífen (ex.: opencode-go, openrouter, anthropic, openai)" });
      return true;
    }
    if (key.length < 8) {
      enviar(res, 400, { erro: "chave muito curta" });
      return true;
    }
    const authPath = escopo === "workspace"
      ? authOverridesPathWorkspace(h, ws!)
      : authOpencodePath(h);
    const { auth } = lerAuth(authPath);
    try {
      await writeFileAtomic(authPath, `${JSON.stringify(fundirAuth(auth, provider, key), null, 2)}\n`, { encoding: "utf8" });
    } catch (erro) {
      enviar(res, 500, { erro: `falha ao gravar auth.json: ${erro instanceof Error ? erro.message : String(erro)}` });
      return true;
    }
    enviar(res, 200, { ok: true, provider, escopo, preview: mascararChave(key) });
    return true;
  }

  const mChaveDel = /^\/provider-keys\/([^/]+)$/.exec(rota);
  if (mChaveDel && req.method === "DELETE") {
    const provider = decodeURIComponent(mChaveDel[1]!).trim();
    const { home: h, ws } = escopoChaves();
    const escopo = url.searchParams.get("escopo") === "workspace" ? "workspace" : "global";
    if (escopo === "workspace" && !ws) {
      enviar(res, 400, { erro: "escopo workspace exige um workspace ativo" });
      return true;
    }
    const authPath = escopo === "workspace"
      ? authOverridesPathWorkspace(h, ws!)
      : authOpencodePath(h);
    const { auth } = lerAuth(authPath);
    if (!(provider in auth)) {
      enviar(res, 404, { erro: `provedor "${provider}" não configurado neste escopo` });
      return true;
    }
    const { [provider]: _removida, ...resto } = auth;
    try {
      if (Object.keys(resto).length === 0) rmSync(authPath, { force: true });
      else await writeFileAtomic(authPath, `${JSON.stringify(resto, null, 2)}\n`, { encoding: "utf8" });
    } catch (erro) {
      enviar(res, 500, { erro: `falha ao gravar auth.json: ${erro instanceof Error ? erro.message : String(erro)}` });
      return true;
    }
    enviar(res, 200, { ok: true, provider, escopo });
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────
  // 9. HITL APPROVALS ALIAS (/secretario/hitl/:id/:acao)
  // ─────────────────────────────────────────────────────────────────────
  const mHitl = /^\/secretario\/hitl\/([^/]+)\/(aprovar|rejeitar)$/.exec(rota);
  if (mHitl && req.method === "POST") {
    if (!approvals) {
      enviar(res, 500, { erro: "approvals não configurado" });
      return true;
    }
    const ws = await resolverWs(url);
    const id = decodeURIComponent(mHitl[1]!);
    const acao = mHitl[2] === "aprovar" ? "approve" : "reject";
    if (acao === "approve") {
      const p = await approvals.aprovar(ws.path, id);
      enviar(res, 200, { id: p.id, status: p.status });
    } else {
      const corpo = (await lerCorpo(req)) as { motivo?: string };
      const p = await approvals.rejeitar(ws.path, id, corpo.motivo ?? "");
      enviar(res, 200, { id: p.id, status: p.status });
    }
    return true;
  }

  return false;
}