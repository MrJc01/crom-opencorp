import { type Component, onMount, onCleanup, createEffect, Show } from "solid-js";
import { Router, Route, useLocation, useNavigate, Navigate } from "@solidjs/router";
import { Bot } from "lucide-solid";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { GlobalTitlebar } from "./components/GlobalTitlebar";
import { LoginModal } from "./components/LoginModal";
import { ToastContainer } from "./ui/Toast";
import SecretarioDock from "./components/SecretarioDock";
import { ChatStoreProvider } from "./lib/chat/store";
import { carregarWorkspaces, conectarSSE, wsAtivo, autenticado, sidebarMobileAberta, dockSecretarioAberto, setDockSecretarioAberto } from "./lib/context";

// Views
import { SecretarioView } from "./views/Secretario";
import { HomeView } from "./views/Home";
import { TasksView } from "./views/Tasks";
import { AgentesView } from "./views/Agentes";
import { WorkspaceView } from "./views/Workspace";
import { ReunioesView } from "./views/Reunioes";
import { FluxosView } from "./views/Fluxos";
import { AppsView } from "./views/Apps";
import { SecretsView } from "./views/Secrets";
import { HistoricoView } from "./views/Historico";
import { NotificacoesView } from "./views/Notificacoes";
import { ConfigView } from "./views/Config";
import { DocsView } from "./views/Docs";

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
    const rotasGlobais = ["/", "/home", "/secretario", "/docs", "/config", "/secrets"];
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
            {props.children}
          </main>
          <Show when={dockSecretarioAberto() && location.pathname !== "/secretario"}>
            <SecretarioDock />
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
    <ChatStoreProvider>
      <Router root={AppLayout}>
      <Route path="/" component={HomeView} />
      <Route path="/home" component={HomeView} />
      <Route path="/secretario" component={SecretarioView} />
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
  );
};
