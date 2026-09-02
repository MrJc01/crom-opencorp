import { type Component, createSignal, onMount, For, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import {
  Webhook,
  Plus,
  Trash2,
  Copy,
  RefreshCw,
  X,
  Play,
  CheckCircle2,
  Terminal,
  Layers,
  Bot,
  Send,
} from "lucide-solid";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { showToast } from "../ui/Toast";
import { fetchApi, wsAtivo } from "../lib/context";

export const HooksView: Component = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [hooks, setHooks] = createSignal<any[]>([]);
  const [agentes, setAgentes] = createSignal<any[]>([]);
  const [fluxos, setFluxos] = createSignal<any[]>([]);
  const [modalNovo, setModalNovo] = createSignal(false);
  const [salvando, setSalvando] = createSignal(false);

  // Form State
  const [nomeHook, setNomeHook] = createSignal("");
  const [alvoTipo, setAlvoTipo] = createSignal<"task_create" | "agent_run" | "flow_run" | "webhook_out">("agent_run");
  const [modoResposta, setModoResposta] = createSignal<"imediato" | "final">("imediato");
  const [dedupSegundos, setDedupSegundos] = createSignal(60);

  // Campos específicos
  const [agenteSel, setAgenteSel] = createSignal("");
  const [ordemTemplate, setOrdemTemplate] = createSignal("Executar ordem recebida via webhook: {{payload}}");
  const [taskTitulo, setTaskTitulo] = createSignal("Nova task via Webhook");
  const [taskColuna, setTaskColuna] = createSignal("backlog");
  const [taskPrioridade, setTaskPrioridade] = createSignal("media");
  const [flowSel, setFlowSel] = createSignal("");
  const [urlDestino, setUrlDestino] = createSignal("");

  const carregarDados = async () => {
    try {
      const [listaHooks, listaAgentes, listaFlows] = await Promise.all([
        fetchApi<any[]>("/hooks").catch(() => []),
        fetchApi<any[]>("/agents").catch(() => []),
        fetchApi<any[]>("/flows").catch(() => []),
      ]);
      setHooks(listaHooks || []);
      setAgentes(listaAgentes || []);
      setFluxos(listaFlows || []);
      if (listaAgentes && listaAgentes.length > 0 && !agenteSel()) {
        setAgenteSel(listaAgentes[0].id);
      }
    } catch {}
  };

  const criarHook = async () => {
    const nome = nomeHook().trim();
    if (!nome) {
      showToast("Nome do hook é obrigatório", "aviso");
      return;
    }
    setSalvando(true);

    let alvo: any = { tipo: alvoTipo() };
    if (alvoTipo() === "agent_run") {
      alvo.agente = agenteSel();
      alvo.ordem = ordemTemplate();
    } else if (alvoTipo() === "task_create") {
      alvo.titulo = taskTitulo();
      alvo.coluna = taskColuna();
      alvo.prioridade = taskPrioridade();
      alvo.responsavel = agenteSel() || undefined;
    } else if (alvoTipo() === "flow_run") {
      alvo.flow_id = flowSel();
    } else if (alvoTipo() === "webhook_out") {
      alvo.url = urlDestino();
    }

    try {
      await fetchApi("/hooks", {
        method: "POST",
        body: JSON.stringify({
          nome,
          alvo,
          modo_resposta: modoResposta(),
          janela_dedup_seg: Number(dedupSegundos()) || 0,
        }),
      });

      setNomeHook("");
      setModalNovo(false);
      showToast("Webhook cadastrado com sucesso!", "sucesso");
      void carregarDados();
    } catch (err: any) {
      showToast(`Erro ao criar hook: ${err.message}`, "erro");
    } finally {
      setSalvando(false);
    }
  };

  const excluirHook = async (id: string) => {
    if (!confirm(`Tem certeza que deseja excluir o webhook ${id}?`)) return;
    try {
      await fetchApi(`/hooks/${encodeURIComponent(id)}`, { method: "DELETE" });
      setHooks((prev) => prev.filter((h) => h.id !== id));
      showToast("Webhook excluído", "sucesso");
    } catch (err: any) {
      showToast(`Erro ao excluir: ${err.message}`, "erro");
    }
  };

  const copiarCurl = (hookId: string) => {
    const host = window.location.origin;
    const cmd = `curl -X POST "${host}/hooks/${hookId}" \\
  -H "Content-Type: application/json" \\
  -d '{"evento": "teste", "mensagem": "Disparo manual via cURL"}'`;

    navigator.clipboard.writeText(cmd);
    showToast("Comando cURL copiado para a área de transferência!", "sucesso");
  };

  onMount(() => {
    void carregarDados();
  });

  const rotuloAlvo = (alvo: any) => {
    const tipo = alvo?.tipo || alvo;
    switch (tipo) {
      case "agent_run":
        return `Disparar Agente @${alvo?.agente || "agente"}`;
      case "task_create":
        return `Criar Task (${alvo?.coluna || "backlog"})`;
      case "flow_run":
        return `Disparar Fluxo (${alvo?.flow_id || "flow"})`;
      case "webhook_out":
        return `Notificação Webhook Externo`;
      default:
        return String(tipo || "Ação Automática");
    }
  };

  return (
    <div class="flex flex-col h-full w-full overflow-hidden p-6 space-y-4 bg-zinc-950">
      {/* Header */}
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-800">
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-xl font-bold text-zinc-100 tracking-tight">Webhooks & Gatilhos</h1>
            <span class="text-[11px] font-mono px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300">
              {hooks().length} ativo(s)
            </span>
          </div>
          <p class="text-xs text-zinc-400 mt-0.5">
            Endpoints HTTP seguros para receber eventos externos (GitHub, Stripe, n8n, Zapier) e disparar agentes, tasks ou fluxos.
          </p>
        </div>

        <div class="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={carregarDados} title="Atualizar">
            <RefreshCw size={13} />
          </Button>
          <Button size="sm" variant="primary" onClick={() => setModalNovo(true)}>
            <Plus size={14} class="mr-1" /> Novo Webhook
          </Button>
        </div>
      </div>

      {/* Lista de Hooks */}
      <div class="flex-1 overflow-y-auto min-h-0 scrollbar-thin">
        <div class="space-y-3 pb-4">
          <For
            each={hooks()}
            fallback={
              <div class="py-16 text-center text-xs text-zinc-500">
                Nenhum webhook cadastrado no momento. Clique em "+ Novo Webhook" para gerar seu primeiro endpoint.
              </div>
            }
          >
            {(h) => {
              const tipoAlvo = h.alvo?.tipo || "agent_run";

              return (
                <div class="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
                  <div class="space-y-1.5 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800/80">
                        POST /hooks/{h.id}
                      </span>
                      <span class="text-xs font-bold text-zinc-100">{h.nome}</span>
                      <Show when={h.modo_resposta}>
                        <span class="text-[10px] text-zinc-500 font-mono">· modo: {h.modo_resposta}</span>
                      </Show>
                    </div>

                    <div class="flex items-center gap-2 text-xs text-zinc-300">
                      <Webhook size={13} class="text-emerald-400 flex-shrink-0" />
                      <span class="font-medium">{rotuloAlvo(h.alvo)}</span>
                    </div>

                    <Show when={h.janela_dedup_seg > 0}>
                      <span class="text-[10px] text-zinc-500 block font-mono">
                        Anti-duplicação ativo: bloqueia payloads idênticos por {h.janela_dedup_seg}s
                      </span>
                    </Show>
                  </div>

                  <div class="flex items-center gap-2 flex-shrink-0">
                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={() => copiarCurl(h.id)}
                      title="Copiar comando cURL de exemplo"
                    >
                      <Terminal size={12} class="mr-1" /> Copiar cURL
                    </Button>
                    <IconButton
                      size="xs"
                      variant="ghost"
                      class="text-zinc-500 hover:text-rose-400"
                      onClick={() => excluirHook(h.id)}
                      title="Excluir webhook"
                    >
                      <Trash2 size={13} />
                    </IconButton>
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </div>

      {/* Modal Novo Webhook */}
      <Show when={modalNovo()}>
        <div class="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div class="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
            <div class="flex items-center justify-between border-b border-zinc-800 pb-3 flex-shrink-0">
              <h2 class="text-sm font-bold text-zinc-100">Criar Novo Webhook / Gatilho</h2>
              <IconButton size="xs" variant="ghost" onClick={() => setModalNovo(false)}>
                <X size={16} />
              </IconButton>
            </div>

            <div class="space-y-3 text-xs overflow-y-auto pr-1 scrollbar-thin flex-1">
              <div>
                <label class="block text-zinc-400 mb-1 font-medium">Nome do Gatilho *</label>
                <input
                  type="text"
                  placeholder="Ex: github-push-deploy ou stripe-novo-cliente"
                  value={nomeHook()}
                  onInput={(e) => setNomeHook(e.currentTarget.value)}
                  class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono"
                />
              </div>

              <div>
                <label class="block text-zinc-400 mb-1 font-medium">Tipo de Ação a Disparar *</label>
                <div class="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAlvoTipo("agent_run")}
                    class={`p-2.5 rounded-lg border text-left cursor-pointer transition-colors ${
                      alvoTipo() === "agent_run"
                        ? "bg-emerald-950/40 border-emerald-500/80 text-emerald-200"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <div class="font-bold text-xs flex items-center gap-1.5">
                      <Bot size={13} /> Executar Agente
                    </div>
                    <div class="text-[10px] text-zinc-500 mt-0.5">Dispara instrução para um agente</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAlvoTipo("task_create")}
                    class={`p-2.5 rounded-lg border text-left cursor-pointer transition-colors ${
                      alvoTipo() === "task_create"
                        ? "bg-emerald-950/40 border-emerald-500/80 text-emerald-200"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <div class="font-bold text-xs flex items-center gap-1.5">
                      <Layers size={13} /> Criar Tarefa
                    </div>
                    <div class="text-[10px] text-zinc-500 mt-0.5">Adiciona card no Kanban</div>
                  </button>
                </div>
              </div>

              {/* Campos dinâmicos do Agente */}
              <Show when={alvoTipo() === "agent_run"}>
                <div class="space-y-3 p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                  <div>
                    <label class="block text-zinc-400 mb-1 font-medium">Agente Executor</label>
                    <select
                      value={agenteSel()}
                      onChange={(e) => setAgenteSel(e.currentTarget.value)}
                      class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-zinc-200 focus:outline-none cursor-pointer"
                    >
                      <For each={agentes()}>
                        {(ag) => <option value={ag.id}>@{ag.id}</option>}
                      </For>
                    </select>
                  </div>

                  <div>
                    <label class="block text-zinc-400 mb-1 font-medium">Template de Ordem</label>
                    <textarea
                      rows={3}
                      value={ordemTemplate()}
                      onInput={(e) => setOrdemTemplate(e.currentTarget.value)}
                      class="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 font-mono text-[11px] resize-none"
                    />
                  </div>
                </div>
              </Show>

              {/* Campos dinâmicos de Task */}
              <Show when={alvoTipo() === "task_create"}>
                <div class="space-y-3 p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                  <div>
                    <label class="block text-zinc-400 mb-1 font-medium">Título da Tarefa</label>
                    <input
                      type="text"
                      value={taskTitulo()}
                      onInput={(e) => setTaskTitulo(e.currentTarget.value)}
                      class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 font-mono"
                    />
                  </div>

                  <div class="grid grid-cols-2 gap-2">
                    <div>
                      <label class="block text-zinc-400 mb-1 font-medium">Coluna Inicial</label>
                      <select
                        value={taskColuna()}
                        onChange={(e) => setTaskColuna(e.currentTarget.value)}
                        class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-zinc-200 cursor-pointer"
                      >
                        <option value="backlog">Backlog</option>
                        <option value="fazendo">Fazendo</option>
                      </select>
                    </div>

                    <div>
                      <label class="block text-zinc-400 mb-1 font-medium">Prioridade</label>
                      <select
                        value={taskPrioridade()}
                        onChange={(e) => setTaskPrioridade(e.currentTarget.value)}
                        class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-zinc-200 cursor-pointer"
                      >
                        <option value="baixa">Baixa</option>
                        <option value="media">Média</option>
                        <option value="alta">Alta</option>
                      </select>
                    </div>
                  </div>
                </div>
              </Show>

              <div class="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label class="block text-zinc-400 mb-1 font-medium">Modo de Resposta</label>
                  <select
                    value={modoResposta()}
                    onChange={(e) => setModoResposta(e.currentTarget.value as any)}
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-2 text-zinc-200 cursor-pointer"
                  >
                    <option value="imediato">Imediato (202 Accepted)</option>
                    <option value="final">Síncrono (aguarda fim)</option>
                  </select>
                </div>

                <div>
                  <label class="block text-zinc-400 mb-1 font-medium">Janela Anti-Duplicação</label>
                  <input
                    type="number"
                    value={dedupSegundos()}
                    onInput={(e) => setDedupSegundos(Number(e.currentTarget.value))}
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 font-mono"
                  />
                </div>
              </div>
            </div>

            <div class="pt-3 border-t border-zinc-800 flex justify-end gap-2 flex-shrink-0">
              <Button size="sm" variant="secondary" onClick={() => setModalNovo(false)}>
                Cancelar
              </Button>
              <Button size="sm" variant="primary" loading={salvando()} onClick={criarHook}>
                Criar Webhook
              </Button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};
