import React, { useState, useEffect, useCallback, type FC } from "react";
import { Wrench, RefreshCw, ShieldAlert, CheckCircle2 } from "lucide-react";
import { useOpenCorp } from "../../../../providers/OpenCorpProvider.js";
import type { ToolItem } from "../../types.js";

export const TabSkillsTools: FC = () => {
  const { client } = useOpenCorp();
  const [toolsLista, setToolsLista] = useState<ToolItem[]>([]);
  const [carregando, setCarregando] = useState(false);

  const carregarTools = useCallback(async () => {
    setCarregando(true);
    try {
      const data = await client.http.get<ToolItem[]>("/tools");
      setToolsLista(Array.isArray(data) ? data : []);
    } catch {
      setToolsLista([]);
    } finally {
      setCarregando(false);
    }
  }, [client]);

  useEffect(() => {
    void carregarTools();
  }, [carregarTools]);

  return (
    <div className="space-y-6 bg-transparent">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-800 gap-3">
        <div>
          <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
            <Wrench size={16} className="text-orange-400" />
            Catálogo de Ferramentas & Integrações (Tools)
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Ferramentas e MCPs disponíveis em <code className="text-zinc-300 font-mono">.opencorp/tools/</code> com especificações e níveis de permissão.
          </p>
        </div>
        <button
          type="button"
          disabled={carregando}
          onClick={carregarTools}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-850 text-zinc-300 border border-zinc-800 text-xs font-medium transition-colors cursor-pointer self-start sm:self-center"
        >
          <RefreshCw size={13} className={carregando ? "animate-spin" : ""} />
          <span>Atualizar</span>
        </button>
      </div>

      <div className="divide-y divide-zinc-850/60 border border-zinc-850 rounded-xl bg-zinc-900/30 overflow-hidden">
        {toolsLista.map((tool, idx) => {
          const nome = tool.name || tool.nome || tool.id || `tool-${idx}`;
          const desc = tool.description || tool.descricao || "Sem descrição declarada.";
          const escopo = tool.scope || tool.escopo || "global";
          const ativa = tool.enabled ?? tool.ativo ?? true;

          return (
            <div
              key={tool.id || idx}
              className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-900/50 transition-colors"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-zinc-100 font-mono">
                    {nome}
                  </span>
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded border text-zinc-400 bg-zinc-850 border-zinc-750 uppercase">
                    {escopo}
                  </span>
                  {tool.requiresApproval && (
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded border text-amber-400 bg-amber-950/40 border-amber-800/40 font-bold flex items-center gap-1">
                      <ShieldAlert size={10} /> requer aprovação humana
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">{desc}</p>
                {tool.parameters && Object.keys(tool.parameters).length > 0 && (
                  <div className="text-[10px] font-mono text-zinc-500 pt-0.5">
                    Parâmetros: {Object.keys(tool.parameters).join(", ")}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold flex items-center gap-1 ${
                    ativa
                      ? "text-emerald-400 bg-emerald-950/40 border-emerald-800/40"
                      : "text-zinc-500 bg-zinc-900 border-zinc-800"
                  }`}
                >
                  <CheckCircle2 size={11} />
                  {ativa ? "Ativa" : "Desativada"}
                </span>
              </div>
            </div>
          );
        })}

        {toolsLista.length === 0 && !carregando && (
          <div className="py-8 text-center text-xs text-zinc-500">
            Nenhuma ferramenta customizada encontrada em <code className="font-mono">.opencorp/tools/</code>
          </div>
        )}
      </div>
    </div>
  );
};
