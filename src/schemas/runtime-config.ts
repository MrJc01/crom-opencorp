import { z } from "zod";

export const modelRefSchema = z.object({
  provider: z.string().trim().min(1),
  id: z.string().trim().min(1),
  accountId: z.string().trim().min(1).optional(),
});

export const runtimeConfigSchema = z.object({
  engine: z.string().trim().min(1),
  mode: z.enum(["one-shot", "conversation"]),
  model: modelRefSchema,
  fallback: z
    .object({
      engines: z.array(z.string().trim().min(1)).default([]),
      models: z.array(modelRefSchema.omit({ accountId: true })).default([]),
    })
    .optional(),
});

export type ModelRef = z.infer<typeof modelRefSchema>;
export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;

export function parseRuntimeConfig(input: unknown): RuntimeConfig {
  return runtimeConfigSchema.parse(input);
}
