import { z } from "zod";

export const settingsSchema = z.object({
  version: z.number().int().default(1),
  default_model: z.string().min(1).default("opencode/grok-code"),
  test_model: z.string().min(1).default("opencode/hy3-free"),
  secretary: z
    .object({
      agent: z.string().min(1).default("secretario"),
    })
    .prefault({}),
  budget: z
    .object({
      daily_usd: z.number().nonnegative().default(5.0),
      per_agent_usd: z.number().nonnegative().default(1.0),
      pause_on_exceed: z.boolean().default(true),
      notify_registry: z.string().min(1).default("custos"),
    })
    .prefault({}),
  security: z
    .object({
      level: z.enum(["permissive", "standard", "strict"]).default("standard"),
      blocklist: z
        .array(z.string())
        .default(["rm -rf", "shutdown", "curl * | bash", "git push --force"]),
      hitl_patterns: z
        .array(z.string())
        .default(["git push", "npm publish", "DROP TABLE", "email*"]),
      network_allowlist: z.array(z.string()).default(["registry.npmjs.org", "github.com"]),
    })
    .prefault({}),
  paths: z
    .object({
      workspaces_root: z.string().min(1).default("~/.opencorp/workspaces"),
    })
    .prefault({}),
  tests: z
    .object({
      blind: z.boolean().default(true),
      model: z.string().min(1).default("opencode/hy3-free"),
      reports_dir: z.string().min(1).default(".opencorp/reports/testes"),
      max_fix_cycles: z.number().int().min(1).default(3),
    })
    .prefault({}),
  cloud: z
    .object({
      enabled: z.boolean().default(false),
      mode: z.enum(["backup-local", "backup-nuvem", "mirror-remoto"]).default("backup-local"),
      targets: z.array(z.string()).default([]),
    })
    .prefault({}),
  ui: z
    .object({
      theme: z.enum(["dark", "light"]).default("dark"),
      verbose: z.boolean().default(false),
    })
    .prefault({}),
  meeting: z
    .object({
      max_turns: z.number().int().min(1).default(12),
      max_minutes: z.number().int().min(1).default(6),
      per_agent_usd: z.number().nonnegative().default(0.5),
      moderator: z.string().min(1).default("secretario"),
    })
    .prefault({}),
  supervisor: z
    .object({
      interval_minutes: z.number().int().min(1).default(15),
      enabled: z.boolean().default(false),
      max_orders_per_tick: z.number().int().min(1).default(3),
    })
    .prefault({}),
});

export type Settings = z.infer<typeof settingsSchema>;
