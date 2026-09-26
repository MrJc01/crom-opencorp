import type { Command } from "commander";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { opencorpHome } from "../../utils/paths.js";
import {
  filtrarModelosQualificados,
  type QualidadeModelo,
} from "../../core/contexts/agents/model-resolver.js";
import { MODELOS_CATALOGO_BASE } from "../../core/contexts/agents/recommended-models.js";

function colorize(text: string, color: "green" | "red" | "yellow" | "cyan" | "magenta" | "gray" | "bold"): string {
  const codes: Record<string, string> = {
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    magenta: "\x1b[35m",
    gray: "\x1b[90m",
    bold: "\x1b[1m",
  };
  const reset = "\x1b[0m";
  return `${codes[color] || ""}${text}${reset}`;
}

function coletarModelosDisponiveis(home: string): string[] {
  const mapa = new Set<string>(MODELOS_CATALOGO_BASE);

  // 1. Tentar ler do binário opencode instalado
  const opencodeBin = join(home, ".opencorp", "bin", "opencode");
  if (existsSync(opencodeBin)) {
    try {
      const out = execSync(`"${opencodeBin}" models 2>/dev/null`, { encoding: "utf8", timeout: 3000 });
      for (const linha of out.split("\n")) {
        const l = linha.trim();
        if (l && !l.startsWith("=") && !l.includes(" ")) {
          mapa.add(l);
        }
      }
    } catch {}
  }

  // 2. Ler do settings global
  const settingsPath = join(home, ".opencorp", "settings.json");
  if (existsSync(settingsPath)) {
    try {
      const s = JSON.parse(readFileSync(settingsPath, "utf8"));
      if (s.modelos?.padrao) mapa.add(s.modelos.padrao);
      if (Array.isArray(s.modelos?.rotacao)) {
        for (const m of s.modelos.rotacao) mapa.add(m);
      }
    } catch {}
  }

  return Array.from(mapa);
}

export function registerModelosCommand(program: Command): void {
  program
    .command("modelos")
    .alias("models")
    .description("consulta, filtra por xB e qualifica modelos de IA disponíveis no ecossistema OpenCorp")
    .option("--free", "exibir exclusivamente modelos gratuitos / cota zero")
    .option("--recommended", "ocultar modelos não recomendados / inadequados (<4B e roteadores cegos)")
    .option("--min-b <n>", "filtrar modelos com contagem de parâmetros maior ou igual a N bilhões", parseFloat)
    .option("--max-b <n>", "filtrar modelos com contagem de parâmetros menor ou igual a N bilhões", parseFloat)
    .option("--size <spec>", "filtro amigável de tamanho (ex.: '<14b', '>30b', '<4b')")
    .option("--json", "saída em JSON bruto")
    .action(async (opts: { free?: boolean; recommended?: boolean; minB?: number; maxB?: number; size?: string; json?: boolean }) => {
      // Respeita OPENCORP_HOME (isolamento de testes e instalações alternativas).
      const home = opencorpHome();
      const todos = coletarModelosDisponiveis(home);

      let minB = opts.minB;
      let maxB = opts.maxB;

      if (opts.size) {
        const s = opts.size.trim().toLowerCase();
        const mMenor = s.match(/<(\d+(?:\.\d+)?)b?/);
        const mMaior = s.match(/>(\d+(?:\.\d+)?)b?/);
        if (mMenor && mMenor[1]) maxB = parseFloat(mMenor[1]);
        if (mMaior && mMaior[1]) minB = parseFloat(mMaior[1]);
      }

      const filtrados = filtrarModelosQualificados(todos, {
        apenasGratuitos: opts.free,
        apenasRecomendados: opts.recommended,
        minB,
        maxB,
      });

      if (opts.json) {
        console.log(JSON.stringify(filtrados, null, 2));
        return;
      }

      console.log("");
      console.log(colorize("━━━ Catálogo de Modelos de IA (Dimensionamento xB) ━━━━━━━━━━━━━━━━━", "bold"));
      if (opts.free || opts.recommended || minB !== undefined || maxB !== undefined) {
        const filtrosAtivos: string[] = [];
        if (opts.free) filtrosAtivos.push("Apenas Free");
        if (opts.recommended) filtrosAtivos.push("Apenas Recomendados");
        if (minB !== undefined) filtrosAtivos.push(`≥ ${minB}B`);
        if (maxB !== undefined) filtrosAtivos.push(`≤ ${maxB}B`);
        console.log(colorize(`  Filtros Ativos: ${filtrosAtivos.join(" · ")}`, "yellow"));
      }
      console.log(colorize(`  Total Encontrado: ${filtrados.length} modelo(s)`, "gray"));
      console.log("");

      const agrupados: Record<string, QualidadeModelo[]> = {
        S: [],
        A: [],
        B: [],
        NAO_RECOMENDADO: [],
      };

      for (const m of filtrados) {
        agrupados[m.tier]?.push(m);
      }

      const renderSecao = (titulo: string, itens: QualidadeModelo[], cor: "magenta" | "cyan" | "green" | "red") => {
        if (itens.length === 0) return;
        console.log(colorize(`  ${titulo} (${itens.length})`, "bold"));
        for (const item of itens) {
          const bTag = item.parametrosB ? `${item.parametrosB}B` : "N/D";
          const freeTag = item.gratuito ? colorize("[FREE]", "green") : colorize("[PAGO]", "gray");
          const tierTag = colorize(`[TIER ${item.tier}]`, cor);
          console.log(`    • ${colorize(item.modelo, "bold")}  ${tierTag} ${freeTag} ${colorize(`(${bTag})`, "cyan")}`);
          console.log(colorize(`      ${item.motivo}`, "gray"));
        }
        console.log("");
      };

      renderSecao("Tier S — Raciocínio Profundo, Flagships & Secretário (>70B)", agrupados.S!, "magenta");
      renderSecao("Tier A — Especialistas, Redatores & Roteiristas (14B a 35B)", agrupados.A!, "cyan");
      renderSecao("Tier B — Mini-Agentes, Checagem & Tarefas Rápidas (7B a 14B)", agrupados.B!, "green");
      renderSecao("⛔ NÃO RECOMENDADOS — Modelos Burros (<4B) & Roteadores Cegos", agrupados.NAO_RECOMENDADO!, "red");

      console.log(colorize("  Comandos úteis:", "gray"));
      console.log(colorize("    oc modelos --free --size '>30b'    → filtra gratuitos de raciocínio", "gray"));
      console.log(colorize("    oc modelos --free --size '<14b'    → filtra mini-agentes gratuitos", "gray"));
      console.log(colorize("    oc modelos --recommended           → oculta modelos da lista negra", "gray"));
      console.log("");
    });
}
