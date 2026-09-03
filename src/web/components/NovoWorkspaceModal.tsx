import { type Component, createSignal } from "solid-js";
import { FolderPlus, Folder } from "lucide-solid";
import { Modal } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { showToast } from "../ui/Toast";
import { fetchApi, setWorkspaces, setWsAtivo, type WorkspaceInfo } from "../lib/context";

export interface NovoWorkspaceModalProps {
  open: boolean;
  onClose: () => void;
}

export const NovoWorkspaceModal: Component<NovoWorkspaceModalProps> = (props) => {
  const [id, setId] = createSignal("");
  const [path, setPath] = createSignal("");
  const [template, setTemplate] = createSignal("default");
  const [salvando, setSalvando] = createSignal(false);

  const criar = async (e: Event) => {
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

      // Atualiza lista de workspaces
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
      description="Crie uma nova empresa autônoma ou aponte para qualquer pasta de código do seu computador."
      maxWidth="md"
    >
      <form onSubmit={criar} class="space-y-4 pt-1">
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
            class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500/60"
          >
            <option value="default">Padrão (Empresa Completa com Agentes, Registros e Workflows)</option>
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
    </Modal>
  );
};
