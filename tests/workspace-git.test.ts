import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WorkspaceGit, GITIGNORE_PADRAO_WORKSPACE } from "../src/core/contexts/workspace/workspace-git.js";

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

  // ── Inicialização ─────────────────────────────────────────────────

  it("inicializa repositório git e garante .gitignore oficial", async () => {
    expect(git.temGit(tmpWs)).toBe(false);

    writeFileSync(join(tmpWs, "README.md"), "# Teste");

    const res = await git.inicializar(tmpWs);
    expect(res.inicializado).toBe(true);
    expect(git.temGit(tmpWs)).toBe(true);
    expect(existsSync(join(tmpWs, ".gitignore"))).toBe(true);

    const historico = await git.listarHistorico(tmpWs);
    expect(historico.length).toBe(1);
    expect(historico[0]?.mensagem).toContain("feat(workspace): inicialização");
  });

  it("init é idempotente — chamar duas vezes não duplica commit", async () => {
    writeFileSync(join(tmpWs, "README.md"), "# Teste");

    const res1 = await git.inicializar(tmpWs);
    expect(res1.inicializado).toBe(true);

    const res2 = await git.inicializar(tmpWs);
    expect(res2.inicializado).toBe(false);
    expect(res2.mensagem).toContain("já existente");

    const historico = await git.listarHistorico(tmpWs);
    expect(historico.length).toBe(1);
  });

  it("inicializar em diretório inexistente retorna erro gracioso", async () => {
    const caminhoInvalido = join(tmpWs, "nao-existe-subdir-xyz");
    const res = await git.inicializar(caminhoInvalido);
    expect(res.inicializado).toBe(false);
    expect(res.mensagem).toContain("Falha");
  });

  // ── .gitignore ────────────────────────────────────────────────────

  it("não comita arquivos definidos no .gitignore (como *.db e logs/)", async () => {
    await git.inicializar(tmpWs);

    writeFileSync(join(tmpWs, "corp.db"), "dados binarios sqlite");
    writeFileSync(join(tmpWs, "test.log"), "log continuo");

    const commitRes = await git.autoCommit(tmpWs, "pautador-youtube", "tentativa de gravar db", "exec-001");
    expect(commitRes.commit).toBe(false);
    expect(commitRes.mensagem).toBe("Nenhum arquivo alterado");
  });

  it("garantirGitignore adiciona regras faltantes em .gitignore existente", async () => {
    // Cria um .gitignore manual sem *.db e sem node_modules
    writeFileSync(join(tmpWs, ".gitignore"), "# meu gitignore\ntmp/\n");

    const modificou = await git.garantirGitignore(tmpWs);
    expect(modificou).toBe(true);

    const conteudo = readFileSync(join(tmpWs, ".gitignore"), "utf8");
    expect(conteudo).toContain("*.db");
    expect(conteudo).toContain("node_modules/");
    expect(conteudo).toContain("logs/");
    // Regras originais preservadas
    expect(conteudo).toContain("tmp/");
  });

  it("garantirGitignore retorna false quando .gitignore já está completo", async () => {
    writeFileSync(join(tmpWs, ".gitignore"), GITIGNORE_PADRAO_WORKSPACE);

    const modificou = await git.garantirGitignore(tmpWs);
    expect(modificou).toBe(false);
  });

  // ── Auto-Commit ───────────────────────────────────────────────────

  it("cria auto-commit semântico quando arquivos válidos são criados", async () => {
    await git.inicializar(tmpWs);

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

  it("auto-commit com múltiplos agentes mantém autoria separada", async () => {
    await git.inicializar(tmpWs);

    writeFileSync(join(tmpWs, "a.txt"), "arquivo A");
    await git.autoCommit(tmpWs, "agente-redator", "escrever primeiro rascunho", "exec-a1");

    writeFileSync(join(tmpWs, "b.txt"), "arquivo B");
    await git.autoCommit(tmpWs, "agente-revisor", "revisar e aprovar conteúdo", "exec-b1");

    const historico = await git.listarHistorico(tmpWs);
    expect(historico.length).toBe(3); // init + 2 commits
    expect(historico[0]?.autor).toBe("agente-revisor");
    expect(historico[1]?.autor).toBe("agente-redator");
  });

  it("auto-commit trunca ordem longa a 60 caracteres", async () => {
    await git.inicializar(tmpWs);

    writeFileSync(join(tmpWs, "grande.txt"), "dados");
    const ordemGrande = "Este é um comando extremamente longo que ultrapassa sessenta caracteres e deve ser truncado pelo sistema de commit";
    const commitRes = await git.autoCommit(tmpWs, "agente1", ordemGrande, "exec-trunc");

    expect(commitRes.commit).toBe(true);
    expect(commitRes.mensagem).toContain("...");
    expect(commitRes.mensagem!.length).toBeLessThan(200);
  });

  it("auto-commit em workspace sem git retorna erro gracioso", async () => {
    const res = await git.autoCommit(tmpWs, "agente", "ordem", "exec-x");
    expect(res.commit).toBe(false);
    expect(res.mensagem).toContain("sem repositório Git");
  });

  // ── Histórico ─────────────────────────────────────────────────────

  it("listarHistorico retorna array vazio em diretório sem git", async () => {
    const historico = await git.listarHistorico(tmpWs);
    expect(historico).toEqual([]);
  });

  it("listarHistorico respeita limite de commits", async () => {
    await git.inicializar(tmpWs);

    for (let i = 1; i <= 5; i++) {
      writeFileSync(join(tmpWs, `file${i}.txt`), `conteúdo ${i}`);
      await git.autoCommit(tmpWs, `agente-${i}`, `commit ${i}`, `exec-${i}`);
    }

    const historico = await git.listarHistorico(tmpWs, 3);
    expect(historico.length).toBe(3);
    expect(historico[0]?.mensagem).toContain("commit 5");
  });

  // ── Diff ──────────────────────────────────────────────────────────

  it("obterDiff mostra diff de commit específico", async () => {
    await git.inicializar(tmpWs);

    const arquivo = join(tmpWs, "config.txt");
    writeFileSync(arquivo, "linha 1\n");
    const res = await git.autoCommit(tmpWs, "agente1", "versao 1", "exec-v1");

    const diff = await git.obterDiff(tmpWs, res.hash);
    expect(diff).toContain("+linha 1");
  });

  it("obterDiff sem hash mostra uncommitted changes", async () => {
    await git.inicializar(tmpWs);

    writeFileSync(join(tmpWs, "tracked.txt"), "v1");
    await git.autoCommit(tmpWs, "agente1", "commit tracked", "exec-t");

    writeFileSync(join(tmpWs, "tracked.txt"), "v2-alterado");
    const diff = await git.obterDiff(tmpWs);
    expect(diff).toContain("-v1");
    expect(diff).toContain("+v2-alterado");
  });

  it("obterDiff em workspace sem git retorna string vazia", async () => {
    const diff = await git.obterDiff(tmpWs);
    expect(diff).toBe("");
  });

  // ── Checkpoint & Rollback ─────────────────────────────────────────

  it("cria checkpoint e permite rollback por execId", async () => {
    await git.inicializar(tmpWs);

    const arquivo = join(tmpWs, "config.txt");
    writeFileSync(arquivo, "linha 1\n");
    await git.autoCommit(tmpWs, "agente1", "versao 1", "exec-v1");

    // Checkpoint pré-execução
    const tag = await git.criarCheckpoint(tmpWs, "exec-v2");
    expect(tag).toBe("checkpoint/pre-exec-v2");

    // Alteração indesejada
    writeFileSync(arquivo, "linha 1\nlinha 2 com erro\n");
    const commitV2 = await git.autoCommit(tmpWs, "agente-alucinado", "mudanca errada", "exec-v2");
    expect(commitV2.commit).toBe(true);

    // Inspeciona diff
    const diff = await git.obterDiff(tmpWs, commitV2.hash);
    expect(diff).toContain("+linha 2 com erro");

    // Reverte para o checkpoint de pré-execução
    const rollbackRes = await git.reverter(tmpWs, "exec-v2");
    expect(rollbackRes.sucesso).toBe(true);

    const historicoPosRollback = await git.listarHistorico(tmpWs);
    expect(historicoPosRollback[0]?.mensagem).toContain("versao 1");
  });

  it("criarCheckpoint retorna null em workspace sem git", async () => {
    const tag = await git.criarCheckpoint(tmpWs, "exec-abc");
    expect(tag).toBeNull();
  });

  it("rollback com referência inválida retorna erro gracioso", async () => {
    await git.inicializar(tmpWs);

    const res = await git.reverter(tmpWs, "hash-inexistente-999");
    expect(res.sucesso).toBe(false);
    expect(res.mensagem).toContain("Falha");
  });

  it("rollback em workspace sem git retorna erro", async () => {
    const res = await git.reverter(tmpWs, "HEAD~1");
    expect(res.sucesso).toBe(false);
    expect(res.mensagem).toContain("não possui repositório Git");
  });

  // ── Arquivos em subdiretórios ─────────────────────────────────────

  it("auto-commit rastreia arquivos em subdiretórios profundos", async () => {
    await git.inicializar(tmpWs);

    const subdir = join(tmpWs, ".opencorp", "agents");
    mkdirSync(subdir, { recursive: true });
    writeFileSync(join(subdir, "novo-agente.md"), "# Agente Novo\nDescrição do agente");

    const res = await git.autoCommit(tmpWs, "operador", "criar novo agente", "exec-deep");
    expect(res.commit).toBe(true);

    const historico = await git.listarHistorico(tmpWs);
    expect(historico[0]?.mensagem).toContain("criar novo agente");
  });

  // ── Git Granular (Status, Restauração por Arquivo, Branches) ───────

  it("obterStatusArquivos retorna lista detalhada de arquivos modificados e untracked", async () => {
    await git.inicializar(tmpWs);

    // Cria arquivo rastreado
    writeFileSync(join(tmpWs, "original.txt"), "conteudo 1\n");
    await git.autoCommit(tmpWs, "agente1", "primeiro commit", "exec-1");

    // Modifica o arquivo rastreado
    writeFileSync(join(tmpWs, "original.txt"), "conteudo 1 modificado\n");

    // Cria arquivo untracked
    writeFileSync(join(tmpWs, "novo-rascunho.txt"), "rascunho novo\n");

    const status = await git.obterStatusArquivos(tmpWs);
    expect(status.limpo).toBe(false);
    expect(status.branch).toBe("main");

    const mod = status.arquivos.find((a) => a.caminho === "original.txt");
    expect(mod).toBeDefined();
    expect(mod?.status).toBe("modificado");

    const untracked = status.arquivos.find((a) => a.caminho === "novo-rascunho.txt");
    expect(untracked).toBeDefined();
    expect(untracked?.status).toBe("untracked");
  });

  it("restaurarArquivo descarta modificações locais de um arquivo rastreado sem tocar em outros", async () => {
    await git.inicializar(tmpWs);

    writeFileSync(join(tmpWs, "arquivo-a.txt"), "conteudo A original\n");
    writeFileSync(join(tmpWs, "arquivo-b.txt"), "conteudo B original\n");
    await git.autoCommit(tmpWs, "agente1", "setup arquivos", "exec-setup");

    // Modifica ambos
    writeFileSync(join(tmpWs, "arquivo-a.txt"), "conteudo A corrompido\n");
    writeFileSync(join(tmpWs, "arquivo-b.txt"), "conteudo B bom modificado\n");

    // Restaura cirurgicamente APENAS arquivo-a.txt
    const res = await git.restaurarArquivo(tmpWs, "arquivo-a.txt");
    expect(res.sucesso).toBe(true);
    expect(res.mensagem).toContain("descartadas");

    // arquivo-a voltou ao original
    expect(readFileSync(join(tmpWs, "arquivo-a.txt"), "utf8")).toBe("conteudo A original\n");
    // arquivo-b manteve a modificação!
    expect(readFileSync(join(tmpWs, "arquivo-b.txt"), "utf8")).toBe("conteudo B bom modificado\n");
  });

  it("restaurarArquivo com commitHash restaura versão anterior de um arquivo específico", async () => {
    await git.inicializar(tmpWs);

    writeFileSync(join(tmpWs, "script.py"), "print('versao 1')\n");
    const c1 = await git.autoCommit(tmpWs, "agente1", "v1 do script", "exec-s1");

    writeFileSync(join(tmpWs, "script.py"), "print('versao 2')\n");
    await git.autoCommit(tmpWs, "agente1", "v2 do script", "exec-s2");

    writeFileSync(join(tmpWs, "outro.py"), "print('intacto')\n");
    await git.autoCommit(tmpWs, "agente1", "outro arquivo", "exec-s3");

    // Restaura script.py para a versão do commit c1
    const res = await git.restaurarArquivo(tmpWs, "script.py", c1.hash);
    expect(res.sucesso).toBe(true);
    expect(readFileSync(join(tmpWs, "script.py"), "utf8")).toBe("print('versao 1')\n");
    // outro.py permanece inalterado
    expect(readFileSync(join(tmpWs, "outro.py"), "utf8")).toBe("print('intacto')\n");
  });

  it("restaurarArquivo em arquivo untracked remove o arquivo do disco com segurança", async () => {
    await git.inicializar(tmpWs);

    const arquivoLixo = join(tmpWs, "alucinacao.txt");
    writeFileSync(arquivoLixo, "dados gerados por engano");
    expect(existsSync(arquivoLixo)).toBe(true);

    const res = await git.restaurarArquivo(tmpWs, "alucinacao.txt");
    expect(res.sucesso).toBe(true);
    expect(existsSync(arquivoLixo)).toBe(false);
  });

  it("obterDiff com caminhoArquivo retorna diff isolado apenas daquele arquivo", async () => {
    await git.inicializar(tmpWs);

    writeFileSync(join(tmpWs, "f1.txt"), "linha 1\n");
    writeFileSync(join(tmpWs, "f2.txt"), "linha A\n");
    await git.autoCommit(tmpWs, "agente1", "init 2 files", "exec-2f");

    writeFileSync(join(tmpWs, "f1.txt"), "linha 1 modificada\n");
    writeFileSync(join(tmpWs, "f2.txt"), "linha A modificada\n");

    const diffF1 = await git.obterDiff(tmpWs, undefined, "f1.txt");
    expect(diffF1).toContain("f1.txt");
    expect(diffF1).not.toContain("f2.txt");
  });

  it("listarHistorico com caminhoArquivo filtra commits daquele arquivo", async () => {
    await git.inicializar(tmpWs);

    writeFileSync(join(tmpWs, "comum.txt"), "v1\n");
    await git.autoCommit(tmpWs, "agente1", "commit comum", "exec-c1");

    writeFileSync(join(tmpWs, "apenas-dele.txt"), "v1\n");
    await git.autoCommit(tmpWs, "agente1", "commit isolado", "exec-iso");

    const histIsolado = await git.listarHistorico(tmpWs, 10, "apenas-dele.txt");
    expect(histIsolado.length).toBe(1);
    expect(histIsolado[0]?.mensagem).toContain("commit isolado");
  });

  it("listarBranches e criarOuAlternarBranch gerencia branches no workspace", async () => {
    await git.inicializar(tmpWs);

    const branchesIniciais = await git.listarBranches(tmpWs);
    expect(branchesIniciais.atual).toBe("main");

    const resCriar = await git.criarOuAlternarBranch(tmpWs, "task/pesquisa-01", true);
    expect(resCriar.sucesso).toBe(true);

    const branchesApos = await git.listarBranches(tmpWs);
    expect(branchesApos.atual).toBe("task/pesquisa-01");
    expect(branchesApos.branches).toContain("main");
    expect(branchesApos.branches).toContain("task/pesquisa-01");
  });

  it("criarCheckpoint + listarCheckpoints registra tag pre-exec", async () => {
    writeFileSync(join(tmpWs, "README.md"), "# Teste");
    await git.inicializar(tmpWs);
    const tag = await git.criarCheckpoint(tmpWs, "exec-abc123");
    expect(tag).toBe("checkpoint/pre-exec-abc123");
    const cps = await git.listarCheckpoints(tmpWs);
    expect(cps.length).toBe(1);
    expect(cps[0]?.tag).toBe("checkpoint/pre-exec-abc123");
  });

  it("criarBranchTarefa gera branch task/<id> sanitizada", async () => {
    writeFileSync(join(tmpWs, "README.md"), "# Teste");
    await git.inicializar(tmpWs);
    const res = await git.criarBranchTarefa(tmpWs, "Minha Tarefa 01!");
    expect(res.sucesso).toBe(true);
    expect(res.branch).toBe("task/minha-tarefa-01");
    const info = await git.listarBranches(tmpWs);
    expect(info.atual).toBe("task/minha-tarefa-01");
  });

  it("worktrees: criar, listar e remover", async () => {
    writeFileSync(join(tmpWs, "README.md"), "# Teste");
    await git.inicializar(tmpWs);
    const criada = await git.criarWorktree(tmpWs, "task/paralela-01");
    expect(criada.sucesso).toBe(true);
    const lista = await git.listarWorktrees(tmpWs);
    expect(lista.length).toBeGreaterThanOrEqual(2);
    const removida = await git.removerWorktree(tmpWs, criada.caminho!);
    expect(removida.sucesso).toBe(true);
  });
});
