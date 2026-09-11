import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WorkspaceGit } from "../src/core/workspace-git.js";

describe("WorkspaceGit", () => {
  let tmpWs: string;
  let git: WorkspaceGit;

  beforeEach(() => {
    tmpWs = mkdtempSync(join(tmpdir(), "opencorp-git-test-"));
    git = new WorkspaceGit();
  });

  afterEach(() => {
    try {
      rmSync(tmpWs, { recursive: true, force: true });
    } catch {}
  });

  it("inicializa repositório git e garante .gitignore oficial", async () => {
    expect(git.temGit(tmpWs)).toBe(false);

    // Cria um arquivo de teste antes do init
    writeFileSync(join(tmpWs, "README.md"), "# Teste");

    const res = await git.inicializar(tmpWs);
    expect(res.inicializado).toBe(true);
    expect(git.temGit(tmpWs)).toBe(true);
    expect(existsSync(join(tmpWs, ".gitignore"))).toBe(true);

    const historico = await git.listarHistorico(tmpWs);
    expect(historico.length).toBe(1);
    expect(historico[0]?.mensagem).toContain("feat(workspace): inicialização");
  });

  it("não comita arquivos definidos no .gitignore (como *.db e logs/)", async () => {
    await git.inicializar(tmpWs);

    // Cria arquivo de banco e log
    writeFileSync(join(tmpWs, "corp.db"), "dados binarios sqlite");
    writeFileSync(join(tmpWs, "test.log"), "log continuo");

    const commitRes = await git.autoCommit(tmpWs, "pautador-youtube", "tentativa de gravar db", "exec-001");
    // Não deve comitar nada pois só foram criados arquivos ignorados
    expect(commitRes.commit).toBe(false);
    expect(commitRes.mensagem).toBe("Nenhum arquivo alterado");
  });

  it("cria auto-commit semântico quando arquivos válidos são criados ou alterados", async () => {
    await git.inicializar(tmpWs);

    // Cria um script e um JSON de registro
    writeFileSync(join(tmpWs, "script.js"), "console.log('novo script');");
    const commitRes = await git.autoCommit(
      tmpWs,
      "pautador-youtube",
      "criar script de automação para testes",
      "exec-002",
    );

    expect(commitRes.commit).toBe(true);
    expect(commitRes.hash).toBeDefined();
    expect(commitRes.mensagem).toContain("agent(pautador-youtube): criar script de automação para testes");

    const historico = await git.listarHistorico(tmpWs);
    expect(historico.length).toBe(2);
    expect(historico[0]?.autor).toBe("pautador-youtube");
  });

  it("gera diff de commits e permite rollback seguro", async () => {
    await git.inicializar(tmpWs);

    // Estado 1: arquivo inicial
    const arquivo = join(tmpWs, "config.txt");
    writeFileSync(arquivo, "linha 1\n");
    await git.autoCommit(tmpWs, "agente1", "versao 1", "exec-v1");

    // Checkpoint
    await git.criarCheckpoint(tmpWs, "exec-v2");

    // Estado 2: alteração indesejada
    writeFileSync(arquivo, "linha 1\nlinha 2 com erro\n");
    const commitV2 = await git.autoCommit(tmpWs, "agente-alucinado", "mudanca errada", "exec-v2");
    expect(commitV2.commit).toBe(true);

    // Inspeciona diff
    const diff = await git.obterDiff(tmpWs, commitV2.hash);
    expect(diff).toContain("+linha 2 com erro");

    // Reverte para o checkpoint de pré-execução do exec-v2
    const rollbackRes = await git.reverter(tmpWs, "exec-v2");
    expect(rollbackRes.sucesso).toBe(true);

    // Valida que o arquivo voltou ao estado 1
    const historicoPosRollback = await git.listarHistorico(tmpWs);
    expect(historicoPosRollback[0]?.mensagem).toContain("versao 1");
  });
});
