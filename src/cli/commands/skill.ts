import type { Command } from "commander";
import { WorkspaceManager } from "../../core/contexts/workspace/workspace-manager.js";
import { SkillStore } from "../../core/contexts/agents/skill-store.js";

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

export function registerSkillCommand(program: Command): void {
  const manager = new WorkspaceManager();
  const store = new SkillStore();

  function wsDe(opts: { workspace?: string }): string | undefined {
    return opts.workspace ?? (program.opts() as { workspace?: string }).workspace;
  }

  const skill = program
    .command("skill")
    .description("instala, lista e gerencia skills (.opencorp/skills/<nome>/SKILL.md)");

  skill
    .command("instalar")
    .argument("<fonte>", "pasta com SKILL.md, repositório git ou arquivo .tar")
    .description("instala uma skill a partir de uma pasta, git ou tar")
    .action((fonte: string, opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        const instalada = await store.instalar(ws.path, fonte);
        console.log(`ok: skill "${instalada.name}" instalada em ${store.caminhoSkill(ws.path, instalada.name)}`);
      }),
    );

  skill
    .command("listar")
    .option("--json", "saída em formato JSON")
    .description("lista as skills instaladas no workspace")
    .action((opts: { json?: boolean; workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        const lista = await store.listar(ws.path);
        if (opts.json) {
          console.log(JSON.stringify(lista, null, 2));
          return;
        }
        if (lista.length === 0) {
          console.log(`nenhuma skill em ${store.dirSkills(ws.path)}`);
          return;
        }
        for (const s of lista) {
          const meta = [s.versao ? `v${s.versao}` : "", s.allowed_tools.length ? `tools: ${s.allowed_tools.join(",")}` : ""]
            .filter(Boolean)
            .join(" · ");
          console.log(`- ${s.name}${meta ? ` (${meta})` : ""}: ${s.description}`);
        }
      }),
    );

  skill
    .command("mostrar")
    .argument("<nome>", "nome da skill (kebab-case)")
    .option("--json", "saída em formato JSON")
    .description("mostra a SKILL.md completa de uma skill")
    .action((nome: string, opts: { json?: boolean; workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        const s = await store.mostrar(ws.path, nome);
        if (opts.json) {
          console.log(JSON.stringify(s, null, 2));
          return;
        }
        console.log(`skill:      ${s.name}`);
        console.log(`descrição:  ${s.description}`);
        if (s.versao) console.log(`versão:     ${s.versao}`);
        if (s.allowed_tools && s.allowed_tools.length) console.log(`tools:      ${s.allowed_tools.join(", ")}`);
        if (s.requires && s.requires.length) console.log(`requer:     ${s.requires.join(", ")}`);
        console.log(`arquivo:    ${store.caminhoSkillMd(ws.path, s.name)}`);
        console.log("");
        console.log(s.corpo.trimEnd());
      }),
    );

  skill
    .command("remover")
    .argument("<nome>", "nome da skill (kebab-case)")
    .description("remove uma skill do workspace")
    .action((nome: string, opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        await store.remover(ws.path, nome);
        console.log(`ok: skill "${nome}" removida`);
      }),
    );
}
