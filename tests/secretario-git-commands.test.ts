import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { WorkspaceGit } from "../src/core/contexts/workspace/workspace-git.js";
import { processarComandoGitSecretario } from "../src/core/contexts/workspace/secretario-git-slash.js";

describe("Secretário — Comandos Git Slash", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "oc-sec-git-test-"));
    await execa("git", ["init", "-b", "main"], { cwd: tempDir });
    await execa("git", ["config", "user.name", "Test Agent"], { cwd: tempDir });
    await execa("git", ["config", "user.email", "agent@opencorp.local"], { cwd: tempDir });

    // Commit inicial
    await writeFile(join(tempDir, "README.md"), "# Workspace Teste\n");
    await execa("git", ["add", "README.md"], { cwd: tempDir });
    await execa("git", ["commit", "-m", "init: commit inicial"], { cwd: tempDir });
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("não intercepta mensagens comuns que não iniciam com /git ou /restore", async () => {
    const res = await processarComandoGitSecretario("olá secretário, tudo bem?", tempDir, "ws-teste");
    expect(res.tratado).toBe(false);
  });

  it("/git status — detecta working tree limpo", async () => {
    const res = await processarComandoGitSecretario("/git status", tempDir, "ws-teste");
    expect(res.tratado).toBe(true);
    expect(res.gitStatus).toBeDefined();
    expect(res.gitStatus?.clean).toBe(true);
    expect(res.gitStatus?.arquivos).toHaveLength(0);
    expect(res.mensagem).toContain("working tree está 100% limpo");
  });

  it("/git status — detecta arquivos modificados e untracked", async () => {
    // Modifica arquivo existente
    await writeFile(join(tempDir, "README.md"), "# Workspace Teste Modificado\n");
    // Cria novo arquivo untracked
    await writeFile(join(tempDir, "novo.ts"), "export const x = 1;\n");

    const res = await processarComandoGitSecretario("/git status", tempDir, "ws-teste");
    expect(res.tratado).toBe(true);
    expect(res.gitStatus).toBeDefined();
    expect(res.gitStatus?.clean).toBe(false);
    expect(res.gitStatus?.arquivos.length).toBe(2);

    const readme = res.gitStatus?.arquivos.find((a) => a.arquivo === "README.md");
    expect(readme).toBeDefined();
    expect(readme?.status).toBe("M");

    const novo = res.gitStatus?.arquivos.find((a) => a.arquivo === "novo.ts");
    expect(novo).toBeDefined();
    expect(novo?.status).toBe("?");
  });

  it("/git diff — exibe diff de arquivo específico", async () => {
    await writeFile(join(tempDir, "README.md"), "# Workspace Teste Modificado\n");

    const res = await processarComandoGitSecretario("/git diff README.md", tempDir, "ws-teste");
    expect(res.tratado).toBe(true);
    expect(res.gitDiff).toBeDefined();
    expect(res.gitDiff?.arquivo).toBe("README.md");
    expect(res.gitDiff?.diff).toContain("+# Workspace Teste Modificado");
  });

  it("/git restore — descarta alterações de arquivo específico", async () => {
    await writeFile(join(tempDir, "README.md"), "# Workspace Teste Alterado Errado\n");
    await writeFile(join(tempDir, "outro.txt"), "conteudo preservado\n");

    // Descarta apenas o README.md
    const res = await processarComandoGitSecretario("/git restore README.md", tempDir, "ws-teste");
    expect(res.tratado).toBe(true);
    expect(res.mensagem).toContain("README.md");
    expect(res.mensagem).toContain("descartadas com sucesso");

    // README.md voltou ao original
    const statusDepois = await new WorkspaceGit().obterStatusArquivos(tempDir);
    const temReadme = statusDepois.arquivos.some((a) => a.caminho === "README.md");
    expect(temReadme).toBe(false);

    // outro.txt continua como untracked
    const temOutro = statusDepois.arquivos.some((a) => a.caminho === "outro.txt");
    expect(temOutro).toBe(true);
  });

  it("/restore — atalho rápido funciona identicamente", async () => {
    await writeFile(join(tempDir, "novo_lixo.txt"), "conteudo temporario\n");

    const res = await processarComandoGitSecretario("/restore novo_lixo.txt", tempDir, "ws-teste");
    expect(res.tratado).toBe(true);
    expect(res.gitStatus?.clean).toBe(true);
  });

  it("/git log — lista commits recentes do workspace", async () => {
    await writeFile(join(tempDir, "teste.txt"), "123\n");
    await execa("git", ["add", "teste.txt"], { cwd: tempDir });
    await execa("git", ["commit", "-m", "agent(pautador): nova pauta gerada"], { cwd: tempDir });

    const res = await processarComandoGitSecretario("/git log", tempDir, "ws-teste");
    expect(res.tratado).toBe(true);
    expect(res.mensagem).toContain("agent(pautador): nova pauta gerada");
    expect(res.mensagem).toContain("init: commit inicial");
  });

  it("/git help — retorna lista de comandos disponíveis", async () => {
    const res = await processarComandoGitSecretario("/git help", tempDir, "ws-teste");
    expect(res.tratado).toBe(true);
    expect(res.mensagem).toContain("/git status");
    expect(res.mensagem).toContain("/git diff");
    expect(res.mensagem).toContain("/git restore");
    expect(res.mensagem).toContain("/rollback");
  });

  it("/rollback sem alvo — retorna erro de uso", async () => {
    const res = await processarComandoGitSecretario("/rollback", tempDir, "ws-teste");
    expect(res.tratado).toBe(true);
    expect(res.mensagem).toContain("Informe o alvo");
  });

  it("/rollback HEAD — reverte workspace com sucesso", async () => {
    await writeFile(join(tempDir, "README.md"), "# Modificado para rollback\n");
    const res = await processarComandoGitSecretario("/rollback HEAD", tempDir, "ws-teste");
    expect(res.tratado).toBe(true);
    expect(res.mensagem).toContain("Rollback concluído");
  });

  it("/git checkpoints — lista checkpoints vazios", async () => {
    const res = await processarComandoGitSecretario("/git checkpoints", tempDir, "ws-teste");
    expect(res.tratado).toBe(true);
    expect(res.mensagem).toContain("Checkpoint");
  });

  it("/git task-branch — cria branch isolada", async () => {
    const res = await processarComandoGitSecretario("/git task-branch minha-tarefa", tempDir, "ws-teste");
    expect(res.tratado).toBe(true);
    expect(res.mensagem).toContain("task/minha-tarefa");
  });

  it("/git branch — lista branches", async () => {
    const res = await processarComandoGitSecretario("/git branch", tempDir, "ws-teste");
    expect(res.tratado).toBe(true);
    expect(res.mensagem).toContain("main");
  });
});
