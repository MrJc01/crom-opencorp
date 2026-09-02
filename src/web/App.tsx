import { type Component, onMount } from "solid-js";
import { Router, Route } from "@solidjs/router";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { ToastContainer } from "./ui/Toast";
import { carregarWorkspaces, conectarSSE } from "./lib/context";

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
import { HistoricoView } from "./views/Historico";
import { NotificacoesView } from "./views/Notificacoes";
import { ConfigView } from "./views/Config";

export const AppLayout: Component<{ children?: any }> = (props) => {
  onMount(() => {
    void carregarWorkspaces();
    conectarSSE();
  });

  return (
    <div class="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 antialiased font-sans">
      <Sidebar />
      <div class="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        <Topbar />
        <main class="flex-1 min-h-0 overflow-y-auto relative bg-zinc-950">
          {props.children}
        </main>
      </div>
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
      <Route path="/historico" component={HistoricoView} />
      <Route path="/notificacoes" component={NotificacoesView} />
      <Route path="/config" component={ConfigView} />
    </Router>
  );
};
