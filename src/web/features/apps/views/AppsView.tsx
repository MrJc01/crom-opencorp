import React, { useState, type FC } from "react";
import { AppWindow, Layers, Wrench, CheckCircle2, Shield, Plus, ExternalLink } from "lucide-react";
import { showToast } from "../../../shared/ui/Toast.js";

interface AppIntegracao {
  id: string;
  nome: string;
  descricao: string;
  protocolo: "MCP" | "REST" | "CLI";
  conectado: boolean;
}

const APPS_MOCK: AppIntegracao[] = [
  {
    id: "filesystem-mcp",
    nome: "Filesystem MCP Server",
    descricao: "Permite aos agentes leitura e escrita segura no diretório do projeto com checkpoints atômicos.",
    protocolo: "MCP",
    conectado: true,
  },
  {
    id: "git-tools",
    nome: "Git Versioning Engine",
    descricao: "Comandos nativos para diff, commit, rollback e isolamento de branches.",
    protocolo: "CLI",
    conectado: true,
  },
  {
    id: "duckduckgo-search",
    nome: "DuckDuckGo Web Search",
    descricao: "Pesquisa na web sem retenção de dados para coleta de documentação e bibliotecas.",
    protocolo: "REST",
    conectado: true,
  },
  {
    id: "sqlite-viewer",
    nome: "SQLite WAL Inspector",
    descricao: "Auditoria direta das tabelas operacionais do scheduler, tasks e memória.",
    protocolo: "MCP",
    conectado: true,
  },
];

export const AppsView: FC = () => {
  const [apps] = useState<AppIntegracao[]>(APPS_MOCK);

  return (
    <div className="flex flex-col h-full w-full p-6 md:p-8 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <AppWindow className="text-emerald-400" size={20} />
            Catálogo de Aplicações & Servidores MCP
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Ferramentas externas e servidores Model Context Protocol conectados ao Secretário Executivo.
          </p>
        </div>

        <button
          type="button"
          onClick={() => showToast("Configuração de novo servidor MCP disponível no painel de settings", "info")}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer self-start md:self-auto"
        >
          <Plus size={14} />
          <span>Conectar Servidor</span>
        </button>
      </div>

      {/* Grid de Apps */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {apps.map((app) => (
          <div
            key={app.id}
            className="flex flex-col justify-between p-5 rounded-2xl bg-zinc-900/40 border border-zinc-850 hover:border-zinc-700/80 transition-all shadow-sm space-y-4"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-9 w-9 rounded-xl bg-zinc-800 flex items-center justify-center text-emerald-400">
                  <Wrench size={18} />
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-850 text-zinc-300">
                  {app.protocolo}
                </span>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-zinc-100">{app.nome}</h3>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{app.descricao}</p>
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-850/60 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-medium">
                <CheckCircle2 size={12} />
                Ativo & Conectado
              </span>

              <span className="text-[10px] font-mono text-zinc-500">ID: {app.id}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
