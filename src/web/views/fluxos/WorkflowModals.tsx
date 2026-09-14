import {
  type Component,
  createSignal,
  Show,
  type Accessor,
} from "solid-js";
import { Plus, Play, X, Send } from "lucide-solid";
import { Button } from "../../ui/Button";
import { IconButton } from "../../ui/IconButton";
import { type FluxoCompleto } from "./types";

export interface ModalNovoWorkflowProps {
  aberto: Accessor<boolean>;
  onClose: () => void;
  onCriarFluxo: (dados: {
    id: string;
    nome: string;
    descricao: string;
    template: "pipeline" | "fanout" | "review" | "debate";
  }) => Promise<void>;
  salvando: Accessor<boolean>;
}

export const ModalNovoWorkflow: Component<ModalNovoWorkflowProps> = (props) => {
  const [nome, setNome] = createSignal("");
  const [id, setId] = createSignal("");
  const [descricao, setDescricao] = createSignal("");
  const [template, setTemplate] = createSignal<"pipeline" | "fanout" | "review" | "debate">("pipeline");

  const fechar = () => {
    setNome("");
    setId("");
    setDescricao("");
    setTemplate("pipeline");
    props.onClose();
  };

  const submit = async () => {
    const finalId = id().trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const finalNome = nome().trim();
    if (!finalId || !finalNome) return;

    await props.onCriarFluxo({
      id: finalId,
      nome: finalNome,
      descricao: descricao().trim(),
      template: template(),
    });
    fechar();
  };

  return (
    <Show when={props.aberto()}>
      <div class="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50" onClick={fechar}>
        <div class="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div class="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div class="flex items-center gap-2">
              <Plus size={16} class="text-orange-400" />
              <h3 class="text-sm font-bold text-zinc-100">Criar Novo Fluxo</h3>
            </div>
            <IconButton size="xs" variant="ghost" onClick={fechar}>
              <X size={16} />
            </IconButton>
          </div>

          <div class="space-y-3 text-xs">
            <div>
              <label class="block text-zinc-300 font-medium mb-1">Nome do Fluxo *</label>
              <input
                type="text"
                placeholder="ex: Publicação Editorial de Conteúdo"
                value={nome()}
                onInput={(e) => {
                  setNome(e.currentTarget.value);
                  if (!id()) {
                    setId(
                      e.currentTarget.value
                        .toLowerCase()
                        .normalize("NFD")
                        .replace(/[\u0300-\u036f]/g, "")
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/^-+|-+$/g, "")
                    );
                  }
                }}
                class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200 focus:outline-none focus:border-orange-500"
              />
            </div>

            <div>
              <label class="block text-zinc-300 font-medium mb-1">ID (kebab-case) *</label>
              <input
                type="text"
                placeholder="ex: publicacao-editorial"
                value={id()}
                onInput={(e) => setId(e.currentTarget.value)}
                class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200 font-mono focus:outline-none focus:border-orange-500"
              />
            </div>

            <div>
              <label class="block text-zinc-300 font-medium mb-1">Template Inicial</label>
              <select
                value={template()}
                onChange={(e) => setTemplate(e.currentTarget.value as any)}
                class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200 focus:outline-none focus:border-orange-500"
              >
                <option value="pipeline">Pipeline Sequencial (Gatilho → Agente → Registro)</option>
                <option value="fanout">Fanout Paralelo (Múltiplos agentes → Síntese)</option>
                <option value="review">Review de Qualidade (Executor → Revisor)</option>
                <option value="debate">Debate de Diretoria (Proponentes → Moderador)</option>
              </select>
            </div>

            <div>
              <label class="block text-zinc-300 font-medium mb-1">Descrição (Opcional)</label>
              <textarea
                rows={2}
                placeholder="Objetivo deste fluxo..."
                value={descricao()}
                onInput={(e) => setDescricao(e.currentTarget.value)}
                class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200 focus:outline-none focus:border-orange-500 resize-none"
              />
            </div>
          </div>

          <div class="pt-3 border-t border-zinc-800 flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={fechar}>
              Cancelar
            </Button>
            <Button
              size="sm"
              variant="primary"
              class="bg-orange-600 hover:bg-orange-500 text-white font-bold"
              loading={props.salvando()}
              onClick={submit}
            >
              Criar Fluxo
            </Button>
          </div>
        </div>
      </div>
    </Show>
  );
};

export interface ModalExecutarWorkflowProps {
  aberto: Accessor<boolean>;
  fluxo: Accessor<FluxoCompleto | null>;
  executando: Accessor<boolean>;
  onClose: () => void;
  onExecutar: (entrada: string) => Promise<void>;
}

export const ModalExecutarWorkflow: Component<ModalExecutarWorkflowProps> = (props) => {
  const [entrada, setEntrada] = createSignal("");

  const fechar = () => {
    setEntrada("");
    props.onClose();
  };

  const submit = async () => {
    await props.onExecutar(entrada());
    fechar();
  };

  return (
    <Show when={props.aberto()}>
      <div class="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50" onClick={fechar}>
        <div class="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div class="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div class="flex items-center gap-2">
              <Play size={16} class="text-orange-400 fill-current" />
              <h3 class="text-sm font-bold text-zinc-100">
                Executar Fluxo: {props.fluxo()?.nome || props.fluxo()?.id}
              </h3>
            </div>
            <IconButton size="xs" variant="ghost" onClick={fechar}>
              <X size={16} />
            </IconButton>
          </div>

          <div class="space-y-3 text-xs">
            <label class="block text-zinc-300 font-medium">
              Entrada Inicial / Payload para o primeiro Node
            </label>
            <textarea
              rows={4}
              placeholder="Insira parâmetros ou dados para alimentar o pipeline..."
              value={entrada()}
              onInput={(e) => setEntrada(e.currentTarget.value)}
              class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-200 focus:outline-none focus:border-orange-500 font-mono resize-none"
            />
          </div>

          <div class="pt-3 border-t border-zinc-800 flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={fechar}>
              Cancelar
            </Button>
            <Button
              size="sm"
              variant="primary"
              class="bg-orange-600 hover:bg-orange-500 text-white font-bold"
              loading={props.executando()}
              onClick={submit}
            >
              <Send size={12} class="mr-1.5" /> Iniciar Execução
            </Button>
          </div>
        </div>
      </div>
    </Show>
  );
};
