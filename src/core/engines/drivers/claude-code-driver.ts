import { existsSync, mkdirSync, readFileSync } from "node:fs";
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

export class ClaudeCodeDriver implements EngineDriver {
  id = "claude-code";
  name = "Claude Code";
  description = "Agente autônomo de código da Anthropic com suporte a tools, bash e raciocínio profundo";
  category = "cli" as const;
  maintainer = "Anthropic";
  supportedModelsHint = [
    "claude-3-7-sonnet",
    "claude-3-5-sonnet",
    "claude-3-5-haiku",
  ];

  async isInstalled(homeDir: string): Promise<EngineInstallStatus> {
    const managedBin = join(homeDir, ".opencorp", "bin", "claude");
    if (existsSync(managedBin)) {
      try {
        const { stdout } = await execFileAsync(managedBin, ["--version"], { timeout: 3000 });
        return {
          installed: true,
          isManaged: true,
          path: managedBin,
          version: stdout.trim() || "v1.x (isolado)",
        };
      } catch {
        return { installed: true, isManaged: true, path: managedBin, version: "v1.x" };
      }
    }

    const candidatos = [
      "/usr/local/bin/claude",
      "/usr/bin/claude",
      join(homeDir, ".npm-global", "bin", "claude"),
      join(homeDir, ".nvm", "versions", "node", process.version, "bin", "claude"),
    ];

    for (const cand of candidatos) {
      if (existsSync(cand)) {
        try {
          const { stdout } = await execFileAsync(cand, ["--version"], { timeout: 3000 });
          return {
            installed: true,
            isManaged: false,
            path: cand,
            version: stdout.trim(),
          };
        } catch {
          return { installed: true, isManaged: false, path: cand, version: "detectado" };
        }
      }
    }

    try {
      const { stdout } = await execFileAsync("which", ["claude"], { timeout: 2000 });
      const p = stdout.trim();
      if (p && existsSync(p)) {
        return { installed: true, isManaged: false, path: p, version: "detectado" };
      }
    } catch {}

    return { installed: false, isManaged: false, path: null, version: null };
  }

  async install(
    homeDir: string,
    onProgress?: (msg: string) => void,
  ): Promise<{ success: boolean; path: string; version: string; log: string }> {
    const prefixDir = join(homeDir, ".opencorp");
    const binDir = join(prefixDir, "bin");
    mkdirSync(binDir, { recursive: true });

    onProgress?.("Instalando @anthropic-ai/claude-code no diretório isolado ~/.opencorp...");
    try {
      const { stdout } = await execFileAsync(
        "npm",
        ["install", "-g", "--prefix", prefixDir, "@anthropic-ai/claude-code"],
        { timeout: 120000 },
      );

      const target = join(binDir, "claude");
      if (existsSync(target)) {
        const { stdout: verOut } = await execFileAsync(target, ["--version"], { timeout: 3000 }).catch(() => ({
          stdout: "1.x",
        }));
        return {
          success: true,
          path: target,
          version: verOut.trim(),
          log: `Claude Code instalado com sucesso em ${target}\n${stdout}`,
        };
      }
      throw new Error(`Binário não encontrado em ${target} após instalação`);
    } catch (err: any) {
      throw new Error(`Falha ao instalar Claude Code via npm: ${err?.message || err}`);
    }
  }

  async checkHealth(homeDir: string): Promise<EngineHealth> {
    const status = await this.isInstalled(homeDir);
    if (!status.installed || !status.path) {
      return { healthy: false, statusText: "Claude Code não instalado no sistema ou em ~/.opencorp/bin" };
    }

    const t0 = Date.now();
    const auth = checkEngineAuthStatus(this.id, homeDir);

    try {
      const { stdout } = await execFileAsync(status.path, ["--version"], { timeout: 3000 });
      const statusMsg = auth.authenticated
        ? `OK — Versão ${stdout.trim() || status.version} (${status.isManaged ? "Isolado" : "Sistema"}) · ${auth.method}`
        : `Requer Autenticação: ${auth.details}`;

      return {
        healthy: auth.authenticated,
        statusText: statusMsg,
        latencyMs: Date.now() - t0,
        details: { path: status.path, isManaged: status.isManaged, auth },
      };
    } catch (err: any) {
      return {
        healthy: false,
        statusText: `Falha ao executar ${status.path}: ${err?.message || err}`,
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
    const bin = status.path || "claude";

    // Execução headless usando o modo print (-p) do Claude Code
    const args: string[] = ["-p", opts.prompt];

    const creds = resolveEngineCredentials(opts.homeDir);
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ...creds,
      ANTHROPIC_DISABLE_TELEMETRY: "1",
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
    const apiKey = accountCredentials?.tokenOuChave || creds.ANTHROPIC_API_KEY;
    const now = new Date().toISOString();

    if (apiKey) {
      try {
        const res = await fetch("https://api.anthropic.com/v1/models", {
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          signal: AbortSignal.timeout(4000),
        });

        const reqRemaining = res.headers.get("anthropic-ratelimit-requests-remaining");
        const tokRemaining = res.headers.get("anthropic-ratelimit-tokens-remaining");
        const reqLimit = res.headers.get("anthropic-ratelimit-requests-limit");
        const tokLimit = res.headers.get("anthropic-ratelimit-tokens-limit");
        const resetHeader = res.headers.get("anthropic-ratelimit-requests-reset");

        const tokensRestantes = tokRemaining ? Number(tokRemaining) : "ilimitado";
        const isExhausted = tokRemaining ? Number(tokRemaining) <= 0 : !res.ok;

        return {
          motorId: this.id,
          motorName: this.name,
          source: "api_live",
          provedor: "Anthropic API Direta",
          tokensDisponiveis: tokensRestantes,
          limiteTokens: tokLimit ? Number(tokLimit) : undefined,
          requestsRestantes: reqRemaining ? Number(reqRemaining) : undefined,
          requestsLimite: reqLimit ? Number(reqLimit) : undefined,
          rateLimitRpm: reqLimit ? Number(reqLimit) : 50,
          resetaEm: resetHeader || undefined,
          statusCota: isExhausted ? "esgotado" : "normal",
          mensagem: `Claude Code (API Key): ${tokRemaining ? `${Number(tokRemaining).toLocaleString()} tokens restantes` : "Autenticado via ANTHROPIC_API_KEY"}`,
          consultadoEm: now,
          detalhes: {
            status_http: res.status,
            rate_limit_reset: resetHeader,
          },
        };
      } catch {}
    }

    // Checa sessão OAuth Claude Pro/Team
    const claudeCreds = join(homeDir, ".claude", ".credentials.json");
    if (existsSync(claudeCreds)) {
      try {
        const raw = readFileSync(claudeCreds, "utf8");
        const j = JSON.parse(raw);
        const oauth = j.claudeAiOauth;
        const hasToken = Boolean(oauth?.accessToken || oauth?.refreshToken);
        const expiresAt = oauth?.refreshTokenExpiresAt ? Number(oauth.refreshTokenExpiresAt) : 0;
        const isExpired = expiresAt > 0 && expiresAt < Date.now();

        if (hasToken && !isExpired) {
          const daysLeft = Math.round((expiresAt - Date.now()) / 86400000);
          return {
            motorId: this.id,
            motorName: this.name,
            source: "oauth_session",
            provedor: "Claude Pro/Team (OAuth CLI)",
            tokensDisponiveis: "ilimitado",
            statusCota: "normal",
            mensagem: `Claude Code: Assinatura Pro/Team ativa via OAuth (~${daysLeft} dias restantes)`,
            resetaEm: expiresAt > 0 ? new Date(expiresAt).toISOString() : undefined,
            consultadoEm: now,
            detalhes: {
              oauth_expires_at: expiresAt,
              has_access_token: Boolean(oauth?.accessToken),
            },
          };
        }
      } catch {}
    }

    return {
      motorId: this.id,
      motorName: this.name,
      source: "unconfigured",
      provedor: "Anthropic",
      tokensDisponiveis: 0,
      statusCota: "esgotado",
      mensagem: "Claude Code sem autenticação. Execute 'claude login' ou configure ANTHROPIC_API_KEY",
      consultadoEm: now,
    };
  }
}
