/**
 * @module problem-details — Implementação RFC 7807 (Problem Details for HTTP APIs)
 *
 * Padrão IETF para respostas de erro uniformes em APIs REST.
 * Toda rota do OpenCorp deve usar este módulo para enviar erros
 * em vez de schemas ad-hoc inventados por rota.
 *
 * @see https://www.rfc-editor.org/rfc/rfc7807
 * @see docs/PADRONIZACAO_ARQUITETURAL_OPENCORP.md (Passo 2)
 */

import type { ServerResponse } from "node:http";
import type { ZodError, ZodIssue } from "zod";

// ── Tipos RFC 7807 ──────────────────────────────────────────────────

/** Parâmetro inválido serializado em `invalidParams`. */
export interface InvalidParam {
  /** Nome/caminho do campo que falhou a validação (ex: "agente", "config.entao"). */
  readonly name: string;
  /** Descrição legível do motivo da falha. */
  readonly reason: string;
}

/**
 * Contrato RFC 7807 — `application/problem+json`.
 *
 * Todos os campos seguem a spec. Extensões (ex: `invalidParams`) são
 * permitidas pela RFC e tratadas como membros extras.
 */
export interface ProblemDetails {
  /** URI que identifica o tipo de problema. */
  readonly type: string;
  /** Resumo curto e legível do tipo de problema (não muda entre instâncias). */
  readonly title: string;
  /** Código de status HTTP. */
  readonly status: number;
  /** Explicação específica da ocorrência do problema. */
  readonly detail?: string;
  /** URI da requisição que gerou o problema. */
  readonly instance?: string;
  /**
   * Extensão RFC 7807: lista de campos inválidos (para erros de validação).
   * Presente apenas quando `status === 422`.
   */
  readonly invalidParams?: readonly InvalidParam[];
}

// ── URIs de tipo padrão do OpenCorp ─────────────────────────────────

const BASE_URI = "https://opencorp.dev/errors";

/** URIs de tipo para os erros mais comuns. */
export const ProblemType = {
  VALIDATION_FAILED: `${BASE_URI}/validation-failed`,
  BAD_REQUEST: `${BASE_URI}/bad-request`,
  NOT_FOUND: `${BASE_URI}/not-found`,
  UNAUTHORIZED: `${BASE_URI}/unauthorized`,
  FORBIDDEN: `${BASE_URI}/forbidden`,
  INTERNAL: `${BASE_URI}/internal-error`,
  CONFLICT: `${BASE_URI}/conflict`,
} as const;

// ── Mapa padrão de títulos HTTP ─────────────────────────────────────

const HTTP_TITLES: Readonly<Record<number, string>> = {
  400: "Requisição Inválida",
  401: "Não Autorizado",
  402: "Pagamento Necessário",
  403: "Acesso Proibido",
  404: "Recurso Não Encontrado",
  409: "Conflito",
  422: "Dados da Requisição Inválidos",
  429: "Muitas Requisições",
  500: "Erro Interno do Servidor",
  502: "Gateway Inválido",
  503: "Serviço Indisponível",
};

// ── Funções puras de formatação ─────────────────────────────────────

/**
 * Converte o caminho de uma `ZodIssue` em uma string legível:
 * `["config", "entao"]` → `"config.entao"`
 * `["nos", 0, "id"]` → `"nos[0].id"`
 */
function caminhoIssue(path: readonly PropertyKey[]): string {
  if (path.length === 0) return "(raiz)";

  return path.reduce<string>((acc, seg, i) => {
    if (typeof seg === "symbol") return acc ? `${acc}.${String(seg)}` : String(seg);
    if (typeof seg === "number") return `${acc}[${seg}]`;
    return i === 0 ? seg : `${acc}.${seg}`;
  }, "");
}

/**
 * Converte uma `ZodIssue` em um `InvalidParam`.
 */
function issueParaInvalidParam(issue: ZodIssue): InvalidParam {
  return {
    name: caminhoIssue(issue.path),
    reason: issue.message,
  };
}

/**
 * Transforma um `ZodError` em um `ProblemDetails` padronizado (status 422).
 *
 * @param err — Erro de validação do Zod
 * @param instance — URI da rota que gerou o erro (opcional)
 */
export function formatarZodProblem(err: ZodError, instance?: string): ProblemDetails {
  const invalidParams = err.issues.map(issueParaInvalidParam);

  const detail =
    invalidParams.length === 1
      ? `Campo '${invalidParams[0].name}': ${invalidParams[0].reason}`
      : `${invalidParams.length} campos falharam na validação.`;

  return {
    type: ProblemType.VALIDATION_FAILED,
    title: HTTP_TITLES[422]!,
    status: 422,
    detail,
    ...(instance !== undefined ? { instance } : {}),
    invalidParams,
  };
}

/**
 * Cria um `ProblemDetails` genérico a partir de um código de status HTTP.
 *
 * @param status — Código HTTP
 * @param detail — Mensagem de detalhe específica
 * @param opts — Campos opcionais extras
 */
export function criarProblema(
  status: number,
  detail: string,
  opts?: { type?: string; instance?: string },
): ProblemDetails {
  const typeForStatus = (): string => {
    if (status === 400) return ProblemType.BAD_REQUEST;
    if (status === 401) return ProblemType.UNAUTHORIZED;
    if (status === 403) return ProblemType.FORBIDDEN;
    if (status === 404) return ProblemType.NOT_FOUND;
    if (status === 409) return ProblemType.CONFLICT;
    if (status === 422) return ProblemType.VALIDATION_FAILED;
    if (status >= 500) return ProblemType.INTERNAL;
    return `${BASE_URI}/http-${status}`;
  };

  return {
    type: opts?.type ?? typeForStatus(),
    title: HTTP_TITLES[status] ?? `Erro HTTP ${status}`,
    status,
    detail,
    ...(opts?.instance !== undefined ? { instance: opts.instance } : {}),
  };
}

// ── Envio da resposta HTTP ──────────────────────────────────────────

/**
 * Envia uma resposta `application/problem+json` (RFC 7807) no `res`.
 *
 * @param res — ServerResponse do Node.js
 * @param problema — Objeto `ProblemDetails` a ser serializado
 */
export function enviarProblema(res: ServerResponse, problema: ProblemDetails): void {
  if (res.writableEnded) return;

  res.writeHead(problema.status, {
    "content-type": "application/problem+json; charset=utf-8",
  });
  res.end(JSON.stringify(problema));
}
