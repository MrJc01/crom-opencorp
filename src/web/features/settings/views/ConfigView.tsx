import React, { useState, useEffect, useCallback, type FC } from "react";
import { useOpenCorp } from "../../../providers/OpenCorpProvider.js";
import { showToast } from "../../../shared/ui/Toast.js";
import {
  Settings,
  Cpu,
  Key,
  Activity,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Server,
  Zap,
} from "lucide-react";

export const ConfigView: FC = () => {
  const { client, tratarErro } = useOpenCorp();
  const [abaAtiva, setAbaAtiva] = useState<"motores" | "saude" | "governanca">("motores");
  const [saudeStatus, setSaudeStatus] = useState<Record<string, unknown> | null>(null);
  const [carregando, setCarregando] = useState(false);

  // Form states simulados de credenciais
  const [openRouterKey, setOpenRouterKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");

  const carregarDiagnostico = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await client.system.getHealth();
      setSaudeStatus(res);
    } catch (err) {
      tratarErro(err, "Falha ao consultar saúde do sistema");
    } finally {
      setCarregando(false);
    }
  }, [client, tratarErro]);

  useEffect(() => {
    if (abaAtiva === "saude") {
      void carregarDiagnostico();
    }
  }, [abaAtiva, carregarDiagnostico]);

  const salvarChaves = (e: React.FormEvent) => {
    e.preventDefault();
    showToast("Configurações salvas e aplicadas com sucesso", "sucesso");
  };

  return (
    <div className="flex flex-col h-full w-full p-6 md:p-8 space-y-6 overflow-y-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
          <Settings className="text-emerald-400" size={20} />
          Painel de Configurações & Governança
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Parâmetros de inferência, chaves dos motores e diagnóstico dos daemons OpenCorp.
        </p>
      </div>

      {/* Abas */}
      <div className="flex items-center gap-2 border-b border-zinc-850 pb-3">
        <button
          type="button"
          onClick={() => setAbaAtiva("motores")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
            abaAtiva === "motores"
              ? "bg-zinc-800 text-zinc-100 font-semibold shadow-sm"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Cpu size={14} className="text-purple-400" />
          <span>Motores & Chaves</span>
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva("governanca")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
            abaAtiva === "governanca"
              ? "bg-zinc-800 text-zinc-100 font-semibold shadow-sm"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <ShieldCheck size={14} className="text-emerald-400" />
          <span>Governança xB</span>
        </button>

        <button
          type="button"
          onClick={() => setAbaAtiva("saude")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
            abaAtiva === "saude"
              ? "bg-zinc-800 text-zinc-100 font-semibold shadow-sm"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Activity size={14} className="text-blue-400" />
          <span>Diagnóstico & Saúde</span>
        </button>
      </div>

      {/* Conteúdo das Abas */}
      {abaAtiva === "motores" && (
        <form onSubmit={salvarChaves} className="max-w-2xl space-y-4">
          <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-850 space-y-4">
            <h3 className="text-xs font-bold text-zinc-200 flex items-center gap-2">
              <Key size={14} className="text-emerald-400" />
              Chaves de API dos Motores de IA
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-400 font-medium mb-1">
                  OpenRouter API Key (Padrão de Rota Global)
                </label>
                <input
                  type="password"
                  value={openRouterKey}
                  onChange={(e) => setOpenRouterKey(e.target.value)}
                  placeholder="sk-or-v1-..."
                  className="w-full px-3.5 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-medium mb-1">
                  Google Gemini API Key
                </label>
                <input
                  type="password"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full px-3.5 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
            >
              Salvar Alterações
            </button>
          </div>
        </form>
      )}

      {abaAtiva === "governanca" && (
        <div className="max-w-3xl space-y-4">
          <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-850 space-y-3">
            <h3 className="text-xs font-bold text-zinc-100 flex items-center gap-2">
              <ShieldCheck size={16} className="text-emerald-400" />
              Diretrizes de Dimensionamento xB (AGENTS.md)
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              O OpenCorp aplica estritamente a segregação de modelos para balancear custo e precisão cognitiva:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1 text-xs">
                <span className="font-semibold text-emerald-400 block">&lt; 14B</span>
                <span className="text-zinc-200 font-medium block">Mini-Agentes</span>
                <span className="text-[11px] text-zinc-500">Validações determinísticas, checagem e formatação simples.</span>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1 text-xs">
                <span className="font-semibold text-blue-400 block">14B a 35B</span>
                <span className="text-zinc-200 font-medium block">Redatores</span>
                <span className="text-[11px] text-zinc-500">Geração de roteiros, resumos analíticos e títulos.</span>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1 text-xs">
                <span className="font-semibold text-purple-400 block">&gt; 70B & Flagship</span>
                <span className="text-zinc-200 font-medium block">Secretário Executivo</span>
                <span className="text-[11px] text-zinc-500">Orquestração, Chain of Thought, diagnóstico e curadoria.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {abaAtiva === "saude" && (
        <div className="max-w-2xl space-y-4">
          <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-850 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server size={16} className="text-blue-400" />
                <h3 className="text-xs font-bold text-zinc-200">Diagnóstico do Servidor</h3>
              </div>

              <button
                type="button"
                onClick={carregarDiagnostico}
                className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 font-medium cursor-pointer"
              >
                <RefreshCw size={12} className={carregando ? "animate-spin" : ""} />
                <span>Atualizar</span>
              </button>
            </div>

            <div className="p-4 bg-zinc-950 rounded-xl border border-zinc-800 font-mono text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
              {saudeStatus
                ? JSON.stringify(saudeStatus, null, 2)
                : "Consultando endpoint /health..."}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
