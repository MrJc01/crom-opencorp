/**
 * @module validator — Validação tipada de payloads HTTP com Zod + RFC 7807
 *
 * Elimina o padrão `(await lerCorpo(req)) as Record<string, unknown>` que
 * está espalhado pelas 15+ rotas do OpenCorp. A função `validarCorpo`
 * executa leitura + parse + validação e retorna um resultado discriminado
 * (sucesso/falha com ProblemDetails pronto para envio).
 *
 * @see docs/PADRONIZACAO_ARQUITETURAL_OPENCORP.md (Passo 2)
 */

import type { IncomingMessage } from "node:http";
import type { ZodType } from "zod";
import {
  criarProblema,
  formatarZodProblem,
  type ProblemDetails,
} from "./problem-details.js";

// ── Tipos de resultado ──────────────────────────────────────────────

export interface ValidacaoSucesso<T> {
  readonly sucesso: true;
  readonly dados: T;
}

export interface ValidacaoFalha {
  readonly sucesso: false;
  readonly problema: ProblemDetails;
}

export type ResultadoValidacao<T> = ValidacaoSucesso<T> | ValidacaoFalha;

// ── Função principal ────────────────────────────────────────────────

/**
 * Lê o corpo da requisição HTTP, parseia o JSON e valida contra um schema Zod.
 *
 * Retorna um resultado discriminado:
 * - `{ sucesso: true, dados: T }` — payload validado e tipado
 * - `{ sucesso: false, problema: ProblemDetails }` — erro RFC 7807 pronto para envio
 *
 * @param lerCorpo — Função de leitura de corpo do OpenCorp (do RouteContext)
 * @param req — Requisição HTTP (IncomingMessage)
 * @param schema — Schema Zod para validação
 * @param instance — URI da rota para o campo `instance` do ProblemDetails (default: req.url)
 *
 * @example
 * ```ts
 * const resultado = await validarCorpo(lerCorpo, req, meuSchema);
 * if (!resultado.sucesso) {
 *   enviarProblema(res, resultado.problema);
 *   return;
 * }
 * // resultado.dados é tipado como z.infer<typeof meuSchema>
 * ```
 */
export async function validarCorpo<T>(
  lerCorpo: (req: IncomingMessage, maxBytes?: number) => Promise<unknown>,
  req: IncomingMessage,
  schema: ZodType<T>,
  instance?: string,
): Promise<ResultadoValidacao<T>> {
  const rota = instance ?? req.url;

  // 1) Leitura do corpo (pode falhar com JSON inválido ou corpo excedido)
  let corpo: unknown;
  try {
    corpo = await lerCorpo(req);
  } catch (err) {
    const mensagem = err instanceof SyntaxError
      ? `JSON inválido no corpo da requisição: ${err.message}`
      : err instanceof Error
        ? err.message
        : "Falha ao ler o corpo da requisição.";

    return {
      sucesso: false,
      problema: criarProblema(400, mensagem, { instance: rota }),
    };
  }

  // 2) Validação Zod
  const resultado = schema.safeParse(corpo);

  if (!resultado.success) {
    return {
      sucesso: false,
      problema: formatarZodProblem(resultado.error, rota),
    };
  }

  return { sucesso: true, dados: resultado.data };
}
