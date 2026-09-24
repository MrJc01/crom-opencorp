import React, { type FC } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { OpenCorpProvider } from "./providers/OpenCorpProvider.js";
import { AppLayout } from "./shared/layout/AppLayout.js";
import { SecretarioView } from "./features/chat/views/SecretarioView.js";
import { AtivosView } from "./features/assets/views/AtivosView.js";
import { NotificacoesView } from "./features/notifications/views/NotificacoesView.js";
import { DocsView } from "./features/docs/views/DocsView.js";
import { ModulePlaceholder } from "./shared/components/ModulePlaceholder.js";
import {
  Kanban,
  Users,
  Workflow,
  MessagesSquare,
  FolderTree,
  AppWindow,
  KeyRound,
  History,
  Settings,
} from "lucide-react";

export const App: FC = () => {
  return (
    <OpenCorpProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            {/* Rotas Ativas em React 19 */}
            <Route path="/" element={<SecretarioView />} />
            <Route path="/secretario" element={<SecretarioView />} />
            <Route path="/ativos" element={<AtivosView />} />
            <Route path="/notificacoes" element={<NotificacoesView />} />
            <Route path="/docs" element={<DocsView />} />

            {/* Módulos em Transição Padrão Trampolim (Passo 4) */}
            <Route
              path="/tasks"
              element={
                <ModulePlaceholder
                  modulo="Quadro Kanban Operacional"
                  descricao="Gestão visual de tarefas, locks concorrentes e automações de agentes via @opencorp/sdk."
                  icone={Kanban}
                />
              }
            />
            <Route
              path="/agentes"
              element={
                <ModulePlaceholder
                  modulo="Quadro de Agentes de IA"
                  descricao="Editor de personas, governança de modelos xB e concessão de ferramentas."
                  icone={Users}
                />
              }
            />
            <Route
              path="/fluxos"
              element={
                <ModulePlaceholder
                  modulo="Orquestrador de Fluxos (n8n-style)"
                  descricao="Canvas de grafos DAG, gatilhos de agendamento cron e endpoints de webhook."
                  icone={Workflow}
                />
              }
            />
            <Route
              path="/reunioes"
              element={
                <ModulePlaceholder
                  modulo="Comitê de Reuniões Autônomas"
                  descricao="Deliberações multi-agente com atas em tempo real e consolidação de consensos."
                  icone={MessagesSquare}
                />
              }
            />
            <Route
              path="/workspace"
              element={
                <ModulePlaceholder
                  modulo="Painel do Workspace Ativo"
                  descricao="Navegação em árvore de arquivos, checkpoints Git e terminal interativo."
                  icone={FolderTree}
                />
              }
            />
            <Route
              path="/apps"
              element={
                <ModulePlaceholder
                  modulo="Catálogo de Aplicações MCP"
                  descricao="Conexões de Model Context Protocol e ferramentas externas para o Secretário."
                  icone={AppWindow}
                />
              }
            />
            <Route
              path="/secrets"
              element={
                <ModulePlaceholder
                  modulo="Cofre Seguro de Credenciais"
                  descricao="Armazenamento criptografado de chaves de API com auditoria de saldo."
                  icone={KeyRound}
                />
              }
            />
            <Route
              path="/historico"
              element={
                <ModulePlaceholder
                  modulo="Auditoria Forense de Execuções"
                  descricao="Inspeção detalhada de traces, passos cognitivos e deltas de inferência."
                  icone={History}
                />
              }
            />
            <Route
              path="/config"
              element={
                <ModulePlaceholder
                  modulo="Configurações do Sistema"
                  descricao="Ajustes de telemetria, fuso horário, limites de execução e isolamento."
                  icone={Settings}
                />
              }
            />

            {/* Redirecionamentos de conveniência */}
            <Route path="/home" element={<Navigate to="/secretario" replace />} />
            <Route path="/agenda" element={<Navigate to="/fluxos" replace />} />
            <Route path="/hooks" element={<Navigate to="/fluxos" replace />} />
            <Route path="*" element={<Navigate to="/secretario" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </OpenCorpProvider>
  );
};
