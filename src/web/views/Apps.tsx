import { type Component, createSignal, onMount, For, Show } from "solid-js";
import {
  Layout,
  Plus,
  ArrowLeft,
  MessageSquare,
  Play,
  Monitor,
  Columns2,
  X,
  Code2,
  ExternalLink,
  Sparkles,
  RotateCw,
  FolderCode,
  Layers,
  BarChart2,
  Globe,
  Terminal,
  Database,
  CheckSquare,
  Calendar,
  Cpu,
  Bot,
  Type,
  FileText,
} from "lucide-solid";
import { fetchApi, wsAtivo } from "../lib/context";
import { showToast } from "../ui/Toast";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { UniversalChat } from "../components/chat/UniversalChat";
import type { ChatMensagem } from "../components/chat/types";

export type ModoVisualizacaoApp = "app" | "chat" | "ambos";

export const getAppIcon = (icone?: string) => {
  const i = (icone || "").toLowerCase();
  if (i.includes("chart") || i.includes("grafico") || i.includes("metric")) return BarChart2;
  if (i.includes("globe") || i.includes("web") || i.includes("site") || i.includes("wp") || i.includes("word")) return Globe;
  if (i.includes("term") || i.includes("console") || i.includes("cli")) return Terminal;
  if (i.includes("data") || i.includes("banco") || i.includes("sql")) return Database;
  if (i.includes("task") || i.includes("check") || i.includes("tarefa") || i.includes("painel")) return CheckSquare;
  if (i.includes("cal") || i.includes("agenda") || i.includes("cron")) return Calendar;
  if (i.includes("bot") || i.includes("ia") || i.includes("agent")) return Bot;
  if (i.includes("cpu") || i.includes("eng")) return Cpu;
  if (i.includes("sparkle") || i.includes("pulso") || i.includes("monitor")) return Sparkles;
  return Layout;
};

export const AppsView: Component = () => {
  const [appsLista, setAppsLista] = createSignal<any[]>([]);
  const [carregandoApps, setCarregandoApps] = createSignal(false);
  const [appSelecionado, setAppSelecionado] = createSignal<any | null>(null);
  const [modoVisualizacao, setModoVisualizacao] = createSignal<ModoVisualizacaoApp>("app");
  const [mensagensApp, setMensagensApp] = createSignal<ChatMensagem[]>([]);
  const [carregandoChatApp, setCarregandoChatApp] = createSignal(false);
  const [modalNovoApp, setModalNovoApp] = createSignal(false);
  const [novoAppId, setNovoAppId] = createSignal("");
  const [novoAppTitulo, setNovoAppTitulo] = createSignal("");
  const [novoAppDesc, setNovoAppDesc] = createSignal("");
  const [criandoApp, setCriandoApp] = createSignal(false);

  const carregarApps = async () => {
    setCarregandoApps(true);
    try {
      const lista = await fetchApi<any[]>("/api/apps");
      setAppsLista(lista || []);
    } catch {
      setAppsLista([]);
    } finally {
      setCarregandoApps(false);
    }
  };

  const getIframeUrl = (appItem: any) => {
    let url = appItem.entryUrl || `/api/apps/${encodeURIComponent(appItem.id)}/view`;
    const ws = wsAtivo();
    if (ws && !url.includes("workspace=")) {
      url += (url.includes("?") ? "&" : "?") + "workspace=" + encodeURIComponent(ws);
    }
    return url;
  };

  const abrirApp = (app: any, modo: ModoVisualizacaoApp = "app") => {
    setAppSelecionado(app);
    setModoVisualizacao(modo);
    const iframeUrl = getIframeUrl(app);
    setMensagensApp([
      {
        role: "assistant",
        content: `👋 Olá! Estou pronto para ajudar você a customizar e evoluir a aplicação **${app.titulo}**.\n\nCódigo-fonte: \`apps/${app.id}/index.html\`\nPreview: [${iframeUrl}](${iframeUrl})\n\nO que você gostaria de ajustar no layout, nas regras de negócio ou na consulta de APIs?`,
        iframeUrl,
      },
    ]);
  };

  const fecharApp = () => {
    setAppSelecionado(null);
    setMensagensApp([]);
  };

  const enviarPromptParaApp = async (texto: string) => {
    const app = appSelecionado();
    if (!app) return;

    setMensagensApp((prev) => [
      ...prev,
      { role: "user", content: texto },
    ]);

    setCarregandoChatApp(true);
    try {
      const res = await fetchApi<any>(`/api/apps/${encodeURIComponent(app.id)}/chat`, {
        method: "POST",
        body: JSON.stringify({ mensagem: texto }),
      }).catch(() => null);

      setMensagensApp((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Alterações processadas para o app **${app.titulo}**!\n\n${res?.resposta || "Arquivos atualizados. Recarregue o preview ao lado para conferir as modificações."}`,
          iframeUrl: app.entryUrl,
        },
      ]);
    } catch (err: any) {
      setMensagensApp((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `⚠️ Não foi possível aplicar as alterações automaticamente: ${err.message}`,
        },
      ]);
    } finally {
      setCarregandoChatApp(false);
    }
  };

  const salvarNovoApp = async () => {
    const id = novoAppId().trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    const titulo = novoAppTitulo().trim();
    const desc = novoAppDesc().trim();
    if (!id || !titulo) {
      showToast("ID e Título são obrigatórios", "aviso");
      return;
    }

    setCriandoApp(true);
    try {
      const res = await fetchApi<any>("/api/apps/novo", {
        method: "POST",
        body: JSON.stringify({ id, titulo, descricao: desc }),
      });
      showToast(`Mini-App "${titulo}" criado com sucesso!`, "sucesso");
      setModalNovoApp(false);
      setNovoAppId("");
      setNovoAppTitulo("");
      setNovoAppDesc("");
      await carregarApps();
      if (res) {
        abrirApp(res, "app");
      }
    } catch (err: any) {
      showToast(`Erro ao criar: ${err.message}`, "erro");
    } finally {
      setCriandoApp(false);
    }
  };

  onMount(() => {
    void carregarApps();
  });

  return (
    <div class="flex flex-col h-full w-full overflow-hidden bg-zinc-950">
      {/* Visualização de Mini-App Aberto com UniversalChat + Iframe */}
      <Show when={appSelecionado()}>
        {(app) => (
          <div class="flex flex-col h-full w-full overflow-hidden bg-zinc-950">
            {/* Topbar do App Aberto */}
            <div class="h-12 px-4 border-b border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between text-xs select-none backdrop-blur-xs flex-shrink-0">
              <div class="flex items-center gap-3 min-w-0">
                <Button size="xs" variant="ghost" onClick={fecharApp}>
                  <ArrowLeft size={14} class="mr-1" /> Voltar aos Apps
                </Button>
                <div class="h-4 w-px bg-zinc-800" />
                <div class="flex items-center gap-2 truncate">
                  <div class="h-6 w-6 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                    {(() => {
                      const Icone = getAppIcon(app().icone || app().id);
                      return <Icone size={13} />;
                    })()}
                  </div>
                  <span class="font-bold text-sm text-zinc-100 truncate">{app().titulo}</span>
                  <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60 flex items-center gap-1">
                    <FolderCode size={10} class="text-zinc-500" />
                    apps/{app().id}
                  </span>
                </div>
              </div>

              <div class="flex items-center gap-2">
                {/* As 3 Opções: Só App | Só Chat | Os Dois */}
                <div class="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-0.5 shadow-inner">
                  <button
                    type="button"
                    onClick={() => setModoVisualizacao("app")}
                    class={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                      modoVisualizacao() === "app"
                        ? "bg-blue-600 text-white shadow-xs font-semibold"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                    }`}
                    title="Exibir apenas o App em tela cheia (Chat oculto)"
                  >
                    <Monitor size={13} />
                    <span>Só App</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setModoVisualizacao("chat")}
                    class={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                      modoVisualizacao() === "chat"
                        ? "bg-purple-600 text-white shadow-xs font-semibold"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                    }`}
                    title="Exibir apenas o Chat com IA (App oculto)"
                  >
                    <MessageSquare size={13} />
                    <span>Só Chat</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setModoVisualizacao("ambos")}
                    class={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                      modoVisualizacao() === "ambos"
                        ? "bg-emerald-600 text-white shadow-xs font-semibold"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                    }`}
                    title="Exibir App e Chat lado a lado"
                  >
                    <Columns2 size={13} />
                    <span>Os Dois</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Layout UniversalChat + Iframe acoplado */}
            <div class="flex-1 min-h-0 w-full">
              <UniversalChat
                mensagens={mensagensApp()}
                carregando={carregandoChatApp()}
                agente={{
                  id: "editor-app",
                  nome: `Editor de ${app().titulo}`,
                  modelo: "opencode-go/glm-5.3-flash",
                }}
                podeEnviarPrompt={true}
                onEnviarPrompt={enviarPromptParaApp}
                modoVisualizacao={modoVisualizacao()}
                placeholder={`Peça para a IA editar ou adicionar algo em apps/${app().id}/index.html...`}
                iframeConfig={{
                  habilitado: true,
                  aberto: true,
                  url: getIframeUrl(app()),
                  titulo: app().titulo,
                }}
              />
            </div>
          </div>
        )}
      </Show>

      {/* Visualização da Lista de Mini-Apps do Workspace */}
      <Show when={!appSelecionado()}>
        <div class="flex flex-col h-full w-full overflow-hidden p-4 sm:p-6 space-y-5 bg-zinc-950">
          {/* Header */}
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80 flex-shrink-0">
            <div>
              <div class="flex items-center gap-2">
                <Layout size={20} class="text-blue-400" />
                <h1 class="text-xl font-bold text-zinc-100 tracking-tight">Mini-Apps</h1>
                <span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold">
                  Alfa
                </span>
              </div>
              <p class="text-xs text-zinc-400 mt-1 max-w-2xl">
                Aplicações autônomas criadas no workspace com frontend HTML/JS/CSS e backend conectado diretamente às rotas da API local.
              </p>
            </div>

            <Button size="sm" variant="primary" onClick={() => setModalNovoApp(true)}>
              <Plus size={14} class="mr-1" /> Novo Mini-App
            </Button>
          </div>

          {/* Lista Vertical de Apps */}
          <div class="flex-1 overflow-y-auto min-h-0 scrollbar-thin space-y-4">
            <div class="flex items-center justify-between">
              <h2 class="text-xs font-bold uppercase tracking-wider text-zinc-400 font-mono">
                Aplicações Instaladas ({appsLista().length})
              </h2>
              <span class="text-[11px] text-zinc-500">
                Dispostas verticalmente · Clique para abrir no Iframe ou editar com a IA
              </span>
            </div>

            <Show
              when={appsLista().length > 0}
              fallback={
                <div class="p-12 text-center rounded-2xl bg-zinc-900/30 border border-zinc-800/80">
                  <Layout size={32} class="mx-auto text-zinc-600 mb-3" />
                  <h3 class="text-sm font-semibold text-zinc-300">Nenhum Mini-App criado ainda</h3>
                  <p class="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
                    Crie seu primeiro mini-app no workspace com HTML, Javascript e conexão direta com as APIs locais.
                  </p>
                  <Button size="sm" variant="primary" class="mt-4" onClick={() => setModalNovoApp(true)}>
                    <Plus size={14} class="mr-1" /> Criar Primeiro Mini-App
                  </Button>
                </div>
              }
            >
              {/* Lista Vertical (um embaixo do outro) */}
              <div class="space-y-3">
                <For each={appsLista()}>
                  {(app) => (
                    <div class="p-4 rounded-xl bg-zinc-900/40 hover:bg-zinc-900/80 border border-zinc-800/80 hover:border-zinc-700 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 group shadow-xs">
                      <div class="flex items-start gap-3.5 min-w-0">
                        <div class="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 flex-shrink-0 mt-0.5">
                          {(() => {
                            const Icone = getAppIcon(app.icone || app.id);
                            return <Icone size={20} />;
                          })()}
                        </div>
                        <div class="space-y-1 min-w-0">
                          <div class="flex items-center gap-2 flex-wrap">
                            <h3 class="text-sm font-bold text-zinc-100 group-hover:text-blue-300 transition-colors">
                              {app.titulo}
                            </h3>
                            <span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              {app.categoria || "Mini-App"}
                            </span>
                            <span class="text-[10px] font-mono text-zinc-500 flex items-center gap-1">
                              <FolderCode size={11} class="text-zinc-500 inline" />
                              apps/{app.id}/index.html
                            </span>
                          </div>
                          <p class="text-xs text-zinc-400 line-clamp-2">
                            {app.descricao || "Mini-aplicação conectada ao workspace"}
                          </p>
                        </div>
                      </div>

                      <div class="flex items-center gap-2 self-end md:self-auto flex-shrink-0">
                        <Button size="sm" variant="secondary" onClick={() => abrirApp(app, "ambos")}>
                          <MessageSquare size={13} class="mr-1.5 text-purple-400" /> Editar com IA
                        </Button>
                        <Button size="sm" variant="primary" onClick={() => abrirApp(app, "app")}>
                          <Play size={13} class="mr-1.5 text-emerald-400" /> Abrir App
                        </Button>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </Show>

      {/* MODAL NOVO MINI-APP */}
      <Show when={modalNovoApp()}>
        <div class="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50">
          <div class="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div class="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div class="flex items-center gap-2">
                <Layout size={17} class="text-blue-400" />
                <h2 class="text-sm font-bold text-zinc-100">Criar Novo Mini-App</h2>
              </div>
              <IconButton size="xs" variant="ghost" onClick={() => setModalNovoApp(false)}>
                <X size={16} />
              </IconButton>
            </div>

            <div class="space-y-3 text-xs">
              <div class="space-y-1">
                <label class="block text-zinc-300 font-medium flex items-center gap-1.5">
                  <FolderCode size={12} class="text-blue-400" /> ID da Aplicação (pasta em apps/)
                </label>
                <input
                  type="text"
                  placeholder="ex: painel-vendas ou monitor-api"
                  value={novoAppId()}
                  onInput={(e) => setNovoAppId(e.currentTarget.value)}
                  class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono"
                />
                <span class="text-[10px] text-zinc-500">
                  Criará a pasta: apps/{novoAppId() || "exemplo"}/index.html
                </span>
              </div>

              <div class="space-y-1">
                <label class="block text-zinc-300 font-medium flex items-center gap-1.5">
                  <Type size={12} class="text-blue-400" /> Título do App
                </label>
                <input
                  type="text"
                  placeholder="ex: Painel de Monitoramento"
                  value={novoAppTitulo()}
                  onInput={(e) => setNovoAppTitulo(e.currentTarget.value)}
                  class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-700"
                />
              </div>

              <div class="space-y-1">
                <label class="block text-zinc-300 font-medium flex items-center gap-1.5">
                  <FileText size={12} class="text-blue-400" /> Descrição
                </label>
                <textarea
                  rows={2}
                  placeholder="ex: Consulta dados de pedidos e integra com o CRM"
                  value={novoAppDesc()}
                  onInput={(e) => setNovoAppDesc(e.currentTarget.value)}
                  class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-700"
                />
              </div>
            </div>

            <div class="pt-3 border-t border-zinc-800 flex items-center justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setModalNovoApp(false)}>
                <X size={13} class="mr-1" /> Cancelar
              </Button>
              <Button size="sm" variant="primary" loading={criandoApp()} onClick={salvarNovoApp}>
                <Plus size={13} class="mr-1" /> Criar App e Abrir
              </Button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};
