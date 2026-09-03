import type { Command } from "commander";
import { HookStore, TriggersStore, type AlvoHook } from "../../core/hook-store.js";
import { WorkspaceManager } from "../../core/workspace-manager.js";
import { opencorpHome } from "../../utils/paths.js";

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

export function registerHookCommands(program: Command): void {
  const store = new HookStore();
  const triggers = new TriggersStore();
  const manager = new WorkspaceManager();

  function wsDe(opts: { workspace?: string }): string | undefined {
    return opts.workspace ?? (program.opts() as { workspace?: string }).workspace;
  }

  function alvoDe(opts: Record<string, string | undefined>): AlvoHook {
    const tipo = opts["alvo"];
    if (tipo === "task_create") {
      return { tipo: "task_create", titulo: opts["titulo"] ?? "", responsavel: opts["responsavel"] };
    }
    if (tipo === "agent_run") {
      return { tipo: "agent_run", agente: opts["agente"] ?? "", ordem: opts["ordem"] ?? "" };
    }
    if (tipo === "flow_run") {
      return { tipo: "flow_run", flow: opts["flow"] ?? "", entrada: opts["entrada"] ?? "{{payload}}" };
    }
    if (tipo === "webhook_out") {
      return {
        tipo: "webhook_out",
        url: opts["url"] ?? "",
        metodo: opts["metodo"],
        corpo: opts["corpo"],
      };
    }
    if (tipo === "pre_publish") {
      return {
        tipo: "pre_publish",
        minimo_chars: opts["minimo_chars"] ? Number(opts["minimo_chars"]) : undefined,
        proibir_scripts: true,
        checar_duplicidade: true,
      };
    }
    throw Object.assign(new Error(`--alvo inválido: "${tipo}" — use task_create|agent_run|flow_run|webhook_out|pre_publish`), {
      exitCode: 1,
    });
  }

  const hook = program
    .command("hook")
    .description(
      "webhooks de entrada: POST público /hooks/:workspace/:id com header x-opencorp-token dispara uma ação ({{campo}} substitui do payload; {{payload}} = JSON completo)",
    );

  hook
    .command("create")
    .requiredOption("--nome <nome>", "nome do hook")
    .requiredOption("--alvo <tipo>", "task_create|agent_run|flow_run|webhook_out")
    .option("--titulo <t>", "alvo task_create: título da task (template)")
    .option("--responsavel <r>", "alvo task_create: responsável")
    .option("--agente <a>", "alvo agent_run: id do agente")
    .option("--ordem <o>", "alvo agent_run: ordem (template)")
    .option("--flow <f>", "alvo flow_run: id do flow")
    .option("--entrada <e>", "alvo flow_run: entrada (template)")
    .option("--url <u>", "alvo webhook_out: URL")
    .option("--metodo <m>", "alvo webhook_out: método HTTP")
    .option("--corpo <c>", "alvo webhook_out: corpo (template)")
    .option("--respond <modo>", "imediato (202) | final (aguarda e responde)", "imediato")
    .option("--dedup-seg <n>", "janela anti-duplicado em segundos (0 desativa)", Number, 60)
    .description("cria um hook de entrada")
    .action((opts: Record<string, string | number | undefined>) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts as Record<string, string | undefined>));
        const h = await store.criar(ws.path, ws.id, {
          nome: String(opts["nome"] ?? ""),
          alvo: alvoDe(opts as Record<string, string | undefined>),
          respond: (opts["respond"] as "imediato" | "final") ?? "imediato",
          dedup_seg: typeof opts["dedupSeg"] === "number" ? opts["dedupSeg"] : 60,
        });
        console.log(`ok: ${h.id} criado`);
        console.log(`  URL:    POST /hooks/${ws.id}/${h.id}`);
        console.log(`  token:  ${h.token}`);
        console.log(`  respond: ${h.respond} · dedup: ${h.dedup_seg}s`);
      }),
    );

  hook
    .command("list")
    .description("lista os hooks do workspace")
    .action((opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        const hooks = store.listar(ws.path);
        if (hooks.length === 0) {
          console.log('nenhum hook — crie com: opencorp hook create --nome "..." --alvo task_create --titulo "..."');
          return;
        }
        for (const h of hooks) {
          console.log(`${h.id}  ${h.respond.padEnd(9)}${h.alvo.tipo.padEnd(13)}${h.nome}  →  POST /hooks/${h.workspace}/${h.id}`);
        }
      }),
    );

  hook
    .command("show")
    .argument("<id>", "id do hook")
    .description("detalhes do hook (inclui token)")
    .action((id: string, opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        console.log(JSON.stringify(store.obter(ws.path, id), null, 2));
      }),
    );

  hook
    .command("test")
    .argument("<id>", "id do hook")
    .option("--payload <json>", "payload de teste", "{}")
    .description("dispara o hook localmente (sem HTTP) com o payload dado")
    .action((id: string, opts: { payload?: string; workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        const h = store.obter(ws.path, id);
        let corpo: Record<string, unknown> = {};
        try {
          corpo = JSON.parse(opts.payload ?? "{}") as Record<string, unknown>;
        } catch {
          throw Object.assign(new Error("--payload não é JSON válido"), { exitCode: 1 });
        }
        const r = await store.executar(ws.path, h, { corpo, query: {} });
        console.log(`ok: ${r.exec_id ?? "(sem id)"} — ${r.resultado.slice(0, 200)}`);
      }),
    );

  hook
    .command("delete")
    .argument("<id>", "id do hook")
    .description("exclui o hook")
    .action((id: string, opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        await store.excluir(ws.path, id);
        console.log(`ok: ${id} excluído`);
      }),
    );

  hook
    .command("pre-publish")
    .description(
      "valida se um conteúdo/post pode ser publicado com segurança (anti-duplicação, anti-scripts que quebram layout)",
    )
    .option("--titulo <t>", "título da publicação")
    .option("--slug <s>", "slug pretendido")
    .option("--arquivo <path>", "caminho de arquivo markdown/html local")
    .option("--conteudo <c>", "conteúdo literal do texto/artigo")
    .option("--tipo <tipo>", "post | pagina | documento | comunicado", "post")
    .option("--json", "saída em JSON estruturado")
    .option("-w, --workspace <id>", "workspace alvo")
    .action((opts: {
      titulo?: string;
      slug?: string;
      arquivo?: string;
      conteudo?: string;
      tipo?: string;
      json?: boolean;
      workspace?: string;
    }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        const { validarPrePublicacao } = await import("../../core/pre-publish.js");
        let texto = opts.conteudo || "";
        if (opts.arquivo && !texto) {
          const { readFileSync } = await import("node:fs");
          texto = readFileSync(opts.arquivo, "utf8");
        }
        const resultado = await validarPrePublicacao(ws.path, {
          titulo: opts.titulo,
          slug: opts.slug,
          conteudo: texto,
          tipo: (opts.tipo as any) || "post",
        });

        if (opts.json) {
          console.log(JSON.stringify(resultado, null, 2));
          if (!resultado.valido) process.exitCode = 1;
          return;
        }

        if (resultado.valido) {
          console.log("\x1b[32m✅ Conteúdo APROVADO para publicação!\x1b[0m");
          if (resultado.avisos.length > 0) {
            console.log("\nAvisos:");
            for (const a of resultado.avisos) console.log(`  • ${a}`);
          }
        } else {
          console.log("\x1b[31m❌ Publicação BLOQUEADA por políticas de qualidade/segurança:\x1b[0m");
          for (const e of resultado.erros) console.log(`  • ${e}`);
          if (resultado.avisos.length > 0) {
            console.log("\nAvisos adicionais:");
            for (const a of resultado.avisos) console.log(`  • ${a}`);
          }
          process.exitCode = 1;
        }
      }),
    );

  const trigger = program
    .command("trigger")
    .description(
      "triggers declarativos: evento interno → ação (ex.: task.concluida → agent_run). Arquivos em ~/.opencorp/triggers/; eventos disponíveis: task.criada, task.movida, task.mensagem, task.concluida, hook.disparo, sessao.concluida (no servidor)",
    );

  trigger
    .command("create")
    .requiredOption("--evento <evento>", "nome do evento (ex.: task.concluida)")
    .requiredOption("--alvo <tipo>", "task_create|agent_run|flow_run|webhook_out")
    .option("--titulo <t>", "alvo task_create: título")
    .option("--agente <a>", "alvo agent_run")
    .option("--ordem <o>", "alvo agent_run: ordem")
    .option("--flow <f>", "alvo flow_run")
    .option("--entrada <e>", "alvo flow_run: entrada")
    .option("--url <u>", "alvo webhook_out")
    .option("--corpo <c>", "alvo webhook_out: corpo")
    .option("--workspace <id>", "workspace do alvo (padrão: ativo)")
    .description("cria um trigger em ~/.opencorp/triggers/")
    .action((opts: Record<string, string | undefined>) =>
      comErros(async () => {
        const wsAtivo = await manager.resolver(wsDe(opts));
        const t = await triggers.criar(opencorpHome(), {
          quando: { evento: opts["evento"] ?? "" },
          alvo: alvoDe(opts),
          workspace: opts["workspace"] ?? wsAtivo.id,
        });
        console.log(`ok: trigger ${t.id} — ${t.quando.evento} → ${t.alvo.tipo}`);
      }),
    );

  trigger
    .command("list")
    .description("lista os triggers do home")
    .action(() =>
      comErros(async () => {
        const lista = triggers.listar(opencorpHome(), true);
        if (lista.length === 0) {
          console.log("nenhum trigger — crie com: opencorp trigger create --evento task.concluida --alvo ...");
          return;
        }
        for (const t of lista) {
          const filtro = t.filtro ? ` (se ${t.filtro.campo}==${t.filtro.valor})` : "";
          console.log(`${t.id}  ${t.quando.evento.padEnd(20)}→ ${t.alvo.tipo.padEnd(12)} ws=${t.workspace ?? "-"}${filtro}`);
        }
      }),
    );

  trigger
    .command("delete")
    .argument("<id>", "id do trigger")
    .description("exclui o trigger")
    .action((id: string) =>
      comErros(async () => {
        await triggers.excluir(opencorpHome(), id);
        console.log(`ok: ${id} excluído`);
      }),
    );
}
