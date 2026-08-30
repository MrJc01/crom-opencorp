import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { AppError } from "./errors.js";
import { eventBus } from "./event-bus.js";
import { writeFileAtomic, mkdirRecursive } from "../utils/fs-safe.js";

export const widgetSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  tipo: z.enum(["metrica", "tabela", "kanban", "grafico", "formulario", "markdown", "lista_tarefas"]),
  titulo: z.string().min(1),
  fonte: z
    .object({
      rota: z.string().optional(),
      campo_valor: z.string().optional(),
      rotulo_campo: z.string().optional(),
    })
    .default({}),
  acao: z
    .object({
      tipo: z.enum(["flow", "task_move", "post_rota"]),
      flow: z.string().optional(),
      entrada: z.string().optional(),
      rota: z.string().optional(),
      campos: z.array(z.object({ nome: z.string(), rotulo: z.string().optional() })).optional(),
    })
    .optional(),
  texto: z.string().optional(),
});

export const paginaSchema = z.object({
  titulo: z.string().min(1),
  widgets: z.array(widgetSchema).default([]),
});

export const appSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "use kebab-case para o id do app"),
  titulo: z.string().min(1),
  paginas: z.array(paginaSchema).min(1),
});

export type Widget = z.infer<typeof widgetSchema>;
export type PaginaApp = z.infer<typeof paginaSchema>;
export type AppSpec = z.infer<typeof appSchema>;

export class AppStore {
  dir(wsPath: string): string {
    return join(wsPath, ".opencorp", "apps");
  }

  caminho(wsPath: string, id: string): string {
    return join(this.dir(wsPath), `${id}.json`);
  }

  validarTexto(texto: string, onde: string): AppSpec {
    let bruto: unknown;
    try {
      bruto = JSON.parse(texto);
    } catch (erro) {
      throw new AppError(`${onde}: JSON inválido — ${erro instanceof Error ? erro.message : String(erro)}`);
    }
    const r = appSchema.safeParse(bruto);
    if (!r.success) {
      const detalhe = r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new AppError(`${onde}: spec inválido — ${detalhe}`);
    }
    return r.data;
  }

  async criar(wsPath: string, id: string, titulo: string): Promise<AppSpec> {
    const app: AppSpec = {
      id,
      titulo,
      paginas: [{ titulo, widgets: [] }],
    };
    await this.salvar(wsPath, app);
    return app;
  }

  async salvar(wsPath: string, app: AppSpec): Promise<void> {
    const valido = this.validarTexto(JSON.stringify(app), "spec");
    await mkdirRecursive(this.dir(wsPath));
    await writeFileAtomic(this.caminho(wsPath, valido.id), `${JSON.stringify(valido, null, 2)}\n`);
    eventBus.emit("app.salvo", { app: valido.id });
  }

  listar(wsPath: string): { id: string; titulo: string; widgets: number }[] {
    const dir = this.dir(wsPath);
    if (!existsSync(dir)) return [];
    const saida: { id: string; titulo: string; widgets: number }[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      try {
        const app = this.validarTexto(readFileSync(join(dir, f), "utf8"), f);
        saida.push({
          id: app.id,
          titulo: app.titulo,
          widgets: app.paginas.reduce((n, p) => n + p.widgets.length, 0),
        });
      } catch {
        continue;
      }
    }
    return saida.sort((a, b) => a.id.localeCompare(b.id));
  }

  obter(wsPath: string, id: string): AppSpec {
    const path = this.caminho(wsPath, id);
    if (!existsSync(path)) {
      const e = new AppError(`app "${id}" não encontrado — veja "opencorp app list"`);
      (e as { status?: number }).status = 404;
      throw e;
    }
    return this.validarTexto(readFileSync(path, "utf8"), path);
  }

  async excluir(wsPath: string, id: string): Promise<void> {
    this.obter(wsPath, id);
    const { unlink } = await import("node:fs/promises");
    await unlink(this.caminho(wsPath, id));
    eventBus.emit("app.excluido", { app: id });
  }

  /** Specs de exemplo prontos para uso */
  seeds(): Record<string, AppSpec> {
    return {
      "painel-tarefas": {
        id: "painel-tarefas",
        titulo: "Painel de Tarefas",
        paginas: [
          {
            titulo: "Visão geral",
            widgets: [
              { id: "total", tipo: "metrica", titulo: "Tasks totais", fonte: { rota: "/tasks" } },
              { id: "kanban", tipo: "kanban", titulo: "Quadro", fonte: { rota: "/tasks" } },
              { id: "feed", tipo: "tabela", titulo: "Tasks recentes", fonte: { rota: "/tasks", rotulo_campo: "titulo", campo_valor: "coluna" } },
            ],
          },
        ],
      },
      "custos": {
        id: "custos",
        titulo: "Custos",
        paginas: [
          {
            titulo: "Orçamento",
            widgets: [
              { id: "status", tipo: "tabela", titulo: "Status do budget", fonte: { rota: "/budget/status" } },
              { id: "aprovacoes", tipo: "metrica", titulo: "Aprovações pendentes", fonte: { rota: "/approvals" } },
            ],
          },
        ],
      },
    };
  }
}
