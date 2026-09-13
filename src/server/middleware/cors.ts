/**
 * Middleware de CORS Restrito e Proteção Cross-Origin (MICRO-PASSO 8)
 *
 * Características:
 * - Restrição de origens a loopback confiável (localhost, 127.0.0.1) e origens configuradas;
 * - Bloqueio de mutações cross-site arbitrárias (POST, PUT, DELETE);
 * - Gestão centralizada de headers CORS para o servidor.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

export interface OpcoesCors {
  origensPermitidas?: string[];
  bloquearMutacaoDesconhecida?: boolean;
}

const ORIGENS_PADRAO_LOOPBACK = [
  /^http:\/\/localhost(:\d+)?$/,
  /^https:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https:\/\/127\.0\.0\.1(:\d+)?$/,
];

/**
 * Determina se uma origem é confiável (loopback ou explicitamente na lista de permissão).
 */
export function ehOrigemPermitida(origem?: string | null, origensPermitidas: string[] = []): boolean {
  if (!origem) return true; // Requisições sem Origin (same-origin, curl, CLI, etc.) são permitidas

  // Verifica origens loopback padrão
  for (const padrao of ORIGENS_PADRAO_LOOPBACK) {
    if (padrao.test(origem)) return true;
  }

  // Verifica lista configurada
  for (const permitida of origensPermitidas) {
    if (permitida === "*" || permitida === origem) return true;
  }

  return false;
}

/**
 * Gera headers CORS adequados com base na origem da requisição.
 */
export function obterHeadersCors(
  req?: IncomingMessage | null,
  opcoes?: OpcoesCors,
): Record<string, string> {
  const origemReq = req?.headers?.origin;
  const permitida = ehOrigemPermitida(origemReq, opcoes?.origensPermitidas);

  const headers: Record<string, string> = {
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "authorization,content-type,x-opencorp-token",
  };

  if (!origemReq) {
    // Sem cabeçalho Origin -> chamada direta/same-origin
    headers["access-control-allow-origin"] = "*";
  } else if (permitida) {
    // Reflete a origem confiável específica
    headers["access-control-allow-origin"] = origemReq;
    headers["vary"] = "Origin";
  }

  return headers;
}

/**
 * Executa verificação e aplicação de CORS na requisição.
 * Retorna true se a requisição pode prosseguir, ou false se foi tratada/bloqueada.
 */
export function processarCors(
  req: IncomingMessage,
  res: ServerResponse,
  opcoes?: OpcoesCors,
): boolean {
  const origemReq = req.headers.origin;
  const permitida = ehOrigemPermitida(origemReq, opcoes?.origensPermitidas);
  const metodo = (req.method ?? "GET").toUpperCase();

  // Aplica headers CORS preventivamente na resposta
  const headers = obterHeadersCors(req, opcoes);
  for (const [chave, valor] of Object.entries(headers)) {
    try {
      res.setHeader(chave, valor);
    } catch {}
  }

  // Tratamento de preflight OPTIONS
  if (metodo === "OPTIONS") {
    if (origemReq && !permitida) {
      res.writeHead(403, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ erro: "origem não permitida pela política de CORS" }));
      return false;
    }
    res.writeHead(204);
    res.end();
    return false;
  }

  // Se houver Origin e for uma origem desconhecida/não permitida
  if (origemReq && !permitida) {
    // Bloqueia métodos mutáveis (POST, PUT, DELETE, PATCH)
    const ehMutavel = ["POST", "PUT", "DELETE", "PATCH"].includes(metodo);
    if (ehMutavel && (opcoes?.bloquearMutacaoDesconhecida ?? true)) {
      res.writeHead(403, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ erro: "origem não permitida pela política de CORS para operações mutáveis" }));
      return false;
    }
  }

  return true;
}
