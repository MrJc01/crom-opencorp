import { existsSync, readFileSync, createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { opencorpHome } from "../../utils/paths.js";
import { writeFileAtomic, mkdirRecursive } from "../../utils/fs-safe.js";
import { dirOpencodeHome, dirOpencodeData } from "../../core/opencode-server.js";
import {
  engineRegistry,
  getEngineAuthInstructions,
  checkEngineAuthStatus,
  EngineAccountStore,
  WebLoginOrchestrator,
} from "../../core/engines/index.js";
import { listarProvedoresStatus, testarModeloDirect, completarChatDirect } from "../../core/llm-client.js";
import type { SecretOrigem } from "../../core/secrets-store.js";
import type { RouteContext } from "./types.js";

export async function detectarOpencodeInfo(homeDir: string) {
  let pathEncontrado: string | null = null;
  let versao: string | null = null;

  const rPath = join(homeDir, ".opencorp", "runner.json");
  if (existsSync(rPath)) {
    try {
      const r = JSON.parse(readFileSync(rPath, "utf8"));
      if (r.binary_path) pathEncontrado = String(r.binary_path).trim();
    } catch {}
  }

  const locais = [
    pathEncontrado,
    "/home/j/.opencode/bin/opencode",
    join(process.env.HOME || "", ".opencode", "bin", "opencode"),
    "/usr/local/bin/opencode",
    "/usr/bin/opencode",
  ].filter(Boolean) as string[];

  for (const loc of locais) {
    if (existsSync(loc)) {
      pathEncontrado = loc;
      break;
    }
  }

  const binParaRodar = pathEncontrado || "opencode";
  try {
    const { stdout } = await promisify(execFile)(binParaRodar, ["--version"], { timeout: 3000 });
    versao = stdout.trim();
  } catch {
    versao = null;
  }

  return {
    instalado: Boolean(versao || pathEncontrado),
    path: pathEncontrado || "opencode",
    versao: versao || "1.18.x (detectado)",
    home_isolado: dirOpencodeHome(homeDir),
    data_dir: dirOpencodeData(homeDir),
  };
}

export async function handleConfigRoutes(ctx: RouteContext): Promise<boolean> {
  const {
    req,
    res,
    url,
    rota,
    resolverWs,
    lerCorpo,
    enviar,
    settings,
    secretsStore,
    apps,
    engineAccounts,
    opencodeServer,
    workspaces,
    homeDir,
  } = ctx;

  const home = homeDir ?? opencorpHome();

  // ─────────────────────────────────────────────────────────────────────
  // 1. SETTINGS & CONFIG
  // ─────────────────────────────────────────────────────────────────────
  if (settings) {
    // GET /settings ou /config
    if ((rota === "/settings" || rota === "/config") && req.method === "GET") {
      if (url.searchParams.get("escopo") === "global") {
        const entradas = await settings.list({ scope: "global" });
        enviar(res, 200, entradas);
        return true;
      }
      const ws = await resolverWs(url);
      const entradas = await settings.list({ workspaceDir: ws.path });
      enviar(res, 200, entradas);
      return true;
    }

    // GET /settings/modelos ou /modelos
    if ((rota === "/settings/modelos" || rota === "/modelos") && req.method === "GET") {
      const ws = await resolverWs(url);
      const wsConfigPath = join(ws.path, ".opencorp", "config.json");
      let wsConfig: any = {};
      if (existsSync(wsConfigPath)) {
        try {
          wsConfig = JSON.parse(readFileSync(wsConfigPath, "utf8"));
        } catch {}
      }

      const policyFile = join(ws.path, ".opencorp", "security_policy.json");
      let secPolicy: any = {};
      if (existsSync(policyFile)) {
        try {
          secPolicy = JSON.parse(readFileSync(policyFile, "utf8"));
        } catch {}
      }

      const defaultModel =
        wsConfig.modelos?.padrao ||
        wsConfig.default_model ||
        "openrouter/google/gemini-2.5-flash";

      const rotation =
        Array.isArray(wsConfig.modelos?.rotacao) && wsConfig.modelos.rotacao.length > 0
          ? wsConfig.modelos.rotacao
          : [
              defaultModel,
              "opencode/nemotron-3-ultra-free",
              "openrouter/liquid/lfm-2.5-2.6b:free",
              "openrouter/openrouter/free",
            ];

      enviar(res, 200, {
        default_model: defaultModel,
        rotation,
        global_full_access: secPolicy.global_full_access === true || secPolicy.level === "permissive",
      });
      return true;
    }

    // PUT /settings/modelos ou /modelos
    if ((rota === "/settings/modelos" || rota === "/modelos") && req.method === "PUT") {
      const ws = await resolverWs(url);
      const corpo = (await lerCorpo(req)) as {
        default_model?: string;
        rotation?: string[];
        global_full_access?: boolean;
        escopo?: string;
      };

      const escopoGlobal = url.searchParams.get("escopo") === "global" || corpo.escopo === "global";
      const defaultModelLimpo = corpo.default_model?.trim();
      const rotacaoLimpa = Array.isArray(corpo.rotation)
        ? corpo.rotation.map((s) => String(s).trim()).filter(Boolean)
        : undefined;

      if (escopoGlobal) {
        // Escopo global: grava em ~/.opencorp/settings.json
        if (defaultModelLimpo) {
          await settings.set("default_model", defaultModelLimpo, { scope: "global" });
        }
        const sPath = join(home, ".opencorp", "settings.json");
        try {
          let cur: any = {};
          if (existsSync(sPath)) cur = JSON.parse(readFileSync(sPath, "utf8"));
          cur.modelos = cur.modelos || {};
          if (defaultModelLimpo) {
            cur.default_model = defaultModelLimpo;
            cur.modelos.padrao = defaultModelLimpo;
          }
          if (rotacaoLimpa) {
            cur.tests = cur.tests || {};
            cur.tests.rotation = rotacaoLimpa;
            cur.modelos.rotacao = rotacaoLimpa;
          }
          await writeFileAtomic(sPath, `${JSON.stringify(cur, null, 2)}\n`);
        } catch {}
      } else {
        // Escopo Workspace Soberano: grava em .opencorp/config.json do workspace ativo
        const wsOcDir = join(ws.path, ".opencorp");
        await mkdirRecursive(wsOcDir);
        const wsConfigPath = join(wsOcDir, "config.json");
        let wsConfig: any = {};
        if (existsSync(wsConfigPath)) {
          try {
            wsConfig = JSON.parse(readFileSync(wsConfigPath, "utf8"));
          } catch {}
        }
        wsConfig.modelos = wsConfig.modelos || {};
        if (defaultModelLimpo) {
          wsConfig.default_model = defaultModelLimpo;
          wsConfig.modelos.padrao = defaultModelLimpo;
        }
        if (rotacaoLimpa) {
          wsConfig.modelos.rotacao = rotacaoLimpa;
        }
        await writeFileAtomic(wsConfigPath, `${JSON.stringify(wsConfig, null, 2)}\n`);
      }

      if (corpo.global_full_access !== undefined) {
        const policyDir = join(ws.path, ".opencorp");
        await mkdirRecursive(policyDir);
        const policyFile = join(policyDir, "security_policy.json");
        let atual: any = {};
        if (existsSync(policyFile)) {
          try {
            atual = JSON.parse(readFileSync(policyFile, "utf8"));
          } catch {}
        }
        atual.global_full_access = Boolean(corpo.global_full_access);
        if (atual.global_full_access) {
          atual.level = "permissive";
        }
        await writeFileAtomic(policyFile, `${JSON.stringify(atual, null, 2)}\n`);
      }
      enviar(res, 200, { ok: true });
      return true;
    }


    // GET /settings/security ou /settings/seguranca
    if ((rota === "/settings/security" || rota === "/settings/seguranca") && req.method === "GET") {
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
      return true;
    }

    // PUT /settings/security ou /settings/seguranca
    if ((rota === "/settings/security" || rota === "/settings/seguranca") && req.method === "PUT") {
      const ws = await resolverWs(url);
      const corpo = (await lerCorpo(req)) as Record<string, unknown>;
      const policyDir = join(ws.path, ".opencorp");
      await mkdirRecursive(policyDir);
      const policyFile = join(policyDir, "security_policy.json");
      let atual: Record<string, unknown> = {};
      if (existsSync(policyFile)) {
        try {
          atual = JSON.parse(readFileSync(policyFile, "utf8"));
        } catch {}
      }
      const merged = { ...atual, ...corpo };
      await writeFileAtomic(policyFile, `${JSON.stringify(merged, null, 2)}\n`);
      enviar(res, 200, { ok: true, policy: merged });
      return true;
    }

    // GET /settings/runner
    if (rota === "/settings/runner" && req.method === "GET") {
      const rPath = join(home, ".opencorp", "runner.json");
      let runner = { engine: "opencode", binary_path: "opencode", timeout_min: 20 };
      if (existsSync(rPath)) {
        try {
          runner = JSON.parse(readFileSync(rPath, "utf8"));
        } catch {}
      }
      enviar(res, 200, runner);
      return true;
    }

    // PUT / PATCH /settings ou /settings/runner ou /config
    if ((rota === "/settings/runner" || rota === "/settings" || rota === "/config") && (req.method === "PUT" || req.method === "PATCH")) {
      const corpo = (await lerCorpo(req)) as { chave?: string; valor?: unknown; scope?: string; runner?: unknown };
      if (corpo.runner && typeof corpo.runner === "object") {
        const rPath = join(home, ".opencorp", "runner.json");
        await writeFileAtomic(rPath, `${JSON.stringify(corpo.runner, null, 2)}\n`);
        enviar(res, 200, { ok: true, runner: corpo.runner });
        return true;
      }
      if (rota === "/settings/runner") {
        const rPath = join(home, ".opencorp", "runner.json");
        await writeFileAtomic(rPath, `${JSON.stringify(corpo, null, 2)}\n`);
        enviar(res, 200, { ok: true, runner: corpo });
        return true;
      }
      const chave = String(corpo.chave ?? "").trim();
      const valorRaw = String(corpo.valor ?? "");
      if (chave === "secretary.model" && valorRaw.trim() === "") {
        const r = await settings.reset(chave, {
          scope: corpo.scope === "workspace" ? "workspace" : "global",
          workspaceDir: (await resolverWs(url)).path,
        });
        if (opencodeServer) {
          await opencodeServer.atualizarModeloSecretario();
        }
        enviar(res, 200, r);
        return true;
      }
      const r = await settings.set(chave, String(corpo.valor), {
        scope: corpo.scope === "workspace" ? "workspace" : "global",
        workspaceDir: (await resolverWs(url)).path,
      });
      if (chave === "secretary.model") {
        try {
          await settings.set(chave, String(corpo.valor), { scope: "global" }).catch(() => null);
          if (opencodeServer) {
            await opencodeServer.atualizarModeloSecretario(valorRaw);
          }
        } catch (err) {
          console.warn("[settings] aviso ao sincronizar modelo do secretário:", err);
        }
      }
      enviar(res, 200, r);
      return true;
    }

    // GET /settings/:chave ou /config/:chave
    const mSetting = /^\/(?:settings|config)\/([^/]+)$/.exec(rota);
    if (mSetting && req.method === "GET") {
      const chave = decodeURIComponent(mSetting[1]!);
      if (chave !== "modelos" && chave !== "security" && chave !== "runner") {
        const ws = await resolverWs(url);
        const r = await settings.get(chave, { workspaceDir: ws.path });
        enviar(res, 200, r);
        return true;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // 2. ENGINES & MOTORES & ENGINE ACCOUNTS
  // ─────────────────────────────────────────────────────────────────────
  const accts = engineAccounts ?? new EngineAccountStore({ homeDir: home });

  // GET /engines ou /motores ou /motores/status ou /api/motores
  if (
    (rota === "/engines" ||
      rota === "/motores" ||
      rota === "/motores/status" ||
      rota === "/api/motores/status" ||
      rota === "/api/motores") &&
    req.method === "GET"
  ) {
    const ws = await resolverWs(url).catch(() => ({ id: "default", path: home }));
    const ocInfo = await detectarOpencodeInfo(home);
    const provedores = listarProvedoresStatus(home);

    const rPath = join(home, ".opencorp", "runner.json");
    let runnerAtual = { engine: "opencode", binary_path: "opencode", timeout_min: 20 };
    if (existsSync(rPath)) {
      try {
        runnerAtual = JSON.parse(readFileSync(rPath, "utf8"));
      } catch {}
    }

    const rawMotores = await engineRegistry.listSummaries(home, true);
    const motores = rawMotores.map((m) => {
      const authStatus = checkEngineAuthStatus(m.id, home);
      return {
        ...m,
        ativo: m.id === (runnerAtual.engine || "opencode"),
        authStatus,
      };
    });

    const pidSchedulerPath = join(home, ".opencorp", "scheduler.pid");
    let schedulerVivo = false;
    let schedulerPid: number | null = null;
    if (existsSync(pidSchedulerPath)) {
      try {
        const sp = JSON.parse(readFileSync(pidSchedulerPath, "utf8"));
        if (sp.pid) {
          process.kill(sp.pid, 0);
          schedulerVivo = true;
          schedulerPid = sp.pid;
        }
      } catch {}
    }

    const todasContas = await accts.listar();
    const limitesMotores = await accts.obterLimitesMotores();
    const tokensAoVivo: Record<string, any> = await engineRegistry.fetchAllLiveTokens(home).catch(() => ({}));
    const motoresComDetalhes = motores.map((m) => {
      const contasMotor = todasContas.filter((c) => c.motorId === m.id);
      const contaAtiva = contasMotor.find((c) => c.ativa) || contasMotor[0] || null;
      return {
        ...m,
        contas: contasMotor,
        contaAtiva,
        tokens: tokensAoVivo[m.id] || null,
        limits: limitesMotores[m.id] || {
          timeout_min: 20,
          max_turns: 40,
          rate_limit_rpm: 30,
          daily_cost_usd: 10.0,
          status_cota: "normal",
          fallback_action: "rotate",
        },
      };
    });

    const secStatus = opencodeServer
      ? await opencodeServer.status().catch(() => ({ rodando: false, porta: null, pid: null }))
      : { rodando: false, porta: null, pid: null };

    enviar(res, 200, {
      ok: true,
      runner: runnerAtual,
      motor_ativo: runnerAtual.engine || "opencode",
      opencode: {
        ...ocInfo,
        data_workspace: join(home, ".opencorp", "opencode-data", ws.id),
      },
      motores: motoresComDetalhes,
      contas: todasContas,
      limits: limitesMotores,
      tokens: tokensAoVivo,
      provedores,
      daemons: {
        scheduler: { ativo: schedulerVivo, pid: schedulerPid },
        secretario: { ativo: secStatus.rodando, pid: secStatus.pid, porta: secStatus.porta },
      },
      harnesses_suportados: motores.map((m) => ({
        id: m.id,
        nome: m.name,
        disponivel: m.installed,
        padrao: m.id === (runnerAtual.engine || "opencode"),
        isManaged: m.isManaged,
        version: m.version,
      })),
    });
    return true;
  }

  // GET /api/motores/tokens
  if (rota === "/api/motores/tokens" && req.method === "GET") {
    const tokens = await engineRegistry.fetchAllLiveTokens(home);
    enviar(res, 200, { ok: true, tokens });
    return true;
  }

  // GET /api/motores/:id/tokens
  const mTokensMotor = /^\/api\/motores\/([^/]+)\/tokens$/.exec(rota);
  if (mTokensMotor && req.method === "GET") {
    const motorId = decodeURIComponent(mTokensMotor[1]!);
    const driver = engineRegistry.get(motorId);
    if (!driver) {
      enviar(res, 404, { erro: `Motor "${motorId}" não encontrado` });
      return true;
    }
    const tokens = await driver.fetchLiveTokens(home);
    enviar(res, 200, { ok: true, motorId, tokens });
    return true;
  }

  // GET /api/motores/:id/contas/:contaId/tokens
  const mTokensConta = /^\/api\/motores\/([^/]+)\/contas\/([^/]+)\/tokens$/.exec(rota);
  if (mTokensConta && req.method === "GET") {
    const motorId = decodeURIComponent(mTokensConta[1]!);
    const contaId = decodeURIComponent(mTokensConta[2]!);
    const conta = await accts.obter(contaId);
    const driver = engineRegistry.get(motorId);
    if (!driver) {
      enviar(res, 404, { erro: `Motor "${motorId}" não encontrado` });
      return true;
    }
    const tokens = await driver.fetchLiveTokens(
      home,
      conta ? { tokenOuChave: conta.tokenOuChave, authType: conta.authType } : undefined,
    );
    enviar(res, 200, { ok: true, motorId, contaId, tokens });
    return true;
  }

  // GET /engine-accounts ou /api/motores/contas
  if ((rota === "/engine-accounts" || rota === "/api/motores/contas") && req.method === "GET") {
    const lista = await accts.listar();
    enviar(res, 200, { ok: true, contas: lista });
    return true;
  }

  // POST /engine-accounts/rotacionar ou /api/motores/rotacionar
  if ((rota === "/engine-accounts/rotacionar" || rota === "/api/motores/rotacionar") && req.method === "POST") {
    const corpo = (await lerCorpo(req).catch(() => ({}))) as { motorId?: string; contaId?: string };
    if (corpo.motorId && corpo.contaId) {
      await accts.ativarConta(corpo.motorId, corpo.contaId);
      enviar(res, 200, { ok: true, motorId: corpo.motorId, contaId: corpo.contaId, ativa: true });
      return true;
    }
    enviar(res, 200, { ok: true });
    return true;
  }

  // GET e PUT /api/motores/limites
  if ((rota === "/api/motores/limites" || rota === "/engines/limites") && req.method === "GET") {
    const limites = await accts.obterLimitesMotores();
    enviar(res, 200, { ok: true, limites });
    return true;
  }
  if ((rota === "/api/motores/limites" || rota === "/engines/limites") && req.method === "PUT") {
    const corpo = (await lerCorpo(req)) as Record<string, any>;
    await accts.salvarLimitesMotores(corpo);
    const atualizados = await accts.obterLimitesMotores();
    enviar(res, 200, { ok: true, limites: atualizados });
    return true;
  }

  // GET e POST /api/motores/:id/contas
  const mContasMotor = /^\/api\/motores\/([^/]+)\/contas$/.exec(rota);
  if (mContasMotor) {
    const motorId = decodeURIComponent(mContasMotor[1]!);
    if (req.method === "GET") {
      const contas = await accts.listar(motorId);
      enviar(res, 200, { ok: true, motorId, contas });
      return true;
    }
    if (req.method === "POST") {
      const corpo = (await lerCorpo(req)) as {
        nome: string;
        authType?: "token" | "apiKey" | "deviceOAuth";
        tokenOuChave?: string;
        limits?: any;
      };
      if (!corpo.nome || corpo.nome.trim().length === 0) {
        enviar(res, 400, { erro: "Nome da conta é obrigatório" });
        return true;
      }
      const novaConta = await accts.adicionarConta(motorId, corpo);
      enviar(res, 201, { ok: true, motorId, conta: novaConta });
      return true;
    }
  }

  // POST /api/motores/:id/contas/:contaId/ativar
  const mAtivarConta = /^\/api\/motores\/([^/]+)\/contas\/([^/]+)\/ativar$/.exec(rota);
  if (mAtivarConta && req.method === "POST") {
    const motorId = decodeURIComponent(mAtivarConta[1]!);
    const contaId = decodeURIComponent(mAtivarConta[2]!);
    await accts.ativarConta(motorId, contaId);
    enviar(res, 200, { ok: true, motorId, contaId, ativa: true });
    return true;
  }

  // PUT /api/motores/:id/contas/:contaId/limites
  const mLimitesConta = /^\/api\/motores\/([^/]+)\/contas\/([^/]+)\/limites$/.exec(rota);
  if (mLimitesConta && req.method === "PUT") {
    const contaId = decodeURIComponent(mLimitesConta[2]!);
    const corpo = (await lerCorpo(req)) as any;
    const atualizada = await accts.atualizarLimitesConta(contaId, corpo);
    enviar(res, 200, { ok: true, conta: atualizada });
    return true;
  }

  // DELETE /api/motores/:id/contas/:contaId
  const mDeleteConta = /^\/api\/motores\/([^/]+)\/contas\/([^/]+)$/.exec(rota);
  if (mDeleteConta && req.method === "DELETE") {
    const motorId = decodeURIComponent(mDeleteConta[1]!);
    const contaId = decodeURIComponent(mDeleteConta[2]!);
    await accts.desconectarConta(motorId, contaId);
    enviar(res, 200, { ok: true, motorId, contaId, desconectada: true });
    return true;
  }

  // POST /api/motores/:id/install
  const mInstallMotor = /^\/api\/motores\/([^/]+)\/install$/.exec(rota);
  if (mInstallMotor && req.method === "POST") {
    const motorId = decodeURIComponent(mInstallMotor[1]!);
    const driver = engineRegistry.get(motorId);
    if (!driver) {
      enviar(res, 404, { erro: `Motor "${motorId}" não encontrado` });
      return true;
    }
    try {
      const result = await driver.install(home);
      enviar(res, 200, { ok: true, motorId, ...result });
    } catch (err: any) {
      enviar(res, 500, { erro: err?.message || String(err) });
    }
    return true;
  }

  // POST /api/motores/:id/conectar
  const mConectarMotor = /^\/api\/motores\/([^/]+)\/conectar$/.exec(rota);
  if (mConectarMotor && req.method === "POST") {
    const motorId = decodeURIComponent(mConectarMotor[1]!);
    const driver = engineRegistry.get(motorId);
    if (!driver) {
      enviar(res, 404, { erro: `Motor "${motorId}" não encontrado` });
      return true;
    }
    const status = await driver.isInstalled(home);
    if (!status.installed) {
      enviar(res, 400, { erro: `Motor "${motorId}" não está instalado. Instale-o primeiro clicando em 'Instalar'.` });
      return true;
    }

    const health = await driver.checkHealth(home);
    const forcar = url.searchParams.get("forcar") === "true";
    if (!health.healthy && !forcar) {
      enviar(res, 400, {
        ok: false,
        requiresAuth: true,
        erro: `Motor "${motorId}" não pode ser ativado: ${health.statusText}`,
        statusText: health.statusText,
        health,
        authInstructions: getEngineAuthInstructions(motorId),
      });
      return true;
    }

    const rPath = join(home, ".opencorp", "runner.json");
    const novoRunner = {
      engine: motorId,
      binary_path: status.path || motorId,
      timeout_min: 20,
    };
    await writeFileAtomic(rPath, `${JSON.stringify(novoRunner, null, 2)}\n`);
    enviar(res, 200, { ok: true, motorId, runner: novoRunner, health });
    return true;
  }

  // GET /api/motores/:id/auth-instructions
  const mAuthMotor = /^\/api\/motores\/([^/]+)\/auth-instructions$/.exec(rota);
  if (mAuthMotor && req.method === "GET") {
    const motorId = decodeURIComponent(mAuthMotor[1]!);
    const instructions = getEngineAuthInstructions(motorId);
    enviar(res, 200, { ok: true, motorId, instructions });
    return true;
  }

  // POST /api/motores/:id/desconectar
  const mDesconectarMotor = /^\/api\/motores\/([^/]+)\/desconectar$/.exec(rota);
  if (mDesconectarMotor && req.method === "POST") {
    const motorId = decodeURIComponent(mDesconectarMotor[1]!);
    const rPath = join(home, ".opencorp", "runner.json");
    const novoRunner = {
      engine: "opencode",
      binary_path: "opencode",
      timeout_min: 20,
    };
    await writeFileAtomic(rPath, `${JSON.stringify(novoRunner, null, 2)}\n`);
    enviar(res, 200, { ok: true, motorId, desconectado: true, runner: novoRunner });
    return true;
  }

  // POST /api/motores/:id/test
  const mTestMotor = /^\/api\/motores\/([^/]+)\/test$/.exec(rota);
  if (mTestMotor && req.method === "POST") {
    const motorId = decodeURIComponent(mTestMotor[1]!);
    const driver = engineRegistry.get(motorId);
    if (!driver) {
      enviar(res, 404, { erro: `Motor "${motorId}" não encontrado` });
      return true;
    }
    const health = await driver.checkHealth(home);
    enviar(res, 200, { ok: true, motorId, health });
    return true;
  }

  // POST /api/motores/:id/login-web
  const mLoginWeb = /^\/api\/motores\/([^/]+)\/login-web$/.exec(rota);
  if (mLoginWeb && req.method === "POST") {
    const motorId = decodeURIComponent(mLoginWeb[1]!);
    try {
      const session = await WebLoginOrchestrator.iniciarLogin(motorId, home);
      enviar(res, 200, { ok: true, session });
    } catch (err: any) {
      enviar(res, 500, { erro: err.message || "Erro ao iniciar login web" });
    }
    return true;
  }

  // GET /api/motores/:id/login-web/:sessionId
  const mStatusLoginWeb = /^\/api\/motores\/([^/]+)\/login-web\/([^/]+)$/.exec(rota);
  if (mStatusLoginWeb && req.method === "GET") {
    const sessionId = decodeURIComponent(mStatusLoginWeb[2]!);
    try {
      const session = await WebLoginOrchestrator.verificarStatus(sessionId, home);
      enviar(res, 200, { ok: true, session });
    } catch (err: any) {
      enviar(res, 404, { erro: err.message });
    }
    return true;
  }

  // POST /api/motores/:id/login-web/:sessionId/cancel
  const mCancelLoginWeb = /^\/api\/motores\/([^/]+)\/login-web\/([^/]+)\/cancel$/.exec(rota);
  if (mCancelLoginWeb && req.method === "POST") {
    const sessionId = decodeURIComponent(mCancelLoginWeb[2]!);
    await WebLoginOrchestrator.cancelarLogin(sessionId);
    enviar(res, 200, { ok: true, cancelado: true });
    return true;
  }

  // POST /api/motores/:id/login-web/:sessionId/code
  const mCodeLoginWeb = /^\/api\/motores\/([^/]+)\/login-web\/([^/]+)\/code$/.exec(rota);
  if (mCodeLoginWeb && req.method === "POST") {
    const sessionId = decodeURIComponent(mCodeLoginWeb[2]!);
    try {
      const corpo = (await lerCorpo(req)) as { code?: string };
      const enviado = await WebLoginOrchestrator.enviarCodigo(sessionId, corpo?.code || "");
      enviar(res, 200, { ok: enviado });
    } catch (err: any) {
      enviar(res, 400, { erro: err.message });
    }
    return true;
  }

  // POST /api/motores/:id/login-auto
  const mLoginAuto = /^\/api\/motores\/([^/]+)\/login-auto$/.exec(rota);
  if (mLoginAuto && req.method === "POST") {
    const motorId = decodeURIComponent(mLoginAuto[1]!);
    try {
      const result = await WebLoginOrchestrator.conectarAutomatico(motorId, home);
      enviar(res, 200, { ...result });
    } catch (err: any) {
      enviar(res, 400, { erro: err.message });
    }
    return true;
  }

  // POST /llm/test ou /api/llm/test
  if ((rota === "/llm/test" || rota === "/api/llm/test") && req.method === "POST") {
    const corpo = (await lerCorpo(req)) as { model?: string };
    const model = String(corpo.model ?? "").trim() || "openrouter/google/gemini-3.8-flash";
    const resTeste = await testarModeloDirect(model, home);
    enviar(res, resTeste.ok ? 200 : 500, resTeste);
    return true;
  }

  // POST /llm/complete ou /api/llm/complete
  if ((rota === "/llm/complete" || rota === "/api/llm/complete") && req.method === "POST") {
    const corpo = (await lerCorpo(req)) as {
      model?: string;
      messages?: Array<{ role: "system" | "user" | "assistant"; content: string }>;
      temperature?: number;
      maxTokens?: number;
    };
    if (!corpo.model || !Array.isArray(corpo.messages)) {
      enviar(res, 400, { erro: "campos 'model' e 'messages' são obrigatórios" });
      return true;
    }
    try {
      const resp = await completarChatDirect({
        model: corpo.model,
        messages: corpo.messages,
        temperature: corpo.temperature,
        maxTokens: corpo.maxTokens,
        homeDir: home,
      });
      enviar(res, 200, resp);
    } catch (err: any) {
      enviar(res, 500, { erro: err.message || String(err) });
    }
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────
  // 3. SECRETS
  // ─────────────────────────────────────────────────────────────────────
  if (secretsStore) {
    // GET /secrets
    if (rota === "/secrets" && req.method === "GET") {
      let wsPath: string | undefined;
      try {
        const ws = await resolverWs(url);
        wsPath = ws?.path;
      } catch {}
      const escopo = url.searchParams.get("escopo") as SecretOrigem | null;
      const itens =
        escopo === "workspace" || escopo === "global"
          ? secretsStore.listarEscopo(escopo, wsPath)
          : secretsStore.listarMerge(wsPath);
      enviar(res, 200, itens);
      return true;
    }

    // POST /secrets
    if (rota === "/secrets" && req.method === "POST") {
      const corpo = (await lerCorpo(req)) as { nome?: string; valor?: string; escopo?: SecretOrigem };
      if (!corpo.nome || typeof corpo.valor !== "string") {
        enviar(res, 400, { erro: "nome e valor obrigatórios" });
        return true;
      }
      let wsPath: string | undefined;
      try {
        const ws = await resolverWs(url);
        wsPath = ws?.path;
      } catch {}
      const escopo: SecretOrigem =
        corpo.escopo === "workspace" || corpo.escopo === "global"
          ? corpo.escopo
          : ((url.searchParams.get("escopo") as SecretOrigem) || (wsPath ? "workspace" : "global"));
      const erroPerfil = await secretsStore.definir(corpo.nome, corpo.valor, escopo, wsPath);
      if (erroPerfil) {
        enviar(res, 422, { erro: erroPerfil });
        return true;
      }
      enviar(res, 201, { ok: true, nome: corpo.nome, escopo });
      return true;
    }

    // PUT ou DELETE /secrets/:nome
    const mSecret = /^\/secrets\/([^/]+)$/.exec(rota);
    if (mSecret) {
      const nomeSecret = decodeURIComponent(mSecret[1]!);
      let wsPath: string | undefined;
      try {
        const ws = await resolverWs(url);
        wsPath = ws?.path;
      } catch {}

      if (req.method === "PUT") {
        const corpo = (await lerCorpo(req)) as { valor?: string; escopo?: SecretOrigem };
        if (typeof corpo.valor !== "string" || corpo.valor.length === 0) {
          enviar(res, 400, { erro: "valor obrigatório" });
          return true;
        }
        const escopo: SecretOrigem =
          corpo.escopo === "workspace" || corpo.escopo === "global"
            ? corpo.escopo
            : ((url.searchParams.get("escopo") as SecretOrigem) || (wsPath ? "workspace" : "global"));
        const erroPerfil = await secretsStore.definir(nomeSecret, corpo.valor, escopo, wsPath);
        if (erroPerfil) {
          enviar(res, 422, { erro: erroPerfil });
          return true;
        }
        enviar(res, 200, { ok: true, escopo });
        return true;
      }

      if (req.method === "DELETE") {
        const escopoQuery = url.searchParams.get("escopo") as SecretOrigem | null;
        const escopo: SecretOrigem =
          escopoQuery === "workspace" || escopoQuery === "global"
            ? escopoQuery
            : (wsPath ? "workspace" : "global");
        await secretsStore.remover(nomeSecret, escopo, wsPath);
        enviar(res, 200, { ok: true, escopo });
        return true;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4. MINI-APPS & APP-PERFIS
  // ─────────────────────────────────────────────────────────────────────
  if (apps) {
    // GET /apps ou /api/apps ou /app-perfis
    if ((rota === "/apps" || rota === "/api/apps" || rota === "/app-perfis") && req.method === "GET") {
      const ws = await resolverWs(url);
      enviar(res, 200, apps.listar(ws.path, ws.id));
      return true;
    }

    // POST /api/apps/novo
    if (rota === "/api/apps/novo" && req.method === "POST") {
      const ws = await resolverWs(url);
      const corpo = (await lerCorpo(req)) as { id?: string; titulo?: string; descricao?: string; htmlInicial?: string };
      if (!corpo.id || !corpo.titulo) {
        enviar(res, 400, { erro: "id e titulo são obrigatórios para criar um mini-app" });
        return true;
      }
      const appCriado = await apps.criarMiniApp(ws.path, corpo.id, corpo.titulo, corpo.descricao, corpo.htmlInicial);
      enviar(res, 201, appCriado);
      return true;
    }

    // GET/HEAD /api/apps/:id/view (serviço de arquivos estáticos)
    const mAppView = /^\/api\/apps\/([^/]+)\/view(?:\/(.*))?$/.exec(rota);
    if (mAppView && (req.method === "GET" || req.method === "HEAD")) {
      let ws = await resolverWs(url);
      const appId = decodeURIComponent(mAppView[1]!);
      const subPath = mAppView[2] ? decodeURIComponent(mAppView[2]) : "index.html";
      let appDir = join(ws.path, "apps", appId);
      let filePath = join(appDir, subPath);

      if (!existsSync(filePath)) {
        const todos = await workspaces.listar();
        for (const outroWs of todos) {
          const outroAppDir = join(outroWs.path, "apps", appId);
          const outroPath = join(outroAppDir, subPath);
          if (outroPath.startsWith(outroAppDir) && existsSync(outroPath)) {
            appDir = outroAppDir;
            filePath = outroPath;
            break;
          }
        }
      }

      if (!filePath.startsWith(appDir)) {
        enviar(res, 403, { erro: "Acesso fora da pasta do app proibido" });
        return true;
      }

      if (!existsSync(filePath)) {
        enviar(res, 404, { erro: `Arquivo "${subPath}" do mini-app "${appId}" não encontrado` });
        return true;
      }

      const ext = extname(filePath).toLowerCase();
      const mimes: Record<string, string> = {
        ".html": "text/html; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".ico": "image/x-icon",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".srt": "text/plain; charset=utf-8",
        ".txt": "text/plain; charset=utf-8",
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
      };
      const mime = mimes[ext] || "application/octet-stream";

      const fileStat = await stat(filePath);
      const total = fileStat.size;
      const rangeHeader = req.headers.range;
      const querDownload = url.searchParams.has("download");

      const headers: Record<string, string | number> = {
        "Content-Type": mime,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*",
      };

      if (querDownload) {
        const nomeArquivo = basename(filePath);
        headers["Content-Disposition"] = `attachment; filename="${encodeURIComponent(nomeArquivo)}"`;
      }

      if (rangeHeader && !querDownload) {
        const partes = rangeHeader.replace(/bytes=/, "").split("-");
        const inicio = parseInt(partes[0]!, 10);
        const fim = partes[1] ? parseInt(partes[1]!, 10) : total - 1;
        if (isNaN(inicio) || inicio >= total || fim >= total) {
          res.writeHead(416, { "Content-Range": `bytes */${total}` });
          res.end();
          return true;
        }
        const chunkSize = fim - inicio + 1;
        headers["Content-Range"] = `bytes ${inicio}-${fim}/${total}`;
        headers["Content-Length"] = chunkSize;
        res.writeHead(206, headers);
        if (req.method === "HEAD") {
          res.end();
          return true;
        }
        createReadStream(filePath, { start: inicio, end: fim }).pipe(res);
        return true;
      }

      headers["Content-Length"] = total;
      res.writeHead(200, headers);
      if (req.method === "HEAD") {
        res.end();
        return true;
      }
      createReadStream(filePath).pipe(res);
      return true;
    }

    // GET /apps/:id/spec
    const mAppSpec = /^\/apps\/([^/]+)\/spec$/.exec(rota);
    if (mAppSpec && req.method === "GET") {
      const ws = await resolverWs(url);
      enviar(res, 200, apps.obter(ws.path, decodeURIComponent(mAppSpec[1]!)));
      return true;
    }

    // POST /apps ou /app-perfis ou POST /apps/:id
    const mAppPost = /^\/apps(?:\/([^/]+))?$/.exec(rota);
    if (mAppPost && req.method === "POST") {
      const ws = await resolverWs(url);
      const corpo = (await lerCorpo(req)) as Record<string, unknown>;
      const spec = apps.validarTexto(JSON.stringify(corpo), "POST /apps");
      await apps.salvar(ws.path, spec);
      enviar(res, 201, spec);
      return true;
    }

    // DELETE /apps/:id ou /api/apps/:id
    const mAppDel = /^(?:\/api)?\/apps\/([^/]+)$/.exec(rota);
    if (mAppDel && req.method === "DELETE") {
      const ws = await resolverWs(url);
      const appId = decodeURIComponent(mAppDel[1]!);
      const miniAppDir = join(ws.path, "apps", appId);
      let excluido = false;
      if (existsSync(miniAppDir)) {
        const { rm } = await import("node:fs/promises");
        await rm(miniAppDir, { recursive: true, force: true }).catch(() => undefined);
        excluido = true;
      }
      try {
        await apps.excluir(ws.path, appId);
        excluido = true;
      } catch (err) {
        if (!excluido) throw err;
      }
      enviar(res, 200, { ok: true, id: appId });
      return true;
    }
  }

  return false;
}
