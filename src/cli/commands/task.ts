import type { Command } from "commander";
import { TaskStore, type Task } from "../../core/task-store.js";
import { WorkspaceManager } from "../../core/workspace-manager.js";

function reportar(erro: unknown): void {
  if (erro instanceof Error) {
    const exitCode = (erro as { exitCode?: number }).exitCode;
    console.error(`erro: ${erro.message}`);
    process.exitCode = exitCode ?? 1;
    return;
  }
  console.error(`erro inesperado: ${String(erro)}`);
  process.exitCode = 1;
}

async function comErros(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (erro) {
    reportar(erro);
  }
}

function linhaTask(t: Task): string {
  const labels = t.labels.length > 0 ? ` [${t.labels.join(",")}]` : "";
  const resp = t.responsavel.length > 0 ? ` → ${t.responsavel}` : "";
  const due = t.due ? ` (due ${t.due.slice(0, 10)})` : "";
  return `${t.id}  ${t.coluna.padEnd(10)}${t.prioridade.padEnd(7)}${t.titulo}${labels}${resp}${due}`;
}

export function registerTaskCommand(program: Command): void {
  const manager = new WorkspaceManager();
  const store = new TaskStore();

  function wsDe(opts: { workspace?: string }): string | undefined {
    return opts.workspace ?? (program.opts() as { workspace?: string }).workspace;
  }

  const task = program
    .command("task")
    .description(
      "quadro kanban interno com chat por task — colunas padrão: backlog, fazendo, bloqueado, feito (outras são criadas ao mover); agentes participam do chat com --autor agente:<id>",
    );

  task
    .command("create")
    .requiredOption("--titulo <titulo>", "título da task")
    .option("--descricao <texto>", "descrição")
    .option("--coluna <coluna>", "coluna inicial (padrão backlog)")
    .option("--prioridade <p>", "baixa|media|alta", "media")
    .option("--labels <lista>", "labels separados por vírgula")
    .option("--responsavel <quem>", "humano ou agente:<id>")
    .option("--due <data>", "prazo (ISO ou AAAA-MM-DD)")
    .option("--pai <task-id>", "task pai (fan-out)")
    .option("--bloqueado-por <ids>", "ids de tasks dependentes, separados por vírgula")
    .description("cria uma task no quadro")
    .action((opts: Record<string, string | undefined>) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        const t = await store.criar(ws.path, {
          titulo: opts["titulo"] as string,
          descricao: opts["descricao"],
          coluna: opts["coluna"],
          prioridade: opts["prioridade"] as "baixa" | "media" | "alta" | undefined,
          labels: (opts["labels"] as string | undefined)?.split(",").map((x) => x.trim()).filter(Boolean),
          responsavel: opts["responsavel"],
          due: opts["due"],
          task_pai: opts["pai"],
          bloqueado_por: (opts["bloqueadoPor"] as string | undefined)?.split(",").map((x) => x.trim()).filter(Boolean),
        });
        console.log(`ok: ${t.id} criada em "${t.coluna}" — ${t.titulo}`);
      }),
    );

  task
    .command("list")
    .option("--coluna <coluna>", "filtra por coluna")
    .option("--responsavel <quem>", "filtra por responsável")
    .description("lista as tasks do quadro")
    .action((opts: { coluna?: string; responsavel?: string; workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        const lista = await store.listar(ws.path, { coluna: opts.coluna, responsavel: opts.responsavel });
        if (lista.length === 0) {
          console.log('quadro vazio — crie com: opencorp task create --titulo "..."');
          return;
        }
        for (const t of lista) console.log(linhaTask(t));
      }),
    );

  task
    .command("show")
    .argument("<id>", "id da task")
    .description("mostra detalhes da task e o chat")
    .action((id: string, opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        const t = await store.obter(ws.path, id);
        console.log(`${t.titulo} (${t.id})`);
        console.log(`coluna=${t.coluna} prioridade=${t.prioridade} responsavel=${t.responsavel || "-"}`);
        if (t.labels.length > 0) console.log(`labels: ${t.labels.join(", ")}`);
        if (t.due) console.log(`due: ${t.due}`);
        if (t.bloqueado_por.length > 0) console.log(`bloqueado por: ${t.bloqueado_por.join(", ")}`);
        if (t.lock_por) console.log(`lock: ${t.lock_por} até ${t.lock_expira}`);
        console.log(`criada por ${t.criado_por} em ${t.criado_em}`);
        if (t.descricao) console.log(`\n${t.descricao}`);
        const msgs = await store.chat(ws.path, id);
        if (msgs.length > 0) {
          console.log(`\n── chat (${msgs.length}) ──`);
          for (const m of msgs) {
            const menciona = m.menciona.length > 0 ? ` → ${m.menciona.map((x) => "@" + x.replace(/^agente:/, "")).join(" ")}` : "";
            console.log(`${m.criado_em.slice(0, 16).replace("T", " ")} ${m.autor.padEnd(18)} ${m.corpo}${menciona}`);
          }
        }
      }),
    );

  task
    .command("move")
    .argument("<id>", "id da task")
    .requiredOption("--coluna <coluna>", "coluna destino")
    .option("--pos <n>", "posição ordinal na coluna (1 = topo)", Number)
    .description("move a task de coluna/posição")
    .action((id: string, opts: { coluna: string; pos?: number; workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        const t = await store.mover(ws.path, id, opts.coluna, opts.pos);
        console.log(`ok: ${t.id} → "${t.coluna}"`);
      }),
    );

  task
    .command("assign")
    .argument("<id>", "id da task")
    .argument("<responsavel>", "humano ou agente:<id>")
    .description("atribui a task a alguém")
    .action((id: string, responsavel: string, opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        const t = await store.atribuir(ws.path, id, responsavel);
        console.log(`ok: ${t.id} → ${t.responsavel}`);
      }),
    );

  task
    .command("label")
    .argument("<id>", "id da task")
    .option("--add <lista>", "labels para adicionar, separados por vírgula")
    .option("--remove <lista>", "labels para remover, separados por vírgula")
    .description("adiciona ou remove labels")
    .action((id: string, opts: { add?: string; remove?: string; workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        if (opts.add) {
          const t = await store.label(ws.path, id, "add", opts.add.split(",").map((x) => x.trim()).filter(Boolean));
          console.log(`ok: labels de ${t.id}: [${t.labels.join(", ")}]`);
        }
        if (opts.remove) {
          const t = await store.label(ws.path, id, "remove", opts.remove.split(",").map((x) => x.trim()).filter(Boolean));
          console.log(`ok: labels de ${t.id}: [${t.labels.join(", ")}]`);
        }
        if (!opts.add && !opts.remove) {
          console.error("erro: use --add e/ou --remove");
          process.exitCode = 1;
        }
      }),
    );

  task
    .command("chat")
    .argument("<id>", "id da task")
    .option("--msg <texto>", "posta uma mensagem no chat da task")
    .option("--autor <quem>", "humano (padrão) ou agente:<id>", "humano")
    .option("--tipo <tipo>", "comentario|handoff|sistema|artefato|decisao", "comentario")
    .option("--ref <caminho>", "referência de artefato (repetível)", (v: string, acc: string[] = []) => [...acc, v])
    .description("sem --msg mostra o chat; com --msg posta uma mensagem (@nome menciona um agente)")
    .action((id: string, opts: { msg?: string; autor: string; tipo: string; ref?: string[]; workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        if (!opts.msg) {
          const msgs = await store.chat(ws.path, id);
          if (msgs.length === 0) {
            console.log(`chat vazio — poste com: opencorp task chat ${id} --msg "..."`);
            return;
          }
          for (const m of msgs) {
            const menciona = m.menciona.length > 0 ? ` → ${m.menciona.map((x) => "@" + x.replace(/^agente:/, "")).join(" ")}` : "";
            console.log(`${m.criado_em.slice(0, 16).replace("T", " ")} ${m.autor.padEnd(18)} ${m.corpo}${menciona}`);
          }
          return;
        }
        const m = await store.mensagem(ws.path, id, {
          autor: opts.autor,
          corpo: opts.msg,
          tipo: opts.tipo as "comentario",
          refs: opts.ref,
        });
        console.log(`ok: ${m.id} no chat de ${id}${m.menciona.length > 0 ? ` (menções: ${m.menciona.join(", ")})` : ""}`);
      }),
    );

  task
    .command("columns")
    .description("lista as colunas do quadro")
    .action((opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        for (const c of await store.colunas(ws.path)) console.log(c);
      }),
    );

  task
    .command("delete")
    .argument("<id>", "id da task")
    .description("exclui a task e seu chat")
    .action((id: string, opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        await store.excluir(ws.path, id);
        console.log(`ok: ${id} excluída`);
      }),
    );
}
