import { z } from "zod";

export const cenaCuradoriaSchema = z.object({
  cena_idx: z.number().int().min(1).max(10),
  tipo_cena: z.string(),
  fala: z.string().optional().default(""),
  imagem_escolhida: z.string().min(1, "O caminho da imagem escolhida é obrigatório"),
  titulo_imagem: z.string().optional().default("Sem título"),
  fonte: z.string().optional().default("Desconhecida"),
  status: z.enum(["aprovada", "rejeitada"]),
  analise_seguranca: z.object({
    nsfw_detectado: z.boolean(),
    parecer: z.string(),
  }),
  analise_relevancia: z.object({
    score: z.number().min(0).max(10),
    justificativa: z.string(),
  }),
  candidatos_avaliados: z.array(z.record(z.string(), z.any())).optional().default([]),
});

export const curadoriaImagensSchema = z.object({
  pauta_id: z.string().min(1),
  roteiro_id: z.string().min(1),
  aprovado_para_render: z.boolean(),
  validado_por: z.string().min(1),
  timestamp_validacao: z.string(),
  cenas: z.array(cenaCuradoriaSchema).min(1),
  observacoes: z.string().optional(),
});

export type CenaCuradoria = z.infer<typeof cenaCuradoriaSchema>;
export type CuradoriaImagens = z.infer<typeof curadoriaImagensSchema>;
