import { type Component, createSignal, createEffect, For, Show } from "solid-js";
import {
  AlertCircle,
  Cpu,
  X,
  Check,
  Play,
  RefreshCw,
} from "lucide-solid";
import { UniversalChat } from "../components/chat/UniversalChat";
import { HistoricoModal } from "../components/chat/HistoricoModal";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { useChat, MODELOS_SUGERIDOS } from "../lib/chat/store";

/** Sincroniza `?sessao=` da URL com o store (deep-link preservado). */
function sincronizarUrlSessao(id: string | null) {
  try {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("sessao", id);
    else url.searchParams.delete("sessao");
    window.history.replaceState({}, "", url.toString());
  } catch {}
}

export const SecretarioView: Component = () => {
  const chat = useChat();
  const [historicoAberto, setHistoricoAberto] = createSignal(false);
  const [configLateralAberta, setConfigLateralAberta] = createSignal(false);

  createEffect(() => {
    sincronizarUrlSessao(chat.sessaoAtivaId());
  });

  const abrirPainelLateral = async () => {
    await chat.abrirPainelLateral();
    setConfigLateralAberta(true);
  };

  const salvarEFechar = async () => {
    try {
      await chat.salvarConfigLateral();
      setConfigLateralAberta(false);
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
          modelo: chat.modeloConfig() || "opencode-go/glm-5.3-flash",
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
          class="fixed inset-y-0 right-0 w-80 sm:w-96 bg-zinc-950/95 border-l border-zinc-800/80 shadow-2xl z-50 flex flex-col backdrop-blur-md animate-in slide-in-from-right duration-200"
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
                onChange={(e) => chat.aoMudarAgenteConfig(e.currentTarget.value)}
              >
                <For each={chat.listaAgentes()}>
                  {(ag) => (
                    <option value={ag.id}>
                      {ag.id} — {ag.role || ag.id} ({ag.harness || (ag as any).engine || "opencode"})
                    </option>
                  )}
                </For>
              </select>
              <p class="text-[11px] text-zinc-500">
                Selecione o agente que deseja inspecionar ou direcionar as ordens do chat.
              </p>
            </div>

            {/* Escolha do Motor de Execução */}
            <div class="space-y-2">
              <label class="font-medium text-zinc-300 block">Motor de Execução (Harness)</label>
              <div class="grid grid-cols-1 gap-2">
                <For
                  each={[
                    {
                      id: "opencode",
                      nome: "OpenCode Engine",
                      desc: "Daemon e CLI nativos do OpenCode",
                      alias: "opencode",
                    },
                    {
                      id: "antigravity",
                      nome: "Google Antigravity (AGY)",
                      desc: "CLI isolada com suporte a skills e MCP",
                      alias: "agy",
                    },
                    {
                      id: "copilot",
                      nome: "GitHub Copilot CLI",
                      desc: "Runtime autônomo com tokens PAT/OAuth",
                      alias: "copilot",
                    },
                    {
                      id: "claude-code",
                      nome: "Claude Code CLI",
                      desc: "Motor Anthropic CLI para tarefas de código",
                      alias: "claude",
                    },
                  ]}
                >
                  {(mot) => {
                    const ativo = () => chat.motorConfig() === mot.id;
                    const inst = () => {
                      const enc = chat.listaMotores().find((m) => m.id === mot.id);
                      return enc ? enc.installed : true;
                    };
                    return (
                      <button
                        type="button"
                        onClick={() => chat.aoMudarMotorConfig(mot.id)}
                        class={`p-2.5 rounded-lg border text-left transition-all cursor-pointer flex items-start justify-between ${
                          ativo()
                            ? "bg-emerald-950/30 border-emerald-500/80 text-emerald-200 shadow-sm"
                            : "bg-zinc-900/60 border-zinc-800/80 hover:bg-zinc-850 hover:border-zinc-700 text-zinc-300"
                        }`}
                      >
                        <div class="space-y-0.5">
                          <div class="flex items-center gap-1.5 font-medium">
                            <span>{mot.nome}</span>
                            <span class="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                              {mot.alias}
                            </span>
                          </div>
                          <div class="text-[11px] text-zinc-400 leading-tight">{mot.desc}</div>
                        </div>
                        <div class="flex items-center gap-1">
                          <span
                            class={`h-2 w-2 rounded-full ${
                              inst() ? "bg-emerald-400" : "bg-zinc-600"
                            }`}
                            title={inst() ? "Motor instalado" : "Não detectado"}
                          />
                          <Show when={ativo()}>
                            <Check size={14} class="text-emerald-400 ml-1" />
                          </Show>
                        </div>
                      </button>
                    );
                  }}
                </For>
              </div>
            </div>

            {/* Modelo Principal */}
            <div class="space-y-1.5">
              <label class="font-medium text-zinc-300 block">Modelo Principal</label>
              <input
                type="text"
                class="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/80"
                placeholder="ex.: google/gemini-3.8-flash-high ou gpt-4o"
                value={chat.modeloConfig()}
                onInput={(e) => chat.setModeloConfig(e.currentTarget.value)}
              />

              {/* Sugestões Rápidas de Modelos */}
              <div class="flex flex-wrap gap-1 pt-1">
                <For each={MODELOS_SUGERIDOS[chat.motorConfig()] || []}>
                  {(mod) => (
                    <button
                      type="button"
                      onClick={() => chat.setModeloConfig(mod)}
                      class="px-2 py-0.5 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-[10px] font-mono text-zinc-300 border border-zinc-700/60 cursor-pointer transition-colors"
                    >
                      {mod.split("/").pop()}
                    </button>
                  )}
                </For>
              </div>
            </div>

            {/* Rotação e Fallback de Modelos */}
            <div class="space-y-1.5">
              <label class="font-medium text-zinc-300 block">
                Rotação / Fallback de Modelos
              </label>
              <textarea
                rows={3}
                class="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/80 scrollbar-thin resize-none"
                placeholder="1 modelo por linha para rotação de fallback"
                value={chat.rotacaoConfig()}
                onInput={(e) => chat.setRotacaoConfig(e.currentTarget.value)}
              />
              <p class="text-[11px] text-zinc-500">
                Modelos acionados automaticamente caso o principal atinja limites de quota ou erro.
              </p>
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
                title="Apenas direciona o chat atual para este agente"
              >
                Aplicar ao Chat
              </Button>
              <Button
                size="xs"
                variant="primary"
                onClick={() => void salvarEFechar()}
                disabled={chat.salvandoConfig()}
              >
                <Show when={chat.salvandoConfig()} fallback={<Check size={13} class="mr-1" />}>
                  <RefreshCw size={13} class="mr-1 animate-spin" />
                </Show>
                {chat.salvandoConfig() ? "Salvando..." : "Salvar no Agente"}
              </Button>
            </div>
          </div>
        </aside>
      </Show>
    </div>
  );
};
