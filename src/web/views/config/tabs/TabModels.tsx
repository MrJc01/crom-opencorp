import { type Component, createSignal, onMount, Show, type Accessor } from "solid-js";
import { Cpu, Play, Bot, Check, CircleAlert, Save } from "lucide-solid";
import { Button } from "../../../ui/Button";
import { SettingRow } from "../SettingRow";
import { showToast } from "../../../ui/Toast";
import { fetchApi } from "../../../lib/context";
import { type EntradaSettingsRow } from "./types";

export interface TabModelsProps {
  todasEntradas?: Accessor<EntradaSettingsRow[]>;
  onSalvarChave?: (chave: string, valor: unknown) => Promise<void>;
  salvando?: Accessor<boolean>;
}

export const TabModels: Component<TabModelsProps> = (props) => {
  const [modeloPrincipal, setModeloPrincipal] = createSignal("openrouter/google/gemini-3.8-flash");
  const [modeloCustomizado, setModeloCustomizado] = createSignal("");
  const [ordemFallback, setOrdemFallback] = createSignal(
    "openrouter/google/gemini-3.8-flash\nopenrouter/nvidia/nemotron-3.5-lightning:free\nopenrouter/nvidia/nemotron-3-ultra-550b-a55b:free\nopenrouter/minimax/minimax-m3:free"
  );
  const [acessoTotalGlobal, setAcessoTotalGlobal] = createSignal(false);
  const [aplicandoEmTodos, setAplicandoEmTodos] = createSignal(false);
  const [testandoModelo, setTestandoModelo] = createSignal<string | null>(null);
  const [resultadoTeste, setResultadoTeste] = createSignal<Record<string, any>>({});
  const [salvandoLocal, setSalvandoLocal] = createSignal(false);

  const carregarModelos = async () => {
    try {
      const mod = await fetchApi<any>("/settings/modelos");
      if (mod) {
        if (mod.default_model) setModeloPrincipal(mod.default_model);
        if (Array.isArray(mod.rotation)) setOrdemFallback(mod.rotation.join("\n"));
        if (mod.global_full_access !== undefined) setAcessoTotalGlobal(Boolean(mod.global_full_access));
      }
    } catch {}
  };

  const salvarModelos = async () => {
    setSalvandoLocal(true);
    try {
      const modFinal = modeloPrincipal() === "__custom__" ? modeloCustomizado().trim() : modeloPrincipal().trim();
      if (!modFinal) {
        showToast("Informe um modelo válido", "aviso");
        return;
      }

      const listaFallback = ordemFallback()
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      await fetchApi("/settings/modelos", {
        method: "PUT",
        body: JSON.stringify({
          default_model: modFinal,
          rotation: listaFallback,
          global_full_access: acessoTotalGlobal(),
        }),
      });

      showToast("Configurações de modelos salvas com sucesso!", "sucesso");
      await carregarModelos();
    } catch (err: any) {
      showToast("Erro ao salvar modelos: " + err.message, "erro");
    } finally {
      setSalvandoLocal(false);
    }
  };

  const aplicarModeloEmTodos = async () => {
    const modFinal = modeloPrincipal() === "__custom__" ? modeloCustomizado().trim() : modeloPrincipal().trim();
    if (!confirm(`Definir "${modFinal}" como modelo ativo para TODOS os agentes deste workspace?`)) return;

    setAplicandoEmTodos(true);
    try {
      const res = await fetchApi<any>("/agents/aplicar-modelo-global", {
        method: "POST",
        body: JSON.stringify({ model: modFinal }),
      });
      showToast(`${res.alterados || 0} agentes atualizados para "${modFinal}"!`, "sucesso");
    } catch (err: any) {
      showToast("Erro ao aplicar nos agentes: " + err.message, "erro");
    } finally {
      setAplicandoEmTodos(false);
    }
  };

  const testarConexaoModelo = async (model: string) => {
    setTestandoModelo(model);
    try {
      const res = await fetchApi<any>("/llm/test", {
        method: "POST",
        body: JSON.stringify({ model }),
      });
      setResultadoTeste((prev) => ({ ...prev, [model]: res }));
      if (res.ok) {
        showToast(`Modelo respondendo com sucesso (${res.ms}ms)! ${res.is_byok ? "• BYOK Custo $0" : ""}`, "sucesso");
      } else {
        showToast(`Falha no teste: ${res.error || "Erro na API"}`, "erro");
      }
    } catch (err: any) {
      setResultadoTeste((prev) => ({ ...prev, [model]: { ok: false, error: err.message } }));
      showToast(`Erro ao testar: ${err.message}`, "erro");
    } finally {
      setTestandoModelo(null);
    }
  };

  onMount(() => {
    void carregarModelos();
  });

  return (
    <div class="space-y-6 bg-transparent">
      <div class="pb-1 border-b border-zinc-800/40">
        <h2 class="text-sm font-semibold text-zinc-100 flex items-center gap-2">
          <Cpu size={15} class="text-zinc-400" />
          Modelo Padrão e Rotação Automática de Contingência
        </h2>
        <p class="text-xs text-zinc-400 mt-0.5">
          Defina a inteligência primária do sistema e a ordem de rotação em caso de 429 ou cota esgotada.
        </p>
      </div>

      {/* SELEÇÃO DO MODELO PRINCIPAL */}
      <div class="space-y-3 py-2 border-b border-zinc-800/40">
        <div>
          <label class="block text-xs font-semibold text-zinc-200 mb-1">Modelo Principal do Workspace</label>
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <select
              value={
                [
                  "openrouter/google/gemini-3.8-flash",
                  "openrouter/nvidia/nemotron-3.5-lightning:free",
                  "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
                  "openrouter/minimax/minimax-m3:free",
                  "openrouter/anthropic/claude-3.5-haiku",
                  "opencode-go/glm-5.3-flash",
                ].includes(modeloPrincipal())
                  ? modeloPrincipal()
                  : "__custom__"
              }
              onChange={(e) => {
                const v = e.currentTarget.value;
                if (v === "__custom__") {
                  if (!modeloCustomizado()) setModeloCustomizado(modeloPrincipal());
                  setModeloPrincipal("__custom__");
                } else {
                  setModeloPrincipal(v);
                }
              }}
              class="flex-1 bg-zinc-900/80 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 font-medium focus:outline-none focus:border-zinc-600 cursor-pointer"
            >
              <option value="openrouter/google/gemini-3.8-flash">
                Google Gemini 3.8 Flash (BYOK Google AI Studio • Custo $0) — Recomendado
              </option>
              <option value="openrouter/nvidia/nemotron-3.5-lightning:free">
                NVIDIA Nemotron 3.5 Lightning (Gratuito / Rápido)
              </option>
              <option value="openrouter/nvidia/nemotron-3-ultra-550b-a55b:free">
                NVIDIA Nemotron 3 Ultra 550B (Gratuito / Alta Capacidade)
              </option>
              <option value="openrouter/minimax/minimax-m3:free">MiniMax M3 (Gratuito)</option>
              <option value="openrouter/anthropic/claude-3.5-haiku">Anthropic Claude 3.5 Haiku</option>
              <option value="opencode-go/glm-5.3-flash">OpenCode-Go GLM 5.3 Flash</option>
              <option value="__custom__">Outro / Personalizado (Digitar)</option>
            </select>

            <Button
              size="xs"
              variant="secondary"
              loading={testandoModelo() === modeloPrincipal()}
              onClick={() => testarConexaoModelo(modeloPrincipal())}
            >
              <Play size={11} class="mr-1 text-zinc-400" /> Testar Modelo
            </Button>
          </div>

          <Show when={modeloPrincipal() === "__custom__"}>
            <input
              type="text"
              placeholder="provedor/identificador-do-modelo (ex: openrouter/meta-llama/llama-3.3-70b-instruct)"
              value={modeloCustomizado()}
              onInput={(e) => setModeloCustomizado(e.currentTarget.value)}
              class="mt-2 w-full bg-zinc-900/80 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-zinc-600"
            />
          </Show>
        </div>

        {/* FEEDBACK DO TESTE DO MODELO PRINCIPAL */}
        <Show when={resultadoTeste()[modeloPrincipal()]}>
          <div
            class={`p-2.5 rounded-lg border text-xs font-mono flex items-center justify-between ${
              resultadoTeste()[modeloPrincipal()]?.ok
                ? "bg-emerald-950/20 border-emerald-800/40 text-emerald-300"
                : "bg-rose-950/20 border-rose-800/40 text-rose-300"
            }`}
          >
            <div class="flex items-center gap-2">
              <Show
                when={resultadoTeste()[modeloPrincipal()]?.ok}
                fallback={<CircleAlert size={14} class="text-rose-400 shrink-0" />}
              >
                <Check size={14} class="text-emerald-400 shrink-0" />
              </Show>
              <span>
                {resultadoTeste()[modeloPrincipal()]?.ok
                  ? `Inferência confirmada em ${resultadoTeste()[modeloPrincipal()]?.ms}ms`
                  : `Falha: ${resultadoTeste()[modeloPrincipal()]?.error}`}
              </span>
            </div>
          </div>
        </Show>

        <div class="flex items-center justify-between pt-1">
          <Button
            size="xs"
            variant="ghost"
            class="text-xs text-zinc-400 hover:text-zinc-200"
            loading={aplicandoEmTodos()}
            onClick={aplicarModeloEmTodos}
            title="Atualizar o modelo padrão de todos os agentes para o modelo selecionado"
          >
            <Bot size={12} class="mr-1.5" /> Aplicar a Todos os Agentes
          </Button>

          <Button size="xs" variant="primary" loading={salvandoLocal()} onClick={salvarModelos}>
            <Save size={12} class="mr-1" /> Salvar Modelo Principal
          </Button>
        </div>
      </div>

      {/* ROTAÇÃO DE CONTINGÊNCIA (FALLBACK) */}
      <div class="space-y-3 py-2 border-b border-zinc-800/40">
        <div>
          <label class="block text-xs font-semibold text-zinc-200 mb-0.5">
            Ordem de Contingência & Fallback (Um por linha)
          </label>
          <p class="text-xs text-zinc-400 mb-2">
            Quando o provedor primário responder erro 429 ou esgotar a cota de tokens, o OpenCorp tentará
            automaticamente o próximo modelo desta lista.
          </p>
          <textarea
            rows={5}
            value={ordemFallback()}
            onInput={(e) => setOrdemFallback(e.currentTarget.value)}
            class="w-full bg-zinc-900/80 border border-zinc-800 rounded-lg p-3 text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-600 leading-relaxed"
          />
        </div>

        <div class="flex items-center justify-between">
          <label class="flex items-center gap-2 cursor-pointer text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={acessoTotalGlobal()}
              onChange={(e) => setAcessoTotalGlobal(e.currentTarget.checked)}
              class="rounded border-zinc-700 bg-zinc-800 text-cyan-500 focus:ring-0"
            />
            <span>Permitir que agentes acessem qualquer modelo sem validação de allowlist</span>
          </label>

          <Button size="xs" variant="secondary" loading={salvandoLocal()} onClick={salvarModelos}>
            <Save size={12} class="mr-1" /> Salvar Lista de Rotação
          </Button>
        </div>
      </div>

      {/* CONFIGURAÇÕES DE PARÂMETROS DE MODELOS */}
      <Show when={props.todasEntradas && props.onSalvarChave}>
        <div class="space-y-3 pt-2">
          <span class="text-xs font-semibold text-zinc-300 uppercase tracking-wider block">
            Hiperparâmetros de Inferência Padrão
          </span>

          <div class="divide-y divide-zinc-800/40">
            <SettingRow
              chave="models.temperature"
              label="Temperatura de Amostragem"
              descricao="Valores menores favorecem respostas determinísticas e estruturadas; valores maiores aumentam a criatividade."
              tipo="number"
              step="0.05"
              min="0"
              todasEntradas={props.todasEntradas!}
              onSalvar={props.onSalvarChave!}
              salvando={props.salvando}
            />
            <SettingRow
              chave="models.max_tokens"
              label="Teto Máximo de Tokens por Turno"
              descricao="Número máximo de tokens permitidos por chamada de inferência LLM."
              tipo="number"
              step="256"
              min="256"
              todasEntradas={props.todasEntradas!}
              onSalvar={props.onSalvarChave!}
              salvando={props.salvando}
            />
          </div>
        </div>
      </Show>
    </div>
  );
};
