import { type Component, createSignal, onMount, createEffect, For, Show } from "solid-js";
import { useSearchParams, useNavigate } from "@solidjs/router";
import {
  Users,
  Play,
  RefreshCw,
  X,
  FileText,
  CheckCircle2,
  MessageSquare,
  Plus,
  History,
  Send,
  Sparkles,
  Bot,
  ChevronDown,
  Check,
  Copy,
  Clock,
  StopCircle,
  FileCheck,
} from "lucide-solid";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { showToast } from "../ui/Toast";
import { fetchApi } from "../lib/context";
import { renderMarkdown } from "../md.js";

interface MensagemGrupo {
  agente: string;
  texto: string;
  ts: string;
}

interface SalaReuniao {
  id: string;
  pauta: string;
  participantes: string[];
  status: string;
  turno?: number;
  mensagens?: MensagemGrupo[];
  ata?: string | null;
  criado_em?: string;
  encerrada_em?: string | null;
}

export const ReunioesView: Component = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [reunioes, setReunioes] = createSignal<SalaReuniao[]>([]);
  const [agentesDisponiveis, setAgentesDisponiveis] = createSignal<any[]>([]);
  const [salaAtiva, setSalaAtiva] = createSignal<SalaReuniao | null>(null);
  const [mensagens, setMensagens] = createSignal<MensagemGrupo[]>([]);

  // Composer
  const [inputTexto, setInputTexto] = createSignal("");
  const [modoResposta, setModoResposta] = createSignal<"sequencial" | "direcionado">("sequencial");
  const [agenteAlvo, setAgenteAlvo] = createSignal<string>("");
  const [enviando, setEnviando] = createSignal(false);
  const [agenteDigitando, setAgenteDigitando] = createSignal<string | null>(null);

  // Modais
  const [modalNovaReuniao, setModalNovaReuniao] = createSignal(false);
  const [modalHistorico, setModalHistorico] = createSignal(false);
  const [modalAta, setModalAta] = createSignal(false);
  const [conteudoAta, setConteudoAta] = createSignal<string | null>(null);
  const [concluindoAta, setConcluindoAta] = createSignal(false);

  // Form nova reunião
  const [novaPauta, setNovaPauta] = createSignal("");
  const [participantesSelecionados, setParticipantesSelecionados] = createSignal<string[]>([]);
  const [criandoSala, setCriandoSala] = createSignal(false);

  let feedRef: HTMLDivElement | undefined;
  let pollingInterval: any = null;

  const scrollFim = () => {
    if (feedRef) {
      feedRef.scrollTop = feedRef.scrollHeight;
    }
  };

  const carregarReunioes = async () => {
    try {
      const [listaReunioes, listaAgentes] = await Promise.all([
        fetchApi<any[]>("/meetings").catch(() => []),
        fetchApi<any[]>("/agents").catch(() => []),
      ]);
      setReunioes(listaReunioes || []);
      setAgentesDisponiveis(listaAgentes || []);
    } catch {}
  };

  const abrirSala = async (id: string) => {
    try {
      const estado = await fetchApi<any>(`/meetings/${encodeURIComponent(id)}`);
      setSalaAtiva(estado);
      setMensagens(estado.mensagens || []);
      if (estado.participantes && estado.participantes.length > 0) {
        const nomes = estado.participantes.map((p: any) => (typeof p === "string" ? p : p.id));
        if (!agenteAlvo() || !nomes.includes(agenteAlvo())) {
          setAgenteAlvo(nomes[0]);
        }
      }
      setTimeout(scrollFim, 50);
    } catch (err: any) {
      showToast(`Erro ao carregar reunião: ${err.message}`, "erro");
    }
  };

  // Sincroniza via URL ?reuniao=...
  createEffect(() => {
    const rId = searchParams.reuniao as string | undefined;
    if (rId) {
      void abrirSala(rId);
    } else if (reunioes().length > 0 && !salaAtiva()) {
      // Abre a primeira ou mais recente reunião ativa
      const primeira = reunioes().find((r) => r.status === "em-andamento") || reunioes()[0];
      if (primeira) {
        setSearchParams({ reuniao: primeira.id });
      }
    }
  });

  // Polling a cada 4s quando em sala ativa para sincronizar mensagens
  onMount(() => {
    void carregarReunioes();
    pollingInterval = setInterval(() => {
      const ativa = salaAtiva();
      if (ativa && !enviando() && ativa.status !== "encerrada") {
        void fetchApi<any>(`/meetings/${encodeURIComponent(ativa.id)}`).then((est) => {
          if (est && Array.isArray(est.mensagens) && est.mensagens.length !== mensagens().length) {
            setMensagens(est.mensagens);
            setTimeout(scrollFim, 50);
          }
        }).catch(() => {});
      }
    }, 4000);
  });

  const criarNovaReuniao = async () => {
    const p = novaPauta().trim();
    if (!p) {
      showToast("Por favor, digite a pauta da reunião", "aviso");
      return;
    }
    setCriandoSala(true);
    try {
      const agentes = participantesSelecionados().length > 0 ? participantesSelecionados().join(",") : undefined;
      const res = await fetchApi<any>("/meetings/chat", {
        method: "POST",
        body: JSON.stringify({ pauta: p, agentes }),
      });
      setNovaPauta("");
      setParticipantesSelecionados([]);
      setModalNovaReuniao(false);
      showToast("Sala de reunião criada com sucesso!", "sucesso");
      await carregarReunioes();
      setSearchParams({ reuniao: res.id });
    } catch (err: any) {
      showToast(`Erro ao criar reunião: ${err.message}`, "erro");
    } finally {
      setCriandoSala(false);
    }
  };

  const enviarMensagem = async () => {
    const sala = salaAtiva();
    const texto = inputTexto().trim();
    if (!sala || !texto || enviando()) return;

    setInputTexto("");
    setEnviando(true);
    setAgenteDigitando(modoResposta() === "direcionado" ? agenteAlvo() : "agentes");

    // Adiciona otimista
    const msgLocal: MensagemGrupo = {
      agente: "usuario",
      texto,
      ts: new Date().toISOString(),
    };
    setMensagens((prev) => [...prev, msgLocal]);
    setTimeout(scrollFim, 30);

    try {
      const res = await fetchApi<any>(`/meetings/${encodeURIComponent(sala.id)}/mensagem`, {
        method: "POST",
        body: JSON.stringify({
          mensagem: texto,
          modo: modoResposta(),
          agente: modoResposta() === "direcionado" ? agenteAlvo() : undefined,
        }),
      });

      if (res && res.estado && Array.isArray(res.estado.mensagens)) {
        setMensagens(res.estado.mensagens);
      } else if (res && Array.isArray(res.respostas)) {
        setMensagens((prev) => [...prev, ...res.respostas]);
      }
      setTimeout(scrollFim, 50);
    } catch (err: any) {
      showToast(`Erro ao enviar mensagem: ${err.message}`, "erro");
    } finally {
      setEnviando(false);
      setAgenteDigitando(null);
    }
  };

  const concluirReuniao = async () => {
    const sala = salaAtiva();
    if (!sala) return;
    if (!confirm("Deseja concluir esta reunião e solicitar ao Secretário/Moderador a redação da Ata Oficial?")) return;

    setConcluindoAta(true);
    try {
      const res = await fetchApi<any>(`/meetings/${encodeURIComponent(sala.id)}/concluir`, {
        method: "POST",
      });
      showToast("Reunião concluída! Ata executiva gerada.", "sucesso");
      if (res.ata) {
        setConteudoAta(res.ata);
        setModalAta(true);
      }
      await carregarReunioes();
      await abrirSala(sala.id);
    } catch (err: any) {
      showToast(`Erro ao concluir reunião: ${err.message}`, "erro");
    } finally {
      setConcluindoAta(false);
    }
  };

  const toggleParticipante = (id: string) => {
    setParticipantesSelecionados((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const participantesDaSala = (): string[] => {
    const s = salaAtiva();
    if (!s) return [];
    if (Array.isArray(s.participantes)) {
      return s.participantes.map((p: any) => (typeof p === "string" ? p : p.id));
    }
    return [];
  };

  return (
    <div class="flex flex-col h-full w-full overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Subheader / Barra de Controle da Reunião */}
      <div class="h-12 px-4 border-b border-zinc-800/80 bg-zinc-900/50 backdrop-blur-xs flex items-center justify-between gap-3 text-xs select-none flex-shrink-0">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="h-8 w-8 rounded-xl bg-purple-950/60 border border-purple-800/50 flex items-center justify-center text-purple-300 flex-shrink-0">
            <Users size={16} />
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-bold text-zinc-200 truncate">
                {salaAtiva() ? salaAtiva()!.pauta : "Nenhuma Reunião Selecionada"}
              </span>
              <Show when={salaAtiva()}>
                <span
                  class={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                    salaAtiva()!.status === "em_andamento" || salaAtiva()!.status === "em-andamento"
                      ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 animate-pulse"
                      : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                  }`}
                >
                  {salaAtiva()!.status === "em_andamento" || salaAtiva()!.status === "em-andamento" ? "Ao Vivo" : "Concluída"}
                </span>
              </Show>
            </div>
            {/* Lista de chips dos agentes presentes */}
            <div class="flex items-center gap-1.5 overflow-x-auto scrollbar-none mt-0.5">
              <For each={participantesDaSala()}>
                {(ag) => (
                  <span class="text-[10px] font-mono text-purple-300/80 bg-purple-950/40 px-1.5 py-0.2 rounded border border-purple-800/40 truncate">
                    @{ag}
                  </span>
                )}
              </For>
            </div>
          </div>
        </div>

        {/* Ações da Reunião */}
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <Button size="xs" variant="ghost" onClick={() => setModalNovaReuniao(true)} title="Convocar nova reunião">
            <Plus size={14} class="mr-1" /> Nova
          </Button>
          <Button size="xs" variant="secondary" onClick={() => setModalHistorico(true)} title="Histórico de reuniões">
            <History size={13} class="mr-1" /> Reuniões ({reunioes().length})
          </Button>
          <Show when={salaAtiva() && (salaAtiva()!.status === "em_andamento" || salaAtiva()!.status === "em-andamento")}>
            <Button
              size="xs"
              variant="secondary"
              class="border-purple-800/50 hover:bg-purple-950/40 text-purple-200 font-medium"
              loading={concluindoAta()}
              onClick={concluirReuniao}
              title="Encerrar debate e redigir ata executiva"
            >
              <FileCheck size={13} class="mr-1 text-purple-400" /> Gerar Ata
            </Button>
          </Show>
          <Show when={salaAtiva()?.ata}>
            <Button
              size="xs"
              variant="ghost"
              class="text-emerald-400 hover:bg-emerald-950/30"
              onClick={() => {
                setConteudoAta(salaAtiva()!.ata!);
                setModalAta(true);
              }}
              title="Ver Ata Executiva"
            >
              <FileText size={13} class="mr-1" /> Ver Ata
            </Button>
          </Show>
        </div>
      </div>

      {/* Feed do Chat da Reunião */}
      <div ref={feedRef} class="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
        <div class="max-w-3xl mx-auto w-full space-y-4">
          <Show
            when={mensagens().length > 0}
            fallback={
              <div class="py-20 text-center max-w-md mx-auto space-y-4">
                <div class="h-12 w-12 rounded-2xl bg-purple-950/60 border border-purple-800/40 flex items-center justify-center text-purple-300 mx-auto shadow-lg">
                  <MessageSquare size={24} />
                </div>
                <div>
                  <h2 class="text-base font-bold text-zinc-100">Mesa de Reunião Aberta</h2>
                  <p class="text-xs text-zinc-400 mt-1 leading-relaxed">
                    Envie a primeira mensagem para abrir a discussão. Todos os agentes convocados responderão na sua vez ou conforme sua direção.
                  </p>
                </div>
                <div class="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 text-left text-xs space-y-1 font-mono text-zinc-300">
                  <div class="text-zinc-500 text-[10px] uppercase font-bold">Pauta:</div>
                  <div>{salaAtiva()?.pauta || "Definir diretrizes estratégicas"}</div>
                  <div class="text-zinc-500 text-[10px] uppercase font-bold mt-2">Participantes:</div>
                  <div class="text-purple-300">
                    {participantesDaSala().map((p) => `@${p}`).join(" · ") || "Nenhum participante configurado"}
                  </div>
                </div>
              </div>
            }
          >
            <For each={mensagens()}>
              {(msg) => {
                const ehUsuario = msg.agente === "usuario" || msg.agente === "humano";
                return (
                  <div class={`flex gap-3 text-xs leading-relaxed ${ehUsuario ? "justify-end" : "justify-start"}`}>
                    <Show when={!ehUsuario}>
                      <div class="h-8 w-8 rounded-xl bg-zinc-900 border border-purple-500/30 flex items-center justify-center text-purple-300 flex-shrink-0 font-mono font-bold text-xs shadow-xs">
                        {msg.agente.slice(0, 2).toUpperCase()}
                      </div>
                    </Show>

                    <div
                      class={`max-w-[85%] rounded-2xl p-4 space-y-2 shadow-xs ${
                        ehUsuario
                          ? "bg-zinc-800/90 text-zinc-100 border border-zinc-700/80 rounded-tr-xs"
                          : "bg-zinc-900/70 text-zinc-200 border border-zinc-800/90 rounded-tl-xs"
                      }`}
                    >
                      <div class="flex items-center justify-between gap-3 border-b border-zinc-800/60 pb-1.5 text-[11px]">
                        <span class={`font-mono font-bold ${ehUsuario ? "text-emerald-300" : "text-purple-400"}`}>
                          {ehUsuario ? "Você (Líder)" : `@${msg.agente}`}
                        </span>
                        <Show when={msg.ts}>
                          <span class="text-zinc-500 text-[10px] font-mono">
                            {new Date(msg.ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </Show>
                      </div>

                      <div
                        class="prose prose-invert prose-xs max-w-none text-zinc-200 leading-relaxed break-words"
                        innerHTML={renderMarkdown(msg.texto)}
                      />
                    </div>

                    <Show when={ehUsuario}>
                      <div class="h-8 w-8 rounded-xl bg-emerald-950/60 border border-emerald-500/40 flex items-center justify-center text-emerald-300 flex-shrink-0 font-bold text-xs">
                        VC
                      </div>
                    </Show>
                  </div>
                );
              }}
            </For>
          </Show>

          {/* Indicador de Agente Digitando */}
          <Show when={enviando()}>
            <div class="flex items-center gap-2 text-xs text-purple-400 font-mono py-2 animate-pulse">
              <Sparkles size={14} />
              <span>
                {agenteDigitando() === "agentes"
                  ? "Agentes em deliberação sequencial..."
                  : `@${agenteDigitando()} redigindo resposta...`}
              </span>
            </div>
          </Show>
        </div>
      </div>

      {/* Composer da Reunião com Modos de Resposta */}
      <div class="p-3 border-t border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md flex-shrink-0">
        <div class="max-w-3xl mx-auto space-y-2">
          {/* Barra de Direcionamento de Resposta */}
          <div class="flex items-center gap-2 text-xs">
            <span class="text-zinc-500 font-mono text-[11px]">Modo de Resposta:</span>
            <div class="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setModoResposta("sequencial")}
                class={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                  modoResposta() === "sequencial"
                    ? "bg-purple-950 text-purple-200 border border-purple-800/60 font-bold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Users size={12} />
                <span>Todos os Agentes (Sequencial)</span>
              </button>

              <button
                type="button"
                onClick={() => setModoResposta("direcionado")}
                class={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                  modoResposta() === "direcionado"
                    ? "bg-purple-950 text-purple-200 border border-purple-800/60 font-bold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Bot size={12} />
                <span>Escolher quem responde</span>
              </button>
            </div>

            {/* Seletor do Agente Específico */}
            <Show when={modoResposta() === "direcionado"}>
              <select
                value={agenteAlvo()}
                onChange={(e) => setAgenteAlvo(e.currentTarget.value)}
                class="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-purple-300 font-mono focus:outline-none focus:border-purple-600 cursor-pointer"
              >
                <For each={participantesDaSala()}>
                  {(ag) => <option value={ag}>@{ag}</option>}
                </For>
              </select>
            </Show>
          </div>

          {/* Input de Mensagem */}
          <div class="relative flex items-center bg-zinc-900/90 border border-zinc-800 focus-within:border-purple-600 rounded-xl p-1.5 transition-colors">
            <textarea
              rows={2}
              value={inputTexto()}
              onInput={(e) => setInputTexto(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void enviarMensagem();
                }
              }}
              placeholder={
                modoResposta() === "sequencial"
                  ? "Envie uma mensagem para a mesa (todos os agentes responderão na sequência)..."
                  : `Pergunte ou comente direcionado para @${agenteAlvo()}...`
              }
              class="flex-1 bg-transparent border-none text-zinc-100 placeholder:text-zinc-500 text-xs p-2 focus:outline-none resize-none font-sans"
            />
            <Button
              size="sm"
              variant="primary"
              class="bg-purple-600 hover:bg-purple-500 text-white font-bold self-end"
              loading={enviando()}
              onClick={enviarMensagem}
              title="Enviar mensagem (Enter)"
            >
              <Send size={13} class="mr-1" /> Enviar
            </Button>
          </div>
        </div>
      </div>

      {/* Modal Convocação de Nova Reunião */}
      <Show when={modalNovaReuniao()}>
        <div class="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div class="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div class="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div class="flex items-center gap-2">
                <Users size={16} class="text-purple-400" />
                <h2 class="text-sm font-bold text-zinc-100">Convocar Nova Reunião Multi-Agente</h2>
              </div>
              <IconButton size="xs" variant="ghost" onClick={() => setModalNovaReuniao(false)}>
                <X size={16} />
              </IconButton>
            </div>

            <div class="space-y-3 text-xs">
              <div>
                <label class="block text-zinc-400 mb-1 font-medium">Pauta da Reunião *</label>
                <textarea
                  rows={3}
                  placeholder="Ex: Alinhar lançamento da nova home e definir responsabilidade de cada agente..."
                  value={novaPauta()}
                  onInput={(e) => setNovaPauta(e.currentTarget.value)}
                  class="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-zinc-200 focus:outline-none focus:border-purple-600 resize-none font-sans"
                />
              </div>

              <div>
                <label class="block text-zinc-400 mb-1.5 font-medium">
                  Agentes Convocados (Selecione quem participa da mesa)
                </label>
                <div class="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto scrollbar-thin p-1">
                  <For each={agentesDisponiveis()}>
                    {(ag) => {
                      const sel = () => participantesSelecionados().includes(ag.id);
                      return (
                        <div
                          onClick={() => toggleParticipante(ag.id)}
                          class={`p-2.5 rounded-xl border text-left cursor-pointer transition-all flex items-center justify-between ${
                            sel()
                              ? "bg-purple-950/50 border-purple-500/80 text-purple-200"
                              : "bg-zinc-950 border-zinc-800/80 text-zinc-400 hover:border-zinc-700"
                          }`}
                        >
                          <span class="truncate font-mono font-medium text-xs">@{ag.id}</span>
                          <Show when={sel()}>
                            <Check size={13} class="text-purple-400 flex-shrink-0" />
                          </Show>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </div>
            </div>

            <div class="pt-3 border-t border-zinc-800 flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setModalNovaReuniao(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                variant="primary"
                class="bg-purple-600 hover:bg-purple-500 text-white font-bold"
                loading={criandoSala()}
                onClick={criarNovaReuniao}
              >
                Abrir Sala de Chat
              </Button>
            </div>
          </div>
        </div>
      </Show>

      {/* Modal Histórico de Reuniões */}
      <Show when={modalHistorico()}>
        <div class="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div class="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-xl w-full p-5 space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
            <div class="flex items-center justify-between border-b border-zinc-800 pb-3 flex-shrink-0">
              <div class="flex items-center gap-2">
                <History size={16} class="text-purple-400" />
                <h2 class="text-sm font-bold text-zinc-100">Histórico de Reuniões da Empresa</h2>
              </div>
              <IconButton size="xs" variant="ghost" onClick={() => setModalHistorico(false)}>
                <X size={16} />
              </IconButton>
            </div>

            <div class="flex-1 overflow-y-auto space-y-2 scrollbar-thin">
              <For
                each={reunioes()}
                fallback={
                  <div class="py-12 text-center text-zinc-500 text-xs">
                    Nenhuma reunião registrada no histórico.
                  </div>
                }
              >
                {(r) => (
                  <div
                    onClick={() => {
                      setSearchParams({ reuniao: r.id });
                      setModalHistorico(false);
                    }}
                    class="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/80 hover:border-purple-600/60 cursor-pointer transition-all flex flex-col justify-between gap-2 shadow-xs"
                  >
                    <div class="flex items-center justify-between text-[11px]">
                      <span class="font-mono text-purple-400 font-bold">{r.id}</span>
                      <span
                        class={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase ${
                          r.status === "em_andamento" || r.status === "em-andamento"
                            ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800/60"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {r.status || "registrada"}
                      </span>
                    </div>
                    <h3 class="text-xs font-bold text-zinc-100 line-clamp-2">{r.pauta}</h3>
                    <div class="flex items-center justify-between text-[10px] text-zinc-500 font-mono pt-1 border-t border-zinc-800/60">
                      <span>{r.criado_em ? new Date(r.criado_em).toLocaleString("pt-BR") : ""}</span>
                      <span class="text-purple-300/80">
                        {Array.isArray(r.participantes) ? r.participantes.map((p: any) => `@${typeof p === "string" ? p : p.id}`).join(" ") : ""}
                      </span>
                    </div>
                  </div>
                )}
              </For>
            </div>

            <div class="pt-3 border-t border-zinc-800 flex justify-end flex-shrink-0">
              <Button size="sm" variant="secondary" onClick={() => setModalHistorico(false)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      </Show>

      {/* Modal de Ata Executiva */}
      <Show when={modalAta()}>
        <div class="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div class="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
            <div class="flex items-center justify-between border-b border-zinc-800 pb-3 flex-shrink-0">
              <div class="flex items-center gap-2">
                <FileCheck size={16} class="text-emerald-400" />
                <h2 class="text-sm font-bold text-zinc-100">Ata Executiva da Reunião</h2>
              </div>
              <IconButton size="xs" variant="ghost" onClick={() => setModalAta(false)}>
                <X size={16} />
              </IconButton>
            </div>

            <div class="flex-1 overflow-y-auto space-y-2 p-1 scrollbar-thin">
              <div
                class="prose prose-invert prose-xs max-w-none p-4 rounded-xl bg-zinc-950 border border-zinc-800 leading-relaxed font-sans text-zinc-200"
                innerHTML={renderMarkdown(conteudoAta() || "Ata em processo de geração ou não encontrada.")}
              />
            </div>

            <div class="pt-3 border-t border-zinc-800 flex justify-between items-center flex-shrink-0">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (conteudoAta()) {
                    navigator.clipboard.writeText(conteudoAta()!);
                    showToast("Ata copiada para a área de transferência!", "sucesso");
                  }
                }}
              >
                <Copy size={13} class="mr-1.5" /> Copiar Ata
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setModalAta(false)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};
