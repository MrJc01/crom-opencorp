import { type Component, createSignal, onMount, For, Show } from "solid-js";
import { FolderPlus, Folder, Upload, FileArchive, X, FileUp } from "lucide-solid";
import { Modal } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { showToast } from "../ui/Toast";
import { fetchApi, setWorkspaces, setWsAtivo, type WorkspaceInfo } from "../lib/context";

export interface NovoWorkspaceModalProps {
  open: boolean;
  onClose: () => void;
}

export const NovoWorkspaceModal: Component<NovoWorkspaceModalProps> = (props) => {
  const [modo, setModo] = createSignal<"padrao" | "corp">("padrao");

  // Modo Padrão
  const [id, setId] = createSignal("");
  const [path, setPath] = createSignal("");
  const [template, setTemplate] = createSignal("default");
  const [templatesDisponiveis, setTemplatesDisponiveis] = createSignal<any[]>([]);

  // Modo .corp
  const [arquivoCorp, setArquivoCorp] = createSignal<File | null>(null);
  const [corpBase64, setCorpBase64] = createSignal<string>("");
  const [corpId, setCorpId] = createSignal("");
  const [corpPath, setCorpPath] = createSignal("");
  const [arrastando, setArrastando] = createSignal(false);

  const [salvando, setSalvando] = createSignal(false);

  onMount(async () => {
    try {
      const lista = await fetchApi<any[]>("/templates");
      if (Array.isArray(lista)) setTemplatesDisponiveis(lista);
    } catch {}
  });

  const lidarComArquivo = (arquivo: File) => {
    if (!arquivo.name.endsWith(".corp") && !arquivo.name.endsWith(".tar.gz")) {
      showToast("Selecione um arquivo de pacote .corp válido", "aviso");
      return;
    }
    setArquivoCorp(arquivo);
    const sugerido = arquivo.name
      .replace(/\.(corp|tar\.gz)$/i, "")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-");
    if (!corpId()) setCorpId(sugerido);

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

  const criarPadrao = async (e: Event) => {
    e.preventDefault();
    const wsId = id().trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
    if (!wsId) {
      showToast("Informe um identificador para o workspace", "erro");
      return;
    }

    setSalvando(true);
    try {
      const res = await fetchApi<{ id: string; caminho: string }>("/workspaces", {
        method: "POST",
        body: JSON.stringify({
          id: wsId,
          path: path().trim() || undefined,
          template: template() || "default",
        }),
      });

      showToast(`Workspace "${res.id}" criado com sucesso!`, "sucesso");

      const lista = await fetchApi<WorkspaceInfo[]>("/workspaces");
      setWorkspaces(lista);
      setWsAtivo(res.id);

      setId("");
      setPath("");
      props.onClose();
    } catch (err: any) {
      showToast("Erro ao criar workspace: " + (err.message || err), "erro");
    } finally {
      setSalvando(false);
    }
  };

  const importarCorp = async (e: Event) => {
    e.preventDefault();
    if (!arquivoCorp() || !corpBase64()) {
      showToast("Selecione um arquivo .corp para importar", "aviso");
      return;
    }
    const wsId = corpId().trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");

    setSalvando(true);
    try {
      const res = await fetchApi<{ ok: boolean; id: string; caminho: string }>("/workspaces/import-corp", {
        method: "POST",
        body: JSON.stringify({
          id: wsId || undefined,
          nome_arquivo: arquivoCorp()!.name,
          arquivo_base64: corpBase64(),
          path: corpPath().trim() || undefined,
        }),
      });

      showToast(`Pacote "${arquivoCorp()!.name}" importado! Workspace "${res.id}" ativo.`, "sucesso");

      const lista = await fetchApi<WorkspaceInfo[]>("/workspaces");
      setWorkspaces(lista);
      setWsAtivo(res.id);

      limparArquivoCorp();
      setCorpId("");
      setCorpPath("");
      props.onClose();
    } catch (err: any) {
      showToast("Erro ao importar pacote .corp: " + (err.message || err), "erro");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      open={props.open}
      onOpenChange={(v) => { if (!v) props.onClose(); }}
      title={
        <div class="flex items-center gap-2">
          <FolderPlus size={16} class="text-emerald-400" />
          <span>Criar ou Conectar Workspace</span>
        </div>
      }
      description="Crie uma nova empresa autônoma, conecte a uma pasta local ou importe um pacote .corp."
      maxWidth="md"
    >
      {/* SELETOR DE MODO: NOVO EM BRANCO VS IMPORTAR .CORP */}
      <div class="flex items-center bg-zinc-950 p-1 rounded-xl border border-zinc-800 mb-4">
        <button
          type="button"
          class={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            modo() === "padrao"
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
          class={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            modo() === "corp"
              ? "bg-purple-600 text-white shadow-xs"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
          onClick={() => setModo("corp")}
        >
          <FileArchive size={13} />
          <span>Importar Pacote .corp</span>
        </button>
      </div>

      {/* ABA 1: MODO PADRÃO */}
      <Show when={modo() === "padrao"}>
        <form onSubmit={criarPadrao} class="space-y-4 pt-1">
          <div>
            <label class="block text-xs font-semibold text-zinc-300 mb-1">
              Nome / Identificador do Workspace *
            </label>
            <input
              type="text"
              required
              placeholder="ex: meu-projeto, portal-vendas, assistente-docs"
              value={id()}
              onInput={(e) => setId(e.currentTarget.value)}
              class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/60"
            />
            <span class="text-[10px] text-zinc-500 mt-0.5 block">
              Apenas letras minúsculas, números e hífens (kebab-case).
            </span>
          </div>

          <div>
            <label class="block text-xs font-semibold text-zinc-300 mb-1 flex items-center justify-between">
              <span>Pasta no Computador (Opcional)</span>
              <span class="text-[10px] text-zinc-500 font-normal">estilo OpenCode</span>
            </label>
            <div class="relative">
              <Folder size={13} class="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="ex: /home/j/Projetos/meu-app ou deixe vazio para padrão"
                value={path()}
                onInput={(e) => setPath(e.currentTarget.value)}
                class="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/60"
              />
            </div>
            <span class="text-[10px] text-zinc-500 mt-0.5 block">
              Se deixado em branco, será criado automaticamente em <code class="text-zinc-400">~/.opencorp/workspaces/&lt;nome&gt;</code>.
            </span>
          </div>

          <div>
            <label class="block text-xs font-semibold text-zinc-300 mb-1">
              Template Base
            </label>
            <select
              value={template()}
              onChange={(e) => setTemplate(e.currentTarget.value)}
              class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500/60 cursor-pointer"
            >
              <option value="default">Padrão (Empresa Completa com Agentes, Registros e Workflows)</option>
              <For each={templatesDisponiveis().filter((t) => t.id !== "default")}>
                {(t) => (
                  <option value={t.id}>
                    {t.id} {t.descricao ? `— ${t.descricao}` : ""}
                  </option>
                )}
              </For>
            </select>
          </div>

          <div class="pt-3 border-t border-zinc-800/80 flex items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={props.onClose}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              variant="primary"
              class="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
              loading={salvando()}
            >
              <FolderPlus size={13} class="mr-1.5" />
              {salvando() ? "Criando..." : "Criar Workspace"}
            </Button>
          </div>
        </form>
      </Show>

      {/* ABA 2: IMPORTAR .CORP */}
      <Show when={modo() === "corp"}>
        <form onSubmit={importarCorp} class="space-y-4 pt-1">
          {/* DROPZONE DE ARQUIVO .CORP */}
          <Show
            when={arquivoCorp()}
            fallback={
              <div
                class={`p-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
                  arrastando()
                    ? "border-purple-500 bg-purple-950/30"
                    : "border-zinc-800 bg-zinc-950/60 hover:border-purple-500/50 hover:bg-purple-950/10"
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setArrastando(true);
                }}
                onDragLeave={() => setArrastando(false)}
                onDrop={(e) => {
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
                <div class="h-12 w-12 rounded-2xl bg-purple-950/80 border border-purple-800/60 flex items-center justify-center text-purple-400">
                  <FileUp size={22} />
                </div>
                <div class="text-center">
                  <span class="text-xs font-semibold text-zinc-200 block">
                    Arraste e solte o arquivo <code class="text-purple-400">.corp</code> aqui
                  </span>
                  <span class="text-[11px] text-zinc-500">ou clique para navegar no seu computador</span>
                </div>
                <span class="text-[10px] text-zinc-600 font-mono">
                  Aceita pacotes de template .corp (tar.gz)
                </span>
              </div>
            }
          >
            {/* CARD DE ARQUIVO SELECIONADO */}
            <div class="p-3.5 rounded-xl bg-purple-950/30 border border-purple-800/60 flex items-center justify-between">
              <div class="flex items-center gap-3 min-w-0">
                <div class="h-9 w-9 rounded-lg bg-purple-950 border border-purple-700/80 flex items-center justify-center text-purple-400 flex-shrink-0">
                  <FileArchive size={18} />
                </div>
                <div class="min-w-0">
                  <span class="text-xs font-bold text-zinc-100 truncate block">
                    {arquivoCorp()!.name}
                  </span>
                  <span class="text-[10px] font-mono text-purple-300">
                    {(arquivoCorp()!.size / 1024).toFixed(1)} KB · Pronto para importar
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={limparArquivoCorp}
                class="p-1 rounded-lg text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
                title="Trocar arquivo"
              >
                <X size={14} />
              </button>
            </div>
          </Show>

          <div>
            <label class="block text-xs font-semibold text-zinc-300 mb-1">
              Identificador do Novo Workspace (Opcional)
            </label>
            <input
              type="text"
              placeholder="Sugerido automaticamente a partir do pacote"
              value={corpId()}
              onInput={(e) => setCorpId(e.currentTarget.value)}
              class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-purple-500/60"
            />
            <span class="text-[10px] text-zinc-500 mt-0.5 block">
              Deixe vazio para usar o nome contido no pacote .corp.
            </span>
          </div>

          <div>
            <label class="block text-xs font-semibold text-zinc-300 mb-1 flex items-center justify-between">
              <span>Pasta no Computador (Opcional)</span>
            </label>
            <div class="relative">
              <Folder size={13} class="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="ex: /home/j/Projetos/meu-app ou deixe vazio para padrão"
                value={corpPath()}
                onInput={(e) => setCorpPath(e.currentTarget.value)}
                class="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-purple-500/60"
              />
            </div>
          </div>

          <div class="pt-3 border-t border-zinc-800/80 flex items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={props.onClose}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              variant="primary"
              class="bg-purple-600 hover:bg-purple-500 text-white font-semibold"
              disabled={!arquivoCorp()}
              loading={salvando()}
            >
              <Upload size={13} class="mr-1.5" />
              {salvando() ? "Importando Pacote..." : "Importar .corp e Criar"}
            </Button>
          </div>
        </form>
      </Show>
    </Modal>
  );
};
