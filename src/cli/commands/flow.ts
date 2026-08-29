import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Command } from "commander";
import { FlowStore } from "../../core/flow-store.js";
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

export function registerFlowCommand(program: Command): void {
  const manager = new WorkspaceManager();
  const store = new FlowStore();

function wsDe(opts: { workspace?: string }): string | undefined {
    return opts.workspace ?? (program.opts() as { workspace?: string }).workspace;
  }

  const flow = program
    .command("flow")
    .description(
      "grafo declarativo executável — tipos de nó v1: manual (gatilho único), agente (config {agente, ordem} — ordem usa {{entrada}} para receber o contexto), saida (config {registro: \"categoria/id\"}) e condicao (config {chave, entao, senao} — rota para o nó entao quando o contexto contém a chave, senão para senao; arestas saindo de condicao são ilustrativas). v1: fluxo linear a partir do gatilho, ramificação só via condicao",
    );

  flow
    .command("create")
    .argument("<id>", "id do flow (kebab-case)")
    .requiredOption("--nome <nome>", "nome do flow")
    .description("cria um flow com gatilho manual e estrutura vazia")
    .action((id: string, opts: { nome: string; workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        const f = await store.criar(ws.path, id, opts.nome);
        console.log(`ok: flow "${f.id}" criado em ${store.caminho(ws.path, f.id)}`);
        console.log("edite os nós/arestas com: opencorp flow edit " + f.id);
      }),
    );

  flow
    .command("list")
    .description("lista os flows do workspace")
    .action((opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        const lista = await store.listar(ws.path);
        if (lista.length === 0) {
          console.log('nenhum flow — crie com: opencorp flow create <id> --nome "..."');
          return;
        }
        console.log("id                    nome                                 nós  arestas");
        for (const f of lista) {
          console.log(`${f.id.padEnd(22)}${f.nome.padEnd(37)}${String(f.nos).padEnd(5)}${f.arestas}`);
        }
      }),
    );

  flow
    .command("show")
    .argument("<id>", "id do flow")
    .description("mostra nós e arestas do flow")
    .action((id: string, opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        const f = await store.obter(ws.path, id);
        console.log(`id:     ${f.id}`);
        console.log(`nome:   ${f.nome}`);
        console.log("nós:");
        for (const n of f.nos) {
          const cfg = JSON.stringify(n.config ?? {});
          console.log(`  ${n.id.padEnd(16)} ${n.tipo.padEnd(9)} ${cfg}`);
        }
        console.log("arestas:");
        if (f.arestas.length === 0) {
          console.log("  (nenhuma)");
        } else {
          for (const a of f.arestas) {
            console.log(`  ${a.de} → ${a.para}`);
          }
        }
      }),
    );

  flow
    .command("edit")
    .argument("<id>", "id do flow")
    .description("abre $EDITOR no JSON do flow (salva apenas se o JSON validar)")
    .action((id: string, opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        if (!process.stdin.isTTY || !process.stdout.isTTY) {
          console.error('erro: "flow edit" precisa de um terminal (TTY) para abrir o $EDITOR');
          process.exitCode = 1;
          return;
        }
        const editor = process.env.EDITOR || process.env.VISUAL;
        if (!editor) {
          console.error("erro: defina $EDITOR (ex.: export EDITOR=vim) para usar flow edit");
          process.exitCode = 1;
          return;
        }
        const atual = store.textoAtual(ws.path, id);
        const tmpDir = await mkdtemp(join(tmpdir(), "opencorp-flow-"));
        const tmpFile = join(tmpDir, `${id}.json`);
        await writeFile(tmpFile, atual, "utf8");
        const res = spawnSync(`${editor} "${tmpFile}"`, { shell: true, stdio: "inherit" });
        if (res.error) {
          console.error(`erro: não foi possível abrir o editor "${editor}": ${res.error.message}`);
          process.exitCode = 1;
          return;
        }
        if (res.status !== 0) {
          console.error(`erro: editor saiu com código ${res.status ?? "?"} — nada foi salvo`);
          process.exitCode = res.status ?? 1;
          return;
        }
        const novo = await readFile(tmpFile, "utf8");
        if (novo === atual) {
          console.log("ok: sem alterações");
          return;
        }
        const flow = store.validarTexto(novo, tmpFile);
        await store.salvar(ws.path, flow);
        console.log(`ok: flow "${flow.id}" salvo e validado`);
      }),
    );

  flow
    .command("delete")
    .argument("<id>", "id do flow")
    .description("apaga o JSON do flow (execuções passadas em registries são preservadas)")
    .action((id: string, opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        await store.deletar(ws.path, id);
        console.log(`ok: flow "${id}" apagado`);
      }),
    );

  flow
    .command("run")
    .argument("<id>", "id do flow")
    .option("--entrada <texto>", "texto de entrada do contexto (disponível como {{entrada}} nas ordens)")
    .option("--model <provider/model>", "modelo usado nos nós agente")
    .description("executa o flow (topológico, a partir do gatilho manual)")
    .action((id: string, opts: { entrada?: string; model?: string; workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        try {
          const r = await store.executar(ws.path, id, { entrada: opts.entrada, model: opts.model });
          console.log(`[flow ${id}] ${r.status} (exec ${r.execId})`);
          for (const n of r.nos) {
            console.log(`  nó ${n.id.padEnd(16)} ${n.tipo.padEnd(9)} ${n.status}${n.exec_id ? ` (exec ${n.exec_id})` : ""}`);
          }
          console.log(`contexto final: ${r.contextoFinal.slice(0, 200)}`);
        } catch (erro) {
          console.error(`erro: ${erro instanceof Error ? erro.message : String(erro)}`);
          process.exitCode = 1;
        }
      }),
    );

  flow
    .command("status")
    .argument("<id>", "id do flow")
    .description("mostra a última execução do flow e o status por nó")
    .action((id: string, opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        const ultima = await store.ultimaExecucao(ws.path, id);
        if (!ultima) {
          console.log(`nenhuma execução registrada para "${id}" — rode: opencorp flow run ${id}`);
          return;
        }
        console.log(`última execução: ${ultima.execId} — status: ${ultima.status} (${ultima.em.slice(0, 19).replace("T", " ")})`);
        for (const n of ultima.nos) {
          console.log(`  nó ${n.id.padEnd(16)} ${n.tipo.padEnd(9)} ${n.status}${n.exec_id ? ` (exec ${n.exec_id})` : ""}`);
        }
        if (ultima.contextoFinal.length > 0) {
          console.log(`contexto final: ${ultima.contextoFinal.slice(0, 200)}`);
        }
      }),
    );
}
