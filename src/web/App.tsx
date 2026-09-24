import React, { type FC } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { OpenCorpProvider } from "./providers/OpenCorpProvider.js";
import { AppLayout } from "./shared/layout/AppLayout.js";

// Views Nativas em React 19
import { SecretarioView } from "./features/chat/views/SecretarioView.js";
import { TasksView } from "./features/tasks/views/TasksView.js";
import { AgentesView } from "./features/agents/views/AgentesView.js";
import { FluxosView } from "./features/workflows/views/FluxosView.js";
import { WorkspaceView } from "./features/workspace/views/WorkspaceView.js";
import { ConfigView } from "./features/settings/views/ConfigView.js";
import { HomeView } from "./features/home/views/HomeView.js";
import { AppsView } from "./features/apps/views/AppsView.js";
import { ReunioesView } from "./features/meetings/views/ReunioesView.js";
import { HistoricoView } from "./features/history/views/HistoricoView.js";
import { AtivosView } from "./features/assets/views/AtivosView.js";
import { NotificacoesView } from "./features/notifications/views/NotificacoesView.js";
import { DocsView } from "./features/docs/views/DocsView.js";

export const App: FC = () => {
  return (
    <OpenCorpProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            {/* Rota Raiz & Chat Principal */}
            <Route path="/" element={<SecretarioView />} />
            <Route path="/secretario" element={<SecretarioView />} />
            <Route path="/home" element={<HomeView />} />

            {/* Módulos Operacionais Conectados via @opencorp/sdk */}
            <Route path="/tasks" element={<TasksView />} />
            <Route path="/agentes" element={<AgentesView />} />
            <Route path="/fluxos" element={<FluxosView />} />
            <Route path="/workspace" element={<WorkspaceView />} />
            <Route path="/config" element={<ConfigView />} />
            <Route path="/apps" element={<AppsView />} />
            <Route path="/reunioes" element={<ReunioesView />} />
            <Route path="/historico" element={<HistoricoView />} />

            {/* Ativos, Notificações & Documentação */}
            <Route path="/ativos" element={<AtivosView />} />
            <Route path="/notificacoes" element={<NotificacoesView />} />
            <Route path="/docs" element={<DocsView />} />

            {/* Redirecionamentos de conveniência */}
            <Route path="/agenda" element={<Navigate to="/fluxos" replace />} />
            <Route path="/hooks" element={<Navigate to="/fluxos" replace />} />
            <Route path="/secrets" element={<Navigate to="/config" replace />} />
            <Route path="*" element={<Navigate to="/secretario" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </OpenCorpProvider>
  );
};
