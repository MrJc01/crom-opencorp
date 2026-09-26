/**
 * Probes de modelo aprovados/reprovados por motor, separados da presença no
 * catálogo (Etapa 13). Guarda só o último resultado por [motor, modelo]; nunca
 * prompt, resposta ou credencial.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { writeFileAtomic } from "../../utils/fs-safe.js";
import type { CatalogProbe } from "./catalog.js";

export type StoredProbe = CatalogProbe & { modelId: string };

export class ModelProbeStore {
  private readonly path: string;

  constructor(homeDir: string) {
    this.path = join(homeDir, ".opencorp", "model-probes.json");
  }

  list(): StoredProbe[] {
    if (!existsSync(this.path)) return [];
    try {
      const data = JSON.parse(readFileSync(this.path, "utf8"));
      return Array.isArray(data) ? data.filter((p) => p && typeof p.modelId === "string" && typeof p.engineId === "string") : [];
    } catch {
      return [];
    }
  }

  async record(probe: StoredProbe): Promise<void> {
    const rest = this.list().filter((p) => !(p.modelId === probe.modelId && p.engineId === probe.engineId));
    mkdirSync(dirname(this.path), { recursive: true });
    await writeFileAtomic(this.path, `${JSON.stringify([...rest, probe], null, 2)}\n`);
  }
}
