/**
 * @module sdk/errors — Classes de erro tipadas do SDK OpenCorp
 *
 * Encapsulam respostas RFC 7807 e falhas de rede em classes ricas
 * que a CLI e consumidores downstream podem tratar de forma padronizada.
 *
 * @see src/server/http/problem-details.ts (servidor)
 * @see docs/PADRONIZACAO_ARQUITETURAL_OPENCORP.md (Passo 3)
 */

// ── Tipo RFC 7807 (lado cliente) ────────────────────────────────────

/** Parâmetro inválido retornado pelo servidor (RFC 7807 extensão). */
export interface InvalidParam {
  readonly name: string;
  readonly reason: string;
}

// ── ProblemDetailsError ─────────────────────────────────────────────

/**
 * Erro lançado quando o servidor OpenCorp responde com `application/problem+json`.
 *
 * Encapsula todos os campos da RFC 7807 como propriedades tipadas,
 * permitindo tratamento estruturado no caller:
 *
 * ```ts
 * try {
 *   await sdk.secretary.enviarMensagem({ mensagem: "" });
 * } catch (err) {
 *   if (err instanceof ProblemDetailsError && err.status === 422) {
 *     console.log(err.invalidParams); // campos que falharam
 *   }
 * }
 * ```
 */
export class ProblemDetailsError extends Error {
  /** Código de status HTTP da resposta. */
  readonly status: number;
  /** URI que identifica o tipo de problema. */
  readonly type: string;
  /** Resumo curto do tipo de problema. */
  readonly title: string;
  /** Explicação específica da ocorrência. */
  readonly detail?: string;
  /** URI da rota que gerou o erro. */
  readonly instance?: string;
  /** Campos que falharam na validação (quando status === 422). */
  readonly invalidParams?: readonly InvalidParam[];

  constructor(problema: {
    status: number;
    type: string;
    title: string;
    detail?: string;
    instance?: string;
    invalidParams?: readonly InvalidParam[];
  }) {
    super(problema.detail ?? problema.title);
    this.name = "ProblemDetailsError";
    this.status = problema.status;
    this.type = problema.type;
    this.title = problema.title;
    this.detail = problema.detail;
    this.instance = problema.instance;
    this.invalidParams = problema.invalidParams;
  }

  /** Formatação legível para exibição na CLI. */
  formatarParaCli(): string {
    const linhas: string[] = [];
    linhas.push(`[ERRO ${this.status}] ${this.title}`);
    if (this.detail) linhas.push(`  ↳ ${this.detail}`);
    if (this.instance) linhas.push(`  Rota: ${this.instance}`);
    if (this.invalidParams && this.invalidParams.length > 0) {
      linhas.push("  Campos inválidos:");
      for (const p of this.invalidParams) {
        linhas.push(`    • ${p.name}: ${p.reason}`);
      }
    }
    return linhas.join("\n");
  }
}

// ── OpenCorpNetworkError ────────────────────────────────────────────

/**
 * Erro lançado quando o SDK não consegue conectar ao servidor
 * (ECONNREFUSED, timeout, DNS, etc.).
 */
export class OpenCorpNetworkError extends Error {
  /** URL base que foi tentada. */
  readonly baseUrl: string;
  /** Causa original (se disponível). */
  readonly cause?: Error;

  constructor(baseUrl: string, causa?: Error) {
    super(
      `Servidor OpenCorp inacessível em ${baseUrl}. ` +
      `Inicie com 'opencorp serve' ou 'opencorp daemon start'.`,
    );
    this.name = "OpenCorpNetworkError";
    this.baseUrl = baseUrl;
    if (causa) this.cause = causa;
  }
}
