import React, { useState, useEffect, useCallback, type FC } from "react";
import { useOpenCorp } from "../../../providers/OpenCorpProvider.js";
import { type FlowResumo } from "@opencorp/sdk";
import { showToast } from "../../../shared/ui/Toast.js";
import {
  Workflow,
  Play,
  Clock,
  Radio,
  CheckCircle2,
  RefreshCw,
  GitFork,
  ArrowRight,
  Layers,
  Sparkles,
  Zap,
} from "lucide-react";

export const FluxosView: FC = () => {
  const { client, workspaceId, tratarErro } = useOpenCorp();
  const [fluxos, setFluxos] = useState<FlowResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [executandoId, setExecutandoId] = useState<string | null>(null);

  const carregarFluxos = useCallback(async () => {
    setCarregando(true);
    try {
      const lista = await client.flows.listar({
        workspaceId: workspaceId || undefined,
      });
      setFluxos(lista || []);
    } catch (err) {
      tratarErro(err, "Falha ao carregar fluxos de automação");
    } finally {
      setCarregando(false);
    }
  }, [client, workspaceId, tratarErro]);

  useEffect(() => {
    void carregarFluxos();
  }, [carregarFluxos]);

  const dispararFluxo = async (id: string, nome?: string) => {
    setExecutandoId(id);
    try {
      await client.flows.executar(id, undefined, {
        workspaceId: workspaceId || undefined,
      });
      showToast(`Fluxo "${nome || id}" disparado com sucesso!`, "sucesso");
    } catch (err) {
      tratarErro(err, "Falha ao executar fluxo");
    } finally {
      setExecutandoId(null);
    }
  };

  const formatarGatilhos = (gatilhos?: any[]): string => {
    if (!Array.isArray(gatilhos) || gatilhos.length === 0) {
      return "Disparo manual";
    }
    return gatilhos
      .map((g) => {
        if (typeof g === "string") return g;
        if (g && typeof g === "object") {
          const tipo = g.tipo || "gatilho";
          const detalhe = g.detalhe ? ` (${g.detalhe})` : "";
          return `${tipo}${detalhe}`;
        }
        return String(g);
      })
      .join(", ");
  };

  return (
    <div className="flex flex-col h-full w-full p-4 sm:p-6 md:p-8 space-y-6 overflow-y-auto select-none">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <Workflow className="text-emerald-400" size={20} />
            Orquestrador de Fluxos Declarativos (DAG)
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Pipelines autônomos orquestrados no workspace <span className="font-mono text-emerald-400 font-semibold">{workspaceId || "yt-factory-01"}</span>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={carregarFluxos}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 text-xs text-zinc-300 transition-colors cursor-pointer"
          >
            <RefreshCw size={13} className={carregando ? "animate-spin" : ""} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Grid de Fluxos */}
      {carregando ? (
        <div className="p-12 text-center text-xs text-zinc-500">
          <RefreshCw size={18} className="animate-spin mx-auto mb-2 text-emerald-400" />
          <span>Consultando fluxos do workspace...</span>
        </div>
      ) : fluxos.length === 0 ? (
        <div className="p-12 text-center text-xs text-zinc-500 border border-dashed border-zinc-850 rounded-2xl space-y-2">
          <Workflow size={24} className="mx-auto text-zinc-600" />
          <p>Nenhum fluxo configurado no workspace ativo.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
            <span>Pipelines Registrados ({fluxos.length})</span>
            <span className="font-mono text-[11px] text-zinc-500">Engine: DAG OpenCorp v0.7</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {fluxos.map((fluxo: any) => {
              const isEmExecucao = executandoId === fluxo.id;
              const descricao = typeof fluxo.descricao === "string" ? fluxo.descricao : null;
              const gatilhoTexto = formatarGatilhos(fluxo.gatilhos);
              const qtdNos = typeof fluxo.nos === "number" ? fluxo.nos : Array.isArray(fluxo.nos) ? fluxo.nos.length : 0;
              const qtdArestas = typeof fluxo.arestas === "number" ? fluxo.arestas : Array.isArray(fluxo.arestas) ? fluxo.arestas.length : 0;
              const ativo = fluxo.ativo !== false;

              return (
                <div
                  key={fluxo.id}
                  className="flex flex-col p-5 rounded-2xl bg-zinc-900/40 border border-zinc-850 hover:border-zinc-700/80 transition-all shadow-sm space-y-4 justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-emerald-950/60 border border-emerald-800/40 flex items-center justify-center text-emerald-400 shadow-md">
                          <GitFork size={20} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-zinc-100 truncate">
                            {fluxo.nome || fluxo.id}
                          </h3>
                          <span className="text-[10px] font-mono text-zinc-500 truncate block">
                            {fluxo.id}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                          ativo
                            ? "bg-emerald-950/40 border-emerald-800/40 text-emerald-300"
                            : "bg-zinc-800 border-zinc-700 text-zinc-400"
                        }`}
                      >
                        {ativo ? "Ativo" : "Inativo"}
                      </span>
                    </div>

                    {descricao && (
                      <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                        {descricao}
                      </p>
                    )}

                    <div className="flex items-center gap-3 text-[11px] text-zinc-500 font-mono pt-1">
                      <span className="flex items-center gap-1">
                        <Layers size={12} className="text-zinc-400" />
                        <span>{qtdNos} nós</span>
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <GitFork size={12} className="text-zinc-400" />
                        <span>{qtdArestas} arestas</span>
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-zinc-850/60 flex items-center justify-between text-[11px] text-zinc-400">
                    <span className="flex items-center gap-1.5 font-mono truncate max-w-[160px] sm:max-w-[180px]" title={gatilhoTexto}>
                      <Clock size={12} className="text-zinc-500 shrink-0" />
                      <span className="truncate">{gatilhoTexto}</span>
                    </span>

                    <button
                      type="button"
                      disabled={isEmExecucao}
                      onClick={() => dispararFluxo(fluxo.id, fluxo.nome)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold transition-all shadow-sm cursor-pointer"
                    >
                      <Play size={11} className={isEmExecucao ? "animate-spin" : ""} />
                      <span>{isEmExecucao ? "Disparando..." : "Executar"}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
