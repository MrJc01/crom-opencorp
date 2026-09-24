import React, { useState, type FC, type FormEvent, type DragEvent } from "react";
import { FolderPlus, Folder, Upload, FileArchive, X, FileUp, Video, Newspaper, Zap, Target, Sparkles } from "lucide-react";
import { useOpenCorp } from "../../../providers/OpenCorpProvider.js";
import { showToast } from "../../../shared/ui/Toast.js";

export interface NovoWorkspaceModalProps {
  aberto: boolean;
  aoFechar: () => void;
  aoWorkspaceCriado?: (id: string) => void;
}

export const NovoWorkspaceModal: FC<NovoWorkspaceModalProps> = ({
  aberto,
  aoFechar,
  aoWorkspaceCriado,
}) => {
  const { client, definirWorkspaceId, tratarErro } = useOpenCorp();
  const [modo, setModo] = useState<"padrao" | "corp">("padrao");

  // Modo Padrão
  const [id, setId] = useState("");
  const [caminho, setCaminho] = useState("");
  const [template, setTemplate] = useState("default");

  // Modo .corp
  const [arquivoCorp, setArquivoCorp] = useState<File | null>(null);
  const [corpBase64, setCorpBase64] = useState<string>("");
  const [corpId, setCorpId] = useState("");
  const [corpPath, setCorpPath] = useState("");
  const [arrastando, setArrastando] = useState(false);

  const [salvando, setSalvando] = useState(false);

  if (!aberto) return null;

  const lidarComArquivo = (arquivo: File) => {
    if (!arquivo.name.endsWith(".corp") && !arquivo.name.endsWith(".tar.gz")) {
      showToast("Selecione um arquivo de pacote .corp válido (.corp ou .tar.gz)", "aviso");
      return;
    }
    setArquivoCorp(arquivo);
    const sugerido = arquivo.name
      .replace(/\.(corp|tar\.gz)$/i, "")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-");
    if (!corpId) setCorpId(sugerido);

    const reader = new FileReader();
    reader.onload = (e) => {
      setCorpBase64(e.target?.result as string);
    };
    reader.readAsDataURL(arquivo);
  };

  const limparArquivoCorp = () => {
    setArquivoCorp(null);
    setCorpBase64("");
  };

  const criarPadrao = async (e: FormEvent) => {
    e.preventDefault();
    const wsId = id.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
    if (!wsId) {
      showToast("Informe um identificador para o workspace", "aviso");
      return;
    }

    setSalvando(true);
    try {
      const res = await client.workspaces.criar({
        id: wsId,
        path: caminho.trim() || undefined,
        template: template || "default",
      });

      showToast(`Workspace "${res.id}" criado com sucesso!`, "sucesso");
      definirWorkspaceId(res.id);
      aoWorkspaceCriado?.(res.id);

      setId("");
      setCaminho("");
      aoFechar();
    } catch (err: unknown) {
      tratarErro(err, "Erro ao criar workspace");
    } finally {
      setSalvando(false);
    }
  };

  const importarCorp = async (e: FormEvent) => {
    e.preventDefault();
    if (!arquivoCorp || !corpBase64) {
      showToast("Selecione um arquivo .corp para importar", "aviso");
      return;
    }
    const wsId = corpId.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");

    setSalvando(true);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:4100";
      const resp = await fetch(`${origin}/workspaces/import-corp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: wsId || undefined,
          nome_arquivo: arquivoCorp.name,
          arquivo_base64: corpBase64,
          path: corpPath.trim() || undefined,
        }),
      });

      if (!resp.ok) {
        throw new Error(`Falha na importação (HTTP ${resp.status})`);
      }

      const res = (await resp.json()) as { ok: boolean; id: string; caminho: string };
      showToast(`Pacote "${arquivoCorp.name}" importado! Workspace "${res.id}" ativo.`, "sucesso");

      definirWorkspaceId(res.id);
      aoWorkspaceCriado?.(res.id);

      limparArquivoCorp();
      setCorpId("");
      setCorpPath("");
      aoFechar();
    } catch (err: unknown) {
      tratarErro(err, "Erro ao importar pacote .corp");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200 select-none">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4">
        {/* Header do Modal */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-950/80 border border-emerald-800/60 text-emerald-400">
              <FolderPlus size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-100">Criar ou Conectar Workspace</h2>
              <p className="text-[11px] text-zinc-400">
                Crie uma nova empresa autônoma, pasta local ou importe um pacote .corp.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Seletor de Modo: Padrão vs Importar .corp */}
        <div className="flex items-center bg-zinc-950 p-1 rounded-xl border border-zinc-800">
          <button
            type="button"
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              modo === "padrao"
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
            onClick={() => setModo("padrao")}
          >
            <FolderPlus size={13} />
            <span>Novo Workspace / Pasta</span>
          </button>
          <button
            type="button"
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              modo === "corp"
                ? "bg-purple-600 text-white shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
            onClick={() => setModo("corp")}
          >
            <FileArchive size={13} />
            <span>Importar Pacote .corp</span>
          </button>
        </div>

        {/* Formulário Modo Padrão */}
        {modo === "padrao" ? (
          <form onSubmit={criarPadrao} className="space-y-4 pt-1">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Nome / Identificador do Workspace *
              </label>
              <input
                type="text"
                required
                placeholder="ex: meu-projeto, portal-vendas, assistente-docs"
                value={id}
                onChange={(e) => setId(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/60"
              />
              <span className="text-[10px] text-zinc-500 mt-0.5 block">
                Apenas letras minúsculas, números e hífens (kebab-case).
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1 flex items-center justify-between">
                <span>Pasta no Computador (Opcional)</span>
                <span className="text-[10px] text-zinc-500 font-normal">estilo OpenCode</span>
              </label>
              <div className="relative">
                <Folder size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder="ex: /home/j/Projetos/meu-app ou deixe vazio para padrão"
                  value={caminho}
                  onChange={(e) => setCaminho(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/60"
                />
              </div>
              <span className="text-[10px] text-zinc-500 mt-0.5 block">
                Se deixado em branco, será criado automaticamente em <code className="text-zinc-400">~/.opencorp/workspaces/&lt;nome&gt;</code>.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-2">
                Escolha a Base Inicial do Workspace
              </label>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setTemplate("youtube-video-factory")}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    template === "youtube-video-factory"
                      ? "bg-red-950/40 border-red-500/60 ring-1 ring-red-500/40"
                      : "bg-zinc-950 border-zinc-800/80 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="p-1.5 rounded-lg bg-red-900/40 text-red-400">
                      <Video size={14} />
                    </div>
                    <span className="text-xs font-semibold text-zinc-100">YouTube Factory</span>
                  </div>
                  <p className="text-[10px] text-zinc-400 line-clamp-2 leading-relaxed">
                    Vídeos curtos, roteiros com retenção de 3s, voz local e player.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setTemplate("portal-conteudo")}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    template === "portal-conteudo"
                      ? "bg-sky-950/40 border-sky-500/60 ring-1 ring-sky-500/40"
                      : "bg-zinc-950 border-zinc-800/80 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="p-1.5 rounded-lg bg-sky-900/40 text-sky-400">
                      <Newspaper size={14} />
                    </div>
                    <span className="text-xs font-semibold text-zinc-100">Portal Conteúdo</span>
                  </div>
                  <p className="text-[10px] text-zinc-400 line-clamp-2 leading-relaxed">
                    Artigos técnicos, SEO, fact-checking e Analytics SQLite local.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setTemplate("micro-saas")}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    template === "micro-saas"
                      ? "bg-emerald-950/40 border-emerald-500/60 ring-1 ring-emerald-500/40"
                      : "bg-zinc-950 border-zinc-800/80 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="p-1.5 rounded-lg bg-emerald-900/40 text-emerald-400">
                      <Zap size={14} />
                    </div>
                    <span className="text-xs font-semibold text-zinc-100">Micro-SaaS Uptime</span>
                  </div>
                  <p className="text-[10px] text-zinc-400 line-clamp-2 leading-relaxed">
                    Monitoramento contínuo, telemetria SQLite WAL e status page.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setTemplate("automacao-radar")}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    template === "automacao-radar"
                      ? "bg-amber-950/40 border-amber-500/60 ring-1 ring-amber-500/40"
                      : "bg-zinc-950 border-zinc-800/80 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="p-1.5 rounded-lg bg-amber-900/40 text-amber-400">
                      <Target size={14} />
                    </div>
                    <span className="text-xs font-semibold text-zinc-100">Radar Oportunidades</span>
                  </div>
                  <p className="text-[10px] text-zinc-400 line-clamp-2 leading-relaxed">
                    Scraping de oportunidades, leads B2B e scoring 0 a 100.
                  </p>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setTemplate("default")}
                className={`w-full py-1.5 px-3 rounded-lg border text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  template === "default"
                    ? "bg-zinc-800 border-zinc-600 text-zinc-100 font-medium"
                    : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Sparkles size={12} className="text-emerald-400" />
                <span>Em Branco / Base Padrão Minimalista</span>
              </button>
            </div>

            <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={aoFechar}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-emerald-950/60 transition-colors cursor-pointer"
              >
                <FolderPlus size={13} />
                <span>{salvando ? "Criando..." : "Criar Workspace"}</span>
              </button>
            </div>
          </form>
        ) : (
          /* Formulário Modo Importar .corp */
          <form onSubmit={importarCorp} className="space-y-4 pt-1">
            {!arquivoCorp ? (
              <div
                className={`p-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
                  arrastando
                    ? "border-purple-500 bg-purple-950/30"
                    : "border-zinc-800 bg-zinc-950/60 hover:border-purple-500/50 hover:bg-purple-950/10"
                }`}
                onDragOver={(e: DragEvent<HTMLDivElement>) => {
                  e.preventDefault();
                  setArrastando(true);
                }}
                onDragLeave={() => setArrastando(false)}
                onDrop={(e: DragEvent<HTMLDivElement>) => {
                  e.preventDefault();
                  setArrastando(false);
                  const f = e.dataTransfer?.files?.[0];
                  if (f) lidarComArquivo(f);
                }}
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = ".corp,.tar.gz";
                  input.onchange = (e) => {
                    const f = (e.target as HTMLInputElement).files?.[0];
                    if (f) lidarComArquivo(f);
                  };
                  input.click();
                }}
              >
                <div className="h-12 w-12 rounded-2xl bg-purple-950/80 border border-purple-800/60 flex items-center justify-center text-purple-400">
                  <FileUp size={22} />
                </div>
                <div className="text-center">
                  <span className="text-xs font-semibold text-zinc-200 block">
                    Arraste e solte o arquivo <code className="text-purple-400">.corp</code> aqui
                  </span>
                  <span className="text-[11px] text-zinc-500">ou clique para navegar no seu computador</span>
                </div>
                <span className="text-[10px] text-zinc-600 font-mono">
                  Aceita pacotes de template .corp (tar.gz)
                </span>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-800/60 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-lg bg-purple-950 border border-purple-700/80 flex items-center justify-center text-purple-400 shrink-0">
                    <FileArchive size={18} />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-zinc-100 truncate block">
                      {arquivoCorp.name}
                    </span>
                    <span className="text-[10px] font-mono text-purple-300">
                      {(arquivoCorp.size / 1024).toFixed(1)} KB · Pronto para importar
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={limparArquivoCorp}
                  className="p-1 rounded-lg text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
                  title="Trocar arquivo"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Identificador do Novo Workspace (Opcional)
              </label>
              <input
                type="text"
                placeholder="Sugerido automaticamente a partir do pacote"
                value={corpId}
                onChange={(e) => setCorpId(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-purple-500/60"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Pasta no Computador (Opcional)
              </label>
              <div className="relative">
                <Folder size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder="ex: /home/j/Projetos/meu-app ou deixe vazio para padrão"
                  value={corpPath}
                  onChange={(e) => setCorpPath(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-purple-500/60"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={aoFechar}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando || !arquivoCorp}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-purple-950/60 transition-colors cursor-pointer"
              >
                <Upload size={13} />
                <span>{salvando ? "Importando..." : "Importar .corp e Criar"}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
