import { type Component, createSignal, createEffect, onMount, onCleanup, For, Show } from "solid-js";
import {
  AlertCircle,
  Cpu,
  X,
  Check,
  Play,
  RefreshCw,
  Sparkles,
  Info,
} from "lucide-solid";
import { UniversalChat } from "../components/chat/UniversalChat";
import { HistoricoModal } from "../components/chat/HistoricoModal";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { useChat, MODELOS_PRESETS_POPULARES } from "../lib/chat/store";
import { fetchApi, wsAtivo } from "../lib/context";
import { sincronizarUrlSessao } from "../lib/chat/sessions-store";

export const SecretarioView: Component = () => {
  const chat = useChat();
  const [historicoAberto, setHistoricoAberto] = createSignal(false);
  const [configLateralAberta, setConfigLateralAberta] = createSignal(false);
  const [branchAtiva, setBranchAtiva] = createSignal("main");

  createEffect(() => {
    sincronizarUrlSessao(chat.sessaoAtivaId());
  });

  // Auto-sincronização periódica da sessão aberta enquanto o usuário estiver nesta tela
  onMount(() => {
    fetchApi<{ branch?: string }>("/workspaces/git/status")
      .then((res) => {
        if (res?.branch) setBranchAtiva(res.branch);
      })
      .catch(() => {});

    // Sincronização inteligente apenas quando o usuário retorna à aba após deixá-la em segundo plano
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === "visible") {
        void chat.sincronizarSessaoAtiva({ silencioso: true });
      }
    };
    document.addEventListener("visibilitychange", aoMudarVisibilidade);

    onCleanup(() => {
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    });
  });

  const abrirPainelLateral = () => {
    void chat.abrirPainelLateral();
    setConfigLateralAberta(true);
  };

  const salvarEFechar = async () => {
    setConfigLateralAberta(false);
    try {
      await chat.salvarConfigLateral();
    } catch {
      // erro já exibido via toast no store
    }
  };

  return (
    <div class="flex flex-col h-full w-full overflow-hidden bg-zinc-950 relative">

      <Show when={chat.alertaFalhas()}>
        <div class="mx-3 mt-2 px-3 py-2 rounded-xl bg-amber-950/50 border border-amber-700/50 text-[12px] text-amber-200 flex items-center gap-2">
          <AlertCircle size={14} class="text-amber-400 flex-shrink-0" />
          <span class="flex-1">{chat.alertaFalhas()}</span>
          <button type="button" onClick={chat.dispensarAlertaFalhas} class="text-amber-400 hover:text-amber-200 cursor-pointer" title="Dispensar">
            <X size={13} />
          </button>
        </div>
      </Show>

      <UniversalChat
        mensagens={chat.mensagens()}
        carregando={chat.carregando()}
        agente={{
          id: chat.agente(),
          nome: chat.agente(),
          modelo: chat.modeloAtivoChat() || chat.modeloConfig() || "openrouter/google/gemini-2.5-flash",
          status: chat.carregando() ? "executando" : undefined,
        }}
        decorridoFmt={chat.decorridoFmt()}
        podeEnviarPrompt={true}
        valorPrompt={chat.inputValor()}
        onValorPromptChange={chat.setInputValor}
        refTextarea={chat.refTextareaPara("pagina")}
        inputId="chat-input"
        onEnviarPrompt={async (texto, anexosRecebidos) => {
          if (anexosRecebidos) chat.setAnexos(anexosRecebidos);
          chat.setInputValor(texto);
          await chat.enviarMensagem();
        }}
        onEditarPrompt={(i) => void chat.editarPrompt(i, "pagina")}
        filaPrompts={chat.filaPrompts()}
        onAdicionarFila={chat.adicionarFila}
        onRemoverFila={chat.removerFila}
        onEditarFila={(id) => chat.editarFila(id, "pagina")}
        onAdiantarFila={(id) => void chat.adiantarFila(id)}
        onAprovarHitl={(id) => void chat.aprovarHitl(id)}
        onRejeitarHitl={(id, m) => void chat.rejeitarHitl(id, m)}
        sessoes={chat.sessoes()}
        sessaoAtivaId={chat.sessaoAtivaId()}
        emNovaConversa={chat.emNovaConversa()}
        onSelecionarSessao={(id) => void chat.selecionarSessao(id)}
        onExcluirSessao={(id) => void chat.excluirSessao(id)}
        modeloAtivo={chat.modeloAtivoChat() || chat.modeloConfig() || "openrouter/google/gemini-2.5-flash"}
        onMudarModelo={(m) => chat.setModeloConfig(m)}
        workspaceId={wsAtivo() || "opencorp"}
        branchAtiva={branchAtiva()}
        onNovaSessao={() => { chat.novaConversa(); }}
        onAbrirHistorico={() => setHistoricoAberto(true)}
        onAbrirConfiguracoes={() => void abrirPainelLateral()}
        onParar={chat.pararStream}
        temMaisMensagensAnteriores={chat.temMaisMensagensAnteriores()}
        carregandoAnteriores={chat.carregandoAnteriores()}
        onCarregarAnteriores={() => void chat.carregarMensagensAnteriores()}
        totalMensagens={chat.totalMensagensServidor()}
        sugestoesRapidas={chat.sugestoes}
        iframeConfig={{
          habilitado: true,
          aberto: false,
        }}
      />

      {/* Modal Popup de Histórico */}
      <HistoricoModal
        open={historicoAberto()}
        onOpenChange={setHistoricoAberto}
        sessoes={chat.sessoes()}
        sessaoAtivaId={chat.sessaoAtivaId()}
        onSelecionarSessao={(id) => { void chat.selecionarSessao(id); setHistoricoAberto(false); }}
        onNovaConversa={() => { chat.novaConversa(); setHistoricoAberto(false); }}
        onExcluirSessao={(id) => void chat.excluirSessao(id)}
      />

      {/* Drawer Lateral de Configuração de Agente / Motor / Modelo */}
      <Show when={configLateralAberta()}>
        <div
          class="fixed inset-0 bg-black/60 z-40 backdrop-blur-xs transition-opacity"
          onClick={() => setConfigLateralAberta(false)}
        />
        <aside
          data-testid="drawer-lateral-config"
          class="fixed inset-y-0 right-0 w-84 sm:w-105 bg-zinc-950/95 border-l border-zinc-800/80 shadow-2xl z-50 flex flex-col backdrop-blur-md animate-in slide-in-from-right duration-200"
        >
          {/* Header do Drawer */}
          <div class="h-12 px-4 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/40 select-none">
            <div class="flex items-center gap-2">
              <Cpu size={16} class="text-emerald-400" />
              <span class="font-semibold text-sm text-zinc-100">Configurar Motor & Modelo</span>
            </div>
            <IconButton
              size="sm"
              variant="ghost"
              onClick={() => setConfigLateralAberta(false)}
              title="Fechar painel"
            >
              <X size={15} />
            </IconButton>
          </div>

          {/* Conteúdo rolável */}
          <div class="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin text-xs">
            {/* Escolha do Agente */}
            <div class="space-y-1.5">
              <label class="font-medium text-zinc-300 block">Agente do Workspace</label>
              <select
                class="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/80 cursor-pointer"
                value={chat.agenteConfig()}
                onChange={(e) => void chat.aoMudarAgenteConfig(e.currentTarget.value)}
              >
                <For each={chat.listaAgentes()}>
                  {(ag) => (
                    <option value={ag.id} selected={ag.id === chat.agenteConfig()}>
                      {ag.id} — {ag.role || ag.id} ({ag.harness || (ag as any).engine || "opencode"})
                    </option>
                  )}
                </For>
              </select>
              <p class="text-[11px] text-zinc-500">
                Selecione o agente que deseja inspecionar ou direcionar as ordens do chat.
              </p>
            </div>

            {/* Override efetivo de Config → Modelos (settings.secretary.*) */}
            <Show when={chat.overrideAgente() || chat.overrideModelo()}>
              <div class="p-2.5 rounded-lg bg-sky-950/30 border border-sky-800/50 text-[11px] text-sky-200 leading-relaxed">
                Override ativo em Config → Modelos:{" "}
                <Show when={chat.overrideAgente()}>
                  <span class="font-mono">agente @{chat.overrideAgente()}</span>
                </Show>
                <Show when={chat.overrideAgente() && chat.overrideModelo()}> · </Show>
                <Show when={chat.overrideModelo()}>
                  <span class="font-mono">modelo {chat.overrideModelo()}</span>
                </Show>
                . O chat usa esses valores em tempo de execução.
              </div>
            </Show>

            {/* Motor de Execução (Harness) */}
            <div class="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between">
              <div class="space-y-0.5">
                <span class="font-medium text-zinc-300 block">Motor de Execução (Harness)</span>
                <p class="text-[11px] text-zinc-500">
                  Inferido pelo identificador <span class="font-mono text-zinc-400">provedor/modelo</span>
                </p>
              </div>
              <span class="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-emerald-400 border border-zinc-700/60 font-semibold">
                {chat.motorInferido()}
              </span>
            </div>

            {/* Modelo Principal */}
            <div class="space-y-1.5">
              <label class="font-medium text-zinc-300 block">Modelo Principal</label>
              <input
                type="text"
                class="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/80"
                placeholder="ex.: openrouter/google/gemini-2.5-flash ou meta-llama/llama-3.3-70b-instruct:free"
                value={chat.modeloConfig()}
                onInput={(e) => chat.setModeloConfig(e.currentTarget.value)}
              />

              {/* Sugestões Rápidas de Modelos Populares */}
              <div class="space-y-1 pt-1">
                <span class="text-[11px] text-zinc-400 flex items-center gap-1">
                  <Sparkles size={11} class="text-amber-400" /> Presets rápidos (clique para selecionar):
                </span>
                <div class="flex flex-wrap gap-1">
                  <For each={MODELOS_PRESETS_POPULARES}>
                    {(mod) => {
                      const selecionado = () => chat.modeloConfig() === mod;
                      return (
                        <button
                          type="button"
                          onClick={() => chat.setModeloConfig(mod)}
                          class={`px-2 py-0.5 rounded-full text-[10px] font-mono border transition-colors cursor-pointer ${
                            selecionado()
                              ? "bg-emerald-950/50 text-emerald-300 border-emerald-500/70 font-semibold"
                              : "bg-zinc-850/80 hover:bg-zinc-750 text-zinc-300 border-zinc-700/60"
                          }`}
                        >
                          {mod.split("/").slice(-1)[0]}
                        </button>
                      );
                    }}
                  </For>
                </div>
              </div>
            </div>

            {/* Rotação e Fallback de Modelos */}
            <div class="space-y-1.5">
              <label class="font-medium text-zinc-300 block">
                Lista de Rotação / Fallback
              </label>
              <textarea
                rows={4}
                class="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/80 scrollbar-thin resize-none leading-relaxed"
                placeholder={"openrouter/google/gemini-2.5-flash\nmeta-llama/llama-3.3-70b-instruct:free\ndeepseek/deepseek-r1:free"}
                value={chat.rotacaoConfig()}
                onInput={(e) => chat.setRotacaoConfig(e.currentTarget.value)}
              />

              <div class="p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800/80 space-y-1">
                <div class="flex items-center gap-1 text-zinc-300 font-medium">
                  <Info size={12} class="text-emerald-400" />
                  <span>Sintaxe Unificada & Rotação:</span>
                </div>
                <p class="text-[11px] text-zinc-400 leading-snug">
                  Informe 1 modelo por linha (ou separados por vírgula) na ordem de prioridade. Em caso de esgotamento de cota ou erro, o motor rotaciona automaticamente.
                </p>
                <p class="text-[10px] text-zinc-500 font-mono">
                  Ex.: <span class="text-emerald-400/90">openrouter/google/gemini-2.5-flash</span>, <span class="text-emerald-400/90">meta-llama/llama-3.3-70b-instruct:free</span>
                </p>
              </div>
            </div>

            {/* Área de Teste de Conexão */}
            <div class="pt-2 border-t border-zinc-800/80 space-y-2">
              <div class="flex items-center justify-between">
                <span class="font-medium text-zinc-300">Diagnóstico de Conectividade</span>
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => void chat.testarMotorConexao()}
                  disabled={chat.testandoMotor()}
                >
                  <Show when={chat.testandoMotor()} fallback={<Play size={12} class="mr-1 text-emerald-400" />}>
                    <RefreshCw size={12} class="mr-1 animate-spin text-emerald-400" />
                  </Show>
                  {chat.testandoMotor() ? "Testando..." : "Testar Conexão"}
                </Button>
              </div>

              <Show when={chat.resultadoTeste()}>
                <div
                  class={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                    chat.resultadoTeste()!.ok
                      ? "bg-emerald-950/20 border-emerald-800/60 text-emerald-300"
                      : "bg-rose-950/20 border-rose-800/60 text-rose-300"
                  }`}
                >
                  <Show
                    when={chat.resultadoTeste()!.ok}
                    fallback={<AlertCircle size={15} class="shrink-0 mt-0.5 text-rose-400" />}
                  >
                    <Check size={15} class="shrink-0 mt-0.5 text-emerald-400" />
                  </Show>
                  <div class="space-y-0.5">
                    <p class="font-medium">{chat.resultadoTeste()!.msg}</p>
                    <Show when={chat.resultadoTeste()!.latencyMs !== undefined}>
                      <p class="text-[10px] text-zinc-400 font-mono">
                        Latência: {chat.resultadoTeste()!.latencyMs}ms
                      </p>
                    </Show>
                  </div>
                </div>
              </Show>
            </div>
          </div>

          {/* Rodapé de Ações */}
          <div class="p-3 border-t border-zinc-800/80 flex items-center justify-between gap-2 bg-zinc-900/60">
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setConfigLateralAberta(false)}
            >
              Cancelar
            </Button>
            <div class="flex items-center gap-1.5">
              <Button
                size="xs"
                variant="secondary"
                onClick={() => {
                  chat.aplicarAgenteAoChat();
                  setConfigLateralAberta(false);
                }}
                title="Apenas direciona o chat atual para este modelo e rotação em memória"
              >
                Aplicar ao Chat
              </Button>
              <Button
                size="xs"
                variant="primary"
                onClick={() => void salvarEFechar()}
                disabled={chat.salvandoConfig()}
                title="Grava o modelo e a lista de rotação permanentemente no agente e workspace"
              >
                <Show when={chat.salvandoConfig()} fallback={<Check size={13} class="mr-1" />}>
                  <RefreshCw size={13} class="mr-1 animate-spin" />
                </Show>
                {chat.salvandoConfig() ? "Salvando..." : "Salvar no Agente / Config"}
              </Button>
            </div>
          </div>
        </aside>
      </Show>
    </div>
  );
};
