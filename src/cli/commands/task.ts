import type { Command } from "commander";
import { TaskStore, type Task } from "../../core/task-store.js";
import { WorkspaceManager } from "../../core/workspace-manager.js";
import { SessionManager } from "../../core/session-manager.js";

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

export async function executarTask(
  store: TaskStore,
  wsPath: string,
  wsId: string,
  taskId: string,
  opts: { agent?: string; model?: string } = {},
): Promise<void> {
  const t = await store.obter(wsPath, taskId);

  // 1. Resolve o agente executor
  let agente = opts.agent;
  if (!agente) {
    if (t.responsavel && t.responsavel.trim() !== "" && t.responsavel !== "humano") {
      agente = t.responsavel.replace(/^agente:/, "").trim();
    }
  }
  if (!agente) {
    agente = "executor-padrao";
  }

  // 2. Move para "fazendo"
  if (t.coluna !== "fazendo" && t.coluna !== "em_andamento") {
    await store.mover(wsPath, taskId, "fazendo");
  }

  // 3. Registra início no chat da task
  await store.mensagem(wsPath, taskId, {
    autor: `agente:${agente}`,
    corpo: `Iniciando execução da tarefa: "${t.titulo}"`,
    tipo: "comentario",
  });

  console.log(`[task run] executando task ${taskId} com agente "${agente}"...`);

  // 4. Constrói instrução detalhada com o contexto da task
  const partesOrdem = [
    `Você é o agente "${agente}" executando a task ${t.id} no workspace "${wsId}".`,
    `Título: ${t.titulo}`,
    t.descricao ? `Descrição:\n${t.descricao}` : "",
    t.labels.length > 0 ? `Labels: ${t.labels.join(", ")}` : "",
    `\nObjetivo: Execute todas as ações e ferramentas necessárias para resolver completamente esta tarefa. Reporte o resultado detalhado com o que foi feito e validado.`,
  ];
  const ordem = partesOrdem.filter(Boolean).join("\n\n");

  // 5. Executa via SessionManager
  const sessoes = new SessionManager();
  const r = await sessoes.rodar({
    agente,
    ordem,
    model: opts.model,
    workspaceId: wsId,
    gatilho: { tipo: "manual", origem: `task:${taskId}` },
  });

  // 6. Trata o desfecho da execução
  if (r.status === "concluido") {
    await store.mover(wsPath, taskId, "feito");
    await store.mensagem(wsPath, taskId, {
      autor: `agente:${agente}`,
      corpo: `Tarefa concluída com sucesso! (sessão: ${r.id}, duração: ${((r.duracao_ms ?? 0) / 1000).toFixed(1)}s)`,
      tipo: "comentario",
    });
    console.log(`ok: ${taskId} concluída pelo agente "${agente}" e movida para "feito" (sessão ${r.id}, exit: 0)`);
  } else if (r.status === "hitl_pendente") {
    await store.mensagem(wsPath, taskId, {
      autor: "sistema",
      corpo: `Execução pausada: requer aprovação humana (HITL) na sessão ${r.id}. Use "oc approvals list" para revisar.`,
      tipo: "handoff",
    });
    console.log(`aviso: task ${taskId} requer aprovação humana (HITL) — consulte "oc approvals list"`);
  } else {
    await store.mover(wsPath, taskId, "bloqueado");
    const preview = r.captura ? r.captura.slice(-300).trim() : `exit code ${r.exit_code}`;
    await store.mensagem(wsPath, taskId, {
      autor: `agente:${agente}`,
      corpo: `Falha na execução: ${preview}\n(log: ${r.log})`,
      tipo: "comentario",
    });
    console.error(`erro: execução da task ${taskId} falhou (status: ${r.status}, exit: ${r.exit_code ?? 1}) — movida para "bloqueado"`);
    process.exitCode = r.exit_code ?? 1;
  }
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
    .option("--run", "executa a task imediatamente após a criação com o agente responsável")
    .option("--model <provider/model>", "sobrepõe o modelo do agente (usado com --run)")
    .description("cria uma task no quadro (use --run para executar agora)")
    .action((opts: Record<string, any>) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        const t = await store.criar(ws.path, {
          titulo: opts["titulo"] as string,
          descricao: opts["descricao"] as string | undefined,
          coluna: (opts["coluna"] as string) || (opts["run"] ? "fazendo" : undefined),
          prioridade: opts["prioridade"] as "baixa" | "media" | "alta" | undefined,
          labels: (opts["labels"] as string | undefined)?.split(",").map((x) => x.trim()).filter(Boolean),
          responsavel: opts["responsavel"] as string | undefined,
          due: opts["due"] as string | undefined,
          task_pai: opts["pai"] as string | undefined,
          bloqueado_por: (opts["bloqueadoPor"] as string | undefined)?.split(",").map((x) => x.trim()).filter(Boolean),
        });
        console.log(`ok: ${t.id} criada em "${t.coluna}" — ${t.titulo}`);

        if (opts["run"]) {
          await executarTask(store, ws.path, ws.id, t.id, {
            agent: (opts["responsavel"] as string | undefined)?.replace(/^agente:/, ""),
            model: opts["model"] as string | undefined,
          });
        }
      }),
    );

  task
    .command("run")
    .argument("<id>", "id da task para executar agora")
    .option("--agent <id>", "sobrepõe o agente executor (padrão: o responsável da task ou executor-padrao)")
    .option("--model <provider/model>", "sobrepõe o modelo do agente")
    .description("executa uma task imediatamente usando o agente responsável")
    .action((id: string, opts: { agent?: string; model?: string; workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        await executarTask(store, ws.path, ws.id, id, opts);
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
    .command("status")
    .argument("<id>", "id da task")
    .option("--limite <n>", "quantidade de ações/mensagens recentes do chat a exibir (padrão: 5)", "5")
    .option("--json", "saída em formato JSON estruturado")
    .description("consulta o status operacional detalhado de uma task (estado, execuções e últimas ações no chat)")
    .action((id: string, opts: { limite: string; json?: boolean; workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        const t = await store.obter(ws.path, id);
        const msgs = await store.chat(ws.path, id);
        const qtdLimite = Math.max(1, parseInt(opts.limite, 10) || 5);
        const ultimasAcoes = msgs.slice(-qtdLimite);

        const sessoes = new SessionManager();
        let execs: any[] = [];
        try {
          const todasExecs = await sessoes.listarExecucoes(ws.path);
          execs = todasExecs.filter(
            (e) => e.gatilho?.origem === id || e.gatilho?.origem === `task:${id}`,
          );
        } catch {}

        const ultimaExec = execs.length > 0 ? execs[0] : null;

        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                id: t.id,
                titulo: t.titulo,
                coluna: t.coluna,
                prioridade: t.prioridade,
                responsavel: t.responsavel || null,
                labels: t.labels,
                criado_em: t.criado_em,
                atualizado_em: t.atualizado_em,
                descricao: t.descricao,
                ultima_execucao: ultimaExec
                  ? {
                      id: ultimaExec.id,
                      agente: ultimaExec.agente,
                      status: ultimaExec.status,
                      inicio: ultimaExec.inicio,
                      exit_code: ultimaExec.exit_code,
                    }
                  : null,
                total_mensagens: msgs.length,
                ultimas_acoes: ultimasAcoes.map((m) => ({
                  autor: m.autor,
                  tipo: m.tipo,
                  corpo: m.corpo,
                  menciona: m.menciona,
                  criado_em: m.criado_em,
                })),
              },
              null,
              2,
            ),
          );
          return;
        }

        console.log(`\n━━━ Task Status: ${t.id} ━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`Título:       ${t.titulo}`);
        console.log(`Coluna:       ${t.coluna}`);
        console.log(`Responsável:  ${t.responsavel || "(não atribuído)"}`);
        console.log(`Prioridade:   ${t.prioridade}`);
        if (t.labels.length > 0) console.log(`Labels:       [${t.labels.join(", ")}]`);
        console.log(`Criado em:    ${t.criado_em}`);

        if (ultimaExec) {
          console.log(`\n● Execução Vinculada`);
          console.log(`  Sessão:     ${ultimaExec.id}`);
          console.log(`  Agente:     ${ultimaExec.agente}`);
          console.log(`  Status:     ${ultimaExec.status}`);
          console.log(`  Início:     ${ultimaExec.inicio}`);
          if (ultimaExec.exit_code !== undefined && ultimaExec.exit_code !== null) {
            console.log(`  Exit code:  ${ultimaExec.exit_code}`);
          }
        }

        if (ultimasAcoes.length > 0) {
          console.log(`\n● Últimas Ações no Chat (${ultimasAcoes.length} de ${msgs.length} mensagens)`);
          for (const m of ultimasAcoes) {
            const dataStr = m.criado_em ? m.criado_em.slice(0, 16).replace("T", " ") : "";
            const menciona = m.menciona && m.menciona.length > 0 ? ` → ${m.menciona.map((x) => "@" + x.replace(/^agente:/, "")).join(" ")}` : "";
            console.log(`  [${dataStr}] ${m.autor}${menciona}:`);
            // Se o corpo for multilinhas, indenta com 4 espaços
            const corpoFormatado = m.corpo
              .split("\n")
              .map((linha) => `    ${linha}`)
              .join("\n");
            console.log(`${corpoFormatado}\n`);
          }
        } else {
          console.log(`\n● Chat: nenhuma ação ou comentário registrado`);
        }

        console.log("");
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
