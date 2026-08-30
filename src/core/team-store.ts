import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { TeamError } from "./errors.js";
import { eventBus } from "./event-bus.js";
import { writeFileAtomic, mkdirRecursive } from "../utils/fs-safe.js";

export const passoSchema = z.object({
  agente: z.string().min(1),
  ordem: z.string().min(1),
});

export const teamSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "use kebab-case para o id do team"),
  titulo: z.string().min(1),
  padrao: z.enum(["pipeline", "fanout", "review", "debate"]),
  passos: z.array(passoSchema).optional(),
  paralelos: z.array(passoSchema).optional(),
  sintese: passoSchema.optional(),
  executor: passoSchema.optional(),
  revisor: passoSchema.optional(),
  turnos: z.number().int().min(1).max(5).optional(),
  proponentes: z.array(passoSchema).optional(),
  moderador: z.object({ agente: z.string().min(1) }).optional(),
  max_mensagens_auto_h: z.number().int().min(1).max(200).optional(),
  criado_em: z.string(),
});

export type Passo = z.infer<typeof passoSchema>;
export type TeamSpec = z.infer<typeof teamSchema>;

export function validarPadrao(spec: TeamSpec): void {
  switch (spec.padrao) {
    case "pipeline": {
      if (!spec.passos || spec.passos.length < 1) {
        throw new TeamError('team pipeline exige "passos" (min 1) — ex.: passos: [{agente, ordem}]');
      }
      break;
    }
    case "fanout": {
      if (!spec.paralelos || spec.paralelos.length < 2) {
        throw new TeamError('team fanout exige "paralelos" (min 2)');
      }
      break;
    }
    case "review": {
      if (!spec.executor || !spec.revisor) {
        throw new TeamError('team review exige "executor" e "revisor"');
      }
      break;
    }
    case "debate": {
      if (!spec.proponentes || spec.proponentes.length < 2 || !spec.moderador) {
        throw new TeamError('team debate exige "proponentes" (min 2) e "moderador"');
      }
      break;
    }
  }
}

export class TeamStore {
  dir(wsPath: string): string {
    return join(wsPath, ".opencorp", "teams");
  }

  caminho(wsPath: string, id: string): string {
    return join(this.dir(wsPath), `${id}.json`);
  }

  validarTexto(texto: string, onde: string): TeamSpec {
    let bruto: unknown;
    try {
      bruto = JSON.parse(texto);
    } catch (erro) {
      throw new TeamError(`${onde}: JSON inválido — ${erro instanceof Error ? erro.message : String(erro)}`);
    }
    const r = teamSchema.safeParse(bruto);
    if (!r.success) {
      const detalhe = r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new TeamError(`${onde}: spec inválido — ${detalhe}`);
    }
    validarPadrao(r.data);
    return r.data;
  }

  async criar(wsPath: string, dados: { id: string; titulo: string; padrao: TeamSpec["padrao"] } & Partial<TeamSpec>): Promise<TeamSpec> {
    const spec: TeamSpec = {
      id: dados.id,
      titulo: dados.titulo,
      padrao: dados.padrao,
      passos: dados.passos,
      paralelos: dados.paralelos,
      sintese: dados.sintese,
      executor: dados.executor,
      revisor: dados.revisor,
      turnos: dados.turnos,
      proponentes: dados.proponentes,
      moderador: dados.moderador,
      max_mensagens_auto_h: dados.max_mensagens_auto_h,
      criado_em: new Date().toISOString(),
    };
    await this.salvar(wsPath, spec);
    return spec;
  }

  async salvar(wsPath: string, spec: TeamSpec): Promise<void> {
    const valido = this.validarTexto(JSON.stringify(spec), "spec");
    await mkdirRecursive(this.dir(wsPath));
    await writeFileAtomic(this.caminho(wsPath, valido.id), `${JSON.stringify(valido, null, 2)}\n`);
    eventBus.emit("team.salvo", { team: valido.id });
  }

  listar(wsPath: string): { id: string; titulo: string; padrao: string; passos: number }[] {
    const dir = this.dir(wsPath);
    if (!existsSync(dir)) return [];
    const saida: { id: string; titulo: string; padrao: string; passos: number }[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      try {
        const spec = this.validarTexto(readFileSync(join(dir, f), "utf8"), f);
        let unidades = 0;
        switch (spec.padrao) {
          case "pipeline":
            unidades = spec.passos?.length ?? 0;
            break;
          case "fanout":
            unidades = spec.paralelos?.length ?? 0;
            break;
          case "review":
            unidades = 2;
            break;
          case "debate":
            unidades = (spec.proponentes?.length ?? 0) + 1;
            break;
        }
        saida.push({
          id: spec.id,
          titulo: spec.titulo,
          padrao: spec.padrao,
          passos: unidades,
        });
      } catch {
        continue;
      }
    }
    return saida.sort((a, b) => a.id.localeCompare(b.id));
  }

  obter(wsPath: string, id: string): TeamSpec {
    const path = this.caminho(wsPath, id);
    if (!existsSync(path)) {
      const e = new TeamError(`team "${id}" não encontrado — veja "opencorp team list"`);
      (e as { status?: number }).status = 404;
      throw e;
    }
    return this.validarTexto(readFileSync(path, "utf8"), path);
  }

  async excluir(wsPath: string, id: string): Promise<void> {
    this.obter(wsPath, id);
    const { unlink } = await import("node:fs/promises");
    await unlink(this.caminho(wsPath, id));
    eventBus.emit("team.excluido", { team: id });
  }
}