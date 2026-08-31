// Migra MDs soltos (fados pelos agentes) em registros reais do RegistryStore.
// Para cada .md dentro de <ws>/.opencorp/registries/<categoria>/ sem meta.json,
// cria <id>/.md + meta.json preservando data de modificação.
import { readdirSync, readFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { RegistryStore } from "../dist/core/registry-store.js";
import { opencorpHome } from "../dist/utils/paths.js";

const home = opencorpHome();
const wsBase = join(home, ".opencorp", "workspaces");
const CATEGORIAS = ["documentos", "execucoes", "logs"];
const registros = new RegistryStore();

for (const ws of readdirSync(wsBase)) {
  const wsPath = join(wsBase, ws);
  if (!existsSync(join(wsPath, ".opencorp"))) continue;
  for (const cat of CATEGORIAS) {
    const dir = join(wsPath, ".opencorp", "registries", cat);
    if (!existsSync(dir)) continue;
    for (const arquivo of readdirSync(dir)) {
      if (!arquivo.endsWith(".md")) continue;
      const id = arquivo.replace(/\.md$/, "").toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(0, 96);
      const dirRegistro = join(dir, id);
      if (existsSync(join(dirRegistro, "meta.json"))) continue; // já registrado
      const caminhoArquivo = join(dir, arquivo);
      const mtime = statSync(caminhoArquivo).mtime.toISOString();
      const primeira = readFileSync(caminhoArquivo, "utf8").split("\n").find((l) => l.trim()) ?? arquivo;
      mkdirSync(dirRegistro, { recursive: true });
      // Move o .md solto para dentro do registro como conteudo.md (layout do RegistryStore)
      const { renameSync } = await import("node:fs");
      renameSync(caminhoArquivo, join(dirRegistro, "conteudo.md"));
      const meta = {
        id,
        categoria: cat,
        descricao: primeira.slice(0, 140),
        criado_por: "migracao-fantasma",
        criado_em: mtime,
        atualizado_em: mtime,
        permissoes: { leitura: ["*"], escrita: ["*"], modificacao_meta: [] },
        tags: ["migrado"],
        referencias: [],
        extras: { arquivo: arquivo },
      };
      const { writeFileAtomic } = await import("../dist/utils/fs-safe.js");
      await writeFileAtomic(join(dirRegistro, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
      const { appendFileSync } = await import("node:fs");
      appendFileSync(join(dirRegistro, "journal.jsonl"), `${JSON.stringify({ ts: mtime, por: "migracao", evento: "migrado", resumo: `importado de ${arquivo}` })}\n`);
      console.log(`${ws}/${cat}: ${id}`);
    }
  }
}
console.log("fim");
