/**
 * Origens do catálogo. Cada uma declara em nome de qual motor listou o modelo;
 * nenhuma infere motor a partir do provedor.
 */
import * as childProcess from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { ROTACAO_AGENTES_RECOMENDADA, MODELOS_CATALOGO_BASE } from "../contexts/agents/recommended-models.js";
import type { CatalogSource, RawCatalogEntry } from "./catalog.js";

// Acesso preguiçoso: módulos que mockam node:child_process não precisam expor execFile.
const execFileAsync = (file: string, args: string[], options: childProcess.ExecFileOptions): Promise<{ stdout: string; stderr: string }> =>
  (promisify(childProcess.execFile) as any)(file, args, { encoding: "utf8", ...options });

/** `opencode models` do binário resolvido: modelos que o OpenCode sabe executar. */
export function openCodeLiveSource(binaryPath: string | null | undefined): CatalogSource {
  return {
    id: "opencode-cli",
    async list() {
      if (!binaryPath) return [];
      const { stdout } = await execFileAsync(binaryPath, ["models"], { timeout: 15_000, maxBuffer: 8 * 1024 * 1024 });
      return stdout
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.includes(" "))
        .map((modelId) => ({ modelId, sourceId: "opencode-cli", kind: "live" as const, engineId: "opencode" }));
    },
  };
}

/** Dicas declaradas por cada driver (`supportedModelsHint`). */
export function engineHintSource(engines: Array<{ id: string; supportedModelsHint?: string[] }>): CatalogSource {
  return {
    id: "engine-hints",
    async list() {
      const out: RawCatalogEntry[] = [];
      for (const engine of engines) {
        for (const modelId of engine.supportedModelsHint ?? []) out.push({ modelId, sourceId: `hint:${engine.id}`, kind: "engine-hint", engineId: engine.id });
      }
      return out;
    },
  };
}

/** Lista curada do OpenCorp, validada com o OpenCode (rotação padrão de agentes). */
export function curatedSource(): CatalogSource {
  return {
    id: "curated",
    async list() {
      return [...new Set([...ROTACAO_AGENTES_RECOMENDADA, ...MODELOS_CATALOGO_BASE])].map((modelId) => ({ modelId, sourceId: "curated", kind: "curated" as const, engineId: "opencode" }));
    },
  };
}

/** Modelos configurados pelo usuário (global e workspace). Sem motor implícito. */
export function settingsSource(homeDir: string, workspacePath?: string): CatalogSource {
  return {
    id: "settings",
    async list() {
      const files = [join(homeDir, ".opencorp", "settings.json"), ...(workspacePath ? [join(workspacePath, ".opencorp", "config.json"), join(workspacePath, ".opencorp", "settings.json")] : [])];
      const out: RawCatalogEntry[] = [];
      for (const file of files) {
        if (!existsSync(file)) continue;
        try {
          const cfg = JSON.parse(readFileSync(file, "utf8"));
          const ids = [cfg?.modelos?.padrao, cfg?.default_model, ...(cfg?.modelos?.rotacao ?? []), ...(cfg?.tests?.rotation ?? [])];
          for (const id of ids) if (typeof id === "string" && id.trim()) out.push({ modelId: id.trim(), sourceId: `settings:${file}`, kind: "settings" });
        } catch {
          // arquivo inválido: ignorado pelo catálogo
        }
      }
      return out;
    },
  };
}
