import { type Component, onMount, onCleanup, createEffect, Show, lazy, Suspense } from "solid-js";
import { Router, Route, useLocation, useNavigate, Navigate } from "@solidjs/router";
import { Bot } from "lucide-solid";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { GlobalTitlebar } from "./components/GlobalTitlebar";
import { LoginModal } from "./components/LoginModal";
import { ToastContainer } from "./ui/Toast";
import { ChatStoreProvider } from "./lib/chat/store";
import { OpenCorpProvider } from "./providers/OpenCorpProvider";
import { carregarWorkspaces, conectarSSE, token, wsAtivo, autenticado, sidebarMobileAberta, dockSecretarioAberto, setDockSecretarioAberto } from "./lib/context";

// Views e componentes pesados carregados sob demanda via code-splitting
const HomeView = lazy(() => import("./views/Home").then((m) => ({ default: m.HomeView })));
const SecretarioView = lazy(() => import("./views/Secretario").then((m) => ({ default: m.SecretarioView })));
const TasksView = lazy(() => import("./views/Tasks").then((m) => ({ default: m.TasksView })));
const AgentesView = lazy(() => import("./views/Agentes").then((m) => ({ default: m.AgentesView })));
const AtivosView = lazy(() => import("./views/Ativos").then((m) => ({ default: m.AtivosView })));
const AgentCard = lazy(() => import("./components/AgentCard").then((m) => ({ default: m.AgentCard })));
const WorkspaceView = lazy(() => import("./views/Workspace").then((m) => ({ default: m.WorkspaceView })));
const ReunioesView = lazy(() => import("./views/Reunioes").then((m) => ({ default: m.ReunioesView })));
const FluxosView = lazy(() => import("./views/Fluxos").then((m) => ({ default: m.FluxosView })));
const AppsView = lazy(() => import("./views/Apps").then((m) => ({ default: m.AppsView })));
const SecretsView = lazy(() => import("./views/Secrets").then((m) => ({ default: m.SecretsView })));
const HistoricoView = lazy(() => import("./views/Historico").then((m) => ({ default: m.HistoricoView })));
const NotificacoesView = lazy(() => import("./views/Notificacoes").then((m) => ({ default: m.NotificacoesView })));
const ConfigView = lazy(() => import("./views/Config").then((m) => ({ default: m.ConfigView })));
const DocsView = lazy(() => import("./views/Docs").then((m) => ({ default: m.DocsView })));
const SecretarioDock = lazy(() => import("./components/SecretarioDock"));

const ViewLoader: Component = () => (
  <div class="flex h-full w-full min-h-[50vh] items-center justify-center">
    <div class="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-2.5 text-xs text-zinc-400 backdrop-blur-sm shadow-sm animate-pulse">
      <div class="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
      <span>Carregando módulo...</span>
    </div>
  </div>
);

export const AppLayout: Component<{ children?: any }> = (props) => {
  const location = useLocation();
  const navigate = useNavigate();

  onMount(() => {
    void carregarWorkspaces();
    conectarSSE();

    const lidarComHash = () => {
      const hash = window.location.hash;
      if (hash && hash.startsWith("#/")) {
        const rota = hash.slice(1);
        navigate(rota, { replace: true });
      }
    };
    lidarComHash();
    window.addEventListener("hashchange", lidarComHash);
    onCleanup(() => window.removeEventListener("hashchange", lidarComHash));

    // Atalho global Ctrl+J / Cmd+J: alterna o Secretário lateral
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setDockSecretarioAberto(!dockSecretarioAberto());
      }
    };
    window.addEventListener("keydown", aoTeclar);
    onCleanup(() => window.removeEventListener("keydown", aoTeclar));

    // Ao cruzar para viewport mobile, fecha o overlay do dock (padrão de drawer)
    const mqMobile = window.matchMedia("(max-width: 1023.5px)");
    const aoMudarViewport = (e: MediaQueryListEvent) => {
      if (e.matches) setDockSecretarioAberto(false);
    };
    mqMobile.addEventListener("change", aoMudarViewport);
    onCleanup(() => mqMobile.removeEventListener("change", aoMudarViewport));
  });

  // Quando não há workspace ativo, rotas restritas a workspaces redirecionam para a home global
  createEffect(() => {
    const ws = wsAtivo();
    const rota = location.pathname;
    const rotasGlobais = ["/", "/home", "/secretario", "/ativos", "/docs", "/config", "/secrets"];
    if (!ws && !rotasGlobais.some((r) => rota === r || rota.startsWith(r + "/"))) {
      navigate("/home", { replace: true });
    }
  });

  return (
    <div id="app" class="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 antialiased font-sans">
      <Show when={!autenticado()}>
        <LoginModal />
      </Show>
      
      {/* Sidebar montada quando há workspace ativo OU quando drawer mobile for aberta */}
      <Show when={wsAtivo() || sidebarMobileAberta()}>
        <Sidebar />
      </Show>

      <div class="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        <Show when={wsAtivo()} fallback={<GlobalTitlebar />}>
          <Topbar />
        </Show>
        <div class="flex flex-1 min-h-0 overflow-hidden">
          <main class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative bg-zinc-950">
            <Suspense fallback={<ViewLoader />}>
              {props.children}
            </Suspense>
          </main>
          <Show when={dockSecretarioAberto() && location.pathname !== "/secretario"}>
            <Suspense fallback={null}>
              <SecretarioDock />
            </Suspense>
          </Show>
        </div>
      </div>
      {/* Botão flutuante do Secretário: abre o chat lateral em qualquer página */}
      <Show when={location.pathname !== "/secretario" && !dockSecretarioAberto()}>
        <button
          type="button"
          data-testid="secretario-fab"
          onClick={() => setDockSecretarioAberto(true)}
          class="fixed bottom-4 right-4 lg:bottom-6 lg:right-6 z-40 h-12 w-12 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/50 flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer"
          title="Abrir Secretário (Ctrl+J)"
          aria-label="Abrir Secretário"
        >
          <Bot size={22} />
        </button>
      </Show>
      <ToastContainer />
    </div>
  );
};

export const App: Component = () => {
  return (
    <OpenCorpProvider token={token} workspaceId={wsAtivo}>
      <ChatStoreProvider>
        <Router root={AppLayout}>
          <Route path="/" component={HomeView} />
          <Route path="/home" component={HomeView} />
          <Route path="/secretario" component={SecretarioView} />
          <Route path="/ativos" component={AtivosView} />
          <Route path="/agente/:id" component={AgentCard} />
          <Route path="/workspace" component={WorkspaceView} />
          <Route path="/tasks" component={TasksView} />
          <Route path="/agentes" component={AgentesView} />
          <Route path="/reunioes" component={ReunioesView} />
          <Route path="/agenda" component={() => <Navigate href="/fluxos?filtro=cron" />} />
          <Route path="/fluxos" component={FluxosView} />
          <Route path="/hooks" component={() => <Navigate href="/fluxos" />} />
          <Route path="/apps" component={AppsView} />
          <Route path="/secrets" component={SecretsView} />
          <Route path="/historico" component={HistoricoView} />
          <Route path="/notificacoes" component={NotificacoesView} />
          <Route path="/docs" component={DocsView} />
          <Route path="/config" component={ConfigView} />
        </Router>
      </ChatStoreProvider>
    </OpenCorpProvider>
  );
};
