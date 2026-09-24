import React, { useState, useEffect, useCallback, useMemo, type FC } from "react";
import { useSearchParams } from "react-router-dom";
import { useOpenCorp } from "../../../providers/OpenCorpProvider.js";
import { type WorkspaceGitStatus } from "@opencorp/sdk";
import { showToast } from "../../../shared/ui/Toast.js";
import { FileTree, type NoArvore } from "../components/FileTree.js";
import { CodeEditorTabs, type TabArquivo } from "../components/CodeEditorTabs.js";
import { WorkspaceTerminals } from "../components/WorkspaceTerminals.js";
import { GitVersionPanel } from "../components/GitVersionPanel.js";
import { QuickFileSearchModal } from "../components/QuickFileSearchModal.js";
import { GitBranch, RefreshCw, AlertTriangle, Folder, Search } from "lucide-react";

export const WorkspaceView: FC = () => {
  const { client, workspaceId, tratarErro } = useOpenCorp();
  const [searchParams, setSearchParams] = useSearchParams();

  // Abas da Sidebar (Arquivos vs Git & Versões)
  const [sidebarTab, setSidebarTab] = useState<"arquivos" | "git">("arquivos");
  const [arquivosPendentesCount, setArquivosPendentesCount] = useState<number>(0);

  // Busca rápida (Ctrl+P) e Árvore de arquivos
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [arvore, setArvore] = useState<NoArvore[]>([]);

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
      if (git && Array.isArray(git.untracked)) {
        // Atualiza contagem se disponível
      }
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

  // Carregamento da árvore de arquivos conectando à API real do OpenCorp
  const carregarArvore = useCallback(async () => {
    if (!wsEfetivo) {
      setArvore([]);
      return;
    }
    try {
      const origin =
        typeof window !== "undefined"
          ? window.location.origin
          : "http://127.0.0.1:4100";
      const wsParam = `&workspace=${encodeURIComponent(wsEfetivo)}`;
      const resp = await fetch(
        `${origin}/files/tree?profundidade=6${wsParam}`,
        {
          headers: {
            "x-opencorp-workspace": wsEfetivo,
            "x-workspace-id": wsEfetivo,
          },
        }
      );
      if (resp.ok) {
        const data = (await resp.json()) as { tipo: string; arvore: NoArvore[] };
        const lista = Array.isArray(data.arvore) ? data.arvore : [];
        setArvore(lista);
      }
    } catch {
      // Falha não-fatal caso o workspace esteja inicializando
    }
  }, [wsEfetivo]);

  useEffect(() => {
    void carregarArvore();
  }, [carregarArvore]);

  // Extração recursiva de caminhos de arquivos para busca rápida (Ctrl+P) e arquivos disponíveis
  const todosArquivos = useMemo(() => {
    const list: string[] = [];
    const rec = (nos: NoArvore[]) => {
      for (const n of nos) {
        if (n.tipo === "arquivo") {
          list.push(n.caminho);
        }
        if (n.filhos && n.filhos.length > 0) {
          rec(n.filhos);
        }
      }
    };
    rec(arvore);
    return list;
  }, [arvore]);

  // Listener global de teclado (Ctrl+P / Cmd+P para busca, Escape para fechar)
  useEffect(() => {
    const onKeyDownGlobal = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setBuscaAberta((prev) => !prev);
      } else if (e.key === "Escape") {
        if (buscaAberta) {
          e.preventDefault();
          setBuscaAberta(false);
        }
      }
    };

    window.addEventListener("keydown", onKeyDownGlobal);
    return () => window.removeEventListener("keydown", onKeyDownGlobal);
  }, [buscaAberta]);

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
          ÁREA 1 (ESQUERDA): BARRA LATERAL (ARQUIVOS / GIT & VERSÕES)
         ───────────────────────────────────────────────────────────── */}
      <aside className="w-64 sm:w-72 h-full flex flex-col flex-shrink-0 bg-zinc-950 border-r border-zinc-850 overflow-hidden">
        {/* Seletor Superior de Abas da Sidebar: Arquivos vs Git */}
        <div className="h-9 border-b border-zinc-850 px-2 flex items-center justify-between bg-zinc-900/60 shrink-0">
          <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded-lg border border-zinc-800/80 w-full text-xs">
            <button
              type="button"
              onClick={() => setSidebarTab("arquivos")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                sidebarTab === "arquivos"
                  ? "bg-zinc-800 text-zinc-100 font-semibold shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Folder size={12} className={sidebarTab === "arquivos" ? "text-amber-400" : "text-zinc-500"} />
              <span>Arquivos</span>
            </button>
            <button
              type="button"
              onClick={() => setSidebarTab("git")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                sidebarTab === "git"
                  ? "bg-zinc-800 text-zinc-100 font-semibold shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <GitBranch size={12} className={sidebarTab === "git" ? "text-purple-400" : "text-zinc-500"} />
              <span>Git &amp; Versões</span>
              {arquivosPendentesCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {arquivosPendentesCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Conteúdo da Sidebar Conforme a Aba */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {sidebarTab === "arquivos" ? (
            <FileTree
              arquivoAtivo={tabAtiva}
              workspaceId={wsEfetivo}
              aoSelecionarArquivo={(caminho) => void abrirArquivo(caminho)}
              aoRenomearArquivo={tratarRenomearArquivo}
              aoExcluirArquivo={tratarExcluirArquivo}
              aoDescartarArquivo={tratarDescartarArquivo}
              aoAbrirGit={() => setSidebarTab("git")}
              aoCarregarArvore={setArvore}
            />
          ) : (
            <GitVersionPanel
              workspaceId={wsEfetivo}
              aoAbrirArquivo={(caminho) => void abrirArquivo(caminho)}
              aoDescartarArquivo={tratarDescartarArquivo}
              aoReverterWorkspace={() => {
                if (tabAtiva) void abrirArquivo(tabAtiva);
                void carregarGit();
              }}
              onStatusChange={(st) => {
                setArquivosPendentesCount(st?.arquivos.length || 0);
              }}
            />
          )}
        </div>
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
            <button
              type="button"
              onClick={() => setBuscaAberta(true)}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[10px] text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer"
              title="Buscar arquivos no workspace (Ctrl+P)"
            >
              <Search size={11} className="text-zinc-400" />
              <span>Buscar (Ctrl+P)</span>
            </button>

            <button
              type="button"
              onClick={() => setSidebarTab("git")}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[10px] transition-colors cursor-pointer"
              title="Abrir painel Git & Versões"
            >
              <GitBranch size={11} className="text-emerald-400" />
              <span>{gitStatus?.branch || "main"}</span>
              {gitStatus?.dirty && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-amber-400"
                  title="Modificações Git pendentes"
                />
              )}
            </button>

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
            arquivosDisponiveis={todosArquivos}
          />
        </div>

        {/* ÁREA 3 (DIREITA INFERIOR): TERMINAL BASH MULTI-ABAS */}
        <WorkspaceTerminals altura="12rem" />
      </main>

      {/* Modal de Busca Rápida de Arquivos (Ctrl+P) */}
      <QuickFileSearchModal
        aberto={buscaAberta}
        aoFechar={() => setBuscaAberta(false)}
        arquivos={todosArquivos}
        aoSelecionarArquivo={(caminho) => void abrirArquivo(caminho)}
      />
    </div>
  );
};
