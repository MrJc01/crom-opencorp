import { createSignal, onMount, onCleanup } from "solid-js";
import { INITIAL_TABS, INTERLEAVED_SIMULATION_PARTS } from "./mockData";
import type { TabSession, PrototypeMessage, MessagePart } from "./types";

export function useSimulationEngine() {
  const [tabs, setTabs] = createSignal<TabSession[]>(JSON.parse(JSON.stringify(INITIAL_TABS)));
  const [activeTabId, setActiveTabId] = createSignal<string>("tab-1");
  const [messages, setMessages] = createSignal<PrototypeMessage[]>([]);
  
  // Controle da simulação
  const [isSimulating, setIsSimulating] = createSignal(true);
  const [simStep, setSimStep] = createSignal<string>("idle");
  const [typewriterText, setTypewriterText] = createSignal("");
  const [loopProgress, setLoopProgress] = createSignal(0);

  // Model, Agent & Context Selectors
  const [selectedModel, setSelectedModel] = createSignal("openrouter/google/gemini-2.5-flash");
  const [selectedAgent, setSelectedAgent] = createSignal("secretario-exec");
  const [selectedContext, setSelectedContext] = createSignal("Default (Workspace)");
  const [rotationList, setRotationList] = createSignal(
    "openrouter/google/gemini-2.5-flash\nopencode/nemotron-3-ultra-free\nopenrouter/openrouter/free"
  );

  // Controles de Visibilidade (Ocultar Raciocínio / Ocultar Shell)
  const [mostrarPensamento, setMostrarPensamento] = createSignal(true);
  const [mostrarAcoes, setMostrarAcoes] = createSignal(true);

  // Alerta de Falha / Rotação de Modelo (igual à produção)
  const [rotationAlert, setRotationAlert] = createSignal<string | null>(null);
  const [simulateRotationError, setSimulateRotationError] = createSignal(false);

  // Drawer Lateral de Configuração
  const [isConfigDrawerOpen, setIsConfigDrawerOpen] = createSignal(false);

  // Gerenciamento de expansão de blocos individuais (armazenado por ID do part)
  const [expandedParts, setExpandedParts] = createSignal<Record<string, boolean>>({
    "part-r1": true,
    "part-tool1": true,
    "part-r2": true,
    "part-tool2": true,
    "part-r3": true,
  });

  const togglePart = (partId: string) => {
    setExpandedParts((prev) => ({
      ...prev,
      [partId]: !prev[partId],
    }));
  };

  const isPartExpanded = (partId: string) => {
    const map = expandedParts();
    return map[partId] !== false; // Padrão aberto
  };

  let loopInterval: any = null;
  let animTimer: any = null;
  const TOTAL_CYCLE_MS = 20000;
  let cycleStartTime = Date.now();

  const resetMessages = () => {
    setMessages([]);
    setTypewriterText("");
  };

  const selectTab = (id: string) => {
    setActiveTabId(id);
    setTabs((prev) =>
      prev.map((t) => ({ ...t, active: t.id === id }))
    );
  };

  const addTab = () => {
    const newId = `tab-${Date.now()}`;
    const newTab: TabSession = {
      id: newId,
      title: `Nova Sessão #${tabs().length + 1}`,
      active: true,
      agent: selectedAgent(),
      model: selectedModel(),
      tokensTotal: 0,
      costEstimate: "$0.0000",
      updatedAt: "Agora",
    };
    setTabs((prev) => [...prev.map((t) => ({ ...t, active: false })), newTab]);
    setActiveTabId(newId);
    setMessages([]);
  };

  const closeTab = (id: string, e?: MouseEvent) => {
    e?.stopPropagation();
    if (tabs().length <= 1) return;
    const rem = tabs().filter((t) => t.id !== id);
    setTabs(rem);
    if (activeTabId() === id) {
      selectTab(rem[rem.length - 1]!.id);
    }
  };

  const dismissRotationAlert = () => setRotationAlert(null);

  // Demonstração interativa de erro 429 com rotação / fallback instantâneo
  const triggerRotationDemo = () => {
    setRotationAlert(
      "Alerta de Rotação (429 Rate Limit): gemini-2.5-flash esgotado. Rotacionado com sucesso para opencode/nemotron-3-ultra-free."
    );
    setSelectedModel("opencode/nemotron-3-ultra-free");
    restartLoop();
  };

  // Executa uma iteração completa do fluxo intercalado (interleaved stream)
  const runCycle = async () => {
    if (!isSimulating()) return;
    cycleStartTime = Date.now();
    resetMessages();
    selectTab("tab-1");
    setSimStep("typing");

    // 1. Digitação automática da ordem
    const fullPrompt = "Analise os vídeos de hoje e gere o boletim";
    let typed = "";
    for (let i = 0; i < fullPrompt.length; i++) {
      if (!isSimulating()) return;
      typed += fullPrompt[i];
      setTypewriterText(typed);
      await new Promise((r) => setTimeout(r, 24));
    }

    await new Promise((r) => setTimeout(r, 320));
    if (!isSimulating()) return;

    // 2. Envio da mensagem do usuário
    setSimStep("sending");
    const userMsg: PrototypeMessage = {
      id: `msg-user-${Date.now()}`,
      role: "user",
      content: fullPrompt,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    const asstMsgId = `msg-asst-${Date.now()}`;
    const initialAsstMsg: PrototypeMessage = {
      id: asstMsgId,
      role: "assistant",
      parts: [],
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages([userMsg, initialAsstMsg]);
    setTypewriterText("");

    const addPart = (part: MessagePart) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === asstMsgId
            ? { ...m, parts: [...(m.parts || []), part] }
            : m
        )
      );
    };

    const updatePart = (partId: string, updates: Partial<MessagePart>) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === asstMsgId
            ? {
                ...m,
                parts: (m.parts || []).map((p) =>
                  p.id === partId ? ({ ...p, ...updates } as MessagePart) : p
                ),
              }
            : m
        )
      );
    };

    // ETAPA 1: Pensamento Inicial
    setSimStep("thinking_1");
    await new Promise((r) => setTimeout(r, 350));
    if (!isSimulating()) return;
    addPart({ ...INTERLEAVED_SIMULATION_PARTS[0]! });

    // Se a simulação de rotação estiver ativa, exibe falha no modelo primário
    if (simulateRotationError()) {
      await new Promise((r) => setTimeout(r, 800));
      setRotationAlert(
        "Alerta de Rotação (429 Rate Limit): openrouter/google/gemini-2.5-flash esgotado. Rotacionado com sucesso para opencode/nemotron-3-ultra-free."
      );
      setSelectedModel("opencode/nemotron-3-ultra-free");
    }

    // ETAPA 2: Explicação Inicial
    await new Promise((r) => setTimeout(r, 1200));
    if (!isSimulating()) return;
    setSimStep("explaining_1");
    addPart({ ...INTERLEAVED_SIMULATION_PARTS[1]! });

    // ETAPA 3: Tool 1 (Shell - Check streams)
    await new Promise((r) => setTimeout(r, 1100));
    if (!isSimulating()) return;
    setSimStep("tool_1");
    const tool1 = INTERLEAVED_SIMULATION_PARTS[2]!;
    addPart({ ...tool1, status: "executing" });

    // Conclusão da Tool 1
    await new Promise((r) => setTimeout(r, 900));
    if (!isSimulating()) return;
    updatePart(tool1.id, { status: "success" });

    // ETAPA 4: Pensamento 2 (Avaliando lives e planejando schedule)
    await new Promise((r) => setTimeout(r, 850));
    if (!isSimulating()) return;
    setSimStep("thinking_2");
    addPart({ ...INTERLEAVED_SIMULATION_PARTS[3]! });

    // ETAPA 5: Tool 2 (Shell - Get schedule)
    await new Promise((r) => setTimeout(r, 1300));
    if (!isSimulating()) return;
    setSimStep("tool_2");
    const tool2 = INTERLEAVED_SIMULATION_PARTS[4]!;
    addPart({ ...tool2, status: "executing" });

    // Conclusão da Tool 2
    await new Promise((r) => setTimeout(r, 900));
    if (!isSimulating()) return;
    updatePart(tool2.id, { status: "success" });

    // ETAPA 6: Pensamento 3 (Sintetizando e consolidando boletim)
    await new Promise((r) => setTimeout(r, 850));
    if (!isSimulating()) return;
    setSimStep("thinking_3");
    addPart({ ...INTERLEAVED_SIMULATION_PARTS[5]! });

    // ETAPA 7: Resposta Final Formatada em Markdown
    await new Promise((r) => setTimeout(r, 1300));
    if (!isSimulating()) return;
    setSimStep("final_response");
    addPart({ ...INTERLEAVED_SIMULATION_PARTS[6]! });

    // ETAPA 8: Conclusão e Demonstração de Alternância de Abas
    await new Promise((r) => setTimeout(r, 3200));
    if (!isSimulating()) return;
    setSimStep("completed");
    selectTab("tab-2");
    await new Promise((r) => setTimeout(r, 1200));
    if (!isSimulating()) return;
    selectTab("tab-1");

    await new Promise((r) => setTimeout(r, 2000));
  };

  const toggleSimulating = () => {
    setIsSimulating((v) => !v);
    if (!isSimulating()) {
      clearTimeout(animTimer);
    } else {
      void runCycle();
    }
  };

  const restartLoop = () => {
    clearTimeout(animTimer);
    setIsSimulating(true);
    cycleStartTime = Date.now();
    void runCycle();
  };

  const submitManualPrompt = (customText?: string) => {
    const text = customText || typewriterText();
    if (!text.trim()) return;
    setIsSimulating(false);
    const userMsg: PrototypeMessage = {
      id: `msg-user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    const asstMsg: PrototypeMessage = {
      id: `msg-asst-${Date.now()}`,
      role: "assistant",
      parts: [
        {
          type: "reasoning",
          id: `r-${Date.now()}`,
          title: "Pensamento (1s)",
          durationSeconds: 1,
          completed: true,
          thoughts: [
            `Ordem recebida: "${text}"`,
            `Executando via modelo ativo: ${selectedModel()}`,
            `Workspace direcionado: ${selectedContext()}`,
          ],
        },
        {
          type: "tool",
          id: `t-${Date.now()}`,
          tool: "shell",
          command: `./bin/opencorp.mjs agent run "${text.slice(0, 35)}"`,
          durationMs: 240,
          exitCode: 0,
          status: "success",
          output: `stdout: comando executado com sucesso\n[agente] ${selectedAgent()} em execução\n[ok] pronto para receber próximas instruções`,
        },
        {
          type: "text",
          id: `txt-${Date.now()}`,
          content: `Ordem processada com sucesso via **${selectedModel().split("/").slice(-1)[0]}** pelo agente **@${selectedAgent()}**. Todas as métricas foram atualizadas.`,
        },
      ],
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, userMsg, asstMsg]);
    setTypewriterText("");
  };

  onMount(() => {
    void runCycle();

    loopInterval = setInterval(() => {
      if (!isSimulating()) return;
      const elapsed = (Date.now() - cycleStartTime) % TOTAL_CYCLE_MS;
      const progress = Math.min(100, Math.floor((elapsed / TOTAL_CYCLE_MS) * 100));
      setLoopProgress(progress);

      if (elapsed < 300 && simStep() === "completed") {
        void runCycle();
      }
    }, 120);

    onCleanup(() => {
      clearInterval(loopInterval);
      clearTimeout(animTimer);
    });
  });

  return {
    tabs,
    activeTabId,
    selectTab,
    addTab,
    closeTab,
    messages,
    isSimulating,
    toggleSimulating,
    restartLoop,
    simStep,
    typewriterText,
    setTypewriterText,
    submitManualPrompt,
    loopProgress,
    selectedModel,
    setSelectedModel,
    selectedAgent,
    setSelectedAgent,
    selectedContext,
    setSelectedContext,
    rotationList,
    setRotationList,
    mostrarPensamento,
    toggleMostrarPensamento: () => setMostrarPensamento((v) => !v),
    mostrarAcoes,
    toggleMostrarAcoes: () => setMostrarAcoes((v) => !v),
    rotationAlert,
    dismissRotationAlert,
    simulateRotationError,
    toggleSimulateRotationError: () => setSimulateRotationError((v) => !v),
    triggerRotationDemo,
    isConfigDrawerOpen,
    openConfigDrawer: () => setIsConfigDrawerOpen(true),
    closeConfigDrawer: () => setIsConfigDrawerOpen(false),
    toggleConfigDrawer: () => setIsConfigDrawerOpen((v) => !v),
    isPartExpanded,
    togglePart,
  };
}
