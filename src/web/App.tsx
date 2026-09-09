import { type Component, onMount, createEffect, Show } from "solid-js";
import { Router, Route, useLocation, useNavigate } from "@solidjs/router";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { GlobalTitlebar } from "./components/GlobalTitlebar";
import { LoginModal } from "./components/LoginModal";
import { ToastContainer } from "./ui/Toast";
import { carregarWorkspaces, conectarSSE, wsAtivo, autenticado } from "./lib/context";

// Views
import { SecretarioView } from "./views/Secretario";
import { HomeView } from "./views/Home";
import { TasksView } from "./views/Tasks";
import { AgentesView } from "./views/Agentes";
import { WorkspaceView } from "./views/Workspace";
import { ReunioesView } from "./views/Reunioes";
import { AgendaView } from "./views/Agenda";
import { FluxosView } from "./views/Fluxos";
import { HooksView } from "./views/Hooks";
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

  // Suporte a links e testes com hash legado (ex: /#/notificacoes -> /notificacoes)
  createEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.startsWith("#/")) {
      const rota = hash.slice(1);
      navigate(rota, { replace: true });
    }
  });

  return (
    <div id="app" class="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 antialiased font-sans">
      <Show when={!autenticado()}>
        <LoginModal />
      </Show>
      <Show
        when={wsAtivo()}
        fallback={
          <div class="flex flex-col flex-1 min-w-0 h-full overflow-hidden bg-zinc-950">
            <GlobalTitlebar />
            <main class="flex-1 min-h-0 overflow-y-auto relative bg-zinc-950">
              {props.children}
            </main>
          </div>
        }
      >
        <Sidebar />
        <div class="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
          <Topbar />
          <main class="flex-1 min-h-0 overflow-y-auto relative bg-zinc-950">
            {props.children}
          </main>
        </div>
      </Show>
      <ToastContainer />
    </div>
  );
};

export const App: Component = () => {
  return (
    <Router root={AppLayout}>
      <Route path="/" component={HomeView} />
      <Route path="/home" component={HomeView} />
      <Route path="/secretario" component={SecretarioView} />
      <Route path="/workspace" component={WorkspaceView} />
      <Route path="/tasks" component={TasksView} />
      <Route path="/agentes" component={AgentesView} />
      <Route path="/reunioes" component={ReunioesView} />
      <Route path="/agenda" component={AgendaView} />
      <Route path="/fluxos" component={FluxosView} />
      <Route path="/hooks" component={HooksView} />
      <Route path="/apps" component={AppsView} />
      <Route path="/secrets" component={SecretsView} />
      <Route path="/historico" component={HistoricoView} />
      <Route path="/notificacoes" component={NotificacoesView} />
      <Route path="/docs" component={DocsView} />
      <Route path="/config" component={ConfigView} />
    </Router>
  );
};
