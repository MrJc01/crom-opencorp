import { existsSync, readFileSync } from "node:fs";
import type { Command } from "commander";
import { AgentStore } from "../../core/agent-store.js";
import { RegistryStore } from "../../core/registry-store.js";
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

function dividirCatId(catId: string): { categoria: string; id: string } {
  const partes = catId.split("/");
  if (partes.length !== 2 || partes[0]!.length === 0 || partes[1]!.length === 0) {
    console.error(`erro: referência inválida "${catId}" — use o formato <categoria>/<id> (ex.: notas/probe)`);
    process.exitCode = 1;
    throw new Error("__uso__");
  }
  return { categoria: partes[0]!, id: partes[1]! };
}

export function registerRegistryCommand(program: Command): void {
  const manager = new WorkspaceManager();
  const store = new RegistryStore();
  const agentes = new AgentStore();

  async function workspaceAlvo(workspaceId?: string) {
    return manager.resolver(workspaceId);
  }

  async function ceosDe(wsPath: string): Promise<string[]> {
    const lista = await agentes.listar(wsPath);
    return lista.filter((a) => a.category === "ceo").map((a) => a.id);
  }

  const registry = program.command("registry").description("registros globais por categoria");

  registry
    .command("list")
    .argument("[categoria]", "filtra por categoria")
    .description("lista categorias com contagem e seus registros")
    .action((categoria: string | undefined, opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await workspaceAlvo(opts.workspace);
        await store.garantirCategorias(ws.path);
        if (categoria) {
          const registros = await store.listar(ws.path, categoria);
          console.log(`${categoria} (${registros.length} registro(s))`);
          for (const meta of registros) {
            console.log(`  ${meta.id} — ${meta.descricao} (por ${meta.criado_por})`);
          }
          return;
        }
        const grupos = await store.listarCategorias(ws.path);
        for (const g of grupos) {
          console.log(`${g.categoria} (${g.registros.length} registro(s))`);
          for (const meta of g.registros) {
            console.log(`  ${meta.id} — ${meta.descricao} (por ${meta.criado_por})`);
          }
        }
      }),
    );

  registry
    .command("create")
    .argument("<cat-id>", "categoria/id (ex.: notas/probe)")
    .requiredOption("-d, --descricao <texto>", "descrição clara do registro")
    .option("--perm-leitura <lista>", "quem pode ler (padrão: *)", "*")
    .option("--perm-escrita <lista>", "quem pode escrever (padrão: criador + CEOs)", "")
    .option("--por <agente>", "autor simulado (padrão: humano)", "humano")
    .description("cria um registro (conteúdo pode ser adicionado via update)")
    .action((catId: string, opts: { descricao: string; permLeitura: string; permEscrita: string; por: string; workspace?: string }) =>
      comErros(async () => {
        const { categoria, id } = dividirCatId(catId);
        const ws = await workspaceAlvo(opts.workspace);
        const meta = await store.criar(ws.path, {
          categoria,
          id,
          descricao: opts.descricao,
          criadoPor: opts.por,
          permLeitura: splitLista(opts.permLeitura),
          permEscrita: splitLista(opts.permEscrita) ?? undefined,
          agentesCEO: await ceosDe(ws.path),
        });
        console.log(`ok: registro "${meta.categoria}/${meta.id}" criado (escrita: ${meta.permissoes.escrita.join(", ") || "—"})`);
      }),
    );

  registry
    .command("get")
    .argument("<cat-id>", "categoria/id do registro")
    .description("mostra meta, journal e conteúdo do registro")
    .action((catId: string, opts: { workspace?: string }) =>
      comErros(async () => {
        const { categoria, id } = dividirCatId(catId);
        const ws = await workspaceAlvo(opts.workspace);
        const r = await store.obter(ws.path, categoria, id);
        console.log(`id:          ${r.meta.id}`);
        console.log(`categoria:   ${r.meta.categoria}`);
        console.log(`descrição:   ${r.meta.descricao}`);
        console.log(`criado_por:  ${r.meta.criado_por}`);
        console.log(`criado_em:   ${r.meta.criado_em}`);
        console.log(`atualizado:  ${r.meta.atualizado_em}`);
        console.log(`permissoes:  leitura [${r.meta.permissoes.leitura.join(", ")}] · escrita [${r.meta.permissoes.escrita.join(", ")}] · meta [${r.meta.permissoes.modificacao_meta.join(", ")}]`);
        if (r.meta.tags.length > 0) console.log(`tags:        ${r.meta.tags.join(", ")}`);
        if (r.conteudo !== undefined && r.conteudo.trim().length > 0) {
          console.log("\n----- conteúdo -----");
          process.stdout.write(r.conteudo.endsWith("\n") ? r.conteudo : `${r.conteudo}\n`);
        }
        console.log(`\n----- journal (${r.journal.length} evento(s), append-only) -----`);
        for (const ev of r.journal) {
          console.log(`  ${ev.ts.slice(0, 19).replace("T", " ")} [${ev.por}] ${ev.evento} — ${ev.resumo}`);
        }
      }),
    );

  registry
    .command("update")
    .argument("<cat-id>", "categoria/id do registro")
    .option("--conteudo <texto>", "novo conteúdo (conteudo.md)")
    .option("--conteudo-arquivo <arquivo>", "novo conteúdo a partir de um arquivo")
    .option("--descricao <texto>", "nova descrição")
    .option("--por <agente>", "autor simulado (padrão: humano)", "humano")
    .description("atualiza conteúdo/descrição (append no journal)")
    .action((catId: string, opts: { conteudo?: string; conteudoArquivo?: string; descricao?: string; por: string; workspace?: string }) =>
      comErros(async () => {
        const { categoria, id } = dividirCatId(catId);
        const ws = await workspaceAlvo(opts.workspace);
        let conteudo = opts.conteudo;
        if (opts.conteudoArquivo) {
          if (!existsSync(opts.conteudoArquivo)) {
            console.error(`erro: arquivo não encontrado: ${opts.conteudoArquivo}`);
            process.exitCode = 1;
            return;
          }
          conteudo = readFileSync(opts.conteudoArquivo, "utf8");
        }
        await store.atualizar(ws.path, categoria, id, opts.por, {
          conteudo,
          descricao: opts.descricao,
        });
        console.log(`ok: "${categoria}/${id}" atualizado (evento appendado no journal)`);
      }),
    );

  registry
    .command("log")
    .argument("<cat-id>", "categoria/id do registro")
    .argument("<anotacao>", "anotação a anexar no journal")
    .option("--por <agente>", "autor simulado (padrão: humano)", "humano")
    .description("anexa uma anotação no journal (append-only)")
    .action((catId: string, anotacao: string, opts: { por: string; workspace?: string }) =>
      comErros(async () => {
        const { categoria, id } = dividirCatId(catId);
        const ws = await workspaceAlvo(opts.workspace);
        await store.anotar(ws.path, categoria, id, opts.por, anotacao);
        console.log(`ok: anotação anexada ao journal de "${categoria}/${id}"`);
      }),
    );

  registry
    .command("perms")
    .argument("<cat-id>", "categoria/id do registro")
    .option("--leitura <lista>", "nova lista de leitura")
    .option("--escrita <lista>", "nova lista de escrita")
    .option("--meta <lista>", "nova lista de modificação de meta")
    .option("--por <agente>", "autor simulado (padrão: humano)", "humano")
    .description("ajusta as permissões do registro")
    .action((catId: string, opts: { leitura?: string; escrita?: string; meta?: string; por: string; workspace?: string }) =>
      comErros(async () => {
        const { categoria, id } = dividirCatId(catId);
        const ws = await workspaceAlvo(opts.workspace);
        const meta = await store.perms(ws.path, categoria, id, opts.por, {
          leitura: splitLista(opts.leitura),
          escrita: splitLista(opts.escrita),
          meta: splitLista(opts.meta),
        });
        console.log(`ok: permissões de "${categoria}/${id}" — leitura [${meta.permissoes.leitura.join(", ")}] · escrita [${meta.permissoes.escrita.join(", ")}] · meta [${meta.permissoes.modificacao_meta.join(", ")}]`);
      }),
    );

  registry
    .command("search")
    .argument("<termo>", "termo de busca (LIKE em descrição, conteúdo e tags)")
    .description("busca por texto no índice SQLite")
    .action((termo: string, opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await workspaceAlvo(opts.workspace);
        const resultados = await store.buscar(ws.path, termo);
        if (resultados.length === 0) {
          console.log(`nenhum resultado para "${termo}"`);
          return;
        }
        console.log(`${resultados.length} resultado(s) para "${termo}":`);
        for (const r of resultados) {
          console.log(`  ${r.categoria}/${r.id} — ${r.descricao}`);
        }
      }),
    );

  registry
    .command("reindex")
    .description("reconstrói o SQLite (corp.db) varrendo as pastas — a verdade são os arquivos")
    .action((opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await workspaceAlvo(opts.workspace);
        const r = await store.reindexar(ws.path);
        console.log(`ok: índice reconstruído — ${r.registros} registro(s), ${r.eventos} evento(s) de journal, ${r.sessoes} sessão(ões)`);
      }),
    );
}

function splitLista(bruto: string | undefined): string[] | undefined {
  if (bruto === undefined) return undefined;
  return bruto
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
