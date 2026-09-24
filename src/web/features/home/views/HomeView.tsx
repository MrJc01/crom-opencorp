import React, { useState, useEffect, useCallback, type FC } from "react";
import { Link } from "react-router-dom";
import { useOpenCorp } from "../../../providers/OpenCorpProvider.js";
import {
  LayoutDashboard,
  Bot,
  Kanban,
  Users,
  Workflow,
  Sparkles,
  ArrowRight,
  Activity,
  CheckCircle2,
  Clock,
  Shield,
} from "lucide-react";

export const HomeView: FC = () => {
  const { client, workspaceId, tratarErro } = useOpenCorp();
  const [totalTarefas, setTotalTarefas] = useState(0);
  const [tarefasFazendo, setTarefasFazendo] = useState(0);
  const [totalAgentes, setTotalAgentes] = useState(0);
  const [totalFluxos, setTotalFluxos] = useState(0);
  const [daemonOnline, setDaemonOnline] = useState(true);

  const carregarMetricas = useCallback(async () => {
    try {
      const [tasks, agents, flows, health] = await Promise.all([
        client.tasks.listar().catch(() => []),
        client.agents.listar().catch(() => []),
        client.flows.listar().catch(() => []),
        client.system.getHealth().catch(() => ({ ok: false })),
      ]);

      setTotalTarefas(tasks?.length || 0);
      setTarefasFazendo(tasks?.filter((t: any) => t.coluna === "fazendo").length || 0);
      setTotalAgentes(agents?.length || 0);
      setTotalFluxos(flows?.length || 0);
      setDaemonOnline(health?.ok !== false);
    } catch (err) {
      tratarErro(err, "Falha ao compilar métricas da dashboard");
    }
  }, [client, tratarErro]);

  useEffect(() => {
    void carregarMetricas();
  }, [carregarMetricas]);

  return (
    <div className="flex flex-col h-full w-full p-6 md:p-8 space-y-6 overflow-y-auto">
      {/* Banner de Boas-vindas */}
      <div className="relative p-6 md:p-8 rounded-3xl bg-gradient-to-r from-emerald-950/60 via-zinc-900/60 to-zinc-900/40 border border-emerald-800/40 shadow-xl overflow-hidden">
        <div className="max-w-2xl space-y-3 z-10 relative">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-800/60 text-xs font-mono text-emerald-300">
            <Sparkles size={13} className="text-emerald-400" />
            <span>OpenCorp Sistema Operacional Autônomo · v0.7</span>
          </div>

          <h1 className="text-2xl md:text-3xl font-bold text-zinc-100 tracking-tight">
            Governança da Empresa Autônoma
          </h1>

          <p className="text-xs md:text-sm text-zinc-300 leading-relaxed">
            Workspace ativo: <span className="font-mono font-semibold text-emerald-300">{workspaceId}</span>.
            O Secretário Executivo e os agentes autônomos operam de forma orquestrada via tarefas e fluxos.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <Link
              to="/secretario"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-950/60 transition-all cursor-pointer"
            >
              <Bot size={15} />
              <span>Abrir Secretário</span>
              <ArrowRight size={13} />
            </Link>

            <Link
              to="/tasks"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700/60 transition-colors"
            >
              <Kanban size={14} className="text-emerald-400" />
              <span>Ver Kanban ({totalTarefas})</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Grid de Métricas Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-850 space-y-2">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium">Tarefas em Progresso</span>
            <Clock size={16} className="text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-zinc-100 font-mono">{tarefasFazendo}</div>
          <span className="text-[11px] text-zinc-500">De {totalTarefas} tarefas registradas</span>
        </div>

        <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-850 space-y-2">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium">Quadro de Agentes</span>
            <Users size={16} className="text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-zinc-100 font-mono">{totalAgentes}</div>
          <span className="text-[11px] text-zinc-500">Personas governadas ativas</span>
        </div>

        <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-850 space-y-2">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium">Pipelines de Fluxo</span>
            <Workflow size={16} className="text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-zinc-100 font-mono">{totalFluxos}</div>
          <span className="text-[11px] text-zinc-500">Automações agendadas</span>
        </div>

        <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-850 space-y-2">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium">Status do Daemon</span>
            <Activity size={16} className={daemonOnline ? "text-emerald-400" : "text-rose-400"} />
          </div>
          <div className="text-sm font-bold text-zinc-100 flex items-center gap-2 pt-1">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                daemonOnline ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
              }`}
            />
            {daemonOnline ? "Operacional (WAL)" : "Indisponível"}
          </div>
          <span className="text-[11px] text-zinc-500">Supervisão pontual ativa</span>
        </div>
      </div>
    </div>
  );
};
