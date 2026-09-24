import { existsSync, rmSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { execa } from "execa";

export interface CommitInfo {
  hash: string;
  hashCurto: string;
  autor: string;
  email: string;
  data: string;
  mensagem: string;
  arquivosAlterados?: number;
}

export interface StatusItemGit {
  caminho: string;
  status: "modificado" | "adicionado" | "deletado" | "renomeado" | "untracked";
  staged: boolean;
}

export interface StatusWorkspaceGit {
  limpo: boolean;
  branch: string;
  arquivos: StatusItemGit[];
}

export const GITIGNORE_PADRAO_WORKSPACE = `# ==============================================================================
# .gitignore Oficial de Workspace OpenCorp
# ==============================================================================

# 1. Bancos de Dados SQLite (PROIBIDO versionar no Git — corrompe e incha)
*.db
*.db-journal
*.db-wal
*.db-shm
.opencorp/*.db

# 2. Logs contínuos e Streams de Eventos (alta frequência de escrita)
logs/
*.log
*.jsonl
.opencorp/events.jsonl
.opencorp/logs/
.opencorp/cron/

# 3. Mídia Pesada, Renderizações e Banco de Imagens
exports/videos/
exports/
assets/banco_imagens/
*.mp4
*.wav
*.mp3
*.webm

# 4. Dependências de Código e Ambientes Virtuais
node_modules/
.venv/
__pycache__/
*.pyc

# 5. Estados Operacionais Efêmeros do OpenCorp
.opencorp/sessions/
.opencorp/approvals/*.json
.opencorp/tokens.json

# 6. Runtime e Cache do OpenCode
.opencode
.opencorp/opencode/
.opencorp/opencode-data/
`;

export class WorkspaceGit {
  /**
   * Verifica se o diretório do workspace possui um repositório Git inicializado.
   */
  temGit(wsPath: string): boolean {
    return existsSync(join(wsPath, ".git"));
  }

  /**
   * Garante a existência do .gitignore oficial do workspace.
   */
  async garantirGitignore(wsPath: string): Promise<boolean> {
    const gitignorePath = join(wsPath, ".gitignore");
    if (!existsSync(gitignorePath)) {
      await writeFile(gitignorePath, GITIGNORE_PADRAO_WORKSPACE, "utf8");
      return true;
    }
    // Se já existe, garante que *.db e logs/ estejam ignorados
    const atual = await readFile(gitignorePath, "utf8");
    let modificado = false;
    let novoConteudo = atual;
    if (!atual.includes("*.db")) {
      novoConteudo += "\n*.db\n*.db-wal\n*.db-shm\n.opencorp/*.db\n";
      modificado = true;
    }
    if (!atual.includes("node_modules/")) {
      novoConteudo += "\nnode_modules/\n.venv/\n";
      modificado = true;
    }
    if (!atual.includes("logs/")) {
      novoConteudo += "\nlogs/\n*.log\n*.jsonl\n.opencorp/logs/\n";
      modificado = true;
    } else if (!atual.includes(".opencorp/logs/")) {
      novoConteudo += "\n.opencorp/logs/\n";
      modificado = true;
    }
    if (modificado) {
      await writeFile(gitignorePath, novoConteudo, "utf8");
    }
    return modificado;
  }

  /**
   * Inicializa o repositório Git no workspace, cria .gitignore e faz o commit inicial.
   */
  async inicializar(wsPath: string): Promise<{ inicializado: boolean; mensagem: string; hash?: string }> {
    try {
      await this.garantirGitignore(wsPath);

      if (this.temGit(wsPath)) {
        return { inicializado: false, mensagem: "Repositório Git já existente no workspace" };
      }

      // 1. git init
      await execa("git", ["init", "-b", "main"], { cwd: wsPath });

      // 2. Configura autor padrão local se não houver
      await execa("git", ["config", "user.name", "OpenCorp Agent"], { cwd: wsPath });
      await execa("git", ["config", "user.email", "agent@opencorp.local"], { cwd: wsPath });

      // 3. Stage de arquivos iniciais respeitando .gitignore
      await execa("git", ["add", "-A"], { cwd: wsPath });

      // 4. Commit inicial
      await execa(
        "git",
        ["commit", "-m", "feat(workspace): inicialização do workspace no OpenCorp"],
        { cwd: wsPath },
      );

      const hashRes = await execa("git", ["rev-parse", "HEAD"], { cwd: wsPath });
      return {
        inicializado: true,
        mensagem: "Repositório Git inicializado com sucesso",
        hash: hashRes.stdout.trim(),
      };
    } catch (erro) {
      const msgErro = erro instanceof Error ? erro.message : String(erro);
      return { inicializado: false, mensagem: `Falha ao inicializar Git: ${msgErro}` };
    }
  }

  /**
   * Cria uma tag/checkpoint de pré-execução para permitir rollback instantâneo se a sessão falhar.
   */
  async criarCheckpoint(wsPath: string, execId: string): Promise<string | null> {
    if (!this.temGit(wsPath)) return null;

    try {
      // Verifica se há pelo menos um commit
      const head = await execa("git", ["rev-parse", "--verify", "HEAD"], { cwd: wsPath, reject: false });
      if (head.exitCode !== 0) return null;

      const tag = `checkpoint/pre-${execId}`;
      await execa("git", ["tag", "-f", tag], { cwd: wsPath });
      return tag;
    } catch {
      return null;
    }
  }

  /**
   * Detecta arquivos modificados e cria um commit semântico atribuído ao agente da execução.
   */
  async autoCommit(
    wsPath: string,
    autor: string,
    ordem: string,
    execId: string,
  ): Promise<{ commit: boolean; hash?: string; mensagem?: string }> {
    if (!this.temGit(wsPath)) {
      return { commit: false, mensagem: "Workspace sem repositório Git" };
    }

    try {
      // 1. Verifica se há arquivos modificados ou untracked
      const status = await execa("git", ["status", "--porcelain"], { cwd: wsPath });
      if (!status.stdout.trim()) {
        return { commit: false, mensagem: "Nenhum arquivo alterado" };
      }

      // 2. Garante o .gitignore antes de adicionar
      await this.garantirGitignore(wsPath);

      // 3. Stage de todas as mudanças elegíveis
      await execa("git", ["add", "-A"], { cwd: wsPath });

      // 4. Monta mensagem semântica limpa
      const resumoOrdem = ordem
        .replace(/\r?\n/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const resumoTruncado = resumoOrdem.length > 60 ? `${resumoOrdem.slice(0, 60)}...` : resumoOrdem;
      const commitMsg = `agent(${autor}): ${resumoTruncado || "execução concluída"} [${execId}]`;

      const nomeAutor = autor.startsWith("@") ? autor.slice(1) : autor;
      const emailAutor = `${nomeAutor.toLowerCase().replace(/[^a-z0-9_-]/g, "")}@opencorp.local`;

      // 5. Commit
      await execa(
        "git",
        [
          "-c",
          `user.name=${nomeAutor}`,
          "-c",
          `user.email=${emailAutor}`,
          "commit",
          "-m",
          commitMsg,
          `--author=${nomeAutor} <${emailAutor}>`,
        ],
        { cwd: wsPath },
      );

      const hashRes = await execa("git", ["rev-parse", "HEAD"], { cwd: wsPath });
      return {
        commit: true,
        hash: hashRes.stdout.trim(),
        mensagem: commitMsg,
      };
    } catch (erro) {
      const msgErro = erro instanceof Error ? erro.message : String(erro);
      return { commit: false, mensagem: `Erro no auto-commit: ${msgErro}` };
    }
  }

  /**
   * Lista o histórico de commits do workspace com metadados estruturados.
   * Se caminhoArquivo for fornecido, filtra os commits que alteraram aquele arquivo.
   */
  async listarHistorico(wsPath: string, limite = 30, caminhoArquivo?: string): Promise<CommitInfo[]> {
    if (!this.temGit(wsPath)) return [];

    try {
      const delimitador = "§§";
      const formato = `%H${delimitador}%h${delimitador}%an${delimitador}%ae${delimitador}%aI${delimitador}%s`;
      const args = ["log", `-n${limite}`, `--pretty=format:${formato}`];
      if (caminhoArquivo) {
        args.push("--", caminhoArquivo);
      }
      const res = await execa("git", args, { cwd: wsPath, reject: false });

      if (res.exitCode !== 0 || !res.stdout.trim()) {
        return [];
      }

      const linhas = res.stdout.trim().split("\n");
      const commits: CommitInfo[] = [];

      for (const linha of linhas) {
        const partes = linha.split(delimitador);
        if (partes.length >= 6) {
          commits.push({
            hash: partes[0]!,
            hashCurto: partes[1]!,
            autor: partes[2]!,
            email: partes[3]!,
            data: partes[4]!,
            mensagem: partes[5]!,
          });
        }
      }

      return commits;
    } catch {
      return [];
    }
  }

  /**
   * Obtém o diff de um commit específico ou as mudanças não commitadas atuais.
   * Se caminhoArquivo for fornecido, filtra o diff apenas para aquele arquivo.
   */
  async obterDiff(wsPath: string, commitHash?: string, caminhoArquivo?: string): Promise<string> {
    if (!this.temGit(wsPath)) return "";

    try {
      if (commitHash) {
        // Diff do commit contra o anterior
        const args = ["show", "--stat", "-p", commitHash];
        if (caminhoArquivo) {
          args.push("--", caminhoArquivo);
        }
        const res = await execa("git", args, { cwd: wsPath, reject: false });
        return res.stdout || "";
      }

      // Diff uncommitted atual (staged + unstaged)
      const args = ["diff", "HEAD"];
      if (caminhoArquivo) {
        args.push("--", caminhoArquivo);
      }
      const res = await execa("git", args, { cwd: wsPath, reject: false });
      return res.stdout || "";
    } catch {
      return "";
    }
  }

  /**
   * Reverte o workspace para um commit ou checkpoint anterior em 1 clique / comando.
   */
  async reverter(
    wsPath: string,
    alvo: string,
  ): Promise<{ sucesso: boolean; mensagem: string; hashAtual?: string }> {
    if (!this.temGit(wsPath)) {
      return { sucesso: false, mensagem: "Workspace não possui repositório Git" };
    }

    try {
      // 1. Se alvo for um execId, tenta resolver a tag de checkpoint
      let ref = alvo;
      if (alvo.startsWith("exec-")) {
        const tag = `checkpoint/pre-${alvo}`;
        const checkTag = await execa("git", ["rev-parse", "--verify", tag], { cwd: wsPath, reject: false });
        if (checkTag.exitCode === 0) {
          ref = tag;
        }
      }

      // 2. Reset hard para o alvo
      await execa("git", ["reset", "--hard", ref], { cwd: wsPath });

      // 3. Limpa arquivos untracked criados após o ponto (sem tocar nos arquivos do .gitignore)
      await execa("git", ["clean", "-fd"], { cwd: wsPath });

      const hashAtual = await execa("git", ["rev-parse", "HEAD"], { cwd: wsPath });
      return {
        sucesso: true,
        mensagem: `Workspace revertido com sucesso para ${ref}`,
        hashAtual: hashAtual.stdout.trim(),
      };
    } catch (erro) {
      const msgErro = erro instanceof Error ? erro.message : String(erro);
      return { sucesso: false, mensagem: `Falha ao reverter: ${msgErro}` };
    }
  }

  /**
   * Obtém o status granular dos arquivos no workspace (modificados, untracked, deletados).
   */
  async obterStatusArquivos(wsPath: string): Promise<StatusWorkspaceGit> {
    if (!this.temGit(wsPath)) {
      return { limpo: true, branch: "main", arquivos: [] };
    }

    try {
      let branch = "main";
      try {
        const b = await execa("git", ["branch", "--show-current"], { cwd: wsPath, reject: false });
        if (b.stdout.trim()) branch = b.stdout.trim();
      } catch {}

      const res = await execa("git", ["status", "--porcelain=v1"], { cwd: wsPath, reject: false });
      if (res.exitCode !== 0 || !res.stdout.trim()) {
        return { limpo: true, branch, arquivos: [] };
      }

      const linhas = res.stdout.split("\n").filter((l) => l.trim().length >= 3);
      const arquivos: StatusItemGit[] = [];

      for (const l of linhas) {
        const x = l[0] ?? " ";
        const y = l[1] ?? " ";
        const caminho = l.slice(3).trim();

        let status: StatusItemGit["status"] = "modificado";
        let staged = false;

        if (x === "?" && y === "?") {
          status = "untracked";
        } else if (x === "A" || y === "A") {
          status = "adicionado";
          staged = x === "A";
        } else if (x === "D" || y === "D") {
          status = "deletado";
          staged = x === "D";
        } else if (x === "R" || y === "R") {
          status = "renomeado";
          staged = x === "R";
        } else {
          status = "modificado";
          staged = x === "M";
        }

        arquivos.push({ caminho, status, staged });
      }

      return {
        limpo: arquivos.length === 0,
        branch,
        arquivos,
      };
    } catch {
      return { limpo: true, branch: "main", arquivos: [] };
    }
  }

  /**
   * Restaura ou descarta alterações de um arquivo ESPECÍFICO (cirúrgico).
   * Se commitHash for fornecido, restaura o arquivo para a versão daquele commit.
   * Se commitHash não for fornecido, descarta as alterações locais não comitadas do arquivo.
   */
  async restaurarArquivo(
    wsPath: string,
    caminhoArquivo: string,
    commitHash?: string,
  ): Promise<{ sucesso: boolean; mensagem: string }> {
    if (!this.temGit(wsPath)) {
      return { sucesso: false, mensagem: "Workspace não possui repositório Git" };
    }

    // Proteção de path traversal
    const normalizado = relative(wsPath, resolve(wsPath, caminhoArquivo));
    if (normalizado.startsWith("..") || normalizado.includes("\0")) {
      return { sucesso: false, mensagem: "Caminho de arquivo inválido ou fora do workspace" };
    }

    try {
      if (commitHash) {
        // Restaura arquivo a partir de um commit específico
        const res = await execa("git", ["checkout", commitHash, "--", normalizado], {
          cwd: wsPath,
          reject: false,
        });
        if (res.exitCode === 0) {
          return {
            sucesso: true,
            mensagem: `Arquivo "${normalizado}" restaurado com sucesso para a versão ${commitHash.slice(0, 7)}`,
          };
        }
        // Fallback para git restore se checkout falhar
        const resRestore = await execa(
          "git",
          ["restore", `--source=${commitHash}`, "--", normalizado],
          { cwd: wsPath, reject: false },
        );
        if (resRestore.exitCode === 0) {
          return {
            sucesso: true,
            mensagem: `Arquivo "${normalizado}" restaurado com sucesso para a versão ${commitHash.slice(0, 7)}`,
          };
        }
        return {
          sucesso: false,
          mensagem: `Falha ao restaurar arquivo: ${res.stderr || resRestore.stderr || "commit ou arquivo não encontrado"}`,
        };
      }

      // Sem commitHash: descarta alterações locais
      // 1. Verifica se é um arquivo untracked
      const statusRes = await execa("git", ["status", "--porcelain", "--", normalizado], {
        cwd: wsPath,
        reject: false,
      });

      if (statusRes.stdout.trim().startsWith("??")) {
        // Arquivo untracked -> remove com segurança
        const fullPath = join(wsPath, normalizado);
        if (existsSync(fullPath)) {
          rmSync(fullPath, { force: true, recursive: true });
        }
        return {
          sucesso: true,
          mensagem: `Arquivo não-rastreado "${normalizado}" removido com sucesso`,
        };
      }

      // Arquivo rastreado modificado -> descarta alterações da working tree
      const resCheckout = await execa("git", ["checkout", "HEAD", "--", normalizado], {
        cwd: wsPath,
        reject: false,
      });

      if (resCheckout.exitCode === 0) {
        return {
          sucesso: true,
          mensagem: `Alterações locais no arquivo "${normalizado}" descartadas com sucesso`,
        };
      }

      const resRestore = await execa("git", ["restore", "--", normalizado], {
        cwd: wsPath,
        reject: false,
      });

      if (resRestore.exitCode === 0) {
        return {
          sucesso: true,
          mensagem: `Alterações locais no arquivo "${normalizado}" descartadas com sucesso`,
        };
      }

      return {
        sucesso: false,
        mensagem: `Não foi possível descartar alterações do arquivo: ${resCheckout.stderr || resRestore.stderr}`,
      };
    } catch (erro) {
      const msgErro = erro instanceof Error ? erro.message : String(erro);
      return { sucesso: false, mensagem: `Erro ao processar arquivo: ${msgErro}` };
    }
  }

  /**
   * Lista as branches do workspace.
   */
  async listarBranches(wsPath: string): Promise<{ atual: string; branches: string[] }> {
    if (!this.temGit(wsPath)) return { atual: "main", branches: ["main"] };

    try {
      const res = await execa("git", ["branch", "--list"], { cwd: wsPath, reject: false });
      if (res.exitCode !== 0 || !res.stdout.trim()) {
        return { atual: "main", branches: ["main"] };
      }

      const linhas = res.stdout.split("\n");
      let atual = "main";
      const branches: string[] = [];

      for (const l of linhas) {
        const limpa = l.replace("*", "").trim();
        if (!limpa) continue;
        branches.push(limpa);
        if (l.trim().startsWith("*")) {
          atual = limpa;
        }
      }

      return { atual, branches };
    } catch {
      return { atual: "main", branches: ["main"] };
    }
  }

  /**
   * Cria ou alterna para uma branch no workspace.
   */
  async criarOuAlternarBranch(
    wsPath: string,
    nomeBranch: string,
    criarNova = false,
  ): Promise<{ sucesso: boolean; mensagem: string }> {
    if (!this.temGit(wsPath)) {
      return { sucesso: false, mensagem: "Workspace não possui repositório Git" };
    }

    const safeBranch = nomeBranch.trim().replace(/[^a-zA-Z0-9._\-/]/g, "-");
    if (!safeBranch) {
      return { sucesso: false, mensagem: "Nome de branch inválido" };
    }

    try {
      const args = criarNova ? ["checkout", "-B", safeBranch] : ["checkout", safeBranch];
      const res = await execa("git", args, { cwd: wsPath, reject: false });
      if (res.exitCode === 0) {
        return { sucesso: true, mensagem: `Alternado para a branch "${safeBranch}"` };
      }
      return { sucesso: false, mensagem: `Falha ao alternar branch: ${res.stderr}` };
    } catch (erro) {
      const msgErro = erro instanceof Error ? erro.message : String(erro);
      return { sucesso: false, mensagem: `Erro na operação de branch: ${msgErro}` };
    }
  }

  /**
   * Lista checkpoints (tags checkpoint/pre-*) com hash e data.
   */
  async listarCheckpoints(wsPath: string): Promise<Array<{ tag: string; execId: string; hash: string; data: string }>> {
    if (!this.temGit(wsPath)) return [];
    try {
      const res = await execa("git", ["tag", "-l", "checkpoint/pre-*", "--format=%(refname:short)%09%(objectname:short)%09%(creatordate:iso)"], { cwd: wsPath, reject: false });
      if (res.exitCode !== 0 || !res.stdout.trim()) return [];
      return res.stdout.trim().split("\n").map((l) => {
        const [tag = "", hash = "", data = ""] = l.split("\t");
        return { tag, execId: tag.replace("checkpoint/pre-", ""), hash, data };
      });
    } catch {
      return [];
    }
  }

  /**
   * Cria branch isolada por tarefa (task/<id>) a partir da branch atual.
   */
  async criarBranchTarefa(wsPath: string, tarefaId: string): Promise<{ sucesso: boolean; mensagem: string; branch?: string }> {
    if (!this.temGit(wsPath)) {
      return { sucesso: false, mensagem: "Workspace não possui repositório Git" };
    }
    const safe = tarefaId.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    if (!safe) return { sucesso: false, mensagem: "ID de tarefa inválido" };
    const branch = `task/${safe}`;
    try {
      const res = await execa("git", ["checkout", "-B", branch], { cwd: wsPath, reject: false });
      if (res.exitCode === 0) return { sucesso: true, mensagem: `Branch de tarefa "${branch}" criada`, branch };
      return { sucesso: false, mensagem: `Falha ao criar branch: ${res.stderr}` };
    } catch (erro) {
      return { sucesso: false, mensagem: `Erro: ${erro instanceof Error ? erro.message : String(erro)}` };
    }
  }

  /**
   * Git worktrees para execuções paralelas isoladas.
   */
  async listarWorktrees(wsPath: string): Promise<Array<{ caminho: string; hash: string; branch: string }>> {
    if (!this.temGit(wsPath)) return [];
    try {
      const res = await execa("git", ["worktree", "list", "--porcelain"], { cwd: wsPath, reject: false });
      if (res.exitCode !== 0 || !res.stdout.trim()) return [];
      const out: Array<{ caminho: string; hash: string; branch: string }> = [];
      let cur: { caminho?: string; hash?: string; branch?: string } = {};
      for (const l of res.stdout.split("\n")) {
        if (l.startsWith("worktree ")) { if (cur.caminho) out.push({ caminho: cur.caminho, hash: cur.hash ?? "", branch: cur.branch ?? "" }); cur = { caminho: l.slice(9).trim() }; }
        else if (l.startsWith("HEAD ")) cur.hash = l.slice(5).trim().slice(0, 7);
        else if (l.startsWith("branch ")) cur.branch = l.slice(7).trim();
      }
      if (cur.caminho) out.push({ caminho: cur.caminho, hash: cur.hash ?? "", branch: cur.branch ?? "" });
      return out;
    } catch {
      return [];
    }
  }

  async criarWorktree(wsPath: string, branch: string, caminho?: string): Promise<{ sucesso: boolean; mensagem: string; caminho?: string }> {
    if (!this.temGit(wsPath)) return { sucesso: false, mensagem: "Workspace não possui repositório Git" };
    const safeBranch = branch.trim().replace(/[^a-zA-Z0-9._\-/]/g, "-");
    if (!safeBranch) return { sucesso: false, mensagem: "Branch inválida" };
    const destino = caminho ?? join(wsPath, ".opencorp", "worktrees", safeBranch.replace(/\//g, "-"));
    try {
      const res = await execa("git", ["worktree", "add", "-B", safeBranch, destino], { cwd: wsPath, reject: false });
      if (res.exitCode === 0) return { sucesso: true, mensagem: `Worktree criada em ${destino}`, caminho: destino };
      return { sucesso: false, mensagem: `Falha: ${res.stderr}` };
    } catch (erro) {
      return { sucesso: false, mensagem: `Erro: ${erro instanceof Error ? erro.message : String(erro)}` };
    }
  }

  async removerWorktree(wsPath: string, caminho: string, forcar = true): Promise<{ sucesso: boolean; mensagem: string }> {
    const normalizado = relative(wsPath, resolve(wsPath, caminho));
    if (normalizado.startsWith("..")) return { sucesso: false, mensagem: "Caminho fora do workspace" };
    try {
      const args = ["worktree", "remove", forcar ? "--force" : "", normalizado].filter(Boolean);
      const res = await execa("git", args, { cwd: wsPath, reject: false });
      if (res.exitCode === 0) return { sucesso: true, mensagem: "Worktree removida" };
      return { sucesso: false, mensagem: `Falha: ${res.stderr}` };
    } catch (erro) {
      return { sucesso: false, mensagem: `Erro: ${erro instanceof Error ? erro.message : String(erro)}` };
    }
  }
}

export const workspaceGit = new WorkspaceGit();
