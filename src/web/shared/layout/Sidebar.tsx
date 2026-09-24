import React, { useState, type FC } from "react";
import { NavLink } from "react-router-dom";
import {
  Bot,
  Kanban,
  Users,
  Workflow,
  MessagesSquare,
  Layers,
  Bell,
  BookOpen,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Shield,
  Activity,
} from "lucide-react";

interface ItemNav {
  to: string;
  rotulo: string;
  icone: React.ComponentType<{ size?: number; className?: string }>;
  destaque?: boolean;
}

const ITENS_NAV: ItemNav[] = [
  { to: "/secretario", rotulo: "Secretário Executivo", icone: Bot, destaque: true },
  { to: "/tasks", rotulo: "Kanban Operacional", icone: Kanban },
  { to: "/agentes", rotulo: "Quadro de Agentes", icone: Users },
  { to: "/fluxos", rotulo: "Fluxos de Automação", icone: Workflow },
  { to: "/reunioes", rotulo: "Reuniões & Deliberações", icone: MessagesSquare },
  { to: "/ativos", rotulo: "Loja de Skills & Ativos", icone: Layers },
  { to: "/notificacoes", rotulo: "Notificações & Alertas", icone: Bell },
  { to: "/docs", rotulo: "Documentação do Sistema", icone: BookOpen },
  { to: "/config", rotulo: "Configurações Gerais", icone: Settings },
];

export const Sidebar: FC = () => {
  const [recolhida, setRecolhida] = useState<boolean>(() => {
    return typeof window !== "undefined" && localStorage.getItem("oc_sidebar_collapsed") === "1";
  });

  const alternarRecolhida = () => {
    setRecolhida((prev) => {
      const proximo = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("oc_sidebar_collapsed", proximo ? "1" : "0");
      }
      return proximo;
    });
  };

  return (
    <aside
      className={`flex flex-col h-full bg-zinc-950 border-r border-zinc-850 select-none transition-all duration-200 z-30 ${
        recolhida ? "w-16" : "w-64"
      }`}
    >
      {/* Topo da Sidebar com Logo */}
      <div className="flex items-center justify-between h-14 px-3.5 border-b border-zinc-850/80">
        {!recolhida ? (
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="h-8 w-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-md shadow-emerald-950/60 flex-shrink-0">
              <Shield size={18} />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-sm tracking-tight text-zinc-100 flex items-center gap-1.5">
                OpenCorp
                <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-emerald-950/60 border border-emerald-800/40 text-emerald-400">
                  v0.7
                </span>
              </span>
              <span className="text-[11px] text-zinc-500 truncate">Empresa Autônoma</span>
            </div>
          </div>
        ) : (
          <div className="mx-auto h-8 w-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-md shadow-emerald-950/60">
            <Shield size={18} />
          </div>
        )}

        <button
          type="button"
          onClick={alternarRecolhida}
          className="hidden md:flex h-7 w-7 rounded-lg items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors cursor-pointer"
          title={recolhida ? "Expandir menu lateral" : "Recolher menu lateral"}
        >
          {recolhida ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </div>

      {/* Lista de Navegação Principal */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {ITENS_NAV.map((item) => {
          const Icone = item.icone;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all group ${
                  isActive
                    ? "bg-emerald-950/50 text-emerald-300 border border-emerald-800/50 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/70 border border-transparent"
                } ${recolhida ? "justify-center px-0" : ""}`
              }
              title={recolhida ? item.rotulo : undefined}
            >
              <Icone
                size={16}
                className={item.destaque ? "text-emerald-400 flex-shrink-0" : "flex-shrink-0"}
              />
              {!recolhida && (
                <span className="truncate flex-1">{item.rotulo}</span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer com Status do Daemon */}
      <div className="p-3 border-t border-zinc-850/80 bg-zinc-950">
        {!recolhida ? (
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Daemon Ativo</span>
            </div>
            <Activity size={13} className="text-zinc-600" />
          </div>
        ) : (
          <div className="flex justify-center" title="Daemon Ativo">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        )}
      </div>
    </aside>
  );
};
