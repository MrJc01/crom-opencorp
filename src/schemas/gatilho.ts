import { z } from "zod";

/**
 * Gatilho da Execução — o "quem chamou" da primitiva unificada (PLANO-UNIFICACAO).
 * Toda ativação de agente, de qualquer motor, declara um gatilho:
 *   cron (scheduler) · evento (trigger/hook) · mencao (chat de task) ·
 *   dependencia (nó de flow) · padrao (passo de team) · turno (reunião) ·
 *   manual (humano via CLI/web/API)
 */
export const TIPOS_GATILHO = [
  "manual",
  "cron",
  "evento",
  "mencao",
  "webhook",
  "dependencia",
  "padrao",
  "turno",
] as const;

export type TipoGatilho = (typeof TIPOS_GATILHO)[number];

export const gatilhoSchema = z.object({
  tipo: z.enum(TIPOS_GATILHO),
  origem: z.string().min(1).max(200),
});

export type Gatilho = z.infer<typeof gatilhoSchema>;

/** Parseia "cron:sch-x" → {tipo:"cron", origem:"sch-x"}; lança com mensagem clara se inválido. */
export function parseGatilho(texto: string): Gatilho {
  const idx = texto.indexOf(":");
  const tipo = idx === -1 ? texto : texto.slice(0, idx);
  const origem = idx === -1 ? "" : texto.slice(idx + 1);
  const parsed = gatilhoSchema.safeParse({ tipo, origem });
  if (!parsed.success) {
    const detalhe = parsed.error.issues[0]?.message ?? "inválido";
    throw new Error(
      `gatilho "${texto}" inválido — use <tipo>:<origem> com tipo em ${TIPOS_GATILHO.join("|")} (${detalhe})`,
    );
  }
  return parsed.data;
}
