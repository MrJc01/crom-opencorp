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
} from "lucide-react";

export const FluxosView: FC = () => {
  const { client, tratarErro } = useOpenCorp();
  const [fluxos, setFluxos] = useState<FlowResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [executandoId, setExecutandoId] = useState<string | null>(null);

  const carregarFluxos = useCallback(async () => {
    setCarregando(true);
    try {
      const lista = await client.flows.listar();
      setFluxos(lista || []);
    } catch (err) {
      tratarErro(err, "Falha ao carregar fluxos de automação");
    } finally {
      setCarregando(false);
    }
  }, [client, tratarErro]);

  useEffect(() => {
    void carregarFluxos();
  }, [carregarFluxos]);

  const dispararFluxo = async (id: string, nome?: string) => {
    setExecutandoId(id);
    try {
      await client.flows.executar(id);
      showToast(`Fluxo "${nome || id}" disparado com sucesso`, "sucesso");
    } catch (err) {
      tratarErro(err, "Falha ao executar fluxo");
    } finally {
      setExecutandoId(null);
    }
  };

  return (
    <div className="flex flex-col h-full w-full p-6 md:p-8 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <Workflow className="text-emerald-400" size={20} />
            Orquestrador de Fluxos Declarativos (n8n-style)
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Pipelines autônomos baseados em grafos acíclicos dirigidos (DAG) acionados por eventos ou agendamentos cron.
          </p>
        </div>

        <button
          type="button"
          onClick={carregarFluxos}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 text-xs text-zinc-300 transition-colors cursor-pointer self-start md:self-auto"
        >
          <RefreshCw size={13} className={carregando ? "animate-spin" : ""} />
          <span>Atualizar</span>
        </button>
      </div>

      {/* Grid de Fluxos */}
      {carregando ? (
        <div className="p-12 text-center text-xs text-zinc-500">
          Carregando fluxos cadastrados...
        </div>
      ) : fluxos.length === 0 ? (
        <div className="p-12 text-center text-xs text-zinc-500 border border-dashed border-zinc-850 rounded-2xl">
          Nenhum fluxo configurado no workspace ativo.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {fluxos.map((fluxo) => {
            const isEmExecucao = executandoId === fluxo.id;
            const descricao = typeof fluxo.descricao === "string" ? fluxo.descricao : null;
            const gatilhoInfo =
              Array.isArray(fluxo.gatilhos) && fluxo.gatilhos.length > 0
                ? fluxo.gatilhos.join(", ")
                : "Disparo manual";

            return (
              <div
                key={fluxo.id}
                className="flex flex-col p-5 rounded-2xl bg-zinc-900/40 border border-zinc-850 hover:border-zinc-700/80 transition-all shadow-sm space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-emerald-950/60 border border-emerald-800/40 flex items-center justify-center text-emerald-400 shadow-md">
                      <GitFork size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-100">{fluxo.nome || fluxo.id}</h3>
                      <span className="text-[11px] font-mono text-zinc-500">ID: {fluxo.id}</span>
                    </div>
                  </div>

                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/40 border border-emerald-800/30 text-emerald-300">
                    Ativo
                  </span>
                </div>

                {descricao && (
                  <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                    {descricao}
                  </p>
                )}

                <div className="pt-2 border-t border-zinc-850/60 flex items-center justify-between text-[11px] text-zinc-400">
                  <span className="flex items-center gap-1 font-mono">
                    <Clock size={11} className="text-zinc-500" />
                    {gatilhoInfo}
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
      )}
    </div>
  );
};
