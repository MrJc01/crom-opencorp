import { z } from "zod";

export const securityPolicySchema = z.object({
  level: z.enum(["permissive", "standard", "strict"]).default("standard"),
  blocklist: z.array(z.string().min(1)).default([]),
  allowlist_extra: z.array(z.string().min(1)).default([]),
  network_allowlist: z.array(z.string().min(1)).default([]),
  hitl_patterns: z.array(z.string().min(1)).default([]),
});

export type SecurityPolicy = z.infer<typeof securityPolicySchema>;

export class PolicySchemaError extends Error {
  readonly exitCode = 2;

  constructor(mensagem: string) {
    super(mensagem);
    this.name = "PolicySchemaError";
  }
}

function msg(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

export function parseSecurityPolicy(json: unknown, arquivo?: string): SecurityPolicy {
  const parsed = securityPolicySchema.safeParse(json);
  if (!parsed.success) {
    const iss = parsed.error.issues[0]!;
    const campo = iss.path.join(".") || "(raiz)";
    const onde = arquivo ? ` (${arquivo})` : "";
    throw new PolicySchemaError(`security_policy inválida${onde} → ${campo}: ${iss.message}`);
  }
  return parsed.data;
}

export function parseSecurityPolicyTexto(texto: string, arquivo?: string): SecurityPolicy {
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch (erro) {
    throw new PolicySchemaError(`security_policy com JSON inválido${arquivo ? ` (${arquivo})` : ""}: ${msg(erro)}`);
  }
  return parseSecurityPolicy(json, arquivo);
}
