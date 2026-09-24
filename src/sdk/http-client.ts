/**
 * @module sdk/http-client — Cliente HTTP tipado do OpenCorp SDK
 *
 * Wrapper sobre `fetch` que intercepta respostas RFC 7807 e as
 * converte automaticamente em `ProblemDetailsError`.
 *
 * @see docs/PADRONIZACAO_ARQUITETURAL_OPENCORP.md (Passo 3)
 */

import { ProblemDetailsError, OpenCorpNetworkError } from "./errors.js";

// ── Tipos ───────────────────────────────────────────────────────────

export interface HttpClientOptions {
  /** URL base do servidor OpenCorp (padrão: `OPENCORP_API_URL` ou `http://127.0.0.1:4100`). */
  baseUrl?: string;
  /** Token de autenticação Bearer. */
  token?: string;
  /** Workspace ID injetado via header `x-opencorp-workspace`. */
  workspaceId?: string;
  /** Timeout em milissegundos (padrão: 30000). */
  timeoutMs?: number;
}

export interface RequestOptions {
  /** Headers adicionais para esta requisição. */
  headers?: Record<string, string>;
  /** AbortSignal para cancelamento externo. */
  signal?: AbortSignal;
  /** Query params para append na URL. */
  query?: Record<string, string | number | boolean | undefined>;
}

// ── Helpers ─────────────────────────────────────────────────────────

function construirQueryString(query?: Record<string, string | number | boolean | undefined>): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function isConexaoRecusada(erro: unknown): boolean {
  if (!(erro instanceof Error)) return false;
  const msg = erro.message.toLowerCase();
  const cause = (erro as { cause?: { code?: string } }).cause;
  return (
    cause?.code === "ECONNREFUSED" ||
    msg.includes("econnrefused") ||
    msg.includes("fetch failed") ||
    msg.includes("connect refused")
  );
}

// ── Classe HttpClient ───────────────────────────────────────────────

/**
 * Cliente HTTP de baixo nível do OpenCorp SDK.
 *
 * Responsabilidades:
 * - Injeção automática de headers (Auth, Content-Type, Workspace)
 * - Timeout com AbortSignal
 * - Interceptação de respostas RFC 7807 → ProblemDetailsError
 * - Tratamento de falhas de rede → OpenCorpNetworkError
 */
export class HttpClient {
  readonly baseUrl: string;
  private readonly token: string;
  private readonly workspaceId: string | undefined;
  private readonly timeoutMs: number;

  constructor(opts: HttpClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.OPENCORP_API_URL ?? "http://127.0.0.1:4100")
      .replace(/\/+$/, ""); // remove trailing slash
    this.token = opts.token ?? process.env.OPENCORP_TOKEN ?? "";
    this.workspaceId = opts.workspaceId;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  // ── Métodos públicos ────────────────────────────────────────────

  async get<T>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request<T>("GET", path, undefined, opts);
  }

  async post<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return this.request<T>("POST", path, body, opts);
  }

  async put<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return this.request<T>("PUT", path, body, opts);
  }

  async delete<T>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request<T>("DELETE", path, undefined, opts);
  }

  // ── Core request ────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    opts?: RequestOptions,
  ): Promise<T> {
    const qs = construirQueryString(opts?.query);
    const url = `${this.baseUrl}${path.startsWith("/") ? "" : "/"}${path}${qs}`;

    // Headers
    const headers: Record<string, string> = {
      Accept: "application/json, application/problem+json",
      ...opts?.headers,
    };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    if (this.workspaceId) {
      headers["x-opencorp-workspace"] = this.workspaceId;
    }

    // Signal (timeout)
    let signal = opts?.signal;
    let abortController: AbortController | undefined;
    let timer: NodeJS.Timeout | undefined;

    if (!signal) {
      abortController = new AbortController();
      signal = abortController.signal;
      timer = setTimeout(() => abortController!.abort(), this.timeoutMs);
      if (typeof timer.unref === "function") {
        timer.unref();
      }
    }

    try {
      // Fetch
      let res: Response;
      try {
        res = await fetch(url, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal,
        });
      } catch (erro) {
        if (isConexaoRecusada(erro)) {
          throw new OpenCorpNetworkError(this.baseUrl, erro instanceof Error ? erro : undefined);
        }
        throw erro;
      }

      // Interceptação RFC 7807
      const contentType = res.headers.get("content-type") ?? "";
      const isProblem = contentType.includes("application/problem+json");

      if (isProblem || !res.ok) {
        let corpo: unknown;
        try {
          if (typeof res.json === "function") {
            corpo = await res.json();
          } else if (typeof res.text === "function") {
            const raw = await res.text();
            corpo = raw ? JSON.parse(raw) : null;
          }
        } catch {
          throw new ProblemDetailsError({
            status: res.status,
            type: `https://opencorp.dev/errors/http-${res.status}`,
            title: res.statusText || `HTTP ${res.status}`,
            detail: `Resposta inesperada do servidor (status ${res.status}).`,
          });
        }

        // Se veio como RFC 7807
        if (isProblem && typeof corpo === "object" && corpo !== null) {
          const p = corpo as Record<string, unknown>;
          throw new ProblemDetailsError({
            status: typeof p.status === "number" ? p.status : res.status,
            type: typeof p.type === "string" ? p.type : `https://opencorp.dev/errors/http-${res.status}`,
            title: typeof p.title === "string" ? p.title : res.statusText,
            detail: typeof p.detail === "string" ? p.detail : undefined,
            instance: typeof p.instance === "string" ? p.instance : undefined,
            invalidParams: Array.isArray(p.invalidParams)
              ? (p.invalidParams as { name: string; reason: string }[])
              : undefined,
          });
        }

        // Fallback: JSON legado { erro: string }
        if (typeof corpo === "object" && corpo !== null) {
          const legado = corpo as Record<string, unknown>;
          throw new ProblemDetailsError({
            status: res.status,
            type: `https://opencorp.dev/errors/http-${res.status}`,
            title: `HTTP ${res.status}`,
            detail:
              typeof legado.erro === "string"
                ? legado.erro
                : typeof legado.message === "string"
                  ? legado.message
                  : JSON.stringify(corpo),
          });
        }

        throw new ProblemDetailsError({
          status: res.status,
          type: `https://opencorp.dev/errors/http-${res.status}`,
          title: `HTTP ${res.status}`,
        });
      }

      // Sucesso
      if (typeof res.json === "function") {
        try {
          return (await res.json()) as T;
        } catch {}
      }
      if (typeof res.text === "function") {
        const text = await res.text();
        if (!text) return undefined as T;
        try {
          return JSON.parse(text) as T;
        } catch {
          return text as unknown as T;
        }
      }
      return undefined as T;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
