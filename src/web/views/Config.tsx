import { type Component, createSignal, onMount, createEffect, For, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { Settings, Cpu, Key, Shield, ShieldCheck, Save, Bot, Terminal, CheckCircle2 } from "lucide-solid";
import { Button } from "../ui/Button";
import { showToast } from "../ui/Toast";
import { fetchApi } from "../lib/context";

export const ConfigView: Component = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const abaAtiva = () => (searchParams.tab as "modelos" | "chaves" | "seguranca" | "motores" | "geral") || "seguranca";
  const setAbaAtiva = (tab: "modelos" | "chaves" | "seguranca" | "motores" | "geral") => setSearchParams({ tab });

  const [settings, setSettings] = createSignal<any>({});
  const [salvando, setSalvando] = createSignal(false);

  // Estado dos Motores (OpenCode / Runners)
  const [opencodePath, setOpencodePath] = createSignal("opencode");
  const [opencodeTimeout, setOpencodeTimeout] = createSignal(20);

  // Estado dos Modelos e Fallback
  const [modeloPrincipal, setModeloPrincipal] = createSignal("openrouter/nvidia/nemotron-3.5-lightning:free");
  const [modeloCustomizado, setModeloCustomizado] = createSignal("");
  const [ordemFallback, setOrdemFallback] = createSignal("openrouter/nvidia/nemotron-3.5-lightning:free\nopenrouter/nvidia/nemotron-3-ultra-550b-a55b:free\nopenrouter/minimax/minimax-m3:free");
  const [acessoTotalGlobal, setAcessoTotalGlobal] = createSignal(false);
  const [aplicandoEmTodos, setAplicandoEmTodos] = createSignal(false);

  // Estado da Política de Segurança
  const [nivelSeguranca, setNivelSeguranca] = createSignal<"permissive" | "standard" | "strict">("permissive");
  const [allowlistRede, setAllowlistRede] = createSignal("pulso-diario.wp.crom.me, *.crom.me, *.wp.crom.me, github.com, registry.npmjs.org");
  const [promptRegras, setPromptRegras] = createSignal("Permitir curl, inspeção de páginas e comandos de rotina de agentes sem requerer aprovação manual.");
  const [autoAprovarRotinas, setAutoAprovarRotinas] = createSignal(true);

  const carregarSettings = async () => {
    try {
      const data = await fetchApi<any>("/settings");
      setSettings(data || {});
    } catch {}

    try {
      const mod = await fetchApi<any>("/settings/modelos");
      if (mod) {
        if (mod.default_model) {
          setModeloPrincipal(mod.default_model);
        }
        if (Array.isArray(mod.rotation)) {
          setOrdemFallback(mod.rotation.join("\n"));
        }
        if (mod.global_full_access !== undefined) {
          setAcessoTotalGlobal(Boolean(mod.global_full_access));
        }
      }
    } catch {}

    try {
      const sec = await fetchApi<any>("/settings/security");
      if (sec) {
        if (sec.level) setNivelSeguranca(sec.level);
        if (Array.isArray(sec.network_allowlist)) {
          setAllowlistRede(sec.network_allowlist.join(", "));
        }
        if (sec.prompt_regras !== undefined) setPromptRegras(sec.prompt_regras);
        if (sec.auto_aprovar_rotinas !== undefined) setAutoAprovarRotinas(sec.auto_aprovar_rotinas);
        if (sec.global_full_access !== undefined) setAcessoTotalGlobal(Boolean(sec.global_full_access));
      }
    } catch {}
  };

  const salvarModelos = async () => {
    setSalvando(true);
    try {
      const modFinal = modeloPrincipal() === "__custom__"
        ? modeloCustomizado().trim()
        : modeloPrincipal().trim();

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

      showToast("Configuração de modelos e fallback salva com sucesso!", "sucesso");
      await carregarSettings();
    } catch (err: any) {
      showToast("Erro ao salvar modelos: " + err.message, "erro");
    } finally {
      setSalvando(false);
    }
  };

  const aplicarModeloEmTodos = async () => {
    const modFinal = modeloPrincipal() === "__custom__"
      ? modeloCustomizado().trim()
      : modeloPrincipal().trim();

    if (!confirm(`Deseja definir o modelo "${modFinal}" como modelo ativo para TODOS os agentes deste workspace?`)) {
      return;
    }

    setAplicandoEmTodos(true);
    try {
      const res = await fetchApi<any>("/agents/aplicar-modelo-global", {
        method: "POST",
        body: JSON.stringify({ model: modFinal }),
      });
      showToast(`${res.alterados || 0} agentes atualizados para o modelo "${modFinal}"!`, "sucesso");
    } catch (err: any) {
      showToast("Erro ao aplicar nos agentes: " + err.message, "erro");
    } finally {
      setAplicandoEmTodos(false);
    }
  };

  const salvarSeguranca = async () => {
    setSalvando(true);
    try {
      const listaRede = allowlistRede()
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      await fetchApi("/settings/security", {
        method: "PUT",
        body: JSON.stringify({
          level: nivelSeguranca(),
          network_allowlist: listaRede,
          prompt_regras: promptRegras(),
          auto_aprovar_rotinas: autoAprovarRotinas(),
        }),
      });

      showToast("Política de segurança atualizada com sucesso!", "sucesso");
    } catch (err: any) {
      showToast("Erro ao salvar segurança: " + err.message, "erro");
    } finally {
      setSalvando(false);
    }
  };

  const salvarMotores = async () => {
    setSalvando(true);
    try {
      await fetchApi("/settings", {
        method: "PUT",
        body: JSON.stringify({
          runner: {
            engine: "opencode",
            binary_path: opencodePath().trim() || "opencode",
            timeout_min: opencodeTimeout(),
          },
        }),
      });
      showToast("Configuração do OpenCode atualizada com sucesso!", "sucesso");
    } catch (err: any) {
      showToast("Erro ao salvar motor: " + err.message, "erro");
    } finally {
      setSalvando(false);
    }
  };

  onMount(() => {
    void carregarSettings();
  });

  return (
    <div class="flex flex-col h-full p-6 space-y-4 overflow-y-auto scrollbar-thin">
      <div class="pb-2 border-b border-zinc-800">
        <h1 class="text-lg font-bold text-zinc-100 tracking-tight">Configurações do Sistema</h1>
        <p class="text-xs text-zinc-400">Parâmetros de modelos, segurança autônoma, chaves e governança.</p>
      </div>

      {/* Abas */}
      <div class="flex items-center gap-2 border-b border-zinc-800 pb-2">
        <Button
          size="xs"
          variant={abaAtiva() === "seguranca" ? "primary" : "ghost"}
          onClick={() => setAbaAtiva("seguranca")}
        >
          <Shield size={13} class="mr-1.5 text-emerald-400" /> Segurança & Permissões
        </Button>
        <Button
          size="xs"
          variant={abaAtiva() === "motores" ? "primary" : "ghost"}
          onClick={() => setAbaAtiva("motores")}
        >
          <Bot size={13} class="mr-1.5 text-cyan-400" /> Motores & OpenCode
        </Button>
        <Button
          size="xs"
          variant={abaAtiva() === "modelos" ? "primary" : "ghost"}
          onClick={() => setAbaAtiva("modelos")}
        >
          <Cpu size={13} class="mr-1.5" /> Modelos & Rotação
        </Button>
        <Button
          size="xs"
          variant={abaAtiva() === "chaves" ? "primary" : "ghost"}
          onClick={() => setAbaAtiva("chaves")}
        >
          <Key size={13} class="mr-1.5" /> Chaves de API
        </Button>
        <Button
          size="xs"
          variant={abaAtiva() === "geral" ? "primary" : "ghost"}
          onClick={() => setAbaAtiva("geral")}
        >
          <Settings size={13} class="mr-1.5" /> Geral & Timeout
        </Button>
      </div>

      {/* Conteúdo da Aba Ativa */}
      <div class="max-w-2xl space-y-4">
        {/* ABA SEGURANÇA */}
        <Show when={abaAtiva() === "seguranca"}>
          <div class="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-4">
            <div>
              <h2 class="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <ShieldCheck size={16} class="text-emerald-400" />
                Modo de Permissão & Autonomia dos Agentes
              </h2>
              <p class="text-xs text-zinc-400 mt-0.5">
                Escolha o nível de intervenção humana (HITL) para as execuções e rondas do workspace.
              </p>
            </div>

            {/* Opções de Nível */}
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div
                class={`p-3 rounded-lg border cursor-pointer transition-all ${
                  nivelSeguranca() === "permissive"
                    ? "bg-emerald-950/40 border-emerald-500/80 text-emerald-200 ring-1 ring-emerald-500/50"
                    : "bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                }`}
                onClick={() => setNivelSeguranca("permissive")}
              >
                <div class="font-semibold text-xs text-zinc-100 mb-1">🟢 Livre (Autônomo)</div>
                <div class="text-[11px] leading-relaxed">
                  Sem pedir permissão para rotinas ou rede. Roda direto 24h sem interrupções.
                </div>
              </div>

              <div
                class={`p-3 rounded-lg border cursor-pointer transition-all ${
                  nivelSeguranca() === "standard"
                    ? "bg-blue-950/40 border-blue-500/80 text-blue-200 ring-1 ring-blue-500/50"
                    : "bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                }`}
                onClick={() => setNivelSeguranca("standard")}
              >
                <div class="font-semibold text-xs text-zinc-100 mb-1">🟡 Padrão (Regras)</div>
                <div class="text-[11px] leading-relaxed">
                  Permite hosts da allowlist e pede aprovação humana somente se sair das regras.
                </div>
              </div>

              <div
                class={`p-3 rounded-lg border cursor-pointer transition-all ${
                  nivelSeguranca() === "strict"
                    ? "bg-amber-950/40 border-amber-500/80 text-amber-200 ring-1 ring-amber-500/50"
                    : "bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                }`}
                onClick={() => setNivelSeguranca("strict")}
              >
                <div class="font-semibold text-xs text-zinc-100 mb-1">🔴 Estrito (HITL)</div>
                <div class="text-[11px] leading-relaxed">
                  Exige aprovação para qualquer ação fora da lista básica do sistema.
                </div>
              </div>
            </div>

            {/* Domínios Confiáveis */}
            <div class="pt-2">
              <label class="block text-xs font-medium text-zinc-300 mb-1">
                Domínios de Rede Permitidos (separados por vírgula ou use * para todos)
              </label>
              <textarea
                rows={2}
                value={allowlistRede()}
                onInput={(e) => setAllowlistRede(e.currentTarget.value)}
                placeholder="ex: pulso-diario.wp.crom.me, *.crom.me, github.com"
                class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-600"
              />
              <span class="text-[10px] text-zinc-500">
                Subdomínios como *.crom.me ou * liberam acessos de curl do critico-site sem gerar pendência.
              </span>
            </div>

            {/* Prompt de Regras Customizadas */}
            <div>
              <label class="block text-xs font-medium text-zinc-300 mb-1">
                Regras Customizadas / Prompt de Auto-Aprovação
              </label>
              <textarea
                rows={3}
                value={promptRegras()}
                onInput={(e) => setPromptRegras(e.currentTarget.value)}
                placeholder="Descreva o que os agentes podem executar sem pedir aprovação..."
                class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600"
              />
            </div>

            {/* Checkbox Auto-Aprovar Rotinas */}
            <div class="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="check-rotinas"
                checked={autoAprovarRotinas()}
                onChange={(e) => setAutoAprovarRotinas(e.currentTarget.checked)}
                class="rounded border-zinc-700 bg-zinc-950 text-emerald-500 focus:ring-0 cursor-pointer"
              />
              <label for="check-rotinas" class="text-xs text-zinc-300 cursor-pointer">
                Auto-aprovar execuções do agendador automático (scheduler 24h)
              </label>
            </div>

            {/* Botão Salvar */}
            <div class="pt-2 border-t border-zinc-800 flex justify-end">
              <Button size="sm" variant="primary" loading={salvando()} onClick={salvarSeguranca}>
                <Save size={13} class="mr-1.5" /> Salvar Política de Segurança
              </Button>
            </div>
          </div>
        </Show>

        {/* ABA MOTORES DE AGENTE / OPENCODE */}
        <Show when={abaAtiva() === "motores"}>
          <div class="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-4">
            <div>
              <h2 class="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <Bot size={16} class="text-cyan-400" />
                Motor de Execução de Agentes (OpenCode / Runners)
              </h2>
              <p class="text-xs text-zinc-400 mt-0.5">
                Configure o ambiente de runtime dos agentes autônomos e a ponte com o OpenCode.
              </p>
            </div>

            {/* Status do Motor Atual */}
            <div class="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="h-9 w-9 rounded-lg bg-cyan-950/60 border border-cyan-800/80 flex items-center justify-center text-cyan-400 font-mono font-bold text-xs">
                  OC
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-bold text-zinc-100">OpenCode Runtime</span>
                    <span class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1">
                      <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Conectado & Operacional
                    </span>
                  </div>
                  <span class="text-[11px] text-zinc-400 font-mono">
                    Comando: opencode run --auto --agent &lt;id&gt; --dir &lt;workspace&gt;
                  </span>
                </div>
              </div>
              <span class="text-xs font-mono text-zinc-500">v1.x</span>
            </div>

            {/* Configurações do OpenCode */}
            <div class="space-y-3 pt-1">
              <div>
                <label class="block text-xs font-medium text-zinc-300 mb-1">
                  Caminho do Binário do OpenCode
                </label>
                <input
                  type="text"
                  value={opencodePath()}
                  onInput={(e) => setOpencodePath(e.currentTarget.value)}
                  class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-cyan-500/50"
                  placeholder="opencode ou caminho absoluto /usr/local/bin/opencode"
                />
                <span class="text-[10px] text-zinc-500 mt-0.5 block">
                  Usado pelo SessionManager para disparar os agentes autônomos.
                </span>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-medium text-zinc-300 mb-1">
                    Timeout por Turno (Watchdog)
                  </label>
                  <div class="flex items-center gap-2">
                    <input
                      type="number"
                      value={opencodeTimeout()}
                      onInput={(e) => setOpencodeTimeout(Number(e.currentTarget.value) || 20)}
                      min="1"
                      max="120"
                      class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-cyan-500/50"
                    />
                    <span class="text-xs text-zinc-400">min</span>
                  </div>
                  <span class="text-[10px] text-zinc-500 mt-0.5 block">
                    Watchdog encerra execuções travadas automaticamente.
                  </span>
                </div>

                <div>
                  <label class="block text-xs font-medium text-zinc-300 mb-1">
                    Isolamento de Sessões
                  </label>
                  <div class="p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-400 font-mono">
                    ~/.opencorp/opencode-data/&lt;ws&gt;
                  </div>
                  <span class="text-[10px] text-zinc-500 mt-0.5 block">
                    Cada workspace mantém auth e sessões isoladas.
                  </span>
                </div>
              </div>
            </div>

            {/* Suporte Futuro a Novos Motores */}
            <div class="pt-3 border-t border-zinc-800/80 space-y-2">
              <span class="text-[10px] font-bold text-zinc-500 uppercase tracking-wider font-mono">
                Outros Motores (Arquitetura Pluggable)
              </span>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div class="p-3 rounded-lg bg-zinc-950/40 border border-zinc-800/80 opacity-70">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-xs font-bold text-zinc-300">Claude Code (Anthropic)</span>
                    <span class="text-[9px] font-mono px-1 py-0.5 rounded bg-zinc-800 text-zinc-400">Em Breve</span>
                  </div>
                  <p class="text-[11px] text-zinc-500 leading-relaxed">
                    Conexão direta via comando <code class="text-zinc-400">claude</code> com permissões autônomas.
                  </p>
                </div>
                <div class="p-3 rounded-lg bg-zinc-950/40 border border-zinc-800/80 opacity-70">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-xs font-bold text-zinc-300">Custom CLI Runner</span>
                    <span class="text-[9px] font-mono px-1 py-0.5 rounded bg-zinc-800 text-zinc-400">Em Breve</span>
                  </div>
                  <p class="text-[11px] text-zinc-500 leading-relaxed">
                    Ponte genérica para rodar qualquer LLM CLI via subprocesso stdio.
                  </p>
                </div>
              </div>
            </div>

            <div class="pt-2 flex justify-end">
              <Button
                size="sm"
                variant="primary"
                class="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold"
                disabled={salvando()}
                onClick={salvarMotores}
              >
                <Save size={13} class="mr-1.5" />
                {salvando() ? "Salvando..." : "Salvar Configuração do OpenCode"}
              </Button>
            </div>
          </div>
        </Show>

        {/* ABA MODELOS & ROTAÇÃO */}
        <Show when={abaAtiva() === "modelos"}>
          <div class="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-5">
            <div>
              <h2 class="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <Cpu size={16} class="text-purple-400" />
                Modelo Principal & Ordem de Fallback
              </h2>
              <p class="text-xs text-zinc-400 mt-0.5">
                Defina qual modelo de IA é o padrão do sistema e a ordem sequencial de fallback caso o primeiro falhe.
              </p>
            </div>

            {/* SELEÇÃO DO MODELO PRINCIPAL */}
            <div class="space-y-3 p-4 rounded-xl bg-zinc-950 border border-zinc-800">
              <div>
                <label class="block text-xs font-semibold text-zinc-200 mb-1">
                  Modelo Principal do Sistema (Default Global)
                </label>
                <div class="space-y-2">
                  <select
                    value={
                      [
                        "openrouter/nvidia/nemotron-3.5-lightning:free",
                        "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
                        "openrouter/minimax/minimax-m3:free",
                        "openrouter/google/gemini-2.5-flash",
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
                    class="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-100 font-medium focus:outline-none focus:border-purple-500 cursor-pointer"
                  >
                    <option value="openrouter/nvidia/nemotron-3.5-lightning:free">
                      NVIDIA Nemotron 3.5 Lightning (Gratuito / Rápido) — Recomendado
                    </option>
                    <option value="openrouter/nvidia/nemotron-3-ultra-550b-a55b:free">
                      NVIDIA Nemotron 3 Ultra 550B (Gratuito / Alta Capacidade)
                    </option>
                    <option value="openrouter/minimax/minimax-m3:free">
                      MiniMax M3 (Gratuito)
                    </option>
                    <option value="openrouter/google/gemini-2.5-flash">
                      Google Gemini 2.5 Flash
                    </option>
                    <option value="openrouter/anthropic/claude-3.5-haiku">
                      Anthropic Claude 3.5 Haiku
                    </option>
                    <option value="opencode-go/glm-5.3-flash">
                      OpenCode-Go GLM 5.3 Flash
                    </option>
                    <option value="__custom__">
                      Outro / Personalizado (Digitar Manualmente)
                    </option>
                  </select>

                  <Show when={modeloPrincipal() === "__custom__"}>
                    <input
                      type="text"
                      placeholder="provedor/identificador-do-modelo (ex: openrouter/meta-llama/llama-3.3-70b-instruct)"
                      value={modeloCustomizado()}
                      onInput={(e) => setModeloCustomizado(e.currentTarget.value)}
                      class="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-purple-500"
                    />
                  </Show>
                </div>
                <span class="text-[11px] text-zinc-500 mt-1 block">
                  Usado por agentes sem modelo específico e para geração de prompts via IA.
                </span>
              </div>

              {/* AÇÃO: APLICAR EM TODOS OS AGENTES */}
              <div class="pt-3 border-t border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <span class="text-xs font-semibold text-zinc-300 block">
                    Propagar Modelo aos Agentes
                  </span>
                  <span class="text-[11px] text-zinc-500">
                    Aplica este modelo como modelo ativo em todos os agentes do workspace atual.
                  </span>
                </div>
                <Button
                  size="xs"
                  variant="secondary"
                  class="border-purple-800/80 text-purple-300 hover:bg-purple-950/40 whitespace-nowrap self-start sm:self-auto"
                  loading={aplicandoEmTodos()}
                  onClick={aplicarModeloEmTodos}
                >
                  <Bot size={12} class="mr-1.5 text-purple-400" />
                  Aplicar em Todos os Agentes
                </Button>
              </div>
            </div>

            {/* ORDEM DE EXECUÇÃO & FALLBACK */}
            <div class="space-y-3 p-4 rounded-xl bg-zinc-950 border border-zinc-800">
              <div>
                <label class="block text-xs font-semibold text-zinc-200 mb-1">
                  Ordem de Execução & Fallback (Um por linha)
                </label>
                <textarea
                  rows={4}
                  value={ordemFallback()}
                  onInput={(e) => setOrdemFallback(e.currentTarget.value)}
                  placeholder="openrouter/nvidia/nemotron-3.5-lightning:free&#10;openrouter/nvidia/nemotron-3-ultra-550b-a55b:free&#10;openrouter/minimax/minimax-m3:free"
                  class="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-3 text-xs text-zinc-200 font-mono focus:outline-none focus:border-purple-500 leading-relaxed scrollbar-thin"
                />
                <span class="text-[11px] text-zinc-500 mt-1 block leading-relaxed">
                  Se a execução falhar (erro 429, cota esgotada, timeout ou indisponibilidade da API), o sistema tenta automaticamente o próximo modelo desta lista de rotação.
                </span>
              </div>
            </div>

            {/* ACESSO TOTAL GLOBAL (BYPASS DE PERMISSÕES) */}
            <div class="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
              <div class="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  id="check-acesso-total"
                  checked={acessoTotalGlobal()}
                  onChange={(e) => setAcessoTotalGlobal(e.currentTarget.checked)}
                  class="rounded bg-zinc-900 border-zinc-700 text-purple-500 focus:ring-0 cursor-pointer mt-0.5"
                />
                <div class="space-y-0.5">
                  <label for="check-acesso-total" class="text-xs font-semibold text-zinc-200 cursor-pointer block">
                    Acesso Total Global (Ignorar restrições de nível dos agentes)
                  </label>
                  <p class="text-[11px] text-zinc-400 leading-relaxed">
                    Quando ativado, todos os agentes executam diretamente no modo irrestrito (autônomo), sem sofrer bloqueio de level-1 ou level-2 ao executar scripts e ferramentas.
                  </p>
                </div>
              </div>
            </div>

            {/* BOTÃO SALVAR MODELOS */}
            <div class="pt-2 border-t border-zinc-800 flex justify-end">
              <Button
                size="sm"
                variant="primary"
                class="bg-purple-600 hover:bg-purple-500 text-white font-semibold"
                loading={salvando()}
                onClick={salvarModelos}
              >
                <Save size={13} class="mr-1.5" /> Salvar Configurações de Modelos
              </Button>
            </div>
          </div>
        </Show>

        {/* ABA CHAVES */}
        <Show when={abaAtiva() === "chaves"}>
          <div class="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3">
            <h2 class="text-sm font-semibold text-zinc-100">Provedor OpenRouter</h2>
            <p class="text-xs text-zinc-400">Chave validada e ativa em ~/.local/share/opencode/auth.json.</p>
            <div class="text-xs font-mono text-emerald-400 bg-zinc-950 p-2.5 rounded border border-zinc-800">
              ✓ OpenRouter API Key conectada (escopo global e workspaces)
            </div>
          </div>
        </Show>

        {/* ABA GERAL */}
        <Show when={abaAtiva() === "geral"}>
          <div class="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3">
            <h2 class="text-sm font-semibold text-zinc-100">Parâmetros Operacionais</h2>
            <div class="text-xs text-zinc-400 space-y-1">
              <div>• Fast-fail de timeout de stream: 35s</div>
              <div>• Watchdog timeout padrão: 20 min</div>
              <div>• Isolamento do servidor OpenCode: ~/.opencorp/opencode-home</div>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
};
