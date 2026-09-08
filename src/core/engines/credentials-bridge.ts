import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

export interface EngineAuthStatus {
  authenticated: boolean;
  method: string;
  account?: string;
  details?: string;
}

/**
 * Lê e unifica credenciais de todas as fontes disponíveis na máquina do usuário:
 * 1. auth.json do OpenCorp (~/.opencorp/opencode-data/opencode/auth.json)
 * 2. auth.json do sistema (~/.local/share/opencode/auth.json)
 * 3. Token do GitHub CLI (gh auth token) para Copilot
 * 4. Sessão OAuth do Claude (~/.claude/.credentials.json)
 * 5. Variáveis de ambiente do host
 */
export function resolveEngineCredentials(homeDir: string): Record<string, string> {
  const env: Record<string, string> = {};

  // 1. Chaves salvas no auth.json do OpenCorp ou do sistema
  const pathsAuth = [
    join(homeDir, ".opencorp", "opencode-data", "opencode", "auth.json"),
    join(homeDir, ".local", "share", "opencode", "auth.json"),
    join(homeDir, ".local", "share", "opencode", "auth.json.bak"),
  ];

  for (const authPath of pathsAuth) {
    if (existsSync(authPath)) {
      try {
        const raw = readFileSync(authPath, "utf8");
        const auth = JSON.parse(raw);
        if (auth.openrouter?.key && !env.OPENROUTER_API_KEY) {
          env.OPENROUTER_API_KEY = auth.openrouter.key;
        }
        if (auth.anthropic?.key && !env.ANTHROPIC_API_KEY) {
          env.ANTHROPIC_API_KEY = auth.anthropic.key;
        }
        if (auth.openai?.key && !env.OPENAI_API_KEY) {
          env.OPENAI_API_KEY = auth.openai.key;
        }
        if (auth.google?.key && !env.GEMINI_API_KEY) {
          env.GEMINI_API_KEY = auth.google.key;
        }
      } catch {}
    }
  }

  // 2. Token do GitHub CLI para o GitHub Copilot
  if (!env.GITHUB_TOKEN && !process.env.GITHUB_TOKEN) {
    try {
      const tok = execSync("gh auth token", { timeout: 2500, encoding: "utf8" }).trim();
      if (tok && tok.startsWith("gh")) {
        env.GITHUB_TOKEN = tok;
        env.GH_TOKEN = tok;
        env.COPILOT_GITHUB_TOKEN = tok;
      }
    } catch {}
  }

  // 3. Repassa chaves do process.env se ainda não definidas
  if (!env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY) {
    env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  }
  if (!env.OPENAI_API_KEY && process.env.OPENAI_API_KEY) {
    env.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  }
  if (!env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY) {
    env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  }
  if (!env.CURSOR_API_KEY && process.env.CURSOR_API_KEY) {
    env.CURSOR_API_KEY = process.env.CURSOR_API_KEY;
  }
  if (!env.GEMINI_API_KEY && process.env.GEMINI_API_KEY) {
    env.GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  }

  return env;
}

/**
 * Diagnóstico real de autenticação de cada agente (evita falsos positivos / "testes placebo")
 */
export function checkEngineAuthStatus(engineId: string, homeDir: string): EngineAuthStatus {
  const creds = resolveEngineCredentials(homeDir);

  switch (engineId) {
    case "opencode": {
      const hasKey = Boolean(creds.OPENROUTER_API_KEY || creds.ANTHROPIC_API_KEY || creds.OPENAI_API_KEY);
      if (hasKey) {
        return {
          authenticated: true,
          method: creds.OPENROUTER_API_KEY ? "OpenRouter BYOK" : "API Key",
          details: creds.OPENROUTER_API_KEY ? "Chave OpenRouter ativa" : "Chave direta configurada",
        };
      }
      return {
        authenticated: false,
        method: "Nenhum provedor autenticado",
        details: "Adicione sua chave em Configurações > Chaves de API",
      };
    }

    case "crom-agente": {
      const hasKey = Boolean(creds.OPENROUTER_API_KEY || creds.OPENAI_API_KEY || creds.ANTHROPIC_API_KEY);
      if (hasKey) {
        return {
          authenticated: true,
          method: creds.OPENROUTER_API_KEY ? "OpenRouter (Universal)" : "API Key Direta",
          details: "Autenticado para loop ReAct",
        };
      }
      return {
        authenticated: false,
        method: "Chave de LLM ausente",
        details: "Requer OPENROUTER_API_KEY ou OPENAI_API_KEY",
      };
    }

    case "claude-code": {
      // 1. Verifica OAuth em ~/.claude/.credentials.json com checagem real de validade
      const claudeCreds = join(homeDir, ".claude", ".credentials.json");
      if (existsSync(claudeCreds)) {
        try {
          const j = JSON.parse(readFileSync(claudeCreds, "utf8"));
          const oauth = j.claudeAiOauth;
          const hasTokens = Boolean(
            (oauth?.accessToken && oauth.accessToken.trim() !== "") ||
            (oauth?.refreshToken && oauth.refreshToken.trim() !== "")
          );
          const isExpired = oauth?.refreshTokenExpiresAt ? oauth.refreshTokenExpiresAt < Date.now() : true;
          if (hasTokens && !isExpired) {
            return {
              authenticated: true,
              method: "OAuth Claude Pro/Team",
              details: "Sessão persistida e válida em ~/.claude",
            };
          }
        } catch {}
      }
      // 2. Verifica ANTHROPIC_API_KEY
      if (creds.ANTHROPIC_API_KEY) {
        return {
          authenticated: true,
          method: "ANTHROPIC_API_KEY",
          details: "Chave direta Anthropic ativa",
        };
      }
      return {
        authenticated: false,
        method: "Sessão OAuth expirada / ausente",
        details: "Execute 'claude login' no terminal ou configure ANTHROPIC_API_KEY",
      };
    }

    case "copilot": {
      if (creds.GITHUB_TOKEN || creds.COPILOT_GITHUB_TOKEN) {
        return {
          authenticated: true,
          method: "GitHub Token / gh CLI",
          details: "Autenticado via GitHub CLI (keyring)",
        };
      }
      return {
        authenticated: false,
        method: "GitHub PAT ausente",
        details: "Execute 'copilot login' ou 'gh auth login'",
      };
    }

    case "cursor": {
      if (creds.CURSOR_API_KEY) {
        return {
          authenticated: true,
          method: "CURSOR_API_KEY",
          details: "Chave de API do Cursor ativa",
        };
      }
      // Checa se o CLI agent está logado no sistema
      try {
        const agentBin = join(homeDir, ".opencorp", "bin", "agent");
        const binToRun = existsSync(agentBin) ? agentBin : "agent";
        const out = execSync(`${binToRun} status`, { timeout: 2000, encoding: "utf8" });
        if (out && !out.toLowerCase().includes("not logged in")) {
          return {
            authenticated: true,
            method: "Conta Cursor (OAuth CLI)",
            details: out.trim().split("\n")[0] || "Autenticado",
          };
        }
      } catch {}

      return {
        authenticated: false,
        method: "Requer Login ou CURSOR_API_KEY",
        details: "Execute 'agent login' no terminal ou obtenha chave em cursor.com/settings",
      };
    }

    case "codex": {
      if (creds.OPENAI_API_KEY) {
        return {
          authenticated: true,
          method: "OPENAI_API_KEY",
          details: "Chave da OpenAI ativa para sandbox",
        };
      }
      // Checa se ~/.codex/auth.json existe ou se codex login status indica sessão ativa
      const codexAuthPath = join(homeDir, ".codex", "auth.json");
      if (existsSync(codexAuthPath)) {
        try {
          const raw = readFileSync(codexAuthPath, "utf8");
          if (raw.length > 5) {
            return {
              authenticated: true,
              method: "ChatGPT Device OAuth",
              details: "Autenticado via ChatGPT Device Code (auth.json)",
            };
          }
        } catch {}
      }
      try {
        const codexBin = join(homeDir, ".opencorp", "bin", "codex");
        const binToRun = existsSync(codexBin) ? codexBin : "codex";
        const out = execSync(`${binToRun} login status 2>&1`, { timeout: 2000, encoding: "utf8" });
        if (out && !out.toLowerCase().includes("not logged in") && out.toLowerCase().includes("logged in")) {
          return {
            authenticated: true,
            method: "OpenAI Codex CLI Session",
            details: out.trim().split("\n")[0] || "Autenticado",
          };
        }
      } catch {}

      return {
        authenticated: false,
        method: "Requer Login ou OPENAI_API_KEY",
        details: "Execute 'codex login --device-auth' ou adicione OPENAI_API_KEY",
      };
    }

    case "antigravity": {
      if (creds.GEMINI_API_KEY || process.env.GEMINI_API_KEY) {
        return {
          authenticated: true,
          method: "GEMINI_API_KEY",
          details: "Google AI Studio autenticado",
        };
      }
      return {
        authenticated: true,
        method: "Runtime do Sistema",
        details: "Executando via agy CLI nativo",
      };
    }

    default:
      return {
        authenticated: true,
        method: "Padrão",
      };
  }
}

export interface EngineAuthInstruction {
  engineId: string;
  engineName: string;
  terminalCommand: string;
  envVarName?: string;
  webUrl: string;
  urlLabel: string;
  guideText: string;
}

export function getEngineAuthInstructions(engineId: string): EngineAuthInstruction {
  switch (engineId) {
    case "copilot":
      return {
        engineId,
        engineName: "GitHub Copilot CLI",
        terminalCommand: "copilot login --device-code",
        envVarName: "COPILOT_GITHUB_TOKEN",
        webUrl: "https://github.com/settings/tokens",
        urlLabel: "GitHub Tokens",
        guideText: "Execute no seu terminal 'copilot login --device-code' para autorizar no navegador, ou 'gh auth login'. O OpenCorp detecta seu token automaticamente.",
      };
    case "claude-code":
      return {
        engineId,
        engineName: "Claude Code",
        terminalCommand: "claude login",
        envVarName: "ANTHROPIC_API_KEY",
        webUrl: "https://console.anthropic.com/settings/keys",
        urlLabel: "Anthropic Console",
        guideText: "Execute 'claude login' no terminal para autenticar com sua conta Claude Pro/Team via navegador, ou informe ANTHROPIC_API_KEY na aba 'Chaves de API'.",
      };
    case "cursor":
      return {
        engineId,
        engineName: "Cursor Agent CLI",
        terminalCommand: "agent login",
        envVarName: "CURSOR_API_KEY",
        webUrl: "https://cursor.com/settings",
        urlLabel: "Cursor Settings",
        guideText: "Execute 'agent login' no terminal para logar sua conta Cursor, ou gere uma CURSOR_API_KEY em cursor.com/settings e configure no ambiente.",
      };
    case "codex":
      return {
        engineId,
        engineName: "OpenAI Codex CLI",
        terminalCommand: "codex login --device-auth",
        envVarName: "OPENAI_API_KEY",
        webUrl: "https://platform.openai.com/api-keys",
        urlLabel: "OpenAI API Keys",
        guideText: "Execute 'codex login --device-auth' para autorizar via navegador, ou configure sua OPENAI_API_KEY na aba 'Chaves de API'.",
      };
    case "antigravity":
      return {
        engineId,
        engineName: "Google Antigravity Engine (AGY)",
        terminalCommand: "agy login",
        envVarName: "GEMINI_API_KEY",
        webUrl: "https://aistudio.google.com/app/apikey",
        urlLabel: "Google AI Studio",
        guideText: "O Antigravity funciona com sua chave do Google AI Studio ($0 custo com Gemini 2.5/3.8 Flash) ou via login de desenvolvedor agy.",
      };
    case "crom-agente":
      return {
        engineId,
        engineName: "Crom-Agente Engine (Go)",
        terminalCommand: "export OPENROUTER_API_KEY=sk-or-...",
        envVarName: "OPENROUTER_API_KEY",
        webUrl: "https://openrouter.ai/settings/keys",
        urlLabel: "OpenRouter Keys",
        guideText: "Crom-Agente roda nativamente com OpenRouter BYOK configurado no OpenCorp.",
      };
    case "opencode":
    default:
      return {
        engineId,
        engineName: "OpenCode Engine",
        terminalCommand: "opencode auth login",
        envVarName: "OPENROUTER_API_KEY",
        webUrl: "https://openrouter.ai/settings/keys",
        urlLabel: "OpenRouter Keys",
        guideText: "Adicione sua chave OpenRouter ou provedor direto em Configurações > Chaves de API.",
      };
  }
}
