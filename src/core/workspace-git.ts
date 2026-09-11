import { existsSync } from "node:fs";
import { join } from "node:path";
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
      novoConteudo += "\nlogs/\n*.log\n*.jsonl\n";
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
   */
  async listarHistorico(wsPath: string, limite = 30): Promise<CommitInfo[]> {
    if (!this.temGit(wsPath)) return [];

    try {
      const delimitador = "§§";
      const formato = `%H${delimitador}%h${delimitador}%an${delimitador}%ae${delimitador}%aI${delimitador}%s`;
      const res = await execa(
        "git",
        ["log", `-n${limite}`, `--pretty=format:${formato}`],
        { cwd: wsPath, reject: false },
      );

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
   */
  async obterDiff(wsPath: string, commitHash?: string): Promise<string> {
    if (!this.temGit(wsPath)) return "";

    try {
      if (commitHash) {
        // Diff do commit contra o anterior
        const res = await execa("git", ["show", "--stat", "-p", commitHash], { cwd: wsPath, reject: false });
        return res.stdout || "";
      }

      // Diff uncommitted atual (staged + unstaged)
      const res = await execa("git", ["diff", "HEAD"], { cwd: wsPath, reject: false });
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
}
