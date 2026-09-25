import React, { useState, useEffect, useCallback, type FC } from "react";
import {
  Cpu,
  Play,
  Bot,
  Check,
  AlertCircle,
  Save,
  Loader2,
  Layers,
  Sparkles,
  Zap,
} from "lucide-react";
import { showToast } from "../../../../shared/ui/Toast.js";
import { useOpenCorp } from "../../../../providers/OpenCorpProvider.js";
import type { EntradaSettingsRow } from "../../types.js";
import { ModelPicker } from "../../../../shared/ui/ModelPicker.js";

export interface TabModelsProps {
  todasEntradas?: EntradaSettingsRow[];
  onSalvarChave?: (chave: string, valor: unknown) => Promise<void>;
  salvando?: boolean;
  escopoConfig?: "global" | "workspace";
}

const MODELOS_AGENTES = [
  "opencode/nemotron-3.5-lightning-free",
  "opencode/nemotron-3-ultra-free",
  "opencode/mimo-v2.6-flash-free",
  "opencode/ling-3.0-flash-fin-free",
  "opencode/muse-spark-1.3-contributor-free",
  "openrouter/nvidia/nemotron-3-super-120b-a12b:free",
  "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
  "openrouter/qwen/qwen3.8-27b:free",
  "openrouter/google/gemma-4-31b-it:free",
  "openrouter/z-ai/glm-5.2:free",
  "openrouter/cohere/north-mini-code:free",
  "openrouter/thinkingmachines/inkling:free",
];

export const TabModels: FC<TabModelsProps> = ({ escopoConfig = "workspace" }) => {
  const { client, tratarErro } = useOpenCorp();
  const [escopoAtivo, setEscopoAtivo] = useState<"global" | "workspace">(escopoConfig);
  const [modeloPrincipal, setModeloPrincipal] = useState(MODELOS_AGENTES[0]!);
  const [ordemFallback, setOrdemFallback] = useState<string[]>(MODELOS_AGENTES);
  const [acessoTotalGlobal, setAcessoTotalGlobal] = useState(false);
  const [aplicandoEmTodos, setAplicandoEmTodos] = useState(false);
  const [testandoModelo, setTestandoModelo] = useState<string | null>(null);
  const [resultadoTeste, setResultadoTeste] = useState<Record<string, any>>({});
  const [salvandoLocal, setSalvandoLocal] = useState(false);

  useEffect(() => {
    if (escopoConfig) {
      setEscopoAtivo(escopoConfig);
    }
  }, [escopoConfig]);

  const carregarModelos = useCallback(async () => {
    try {
      const query = escopoAtivo === "global" ? "?escopo=global" : "?escopo=workspace";
      const mod = await client.http.get<any>(`/settings/modelos${query}`);
      if (mod) {
        if (mod.default_model) setModeloPrincipal(mod.default_model);
        if (Array.isArray(mod.rotation)) setOrdemFallback(mod.rotation);
        if (mod.global_full_access !== undefined)
          setAcessoTotalGlobal(Boolean(mod.global_full_access));
      }
    } catch (err: unknown) {
      tratarErro(err, "Falha ao carregar configurações de modelos");
    }
  }, [client, escopoAtivo, tratarErro]);

  const salvarModelos = async () => {
    setSalvandoLocal(true);
    try {
      const modFinal = modeloPrincipal.trim();

      if (!modFinal) {
        showToast("Informe um modelo válido", "aviso");
        return;
      }

      const listaFallback = ordemFallback.map((modelo) => modelo.trim()).filter(Boolean);

      const res = await client.http.put<any>("/settings/modelos", {
        default_model: modFinal,
        rotation: listaFallback,
        global_full_access: acessoTotalGlobal,
        escopo: escopoAtivo,
      });

      if (!res?.ok && res?.erro) {
        throw new Error(res.erro || "Falha ao salvar modelos");
      }

      showToast(
        `Configurações de modelos salvas no escopo ${escopoAtivo === "global" ? "Global" : "Workspace"}!`,
        "sucesso"
      );
      await carregarModelos();
    } catch (err: unknown) {
      tratarErro(err, "Erro ao salvar modelos");
    } finally {
      setSalvandoLocal(false);
    }
  };

  const aplicarModeloEmTodos = async () => {
    const modFinal = modeloPrincipal.trim();

    if (
      !confirm(
        `Definir "${modFinal}" como modelo ativo para TODOS os agentes deste workspace?`
      )
    )
      return;

    setAplicandoEmTodos(true);
    try {
      const res = await client.http.post<any>("/agents/aplicar-modelo-global", {
        model: modFinal,
      });
      showToast(
        `${res.alterados || 0} agentes atualizados para "${modFinal}"!`,
        "sucesso"
      );
    } catch (err: unknown) {
      tratarErro(err, "Erro ao aplicar modelo nos agentes");
    } finally {
      setAplicandoEmTodos(false);
    }
  };

  const testarConexaoModelo = async (model: string) => {
    setTestandoModelo(model);
    try {
      const res = await client.http.post<any>("/llm/test", { model });
      setResultadoTeste((prev) => ({ ...prev, [model]: res }));
      if (res.ok) {
        showToast(
          `Modelo respondendo com sucesso (${res.ms || 0}ms)! ${
            res.is_byok ? "• BYOK Custo $0" : ""
          }`,
          "sucesso"
        );
      } else {
        showToast(`Falha no teste: ${res.error || "Erro na API"}`, "erro");
      }
    } catch (err: unknown) {
      setResultadoTeste((prev) => ({
        ...prev,
        [model]: { ok: false, error: String(err) },
      }));
      tratarErro(err, "Erro ao testar conexão com o modelo");
    } finally {
      setTestandoModelo(null);
    }
  };

  useEffect(() => {
    void carregarModelos();
  }, [carregarModelos]);

  return (
    <div className="space-y-6 bg-transparent">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-800 gap-3">
        <div>
          <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
            <Cpu size={16} className="text-cyan-400" />
            Modelo Padrão e Rotação Automática de Contingência
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Defina a inteligência primária do sistema e a ordem de revezamento em caso de 429, cota esgotada ou instabilidade.
          </p>
        </div>

        {/* Seletor de Escopo Workspace vs Global */}
        <div className="flex items-center gap-1 bg-zinc-900/80 p-1 rounded-lg border border-zinc-800 text-xs shrink-0 self-start sm:self-center">
          <button
            type="button"
            onClick={() => setEscopoAtivo("workspace")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
              escopoAtivo === "workspace"
                ? "bg-purple-950/60 text-purple-300 border border-purple-800/60 font-semibold shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Layers size={12} />
            <span>Workspace Ativo</span>
          </button>
          <button
            type="button"
            onClick={() => setEscopoAtivo("global")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
              escopoAtivo === "global"
                ? "bg-cyan-950/60 text-cyan-300 border border-cyan-800/60 font-semibold shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Sparkles size={12} />
            <span>Global (Padrão)</span>
          </button>
        </div>
      </div>

      {/* SELEÇÃO DO MODELO PRINCIPAL */}
      <div className="space-y-3 py-2 border-b border-zinc-850">
        <div>
          <label className="block text-xs font-semibold text-zinc-200 mb-1">
            Modelo Principal do Workspace
          </label>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <ModelPicker className="flex-1" value={modeloPrincipal} onChange={setModeloPrincipal} />

            <button
              type="button"
              disabled={testandoModelo !== null}
              onClick={() => {
                void testarConexaoModelo(modeloPrincipal);
              }}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-850 text-zinc-200 border border-zinc-800 text-xs font-medium transition-colors cursor-pointer shrink-0 disabled:opacity-50"
            >
              {testandoModelo ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Play size={13} className="text-emerald-400" />
              )}
              <span>Testar Ping</span>
            </button>

            <button
              type="button"
              disabled={aplicandoEmTodos}
              onClick={aplicarModeloEmTodos}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 text-xs font-semibold transition-colors cursor-pointer shrink-0 disabled:opacity-50"
              title="Atribuir este modelo a todos os agentes cadastrados"
            >
              {aplicandoEmTodos ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Bot size={13} />
              )}
              <span>Aplicar em Todos</span>
            </button>
          </div>
        </div>

        {/* FEEDBACK DO TESTE */}
        {resultadoTeste[modeloPrincipal] && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
              resultadoTeste[modeloPrincipal].ok
                ? "bg-emerald-950/30 border-emerald-800/40 text-emerald-300"
                : "bg-rose-950/30 border-rose-800/40 text-rose-300"
            }`}
          >
            <div className="flex items-center gap-2">
              {resultadoTeste[modeloPrincipal].ok ? (
                <Check size={14} className="text-emerald-400" />
              ) : (
                <AlertCircle size={14} className="text-rose-400" />
              )}
              <span className="font-semibold">
                {resultadoTeste[modeloPrincipal].ok
                  ? `Modelo online! Latência: ${resultadoTeste[modeloPrincipal].ms || 0}ms`
                  : `Erro: ${resultadoTeste[modeloPrincipal].error}`}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ROTAÇÃO DE CONTINGÊNCIA (FALLBACK LIST) */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-zinc-200">
          Ordem de Contingência & Fallbacks (1 modelo por linha)
        </label>
        <p className="text-[11px] text-zinc-400 leading-relaxed">
          Se o modelo principal responder com HTTP 429 (Rate Limit) ou falha de inferência, o motor rotacionará automaticamente seguindo esta hierarquia exata.
        </p>
        <ModelPicker value={ordemFallback} onChange={setOrdemFallback} multiple />
      </div>

      {/* GOVERNANÇA DE TIERS xB */}
      <div className="space-y-3 pt-2">
        <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider block">
          Diretrizes de Alocação de Parâmetros xB
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-zinc-900/30 border border-zinc-850 space-y-1">
            <span className="text-cyan-400 font-bold block font-mono">Mini-Agentes (&lt; 14B)</span>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Deduplicação de listas, checagem de estoque e extração determinística.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-900/30 border border-zinc-850 space-y-1">
            <span className="text-emerald-400 font-bold block font-mono">Redatores (14B a 35B)</span>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Roteiros do YouTube, resumos analíticos e geração de títulos magnéticos.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-900/30 border border-zinc-850 space-y-1">
            <span className="text-purple-400 font-bold block font-mono">Raciocínio (&gt; 70B &amp; Ultra)</span>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Secretário Executivo, curadoria investigativa e diagnóstico SRE.
            </p>
          </div>
        </div>
      </div>

      <div className="pt-2 flex justify-end">
        <button
          type="button"
          disabled={salvandoLocal}
          onClick={salvarModelos}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 shadow-sm"
        >
          {salvandoLocal ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Save size={13} />
          )}
          <span>Salvar Modelos & Contingência</span>
        </button>
      </div>
    </div>
  );
};
