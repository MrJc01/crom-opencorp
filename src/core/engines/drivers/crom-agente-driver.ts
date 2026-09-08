import { existsSync, mkdirSync, copyFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import {
  safeExecFile as execFileAsync,
  type EngineDriver,
  type EngineInstallStatus,
  type EngineHealth,
  type EngineExecutionOptions,
  type EngineTokenUsage,
} from "../types.js";
import { resolveEngineCredentials, checkEngineAuthStatus } from "../credentials-bridge.js";

export class CromAgenteDriver implements EngineDriver {
  id = "crom-agente";
  name = "Crom-Agente Engine (Go)";
  description = "Motor local-first autônomo em Go com ciclo cognitivo ReAct, suporte a MCP, sandbox e daemon IPC";
  category = "hybrid" as const;
  maintainer = "CromIA";
  supportedModelsHint = [
    "openrouter/google/gemini-3.8-flash",
    "openrouter/openai/gpt-4o",
    "openrouter/anthropic/claude-3-5-sonnet",
    "ollama/llama3.2",
  ];

  async isInstalled(homeDir: string): Promise<EngineInstallStatus> {
    const managedBin = join(homeDir, ".opencorp", "bin", "crom-agente");
    if (existsSync(managedBin)) {
      try {
        const { stdout } = await execFileAsync(managedBin, ["version"], { timeout: 3000 });
        return {
          installed: true,
          isManaged: true,
          path: managedBin,
          version: stdout.trim() || "dev (isolado)",
        };
      } catch {
        return { installed: true, isManaged: true, path: managedBin, version: "dev" };
      }
    }

    // Procura em repositórios clonados locais ou PATH
    const candidatos = [
      "/home/j/Documentos/GitHub/crom-agente/crom-agente",
      join(homeDir, "Documentos", "GitHub", "crom-agente", "crom-agente"),
      join(homeDir, ".crom", "bin", "crom-agente"),
      "/usr/local/bin/crom-agente",
    ];

    for (const cand of candidatos) {
      if (existsSync(cand)) {
        try {
          const { stdout } = await execFileAsync(cand, ["version"], { timeout: 3000 });
          return {
            installed: true,
            isManaged: false,
            path: cand,
            version: stdout.trim() || "dev (local)",
          };
        } catch {
          return { installed: true, isManaged: false, path: cand, version: "dev" };
        }
      }
    }

    try {
      const { stdout } = await execFileAsync("which", ["crom-agente"], { timeout: 2000 });
      const p = stdout.trim();
      if (p && existsSync(p)) {
        return { installed: true, isManaged: false, path: p, version: "dev" };
      }
    } catch {}

    return { installed: false, isManaged: false, path: null, version: null };
  }

  async install(
    homeDir: string,
    onProgress?: (msg: string) => void,
  ): Promise<{ success: boolean; path: string; version: string; log: string }> {
    const binDir = join(homeDir, ".opencorp", "bin");
    mkdirSync(binDir, { recursive: true });
    const target = join(binDir, "crom-agente");

    onProgress?.("Verificando binário existente do crom-agente...");
    const candidatos = [
      "/home/j/Documentos/GitHub/crom-agente/crom-agente",
      join(homeDir, "Documentos", "GitHub", "crom-agente", "crom-agente"),
    ];

    for (const c of candidatos) {
      if (existsSync(c)) {
        onProgress?.(`Copiando binário de ${c} para ${target}...`);
        copyFileSync(c, target);
        chmodSync(target, 0o755);
        const { stdout } = await execFileAsync(target, ["version"], { timeout: 3000 }).catch(() => ({ stdout: "dev" }));
        const ver = stdout.trim();
        return {
          success: true,
          path: target,
          version: ver,
          log: `Binário crom-agente instalado com sucesso em ${target} (${ver})`,
        };
      }
    }

    // Se o binário não estiver compilado, compila usando Go se o repo estiver presente
    const repoSrc = "/home/j/Documentos/GitHub/crom-agente";
    if (existsSync(repoSrc)) {
      onProgress?.("Compilando crom-agente a partir do código fonte Go...");
      try {
        await execFileAsync("go", ["build", "-o", target, "./cmd/crom-agente"], {
          cwd: repoSrc,
          timeout: 120000,
        });
        if (existsSync(target)) {
          chmodSync(target, 0o755);
          const { stdout } = await execFileAsync(target, ["version"], { timeout: 3000 }).catch(() => ({ stdout: "dev" }));
          return {
            success: true,
            path: target,
            version: stdout.trim(),
            log: `crom-agente compilado e instalado com sucesso em ${target}`,
          };
        }
      } catch (err: any) {
        throw new Error(`Falha ao compilar crom-agente com Go: ${err?.message || err}`);
      }
    }

    throw new Error(
      "Não foi possível localizar o binário ou código-fonte do crom-agente para instalação.",
    );
  }

  async checkHealth(homeDir: string): Promise<EngineHealth> {
    const status = await this.isInstalled(homeDir);
    if (!status.installed || !status.path) {
      return { healthy: false, statusText: "crom-agente não encontrado no sistema ou em ~/.opencorp/bin" };
    }

    const t0 = Date.now();
    const binPath = status.path;
    const auth = checkEngineAuthStatus(this.id, homeDir);

    try {
      const { stdout } = await execFileAsync(binPath, ["healthcheck"], { timeout: 5000 }).catch(() =>
        execFileAsync(binPath, ["version"], { timeout: 3000 }),
      );
      const outText = typeof stdout === "string" ? stdout.trim() : String(stdout).trim();
      const statusMsg = auth.authenticated
        ? `OK — Versão ${status.version} (${status.isManaged ? "Isolado" : "Local"}) · ${auth.method}`
        : `Requer Chave: ${auth.details}`;

      return {
        healthy: auth.authenticated,
        statusText: statusMsg,
        latencyMs: Date.now() - t0,
        details: { path: binPath, isManaged: status.isManaged, auth, output: outText },
      };
    } catch (err: any) {
      return {
        healthy: false,
        statusText: `Falha ao executar diagnóstico de ${status.path}: ${err?.message || err}`,
        latencyMs: Date.now() - t0,
      };
    }
  }

  async prepareExecution(opts: EngineExecutionOptions): Promise<{
    binary: string;
    args: string[];
    env: Record<string, string>;
    cwd: string;
  }> {
    const status = await this.isInstalled(opts.homeDir);
    const bin = status.path || "crom-agente";

    const args: string[] = [
      "run",
      opts.prompt,
      "--workspace",
      opts.workspacePath,
      "--permission-mode",
      "total_access",
      "--disable-interaction",
    ];

    if (opts.sessionId) {
      args.push("--session", opts.sessionId);
    }

    if (opts.model) {
      // Separa provider/model se aplicável
      if (opts.model.startsWith("openrouter/")) {
        args.push("--provider", "openrouter");
        args.push("--model", opts.model.replace(/^openrouter\//, ""));
      } else if (opts.model.includes("/")) {
        const parts = opts.model.split("/");
        args.push("--provider", parts[0]!);
        args.push("--model", parts.slice(1).join("/"));
      } else {
        args.push("--model", opts.model);
      }
    }

    const creds = resolveEngineCredentials(opts.homeDir);
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ...creds,
      CROM_WORKSPACE: opts.workspacePath,
      CROM_STORAGE_DIR: join(opts.workspacePath, ".crom"),
      ...(opts.envOverrides || {}),
    };

    return {
      binary: bin,
      args,
      env,
      cwd: opts.workspacePath,
    };
  }

  async fetchLiveTokens(
    homeDir: string,
    accountCredentials?: { tokenOuChave?: string; authType?: string }
  ): Promise<EngineTokenUsage> {
    const creds = resolveEngineCredentials(homeDir);
    const key = accountCredentials?.tokenOuChave || creds.OPENROUTER_API_KEY;
    const now = new Date().toISOString();

    if (key) {
      try {
        const [authRes, credRes] = await Promise.all([
          fetch("https://openrouter.ai/api/v1/auth/key", {
            headers: { Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(4000),
          }).catch(() => null),
          fetch("https://openrouter.ai/api/v1/credits", {
            headers: { Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(4000),
          }).catch(() => null),
        ]);

        if (authRes && authRes.ok) {
          const authData = (await authRes.json()) as any;
          const credData = credRes && credRes.ok ? ((await credRes.json()) as any) : null;
          const keyData = authData?.data || {};
          const credits = credData?.data || {};

          const totalCredits = credits.total_credits != null ? Number(credits.total_credits) : null;
          const totalUsage = credits.total_usage != null ? Number(credits.total_usage) : (keyData.usage != null ? Number(keyData.usage) : 0);
          const limit = keyData.limit != null ? Number(keyData.limit) : null;
          const saldo = totalCredits != null ? Math.max(0, totalCredits - totalUsage) : (limit != null ? Math.max(0, limit - totalUsage) : undefined);

          const isFree = keyData.is_free_tier || false;
          const isExhausted = saldo !== undefined && saldo <= 0 && !isFree;

          return {
            motorId: this.id,
            motorName: this.name,
            source: "api_live",
            provedor: "OpenRouter (Universal)",
            tokensDisponiveis: saldo !== undefined ? Math.round(saldo * 100_000) : (isFree ? "ilimitado" : "indeterminado"),
            tokensUsados: Math.round(totalUsage * 100_000),
            saldoUsd: saldo !== undefined ? Number(saldo.toFixed(4)) : undefined,
            consumoUsd: Number(totalUsage.toFixed(4)),
            limiteUsd: limit != null ? Number(limit.toFixed(2)) : (totalCredits != null ? Number(totalCredits.toFixed(2)) : undefined),
            rateLimitRpm: keyData.rate_limit?.requests && keyData.rate_limit.requests > 0 ? keyData.rate_limit.requests * 6 : 60,
            statusCota: isExhausted ? "esgotado" : (saldo !== undefined && saldo < 1.0 ? "alerta_80" : "normal"),
            mensagem: `Crom-Agente: Saldo restante ${saldo !== undefined ? `$${saldo.toFixed(2)}` : "Ativo"} · Loop ReAct pronto`,
            consultadoEm: now,
            detalhes: {
              label: keyData.label,
              is_free_tier: isFree,
            },
          };
        }
      } catch {}
    }

    const openAiKey = accountCredentials?.tokenOuChave || creds.OPENAI_API_KEY;
    if (openAiKey) {
      try {
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${openAiKey}` },
          signal: AbortSignal.timeout(3500),
        });
        const tokRemaining = res.headers.get("x-ratelimit-remaining-tokens");
        const reqRemaining = res.headers.get("x-ratelimit-remaining-requests");

        return {
          motorId: this.id,
          motorName: this.name,
          source: "api_live",
          provedor: "OpenAI Direto",
          tokensDisponiveis: tokRemaining ? Number(tokRemaining) : "ilimitado",
          requestsRestantes: reqRemaining ? Number(reqRemaining) : undefined,
          statusCota: res.ok ? "normal" : "alerta_80",
          mensagem: `OpenAI API: ${tokRemaining ? `${Number(tokRemaining).toLocaleString()} tokens restantes` : "Conexão ativa"}`,
          consultadoEm: now,
        };
      } catch {}
    }

    return {
      motorId: this.id,
      motorName: this.name,
      source: "unconfigured",
      provedor: "Nenhum",
      tokensDisponiveis: 0,
      statusCota: "esgotado",
      mensagem: "Nenhuma credencial de LLM configurada para o Crom-Agente",
      consultadoEm: now,
    };
  }
}
