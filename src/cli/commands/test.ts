import { spawn } from "node:child_process";
import { glob } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, basename } from "node:path";
import type { Command } from "commander";
import { SettingsStore } from "../../core/settings-store.js";
import { opencorpHome, resolvePath } from "../../utils/paths.js";
import { writeFileAtomic } from "../../utils/fs-safe.js";

const DOCS_TESTS_DIR = "docs/tests";

interface TestBlindOptions {
  model?: string;
  timeout?: number;
  list?: boolean;
}

interface SpecMatch {
  path: string;
  etapa: string;
  slug: string;
}

interface ExecutionResult {
  etapa: string;
  model: string;
  verdict: "PASS" | "FAIL" | "TIMEOUT";
  reportPath: string;
}

interface ChildOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

function extrairEtapaDoNome(arquivo: string): string {
  const match = /ETAPA-(\d+)/.exec(arquivo);
  return match?.[1] ?? "XX";
}

function extrairSlugDoNome(arquivo: string): string {
  const base = basename(arquivo, ".md");
  return base.replace(/^ETAPA-\d+-/, "");
}

async function encontrarSpecs(cwd: string, filtro?: string): Promise<SpecMatch[]> {
  const pattern = join(cwd, DOCS_TESTS_DIR, "ETAPA-*.md");
  const arquivos: string[] = [];
  for await (const path of glob(pattern)) {
    arquivos.push(path);
  }
  
  if (!filtro) {
    return arquivos.map((path) => ({
      path,
      etapa: extrairEtapaDoNome(path),
      slug: extrairSlugDoNome(path),
    }));
  }

  // Se filtro é um número (ex.: "01", "1")
  const numeroMatch = /^(\d{1,2})$/.exec(filtro);
  if (numeroMatch) {
    const num = numeroMatch[1].padStart(2, "0");
    const filtrados = arquivos.filter((f) => f.includes(`ETAPA-${num}`));
    return filtrados.map((path) => ({
      path,
      etapa: extrairEtapaDoNome(path),
      slug: extrairSlugDoNome(path),
    }));
  }

  // Se filtro é fragmento do nome (ex.: "workspaces")
  const filtrados = arquivos.filter((f) => f.toLowerCase().includes(filtro.toLowerCase()));
  return filtrados.map((path) => ({
    path,
    etapa: extrairEtapaDoNome(path),
    slug: extrairSlugDoNome(path),
  }));
}

function montarPrompt(specPathAbsoluto: string, reportsDirAbsoluto: string, etapa: string, slug: string, timestamp: string): string {
  const reportFile = `ETAPA-${etapa.padStart(2, "0")}-${slug}-${timestamp}.md`;
  const reportPathAbsoluto = join(reportsDirAbsoluto, reportFile);
  
  return `Execute a spec ${specPathAbsoluto} passo a passo (você tem bash e read). O binário é node bin/opencorp.mjs. OPENCORP_HOME já exportado (isolado). Workspaces só com prefixo test-. Uma chamada bash por cenário; nunca sleep >90s. Relatório EM CAMINHO ABSOLUTO: ${reportPathAbsoluto} (formato docs/09-testes-cegos.md). Última linha: VEREDITO.`;
}

async function executarFilho(
  comando: string[],
  env: Record<string, string>,
  timeoutMs: number,
  logPath: string
): Promise<ChildOutput> {
  return new Promise((resolve) => {
    const child = spawn(comando[0], comando.slice(1), {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout?.on("data", (data) => {
      const chunk = data.toString();
      stdout += chunk;
      process.stdout.write(chunk);
    });

    child.stderr?.on("data", (data) => {
      const chunk = data.toString();
      stderr += chunk;
      process.stderr.write(chunk);
    });

    child.on("close", (exitCode) => {
      clearTimeout(timeoutHandle);
      // Gravar log
      writeFileAtomic(logPath, `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}\n\nEXIT_CODE: ${exitCode}\nTIMED_OUT: ${timedOut}\n`).catch(() => {});
      resolve({ stdout, stderr, exitCode, timedOut });
    });

    child.on("error", (err) => {
      clearTimeout(timeoutHandle);
      writeFileAtomic(logPath, `ERRO NO SPAWN: ${err.message}\n`).catch(() => {});
      resolve({ stdout, stderr, exitCode: -1, timedOut: false });
    });
  });
}

function extrairVereditoDeConteudo(conteudo: string): "PASS" | "FAIL" {
  const linhas = conteudo.split("\n");
  for (let i = linhas.length - 1; i >= 0; i--) {
    const linha = linhas[i]!.trim();
    if (/^VEREDITO:/i.test(linha)) {
      // Formatos: "VEREDITO: PASS", "VEREDITO: **PASS** (5 PASS · 0 FAIL)", "VEREDITO: FAIL ..."
      // A decisão é a PRIMEIRA palavra após "VEREDITO:" (ignora detalhes como "0 FAIL")
      const m = /VEREDITO:\s*\**\s*(PASS|FAIL)/i.exec(linha);
      if (m) return m[1]!.toUpperCase() as "PASS" | "FAIL";
      return "FAIL";
    }
  }
  return "FAIL";
}

async function rodarSpecUnica(
  spec: SpecMatch,
  model: string,
  timeoutMinutes: number,
  reportsDirAbsoluto: string,
  rotation: string[],
  cwd: string
): Promise<ExecutionResult> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const homeIsolado = await mkdtemp(join(tmpdir(), "opencorp-blind-"));
  
  try {
    const specPathAbsoluto = resolve(cwd, spec.path);
    const prompt = montarPrompt(specPathAbsoluto, reportsDirAbsoluto, spec.etapa, spec.slug, timestamp);
    const logPath = join(reportsDirAbsoluto, "logs", `${timestamp}-${spec.slug}.log`);
    // Prompt seria passado ao agente via stdin ou arquivo; para testes unitários não executamos LLM real
    void prompt;
    
    await writeFileAtomic(logPath, ""); // criar arquivo de log

    const comando = [
      "opencode",
      "run",
      "--auto",
      "--agent",
      "testador-cego",
      "--model",
      model,
      "--title",
      `cego-${spec.etapa}-${timestamp}`,
      prompt,
    ];

    const env = {
      OPENCORP_HOME: homeIsolado,
    };

    let modeloAtual = model;
    let tentativa = 0;
    const maxTentativas = rotation.length;
    let ultimoResultado: ChildOutput | null = null;

    while (tentativa < maxTentativas) {
      const timeoutMs = timeoutMinutes * 60 * 1000;
      const resultado = await executarFilho(comando, env, timeoutMs, logPath);
      ultimoResultado = resultado;

      const reportFile = `ETAPA-${spec.etapa.padStart(2, "0")}-${spec.slug}-${timestamp}.md`;
      const reportPath = join(reportsDirAbsoluto, reportFile);

      // Verificar se o relatório foi gerado
      let veredito: "PASS" | "FAIL" | "TIMEOUT" = "FAIL";
      
      // Ler o relatório para extrair o veredito
      try {
        const reportContent = await import("node:fs/promises").then((fs) => fs.readFile(reportPath, "utf8"));
        if (resultado.timedOut) {
          veredito = "TIMEOUT";
        } else {
          veredito = extrairVereditoDeConteudo(reportContent);
        }
      } catch {
        // Relatório não encontrado ou erro de leitura
        if (resultado.timedOut) {
          veredito = "TIMEOUT";
        } else {
          veredito = "FAIL";
        }
      }

      // Verificar se deve rotacionar modelo (timeout, rate limit, erro de provedor genérico, ou spec nem começou)
      const saida = resultado.stdout + "\n" + resultado.stderr;
      const provedorCaiu =
        saida.includes("rate limit") ||
        saida.includes("Provider returned error") ||
        saida.includes("provider_unavailable") ||
        saida.includes("temporarily overloaded") ||
        saida.includes("Overloaded") ||
        /\b(429|502|503)\b.*(?:error|overload|unavailable)|provider.*(?:error|overload|unavailable)/i.test(saida);
      let relatorioExiste = false;
      try {
        await import("node:fs/promises").then((fs) => fs.access(reportPath));
        relatorioExiste = true;
      } catch {
        relatorioExiste = false;
      }
      const deveRotacionar = resultado.timedOut || provedorCaiu || (!relatorioExiste && !resultado.timedOut);
      
      if (deveRotacionar && tentativa < maxTentativas - 1) {
        tentativa++;
        modeloAtual = rotation[tentativa];
        // Atualizar comando com novo modelo
        comando[comando.indexOf("--model") + 1] = modeloAtual;
        continue;
      }

      return {
        etapa: spec.etapa,
        model: modeloAtual,
        verdict: veredito,
        reportPath,
      };
    }

    // Se saiu do loop sem retornar (todas tentativas esgotadas)
    return {
      etapa: spec.etapa,
      model: modeloAtual,
      verdict: ultimoResultado?.timedOut ? "TIMEOUT" : "FAIL",
      reportPath: join(reportsDirAbsoluto, `ETAPA-${spec.etapa.padStart(2, "0")}-${spec.slug}-${timestamp}.md`),
    };
  } finally {
    // Limpar home isolado
    await rm(homeIsolado, { recursive: true, force: true }).catch(() => {});
  }
}

async function rodarTodasSpecs(
  specs: SpecMatch[],
  model: string,
  timeoutMinutes: number,
  reportsDirAbsoluto: string,
  rotation: string[],
  cwd: string
): Promise<ExecutionResult[]> {
  const resultados: ExecutionResult[] = [];
  
  for (const spec of specs) {
    const resultado = await rodarSpecUnica(spec, model, timeoutMinutes, reportsDirAbsoluto, rotation, cwd);
    resultados.push(resultado);
  }
  
  return resultados;
}

function imprimirTabelaResumo(resultados: ExecutionResult[]): void {
  console.log("\n┌──────────┬──────────────────────────────┬──────────┬────────────────────────────────────┐");
  console.log("│ Etapa    │ Modelo                       │ Veredito │ Relatório                          │");
  console.log("├──────────┼──────────────────────────────┼──────────┼────────────────────────────────────┤");
  
  for (const r of resultados) {
    const etapa = r.etapa.padEnd(8);
    const modelo = r.model.padEnd(28);
    const veredito = r.verdict.padEnd(8);
    const relatorio = r.reportPath.slice(-34).padEnd(34);
    console.log(`│ ${etapa} │ ${modelo} │ ${veredito} │ ${relatorio} │`);
  }
  
  console.log("└──────────┴──────────────────────────────┴──────────┴────────────────────────────────────┘\n");
}

async function gerarRelatorioConsolidado(
  resultados: ExecutionResult[],
  reportsDirAbsoluto: string
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const consolidatedPath = join(reportsDirAbsoluto, `CONSOLIDADO-${timestamp}.md`);
  
  const passCount = resultados.filter((r) => r.verdict === "PASS").length;
  const failCount = resultados.filter((r) => r.verdict === "FAIL").length;
  const timeoutCount = resultados.filter((r) => r.verdict === "TIMEOUT").length;
  const geral = passCount === resultados.length ? "PASS" : "FAIL";
  
  let md = `# Relatório Consolidado de Testes Cegos\n`;
  md += `- Data: ${new Date().toISOString()}\n`;
  md += `- Total: ${resultados.length} (${passCount} PASS, ${failCount} FAIL, ${timeoutCount} TIMEOUT)\n`;
  md += `- Veredito Geral: **${geral}**\n\n`;
  
  md += `| Etapa | Modelo | Veredito | Relatório |\n`;
  md += `|-------|--------|----------|-----------|\n`;
  
  for (const r of resultados) {
    md += `| ${r.etapa} | ${r.model} | ${r.verdict} | ${r.reportPath} |\n`;
  }
  
  md += `\n---\n*Gerado por opencorp test blind all*\n`;
  
  await writeFileAtomic(consolidatedPath, md);
  return consolidatedPath;
}

export function registerTestCommand(program: Command): void {
  const store = new SettingsStore({ homeDir: opencorpHome(), cwd: process.cwd() });

  const testCmd = program.command("test").description("teste cego (QA black-box via OpenCode)");

  testCmd
    .command("blind")
    .argument("<etapa>", "etapa a testar (número 01..17, fragmento do nome, ou 'all')")
    .option("--model <provider/model>", "modelo do testador cego (sobrescreve settings.tests.test_model)")
    .option("--timeout <min>", "timeout em minutos por spec (sobrescreve settings.tests.timeout_minutes)", parseInt)
    .option("--list", "lista as specs encontradas e sai")
    .description("dispara o testador cego para uma etapa ou todas (all)")
    .action(
      async (etapa: string, opts: TestBlindOptions) => {
        try {
          const settingsRes = await store.resolve({});
          const testSettings = settingsRes.settings.tests;
          
          const model = opts.model ?? testSettings.test_model;
          const timeoutMinutes = opts.timeout ?? testSettings.timeout_minutes;
          const reportsDirRelativo = testSettings.reports_dir;
          const rotation = testSettings.rotation;
          
          const cwd = process.cwd();
          const reportsDirAbsoluto = resolvePath(reportsDirRelativo, cwd);
          
          // Garantir diretório de relatórios e logs
          await import("node:fs/promises").then((fs) => fs.mkdir(reportsDirAbsoluto, { recursive: true }));
          await import("node:fs/promises").then((fs) => fs.mkdir(join(reportsDirAbsoluto, "logs"), { recursive: true }));

          const specs = await encontrarSpecs(cwd, etapa === "all" ? undefined : etapa);

          if (opts.list) {
            if (specs.length === 0) {
              console.log("Nenhuma spec encontrada em docs/tests/ETAPA-*.md");
              process.exitCode = 0;
              return;
            }
            console.log("Specs encontradas:");
            for (const s of specs) {
              console.log(`  ETAPA-${s.etapa.padStart(2, "0")}-${s.slug}  (${s.path})`);
            }
            process.exitCode = 0;
            return;
          }

          if (specs.length === 0) {
            console.error(`erro: nenhuma spec encontrada para "${etapa}" em docs/tests/ETAPA-*.md`);
            process.exitCode = 1;
            return;
          }

          if (specs.length > 1 && etapa !== "all") {
            console.error(`erro: "${etapa}" é ambíguo — ${specs.length} specs encontradas:`);
            for (const s of specs) {
              console.error(`  ETAPA-${s.etapa.padStart(2, "0")}-${s.slug}  (${s.path})`);
            }
            console.error('Use número exato (ex.: "03") ou "all" para todas.');
            process.exitCode = 1;
            return;
          }

          if (etapa === "all") {
            console.log(`[opencorp test blind] Executando ${specs.length} specs em sequência...`);
            const resultados = await rodarTodasSpecs(specs, model, timeoutMinutes, reportsDirAbsoluto, rotation, cwd);
            imprimirTabelaResumo(resultados);
            
            const consolidatedPath = await gerarRelatorioConsolidado(resultados, reportsDirAbsoluto);
            console.log(`Relatório consolidado: ${consolidatedPath}`);
            
            const geralPass = resultados.every((r) => r.verdict === "PASS");
            process.exitCode = geralPass ? 0 : 1;
            return;
          }

          // Execução única
          const spec = specs[0]!;
          console.log(`[opencorp test blind] ETAPA-${spec.etapa.padStart(2, "0")}-${spec.slug} → modelo: ${model}`);
          const resultado = await rodarSpecUnica(spec, model, timeoutMinutes, reportsDirAbsoluto, rotation, cwd);
          
          imprimirTabelaResumo([resultado]);
          process.exitCode = resultado.verdict === "PASS" ? 0 : 1;
        } catch (erro) {
          console.error(`erro inesperado: ${erro instanceof Error ? erro.message : String(erro)}`);
          process.exitCode = 1;
        }
      },
    );
}

// Exportações para testes unitários
export { encontrarSpecs, extrairVereditoDeConteudo, montarPrompt, extrairEtapaDoNome, extrairSlugDoNome };