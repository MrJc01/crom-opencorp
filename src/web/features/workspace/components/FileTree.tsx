import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type FC,
} from "react";
import { useOpenCorp } from "../../../providers/OpenCorpProvider.js";
import {
  Folder,
  FolderOpen,
  FileText,
  FileCode,
  Video,
  Image as ImageIcon,
  Music,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Search,
  FilePlus,
  FolderPlus,
  Edit3,
  Trash2,
  Copy,
  RotateCcw,
  X,
  AlertTriangle,
  GitBranch,
} from "lucide-react";
import { showToast } from "../../../shared/ui/Toast.js";

export interface NoArvore {
  nome: string;
  caminho: string;
  tipo: "dir" | "arquivo";
  tamanho?: number;
  filhos?: NoArvore[];
}

export interface FileTreeProps {
  arquivoAtivo?: string | null;
  workspaceId?: string;
  aoSelecionarArquivo: (caminho: string) => void;
  aoRenomearArquivo?: (antigo: string, novo: string) => void;
  aoExcluirArquivo?: (caminho: string) => void;
  aoDescartarArquivo?: (caminho: string) => void;
  aoAbrirGit?: () => void;
  aoCarregarArvore?: (arvore: NoArvore[]) => void;
}

interface MenuContextoState {
  visivel: boolean;
  x: number;
  y: number;
  no: NoArvore | null;
}

interface ModalArquivoState {
  tipo: "novo_arquivo" | "nova_pasta" | "renomear" | "excluir";
  alvo: NoArvore | null;
  pastaBase: string;
  valor: string;
  aberto: boolean;
  processando: boolean;
  erro: string | null;
}

function formatarBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function obterIconeArquivo(caminho: string) {
  const ext = caminho.split(".").pop()?.toLowerCase();
  if (["mp4", "webm", "mkv", "mov"].includes(ext || "")) {
    return <Video size={14} className="text-rose-400 shrink-0" />;
  }
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext || "")) {
    return <ImageIcon size={14} className="text-emerald-400 shrink-0" />;
  }
  if (["mp3", "wav", "ogg", "m4a"].includes(ext || "")) {
    return <Music size={14} className="text-purple-400 shrink-0" />;
  }
  if (["json", "js", "ts", "tsx", "jsx", "sh", "py"].includes(ext || "")) {
    return <FileCode size={14} className="text-amber-400 shrink-0" />;
  }
  return <FileText size={14} className="text-blue-400 shrink-0" />;
}

function extrairPastaPai(caminho: string): string {
  const partes = caminho.split("/");
  if (partes.length <= 1) return "";
  return partes.slice(0, -1).join("/");
}

export const FileTree: FC<FileTreeProps> = ({
  arquivoAtivo,
  workspaceId: propWorkspaceId,
  aoSelecionarArquivo,
  aoRenomearArquivo,
  aoExcluirArquivo,
  aoDescartarArquivo,
  aoAbrirGit,
  aoCarregarArvore,
}) => {
  const { workspaceId: ctxWorkspaceId } = useOpenCorp();
  const [arvore, setArvore] = useState<NoArvore[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState("");

  // Estado do Menu de Contexto (botão direito)
  const [menuContexto, setMenuContexto] = useState<MenuContextoState>({
    visivel: false,
    x: 0,
    y: 0,
    no: null,
  });

  // Estado dos Modais de CRUD
  const [modalArquivo, setModalArquivo] = useState<ModalArquivoState>({
    tipo: "novo_arquivo",
    alvo: null,
    pastaBase: "",
    valor: "",
    aberto: false,
    processando: false,
    erro: null,
  });

  const modalInputRef = useRef<HTMLInputElement | null>(null);

  // Resolução estrita de workspace SEM hardcode ou fantasma
  const wsEfetivo = useMemo(() => {
    if (propWorkspaceId && propWorkspaceId.trim().length > 0) {
      return propWorkspaceId.trim();
    }
    if (ctxWorkspaceId && ctxWorkspaceId.trim().length > 0) {
      return ctxWorkspaceId.trim();
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
  }, [propWorkspaceId, ctxWorkspaceId]);

  // Carregamento da árvore de arquivos conectando à API real do OpenCorp
  const carregarArvore = useCallback(async () => {
    if (!wsEfetivo) {
      setArvore([]);
      setErroCarregamento(null);
      return;
    }

    setCarregando(true);
    setErroCarregamento(null);

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
        setErroCarregamento(null);
        aoCarregarArvore?.(lista);
      } else {
        const errJson = (await resp.json().catch(() => null)) as {
          erro?: string;
          mensagem?: string;
          detail?: string;
        } | null;
        const msg =
          errJson?.erro ||
          errJson?.mensagem ||
          errJson?.detail ||
          `Erro HTTP ${resp.status} ao carregar arquivos`;
        setErroCarregamento(msg);
        showToast(msg, "erro");
        setArvore([]);
        aoCarregarArvore?.([]);
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Falha de conexão ao carregar arquivos";
      setErroCarregamento(msg);
      showToast(msg, "erro");
      setArvore([]);
      aoCarregarArvore?.([]);
    } finally {
      setCarregando(false);
    }
  }, [wsEfetivo, aoCarregarArvore]);

  useEffect(() => {
    void carregarArvore();
  }, [carregarArvore]);

  // Alternar pasta aberta/fechada
  const alternarPasta = (caminho: string) => {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(caminho)) {
        next.delete(caminho);
      } else {
        next.add(caminho);
      }
      return next;
    });
  };

  // ─────────────────────────────────────────────────────────────
  // CONTROLE DO MENU DE CONTEXTO
  // ─────────────────────────────────────────────────────────────
  const abrirMenuContexto = (e: React.MouseEvent, no: NoArvore | null) => {
    e.preventDefault();
    e.stopPropagation();
    const larguraMenu = 210;
    const alturaMenu = 240;
    const x = Math.min(e.clientX, window.innerWidth - larguraMenu);
    const y = Math.min(e.clientY, window.innerHeight - alturaMenu);
    setMenuContexto({
      visivel: true,
      x: Math.max(8, x),
      y: Math.max(8, y),
      no,
    });
  };

  const fecharMenuContexto = useCallback(() => {
    setMenuContexto((prev) => (prev.visivel ? { ...prev, visivel: false } : prev));
  }, []);

  // Fechar menu ao clicar fora ou apertar Escape
  useEffect(() => {
    const handleMouseDown = () => {
      fecharMenuContexto();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        fecharMenuContexto();
        setModalArquivo((prev) => (prev.aberto ? { ...prev, aberto: false } : prev));
      }
    };
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [fecharMenuContexto]);

  // ─────────────────────────────────────────────────────────────
  // OPERAÇÕES DE CRUD (MODAIS E DISPARO DE AÇÕES)
  // ─────────────────────────────────────────────────────────────
  const abrirModalNovoArquivo = (no: NoArvore | null = null) => {
    fecharMenuContexto();
    let pastaBase = "";
    if (no) {
      pastaBase = no.tipo === "dir" ? no.caminho : extrairPastaPai(no.caminho);
    }
    setModalArquivo({
      tipo: "novo_arquivo",
      alvo: no,
      pastaBase,
      valor: "",
      aberto: true,
      processando: false,
      erro: null,
    });
    setTimeout(() => modalInputRef.current?.focus(), 60);
  };

  const abrirModalNovaPasta = (no: NoArvore | null = null) => {
    fecharMenuContexto();
    let pastaBase = "";
    if (no) {
      pastaBase = no.tipo === "dir" ? no.caminho : extrairPastaPai(no.caminho);
    }
    setModalArquivo({
      tipo: "nova_pasta",
      alvo: no,
      pastaBase,
      valor: "",
      aberto: true,
      processando: false,
      erro: null,
    });
    setTimeout(() => modalInputRef.current?.focus(), 60);
  };

  const abrirModalRenomear = (no: NoArvore) => {
    fecharMenuContexto();
    const pastaBase = extrairPastaPai(no.caminho);
    setModalArquivo({
      tipo: "renomear",
      alvo: no,
      pastaBase,
      valor: no.nome,
      aberto: true,
      processando: false,
      erro: null,
    });
    setTimeout(() => {
      if (modalInputRef.current) {
        modalInputRef.current.focus();
        modalInputRef.current.select();
      }
    }, 60);
  };

  const abrirModalExcluir = (no: NoArvore) => {
    fecharMenuContexto();
    setModalArquivo({
      tipo: "excluir",
      alvo: no,
      pastaBase: extrairPastaPai(no.caminho),
      valor: no.nome,
      aberto: true,
      processando: false,
      erro: null,
    });
  };

  const copiarCaminho = async (caminho: string) => {
    fecharMenuContexto();
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(caminho);
        showToast(`Caminho "${caminho}" copiado!`, "sucesso");
      } catch {
        showToast(`Falha ao copiar caminho para a área de transferência`, "aviso");
      }
    }
  };

  const descartarAlteracoesArquivo = async (no: NoArvore) => {
    fecharMenuContexto();
    if (!wsEfetivo) return;

    try {
      const origin =
        typeof window !== "undefined"
          ? window.location.origin
          : "http://127.0.0.1:4100";
      const resp = await fetch(
        `${origin}/workspaces/git/restore?workspace=${encodeURIComponent(wsEfetivo)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-opencorp-workspace": wsEfetivo,
            "x-workspace-id": wsEfetivo,
          },
          body: JSON.stringify({
            arquivo: no.caminho,
            workspace: wsEfetivo,
          }),
        }
      );

      const data = (await resp.json().catch(() => ({}))) as {
        sucesso?: boolean;
        mensagem?: string;
        erro?: string;
      };

      if (resp.ok && data.sucesso !== false) {
        showToast(
          data.mensagem || `Alterações de "${no.nome}" descartadas!`,
          "sucesso"
        );
        aoDescartarArquivo?.(no.caminho);
        void carregarArvore();
      } else {
        const msg = data.erro || data.mensagem || "Falha ao descartar alterações";
        showToast(msg, "erro");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Erro ao restaurar: ${msg}`, "erro");
    }
  };

  const confirmarAcaoModal = async () => {
    if (!wsEfetivo) {
      showToast("Nenhum workspace selecionado para esta ação", "aviso");
      return;
    }

    const { tipo, alvo, pastaBase, valor } = modalArquivo;
    const nomeLimpo = valor.trim();

    if (tipo !== "excluir" && !nomeLimpo) {
      setModalArquivo((prev) => ({
        ...prev,
        erro: "Informe um nome válido (não pode ser vazio)",
      }));
      return;
    }

    if (tipo !== "excluir" && (nomeLimpo.includes("..") || nomeLimpo.includes("\\"))) {
      setModalArquivo((prev) => ({
        ...prev,
        erro: "Caracteres inválidos no nome do arquivo ou pasta",
      }));
      return;
    }

    setModalArquivo((prev) => ({ ...prev, processando: true, erro: null }));
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : "http://127.0.0.1:4100";

    try {
      // 1. EXCLUSÃO
      if (tipo === "excluir") {
        if (!alvo) return;
        const resp = await fetch(
          `${origin}/files?path=${encodeURIComponent(alvo.caminho)}&workspace=${encodeURIComponent(wsEfetivo)}`,
          {
            method: "DELETE",
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
          throw new Error(errData.erro || `Falha ao excluir (HTTP ${resp.status})`);
        }

        showToast(`"${alvo.nome}" excluído com sucesso!`, "sucesso");
        aoExcluirArquivo?.(alvo.caminho);
        setModalArquivo((prev) => ({ ...prev, aberto: false }));
        await carregarArvore();
        return;
      }

      // 2. NOVO ARQUIVO OU NOVA PASTA
      if (tipo === "novo_arquivo" || tipo === "nova_pasta") {
        const caminhoCompleto = pastaBase ? `${pastaBase}/${nomeLimpo}` : nomeLimpo;
        const ehDir = tipo === "nova_pasta";

        const resp = await fetch(
          `${origin}/files?workspace=${encodeURIComponent(wsEfetivo)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-opencorp-workspace": wsEfetivo,
              "x-workspace-id": wsEfetivo,
            },
            body: JSON.stringify({
              path: caminhoCompleto,
              tipo: ehDir ? "dir" : "arquivo",
              conteudo: "",
              workspace: wsEfetivo,
            }),
          }
        );

        if (!resp.ok) {
          const errData = (await resp.json().catch(() => ({}))) as {
            erro?: string;
          };
          throw new Error(
            errData.erro ||
              `Falha ao criar ${ehDir ? "pasta" : "arquivo"} (HTTP ${resp.status})`
          );
        }

        showToast(
          `${ehDir ? "Pasta" : "Arquivo"} "${nomeLimpo}" criado com sucesso!`,
          "sucesso"
        );

        // Expande pasta mãe se necessário
        if (pastaBase) {
          setExpandidos((prev) => new Set(prev).add(pastaBase));
        }
        if (ehDir) {
          setExpandidos((prev) => new Set(prev).add(caminhoCompleto));
        }

        setModalArquivo((prev) => ({ ...prev, aberto: false }));
        await carregarArvore();

        if (!ehDir) {
          aoSelecionarArquivo(caminhoCompleto);
        }
        return;
      }

      // 3. RENOMEAR
      if (tipo === "renomear") {
        if (!alvo) return;
        const novoCaminho = pastaBase ? `${pastaBase}/${nomeLimpo}` : nomeLimpo;

        if (novoCaminho === alvo.caminho) {
          setModalArquivo((prev) => ({ ...prev, aberto: false }));
          return;
        }

        const resp = await fetch(
          `${origin}/files/rename?workspace=${encodeURIComponent(wsEfetivo)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-opencorp-workspace": wsEfetivo,
              "x-workspace-id": wsEfetivo,
            },
            body: JSON.stringify({
              antigo: alvo.caminho,
              novo: novoCaminho,
              oldPath: alvo.caminho,
              newPath: novoCaminho,
              workspace: wsEfetivo,
            }),
          }
        );

        if (!resp.ok) {
          const errData = (await resp.json().catch(() => ({}))) as {
            erro?: string;
          };
          throw new Error(errData.erro || `Falha ao renomear (HTTP ${resp.status})`);
        }

        showToast(`Renomeado para "${nomeLimpo}"!`, "sucesso");
        aoRenomearArquivo?.(alvo.caminho, novoCaminho);
        setModalArquivo((prev) => ({ ...prev, aberto: false }));
        await carregarArvore();
        return;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setModalArquivo((prev) => ({ ...prev, erro: msg, processando: false }));
      showToast(msg, "erro");
    }
  };

  // Ordenação: Pastas primeiro (em ordem alfabética), depois arquivos
  const arvoreOrdenada = useMemo(() => {
    const ordenarNos = (itens: NoArvore[]): NoArvore[] => {
      return [...itens]
        .sort((a, b) => {
          if (a.tipo === "dir" && b.tipo !== "dir") return -1;
          if (a.tipo !== "dir" && b.tipo === "dir") return 1;
          return a.nome.localeCompare(b.nome);
        })
        .map((item) => {
          if (item.tipo === "dir" && item.filhos && item.filhos.length > 0) {
            return { ...item, filhos: ordenarNos(item.filhos) };
          }
          return item;
        });
    };
    return ordenarNos(arvore);
  }, [arvore]);

  // Renderização recursiva de cada nó com captura de clique direito
  const renderizarNo = (no: NoArvore, nivel = 0): React.ReactNode => {
    const isDir = no.tipo === "dir";
    const expandido = expandidos.has(no.caminho);
    const selecionado = arquivoAtivo === no.caminho;

    // Filtro simples de busca
    if (filtro.trim().length > 0) {
      const f = filtro.toLowerCase().trim();
      const coincideProprio = no.nome.toLowerCase().includes(f);
      if (!isDir && !coincideProprio) {
        return null;
      }
    }

    return (
      <div key={no.caminho} className="select-none text-xs">
        <div
          onClick={() => {
            if (isDir) {
              alternarPasta(no.caminho);
            } else {
              aoSelecionarArquivo(no.caminho);
            }
          }}
          onContextMenu={(e) => abrirMenuContexto(e, no)}
          style={{ paddingLeft: `${nivel * 12 + 6}px` }}
          className={`flex items-center gap-1.5 py-1 px-2 rounded-lg cursor-pointer transition-colors group ${
            selecionado
              ? "bg-emerald-950/60 text-emerald-200 font-semibold border-l-2 border-emerald-500"
              : "text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900/80"
          }`}
          title={no.caminho}
        >
          {isDir ? (
            <>
              <span className="text-zinc-500 group-hover:text-zinc-300">
                {expandido ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </span>
              {expandido ? (
                <FolderOpen size={14} className="text-amber-400 shrink-0" />
              ) : (
                <Folder size={14} className="text-amber-500/80 shrink-0" />
              )}
              <span className="truncate font-medium">{no.nome}</span>
            </>
          ) : (
            <>
              <span className="w-3" />
              {obterIconeArquivo(no.caminho)}
              <span className="truncate flex-1">{no.nome}</span>
              {no.tamanho !== undefined && (
                <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                  {formatarBytes(no.tamanho)}
                </span>
              )}
            </>
          )}
        </div>

        {isDir && expandido && no.filhos && (
          <div className="flex flex-col">
            {no.filhos.map((filho) => renderizarNo(filho, nivel + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="flex flex-col h-full w-full bg-zinc-950 border-r border-zinc-850 select-none overflow-hidden relative"
      onContextMenu={(e) => abrirMenuContexto(e, null)}
    >
      {/* Topo do Explorer com ações rápidas de raiz */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-850 bg-zinc-900/40">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
            Explorer
          </span>
          {wsEfetivo ? (
            <span
              className="text-[10px] text-zinc-500 font-mono truncate max-w-[100px]"
              title={wsEfetivo}
            >
              ({wsEfetivo})
            </span>
          ) : (
            <span className="text-[10px] text-amber-500/80 font-mono">
              (nenhum)
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => abrirModalNovoArquivo(null)}
            title="Novo Arquivo na raiz"
            disabled={!wsEfetivo}
            className="p-1 rounded text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 disabled:opacity-30 transition-colors cursor-pointer"
          >
            <FilePlus size={13} />
          </button>
          <button
            type="button"
            onClick={() => abrirModalNovaPasta(null)}
            title="Nova Pasta na raiz"
            disabled={!wsEfetivo}
            className="p-1 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-800 disabled:opacity-30 transition-colors cursor-pointer"
          >
            <FolderPlus size={13} />
          </button>
          {aoAbrirGit && (
            <button
              type="button"
              onClick={aoAbrirGit}
              title="Abrir Git & Versões (Commits e Diffs)"
              disabled={!wsEfetivo}
              className="p-1 rounded text-zinc-400 hover:text-purple-400 hover:bg-zinc-800 disabled:opacity-30 transition-colors cursor-pointer"
            >
              <GitBranch size={13} />
            </button>
          )}
          <button
            type="button"
            onClick={() => void carregarArvore()}
            title="Recarregar árvore"
            disabled={!wsEfetivo}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-30 transition-colors cursor-pointer"
          >
            <RefreshCw size={13} className={carregando ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Busca / Filtro rápido de arquivos */}
      <div className="p-2 border-b border-zinc-850/60">
        <div className="relative flex items-center bg-zinc-900/90 border border-zinc-800 rounded-lg px-2 py-1">
          <Search size={12} className="text-zinc-500 mr-1.5 shrink-0" />
          <input
            type="text"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar arquivos..."
            disabled={!wsEfetivo}
            className="w-full bg-transparent text-[11px] text-zinc-200 placeholder-zinc-500 focus:outline-none disabled:opacity-40"
          />
        </div>
      </div>

      {/* Lista da Árvore de Arquivos */}
      <div
        className="flex-1 overflow-y-auto p-1.5 space-y-0.5 font-mono scrollbar-thin"
        onContextMenu={(e) => abrirMenuContexto(e, null)}
      >
        {!wsEfetivo ? (
          <div className="p-6 text-center text-xs text-zinc-500 space-y-2">
            <Folder size={28} className="mx-auto opacity-30 text-zinc-400" />
            <p className="font-semibold text-zinc-300">Nenhum workspace selecionado</p>
            <p className="text-[11px] text-zinc-500">
              Selecione ou crie um workspace para visualizar e gerenciar arquivos.
            </p>
          </div>
        ) : carregando && arvoreOrdenada.length === 0 ? (
          <div className="p-4 text-center text-xs text-zinc-500 animate-pulse">
            Indexando arquivos de {wsEfetivo}...
          </div>
        ) : erroCarregamento && arvoreOrdenada.length === 0 ? (
          <div className="p-4 text-center text-xs space-y-2">
            <div className="text-rose-400 flex items-center justify-center gap-1.5">
              <AlertTriangle size={14} />
              <span>Falha ao ler arquivos</span>
            </div>
            <p className="text-[11px] text-zinc-400">{erroCarregamento}</p>
            <button
              type="button"
              onClick={() => void carregarArvore()}
              className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 text-zinc-200 text-xs transition-colors cursor-pointer"
            >
              Tentar novamente
            </button>
          </div>
        ) : arvoreOrdenada.length === 0 ? (
          <div className="p-4 text-center text-xs text-zinc-500">
            Nenhum arquivo no workspace. Clique com botão direito para criar um novo arquivo.
          </div>
        ) : (
          arvoreOrdenada.map((no) => renderizarNo(no, 0))
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          MENU DE CONTEXTO SUSPENSO (CLIQUE DIREITO)
         ───────────────────────────────────────────────────────────── */}
      {menuContexto.visivel && (
        <div
          style={{
            position: "fixed",
            left: `${menuContexto.x}px`,
            top: `${menuContexto.y}px`,
          }}
          className="w-52 rounded-xl bg-zinc-900 border border-zinc-700/80 shadow-2xl p-1.5 z-50 text-xs font-medium space-y-0.5 animate-in fade-in zoom-in-95 duration-100 select-none"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Novo Arquivo */}
          <button
            type="button"
            onClick={() => abrirModalNovoArquivo(menuContexto.no)}
            className="w-full px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-200 flex items-center gap-2 text-left cursor-pointer transition-colors"
          >
            <FilePlus size={14} className="text-emerald-400" />
            <span>Novo Arquivo</span>
          </button>

          {/* Nova Pasta */}
          <button
            type="button"
            onClick={() => abrirModalNovaPasta(menuContexto.no)}
            className="w-full px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-200 flex items-center gap-2 text-left cursor-pointer transition-colors"
          >
            <FolderPlus size={14} className="text-amber-400" />
            <span>Nova Pasta</span>
          </button>

          {/* Ações para nó específico selecionado */}
          {menuContexto.no && (
            <>
              <div className="my-1 border-t border-zinc-800" />

              {/* Renomear */}
              <button
                type="button"
                onClick={() => abrirModalRenomear(menuContexto.no!)}
                className="w-full px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-200 flex items-center gap-2 text-left cursor-pointer transition-colors"
              >
                <Edit3 size={14} className="text-blue-400" />
                <span>Renomear</span>
              </button>

              {/* Copiar Caminho */}
              <button
                type="button"
                onClick={() => void copiarCaminho(menuContexto.no!.caminho)}
                className="w-full px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-200 flex items-center gap-2 text-left cursor-pointer transition-colors"
              >
                <Copy size={14} className="text-zinc-400" />
                <span>Copiar Caminho</span>
              </button>

              {/* Descartar Alterações Git (Apenas Arquivos) */}
              {menuContexto.no.tipo === "arquivo" && (
                <button
                  type="button"
                  onClick={() => void descartarAlteracoesArquivo(menuContexto.no!)}
                  className="w-full px-2.5 py-1.5 rounded-lg hover:bg-amber-950/40 text-amber-400 hover:text-amber-300 flex items-center gap-2 text-left cursor-pointer transition-colors"
                >
                  <RotateCcw size={14} />
                  <span>Descartar Alterações (Git)</span>
                </button>
              )}

              <div className="my-1 border-t border-zinc-800" />

              {/* Excluir */}
              <button
                type="button"
                onClick={() => abrirModalExcluir(menuContexto.no!)}
                className="w-full px-2.5 py-1.5 rounded-lg hover:bg-rose-950/50 text-rose-400 hover:text-rose-300 flex items-center gap-2 text-left cursor-pointer transition-colors"
              >
                <Trash2 size={14} />
                <span>Excluir</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL DE OPERAÇÕES DE ARQUIVO (Criar, Renomear, Excluir)
         ───────────────────────────────────────────────────────────── */}
      {modalArquivo.aberto && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 select-none animate-in fade-in duration-100"
          onClick={() => {
            if (!modalArquivo.processando) {
              setModalArquivo((prev) => ({ ...prev, aberto: false }));
            }
          }}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header do Modal */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 font-bold text-zinc-100 text-sm">
                {modalArquivo.tipo === "novo_arquivo" && (
                  <>
                    <FilePlus size={16} className="text-emerald-400" />
                    <span>Novo Arquivo</span>
                  </>
                )}
                {modalArquivo.tipo === "nova_pasta" && (
                  <>
                    <FolderPlus size={16} className="text-amber-400" />
                    <span>Nova Pasta</span>
                  </>
                )}
                {modalArquivo.tipo === "renomear" && (
                  <>
                    <Edit3 size={16} className="text-blue-400" />
                    <span>Renomear Item</span>
                  </>
                )}
                {modalArquivo.tipo === "excluir" && (
                  <>
                    <Trash2 size={16} className="text-rose-400" />
                    <span>Confirmar Exclusão</span>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => setModalArquivo((prev) => ({ ...prev, aberto: false }))}
                disabled={modalArquivo.processando}
                className="p-1 rounded text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Mensagem de Erro Inline se houver */}
            {modalArquivo.erro && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 flex items-center gap-2">
                <AlertTriangle size={15} className="shrink-0 text-rose-400" />
                <span>{modalArquivo.erro}</span>
              </div>
            )}

            {/* Conteúdo do Modal Conforme a Operação */}
            {modalArquivo.tipo === "excluir" ? (
              <div className="space-y-3 text-xs text-zinc-300">
                <div className="p-3.5 rounded-xl bg-rose-950/30 border border-rose-900/60 flex items-start gap-2.5">
                  <AlertTriangle size={18} className="text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-rose-200">
                      Deseja realmente excluir "{modalArquivo.alvo?.nome}"?
                    </p>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      Caminho:{" "}
                      <span className="font-mono text-zinc-300">
                        {modalArquivo.alvo?.caminho}
                      </span>
                    </p>
                    <p className="text-[10px] text-zinc-500 mt-1.5 leading-relaxed">
                      Esta ação removerá o arquivo ou pasta permanentemente do workspace
                      em disco. Não poderá ser desfeita exceto via Git.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                {modalArquivo.pastaBase && (
                  <div className="text-[11px] text-zinc-500 font-mono">
                    Local: <span className="text-zinc-300">{modalArquivo.pastaBase}/</span>
                  </div>
                )}

                <div>
                  <label className="block text-zinc-400 mb-1.5 font-medium">
                    {modalArquivo.tipo === "novo_arquivo" && "Nome do arquivo com extensão:"}
                    {modalArquivo.tipo === "nova_pasta" && "Nome da nova pasta:"}
                    {modalArquivo.tipo === "renomear" && "Novo nome:"}
                  </label>
                  <input
                    ref={modalInputRef}
                    type="text"
                    placeholder={
                      modalArquivo.tipo === "novo_arquivo"
                        ? "ex: script.js, notas.md, config.json"
                        : modalArquivo.tipo === "nova_pasta"
                        ? "ex: src, docs, utils"
                        : "ex: novo_nome.ts"
                    }
                    value={modalArquivo.valor}
                    onChange={(e) =>
                      setModalArquivo((prev) => ({
                        ...prev,
                        valor: e.target.value,
                        erro: null,
                      }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !modalArquivo.processando) {
                        e.preventDefault();
                        void confirmarAcaoModal();
                      }
                    }}
                    disabled={modalArquivo.processando}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-600 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none font-mono text-xs shadow-inner"
                  />
                </div>
              </div>
            )}

            {/* Ações do Modal */}
            <div className="pt-3 border-t border-zinc-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalArquivo((prev) => ({ ...prev, aberto: false }))}
                disabled={modalArquivo.processando}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmarAcaoModal()}
                disabled={modalArquivo.processando}
                className={`px-3.5 py-1.5 rounded-lg text-white text-xs font-semibold shadow-md transition-all cursor-pointer flex items-center gap-1.5 ${
                  modalArquivo.tipo === "excluir"
                    ? "bg-rose-600 hover:bg-rose-500"
                    : "bg-emerald-600 hover:bg-emerald-500"
                }`}
              >
                {modalArquivo.processando ? (
                  <>
                    <RefreshCw size={12} className="animate-spin" />
                    <span>Processando...</span>
                  </>
                ) : modalArquivo.tipo === "excluir" ? (
                  "Excluir Definitivamente"
                ) : (
                  "Confirmar"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
