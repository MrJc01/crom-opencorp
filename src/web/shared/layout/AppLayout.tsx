import React, { Suspense, useState, useEffect, type FC } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar.js";
import { Topbar } from "./Topbar.js";
import { ToastContainer } from "../ui/Toast.js";
import { RouteSkeleton } from "../ui/RouteSkeleton.js";
import { SecretarioDock } from "../../features/chat/components/SecretarioDock.js";

export const AppLayout: FC = () => {
  const [dockAberto, setDockAberto] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Atalho Ctrl+J ou Cmd+J para alternar o dock
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setDockAberto((prev) => !prev);
      }
      // Atalho Esc para fechar o dock caso aberto
      if (e.key === "Escape" && dockAberto) {
        setDockAberto(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dockAberto]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 antialiased font-sans">
      {/* Sidebar Lateral */}
      <Sidebar />

      {/* Área Central de Trabalho */}
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        <Topbar
          aoAlternarSecretario={() => setDockAberto((prev) => !prev)}
          secretarioAberto={dockAberto}
        />

        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative bg-zinc-950">
          <Suspense fallback={<RouteSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Dock Lateral Flutuante do Secretário */}
      <SecretarioDock aberto={dockAberto} aoFechar={() => setDockAberto(false)} />

      {/* Container Global de Notificações Toast */}
      <ToastContainer />
    </div>
  );
};

