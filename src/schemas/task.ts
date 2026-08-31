import { z } from "zod";

/** Criação de task via API — fecha a lacuna de validação (POST /tasks aceitava qualquer string) */
export const taskCreateSchema = z.object({
  titulo: z.string().min(1, "titulo obrigatório").max(300, "titulo muito longo (máx 300)"),
  descricao: z.string().max(10_000).optional(),
  coluna: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/i, "coluna inválida").max(40).optional(),
  prioridade: z.enum(["baixa", "media", "alta"]).optional(),
  labels: z.array(z.string().min(1).max(40)).max(10).optional(),
  responsavel: z.string().regex(/^agente:[a-z0-9][a-z0-9_-]*$|^[^@\s]+@[^@\s]+$|^humano$/i, "responsavel deve ser agente:<id>, humano ou e-mail").max(80).optional(),
  due: z.string().max(40).optional(),
  task_pai: z.string().max(40).optional(),
  bloqueado_por: z.array(z.string().max(40)).max(20).optional(),
});

export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
