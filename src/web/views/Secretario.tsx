import { type Component, createSignal, onMount, onCleanup, For, Show } from "solid-js";
import { Plus, History, Bot, Sparkles, AlertCircle, Users } from "lucide-solid";
import { useNavigate } from "@solidjs/router";
import { SessionTurn, type ChatMensagem } from "../components/chat/SessionTurn";
import { PromptInput, type Anexo } from "../components/chat/PromptInput";
import { HistoricoModal, type SessaoResumo } from "../components/chat/HistoricoModal";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { showToast } from "../ui/Toast";
import { fetchApi, wsAtivo, headers } from "../lib/context";

export const SecretarioView: Component = () => {
  const navigate = useNavigate();
  const [sessoes, setSessoes] = createSignal<SessaoResumo[]>([]);
  const sessaoInicial = () => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("sessao") || localStorage.getItem("opencorp_secretario_sessao") || null;
    } catch {
      return null;
    }
  };
  const [sessaoAtivaId, setSessaoAtivaIdRaw] = createSignal<string | null>(sessaoInicial());
  const setSessaoAtivaId = (id: string | null) => {
    setSessaoAtivaIdRaw(id);
    try {
      if (id) {
        localStorage.setItem("opencorp_secretario_sessao", id);
        const url = new URL(window.location.href);
        url.searchParams.set("sessao", id);
        window.history.replaceState({}, "", url.toString());
      } else {
        localStorage.removeItem("opencorp_secretario_sessao");
        const url = new URL(window.location.href);
        url.searchParams.delete("sessao");
        window.history.replaceState({}, "", url.toString());
      }
    } catch {}
  };
  const [mensagens, setMensagens] = createSignal<ChatMensagem[]>([]);
  const [inputValor, setInputValor] = createSignal("");
  const [anexos, setAnexos] = createSignal<Anexo[]>([]);
  const [agente, setAgente] = createSignal<"secretario" | "secretario-exec">("secretario-exec");
  const [carregando, setCarregando] = createSignal(false);
  const [historicoAberto, setHistoricoAberto] = createSignal(false);
  const [decorridoSegundos, setDecorridoSegundos] = createSignal(0);

  let feedRef!: HTMLDivElement;
  let textareaRef: HTMLTextAreaElement | undefined;
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
      const status = await fetchApi<{ rodando?: boolean }>("/secretario/status").catch(() => null);
      if (status && !status.rodando) {
        await fetchApi("/secretario/start", { method: "POST" }).catch(() => null);
      }
      const listaRaw = await fetchApi<any[]>("/secretario/sessoes");
      const lista: SessaoResumo[] = (listaRaw || []).map((s) => ({
        id: s.id,
        titulo: s.titulo_real || s.title || s.titulo || `Conversa ${s.id.slice(0, 8)}`,
        criado_em: s.time?.created || s.created || s.criado_em,
        atualizado_em: s.time?.updated || s.updated || s.atualizado_em,
        mensagens_count: s.summary?.files,
      }));
      setSessoes(lista);
      const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const urlSessaoId = params?.get("sessao");
      const ativa = urlSessaoId || sessaoAtivaId();
      if (ativa && lista.some((s) => s.id === ativa)) {
        selecionarSessao(ativa);
      } else if (lista.length > 0 && !sessaoAtivaId()) {
        selecionarSessao(lista[0].id);
      }
    } catch (err) {
      console.error("Erro ao carregar sessões do secretário:", err);
    }
  };

  let monitorTimeout: any = null;

  const pararMonitoramento = () => {
    if (monitorTimeout) {
      clearTimeout(monitorTimeout);
      monitorTimeout = null;
    }
  };

  const retomarMonitoramento = (sessaoId: string) => {
    pararMonitoramento();
    setCarregando(true);
    let tentativasSemMudanca = 0;
    let ultimoHash = "";

    if (!timerInterval) {
      timerInterval = setInterval(() => {
        setDecorridoSegundos((s) => s + 1);
      }, 1000);
    }

    const tick = async () => {
      if (sessaoAtivaId() !== sessaoId) {
        pararMonitoramento();
        setCarregando(false);
        if (timerInterval) {
          clearInterval(timerInterval);
          timerInterval = null;
        }
        return;
      }
      try {
        const msgs = await fetchApi<ChatMensagem[]>(`/secretario/sessoes/${encodeURIComponent(sessaoId)}/mensagens`);
        if (!Array.isArray(msgs)) {
          monitorTimeout = setTimeout(tick, 1000);
          return;
        }

        const ult = msgs[msgs.length - 1];
        // Hash de mudança para re-renderização
        const hash = msgs.length + ":" + (ult?.content?.length ?? 0) + ":" + (ult?.pensamento?.length ?? 0) + ":" + (ult?.acoes?.length ?? 0) + ":" + (ult?.passos?.length ?? 0) + ":" + ult?.concluida;
        if (hash !== ultimoHash) {
          ultimoHash = hash;
          tentativasSemMudanca = 0;
          setMensagens(msgs);
          setTimeout(scrollFim, 30);
        } else {
          tentativasSemMudanca++;
        }

        // Se a última mensagem for do assistente e estiver concluída, encerra monitoramento
        if (ult && ult.role === "assistant" && ult.concluida === true) {
          pararMonitoramento();
          setCarregando(false);
          if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
          }
          return;
        }

        if (tentativasSemMudanca > 240) { // ~4 minutos sem atividade
          setMensagens((prev) => {
            const u = prev[prev.length - 1];
            if (u && u.role === "assistant") {
              return [...prev.slice(0, -1), { ...u, concluida: true }];
            }
            return prev;
          });
          pararMonitoramento();
          setCarregando(false);
          if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
          }
          return;
        }
      } catch {
        // ignora erros pontuais de conexão
      }
      monitorTimeout = setTimeout(tick, 1000);
    };

    // Primeiro tick imediato, depois a cada 1s
    tick();
  };

  const selecionarSessao = async (id: string) => {
    pararMonitoramento();
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    setSessaoAtivaId(id);
    try {
      const msgs = await fetchApi<ChatMensagem[]>(`/secretario/sessoes/${encodeURIComponent(id)}/mensagens`);
      const lista = Array.isArray(msgs) ? msgs : [];
      setMensagens(lista);
      setTimeout(scrollFim, 50);

      const ult = lista[lista.length - 1];
      const sessaoOcupada = sessoes().find((s) => s.id === id && (s as any).executando);
      const emAndamento = Boolean(sessaoOcupada) || (ult && (ult.concluida === false || ult.role === "user"));

      if (emAndamento) {
        setCarregando(true);
        const criadoMs = ult?.criado_em ? new Date(ult.criado_em).getTime() : Date.now();
        const decorridoInicial = Math.max(0, Math.floor((Date.now() - criadoMs) / 1000));
        setDecorridoSegundos(decorridoInicial);

        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
          setDecorridoSegundos((s) => s + 1);
        }, 1000);
        retomarMonitoramento(id);
      } else {
        setCarregando(false);
        if (timerInterval) {
          clearInterval(timerInterval);
          timerInterval = null;
        }
      }
    } catch {
      setMensagens([]);
      setCarregando(false);
    }
  };

  const novaConversa = () => {
    pararMonitoramento();
    if (abortController) {
      abortController.abort();
      setCarregando(false);
    }
    setSessaoAtivaId(null);
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
    pararMonitoramento();
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
    if (textareaRef) {
      textareaRef.focus();
      textareaRef.style.height = "auto";
      textareaRef.style.height = `${Math.min(textareaRef.scrollHeight, 180)}px`;
    }
    showToast("Prompt restaurado para edição!", "sucesso");
  };

  const enviarMensagem = async () => {
    pararMonitoramento();
    const texto = inputValor().trim();
    const imgs = anexos().map((a) => a.url);
    if (!texto && imgs.length === 0) return;

    // Se havia mensagem do assistente pendente, fecha antes do novo envio
    setMensagens((prev) => {
      const ult = prev[prev.length - 1];
      if (ult && ult.role === "assistant" && ult.concluida === false) {
        return [...prev.slice(0, -1), { ...ult, concluida: true }];
      }
      return prev;
    });

    const sid = sessaoAtivaId();

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
      const urlStream = sid
        ? `/secretario/conversa/stream?sessao=${encodeURIComponent(sid)}&workspace=${encodeURIComponent(wsAtivo())}`
        : `/secretario/conversa/stream?workspace=${encodeURIComponent(wsAtivo())}`;

      const corpoEnvio: any = {
        mensagem: texto,
        prompt: texto,
        agente: agente(),
        imagens: imgs,
      };
      if (sid) corpoEnvio.sessao_id = sid;

      const resp = await fetch(urlStream, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(corpoEnvio),
        signal: abortController.signal,
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("Stream indisponível");

      let buffer = "";
      let currentEvent = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const linhas = buffer.split("\n");
        buffer = linhas.pop() ?? "";

        for (const linha of linhas) {
          const trimmed = linha.trim();

          // SSE: "event: <tipo>"
          if (trimmed.startsWith("event: ")) {
            currentEvent = trimmed.slice(7).trim();
            continue;
          }

          // SSE: "data: <json>"
          if (!trimmed.startsWith("data: ")) {
            // Linha vazia = fim do evento SSE (reset)
            if (trimmed === "") currentEvent = "";
            continue;
          }

          const jsonStr = trimmed.slice(6).trim();
          if (jsonStr === "[DONE]") continue;

          try {
            const payload = JSON.parse(jsonStr);
            const evtType = currentEvent || payload.tipo || "";

            // Atualizar sessaoAtivaId com o ID real do servidor
            if (evtType === "inicio" && payload.sessao_id) {
              setSessaoAtivaId(payload.sessao_id);
            }

            setMensagens((prev) => {
              const ultIdx = prev.length - 1;
              if (ultIdx < 0) return prev;
              const assistente = { ...prev[ultIdx] };

              if (evtType === "status" || evtType === "fallback_modelo") {
                if (payload.aviso) {
                  showToast(payload.aviso, "aviso");
                  const passos = [...(assistente.passos || [])];
                  passos.push({
                    tipo: "texto",
                    texto: `\n> ⚠️ *${payload.aviso}*\n\n`,
                  });
                  assistente.passos = passos;
                }
              } else if (evtType === "passos" && Array.isArray(payload.passos)) {
                assistente.passos = payload.passos;
              } else if (evtType === "delta") {
                const deltaTxt = payload.delta || payload.texto || "";
                assistente.content += deltaTxt;
                const passos = [...(assistente.passos || [])];
                const ultP = passos[passos.length - 1];
                if (ultP && ultP.tipo === "texto") {
                  ultP.texto = (ultP.texto || "") + deltaTxt;
                } else if (deltaTxt) {
                  passos.push({ tipo: "texto", texto: deltaTxt });
                }
                assistente.passos = passos;
              } else if (evtType === "pensamento") {
                const deltaTxt = payload.delta || payload.pensamento || payload.texto || "";
                assistente.pensamento = (assistente.pensamento || "") + deltaTxt;
                const passos = [...(assistente.passos || [])];
                const ultP = passos[passos.length - 1];
                if (ultP && ultP.tipo === "pensamento") {
                  ultP.texto = (ultP.texto || "") + deltaTxt;
                } else if (deltaTxt) {
                  passos.push({ tipo: "pensamento", texto: deltaTxt });
                }
                assistente.passos = passos;
              } else if (evtType === "acao") {
                const passos = [...(assistente.passos || [])];
                if (Array.isArray(payload.itens) && payload.itens.length > 0) {
                  for (const item of payload.itens) {
                    passos.push({
                      tipo: "acao",
                      ferramenta: item.ferramenta || item.tool || "ferramenta",
                      resumo: item.resumo || item.summary || "executando...",
                      sucesso: item.sucesso !== false,
                    });
                  }
                } else if (payload.ferramenta) {
                  passos.push({
                    tipo: "acao",
                    ferramenta: payload.ferramenta,
                    resumo: payload.resumo || "executando...",
                    sucesso: payload.sucesso !== false,
                  });
                }
                assistente.passos = passos;
              } else if (evtType === "hitl") {
                assistente.hitl = payload.hitl || payload;
              } else if (evtType === "fim") {
                assistente.concluida = true;
                if (payload.resposta && !assistente.content) {
                  assistente.content = payload.resposta;
                }
              } else if (evtType === "erro") {
                assistente.concluida = true;
                assistente.content = assistente.content || `(erro: ${payload.erro || "desconhecido"})`;
              }

              return [...prev.slice(0, ultIdx), assistente];
            });

            scrollFim();
          } catch {}

          currentEvent = "";
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
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
      setCarregando(false);
      abortController = null;
      void carregarSessoes();
      const sidFinal = sessaoAtivaId();
      if (sidFinal) {
        void fetchApi<ChatMensagem[]>(`/secretario/sessoes/${encodeURIComponent(sidFinal)}/mensagens`)
          .then((msgsFinais) => {
            if (Array.isArray(msgsFinais) && msgsFinais.length > 0) {
              setMensagens(msgsFinais);
            }
          })
          .catch(() => null);
      }
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
    pararMonitoramento();
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
          <Button size="xs" variant="secondary" onClick={() => navigate("/reunioes")} title="Reuniões Multi-Agente">
            <Users size={13} class="mr-1" /> Reuniões
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
          refTextarea={(el) => (textareaRef = el)}
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
