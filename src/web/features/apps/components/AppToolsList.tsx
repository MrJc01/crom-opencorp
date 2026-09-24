import React, { useState, useEffect, useCallback, type FC } from "react";
import { Wrench, X, ShieldAlert, CheckCircle2, Code2, RefreshCw } from "lucide-react";
import { useOpenCorp } from "../../../providers/OpenCorpProvider.js";
import type { MiniApp } from "../types.js";

export interface AppToolsListProps {
  aberto: boolean;
  app: MiniApp | null;
  onClose: () => void;
}

export const AppToolsList: FC<AppToolsListProps> = ({
  aberto,
  app,
  onClose,
}) => {
  const { client } = useOpenCorp();
  const [tools, setTools] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(false);

  const carregarTools = useCallback(async () => {
    if (!app) return;
    setCarregando(true);
    try {
      const data = await client.http.get<any[]>("/tools");
      const todas = Array.isArray(data) ? data : [];
      // Filtra por ferramentas associadas ao app ou matching pelo id
      const associadas = todas.filter((t: any) => {
        const tId = t.id || t.name || t.nome || "";
        if (app.tools && app.tools.includes(tId)) return true;
        if (tId.startsWith(app.id) || tId.includes(app.id)) return true;
        if (app.mcpServer && (t.mcpServer === app.mcpServer || t.server === app.mcpServer)) return true;
        return false;
      });

      setTools(associadas.length > 0 ? associadas : todas.slice(0, 8));
    } catch {
      setTools([]);
    } finally {
      setCarregando(false);
    }
  }, [client, app]);

  useEffect(() => {
    if (aberto && app) {
      void carregarTools();
    }
  }, [aberto, app, carregarTools]);

  if (!aberto || !app) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-xl rounded-2xl bg-zinc-950 border border-zinc-850 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Topo do Modal */}
        <div className="p-4 border-b border-zinc-850 flex items-center justify-between shrink-0 bg-zinc-900/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-orange-600/10 border border-orange-500/20 text-orange-400">
              <Wrench size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-100">
                Ferramentas MCP &amp; Capabilities: {app.titulo}
              </h3>
              <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
                {tools.length} ferramentas expostas para os agentes autônomos
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={carregando}
              onClick={carregarTools}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850 transition-colors cursor-pointer"
              title="Recarregar ferramentas"
            >
              <RefreshCw size={13} className={carregando ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850 transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Lista de Ferramentas */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1 scrollbar-thin">
          {tools.map((t, idx) => {
            const spec = t.spec || {};
            const nome = spec.titulo || t.name || t.nome || t.id || `tool-${idx}`;
            const desc = spec.descricao || t.description || t.descricao || "Sem descrição.";
            const requerAprovacao = spec.approval === "sempre" || t.requiresApproval || false;
            const schemaProps = spec.inputSchema?.properties || t.parameters || {};
            const paramKeys = Object.keys(schemaProps);

            return (
              <div
                key={t.id || idx}
                className="p-3.5 rounded-xl border border-zinc-850 bg-zinc-900/40 space-y-2 hover:bg-zinc-900/70 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-orange-400 font-mono">
                      {nome}
                    </span>
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded border bg-zinc-950 text-zinc-400 border-zinc-800">
                      {t.id || t.scope || "mcp"}
                    </span>
                  </div>

                  {requerAprovacao ? (
                    <span className="text-[9px] font-mono text-amber-400 bg-amber-950/40 border border-amber-800/40 px-1.5 py-0.2 rounded font-bold flex items-center gap-1">
                      <ShieldAlert size={10} /> aprovação obrigatória
                    </span>
                  ) : (
                    <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-1.5 py-0.2 rounded font-bold flex items-center gap-1">
                      <CheckCircle2 size={10} /> execução livre
                    </span>
                  )}
                </div>

                <p className="text-xs text-zinc-300 leading-relaxed">{desc}</p>

                {paramKeys.length > 0 && (
                  <div className="pt-1.5 border-t border-zinc-800/40 text-[10px] font-mono text-zinc-500">
                    Parâmetros: {paramKeys.join(", ")}
                  </div>
                )}
              </div>
            );
          })}

          {tools.length === 0 && !carregando && (
            <div className="py-8 text-center text-xs text-zinc-500 border border-dashed border-zinc-850 rounded-xl">
              Nenhuma ferramenta declarada para este app ou servidor MCP.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
