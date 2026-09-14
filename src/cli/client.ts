import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { opencorpHome } from "../utils/paths.js";
import { OpencorpError } from "../core/errors.js";

export class CliHttpError extends OpencorpError {
  constructor(mensagem: string, opts: { exitCode?: number } = {}) {
    super(mensagem, opts);
  }
}

export interface ServerConfig {
  host: string;
  porta: number;
  token: string;
  urlBase: string;
}

export interface ClientOptions {
  homeDir?: string;
  timeoutMs?: number;
}

/**
 * Obtém a configuração de conexão com a API HTTP da OpenCorp.
 * Ordem de resolução para porta:
 * 1. process.env.OPENCORP_PORT
 * 2. ~/.opencorp/api.pid (porta salva ao iniciar 'serve')
 * 3. ~/.opencorp/daemon.pid (se tiver porta)
 * 4. Fallback padrão: 4100
 *
 * Ordem de resolução para token:
 * 1. process.env.OPENCORP_TOKEN
 * 2. ~/.opencorp/api.pid (token salvo ao iniciar 'serve')
 * 3. Fallback: "" (acesso aberto)
 */
export function obterConfiguracaoServidor(opcoes?: { homeDir?: string }): ServerConfig {
  const home = opcoes?.homeDir ?? opencorpHome();

  // 1. Resolução do host
  const host = process.env.OPENCORP_HOST?.trim() || "127.0.0.1";

  // 2. Resolução da porta
  let porta = 4100;
  if (process.env.OPENCORP_PORT && !isNaN(Number(process.env.OPENCORP_PORT))) {
    porta = Number(process.env.OPENCORP_PORT);
  } else {
    const apiPidPath = join(home, ".opencorp", "api.pid");
    let portaEncontrada = false;

    if (existsSync(apiPidPath)) {
      try {
        const info = JSON.parse(readFileSync(apiPidPath, "utf8"));
        if (typeof info?.porta === "number" && info.porta > 0) {
          porta = info.porta;
          portaEncontrada = true;
        }
      } catch {}
    }

    if (!portaEncontrada) {
      const daemonPidPath = join(home, ".opencorp", "daemon.pid");
      if (existsSync(daemonPidPath)) {
        try {
          const info = JSON.parse(readFileSync(daemonPidPath, "utf8"));
          if (typeof info?.porta === "number" && info.porta > 0) {
            porta = info.porta;
          }
        } catch {}
      }
    }
  }

  // 3. Resolução do token
  let token = "";
  if (process.env.OPENCORP_TOKEN !== undefined) {
    token = process.env.OPENCORP_TOKEN.trim();
  } else {
    const apiPidPath = join(home, ".opencorp", "api.pid");
    if (existsSync(apiPidPath)) {
      try {
        const info = JSON.parse(readFileSync(apiPidPath, "utf8"));
        if (typeof info?.token === "string") {
          token = info.token;
        }
      } catch {}
    }
  }

  const urlBase = `http://${host}:${porta}`;

  return {
    host,
    porta,
    token,
    urlBase,
  };
}

/**
 * Realiza chamadas HTTP para o servidor OpenCorp com URL dinâmica,
 * injeção de token Bearer automático e tratamento de erros de conexão offline.
 */
export async function cliFetch(
  caminho: string,
  init?: RequestInit,
  opcoes?: ClientOptions,
): Promise<Response> {
  const config = obterConfiguracaoServidor(opcoes);
  const url = caminho.startsWith("http://") || caminho.startsWith("https://")
    ? caminho
    : `${config.urlBase}${caminho.startsWith("/") ? "" : "/"}${caminho}`;

  const headers = new Headers(init?.headers);
  if (config.token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${config.token}`);
  }

  const timeoutMs = opcoes?.timeoutMs;
  let sinal = init?.signal;
  let timer: NodeJS.Timeout | undefined;

  if (timeoutMs && !sinal) {
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), timeoutMs);
    sinal = controller.signal;
  }

  try {
    const response = await fetch(url, {
      ...init,
      headers,
      signal: sinal,
    });
    return response;
  } catch (erro: any) {
    const isConnRefused =
      erro?.cause?.code === "ECONNREFUSED" ||
      erro?.code === "ECONNREFUSED" ||
      (typeof erro?.message === "string" &&
        (erro.message.toLowerCase().includes("econnrefused") ||
         erro.message.toLowerCase().includes("fetch failed") ||
         erro.message.toLowerCase().includes("connect refused")));

    if (isConnRefused) {
      throw new CliHttpError(
        `Servidor OpenCorp offline ou inacessível em ${config.urlBase}. Inicie o servidor com 'opencorp serve' ou 'opencorp daemon start'.`,
        { exitCode: 1 },
      );
    }
    throw erro;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
