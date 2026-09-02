import { type Component, createSignal, onMount, onCleanup, For, Show } from "solid-js";
import { Plus, History, Bot, Sparkles, AlertCircle } from "lucide-solid";
import { SessionTurn, type ChatMensagem } from "../components/chat/SessionTurn";
import { PromptInput, type Anexo } from "../components/chat/PromptInput";
import { HistoricoModal, type SessaoResumo } from "../components/chat/HistoricoModal";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { showToast } from "../ui/Toast";
import { fetchApi, wsAtivo, headers } from "../lib/context";

export const SecretarioView: Component = () => {
  const [sessoes, setSessoes] = createSignal<SessaoResumo[]>([]);
  const [sessaoAtivaId, setSessaoAtivaId] = createSignal<string | null>(null);
  const [mensagens, setMensagens] = createSignal<ChatMensagem[]>([]);
  const [inputValor, setInputValor] = createSignal("");
  const [anexos, setAnexos] = createSignal<Anexo[]>([]);
  const [agente, setAgente] = createSignal<"secretario" | "secretario-exec">("secretario-exec");
  const [carregando, setCarregando] = createSignal(false);
  const [historicoAberto, setHistoricoAberto] = createSignal(false);
  const [decorridoSegundos, setDecorridoSegundos] = createSignal(0);

  let feedRef!: HTMLDivElement;
  let abortController: AbortController | null = null;
  let timerInterval: any = null;

  const SUGESTOES = [
    "O que aconteceu hoje?",
    "Como está o board de tasks?",
    "Qual o custo acumulado de LLM hoje?",
    "Rodar auditoria rápida do site",
  ];

  const scrollFim = () => {
    if (feedRef) {
      feedRef.scrollTop = feedRef.scrollHeight;
    }
  };

  const carregarSessoes = async () => {
    try {
      const lista = await fetchApi<SessaoResumo[]>("/secretario/sessoes");
      setSessoes(lista || []);
      if (!sessaoAtivaId() && lista && lista.length > 0) {
        selecionarSessao(lista[0].id);
      }
    } catch {}
  };

  const selecionarSessao = async (id: string) => {
    if (abortController) {
      abortController.abort();
      setCarregando(false);
    }
    setSessaoAtivaId(id);
    try {
      const dados = await fetchApi<{ mensagens: ChatMensagem[] }>(`/secretario/sessoes/${encodeURIComponent(id)}`);
      setMensagens(dados.mensagens || []);
      setTimeout(scrollFim, 50);
    } catch {
      setMensagens([]);
    }
  };

  const novaConversa = () => {
    if (abortController) {
      abortController.abort();
      setCarregando(false);
    }
    const novoId = `ses_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    setSessaoAtivaId(novoId);
    setMensagens([]);
    setInputValor("");
    setAnexos([]);
    showToast("Nova conversa iniciada", "info");
  };

  const excluirSessao = async (id: string) => {
    try {
      await fetchApi(`/secretario/sessoes/${encodeURIComponent(id)}`, { method: "DELETE" });
      setSessoes((prev) => prev.filter((s) => s.id !== id));
      if (sessaoAtivaId() === id) {
        novaConversa();
      }
      showToast("Conversa excluída", "sucesso");
    } catch {
      showToast("Falha ao excluir conversa", "erro");
    }
  };

  const pararStream = () => {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    if (timerInterval) clearInterval(timerInterval);
    setCarregando(false);
    setMensagens((prev) => {
      const ult = prev[prev.length - 1];
      if (ult && ult.role === "assistant" && ult.concluida === false) {
        return [...prev.slice(0, -1), { ...ult, concluida: true, content: ult.content || "(interrompido pelo usuário)" }];
      }
      return prev;
    });
    showToast("Geração interrompida", "aviso");
  };

  const editarPrompt = async (indice: number) => {
    const m = mensagens()[indice];
    if (!m || m.role !== "user") return;

    if (carregando()) {
      pararStream();
    }

    const sid = sessaoAtivaId();
    if (sid) {
      try {
        await fetchApi(`/secretario/sessoes/${encodeURIComponent(sid)}/truncar`, {
          method: "POST",
          body: JSON.stringify({ manter_ate: indice }),
        });
      } catch (err: any) {
        showToast("Falha ao truncar no servidor: " + err.message, "aviso");
      }
    }

    // Trunca mensagens localmente
    setMensagens((prev) => prev.slice(0, indice));

    // Restaura texto no input
    setInputValor(m.content);
    showToast("Prompt restaurado para edição", "info");
  };

  const enviarMensagem = async () => {
    const texto = inputValor().trim();
    const imgs = anexos().map((a) => a.url);
    if (!texto && imgs.length === 0) return;

    const sid = sessaoAtivaId() || `ses_${Date.now().toString(36)}`;
    setSessaoAtivaId(sid);

    // Adiciona mensagem do usuário
    const msgUsuario: ChatMensagem = {
      role: "user",
      content: texto,
      imagens: imgs.length > 0 ? imgs : undefined,
    };

    // Mensagem inicial do assistente com indicador de carregando
    const msgAssistente: ChatMensagem = {
      role: "assistant",
      content: "",
      pensamento: "",
      concluida: false,
      acoes: [],
    };

    setMensagens((prev) => [...prev, msgUsuario, msgAssistente]);
    setInputValor("");
    setAnexos([]);
    setCarregando(true);
    setDecorridoSegundos(0);

    setTimeout(scrollFim, 30);

    timerInterval = setInterval(() => {
      setDecorridoSegundos((s) => s + 1);
    }, 1000);

    abortController = new AbortController();

    try {
      const resp = await fetch(`/secretario/conversa/stream?sessao=${encodeURIComponent(sid)}&workspace=${encodeURIComponent(wsAtivo())}`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          prompt: texto,
          agente: agente(),
          imagens: imgs,
        }),
        signal: abortController.signal,
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("Stream indisponível");

      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const linhas = buffer.split("\n");
        buffer = linhas.pop() ?? "";

        for (const linha of linhas) {
          if (!linha.startsWith("data: ")) continue;
          const jsonStr = linha.slice(6).trim();
          if (jsonStr === "[DONE]") continue;

          try {
            const evento = JSON.parse(jsonStr);

            setMensagens((prev) => {
              const ultIdx = prev.length - 1;
              if (ultIdx < 0) return prev;
              const assistente = { ...prev[ultIdx] };

              if (evento.tipo === "delta") {
                assistente.content += evento.texto || "";
              } else if (evento.tipo === "pensamento") {
                assistente.pensamento = (assistente.pensamento || "") + (evento.texto || "");
              } else if (evento.tipo === "acao") {
                const acoes = [...(assistente.acoes || [])];
                acoes.push({
                  ferramenta: evento.ferramenta,
                  resumo: evento.resumo,
                  sucesso: evento.sucesso !== false,
                });
                assistente.acoes = acoes;
              } else if (evento.tipo === "hitl") {
                assistente.hitl = evento.hitl;
              } else if (evento.tipo === "fim") {
                assistente.concluida = true;
              }

              return [...prev.slice(0, ultIdx), assistente];
            });

            scrollFim();
          } catch {}
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        showToast("Erro na comunicação com o modelo: " + err.message, "erro");
        setMensagens((prev) => {
          const ultIdx = prev.length - 1;
          if (ultIdx < 0) return prev;
          const assistente = { ...prev[ultIdx], concluida: true, content: prev[ultIdx].content || `(erro: ${err.message})` };
          return [...prev.slice(0, ultIdx), assistente];
        });
      }
    } finally {
      if (timerInterval) clearInterval(timerInterval);
      setCarregando(false);
      abortController = null;
      void carregarSessoes();
    }
  };

  const aprovarHitl = async (hitlId: string) => {
    try {
      await fetchApi(`/secretario/hitl/${encodeURIComponent(hitlId)}/aprovar`, { method: "POST" });
      showToast("Ação autorizada com sucesso", "sucesso");
      setMensagens((prev) =>
        prev.map((m) => (m.hitl?.id === hitlId ? { ...m, hitl: undefined } : m))
      );
    } catch (err: any) {
      showToast("Erro ao aprovar ação: " + err.message, "erro");
    }
  };

  const rejeitarHitl = async (hitlId: string, motivo: string) => {
    try {
      await fetchApi(`/secretario/hitl/${encodeURIComponent(hitlId)}/rejeitar`, {
        method: "POST",
        body: JSON.stringify({ motivo }),
      });
      showToast("Ação rejeitada", "info");
      setMensagens((prev) =>
        prev.map((m) => (m.hitl?.id === hitlId ? { ...m, hitl: undefined } : m))
      );
    } catch (err: any) {
      showToast("Erro ao rejeitar ação: " + err.message, "erro");
    }
  };

  onMount(() => {
    void carregarSessoes();
  });

  onCleanup(() => {
    if (abortController) abortController.abort();
    if (timerInterval) clearInterval(timerInterval);
  });

  const decorridoFmt = () => {
    const s = decorridoSegundos();
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  return (
    <div class="flex flex-col h-full w-full overflow-hidden bg-zinc-950">
      {/* Subheader do Chat */}
      <div class="h-10 px-4 border-b border-zinc-800/80 bg-zinc-900/40 flex items-center justify-between text-xs select-none">
        <div class="flex items-center gap-2">
          <Bot size={15} class="text-emerald-400" />
          <span class="font-medium text-zinc-200">
            {sessaoAtivaId() ? `Sessão ${sessaoAtivaId()?.slice(0, 10)}...` : "Nova Conversa"}
          </span>
        </div>

        <div class="flex items-center gap-1.5">
          <Button size="xs" variant="ghost" onClick={novaConversa} title="Nova conversa">
            <Plus size={14} class="mr-1" /> Nova
          </Button>
          <Button size="xs" variant="secondary" onClick={() => setHistoricoAberto(true)} title="Ver conversas anteriores">
            <History size={13} class="mr-1" /> Histórico
          </Button>
        </div>
      </div>

      {/* Feed de Mensagens */}
      <div ref={feedRef} class="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
        <div class="max-w-3xl mx-auto w-full space-y-4">
          <Show
            when={mensagens().length > 0}
            fallback={
              <div class="py-16 text-center max-w-md mx-auto">
                <div class="h-12 w-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-emerald-400 mx-auto mb-4 shadow-lg">
                  <Sparkles size={24} />
                </div>
                <h2 class="text-lg font-semibold text-zinc-100 mb-1">Secretário Executivo</h2>
                <p class="text-xs text-zinc-400 mb-6 leading-relaxed">
                  Coordene sua empresa, execute comandos, consulte tarefas e acione agentes autônomos.
                </p>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
                  <For each={SUGESTOES}>
                    {(sug) => (
                      <button
                        onClick={() => {
                          setInputValor(sug);
                          enviarMensagem();
                        }}
                        class="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80 hover:bg-zinc-800/60 hover:border-zinc-700 text-xs text-zinc-300 transition-all cursor-pointer text-left"
                      >
                        {sug}
                      </button>
                    )}
                  </For>
                </div>
              </div>
            }
          >
            <For each={mensagens()}>
              {(m, idx) => (
                <SessionTurn
                  mensagem={m}
                  indice={idx()}
                  decorridoFmt={decorridoFmt()}
                  onEditarPrompt={editarPrompt}
                  onAprovarHitl={aprovarHitl}
                  onRejeitarHitl={rejeitarHitl}
                />
              )}
            </For>
          </Show>
        </div>
      </div>

      {/* Composer Fixo na Base */}
      <div class="p-3 border-t border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md">
        <PromptInput
          valor={inputValor()}
          onInput={setInputValor}
          onEnviar={enviarMensagem}
          onParar={pararStream}
          carregando={carregando()}
          anexos={anexos()}
          onAdicionarAnexo={(a) => setAnexos((prev) => [...prev, a])}
          onRemoverAnexo={(idx) => setAnexos((prev) => prev.filter((_, i) => i !== idx))}
          agenteSelecionado={agente()}
          onMudarAgente={setAgente}
        />
      </div>

      {/* Modal Popup de Histórico */}
      <HistoricoModal
        open={historicoAberto()}
        onOpenChange={setHistoricoAberto}
        sessoes={sessoes()}
        sessaoAtivaId={sessaoAtivaId()}
        onSelecionarSessao={selecionarSessao}
        onNovaConversa={novaConversa}
        onExcluirSessao={excluirSessao}
      />
    </div>
  );
};
