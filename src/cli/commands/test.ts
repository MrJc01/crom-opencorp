import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { glob, mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, basename } from "node:path";
import type { Command } from "commander";
import { SettingsStore } from "../../core/settings-store.js";
import { opencorpHome, resolvePath } from "../../utils/paths.js";
import { writeFileAtomic } from "../../utils/fs-safe.js";
import { appendEvent, type EventoTeste } from "../../utils/event-log.js";

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

  return `Execute a spec ${specPathAbsoluto} passo a passo (você tem bash e read). O binário é node bin/opencorp.mjs. OPENCORP_HOME já exportado (isolado). Workspaces só com prefixo test-. Uma chamada bash por cenário; nunca sleep >90s. Relatório EM CAMINHO ABSOLUTO: ${reportPathAbsoluto} (formato docs/09-testes-cegos.md). Última linha: VEREDITO.

REGRAS DE BLACK-BOX (obrigatórias):
- É PROIBIDO ler código-fonte do projeto (src/, bin/, package.json, tsconfig.json, qualquer .ts). Leia APENAS a spec, saídas dos seus comandos e artefatos gerados pelo opencorp (workspaces test-*, relatórios).
- Siga a spec na ordem, literalmente. Um cenário que falha não encerra a bateria: teste todos e reporte.
- Evidência real no relatório: comando + trecho da saída. Nunca relate de memória.
- Você não corrige nada do opencorp. Só testa.
- Se a bateria falhar (FAIL), o relatório deve conter uma linha \`CATEGORIA: product_bug|spec_divergence|provider_issue|ambiguidade\` indicando a causa principal.`;
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

export async function pingModelo(modelo: string, env: Record<string, string>): Promise<{ ok: boolean; detalhe: string }> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const seguro = modelo.replace(/[^a-zA-Z0-9._-]/g, "_");
  const logPath = join(tmpdir(), `opencorp-ping-${timestamp}-${seguro}.log`);
  const resultado = await executarFilho(
    ["opencode", "run", "--auto", "--model", modelo, "Responda apenas: OK"],
    env,
    60_000,
    logPath,
  );
  const ok = resultado.exitCode === 0 && resultado.stdout.includes("OK");
  return {
    ok,
    detalhe: ok
      ? "OK"
      : `sem resposta OK (exit=${resultado.exitCode}${resultado.timedOut ? ", timeout" : ""})`,
  };
}

export function filtrarModelosSaudaveis(modelos: string[], pings: Map<string, { ok: boolean }>): string[] {
  return modelos.filter((m) => pings.get(m)?.ok === true);
}

export function classificarFalha(timedOut: boolean, saida: string, reportContent: string | null): string {
  if (timedOut) return "timeout_harness";
  if (/\b429\b/.test(saida) || /rate limit/i.test(saida)) return "rate_limit";
  if (
    /\b(502|503)\b/.test(saida) ||
    /overloaded/i.test(saida) ||
    /provider returned error/i.test(saida) ||
    saida.includes("provider_unavailable")
  ) {
    return "provider_error";
  }
  if (reportContent === null) return "missing_report";
  if (/^CATEGORIA:\s*product_bug/m.test(reportContent)) return "product_bug";
  if (/^CATEGORIA:\s*(spec_divergence|ambiguidade)/m.test(reportContent)) return "spec_divergence";
  return "unknown";
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
  cwd: string,
  execid: string,
  eventsPath: string
): Promise<ExecutionResult> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const homeIsolado = await mkdtemp(join(tmpdir(), "opencorp-blind-"));

  const gravarEvento = async (evento: Omit<EventoTeste, "ts" | "execid" | "etapa" | "slug">): Promise<void> => {
    await appendEvent(eventsPath, {
      ts: new Date().toISOString(),
      execid,
      etapa: spec.etapa,
      slug: spec.slug,
      ...evento,
    });
  };

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
      "build",
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
      const inicioTentativa = Date.now();
      await gravarEvento({ fase: "attempt_start", modelo: modeloAtual, tentativa });
      const resultado = await executarFilho(comando, env, timeoutMs, logPath);
      ultimoResultado = resultado;

      const reportFile = `ETAPA-${spec.etapa.padStart(2, "0")}-${spec.slug}-${timestamp}.md`;
      const reportPath = join(reportsDirAbsoluto, reportFile);

      // Ler o relatório (null se não foi gerado)
      let reportContent: string | null = null;
      try {
        reportContent = await readFile(reportPath, "utf8");
      } catch {
        reportContent = null;
      }

      // Veredito
      let veredito: "PASS" | "FAIL" | "TIMEOUT" = "FAIL";
      if (resultado.timedOut) {
        veredito = "TIMEOUT";
      } else if (reportContent !== null) {
        veredito = extrairVereditoDeConteudo(reportContent);
      }

      // Telemetria: categoria de falha + attempt_end
      const saida = resultado.stdout + "\n" + resultado.stderr;
      const failCat = classificarFalha(resultado.timedOut, saida, reportContent);
      await gravarEvento({
        fase: "attempt_end",
        modelo: modeloAtual,
        tentativa,
        dur_ms: Date.now() - inicioTentativa,
        exit: resultado.exitCode,
        timed_out: resultado.timedOut,
        fail_cat: failCat,
      });

      // Verificar se deve rotacionar modelo (timeout, rate limit, erro de provedor, ou spec nem começou)
      const deveRotacionar =
        resultado.timedOut ||
        failCat === "rate_limit" ||
        failCat === "provider_error" ||
        failCat === "missing_report";

      if (deveRotacionar && tentativa < maxTentativas - 1) {
        const modeloAnterior = modeloAtual;
        tentativa++;
        modeloAtual = rotation[tentativa]!;
        // Atualizar comando com novo modelo
        comando[comando.indexOf("--model") + 1] = modeloAtual;
        await gravarEvento({
          fase: "rotate",
          modelo: modeloAtual,
          tentativa,
          modelo_anterior: modeloAnterior,
        });
        continue;
      }

      await gravarEvento({
        fase: "verdict",
        modelo: modeloAtual,
        tentativa,
        fail_cat: failCat,
        veredito,
      });
      return {
        etapa: spec.etapa,
        model: modeloAtual,
        verdict: veredito,
        reportPath,
      };
    }

    // Se saiu do loop sem retornar (todas tentativas esgotadas)
    const vereditoFinal = ultimoResultado?.timedOut ? "TIMEOUT" : "FAIL";
    const failCatFinal = ultimoResultado
      ? classificarFalha(
          ultimoResultado.timedOut,
          ultimoResultado.stdout + "\n" + ultimoResultado.stderr,
          null,
        )
      : "missing_report";
    await gravarEvento({
      fase: "verdict",
      modelo: modeloAtual,
      tentativa,
      fail_cat: failCatFinal,
      veredito: vereditoFinal,
    });
    return {
      etapa: spec.etapa,
      model: modeloAtual,
      verdict: vereditoFinal,
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
  cwd: string,
  execid: string,
  eventsPath: string
): Promise<ExecutionResult[]> {
  const resultados: ExecutionResult[] = [];

  for (const spec of specs) {
    const resultado = await rodarSpecUnica(spec, model, timeoutMinutes, reportsDirAbsoluto, rotation, cwd, execid, eventsPath);
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

          // Telemetria: execid único por bateria + arquivo de eventos JSONL compartilhado
          const execid = randomUUID();
          const eventsPath = join(reportsDirAbsoluto, "logs", `events-${execid}.jsonl`);

          // Health-check de modelos (antes de rodar qualquer spec)
          let modeloInicial = model;
          let rotationEfetiva = rotation;
          if (testSettings.health_check !== false) {
            const candidatos = [...new Set([model, ...rotation])];
            const pings = new Map<string, { ok: boolean; detalhe: string }>();
            for (const candidato of candidatos) {
              const inicioPing = Date.now();
              const ping = await pingModelo(candidato, {});
              pings.set(candidato, ping);
              await appendEvent(eventsPath, {
                ts: new Date().toISOString(),
                execid,
                etapa: "-",
                slug: "-",
                fase: "health_check",
                modelo: candidato,
                tentativa: 0,
                dur_ms: Date.now() - inicioPing,
              });
            }
            const saudaveis = filtrarModelosSaudaveis(candidatos, pings);
            const pulados = candidatos.length - saudaveis.length;
            console.log(`health-check: ${saudaveis.length}/${candidatos.length} modelos OK, pulando ${pulados}`);

            if (saudaveis.length === 0) {
              console.error("erro: health-check falhou para todos os modelos — nenhum modelo saudável disponível");
              process.exitCode = 1;
              return;
            }

            if (pings.get(model)?.ok !== true) {
              modeloInicial = rotation.find((m) => pings.get(m)?.ok === true) ?? saudaveis[0]!;
              console.log(`health-check: modelo default insaudável — usando ${modeloInicial} como inicial`);
            }
            rotationEfetiva = rotation.filter((m) => pings.get(m)?.ok === true);
          }

          if (etapa === "all") {
            console.log(`[opencorp test blind] Executando ${specs.length} specs em sequência...`);
            const resultados = await rodarTodasSpecs(specs, modeloInicial, timeoutMinutes, reportsDirAbsoluto, rotationEfetiva, cwd, execid, eventsPath);
            imprimirTabelaResumo(resultados);

            const consolidatedPath = await gerarRelatorioConsolidado(resultados, reportsDirAbsoluto);
            console.log(`Relatório consolidado: ${consolidatedPath}`);
            console.log(`Eventos: ${eventsPath}`);

            const geralPass = resultados.every((r) => r.verdict === "PASS");
            process.exitCode = geralPass ? 0 : 1;
            return;
          }

          // Execução única
          const spec = specs[0]!;
          console.log(`[opencorp test blind] ETAPA-${spec.etapa.padStart(2, "0")}-${spec.slug} → modelo: ${modeloInicial}`);
          const resultado = await rodarSpecUnica(spec, modeloInicial, timeoutMinutes, reportsDirAbsoluto, rotationEfetiva, cwd, execid, eventsPath);

          imprimirTabelaResumo([resultado]);
          console.log(`Eventos: ${eventsPath}`);
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