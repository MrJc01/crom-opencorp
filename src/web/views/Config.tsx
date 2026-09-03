import { type Component, createSignal, onMount, For, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import {
  Settings,
  Cpu,
  Key,
  Shield,
  ShieldCheck,
  Save,
  Bot,
  Terminal,
  CheckCircle2,
  AlertCircle,
  Zap,
  RefreshCw,
  Server,
  Trash2,
  Plus,
  Play,
  Activity,
  Layers,
} from "lucide-solid";
import { Button } from "../ui/Button";
import { showToast } from "../ui/Toast";
import { fetchApi, wsAtivo } from "../lib/context";

export const ConfigView: Component = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const abaAtiva = () => (searchParams.tab as "modelos" | "chaves" | "seguranca" | "motores" | "geral") || "motores";
  const setAbaAtiva = (tab: "modelos" | "chaves" | "seguranca" | "motores" | "geral") => setSearchParams({ tab });

  // Escopo de Configuração: Global vs Workspace
  const [escopoConfig, setEscopoConfig] = createSignal<"global" | "workspace">("global");

  const [settings, setSettings] = createSignal<any>({});
  const [salvando, setSalvando] = createSignal(false);

  // Estado dos Motores e Diagnóstico
  const [statusMotores, setStatusMotores] = createSignal<any>(null);
  const [carregandoMotores, setCarregandoMotores] = createSignal(false);
  const [opencodePath, setOpencodePath] = createSignal("opencode");
  const [opencodeTimeout, setOpencodeTimeout] = createSignal(20);

  // Estado das Chaves de API
  const [chavesApi, setChavesApi] = createSignal<any>({ global: { chaves: [] }, workspace: { chaves: [], herdadas: [] } });
  const [carregandoChaves, setCarregandoChaves] = createSignal(false);
  const [novoProvider, setNovoProvider] = createSignal("openrouter");
  const [novaChaveValor, setNovaChaveValor] = createSignal("");
  const [novoEscopo, setNovoEscopo] = createSignal<"global" | "workspace">("global");
  const [salvandoChave, setSalvandoChave] = createSignal(false);

  // Estado dos Modelos e Fallback
  const [modeloPrincipal, setModeloPrincipal] = createSignal("openrouter/google/gemini-3.8-flash");
  const [modeloCustomizado, setModeloCustomizado] = createSignal("");
  const [ordemFallback, setOrdemFallback] = createSignal(
    "openrouter/google/gemini-3.8-flash\nopenrouter/nvidia/nemotron-3.5-lightning:free\nopenrouter/nvidia/nemotron-3-ultra-550b-a55b:free\nopenrouter/minimax/minimax-m3:free"
  );
  const [acessoTotalGlobal, setAcessoTotalGlobal] = createSignal(false);
  const [aplicandoEmTodos, setAplicandoEmTodos] = createSignal(false);

  // Testes de Conectividade de Modelos e Provedores
  const [testandoModelo, setTestandoModelo] = createSignal<string | null>(null);
  const [resultadoTeste, setResultadoTeste] = createSignal<Record<string, any>>({});

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
        if (mod.default_model) setModeloPrincipal(mod.default_model);
        if (Array.isArray(mod.rotation)) setOrdemFallback(mod.rotation.join("\n"));
        if (mod.global_full_access !== undefined) setAcessoTotalGlobal(Boolean(mod.global_full_access));
      }
    } catch {}

    try {
      const sec = await fetchApi<any>("/settings/security");
      if (sec) {
        if (sec.level) setNivelSeguranca(sec.level);
        if (Array.isArray(sec.network_allowlist)) setAllowlistRede(sec.network_allowlist.join(", "));
        if (sec.prompt_regras !== undefined) setPromptRegras(sec.prompt_regras);
        if (sec.auto_aprovar_rotinas !== undefined) setAutoAprovarRotinas(sec.auto_aprovar_rotinas);
        if (sec.global_full_access !== undefined) setAcessoTotalGlobal(Boolean(sec.global_full_access));
      }
    } catch {}
  };

  const carregarStatusMotores = async () => {
    setCarregandoMotores(true);
    try {
      const data = await fetchApi<any>("/motores/status");
      if (data && data.ok) {
        setStatusMotores(data);
        if (data.opencode?.path) setOpencodePath(data.opencode.path);
      }
    } catch (err: any) {
      console.error("Falha ao carregar status dos motores:", err);
    } finally {
      setCarregandoMotores(false);
    }
  };

  const carregarChaves = async () => {
    setCarregandoChaves(true);
    try {
      const data = await fetchApi<any>("/provider-keys");
      if (data) setChavesApi(data);
    } catch (err: any) {
      console.error("Falha ao carregar chaves:", err);
    } finally {
      setCarregandoChaves(false);
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

  const adicionarChave = async () => {
    const prov = novoProvider().trim();
    const chave = novaChaveValor().trim();
    if (!chave) {
      showToast("Insira a chave de API", "aviso");
      return;
    }
    setSalvandoChave(true);
    try {
      await fetchApi("/provider-keys", {
        method: "PUT",
        body: JSON.stringify({
          provider: prov,
          key: chave,
          escopo: novoEscopo(),
        }),
      });
      showToast(`Chave do provedor ${prov} salva com sucesso!`, "sucesso");
      setNovaChaveValor("");
      await carregarChaves();
      await carregarStatusMotores();
    } catch (err: any) {
      showToast("Erro ao salvar chave: " + err.message, "erro");
    } finally {
      setSalvandoChave(false);
    }
  };

  const removerChave = async (provider: string, escopo: string) => {
    if (!confirm(`Deseja remover a chave do provedor "${provider}" no escopo ${escopo}?`)) return;
    try {
      await fetchApi(`/provider-keys/${encodeURIComponent(provider)}?escopo=${escopo}`, {
        method: "DELETE",
      });
      showToast(`Chave ${provider} removida`, "sucesso");
      await carregarChaves();
      await carregarStatusMotores();
    } catch (err: any) {
      showToast("Erro ao remover: " + err.message, "erro");
    }
  };

  const salvarModelos = async () => {
    setSalvando(true);
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
      await carregarSettings();
    } catch (err: any) {
      showToast("Erro ao salvar modelos: " + err.message, "erro");
    } finally {
      setSalvando(false);
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

  const salvarSeguranca = async () => {
    setSalvando(true);
    try {
      const listaRede = allowlistRede().split(",").map((s) => s.trim()).filter(Boolean);
      await fetchApi("/settings/security", {
        method: "PUT",
        body: JSON.stringify({
          level: nivelSeguranca(),
          network_allowlist: listaRede,
          prompt_regras: promptRegras(),
          auto_aprovar_rotinas: autoAprovarRotinas(),
        }),
      });
      showToast("Política de segurança atualizada!", "sucesso");
    } catch (err: any) {
      showToast("Erro ao salvar: " + err.message, "erro");
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
      showToast("Configuração do OpenCode atualizada!", "sucesso");
      await carregarStatusMotores();
    } catch (err: any) {
      showToast("Erro ao salvar: " + err.message, "erro");
    } finally {
      setSalvando(false);
    }
  };

  onMount(() => {
    void carregarSettings();
    void carregarStatusMotores();
    void carregarChaves();
  });

  return (
    <div class="flex flex-col h-full p-6 space-y-4 overflow-y-auto scrollbar-thin">
      <div class="pb-2 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 class="text-lg font-bold text-zinc-100 tracking-tight">Configurações do Sistema</h1>
          <p class="text-xs text-zinc-400">
            Governança, motores de agentes autônomos, inferência direta e catálogo de inteligência.
          </p>
        </div>

        {/* SELETOR DE ESCOPO: GLOBAL VS WORKSPACE */}
        <div class="flex items-center bg-zinc-950 p-1 rounded-xl border border-zinc-800 self-start sm:self-auto">
          <button
            class={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              escopoConfig() === "global"
                ? "bg-cyan-600 text-white shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
            onClick={() => {
              setEscopoConfig("global");
              void carregarSettings();
            }}
          >
            <Layers size={13} />
            <span>Global (Sistema)</span>
          </button>
          <button
            class={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              escopoConfig() === "workspace"
                ? "bg-purple-600 text-white shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
            onClick={() => {
              if (!wsAtivo()) {
                showToast("Nenhum workspace ativo no momento", "aviso");
                return;
              }
              setEscopoConfig("workspace");
              void carregarSettings();
            }}
          >
            <Bot size={13} />
            <span>Workspace: {wsAtivo() || "Nenhum"}</span>
          </button>
        </div>
      </div>

      {/* Indicador visual de escopo ativo */}
      <div class="p-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800/80 flex items-center justify-between text-xs">
        <Show when={escopoConfig() === "global"}>
          <div class="flex items-center gap-2 text-cyan-300">
            <span class="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span class="font-medium">Escopo Global:</span>
            <span class="text-zinc-400">Configurações padrão para todas as empresas criadas no sistema.</span>
          </div>
        </Show>
        <Show when={escopoConfig() === "workspace"}>
          <div class="flex items-center gap-2 text-purple-300">
            <span class="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
            <span class="font-medium">Escopo do Workspace "{wsAtivo()}":</span>
            <span class="text-zinc-400">Configurações exclusivas desta empresa (herda do Global o que não for customizado).</span>
          </div>
        </Show>
      </div>

      {/* Abas */}
      <div class="flex items-center gap-2 border-b border-zinc-800 pb-2">
        <Button
          size="xs"
          variant={abaAtiva() === "motores" ? "primary" : "ghost"}
          onClick={() => setAbaAtiva("motores")}
        >
          <Bot size={13} class="mr-1.5 text-cyan-400" /> Motores & Provedores
        </Button>
        <Button
          size="xs"
          variant={abaAtiva() === "modelos" ? "primary" : "ghost"}
          onClick={() => setAbaAtiva("modelos")}
        >
          <Cpu size={13} class="mr-1.5 text-purple-400" /> Modelos & Rotação
        </Button>
        <Button
          size="xs"
          variant={abaAtiva() === "chaves" ? "primary" : "ghost"}
          onClick={() => setAbaAtiva("chaves")}
        >
          <Key size={13} class="mr-1.5 text-amber-400" /> Chaves de API
        </Button>
        <Button
          size="xs"
          variant={abaAtiva() === "seguranca" ? "primary" : "ghost"}
          onClick={() => setAbaAtiva("seguranca")}
        >
          <Shield size={13} class="mr-1.5 text-emerald-400" /> Segurança & HITL
        </Button>
        <Button
          size="xs"
          variant={abaAtiva() === "geral" ? "primary" : "ghost"}
          onClick={() => setAbaAtiva("geral")}
        >
          <Settings size={13} class="mr-1.5" /> Geral & Operacional
        </Button>
      </div>

      {/* Conteúdo da Aba Ativa */}
      <div class="max-w-3xl space-y-4">
        {/* ─────────────────────────────────────────────────────────────
            ABA MOTORES & OPENCODE
           ───────────────────────────────────────────────────────────── */}
        <Show when={abaAtiva() === "motores"}>
          <div class="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-5">
            <div class="flex items-center justify-between">
              <div>
                <h2 class="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <Bot size={16} class="text-cyan-400" />
                  Diagnóstico dos Motores e Runtimes de Execução
                </h2>
                <p class="text-xs text-zinc-400 mt-0.5">
                  Ambiente de execução autônoma dos agentes corporativos e status em tempo real.
                </p>
              </div>
              <Button
                size="xs"
                variant="ghost"
                loading={carregandoMotores()}
                onClick={carregarStatusMotores}
                title="Atualizar diagnóstico agora"
              >
                <RefreshCw size={12} class="mr-1" /> Atualizar
              </Button>
            </div>

            {/* CARD DE DIAGNÓSTICO DO OPENCODE */}
            <div class="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="h-10 w-10 rounded-xl bg-cyan-950/80 border border-cyan-800 flex items-center justify-center text-cyan-400 font-mono font-bold text-sm">
                    OC
                  </div>
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="text-xs font-bold text-zinc-100">OpenCode Runtime</span>
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1.5">
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        {statusMotores()?.opencode?.instalado ? "Instalado & Operacional" : "Detectando..."}
                      </span>
                    </div>
                    <span class="text-[11px] font-mono text-zinc-400">
                      Versão: {statusMotores()?.opencode?.versao || "1.18.22"} · Binário: {statusMotores()?.opencode?.path || "/home/j/.opencode/bin/opencode"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Grid de Informações Técnicas do OpenCode */}
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-zinc-800/80 text-xs font-mono">
                <div class="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800">
                  <span class="text-[10px] text-zinc-500 uppercase block font-semibold">Isolamento do Workspace</span>
                  <span class="text-[11px] text-zinc-300 truncate block">
                    {statusMotores()?.opencode?.data_workspace || "~/.opencorp/opencode-data/<ws>"}
                  </span>
                </div>
                <div class="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800">
                  <span class="text-[10px] text-zinc-500 uppercase block font-semibold">Daemons do Sistema</span>
                  <div class="flex items-center gap-3 mt-0.5 text-[11px]">
                    <span class="flex items-center gap-1">
                      <span class={`w-1.5 h-1.5 rounded-full ${statusMotores()?.daemons?.scheduler?.ativo ? "bg-emerald-400" : "bg-zinc-600"}`} />
                      Scheduler ({statusMotores()?.daemons?.scheduler?.pid || "ativo"})
                    </span>
                    <span class="flex items-center gap-1">
                      <span class={`w-1.5 h-1.5 rounded-full ${statusMotores()?.daemons?.secretario?.ativo ? "bg-emerald-400" : "bg-zinc-600"}`} />
                      Secretário
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* TABELA DE PROVEDORES CONECTADOS NO OPENCODE */}
            <div class="space-y-2.5">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Zap size={13} class="text-amber-400" /> Provedores de LLM Conectados ao Motor
                </span>
                <span class="text-[11px] text-zinc-400">
                  Total de {statusMotores()?.provedores?.length || 6} provedores catalogados
                </span>
              </div>

              <div class="space-y-2">
                <For each={statusMotores()?.provedores || []}>
                  {(prov: any) => {
                    const testando = () => testandoModelo() === prov.id;
                    const res = () => resultadoTeste()[prov.id];
                    return (
                      <div class="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div class="space-y-1">
                          <div class="flex items-center gap-2">
                            <span class="text-xs font-bold text-zinc-100">{prov.nome}</span>
                            <span
                              class={`px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                                prov.conectado
                                  ? "bg-emerald-950/80 text-emerald-300 border border-emerald-800"
                                  : "bg-zinc-800 text-zinc-400"
                              }`}
                            >
                              {prov.conectado ? "🟢 Conectado" : "⚪ Não configurado"}
                            </span>
                            <Show when={prov.previewChave}>
                              <span class="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                                {prov.previewChave}
                              </span>
                            </Show>
                          </div>
                          <p class="text-[11px] text-zinc-400 leading-relaxed">{prov.descricao}</p>
                        </div>

                        <div class="flex items-center gap-2 self-end sm:self-auto">
                          <Show when={res()}>
                            <span
                              class={`text-[10px] font-mono px-2 py-0.5 rounded ${
                                res()?.ok ? "bg-emerald-950 text-emerald-300" : "bg-rose-950 text-rose-300"
                              }`}
                            >
                              {res()?.ok ? `✔ ${res()?.ms}ms` : "❌ Erro"}
                            </span>
                          </Show>

                          <Show when={prov.conectado}>
                            <Button
                              size="xs"
                              variant="secondary"
                              loading={testando()}
                              onClick={() => testarConexaoModelo(prov.modelosSugeridos?.[0] || prov.id)}
                            >
                              <Play size={11} class="mr-1 fill-current text-cyan-400" /> Testar
                            </Button>
                          </Show>

                          <Show when={!prov.conectado}>
                            <Button size="xs" variant="ghost" onClick={() => setAbaAtiva("chaves")}>
                              <Plus size={11} class="mr-1" /> Conectar
                            </Button>
                          </Show>
                        </div>
                      </div>
                    );
                  }}
                </For>
              </div>
            </div>

            {/* CONFIGURAÇÃO DO BINÁRIO E TIMEOUT */}
            <Show when={escopoConfig() === "global"}>
              <div class="pt-3 border-t border-zinc-800/80 space-y-3">
                <span class="text-xs font-semibold text-zinc-300 uppercase tracking-wider block">
                  Parâmetros do Executável OpenCode (Servidor do Sistema)
                </span>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-medium text-zinc-400 mb-1">Caminho do Binário</label>
                    <input
                      type="text"
                      value={opencodePath()}
                      onInput={(e) => setOpencodePath(e.currentTarget.value)}
                      class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-cyan-500/50"
                    />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-zinc-400 mb-1">Watchdog Timeout (min)</label>
                    <input
                      type="number"
                      value={opencodeTimeout()}
                      onInput={(e) => setOpencodeTimeout(Number(e.currentTarget.value) || 20)}
                      min="1"
                      max="120"
                      class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-cyan-500/50"
                    />
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

            <Show when={escopoConfig() === "workspace"}>
              <div class="p-3.5 rounded-xl bg-purple-950/20 border border-purple-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-purple-200">
                <div class="flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full bg-purple-400" />
                  <span>Este workspace utiliza o runtime OpenCode gerenciado pelo servidor global.</span>
                </div>
                <span class="font-mono text-[11px] text-zinc-400 bg-zinc-950 px-2 py-1 rounded border border-zinc-800">
                  Dados isolados em ~/.opencorp/opencode-data/{wsAtivo()}
                </span>
              </div>
            </Show>
          </div>
        </Show>

        {/* ─────────────────────────────────────────────────────────────
            ABA MODELOS & ROTAÇÃO (COM GEMINI 3.8 FLASH E TESTE)
           ───────────────────────────────────────────────────────────── */}
        <Show when={abaAtiva() === "modelos"}>
          <div class="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-5">
            <div>
              <h2 class="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <Cpu size={16} class="text-purple-400" />
                Modelo Padrão e Rotação Automática de Contingência
              </h2>
              <p class="text-xs text-zinc-400 mt-0.5">
                Defina a inteligência primária do sistema e a ordem de rotação em caso de 429 ou cota esgotada.
              </p>
            </div>

            {/* SELEÇÃO DO MODELO PRINCIPAL */}
            <div class="space-y-3 p-4 rounded-xl bg-zinc-950 border border-zinc-800">
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
                    class="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-100 font-medium focus:outline-none focus:border-purple-500 cursor-pointer"
                  >
                    <option value="openrouter/google/gemini-3.8-flash">
                      ⚡ Google Gemini 3.8 Flash (BYOK Google AI Studio • Custo $0) — Recomendado
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
                    <Play size={11} class="mr-1 fill-current text-purple-400" /> Testar Modelo
                  </Button>
                </div>

                <Show when={modeloPrincipal() === "__custom__"}>
                  <input
                    type="text"
                    placeholder="provedor/identificador-do-modelo (ex: openrouter/meta-llama/llama-3.3-70b-instruct)"
                    value={modeloCustomizado()}
                    onInput={(e) => setModeloCustomizado(e.currentTarget.value)}
                    class="mt-2 w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-purple-500"
                  />
                </Show>

                {/* Badge de resultado do teste */}
                <Show when={resultadoTeste()[modeloPrincipal()]}>
                  <div
                    class={`mt-2 p-2.5 rounded-lg text-xs font-mono flex items-center justify-between ${
                      resultadoTeste()[modeloPrincipal()]?.ok
                        ? "bg-emerald-950/60 border border-emerald-800 text-emerald-300"
                        : "bg-rose-950/60 border border-rose-800 text-rose-300"
                    }`}
                  >
                    <span>
                      {resultadoTeste()[modeloPrincipal()]?.ok ? "✔ Modelo ativo e respondendo" : "❌ Erro na chamada"} (
                      {resultadoTeste()[modeloPrincipal()]?.ms}ms)
                    </span>
                    <Show when={resultadoTeste()[modeloPrincipal()]?.is_byok}>
                      <span class="px-1.5 py-0.5 rounded bg-emerald-900/80 text-[10px] text-emerald-200">
                        BYOK Custo $0
                      </span>
                    </Show>
                  </div>
                </Show>
              </div>

              {/* PROPAGAR MODELO PARA TODOS OS AGENTES */}
              <div class="pt-3 border-t border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <span class="text-xs font-semibold text-zinc-300 block">Propagar Modelo aos Agentes</span>
                  <span class="text-[11px] text-zinc-500">
                    Aplica este modelo como o modelo padrão em todos os agentes ativos do workspace.
                  </span>
                </div>
                <Button
                  size="xs"
                  variant="secondary"
                  class="border-purple-800/80 text-purple-300 hover:bg-purple-950/40"
                  loading={aplicandoEmTodos()}
                  onClick={aplicarModeloEmTodos}
                >
                  <Bot size={12} class="mr-1.5 text-purple-400" /> Aplicar em Todos
                </Button>
              </div>
            </div>

            {/* ORDEM DE EXECUÇÃO & ROTAÇÃO DE CONTINGÊNCIA */}
            <div class="space-y-3 p-4 rounded-xl bg-zinc-950 border border-zinc-800">
              <div>
                <label class="block text-xs font-semibold text-zinc-200 mb-1">
                  Ordem de Contingência & Fallback (Um por linha)
                </label>
                <textarea
                  rows={4}
                  value={ordemFallback()}
                  onInput={(e) => setOrdemFallback(e.currentTarget.value)}
                  class="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-3 text-xs text-zinc-200 font-mono focus:outline-none focus:border-purple-500 leading-relaxed scrollbar-thin"
                />
                <span class="text-[11px] text-zinc-500 mt-1 block">
                  Em caso de erro 429, timeout ou cota esgotada, o sistema rotaciona automaticamente para o próximo modelo.
                </span>
              </div>
            </div>

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

        {/* ─────────────────────────────────────────────────────────────
            ABA CHAVES DE API (CRUD REAL GLOBAL × WORKSPACE)
           ───────────────────────────────────────────────────────────── */}
        <Show when={abaAtiva() === "chaves"}>
          <div class="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-5">
            <div class="flex items-center justify-between">
              <div>
                <h2 class="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <Key size={16} class="text-amber-400" />
                  Gerenciamento Seguro de Chaves de API
                </h2>
                <p class="text-xs text-zinc-400 mt-0.5">
                  Chaves de API para os motores e inferência direta, com herança por workspace.
                </p>
              </div>
              <Button size="xs" variant="ghost" loading={carregandoChaves()} onClick={carregarChaves}>
                <RefreshCw size={12} class="mr-1" /> Atualizar
              </Button>
            </div>

            {/* TABELA DE CHAVES ATIVAS */}
            <div class="space-y-3">
              <span class="text-xs font-semibold text-zinc-300 uppercase tracking-wider block">
                Chaves Configuradas no Sistema
              </span>

              <div class="space-y-2">
                <For each={chavesApi()?.global?.chaves || []}>
                  {(chk: any) => (
                    <div class="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                      <div class="flex items-center gap-3">
                        <div class="h-8 w-8 rounded-lg bg-amber-950/60 border border-amber-800 flex items-center justify-center text-amber-400 font-bold text-xs">
                          {chk.provider.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div class="flex items-center gap-2">
                            <span class="text-xs font-bold text-zinc-100">{chk.provider}</span>
                            <span class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-400">
                              Escopo Global
                            </span>
                          </div>
                          <span class="text-[11px] font-mono text-zinc-400">{chk.preview}</span>
                        </div>
                      </div>

                      <div class="flex items-center gap-2">
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={() => testarConexaoModelo(chk.provider === "openrouter" ? "google/gemini-3.8-flash" : chk.provider)}
                        >
                          <Play size={11} class="mr-1 fill-current" /> Testar
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          class="text-rose-400 hover:text-rose-300"
                          onClick={() => removerChave(chk.provider, "global")}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </div>
                  )}
                </For>

                <Show when={chavesApi()?.global?.chaves?.length === 0}>
                  <div class="p-4 rounded-xl bg-zinc-950/40 border border-dashed border-zinc-800 text-center text-xs text-zinc-500">
                    Nenhuma chave cadastrada ainda. Adicione abaixo para habilitar o OpenRouter ou outros provedores.
                  </div>
                </Show>
              </div>
            </div>

            {/* FORMULÁRIO DE ADICIONAR / ATUALIZAR CHAVE */}
            <div class="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
              <span class="text-xs font-semibold text-zinc-200 block">Adicionar ou Atualizar Chave de Provedor</span>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label class="block text-[11px] font-medium text-zinc-400 mb-1">Provedor</label>
                  <select
                    value={novoProvider()}
                    onChange={(e) => setNovoProvider(e.currentTarget.value)}
                    class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="openrouter">OpenRouter (Universal)</option>
                    <option value="google">Google AI Studio Direto</option>
                    <option value="anthropic">Anthropic API</option>
                    <option value="openai">OpenAI API</option>
                    <option value="opencode-go">OpenCode-Go</option>
                  </select>
                </div>

                <div>
                  <label class="block text-[11px] font-medium text-zinc-400 mb-1">Escopo</label>
                  <select
                    value={novoEscopo()}
                    onChange={(e) => setNovoEscopo(e.currentTarget.value as any)}
                    class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="global">Global (Todo o Sistema)</option>
                    <option value="workspace">Workspace Atual</option>
                  </select>
                </div>

                <div>
                  <label class="block text-[11px] font-medium text-zinc-400 mb-1">Chave de API (Token)</label>
                  <input
                    type="password"
                    placeholder="sk-or-v1-..."
                    value={novaChaveValor()}
                    onInput={(e) => setNovaChaveValor(e.currentTarget.value)}
                    class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div class="pt-2 flex justify-end">
                <Button
                  size="xs"
                  variant="primary"
                  class="bg-amber-600 hover:bg-amber-500 text-white font-semibold"
                  loading={salvandoChave()}
                  onClick={adicionarChave}
                >
                  <Plus size={12} class="mr-1" /> Salvar Chave
                </Button>
              </div>
            </div>
          </div>
        </Show>

        {/* ─────────────────────────────────────────────────────────────
            ABA SEGURANÇA & HITL
           ───────────────────────────────────────────────────────────── */}
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
                <div class="font-semibold text-xs text-zinc-100 mb-1">🟡 Equilibrado</div>
                <div class="text-[11px] leading-relaxed">
                  Aprova comandos normais e pede confirmação apenas para ações sensíveis.
                </div>
              </div>

              <div
                class={`p-3 rounded-lg border cursor-pointer transition-all ${
                  nivelSeguranca() === "strict"
                    ? "bg-rose-950/40 border-rose-500/80 text-rose-200 ring-1 ring-rose-500/50"
                    : "bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                }`}
                onClick={() => setNivelSeguranca("strict")}
              >
                <div class="font-semibold text-xs text-zinc-100 mb-1">🔴 Restrito</div>
                <div class="text-[11px] leading-relaxed">
                  Pede confirmação humana (HITL) para qualquer comando bash ou rede.
                </div>
              </div>
            </div>

            {/* Allowlist de Rede */}
            <div class="space-y-2 pt-2">
              <label class="block text-xs font-semibold text-zinc-200">
                Allowlist de Domínios de Rede (separados por vírgula)
              </label>
              <input
                type="text"
                value={allowlistRede()}
                onInput={(e) => setAllowlistRede(e.currentTarget.value)}
                class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-emerald-500/50"
              />
            </div>

            <div class="pt-2 flex justify-end">
              <Button size="sm" variant="primary" loading={salvando()} onClick={salvarSeguranca}>
                <Save size={13} class="mr-1.5" /> Salvar Política de Segurança
              </Button>
            </div>
          </div>
        </Show>

        {/* ─────────────────────────────────────────────────────────────
            ABA GERAL & OPERACIONAL
           ───────────────────────────────────────────────────────────── */}
        <Show when={abaAtiva() === "geral"}>
          <div class="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-4">
            <div>
              <h2 class="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <Settings size={16} class="text-cyan-400" />
                Parâmetros Operacionais e Timeouts do Sistema
              </h2>
              <p class="text-xs text-zinc-400 mt-0.5">
                Valores de contingência para evitar agentes travados e diretórios de sistema.
              </p>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div class="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                <span class="text-zinc-300 font-semibold block">Fast-Fail de Stream (35s)</span>
                <p class="text-[11px] text-zinc-500 leading-relaxed">
                  Encerra requisições de stream que congelarem por mais de 35 segundos sem gerar novos tokens.
                </p>
              </div>

              <div class="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                <span class="text-zinc-300 font-semibold block">Watchdog Global (20 min)</span>
                <p class="text-[11px] text-zinc-500 leading-relaxed">
                  Teto máximo absoluto de segurança para qualquer turno de agente autônomo.
                </p>
              </div>

              <div class="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                <span class="text-zinc-300 font-semibold block">Diretório de Configurações</span>
                <p class="text-[11px] font-mono text-zinc-400">~/.opencorp</p>
              </div>

              <div class="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                <span class="text-zinc-300 font-semibold block">Banco de Dados Ledger</span>
                <p class="text-[11px] font-mono text-zinc-400">registries/corp.db</p>
              </div>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
};
