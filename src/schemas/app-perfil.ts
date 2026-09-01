import { z } from "zod";

/** Tipos de perfil de app suportados (PLANO-PAINEL-V2 Etapa 4.1). */
export const TIPOS_APP = ["vps", "wordpress", "mercadopago", "cartao", "custom"] as const;
export type TipoApp = (typeof TIPOS_APP)[number];

/** Padrão de nome no secrets.json: app:<tipo>:<id> — id = [a-z0-9][a-z0-9-]{0,40} */
export const APP_PERFIL_NOME_REGEX = /^app:(vps|wordpress|mercadopago|cartao|custom):[a-z0-9][a-z0-9-]{0,40}$/;

const textoObrig = (max = 2000) => z.string().min(1).max(max);
const textoOpc = (max = 4000) => z.string().max(max).optional();

export const perfilVpsSchema = z.object({
  rotulo: textoObrig(200),
  host: textoObrig(255),
  porta: z.number().int().min(1).max(65535).optional(),
  usuario: textoObrig(120),
  senha: textoOpc(1000),
  chave_ssh: textoOpc(8000),
  notas: textoOpc(),
});

export const perfilWordpressSchema = z.object({
  rotulo: textoObrig(200),
  url: textoObrig(500),
  usuario: textoObrig(120),
  senha_app: textoObrig(1000),
  onde_roda: textoOpc(500),
  notas: textoOpc(),
});

export const perfilMercadoPagoSchema = z.object({
  rotulo: textoObrig(200),
  public_key: textoObrig(500),
  access_token: textoObrig(1000),
  ambiente: z.enum(["test", "prod"]),
  notas: textoOpc(),
});

export const perfilCartaoSchema = z.object({
  rotulo: textoObrig(200),
  bandeira: textoObrig(60),
  ultimos4: z.string().regex(/^\d{4}$/, "ultimos4 deve ter exatamente 4 dígitos"),
  validade: textoObrig(10),
  notas: textoOpc(),
});

export const perfilCustomSchema = z.object({
  rotulo: textoObrig(200),
  conteudo: textoObrig(20_000),
  notas: textoOpc(),
});

const SCHEMAS_APP: Record<TipoApp, z.ZodType> = {
  vps: perfilVpsSchema,
  wordpress: perfilWordpressSchema,
  mercadopago: perfilMercadoPagoSchema,
  cartao: perfilCartaoSchema,
  custom: perfilCustomSchema,
};

/** Campos proibidos no perfil de cartão — NUNCA aceitar número completo nem CVV. */
/** Deriva o tipo de app de um nome de secret (app:<tipo>:<id>) — null se não for perfil. */
export function tipoDeNomeApp(nome: string): TipoApp | null {
  const m = APP_PERFIL_NOME_REGEX.exec(nome);
  return m ? (m[1] as TipoApp) : null;
}

/**
 * Valida o valor (string contendo JSON) de um secret com nome de perfil app:<tipo>:<id>.
 * Retorna null se válido (ou se o nome não é perfil de app); string com o motivo senão.
 */
export function validarPerfilApp(nome: string, valorBruto: string): string | null {
  const tipo = tipoDeNomeApp(nome);
  if (!tipo) {
    if (nome.startsWith("app:")) {
      return 'nome de perfil de app inválido — use app:<tipo>:<id> com tipo em vps|wordpress|mercadopago|cartao|custom e id = [a-z0-9][a-z0-9-]{0,40}';
    }
    return null;
  }
  let dados: unknown;
  try {
    dados = JSON.parse(valorBruto);
  } catch {
    return `perfil de app "${tipo}" exige um JSON válido no valor`;
  }
  if (tipo === "cartao" && dados !== null && typeof dados === "object") {
    // blocklist ampla: qualquer variante de número completo / código de segurança é rejeitada
    const proibido = Object.keys(dados as object).find((c) => /num(e|u)ro|_?cv[vc]_?|codigo_seguranca/i.test(c));
    if (proibido) {
      return `campo "${proibido}" é proibido no perfil de cartão — armazene apenas referência (bandeira/últimos 4), nunca número completo nem CVV`;
    }
  }
  const resultado = SCHEMAS_APP[tipo].safeParse(dados);
  if (!resultado.success) {
    const primeira = resultado.error.issues[0];
    const caminho = primeira && primeira.path.length ? `${primeira.path.join(".")}: ` : "";
    return `perfil "${tipo}" inválido — ${caminho}${primeira?.message ?? "schema não bate"}`;
  }
  return null;
}
