/**
 * Middleware de Autenticação com Hardening de Segurança (MICRO-PASSO 8)
 *
 * Características:
 * - Comparação constante imune a Timing Attacks via crypto.timingSafeEqual + SHA-256;
 * - Extração canônica de token via cabeçalho Authorization: Bearer <token>;
 * - Compatibilidade temporária segura com ?token=<token> para SSE/fixtures;
 * - Validação granular e mensagens descritivas.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

export interface OpcoesAuth {
  tokenEsperado: string;
  semAuth?: boolean;
  permitirTokenQuery?: boolean;
}

export interface ResultadoAuth {
  autenticado: boolean;
  motivo?: string;
  via?: "bearer" | "query" | "publico" | "sem_auth" | "none";
}

/**
 * Compara dois tokens em tempo constante usando crypto.timingSafeEqual com digest SHA-256 fixo de 32 bytes,
 * evitando tanto exceções de tamanhos de buffer diferentes quanto vazamentos por canal lateral de timing.
 */
export function compararTokensSeguro(tokenA?: string | null, tokenB?: string | null): boolean {
  if (!tokenA || !tokenB) return false;
  const hashA = createHash("sha256").update(tokenA).digest();
  const hashB = createHash("sha256").update(tokenB).digest();
  return timingSafeEqual(hashA, hashB);
}

/**
 * Extrai o token Bearer do cabeçalho Authorization.
 */
export function extrairTokenBearer(authHeader?: string | string[]): string | null {
  if (!authHeader || typeof authHeader !== "string") return null;
  const trimmed = authHeader.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) return null;
  const token = trimmed.slice(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * Extrai o token da requisição (preferindo Bearer sobre query string).
 */
export function extrairTokenRequisicao(
  req: IncomingMessage,
  url: URL,
  permitirQuery = true,
): { token: string | null; via: "bearer" | "query" | "none" } {
  const bearer = extrairTokenBearer(req.headers.authorization);
  if (bearer) {
    return { token: bearer, via: "bearer" };
  }
  if (permitirQuery) {
    const tokenQuery = url.searchParams.get("token");
    if (tokenQuery) {
      return { token: tokenQuery, via: "query" };
    }
  }
  return { token: null, via: "none" };
}

/**
 * Verifica se a requisição está autenticada.
 */
export function verificarAutenticacao(
  req: IncomingMessage,
  url: URL,
  rota: string,
  opcoes: OpcoesAuth,
): ResultadoAuth {
  if (opcoes.semAuth) {
    return { autenticado: true, via: "sem_auth" };
  }

  // Rotas públicas que não requerem autenticação
  if (rota === "/health" || rota === "/doc" || rota === "/status") {
    return { autenticado: true, via: "publico" };
  }

  // Webhooks públicos que possuem mecanismo de autenticação próprio (x-opencorp-token / hook token)
  if (/^\/hooks\/[^/]+\/[^/]+$/.test(rota)) {
    return { autenticado: true, via: "publico" };
  }

  const { token, via } = extrairTokenRequisicao(req, url, opcoes.permitirTokenQuery ?? true);

  if (!token) {
    return {
      autenticado: false,
      motivo: "token ausente ou inválido — Authorization: Bearer <token>",
      via: "none",
    };
  }

  if (!compararTokensSeguro(token, opcoes.tokenEsperado)) {
    return {
      autenticado: false,
      motivo: "token ausente ou inválido — Authorization: Bearer <token>",
      via,
    };
  }

  return { autenticado: true, via };
}
