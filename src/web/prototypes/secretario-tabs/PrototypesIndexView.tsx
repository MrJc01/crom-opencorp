import { type Component, createSignal, createEffect, onMount, Switch, Match, Show } from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";
import { Play, Pause, RotateCcw, Layout, Sparkles, ExternalLink, ArrowLeft, Layers, ShieldCheck, Terminal, Wand2, Settings2 } from "lucide-solid";

import { useSimulationEngine } from "./useSimulationEngine";
import { VariantA_OpenCodeReplica } from "./variants/VariantA_OpenCodeReplica";
import { VariantB_ExecutiveStudio } from "./variants/VariantB_ExecutiveStudio";
import { VariantC_TerminalMinimal } from "./variants/VariantC_TerminalMinimal";
import { VariantD_GlassmorphicFluid } from "./variants/VariantD_GlassmorphicFluid";
import { SecretarioConfigDrawer } from "./components/SecretarioConfigDrawer";

export const PrototypesIndexView: Component = () => {
  const params = useParams();
  const navigate = useNavigate();

  // Permite selecionar variante 1, 2, 3, 4 ou slug via URL ou estado local
  const [activeVariant, setActiveVariant] = createSignal<string>("1");
  const [showGalleryBar, setShowGalleryBar] = createSignal(true);

  // Instância do motor de simulação reativo
  const sim = useSimulationEngine();

  createEffect(() => {
    if (params.variant) {
      const v = params.variant.toLowerCase();
      if (["1", "a", "pure", "opencode"].includes(v)) setActiveVariant("1");
      else if (["2", "b", "executive", "studio"].includes(v)) setActiveVariant("2");
      else if (["3", "c", "terminal", "ide"].includes(v)) setActiveVariant("3");
      else if (["4", "d", "glass", "fluid"].includes(v)) setActiveVariant("4");
    }
  });

  const selectVariant = (v: string) => {
    setActiveVariant(v);
    navigate(`/prototypes/${v}`, { replace: true });
  };

  const variantsList = [
    {
      id: "1",
      letter: "A",
      title: "Pure OpenCode Replica",
      desc: "Fidelidade máxima aos Prints 1 e 2. Abas no topo, logo sutil central e composer integrado.",
      icon: Layout,
      color: "text-emerald-400",
      activeBg: "bg-emerald-950/40 border-emerald-500/50 text-emerald-300",
    },
    {
      id: "2",
      letter: "B",
      title: "Executive Studio",
      desc: "Métricas de tokens/custo no topo, microraciocínio em pills e atalhos deslizantes de contexto.",
      icon: ShieldCheck,
      color: "text-purple-400",
      activeBg: "bg-purple-950/40 border-purple-500/50 text-purple-300",
    },
    {
      id: "3",
      letter: "C",
      title: "IDE Split / Terminal",
      desc: "Atalhos de teclado visíveis (Ctrl+1, Ctrl+T), janelas de terminal estilo VS Code e monitor de ping.",
      icon: Terminal,
      color: "text-sky-400",
      activeBg: "bg-sky-950/40 border-sky-500/50 text-sky-300",
    },
    {
      id: "4",
      letter: "D",
      title: "Glassmorphic Fluid",
      desc: "Vidro fumê acetinado (backdrop-blur), profundidade ótica, iluminação suave e acordeão elástico.",
      icon: Wand2,
      color: "text-amber-400",
      activeBg: "bg-amber-950/40 border-amber-500/50 text-amber-300",
    },
  ];

  const getStepBadge = () => {
    switch (sim.simStep()) {
      case "typing":
        return { label: "1/5 Digitando ordem...", color: "bg-amber-950/80 text-amber-300 border-amber-800/60" };
      case "sending":
        return { label: "2/5 Despachando...", color: "bg-sky-950/80 text-sky-300 border-sky-800/60" };
      case "thinking":
        return { label: "3/5 Raciocínio Sintético...", color: "bg-purple-950/80 text-purple-300 border-purple-800/60" };
      case "tool":
        return { label: "4/5 Executando Ferramenta Bash...", color: "bg-cyan-950/80 text-cyan-300 border-cyan-800/60" };
      case "tab_switch":
        return { label: "5/5 Alternando Abas...", color: "bg-indigo-950/80 text-indigo-300 border-indigo-800/60" };
      default:
        return { label: "Simulação Concluída", color: "bg-emerald-950/80 text-emerald-300 border-emerald-800/60" };
    }
  };

  return (
    <div class="flex flex-col h-screen w-screen overflow-hidden bg-black text-zinc-100 font-sans">
      {/* Barra de Navegação e Controles de Protótipo */}
      <Show when={showGalleryBar()}>
        <header class="min-h-12 py-1.5 bg-zinc-950 border-b border-zinc-800 px-2 sm:px-4 flex items-center justify-between shrink-0 z-30 select-none gap-2">
          {/* Logo & Seletor de Variantes */}
          <div class="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1 overflow-x-auto scrollbar-none">
            <div class="flex items-center gap-1.5 sm:gap-2 pr-2 sm:pr-3 border-r border-zinc-800 shrink-0">
              <button
                type="button"
                onClick={() => navigate("/secretario")}
                class="h-7 w-7 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                title="Voltar ao Chat Oficial do Secretário"
              >
                <ArrowLeft size={14} />
              </button>
              <div class="hidden sm:flex flex-col">
                <span class="text-xs font-bold text-zinc-200 tracking-wide flex items-center gap-1.5">
                  <Sparkles size={12} class="text-emerald-400" />
                  LAB SECRETÁRIO
                </span>
                <span class="text-[9px] text-zinc-500 font-mono">4 Protótipos</span>
              </div>
            </div>

            {/* Pílulas de Seleção das 4 Variantes */}
            <div class="flex items-center gap-1 shrink-0 overflow-x-auto scrollbar-none">
              {variantsList.map((v) => {
                const isCurrent = () => activeVariant() === v.id;
                return (
                  <button
                    type="button"
                    onClick={() => selectVariant(v.id)}
                    class={`px-2 sm:px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1 sm:gap-1.5 border transition-all cursor-pointer shrink-0 ${
                      isCurrent()
                        ? v.activeBg + " shadow-sm"
                        : "bg-zinc-900/60 border-zinc-800 hover:bg-zinc-850 text-zinc-400 hover:text-zinc-200"
                    }`}
                    title={v.title}
                  >
                    <span class="font-mono text-[10px] opacity-80">[{v.letter}]</span>
                    <v.icon size={12} class={isCurrent() ? v.color : "text-zinc-400"} />
                    <span class="hidden md:inline text-xs">{v.title}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Controles de Simulação em Loop (15–20s) */}
          <div class="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Badge de Etapa Atual */}
            <div
              class={`px-2 py-0.5 rounded-full border text-[10px] font-mono transition-all hidden lg:flex items-center gap-1.5 ${
                getStepBadge().color
              }`}
            >
              <span class="h-1.5 w-1.5 rounded-full bg-current animate-pulse"></span>
              <span>{getStepBadge().label}</span>
            </div>

            {/* Barra de Progresso do Ciclo */}
            <div class="w-16 sm:w-20 h-1.5 bg-zinc-850 rounded-full overflow-hidden hidden sm:block">
              <div
                class="h-full bg-gradient-to-r from-emerald-500 to-sky-400 transition-all duration-150"
                style={{ width: `${sim.loopProgress()}%` }}
              ></div>
            </div>

            {/* Botão Play / Pause */}
            <button
              type="button"
              onClick={sim.toggleSimulating}
              class={`h-7 px-2 sm:px-2.5 rounded-lg border text-[11px] sm:text-xs font-mono flex items-center gap-1 transition-colors cursor-pointer shrink-0 ${
                sim.isSimulating()
                  ? "bg-amber-950/40 border-amber-800/60 text-amber-300 hover:bg-amber-900/50"
                  : "bg-emerald-950/40 border-emerald-800/60 text-emerald-300 hover:bg-emerald-900/50"
              }`}
              title={sim.isSimulating() ? "Pausar loop de simulação" : "Retomar loop contínuo"}
            >
              {sim.isSimulating() ? <Pause size={11} /> : <Play size={11} />}
              <span class="hidden sm:inline">{sim.isSimulating() ? "Pausar" : "Iniciar"}</span>
            </button>

            {/* Botão Reiniciar Ciclo */}
            <button
              type="button"
              onClick={sim.restartLoop}
              class="h-7 w-7 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 flex items-center justify-center transition-colors cursor-pointer shrink-0"
              title="Reiniciar animação de 0s"
            >
              <RotateCcw size={12} />
            </button>

            {/* Botão Menu de Configuração Lateral (Motor, Rotação e Raciocínio) */}
            <button
              type="button"
              onClick={sim.openConfigDrawer}
              class="h-7 px-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-200 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer text-xs shrink-0 shadow-sm"
              title="Menu de Configuração Lateral do Secretário"
            >
              <Settings2 size={13} class="text-emerald-400" />
              <span class="hidden md:inline font-medium">Config Lateral</span>
            </button>
          </div>
        </header>
      </Show>

      {/* Área de Visualização do Protótipo Selecionado */}
      <main class="flex-1 min-h-0 relative overflow-hidden bg-black">
        <Switch>
          <Match when={activeVariant() === "1"}>
            <VariantA_OpenCodeReplica
              tabs={sim.tabs()}
              activeTabId={sim.activeTabId()}
              onSelectTab={sim.selectTab}
              onCloseTab={sim.closeTab}
              onAddTab={sim.addTab}
              messages={sim.messages()}
              typewriterText={sim.typewriterText()}
              onTypewriterInput={sim.setTypewriterText}
              onSubmitPrompt={sim.submitManualPrompt}
              selectedModel={sim.selectedModel()}
              onSelectModel={sim.setSelectedModel}
              selectedContext={sim.selectedContext()}
              onSelectContext={sim.setSelectedContext}
              isPartExpanded={sim.isPartExpanded}
              onTogglePart={sim.togglePart}
              mostrarPensamento={sim.mostrarPensamento()}
              mostrarAcoes={sim.mostrarAcoes()}
              rotationAlert={sim.rotationAlert()}
              onDismissRotationAlert={sim.dismissRotationAlert}
              onOpenConfig={sim.openConfigDrawer}
            />
          </Match>

          <Match when={activeVariant() === "2"}>
            <VariantB_ExecutiveStudio
              tabs={sim.tabs()}
              activeTabId={sim.activeTabId()}
              onSelectTab={sim.selectTab}
              onCloseTab={sim.closeTab}
              onAddTab={sim.addTab}
              messages={sim.messages()}
              typewriterText={sim.typewriterText()}
              onTypewriterInput={sim.setTypewriterText}
              onSubmitPrompt={sim.submitManualPrompt}
              selectedModel={sim.selectedModel()}
              onSelectModel={sim.setSelectedModel}
              selectedContext={sim.selectedContext()}
              onSelectContext={sim.setSelectedContext}
              isPartExpanded={sim.isPartExpanded}
              onTogglePart={sim.togglePart}
              mostrarPensamento={sim.mostrarPensamento()}
              mostrarAcoes={sim.mostrarAcoes()}
              rotationAlert={sim.rotationAlert()}
              onDismissRotationAlert={sim.dismissRotationAlert}
              onOpenConfig={sim.openConfigDrawer}
            />
          </Match>

          <Match when={activeVariant() === "3"}>
            <VariantC_TerminalMinimal
              tabs={sim.tabs()}
              activeTabId={sim.activeTabId()}
              onSelectTab={sim.selectTab}
              onCloseTab={sim.closeTab}
              onAddTab={sim.addTab}
              messages={sim.messages()}
              typewriterText={sim.typewriterText()}
              onTypewriterInput={sim.setTypewriterText}
              onSubmitPrompt={sim.submitManualPrompt}
              selectedModel={sim.selectedModel()}
              onSelectModel={sim.setSelectedModel}
              selectedContext={sim.selectedContext()}
              onSelectContext={sim.setSelectedContext}
              isPartExpanded={sim.isPartExpanded}
              onTogglePart={sim.togglePart}
              mostrarPensamento={sim.mostrarPensamento()}
              mostrarAcoes={sim.mostrarAcoes()}
              rotationAlert={sim.rotationAlert()}
              onDismissRotationAlert={sim.dismissRotationAlert}
              onOpenConfig={sim.openConfigDrawer}
            />
          </Match>

          <Match when={activeVariant() === "4"}>
            <VariantD_GlassmorphicFluid
              tabs={sim.tabs()}
              activeTabId={sim.activeTabId()}
              onSelectTab={sim.selectTab}
              onCloseTab={sim.closeTab}
              onAddTab={sim.addTab}
              messages={sim.messages()}
              typewriterText={sim.typewriterText()}
              onTypewriterInput={sim.setTypewriterText}
              onSubmitPrompt={sim.submitManualPrompt}
              selectedModel={sim.selectedModel()}
              onSelectModel={sim.setSelectedModel}
              selectedContext={sim.selectedContext()}
              onSelectContext={sim.setSelectedContext}
              isPartExpanded={sim.isPartExpanded}
              onTogglePart={sim.togglePart}
              mostrarPensamento={sim.mostrarPensamento()}
              mostrarAcoes={sim.mostrarAcoes()}
              rotationAlert={sim.rotationAlert()}
              onDismissRotationAlert={sim.dismissRotationAlert}
              onOpenConfig={sim.openConfigDrawer}
            />
          </Match>
        </Switch>
      </main>

      {/* Menu de Configuração Lateral do Secretário (Motor, Rotação e Raciocínio) */}
      <SecretarioConfigDrawer
        isOpen={sim.isConfigDrawerOpen()}
        onClose={sim.closeConfigDrawer}
        selectedAgent={sim.selectedAgent()}
        onSelectAgent={sim.setSelectedAgent}
        selectedModel={sim.selectedModel()}
        onSelectModel={sim.setSelectedModel}
        rotationList={sim.rotationList()}
        onUpdateRotationList={sim.setRotationList}
        mostrarPensamento={sim.mostrarPensamento()}
        onToggleMostrarPensamento={sim.toggleMostrarPensamento}
        mostrarAcoes={sim.mostrarAcoes()}
        onToggleMostrarAcoes={sim.toggleMostrarAcoes}
        simulateRotationError={sim.simulateRotationError()}
        onToggleSimulateRotationError={sim.toggleSimulateRotationError}
        onTriggerRotationDemo={sim.triggerRotationDemo}
      />
    </div>
  );
};

export default PrototypesIndexView;
