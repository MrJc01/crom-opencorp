import React, { Suspense, type FC } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar.js";
import { Topbar } from "./Topbar.js";
import { ToastContainer } from "../ui/Toast.js";
import { RouteSkeleton } from "../ui/RouteSkeleton.js";

export const AppLayout: FC = () => {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 antialiased font-sans">
      {/* Sidebar Lateral */}
      <Sidebar />

      {/* Área Central de Trabalho */}
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        <Topbar />

        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative bg-zinc-950">
          <Suspense fallback={<RouteSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Container Global de Notificações Toast */}
      <ToastContainer />
    </div>
  );
};
