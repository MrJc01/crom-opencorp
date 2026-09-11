import { workspaceGit } from "./workspace-git.js";

export interface GitSlashResult {
  tratado: boolean;
  mensagem: string;
  gitStatus?: {
    workspace: string;
    branch: string;
    arquivos: Array<{ arquivo: string; status: string; staged: boolean }>;
    clean: boolean;
  };
  gitDiff?: {
    arquivo?: string;
    diff: string;
  };
}

/**
 * Intercepta e processa comandos slash relacionados ao Git no chat do Secretário Executivo.
 * Retorna tratado=true se o comando foi reconhecido e executado, com payload formatado.
 */
export async function processarComandoGitSecretario(
  comandoBruto: string,
  wsPath: string,
  wsId: string
): Promise<GitSlashResult> {
  const cmd = comandoBruto.trim();

  // 1. /git status ou /git sem argumentos ou /status-git
  if (/^\/git(\s+status)?$/i.test(cmd) || /^\/status-git$/i.test(cmd)) {
    const statusGit = await workspaceGit.obterStatusArquivos(wsPath);
    const arquivos = statusGit.arquivos.map((a) => {
      let st = "M";
      if (a.status === "untracked") st = "?";
      else if (a.status === "deletado") st = "D";
      else if (a.status === "adicionado") st = "A";
      else if (a.status === "renomeado") st = "R";
      return {
        arquivo: a.caminho,
        status: st,
        staged: a.staged,
      };
    });

    const limpo = statusGit.limpo || arquivos.length === 0;
    const msg = limpo
      ? `✨ **Git Status**: O working tree está 100% limpo. Nenhuma alteração pendente no workspace \`${wsId}\` (branch \`${statusGit.branch}\`).`
      : `📊 **Git Status**: Encontrado(s) **${arquivos.length}** arquivo(s) modificado(s) no workspace \`${wsId}\` (branch \`${statusGit.branch}\`). Use os cards interativos abaixo para inspecionar o diff ou descartar alterações pontuais:`;

    return {
      tratado: true,
      mensagem: msg,
      gitStatus: {
        workspace: wsId,
        branch: statusGit.branch,
        arquivos,
        clean: limpo,
      },
    };
  }

  // 2. /git diff [arquivo]
  if (/^\/git\s+diff(\s+.*)?$/i.test(cmd)) {
    const match = /^\/git\s+diff(?:\s+(.+))?$/i.exec(cmd);
    const arquivoAlvo = match?.[1]?.trim() || undefined;

    const diff = await workspaceGit.obterDiff(wsPath, undefined, arquivoAlvo);
    const temDiff = Boolean(diff && diff.trim());

    let msg = "";
    if (arquivoAlvo) {
      msg = temDiff
        ? `📄 **Git Diff**: Exibindo alterações pendentes em \`${arquivoAlvo}\`:`
        : `📄 **Git Diff**: Nenhuma modificação detectada no arquivo \`${arquivoAlvo}\`.`;
    } else {
      msg = temDiff
        ? `📄 **Git Diff**: Exibindo alterações pendentes no workspace \`${wsId}\`:`
        : `📄 **Git Diff**: Nenhuma modificação pendente no workspace \`${wsId}\`.`;
    }

    return {
      tratado: true,
      mensagem: msg,
      gitDiff: {
        arquivo: arquivoAlvo,
        diff: diff || "(Nenhuma alteração encontrada)",
      },
    };
  }

  // 3. /git restore <arquivo> ou /restore <arquivo> ou /descartar <arquivo>
  if (/^(\/git\s+restore|\/restore|\/descartar)(\s+.*)?$/i.test(cmd)) {
    const match = /^(\/git\s+restore|\/restore|\/descartar)(?:\s+(.+))?$/i.exec(cmd);
    const arquivoAlvo = match?.[2]?.trim();

    if (!arquivoAlvo) {
      return {
        tratado: true,
        mensagem: "⚠️ **Uso incorreto**: Informe o caminho do arquivo a ser descartado/restaurado.\n\n*Exemplo:* `/git restore src/config.ts` ou `/restore pautas.json`",
      };
    }

    const resDescarte = await workspaceGit.restaurarArquivo(wsPath, arquivoAlvo);

    if (!resDescarte.sucesso) {
      return {
        tratado: true,
        mensagem: `❌ **Falha ao descartar arquivo**: ${resDescarte.mensagem}`,
      };
    }

    // Consulta status atualizado após o descarte
    const statusAtualizado = await workspaceGit.obterStatusArquivos(wsPath);
    const arquivos = statusAtualizado.arquivos.map((a) => ({
      arquivo: a.caminho,
      status: a.status === "untracked" ? "?" : a.status === "deletado" ? "D" : "M",
      staged: a.staged,
    }));

    const limpo = statusAtualizado.limpo || arquivos.length === 0;
    const msg = `♻️ **Git Restore**: Alterações de \`${arquivoAlvo}\` descartadas com sucesso.\n\n${
      limpo
        ? "✨ O working tree agora está totalmente limpo!"
        : `Restam **${arquivos.length}** arquivo(s) com alterações pendentes no workspace.`
    }`;

    return {
      tratado: true,
      mensagem: msg,
      gitStatus: {
        workspace: wsId,
        branch: statusAtualizado.branch,
        arquivos,
        clean: limpo,
      },
    };
  }

  // 4. /rollback <alvo> — reversão total (com confirmação textual do alvo)
  if (/^\/rollback(\s+.*)?$/i.test(cmd) || /^\/git\s+rollback(\s+.*)?$/i.test(cmd)) {
    const match = /^(?:\/rollback|\/git\s+rollback)(?:\s+(.+))?$/i.exec(cmd);
    const alvo = match?.[1]?.trim();
    if (!alvo) {
      return {
        tratado: true,
        mensagem: "⚠️ **Uso incorreto**: Informe o alvo da reversão.\n\n*Exemplos:* `/rollback HEAD~1`, `/rollback <hash>`, `/rollback checkpoint/pre-exec-123`",
      };
    }
    const res = await workspaceGit.reverter(wsPath, alvo);
    if (!res.sucesso) {
      return { tratado: true, mensagem: `❌ **Falha no rollback**: ${res.mensagem}` };
    }
    return {
      tratado: true,
      mensagem: `⏪ **Rollback concluído**: Workspace \`${wsId}\` revertido para \`${alvo}\` (HEAD em \`${res.hashAtual?.slice(0, 7)}\`).`,
    };
  }

  // 5. /git branch / /git task-branch / /git worktree (atalhos operacionais)
  if (/^\/git\s+(branch|task-branch|worktree|checkpoints)/i.test(cmd)) {
    if (/^\/git\s+checkpoints/i.test(cmd)) {
      const cps = await workspaceGit.listarCheckpoints(wsPath);
      if (cps.length === 0) {
        return { tratado: true, mensagem: `📍 **Checkpoints**: Nenhum checkpoint registrado no workspace \`${wsId}\`.` };
      }
      const linhas = cps.slice(0, 10).map((c) => `- \`${c.tag}\` (${c.hash}) ${c.data}`);
      return { tratado: true, mensagem: `📍 **Checkpoints** no workspace \`${wsId}\`:\n\n${linhas.join("\n")}\n\nUse \`/rollback <tag>\` para reverter.` };
    }
    const mTask = /^\/git\s+task-branch\s+(.+)$/i.exec(cmd);
    if (mTask) {
      const res = await workspaceGit.criarBranchTarefa(wsPath, mTask[1]!.trim());
      return { tratado: true, mensagem: res.sucesso ? `🌿 **Branch criada**: \`${res.branch}\`` : `❌ ${res.mensagem}` };
    }
    const branches = await workspaceGit.listarBranches(wsPath);
    return {
      tratado: true,
      mensagem: `🌿 **Branches** no workspace \`${wsId}\` (atual: \`${branches.atual}\`):\n\n${branches.branches.map((b) => `- \`${b}\``).join("\n")}`,
    };
  }

  // 6. /git log
  if (/^\/git\s+log$/i.test(cmd)) {
    const historico = await workspaceGit.listarHistorico(wsPath, 6);

    if (!historico || historico.length === 0) {
      return {
        tratado: true,
        mensagem: `📜 **Git Log**: Nenhum commit encontrado no workspace \`${wsId}\`.`,
      };
    }

    const linhas = historico.map(
      (c) => `- \`${c.hashCurto}\` **${c.mensagem}** — *${c.autor}* (${c.data.slice(0, 16).replace("T", " ")})`
    );

    return {
      tratado: true,
      mensagem: `📜 **Git Log**: Últimos ${historico.length} commits no workspace \`${wsId}\`:\n\n${linhas.join("\n")}`,
    };
  }

  // 7. /git help
  if (/^\/git\s+help$/i.test(cmd) || /^\/help\s+git$/i.test(cmd)) {
    return {
      tratado: true,
      mensagem: `🛠️ **Comandos Git Disponíveis no Chat**:

- \`/git status\`: Exibe cards com arquivos modificados, opções de diff e descarte.
- \`/git diff [arquivo]\`: Mostra o diff colorido unificado de todo o workspace ou de um arquivo específico.
- \`/git restore <arquivo>\` (ou \`/restore <arquivo>\`): Descarta alterações em um único arquivo de forma cirúrgica.
- \`/git log\`: Lista os últimos commits automáticos gerados pelas execuções dos agentes.
- \`/rollback <alvo>\`: Reverte o workspace inteiro (HEAD~1, hash ou checkpoint/pre-*).
- \`/git checkpoints\`: Lista checkpoints pre-execução disponíveis para rollback.
- \`/git task-branch <id>\`: Cria branch isolada task/<id>.
- \`/git branch\`: Lista branches do workspace.
- \`/clear\`: Limpa a visualização da conversa na tela.`,
    };
  }

  return { tratado: false, mensagem: "" };
}
