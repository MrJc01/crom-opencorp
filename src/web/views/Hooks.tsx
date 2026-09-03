import { type Component, createSignal, onMount, For, Show } from "solid-js";
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
  ShieldCheck,
  ShieldAlert,
  Key,
  Globe,
  GitBranch,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  Sparkles,
  RotateCcw,
  ExternalLink,
  Lock,
} from "lucide-solid";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { showToast } from "../ui/Toast";
import { fetchApi, wsAtivo } from "../lib/context";

function gerarSecretAleatorio(): string {
  const chars = "abcdef0123456789";
  let res = "sec_";
  for (let i = 0; i < 32; i++) {
    res += chars[Math.floor(Math.random() * chars.length)];
  }
  return res;
}

export const HooksView: Component = () => {
  const [hooks, setHooks] = createSignal<any[]>([]);
  const [agentes, setAgentes] = createSignal<any[]>([]);
  const [fluxos, setFluxos] = createSignal<any[]>([]);
  const [tasks, setTasks] = createSignal<any[]>([]);
  const [modalNovo, setModalNovo] = createSignal(false);
  const [salvando, setSalvando] = createSignal(false);

  // Form State
  const [nomeHook, setNomeHook] = createSignal("");
  const [alvoTipo, setAlvoTipo] = createSignal<"agent_run" | "task_run" | "task_create" | "flow_run" | "webhook_out">("agent_run");
  const [modoResposta, setModoResposta] = createSignal<"imediato" | "final">("imediato");
  const [dedupSegundos, setDedupSegundos] = createSignal(60);

  // Autenticação
  const [authTipo, setAuthTipo] = createSignal<"token" | "hmac_sha256" | "nenhuma">("token");
  const [secretAuth, setSecretAuth] = createSignal(gerarSecretAleatorio());

  // Collapse Avançado
  const [exigeAprovacao, setExigeAprovacao] = createSignal(false);
  const [reenvioUrlsTexto, setReenvioUrlsTexto] = createSignal("");
  const [mostrarAvancado, setMostrarAvancado] = createSignal(false);

  // Campos específicos
  const [agenteSel, setAgenteSel] = createSignal("");
  const [ordemTemplate, setOrdemTemplate] = createSignal("Executar ordem recebida: use isso {{payload.name}} e analise os dados.");
  const [taskSelId, setTaskSelId] = createSignal("");
  const [taskInstrucaoAdicional, setTaskInstrucaoAdicional] = createSignal("Parâmetros do hook: {{payload}}");
  const [taskTitulo, setTaskTitulo] = createSignal("Nova task via Webhook: {{payload.name}}");
  const [taskDescricao, setTaskDescricao] = createSignal("Dados recebidos no disparo:\n{{payload}}");
  const [taskColuna, setTaskColuna] = createSignal("backlog");
  const [taskPrioridade, setTaskPrioridade] = createSignal("media");
  const [flowSel, setFlowSel] = createSignal("");
  const [flowEntrada, setFlowEntrada] = createSignal("{{payload}}");
  const [urlDestino, setUrlDestino] = createSignal("");

  const carregarDados = async () => {
    try {
      const [listaHooks, listaAgentes, listaFlows, listaTasks] = await Promise.all([
        fetchApi<any[]>("/hooks").catch(() => []),
        fetchApi<any[]>("/agents").catch(() => []),
        fetchApi<any[]>("/flows").catch(() => []),
        fetchApi<any[]>("/tasks").catch(() => []),
      ]);
      setHooks(listaHooks || []);
      setAgentes(listaAgentes || []);
      setFluxos(listaFlows || []);
      setTasks(listaTasks || []);

      if (listaAgentes && listaAgentes.length > 0 && !agenteSel()) {
        setAgenteSel(listaAgentes[0].id);
      }
      if (listaFlows && listaFlows.length > 0 && !flowSel()) {
        setFlowSel(listaFlows[0].id);
      }
      if (listaTasks && listaTasks.length > 0 && !taskSelId()) {
        setTaskSelId(listaTasks[0].id);
      }
    } catch {}
  };

  const inserirTagNoPrompt = (tag: string) => {
    if (alvoTipo() === "agent_run") {
      setOrdemTemplate((prev) => `${prev} ${tag}`);
    } else if (alvoTipo() === "task_run") {
      setTaskInstrucaoAdicional((prev) => `${prev} ${tag}`);
    } else if (alvoTipo() === "task_create") {
      setTaskTitulo((prev) => `${prev} ${tag}`);
    } else if (alvoTipo() === "flow_run") {
      setFlowEntrada((prev) => `${prev} ${tag}`);
    }
  };

  const criarHook = async () => {
    const nome = nomeHook().trim();
    if (!nome) {
      showToast("Nome do webhook é obrigatório", "aviso");
      return;
    }
    setSalvando(true);

    let alvo: any = { tipo: alvoTipo() };
    if (alvoTipo() === "agent_run") {
      alvo.agente = agenteSel();
      alvo.ordem = ordemTemplate();
    } else if (alvoTipo() === "task_run") {
      alvo.task_id = taskSelId();
      alvo.instrucao_adicional = taskInstrucaoAdicional();
    } else if (alvoTipo() === "task_create") {
      alvo.titulo = taskTitulo();
      alvo.descricao = taskDescricao();
      alvo.coluna = taskColuna();
      alvo.prioridade = taskPrioridade();
      alvo.responsavel = agenteSel() || undefined;
    } else if (alvoTipo() === "flow_run") {
      alvo.flow = flowSel();
      alvo.entrada = flowEntrada();
    } else if (alvoTipo() === "webhook_out") {
      alvo.url = urlDestino();
    }

    const reenvios = reenvioUrlsTexto()
      .split("\n")
      .map((u) => u.trim())
      .filter((u) => u.startsWith("http://") || u.startsWith("https://"));

    try {
      await fetchApi("/hooks", {
        method: "POST",
        body: JSON.stringify({
          nome,
          alvo,
          token: secretAuth(),
          auth: {
            tipo: authTipo(),
            secret: secretAuth(),
          },
          exige_aprovacao: exigeAprovacao(),
          reenvio_urls: reenvios,
          respond: modoResposta(),
          dedup_seg: Number(dedupSegundos()) || 0,
        }),
      });

      setNomeHook("");
      setSecretAuth(gerarSecretAleatorio());
      setExigeAprovacao(false);
      setReenvioUrlsTexto("");
      setModalNovo(false);
      showToast("Webhook cadastrado com sucesso!", "sucesso");
      void carregarDados();
    } catch (err: any) {
      showToast(`Erro ao criar webhook: ${err.message}`, "erro");
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

  const copiarCurl = (hook: any) => {
    const host = window.location.origin;
    const ws = wsAtivo() || "pulso-diario";
    const url = `${host}/hooks/${ws}/${hook.id}`;

    let authHeader = "";
    if (hook.auth?.tipo === "hmac_sha256") {
      authHeader = `  -H "x-hub-signature-256: sha256=<hash_hmac_do_payload>" \\\n`;
    } else if (hook.auth?.tipo !== "nenhuma") {
      const secret = hook.auth?.secret || hook.token;
      authHeader = `  -H "x-opencorp-token: ${secret}" \\\n`;
    }

    const cmd = `curl -X POST "${url}" \\\n  -H "Content-Type: application/json" \\\n${authHeader}  -d '{"name": "Lead Alpha", "email": "contato@alpha.com", "origem": "campanha_site"}'`;

    navigator.clipboard.writeText(cmd);
    showToast("Comando cURL copiado com cabeçalhos de autenticação!", "sucesso");
  };

  onMount(() => {
    void carregarDados();
  });

  const rotuloAlvo = (alvo: any) => {
    const tipo = alvo?.tipo || alvo;
    switch (tipo) {
      case "agent_run":
        return `Disparar Agente @${alvo?.agente || "agente"}`;
      case "task_run":
        return `Executar Task Existente (${alvo?.task_id || "task"})`;
      case "task_create":
        return `Criar Nova Task (${alvo?.coluna || "backlog"})`;
      case "flow_run":
        return `Disparar Fluxo (${alvo?.flow || alvo?.flow_id || "flow"})`;
      case "webhook_out":
        return `Webhook Relay / Repasse Externo`;
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
            <span class="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-800/80 text-emerald-400 font-bold">
              {hooks().length} ativo(s)
            </span>
          </div>
          <p class="text-xs text-zinc-400 mt-0.5">
            Endpoints HTTP seguros para receber dados externos e executar tasks existentes, agentes, fluxos ou repassar requisições com suporte a aprovação humana e hash seguro.
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
              <div class="py-16 text-center text-xs text-zinc-500 space-y-2">
                <Webhook size={24} class="mx-auto text-zinc-600 mb-2" />
                <p>Nenhum webhook cadastrado no momento.</p>
                <p class="text-zinc-600">Clique em "+ Novo Webhook" para gerar seu primeiro endpoint com hash de autenticação.</p>
              </div>
            }
          >
            {(h) => {
              const tipoAlvo = h.alvo?.tipo || "agent_run";
              const tipoAuth = h.auth?.tipo ?? "token";

              return (
                <div class="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
                  <div class="space-y-2 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800/80">
                        POST /hooks/{h.workspace || wsAtivo() || "pulso-diario"}/{h.id}
                      </span>
                      <span class="text-xs font-bold text-zinc-100">{h.nome}</span>

                      {/* Badge de Segurança */}
                      <Show when={tipoAuth === "token"}>
                        <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950/60 text-blue-300 border border-blue-800/60 flex items-center gap-1">
                          <Lock size={10} /> Token Bearer
                        </span>
                      </Show>
                      <Show when={tipoAuth === "hmac_sha256"}>
                        <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-950/60 text-purple-300 border border-purple-800/60 flex items-center gap-1">
                          <ShieldCheck size={10} /> HMAC SHA-256
                        </span>
                      </Show>
                      <Show when={tipoAuth === "nenhuma"}>
                        <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-amber-300 border border-amber-800/50 flex items-center gap-1">
                          <ShieldAlert size={10} /> Aberto (Sem Auth)
                        </span>
                      </Show>

                      {/* Badge de HITL Aprovação */}
                      <Show when={h.exige_aprovacao}>
                        <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-950/60 text-amber-300 border border-amber-800/80 font-bold flex items-center gap-1">
                          🛡️ Exige Aprovação Humana
                        </span>
                      </Show>
                    </div>

                    <div class="flex items-center gap-2 text-xs text-zinc-300">
                      <Webhook size={13} class="text-emerald-400 flex-shrink-0" />
                      <span class="font-medium">{rotuloAlvo(h.alvo)}</span>
                      <Show when={h.alvo?.ordem}>
                        <span class="text-zinc-500 font-mono truncate max-w-md text-[11px]">
                          — "{h.alvo.ordem}"
                        </span>
                      </Show>
                      <Show when={h.alvo?.task_id}>
                        <span class="text-amber-400 font-mono text-[11px]">
                          — Alvo: #{h.alvo.task_id}
                        </span>
                      </Show>
                    </div>

                    <div class="flex items-center gap-3 text-[10px] font-mono text-zinc-500 flex-wrap">
                      <span>Dedup: {h.dedup_seg ?? h.janela_dedup_seg ?? 60}s</span>
                      <span>Modo: {h.respond ?? h.modo_resposta ?? "imediato"}</span>
                      <Show when={h.reenvio_urls && h.reenvio_urls.length > 0}>
                        <span class="text-indigo-400">
                          Reenvia para {h.reenvio_urls.length} URL(s)
                        </span>
                      </Show>
                    </div>
                  </div>

                  <div class="flex items-center gap-2 flex-shrink-0">
                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={() => copiarCurl(h)}
                      title="Copiar comando cURL com autenticação"
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
        <div class="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div class="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-xl w-full p-5 space-y-4 shadow-2xl max-h-[90vh] flex flex-col">
            <div class="flex items-center justify-between border-b border-zinc-800 pb-3 flex-shrink-0">
              <div class="flex items-center gap-2">
                <div class="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Webhook size={16} />
                </div>
                <div>
                  <h2 class="text-sm font-bold text-zinc-100">Criar Novo Webhook & Gatilho</h2>
                  <p class="text-[11px] text-zinc-400">Receba requisições externas com autenticação e dispare ações.</p>
                </div>
              </div>
              <IconButton size="xs" variant="ghost" onClick={() => setModalNovo(false)}>
                <X size={16} />
              </IconButton>
            </div>

            <div class="space-y-4 text-xs overflow-y-auto pr-1 scrollbar-thin flex-1">
              {/* Nome */}
              <div>
                <label class="block text-zinc-400 mb-1 font-medium">Nome do Webhook *</label>
                <input
                  type="text"
                  placeholder="Ex: stripe-novo-cliente ou github-deploy"
                  value={nomeHook()}
                  onInput={(e) => setNomeHook(e.currentTarget.value)}
                  class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono"
                />
              </div>

              {/* Seletor de Ação */}
              <div>
                <label class="block text-zinc-300 mb-1.5 font-medium text-xs">Ação a Executar quando o Webhook Chegar *</label>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setAlvoTipo("agent_run")}
                    class={`p-2.5 rounded-xl border text-left cursor-pointer transition-all min-w-0 overflow-hidden ${
                      alvoTipo() === "agent_run"
                        ? "bg-emerald-950/50 border-emerald-500/80 text-emerald-200 shadow-xs"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <div class="font-bold text-xs flex items-center gap-1.5 truncate">
                      <Bot size={13} class="text-emerald-400 flex-shrink-0" /> Executar Agente
                    </div>
                    <div class="text-[10px] text-zinc-500 mt-0.5 truncate">Prompt / instrução</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAlvoTipo("task_run")}
                    class={`p-2.5 rounded-xl border text-left cursor-pointer transition-all min-w-0 overflow-hidden ${
                      alvoTipo() === "task_run"
                        ? "bg-amber-950/50 border-amber-500/80 text-amber-200 shadow-xs"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <div class="font-bold text-xs flex items-center gap-1.5 truncate">
                      <CheckSquare size={13} class="text-amber-400 flex-shrink-0" /> Rodar Task
                    </div>
                    <div class="text-[10px] text-zinc-500 mt-0.5 truncate">Card do Kanban</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAlvoTipo("flow_run")}
                    class={`p-2.5 rounded-xl border text-left cursor-pointer transition-all min-w-0 overflow-hidden ${
                      alvoTipo() === "flow_run"
                        ? "bg-indigo-950/50 border-indigo-500/80 text-indigo-200 shadow-xs"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <div class="font-bold text-xs flex items-center gap-1.5 truncate">
                      <GitBranch size={13} class="text-indigo-400 flex-shrink-0" /> Executar Fluxo
                    </div>
                    <div class="text-[10px] text-zinc-500 mt-0.5 truncate">Orquestração</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAlvoTipo("task_create")}
                    class={`p-2.5 rounded-xl border text-left cursor-pointer transition-all min-w-0 overflow-hidden ${
                      alvoTipo() === "task_create"
                        ? "bg-blue-950/50 border-blue-500/80 text-blue-200 shadow-xs"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <div class="font-bold text-xs flex items-center gap-1.5 truncate">
                      <Layers size={13} class="text-blue-400 flex-shrink-0" /> Criar Task
                    </div>
                    <div class="text-[10px] text-zinc-500 mt-0.5 truncate">Novo card no board</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAlvoTipo("webhook_out")}
                    class={`p-2.5 rounded-xl border text-left cursor-pointer transition-all min-w-0 overflow-hidden ${
                      alvoTipo() === "webhook_out"
                        ? "bg-purple-950/50 border-purple-500/80 text-purple-200 shadow-xs"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <div class="font-bold text-xs flex items-center gap-1.5 truncate">
                      <Globe size={13} class="text-purple-400 flex-shrink-0" /> Webhook Relay
                    </div>
                    <div class="text-[10px] text-zinc-500 mt-0.5 truncate">Repassar para URL</div>
                  </button>
                </div>
              </div>

              {/* Campos dinâmicos do Agente */}
              <Show when={alvoTipo() === "agent_run"}>
                <div class="space-y-3 p-3.5 bg-zinc-950 rounded-xl border border-zinc-800">
                  <div>
                    <label class="block text-zinc-300 mb-1 font-medium">Agente Executor *</label>
                    <select
                      value={agenteSel()}
                      onChange={(e) => setAgenteSel(e.currentTarget.value)}
                      class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none cursor-pointer font-mono text-xs"
                    >
                      <For each={agentes()}>
                        {(ag) => <option value={ag.id}>@{ag.id} — {ag.papel || ag.nome || "Agente"}</option>}
                      </For>
                    </select>
                  </div>

                  <div>
                    <label class="block text-zinc-300 mb-1 font-medium">Prompt / Ordem Customizada *</label>
                    <textarea
                      rows={3}
                      value={ordemTemplate()}
                      onInput={(e) => setOrdemTemplate(e.currentTarget.value)}
                      placeholder="Instrução do agente: use {{payload.name}}..."
                      class="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 font-mono text-[11px] resize-none focus:outline-none focus:border-zinc-700"
                    />
                    {/* Toolbar de tags logo abaixo do input */}
                    <div class="flex items-center gap-1.5 flex-wrap pt-1.5">
                      <span class="text-[10px] text-zinc-500 font-medium">Inserir tag:</span>
                      <button
                        type="button"
                        onClick={() => inserirTagNoPrompt("{{payload.name}}")}
                        class="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-[10px] border border-zinc-700 transition-colors"
                      >
                        + {"{{payload.name}}"}
                      </button>
                      <button
                        type="button"
                        onClick={() => inserirTagNoPrompt("{{payload.email}}")}
                        class="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-[10px] border border-zinc-700 transition-colors"
                      >
                        + {"{{payload.email}}"}
                      </button>
                      <button
                        type="button"
                        onClick={() => inserirTagNoPrompt("{{payload}}")}
                        class="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-[10px] border border-zinc-700 transition-colors"
                      >
                        + {"{{payload}}"}
                      </button>
                      <button
                        type="button"
                        onClick={() => inserirTagNoPrompt("{{query.id}}")}
                        class="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-[10px] border border-zinc-700 transition-colors"
                      >
                        + {"{{query.id}}"}
                      </button>
                    </div>
                  </div>
                </div>
              </Show>

              {/* Campos dinâmicos de Rodar Task Existente */}
              <Show when={alvoTipo() === "task_run"}>
                <div class="space-y-3 p-3.5 bg-zinc-950 rounded-xl border border-zinc-800">
                  <div>
                    <label class="block text-zinc-300 mb-1 font-medium">Selecionar Task Existente *</label>
                    <select
                      value={taskSelId()}
                      onChange={(e) => setTaskSelId(e.currentTarget.value)}
                      class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none cursor-pointer font-mono text-xs"
                    >
                      <For each={tasks()}>
                        {(t) => (
                          <option value={t.id}>
                            #{t.id} — {t.titulo} ({t.coluna} · @{t.responsavel?.replace(/^agente:/, "") || "sem agente"})
                          </option>
                        )}
                      </For>
                    </select>
                  </div>

                  <div>
                    <label class="block text-zinc-300 mb-1 font-medium">Instrução / Parâmetros Adicionais (Opcional)</label>
                    <textarea
                      rows={2}
                      value={taskInstrucaoAdicional()}
                      onInput={(e) => setTaskInstrucaoAdicional(e.currentTarget.value)}
                      placeholder="Ex: Execute a task com este parâmetro: {{payload.parametro}}"
                      class="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 font-mono text-[11px] resize-none focus:outline-none focus:border-zinc-700"
                    />
                    <div class="flex items-center gap-1.5 flex-wrap pt-1.5">
                      <span class="text-[10px] text-zinc-500 font-medium">Inserir tag:</span>
                      <button
                        type="button"
                        onClick={() => inserirTagNoPrompt("{{payload}}")}
                        class="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-[10px] border border-zinc-700 transition-colors"
                      >
                        + {"{{payload}}"}
                      </button>
                    </div>
                  </div>
                </div>
              </Show>

              {/* Campos dinâmicos de Criar Task */}
              <Show when={alvoTipo() === "task_create"}>
                <div class="space-y-3 p-3.5 bg-zinc-950 rounded-xl border border-zinc-800">
                  <div>
                    <label class="block text-zinc-300 mb-1 font-medium">Título da Tarefa *</label>
                    <input
                      type="text"
                      value={taskTitulo()}
                      onInput={(e) => setTaskTitulo(e.currentTarget.value)}
                      placeholder="Ex: Novo cliente {{payload.name}}"
                      class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 font-mono text-xs focus:outline-none focus:border-zinc-700"
                    />
                  </div>

                  <div>
                    <label class="block text-zinc-300 mb-1 font-medium">Descrição da Tarefa</label>
                    <textarea
                      rows={2}
                      value={taskDescricao()}
                      onInput={(e) => setTaskDescricao(e.currentTarget.value)}
                      class="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 font-mono text-[11px] resize-none focus:outline-none focus:border-zinc-700"
                    />
                  </div>

                  <div class="grid grid-cols-3 gap-2">
                    <div>
                      <label class="block text-zinc-300 mb-1 font-medium">Coluna</label>
                      <select
                        value={taskColuna()}
                        onChange={(e) => setTaskColuna(e.currentTarget.value)}
                        class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 cursor-pointer text-xs"
                      >
                        <option value="backlog">Backlog</option>
                        <option value="fazendo">Fazendo</option>
                      </select>
                    </div>

                    <div>
                      <label class="block text-zinc-300 mb-1 font-medium">Prioridade</label>
                      <select
                        value={taskPrioridade()}
                        onChange={(e) => setTaskPrioridade(e.currentTarget.value)}
                        class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 cursor-pointer text-xs"
                      >
                        <option value="baixa">Baixa</option>
                        <option value="media">Média</option>
                        <option value="alta">Alta</option>
                      </select>
                    </div>

                    <div>
                      <label class="block text-zinc-300 mb-1 font-medium">Responsável</label>
                      <select
                        value={agenteSel()}
                        onChange={(e) => setAgenteSel(e.currentTarget.value)}
                        class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 cursor-pointer text-xs"
                      >
                        <option value="">Sem responsável</option>
                        <For each={agentes()}>
                          {(ag) => <option value={ag.id}>@{ag.id}</option>}
                        </For>
                      </select>
                    </div>
                  </div>
                </div>
              </Show>

              {/* Campos dinâmicos de Fluxo */}
              <Show when={alvoTipo() === "flow_run"}>
                <div class="space-y-3 p-3.5 bg-zinc-950 rounded-xl border border-zinc-800">
                  <div>
                    <label class="block text-zinc-300 mb-1 font-medium">Selecionar Fluxo *</label>
                    <select
                      value={flowSel()}
                      onChange={(e) => setFlowSel(e.currentTarget.value)}
                      class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 cursor-pointer font-mono text-xs"
                    >
                      <For each={fluxos()}>
                        {(fl) => <option value={fl.id}>{fl.nome || fl.id}</option>}
                      </For>
                    </select>
                  </div>

                  <div>
                    <label class="block text-zinc-300 mb-1 font-medium">Entrada do Fluxo (Payload)</label>
                    <textarea
                      rows={2}
                      value={flowEntrada()}
                      onInput={(e) => setFlowEntrada(e.currentTarget.value)}
                      placeholder="{{payload}}"
                      class="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 font-mono text-[11px] resize-none focus:outline-none focus:border-zinc-700"
                    />
                  </div>
                </div>
              </Show>

              {/* Campos dinâmicos de Webhook Relay */}
              <Show when={alvoTipo() === "webhook_out"}>
                <div class="space-y-3 p-3.5 bg-zinc-950 rounded-xl border border-zinc-800">
                  <div>
                    <label class="block text-zinc-300 mb-1 font-medium">URL de Destino *</label>
                    <input
                      type="url"
                      placeholder="https://api.exemplo.com/webhook"
                      value={urlDestino()}
                      onInput={(e) => setUrlDestino(e.currentTarget.value)}
                      class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 font-mono text-xs focus:outline-none focus:border-zinc-700"
                    />
                  </div>
                </div>
              </Show>

              {/* Seção de Autenticação Segura (Hash / Token) */}
              <div class="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <Lock size={14} class="text-blue-400" />
                    <span class="font-bold text-zinc-200 text-xs">Autenticação & Hash de Segurança</span>
                  </div>
                  <span class="text-[10px] text-zinc-500 font-mono">proteção contra acessos indevidos</span>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setAuthTipo("token")}
                    class={`p-2.5 rounded-xl border text-left cursor-pointer transition-colors min-w-0 overflow-hidden ${
                      authTipo() === "token"
                        ? "bg-blue-950/40 border-blue-600 text-blue-200 shadow-xs"
                        : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <div class="font-bold text-xs truncate">Token Bearer</div>
                    <div class="text-[10px] text-zinc-500 mt-0.5 truncate">Header / Query</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAuthTipo("hmac_sha256")}
                    class={`p-2.5 rounded-xl border text-left cursor-pointer transition-colors min-w-0 overflow-hidden ${
                      authTipo() === "hmac_sha256"
                        ? "bg-purple-950/40 border-purple-600 text-purple-200 shadow-xs"
                        : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <div class="font-bold text-xs truncate">HMAC SHA-256</div>
                    <div class="text-[10px] text-zinc-500 mt-0.5 truncate">Assinatura Hash</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAuthTipo("nenhuma")}
                    class={`p-2.5 rounded-xl border text-left cursor-pointer transition-colors min-w-0 overflow-hidden ${
                      authTipo() === "nenhuma"
                        ? "bg-amber-950/40 border-amber-600 text-amber-200 shadow-xs"
                        : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <div class="font-bold text-xs truncate">Acesso Aberto</div>
                    <div class="text-[10px] text-zinc-500 mt-0.5 truncate">Sem autenticação</div>
                  </button>
                </div>

                <Show when={authTipo() !== "nenhuma"}>
                  <div>
                    <div class="flex items-center justify-between mb-1">
                      <label class="text-zinc-400 font-medium">Chave / Secret de Validação *</label>
                      <button
                        type="button"
                        onClick={() => setSecretAuth(gerarSecretAleatorio())}
                        class="text-[10px] text-emerald-400 hover:underline flex items-center gap-1"
                      >
                        <RotateCcw size={10} /> Gerar Nova Chave
                      </button>
                    </div>
                    <div class="flex items-center gap-2">
                      <input
                        type="text"
                        value={secretAuth()}
                        onInput={(e) => setSecretAuth(e.currentTarget.value)}
                        class="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 font-mono text-xs focus:outline-none"
                      />
                      <IconButton
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          navigator.clipboard.writeText(secretAuth());
                          showToast("Chave copiada!", "sucesso");
                        }}
                        title="Copiar chave"
                      >
                        <Copy size={13} />
                      </IconButton>
                    </div>
                  </div>
                </Show>
              </div>

              {/* Collapse Avançado (HITL + Reenvio / Relay + Dedup) */}
              <div class="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setMostrarAvancado(!mostrarAvancado())}
                  class="w-full p-3 flex items-center justify-between text-left hover:bg-zinc-900/50 transition-colors"
                >
                  <div class="flex items-center gap-2 font-medium text-zinc-300">
                    <span class="text-xs">Opções Avançadas (Aprovação Humana & Reenvio)</span>
                    <Show when={exigeAprovacao()}>
                      <span class="px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800 text-[10px]">
                        HITL Ativo
                      </span>
                    </Show>
                  </div>
                  {mostrarAvancado() ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>

                <Show when={mostrarAvancado()}>
                  <div class="p-3.5 border-t border-zinc-800 space-y-3 text-xs bg-zinc-950/80">
                    {/* Trava de Aprovação Humana (HITL) */}
                    <div class="flex items-start gap-3 p-3 rounded-xl bg-amber-950/20 border border-amber-800/50">
                      <input
                        type="checkbox"
                        id="checkAprov"
                        checked={exigeAprovacao()}
                        onChange={(e) => setExigeAprovacao(e.currentTarget.checked)}
                        class="mt-1 h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500 cursor-pointer"
                      />
                      <div>
                        <label for="checkAprov" class="font-bold text-amber-200 cursor-pointer">
                          Obrigatoriamente ir para Aprovação Humana antes de executar
                        </label>
                        <p class="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                          Quando marcado, ao receber a requisição web, o sistema cria uma pendência na tela de Aprovações (<span class="font-mono text-zinc-300">/approvals</span>). A ordem só será executada pelo agente após aprovação manual.
                        </p>
                      </div>
                    </div>

                    {/* Reenvio Automático para Outras URLs (Relay) */}
                    <div>
                      <label class="block text-zinc-400 mb-1 font-medium">
                        Reenviar automaticamente para outras URLs (Forwarding / Relay)
                      </label>
                      <textarea
                        rows={2}
                        value={reenvioUrlsTexto()}
                        onInput={(e) => setReenvioUrlsTexto(e.currentTarget.value)}
                        placeholder="https://meu-crm.com/webhook&#10;https://backup.api.com/eventos"
                        class="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 font-mono text-[11px] resize-none"
                      />
                      <span class="text-[10px] text-zinc-500">Insira uma URL por linha. Cada requisição recebida será replicada em paralelo.</span>
                    </div>

                    <div class="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <label class="block text-zinc-400 mb-1 font-medium">Modo de Resposta HTTP</label>
                        <select
                          value={modoResposta()}
                          onChange={(e) => setModoResposta(e.currentTarget.value as any)}
                          class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 cursor-pointer"
                        >
                          <option value="imediato">Imediato (202 Accepted)</option>
                          <option value="final">Síncrono (aguarda finalização)</option>
                        </select>
                      </div>

                      <div>
                        <label class="block text-zinc-400 mb-1 font-medium">Janela Anti-Duplicação</label>
                        <input
                          type="number"
                          value={dedupSegundos()}
                          onInput={(e) => setDedupSegundos(Number(e.currentTarget.value))}
                          class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 font-mono"
                        />
                      </div>
                    </div>
                  </div>
                </Show>
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
