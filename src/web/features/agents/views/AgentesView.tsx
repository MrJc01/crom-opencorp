import React, { useState, useEffect, useCallback, type FC } from "react";
import { useOpenCorp } from "../../../providers/OpenCorpProvider.js";
import { type AgentResumo } from "@opencorp/sdk";
import {
  Users,
  Bot,
  Cpu,
  Wrench,
  Search,
  ExternalLink,
  X,
} from "lucide-react";

export const AgentesView: FC = () => {
  const { client, tratarErro } = useOpenCorp();
  const [agentes, setAgentes] = useState<AgentResumo[]>([]);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [agenteSelecionado, setAgenteSelecionado] = useState<AgentResumo | null>(null);

  const carregarAgentes = useCallback(async () => {
    setCarregando(true);
    try {
      const lista = await client.agents.listar();
      setAgentes(lista || []);
    } catch (err) {
      tratarErro(err, "Falha ao carregar catálogo de agentes");
    } finally {
      setCarregando(false);
    }
  }, [client, tratarErro]);

  useEffect(() => {
    void carregarAgentes();
  }, [carregarAgentes]);

  const agentesFiltrados = agentes.filter(
    (a) =>
      a.nome?.toLowerCase().includes(busca.toLowerCase()) ||
      a.id.toLowerCase().includes(busca.toLowerCase()) ||
      (typeof a.descricao === "string" && a.descricao.toLowerCase().includes(busca.toLowerCase())),
  );

  return (
    <div className="flex flex-col h-full w-full p-6 md:p-8 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <Users className="text-emerald-400" size={20} />
            Quadro Executivo de Agentes de IA
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Personas autônomas com permissões de ferramentas e governança de inferência xB.
          </p>
        </div>

        <div className="relative w-full md:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou ID..."
            className="w-full pl-9 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Grid de Agentes */}
      {carregando ? (
        <div className="p-12 text-center text-xs text-zinc-500">
          Carregando catálogo de agentes governados...
        </div>
      ) : agentesFiltrados.length === 0 ? (
        <div className="p-12 text-center text-xs text-zinc-500 border border-dashed border-zinc-850 rounded-2xl">
          Nenhum agente encontrado com os critérios de busca.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agentesFiltrados.map((agente) => (
            <div
              key={agente.id}
              className="flex flex-col p-5 rounded-2xl bg-zinc-900/40 border border-zinc-850 hover:border-zinc-700/80 transition-all shadow-sm space-y-4 group"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-emerald-950/60 border border-emerald-800/40 flex items-center justify-center text-emerald-400 shadow-md">
                    <Bot size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-100">{agente.nome || agente.id}</h3>
                    <span className="text-[11px] font-mono text-zinc-500">@{agente.id}</span>
                  </div>
                </div>

                <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/40 border border-emerald-800/30 text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Ativo
                </span>
              </div>

              {typeof agente.descricao === "string" && (
                <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">
                  {agente.descricao}
                </p>
              )}

              {/* Modelo de Inferência */}
              <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400 pt-2 border-t border-zinc-850/60">
                <Cpu size={12} className="text-purple-400" />
                <span className="truncate">{agente.modelo || "openrouter/auto"}</span>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setAgenteSelecionado(agente)}
                  className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors cursor-pointer"
                >
                  <span>Ver Detalhes</span>
                  <ExternalLink size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Detalhes do Agente */}
      {agenteSelecionado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-emerald-950/60 border border-emerald-800/40 flex items-center justify-center text-emerald-400">
                  <Bot size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">
                    {agenteSelecionado.nome || agenteSelecionado.id}
                  </h3>
                  <span className="text-[11px] font-mono text-zinc-500">ID: {agenteSelecionado.id}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setAgenteSelecionado(null)}
                className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-zinc-400 font-medium block mb-1">Descrição / Instruções:</span>
                <p className="p-3 bg-zinc-950 rounded-xl border border-zinc-850 text-zinc-200 leading-relaxed">
                  {typeof agenteSelecionado.descricao === "string"
                    ? agenteSelecionado.descricao
                    : "Sem descrição declarada."}
                </p>
              </div>

              <div>
                <span className="text-zinc-400 font-medium block mb-1">Modelo de Inferência:</span>
                <div className="flex items-center gap-2 p-2.5 bg-zinc-950 rounded-xl border border-zinc-850 text-zinc-300 font-mono">
                  <Cpu size={14} className="text-purple-400" />
                  <span>{agenteSelecionado.modelo || "openrouter/auto"}</span>
                </div>
              </div>

              {agenteSelecionado.tools && agenteSelecionado.tools.length > 0 && (
                <div>
                  <span className="text-zinc-400 font-medium block mb-1">Ferramentas Habilitadas:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {agenteSelecionado.tools.map((t) => (
                      <span
                        key={t}
                        className="px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-zinc-300 flex items-center gap-1"
                      >
                        <Wrench size={10} className="text-emerald-400" />
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setAgenteSelecionado(null)}
                className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors text-xs font-semibold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
