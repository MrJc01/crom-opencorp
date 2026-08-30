import type { Command } from "commander";
import { TeamStore, type TeamSpec, type Passo } from "../../core/team-store.js";
import { OrquestradorDeTeams } from "../../core/team-orchestrator.js";
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

function parseAgenteOrdem(valor: string): Passo {
  const idx = valor.indexOf(":");
  if (idx === -1) {
    const msg = 'formato inválido — use "<agente>:<ordem>" — ex.: --passo "executor-padrao:revise {{entrada}}"';
    const e = new Error(msg);
    (e as { exitCode?: number }).exitCode = 2;
    throw e;
  }
  const agente = valor.slice(0, idx).trim();
  const ordem = valor.slice(idx + 1).trim();
  if (!agente || !ordem) {
    const msg = 'formato inválido — use "<agente>:<ordem>" — ex.: --passo "executor-padrao:revise {{entrada}}"';
    const e = new Error(msg);
    (e as { exitCode?: number }).exitCode = 2;
    throw e;
  }
  return { agente, ordem };
}

export function registerTeamCommand(program: Command): void {
  const store = new TeamStore();
  const manager = new WorkspaceManager();

  function wsDe(opts: { workspace?: string }): string | undefined {
    return opts.workspace ?? (program.opts() as { workspace?: string }).workspace;
  }

  const team = program
    .command("team")
    .description(
      "teams multi-agente: pipeline | fanout | review | debate — define spec JSON em <ws>/.opencorp/teams/ e executa via orquestrador",
    );

  // team create <id>
  team
    .command("create")
    .argument("<id>", "id do team (kebab-case)")
    .requiredOption("--titulo <t>", "título do team")
    .requiredOption("--padrao <p>", "padrão: pipeline | fanout | review | debate")
    .option("--passo <agente:ordem>", "passo do pipeline (repetível)", (v: string, acc: Passo[]) => [...acc, parseAgenteOrdem(v)], [])
    .option("--paralelo <agente:ordem>", "paralelo do fanout (repetível)", (v: string, acc: Passo[]) => [...acc, parseAgenteOrdem(v)], [])
    .option("--sintese <agente:ordem>", "síntese do fanout (opcional)", parseAgenteOrdem)
    .option("--executor <agente:ordem>", "executor do review", parseAgenteOrdem)
    .option("--revisor <agente:ordem>", "revisor do review", parseAgenteOrdem)
    .option("--turnos <n>", "turnos máximos do review (padrão 2)", Number)
    .option("--proponente <agente:ordem>", "proponente do debate (repetível, min 2)", (v: string, acc: Passo[]) => [...acc, parseAgenteOrdem(v)], [])
    .option("--moderador <agente:ordem>", "moderador do debate", parseAgenteOrdem)
    .description("cria um team spec no workspace")
    .action(
      (
        id: string,
        opts: {
          titulo: string;
          padrao: TeamSpec["padrao"];
          passo: Passo[];
          paralelo: Passo[];
          sintese?: Passo;
          executor?: Passo;
          revisor?: Passo;
          turnos?: number;
          proponente: Passo[];
          moderador?: Passo;
          workspace?: string;
        },
      ) =>
        comErros(async () => {
          const ws = await manager.resolver(wsDe(opts));
          const spec = await store.criar(ws.path, {
            id,
            titulo: opts.titulo,
            padrao: opts.padrao,
            passos: opts.passo.length > 0 ? opts.passo : undefined,
            paralelos: opts.paralelo.length > 0 ? opts.paralelo : undefined,
            sintese: opts.sintese,
            executor: opts.executor,
            revisor: opts.revisor,
            turnos: opts.turnos,
            proponentes: opts.proponente.length > 0 ? opts.proponente : undefined,
            moderador: opts.moderador,
          });
          console.log(`ok: team "${id}" criado (${spec.padrao}) — ${store.caminho(ws.path, spec.id)}`);
          console.log(`    execute com: opencorp team run ${id} --entrada "..."`);
        }),
    );

  // team list
  team
    .command("list")
    .description("lista os teams do workspace")
    .action((opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        const lista = store.listar(ws.path);
        if (lista.length === 0) {
          console.log('nenhum team — crie com: opencorp team create <id> --titulo "..." --padrao pipeline --passo "a:x"');
          return;
        }
        for (const t of lista) {
          console.log(`${t.id.padEnd(22)}${t.padrao.padEnd(9)}${String(t.passos).padEnd(10)}${t.titulo}`);
        }
      }),
    );

  // team show <id>
  team
    .command("show")
    .argument("<id>", "id do team")
    .description("mostra o spec completo do team")
    .action((id: string, opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        const spec = store.obter(ws.path, id);
        console.log(JSON.stringify(spec, null, 2));
      }),
    );

  // team delete <id>
  team
    .command("delete")
    .argument("<id>", "id do team")
    .description("exclui o team")
    .action((id: string, opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        await store.excluir(ws.path, id);
        console.log(`ok: ${id} excluído`);
      }),
    );

  // team run <id> --entrada <texto>
  team
    .command("run")
    .argument("<id>", "id do team")
    .requiredOption("--entrada <texto>", "entrada para o team")
    .description("executa o team via orquestrador")
    .action((id: string, opts: { entrada: string; workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        const orq = new OrquestradorDeTeams();
        const res = await orq.executar(ws.path, id, opts.entrada);

        console.log(`ok: team "${id}" executado — task ${res.task_id} em "${res.status_final}"`);
        console.log("passos:");
        for (let i = 0; i < res.passos.length; i++) {
          const p = res.passos[i];
          const status = p.ok ? "ok" : "FALHOU";
          const resumo = p.resumo.length > 80 ? p.resumo.slice(0, 80) + "…" : p.resumo;
          console.log(`  ${i + 1}. ${p.agente} ${status} ${resumo}`);
        }

        if (res.status_final !== "feito") {
          process.exitCode = 1;
        }
      }),
    );
}