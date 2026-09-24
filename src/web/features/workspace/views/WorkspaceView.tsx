import React, { useState, useEffect, useCallback, useMemo, type FC } from "react";
import { useSearchParams } from "react-router-dom";
import { useOpenCorp } from "../../../providers/OpenCorpProvider.js";
import { type WorkspaceGitStatus } from "@opencorp/sdk";
import { showToast } from "../../../shared/ui/Toast.js";
import { FileTree } from "../components/FileTree.js";
import { CodeEditorTabs, type TabArquivo } from "../components/CodeEditorTabs.js";
import { WorkspaceTerminals } from "../components/WorkspaceTerminals.js";
import { GitBranch, RefreshCw, AlertTriangle } from "lucide-react";

export const WorkspaceView: FC = () => {
  const { client, workspaceId, tratarErro } = useOpenCorp();
  const [searchParams, setSearchParams] = useSearchParams();

  // Abas abertas de arquivos
  const [tabs, setTabs] = useState<TabArquivo[]>([]);
  const [tabAtiva, setTabAtiva] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Status Git
  const [gitStatus, setGitStatus] = useState<WorkspaceGitStatus | null>(null);
  const [carregandoGit, setCarregandoGit] = useState(false);

  // Resolução rigorosa de workspace SEM fallback hardcoded
  const wsEfetivo = useMemo(() => {
    const urlWs = searchParams.get("workspace");
    if (urlWs && urlWs.trim().length > 0) {
      return urlWs.trim();
    }
    if (workspaceId && workspaceId.trim().length > 0) {
      return workspaceId.trim();
    }
    if (typeof window !== "undefined") {
      const salvo =
        localStorage.getItem("oc-ws") ||
        localStorage.getItem("opencorp_workspace_id");
      if (salvo && salvo.trim().length > 0) {
        return salvo.trim();
      }
    }
    return "";
  }, [workspaceId, searchParams]);

  // Carregar status do Git do workspace ativo
  const carregarGit = useCallback(async () => {
    if (!wsEfetivo) {
      setGitStatus(null);
      return;
    }
    setCarregandoGit(true);
    try {
      const git = await client.workspaces.gitStatus().catch(() => null);
      setGitStatus(git);
    } catch {
      // Falha não-fatal caso o Git não esteja inicializado no workspace
      setGitStatus(null);
    } finally {
      setCarregandoGit(false);
    }
  }, [client, wsEfetivo]);

  useEffect(() => {
    void carregarGit();
  }, [carregarGit]);

  // Abrir ou focar arquivo
  const abrirArquivo = useCallback(
    async (caminho: string) => {
      if (!caminho) return;

      if (!wsEfetivo) {
        showToast("Nenhum workspace selecionado para abrir arquivos", "aviso");
        return;
      }

      // Se a aba já estiver aberta, apenas a foca
      const tabExistente = tabs.find((t) => t.caminho === caminho);
      if (tabExistente) {
        setTabAtiva(caminho);
        setSearchParams((prev) => {
          prev.set("file", caminho);
          return prev;
        });
        return;
      }

      try {
        const origin =
          typeof window !== "undefined"
            ? window.location.origin
            : "http://127.0.0.1:4100";
        const wsParam = `&workspace=${encodeURIComponent(wsEfetivo)}`;
        const resp = await fetch(
          `${origin}/files?path=${encodeURIComponent(caminho)}${wsParam}`,
          {
            headers: {
              "x-opencorp-workspace": wsEfetivo,
              "x-workspace-id": wsEfetivo,
            },
          }
        );

        if (!resp.ok) {
          const errData = (await resp.json().catch(() => ({}))) as {
            erro?: string;
          };
          throw new Error(
            errData.erro || `Falha ao ler arquivo (HTTP ${resp.status})`
          );
        }

        const data = await resp.json();
        const nome = caminho.split("/").pop() || caminho;
        const ext = nome.split(".").pop()?.toLowerCase() || "";
        const ehVid = ["mp4", "webm", "mkv", "mov"].includes(ext);
        const ehImg = ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext);
        const ehAud = ["mp3", "wav", "ogg", "m4a"].includes(ext);
        const ehMidia = ehVid || ehImg || ehAud;
        const ehBinario = Boolean(data.binario) || ehMidia;

        let texto = "";
        if (!ehBinario) {
          if (typeof data === "string") {
            texto = data;
          } else if (data && typeof data.conteudo === "string") {
            texto = data.conteudo;
          } else {
            texto = JSON.stringify(data, null, 2);
          }
        }

        const urlRaw =
          data.urlRaw ||
          `${origin}/files/raw?path=${encodeURIComponent(caminho)}${wsParam}`;

        const novaTab: TabArquivo = {
          caminho,
          nome,
          original: texto,
          editado: texto,
          modo: ehMidia ? "media" : ext === "md" ? "preview" : "editor",
          binario: ehBinario,
          rawUrl: urlRaw,
          tamanho: data.tamanho,
          mime: data.mime,
          tipoMidia: ehVid ? "video" : ehImg ? "imagem" : ehAud ? "audio" : "outro",
          workspace: data.workspace || wsEfetivo,
        };

        setTabs((prev) => {
          const jaExiste = prev.find((t) => t.caminho === caminho);
          if (jaExiste) {
            return prev.map((t) => (t.caminho === caminho ? novaTab : t));
          }
          return [...prev, novaTab];
        });
        setTabAtiva(caminho);
        setSearchParams((prev) => {
          prev.set("file", caminho);
          return prev;
        });
      } catch (err: unknown) {
        tratarErro(err, `Erro ao abrir ${caminho}`);
      }
    },
    [tabs, wsEfetivo, setSearchParams, tratarErro]
  );

  // Inicialização pelo parâmetro da URL ?file=
  useEffect(() => {
    const fileParam = searchParams.get("file");
    if (fileParam && !tabs.some((t) => t.caminho === fileParam)) {
      void abrirArquivo(fileParam);
    }
  }, [searchParams, tabs, abrirArquivo]);

  // Fechar aba individual
  const fecharTab = (caminho: string) => {
    const t = tabs.find((x) => x.caminho === caminho);
    if (t && t.editado !== t.original) {
      if (
        !confirm(
          `O arquivo "${t.nome}" possui alterações não salvas. Fechar mesmo assim?`
        )
      ) {
        return;
      }
    }

    const idx = tabs.findIndex((x) => x.caminho === caminho);
    const rest = tabs.filter((x) => x.caminho !== caminho);
    setTabs(rest);

    if (tabAtiva === caminho) {
      const proxima = rest[Math.min(idx, rest.length - 1)]?.caminho ?? null;
      setTabAtiva(proxima);
      setSearchParams((prev) => {
        if (proxima) {
          prev.set("file", proxima);
        } else {
          prev.delete("file");
        }
        return prev;
      });
    }
  };

  // Callback de renomeação disparado pelo FileTree
  const tratarRenomearArquivo = useCallback(
    (antigo: string, novo: string) => {
      setTabs((prev) =>
        prev.map((t) => {
          if (t.caminho === antigo) {
            const nome = novo.split("/").pop() || novo;
            return { ...t, caminho: novo, nome };
          }
          if (t.caminho.startsWith(antigo + "/")) {
            const sufixo = t.caminho.slice(antigo.length);
            const caminhoAtualizado = novo + sufixo;
            const nome = caminhoAtualizado.split("/").pop() || caminhoAtualizado;
            return { ...t, caminho: caminhoAtualizado, nome };
          }
          return t;
        })
      );

      if (tabAtiva === antigo) {
        setTabAtiva(novo);
        setSearchParams((prev) => {
          prev.set("file", novo);
          return prev;
        });
      } else if (tabAtiva?.startsWith(antigo + "/")) {
        const caminhoAtualizado = novo + tabAtiva.slice(antigo.length);
        setTabAtiva(caminhoAtualizado);
        setSearchParams((prev) => {
          prev.set("file", caminhoAtualizado);
          return prev;
        });
      }
    },
    [tabAtiva, setSearchParams]
  );

  // Callback de exclusão disparado pelo FileTree
  const tratarExcluirArquivo = useCallback(
    (caminho: string) => {
      setTabs((prev) =>
        prev.filter((t) => t.caminho !== caminho && !t.caminho.startsWith(caminho + "/"))
      );

      if (tabAtiva === caminho || tabAtiva?.startsWith(caminho + "/")) {
        setTabAtiva(null);
        setSearchParams((prev) => {
          prev.delete("file");
          return prev;
        });
      }
    },
    [tabAtiva, setSearchParams]
  );

  // Callback de descarte de alterações via Git
  const tratarDescartarArquivo = useCallback(
    (caminho: string) => {
      const tabAberta = tabs.find((t) => t.caminho === caminho);
      if (tabAberta) {
        void abrirArquivo(caminho);
      }
      void carregarGit();
    },
    [tabs, abrirArquivo, carregarGit]
  );

  // Atualizar conteúdo digitado no editor
  const atualizarConteudo = (caminho: string, novoConteudo: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.caminho === caminho ? { ...t, editado: novoConteudo } : t))
    );
  };

  // Alternar modo da aba ativa (código, preview, split, media)
  const mudarModoTab = (
    caminho: string,
    modo: "editor" | "preview" | "split" | "media"
  ) => {
    setTabs((prev) =>
      prev.map((t) => (t.caminho === caminho ? { ...t, modo } : t))
    );
  };

  // Salvar alterações da tab ativa via PUT /files
  const salvarTab = async (tab: TabArquivo) => {
    if (tab.binario) return;
    const wsTab = tab.workspace || wsEfetivo;
    if (!wsTab) {
      showToast("Nenhum workspace ativo para salvar o arquivo", "aviso");
      return;
    }

    setSalvando(true);
    try {
      const origin =
        typeof window !== "undefined"
          ? window.location.origin
          : "http://127.0.0.1:4100";
      const wsParam = `&workspace=${encodeURIComponent(wsTab)}`;
      const resp = await fetch(
        `${origin}/files?path=${encodeURIComponent(tab.caminho)}${wsParam}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-opencorp-workspace": wsTab,
            "x-workspace-id": wsTab,
          },
          body: JSON.stringify({ conteudo: tab.editado }),
        }
      );

      if (!resp.ok) {
        const errData = (await resp.json().catch(() => ({}))) as {
          erro?: string;
        };
        throw new Error(
          errData.erro || `Falha ao salvar (HTTP ${resp.status})`
        );
      }

      setTabs((prev) =>
        prev.map((item) =>
          item.caminho === tab.caminho
            ? { ...item, original: tab.editado }
            : item
        )
      );

      showToast(`Arquivo "${tab.nome}" salvo com sucesso!`, "sucesso");
      void carregarGit();
    } catch (err: unknown) {
      tratarErro(err, "Falha ao salvar arquivo");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="flex h-full w-full bg-zinc-950 overflow-hidden select-none">
      {/* ─────────────────────────────────────────────────────────────
          ÁREA 1 (ESQUERDA): ÁRVORE DE ARQUIVOS (EXPLORER COM CRUD)
         ───────────────────────────────────────────────────────────── */}
      <aside className="w-64 sm:w-72 h-full flex-shrink-0">
        <FileTree
          arquivoAtivo={tabAtiva}
          workspaceId={wsEfetivo}
          aoSelecionarArquivo={(caminho) => void abrirArquivo(caminho)}
          aoRenomearArquivo={tratarRenomearArquivo}
          aoExcluirArquivo={tratarExcluirArquivo}
          aoDescartarArquivo={tratarDescartarArquivo}
        />
      </aside>

      {/* ─────────────────────────────────────────────────────────────
          COLUNA DIREITA (DIVIDIDA EM SUPERIOR E INFERIOR)
         ───────────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col h-full min-w-0 bg-zinc-950 overflow-hidden">
        {/* Barra de Status do Workspace / Git */}
        <div className="h-8 border-b border-zinc-850 px-3 flex items-center justify-between bg-zinc-900/40 text-[11px] font-mono text-zinc-400 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-zinc-500">workspace:</span>
            {wsEfetivo ? (
              <span className="text-zinc-200 font-semibold">{wsEfetivo}</span>
            ) : (
              <span className="text-amber-400 flex items-center gap-1 font-sans">
                <AlertTriangle size={12} />
                <span>nenhum workspace selecionado</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px]">
              <GitBranch size={11} className="text-emerald-400" />
              <span>{gitStatus?.branch || "main"}</span>
              {gitStatus?.dirty && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-amber-400"
                  title="Modificações Git pendentes"
                />
              )}
            </div>

            <button
              type="button"
              onClick={carregarGit}
              title="Recarregar status Git"
              disabled={!wsEfetivo}
              className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 disabled:opacity-30 transition-colors cursor-pointer"
            >
              <RefreshCw
                size={11}
                className={carregandoGit ? "animate-spin" : ""}
              />
            </button>
          </div>
        </div>

        {/* ÁREA 2 (DIREITA SUPERIOR): EDITOR MULTI-ABAS / PREVIEW / MEDIA */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <CodeEditorTabs
            tabs={tabs}
            tabAtiva={tabAtiva}
            aoMudarTabAtiva={(caminho) => {
              setTabAtiva(caminho);
              setSearchParams((prev) => {
                prev.set("file", caminho);
                return prev;
              });
            }}
            aoFecharTab={fecharTab}
            aoAtualizarConteudo={atualizarConteudo}
            aoMudarModoTab={mudarModoTab}
            aoSalvarTab={salvarTab}
            salvando={salvando}
            aoAbrirArquivo={(caminho) => void abrirArquivo(caminho)}
          />
        </div>

        {/* ÁREA 3 (DIREITA INFERIOR): TERMINAL BASH MULTI-ABAS */}
        <WorkspaceTerminals altura="12rem" />
      </main>
    </div>
  );
};
