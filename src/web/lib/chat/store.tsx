import {
  type Component,
  type JSX,
  createSignal,
  onMount,
  onCleanup,
  createEffect,
  createContext,
  useContext,
} from "solid-js";
import type { ChatMensagem, PromptFilaItem, PaginacaoMensagens } from "../../components/chat/types";
import type { Anexo } from "../../components/chat/PromptInput";
import type { SessaoResumo } from "../../components/chat/HistoricoModal";
import { showToast } from "../../ui/Toast";
import { fetchApi, wsAtivo, headers } from "../context";
import {
  SUGESTOES_RAPIDAS,
  MODELOS_SUGERIDOS,
  MODELOS_PRESETS_POPULARES,
  inferirHarness,
} from "./constants";

export { SUGESTOES_RAPIDAS, MODELOS_SUGERIDOS, MODELOS_PRESETS_POPULARES, inferirHarness };

function reconciliarMensagens(antigas: ChatMensagem[], novas: ChatMensagem[]): ChatMensagem[] {
  if (!antigas || antigas.length === 0) return novas;
  if (!novas || novas.length === 0) return [];
  const resultado: ChatMensagem[] = [];
  for (let i = 0; i < novas.length; i++) {
    const n = novas[i];
    const a = antigas[i];
    if (
      a &&
      a.role === n.role &&
      a.content === n.content &&
      a.pensamento === n.pensamento &&
      a.concluida === n.concluida &&
      a.hitl?.id === n.hitl?.id &&
      (a.passos?.length ?? 0) === (n.passos?.length ?? 0) &&
      (a.acoes?.length ?? 0) === (n.acoes?.length ?? 0)
    ) {
      resultado.push(a);
    } else {
      resultado.push(n);
    }
  }
  return resultado;
}

export interface AgenteOpcao {
  id: string;
  role: string;
  model: string;
  harness?: string;
  engine?: string;
  rotation?: string[];
}

export interface MotorOpcao {
  id: string;
  name: string;
  installed: boolean;
  version?: string;
}

/** Superfícies que consomem o chat (ids de textarea únicos por montagem). */
export type SuperficieChat = "pagina" | "dock";

export interface ChatStore {
  // Sessões
  sessoes: () => SessaoResumo[];
  sessaoAtivaId: () => string | null;
  emNovaConversa: () => boolean;
  selecionarSessao: (id: string) => Promise<void>;
  novaConversa: () => void;
  excluirSessao: (id: string) => Promise<void>;
  carregarSessoes: () => Promise<void>;
  // Mensagens
  mensagens: () => ChatMensagem[];
  carregando: () => boolean;
  decorridoSegundos: () => number;
  decorridoFmt: () => string;
  retomarMonitoramento: (sessaoId: string) => void;
  carregarMensagensAnteriores: () => Promise<void>;
  totalMensagensServidor: () => number;
  temMaisMensagensAnteriores: () => boolean;
  carregandoAnteriores: () => boolean;
  // Envio
  inputValor: () => string;
  setInputValor: (v: string) => void;
  anexos: () => Anexo[];
  setAnexos: (a: Anexo[]) => void;
  filaPrompts: () => PromptFilaItem[];
  adicionarFila: (texto: string, anexos?: Anexo[]) => void;
  removerFila: (id: string) => void;
  editarFila: (id: string, superficie: SuperficieChat) => void;
  adiantarFila: (id: string) => Promise<void>;
  enviarMensagem: (opts?: { silencioso?: boolean }) => Promise<boolean>;
  pararStream: () => void;
  editarPrompt: (indice: number, superficie: SuperficieChat) => Promise<void>;
  refTextareaPara: (superficie: SuperficieChat) => (el: HTMLTextAreaElement) => void;
  // Agente/motor
  agente: () => string;
  setAgente: (id: string) => void;
  listaAgentes: () => AgenteOpcao[];
  listaMotores: () => MotorOpcao[];
  modeloConfig: () => string;
  setModeloConfig: (v: string) => void;
  carregarAgentesEMotores: () => Promise<void>;
  // Drawer de configuração (motor/modelo/rotação)
  agenteConfig: () => string;
  motorConfig: () => string;
  motorInferido: () => string;
  rotacaoConfig: () => string;
  modeloAtivoChat: () => string;
  setModeloAtivoChat: (v: string) => void;
  // Overrides efetivos vindos de Config → Modelos (settings.secretary.*)
  overrideAgente: () => string;
  overrideModelo: () => string;
  setRotacaoConfig: (v: string) => void;
  testandoMotor: () => boolean;
  resultadoTeste: () => { ok: boolean; msg: string; latencyMs?: number } | null;
  salvandoConfig: () => boolean;
  abrirPainelLateral: () => Promise<void>;
  aoMudarAgenteConfig: (agId: string) => void;
  aoMudarMotorConfig: (motId: string) => void;
  testarMotorConexao: () => Promise<void>;
  salvarConfigLateral: () => Promise<void>;
  aplicarAgenteAoChat: () => void;
  // Sincronização periódica / heartbeat de sessão
  sincronizarSessaoAtiva: (opts?: { silencioso?: boolean; forcar?: boolean }) => Promise<boolean>;
  // Alertas
  alertaFalhas: () => string | null;
  dispensarAlertaFalhas: () => void;
  // HITL
  aprovarHitl: (hitlId: string) => Promise<void>;
  rejeitarHitl: (hitlId: string, motivo: string) => Promise<void>;
  sugestoes: Array<{ rotulo: string; prompt: string }>;
}

const ChatContext = createContext<ChatStore | null>(null);

export function useChat(): ChatStore {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat fora do ChatStoreProvider");
  return ctx;
}

const CHAVE_RASCUNHO = (sid: string | null) => `oc-chat-rascunho:${sid || "nova"}`;

export const AGENTES_PADRAO_SECRETARIO: AgenteOpcao[] = [
  {
    id: "secretario-exec",
    role: "Secretário Executivo (Orquestrador com ferramentas)",
    model: "opencode/nemotron-3-ultra-free",
    harness: "opencode",
    rotation: [
      "opencode/nemotron-3-ultra-free",
      "openrouter/google/gemini-2.5-flash",
      "openrouter/liquid/lfm-2.5-2.6b:free",
      "openrouter/openrouter/free",
    ],
  },
  {
    id: "secretario",
    role: "Consultor Executivo e Estrategista",
    model: "openrouter/google/gemini-2.5-flash",
    harness: "direct_llm",
    rotation: [
      "openrouter/google/gemini-2.5-flash",
      "opencode/nemotron-3-ultra-free",
      "openrouter/liquid/lfm-2.5-2.6b:free",
      "openrouter/openrouter/free",
    ],
  },
  {
    id: "pautador-youtube",
    role: "Especialista em pautas, roteiros e SEO para YouTube",
    model: "openrouter/google/gemini-2.5-flash",
    harness: "direct_llm",
    rotation: [
      "openrouter/google/gemini-2.5-flash",
      "opencode/nemotron-3-ultra-free",
    ],
  },
  {
    id: "pesquisador-fontes",
    role: "Curador de notícias e métricas de audiência",
    model: "openrouter/google/gemini-2.5-flash",
    harness: "direct_llm",
    rotation: [
      "openrouter/google/gemini-2.5-flash",
      "opencode/nemotron-3-ultra-free",
    ],
  },
  {
    id: "code-reviewer",
    role: "Auditor técnico de código e boas práticas",
    model: "anthropic/claude-3-7-sonnet",
    harness: "opencode",
    rotation: [
      "anthropic/claude-3-7-sonnet",
      "opencode/nemotron-3-ultra-free",
    ],
  },
];

export const ChatStoreProvider: Component<{ children: JSX.Element }> = (props) => {
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
      } else {
        localStorage.removeItem("opencorp_secretario_sessao");
      }
    } catch {}
  };
  const [mensagens, setMensagens] = createSignal<ChatMensagem[]>([]);
  const [inputValor, setInputValorRaw] = createSignal("");
  const [anexos, setAnexos] = createSignal<Anexo[]>([]);
  const [filaPrompts, setFilaPrompts] = createSignal<PromptFilaItem[]>([]);
  let processandoFila = false;
  const [alertaFalhas, setAlertaFalhas] = createSignal<string | null>(null);

  // Rascunho compartilhado entre página e dock (uma pessoa, duas superfícies)
  let timerRascunho: any = null;
  const setInputValor = (v: string) => {
    setInputValorRaw(v);
    if (timerRascunho) clearTimeout(timerRascunho);
    timerRascunho = setTimeout(() => {
      try {
        if (v.trim()) localStorage.setItem(CHAVE_RASCUNHO(sessaoAtivaId()), v);
        else localStorage.removeItem(CHAVE_RASCUNHO(sessaoAtivaId()));
      } catch {}
    }, 300);
  };
  const restaurarRascunho = () => {
    try {
      setInputValorRaw(localStorage.getItem(CHAVE_RASCUNHO(sessaoAtivaId())) || "");
    } catch {
      setInputValorRaw("");
    }
  };

  const verificarAlertasFalhas = async () => {
    try {
      const r = await fetchApi<{ total_acoes: number; total_falhas: number; agentes: Array<{ agente: string; total: number; falhas: number }> }>("/telemetria/resumo").catch(() => null);
      if (!r || r.total_acoes < 3) { setAlertaFalhas(null); return; }
      const taxa = r.total_falhas / r.total_acoes;
      const pior = [...(r.agentes || [])].sort((a, b) => b.falhas - a.falhas)[0];
      if (r.total_falhas >= 3 && taxa >= 0.3) {
        setAlertaFalhas(`${r.total_falhas} falhas em ${r.total_acoes} ações (${(taxa * 100).toFixed(0)}%)${pior ? ` — agente @${pior.agente} com ${pior.falhas} falha(s)` : ""}. Considere revisar o prompt ou trocar o modelo.`);
      } else {
        setAlertaFalhas(null);
      }
    } catch {
      setAlertaFalhas(null);
    }
  };
  const [agente, setAgente] = createSignal<string>("secretario-exec");
  const [carregando, setCarregando] = createSignal(false);
  const [decorridoSegundos, setDecorridoSegundos] = createSignal(0);
  const [mostrarBotaoFim, setMostrarBotaoFim] = createSignal(false);

  const [totalMensagensServidor, setTotalMensagensServidor] = createSignal(0);
  const [temMaisMensagensAnteriores, setTemMaisMensagensAnteriores] = createSignal(false);
  const [carregandoAnteriores, setCarregandoAnteriores] = createSignal(false);
  let ultimoHash = "";

  let cacheWsModelos: { default_model?: string; rotation?: string[] } | null = null;

  const [listaAgentes, setListaAgentes] = createSignal<AgenteOpcao[]>(AGENTES_PADRAO_SECRETARIO);
  const [listaMotores, setListaMotores] = createSignal<MotorOpcao[]>([]);
  const [agenteConfig, setAgenteConfig] = createSignal<string>("secretario-exec");
  const [motorConfig, setMotorConfig] = createSignal<string>("opencode");
  const [modeloConfig, setModeloConfig] = createSignal<string>("openrouter/google/gemini-2.5-flash");
  const [rotacaoConfig, setRotacaoConfig] = createSignal<string>("");
  const [modeloAtivoChat, setModeloAtivoChat] = createSignal<string>("");
  const [rotacaoAtivaChat, setRotacaoAtivaChat] = createSignal<string[]>([]);
  const motorInferido = () => inferirHarness(modeloConfig());
  const [emNovaConversa, setEmNovaConversa] = createSignal<boolean>(false);
  // Overrides de Config → Modelos (fonte: settings.secretary.agent / .model)
  const [overrideAgente, setOverrideAgente] = createSignal<string>("");
  const [overrideModelo, setOverrideModelo] = createSignal<string>("");
  let secretarioDefaultsAplicados = false;

  /** Lê settings.secretary.* (GET /settings mesclado) — fonte da aba Config → Modelos. */
  const carregarOverridesSecretario = async () => {
    try {
      const entradas = await fetchApi<Array<{ chave: string; valor: any }>>("/settings").catch(() => []);
      if (!Array.isArray(entradas)) return;
      for (const e of entradas) {
        if (e.chave === "secretary.agent" && typeof e.valor === "string" && e.valor.trim()) {
          setOverrideAgente(e.valor.trim());
        }
        if (e.chave === "secretary.model" && typeof e.valor === "string" && e.valor.trim()) {
          setOverrideModelo(e.valor.trim());
        }
      }
    } catch {}
  };

  /** Aplica settings.secretary.agent como agente inicial do chat (uma vez — não pisa troca manual). */
  const aplicarAgentePadraoSecretario = async () => {
    if (secretarioDefaultsAplicados) return;
    secretarioDefaultsAplicados = true;
    await carregarOverridesSecretario();
    const padrao = overrideAgente();
    if (padrao && padrao !== agente()) setAgente(padrao);
  };
  const [testandoMotor, setTestandoMotor] = createSignal(false);
  const [resultadoTeste, setResultadoTeste] = createSignal<{ ok: boolean; msg: string; latencyMs?: number } | null>(null);
  const [salvandoConfig, setSalvandoConfig] = createSignal(false);

  const carregarAgentesEMotores = async () => {
    try {
      const ags = await fetchApi<any[]>(`/agents?workspace=${encodeURIComponent(wsAtivo())}`);
      if (Array.isArray(ags) && ags.length > 0) {
        setListaAgentes(ags);
        const enc = ags.find((a) => a.id === agente());
        if (enc) {
          if (enc.model) setModeloConfig(enc.model);
          if (enc.harness || enc.engine) setMotorConfig(enc.harness || enc.engine);
        }
      }
    } catch {}

    // Pré-aquece cache de modelos do workspace
    void fetchApi<any>(`/settings/modelos?workspace=${encodeURIComponent(wsAtivo())}`)
      .then((wsMod) => {
        if (wsMod) cacheWsModelos = wsMod;
      })
      .catch(() => null);

    // Carrega motores em background sem travar a interface
    void fetchApi<any>("/api/motores")
      .then((r) => {
        const mots = Array.isArray(r) ? r : r?.motores;
        if (Array.isArray(mots) && mots.length > 0) {
          setListaMotores(
            mots.map((m: any) => ({
              id: String(m.id),
              name: String(m.name || m.id),
              installed: Boolean(m.installed),
              version: m.version ? String(m.version) : undefined,
            }))
          );
        }
      })
      .catch(() => null);
  };

  const abrirPainelLateral = async () => {
    // 1. SINCRONAMENTE: Preenche imediatamente tudo com dados locais no milissegundo zero (sem travar)
    const agAtual = agente() || "secretario-exec";
    setAgenteConfig(agAtual);
    const enc = listaAgentes().find((a) => a.id === agAtual);

    const modeloPadraoWs = cacheWsModelos?.default_model || "openrouter/google/gemini-2.5-flash";
    const rotacaoWs: string[] = Array.isArray(cacheWsModelos?.rotation) && cacheWsModelos!.rotation.length > 0
      ? cacheWsModelos!.rotation
      : [
          modeloPadraoWs,
          "opencode/nemotron-3-ultra-free",
          "openrouter/liquid/lfm-2.5-2.6b:free",
          "openrouter/openrouter/free",
        ];

    const modeloBase = enc?.model || modeloAtivoChat() || overrideModelo() || modeloPadraoWs;
    setModeloConfig(modeloBase);
    setMotorConfig(inferirHarness(modeloBase));

    const rotAgente = enc?.rotation || (enc as any)?.model_fallback;
    if (Array.isArray(rotAgente) && rotAgente.length > 0) {
      setRotacaoConfig(rotAgente.join("\n"));
    } else if (rotacaoAtivaChat().length > 0) {
      setRotacaoConfig(rotacaoAtivaChat().join("\n"));
    } else {
      setRotacaoConfig(rotacaoWs.join("\n"));
    }
    setResultadoTeste(null);

    // 2. EM SEGUNDO PLANO (sem bloquear a gaveta): Atualiza configurações do servidor
    try {
      const [ags, wsMod] = await Promise.all([
        fetchApi<any[]>(`/agents?workspace=${encodeURIComponent(wsAtivo())}`).catch(() => null),
        fetchApi<any>(`/settings/modelos?workspace=${encodeURIComponent(wsAtivo())}`).catch(() => null),
        carregarOverridesSecretario().catch(() => null),
      ]);

      if (wsMod) {
        cacheWsModelos = wsMod;
      }

      if (Array.isArray(ags) && ags.length > 0) {
        setListaAgentes(ags);
        const encAtualizado = ags.find((a) => a.id === agAtual);
        if (encAtualizado) {
          if (!modeloConfig() || modeloConfig() === modeloPadraoWs) {
            const modServidor = encAtualizado.model || modeloAtivoChat() || overrideModelo() || wsMod?.default_model;
            if (modServidor) {
              setModeloConfig(modServidor);
              setMotorConfig(inferirHarness(modServidor));
            }
          }
          const rotAtualizada = encAtualizado.rotation || (encAtualizado as any)?.model_fallback;
          if (Array.isArray(rotAtualizada) && rotAtualizada.length > 0 && !rotacaoConfig()) {
            setRotacaoConfig(rotAtualizada.join("\n"));
          }
        }
      }
    } catch {}
  };

  const aoMudarAgenteConfig = async (agId: string) => {
    setAgenteConfig(agId);
    setResultadoTeste(null);

    const enc = listaAgentes().find((a) => a.id === agId);
    const modeloPadraoWs = cacheWsModelos?.default_model || "openrouter/google/gemini-2.5-flash";
    const rotacaoWs: string[] = Array.isArray(cacheWsModelos?.rotation) && cacheWsModelos!.rotation.length > 0
      ? cacheWsModelos!.rotation
      : [
          modeloPadraoWs,
          "opencode/nemotron-3-ultra-free",
          "openrouter/liquid/lfm-2.5-2.6b:free",
          "openrouter/openrouter/free",
        ];

    if (enc) {
      const mod = enc.model || (agId.includes("secretario") ? overrideModelo() || modeloPadraoWs : modeloPadraoWs);
      setModeloConfig(mod);
      setMotorConfig(inferirHarness(mod));

      const rot = enc.rotation || (enc as any)?.model_fallback;
      if (Array.isArray(rot) && rot.length > 0) {
        setRotacaoConfig(rot.join("\n"));
      } else {
        setRotacaoConfig(rotacaoWs.join("\n"));
      }
    } else {
      setModeloConfig(modeloPadraoWs);
      setMotorConfig(inferirHarness(modeloPadraoWs));
      setRotacaoConfig(rotacaoWs.join("\n"));
    }

    if (!cacheWsModelos) {
      void fetchApi<any>(`/settings/modelos?workspace=${encodeURIComponent(wsAtivo())}`)
        .then((wsMod) => {
          if (wsMod) cacheWsModelos = wsMod;
        })
        .catch(() => null);
    }
  };

  const aoMudarMotorConfig = (motId: string) => {
    setMotorConfig(motId);
    setResultadoTeste(null);
    const sug = MODELOS_SUGERIDOS[motId];
    if (sug && sug.length > 0 && !modeloConfig().trim()) {
      setModeloConfig(sug[0]!);
    }
  };

  const testarMotorConexao = async () => {
    setTestandoMotor(true);
    setResultadoTeste(null);
    const t0 = Date.now();
    try {
      const agId = agenteConfig();
      const mod = modeloConfig().trim();
      const motId = inferirHarness(mod);
      setMotorConfig(motId);

      if (agId === "secretario-exec" || agId === "secretario") {
        const [motorRes, statusRes] = await Promise.all([
          fetchApi<any>(`/api/motores/${encodeURIComponent(motId)}/test`, { method: "POST" }).catch(() => null),
          fetchApi<{ rodando?: boolean; porta?: number }>("/secretario/status").catch(() => null),
        ]);
        const t = Date.now() - t0;
        const motorOk = motorRes?.ok || motorRes?.health?.healthy;
        const secOk = statusRes?.rodando;
        if (motorOk && secOk) {
          const statusTxt = motorRes?.health?.statusText || "OK";
          setResultadoTeste({ ok: true, msg: `Motor "${motId}" ativo (${statusTxt}) · Secretário rodando na porta ${statusRes.porta} (${t}ms).`, latencyMs: t });
          showToast(`Motor ${motId} verificado com sucesso!`, "sucesso");
        } else {
          const partes: string[] = [];
          if (!motorOk) partes.push(`Motor "${motId}" não respondeu`);
          if (!secOk) partes.push("Secretário (OpenCode) não está rodando");
          setResultadoTeste({ ok: false, msg: partes.join(" · ") + ` (${t}ms)`, latencyMs: t });
        }
      } else {
        await fetchApi(`/agents/${encodeURIComponent(agId)}/run?workspace=${encodeURIComponent(wsAtivo())}`, {
          method: "POST",
          body: JSON.stringify({
            ordem: "ping de verificação de motor",
            engine: motId,
            model: mod || undefined,
          }),
        });
        const t = Date.now() - t0;
        setResultadoTeste({
          ok: true,
          msg: `Motor "${motId}" ativo e respondendo (${t}ms).`,
          latencyMs: t,
        });
        showToast(`Motor ${motId} verificado com sucesso!`, "sucesso");
      }
    } catch (e: any) {
      setResultadoTeste({
        ok: false,
        msg: `Falha ao acionar motor: ${e?.message || e}`,
        latencyMs: Date.now() - t0,
      });
    } finally {
      setTestandoMotor(false);
    }
  };

  const salvarConfigLateral = async () => {
    setSalvandoConfig(true);
    try {
      const rot = rotacaoConfig()
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const mod = modeloConfig().trim();
      const agId = agenteConfig();
      const harness = inferirHarness(mod);

      // 1. Aplica imediatamente à sessão ativa do chat em memória
      setAgente(agId);
      if (mod) {
        setModeloAtivoChat(mod);
        setModeloConfig(mod);
      }
      if (rot.length > 0) setRotacaoAtivaChat(rot);

      // 2. Persiste em paralelo no backend
      const promessas: Promise<any>[] = [];

      // Persiste rotação e modelo padrão no workspace (.opencorp/config.json)
      promessas.push(
        fetchApi(`/settings/modelos?workspace=${encodeURIComponent(wsAtivo())}`, {
          method: "PUT",
          body: JSON.stringify({
            default_model: mod || undefined,
            rotation: rot,
          }),
        }).catch((err) => {
          console.warn("[chat/store] Aviso ao salvar modelos no workspace:", err);
        })
      );

      if (agId === "secretario-exec" || agId === "secretario") {
        if (mod) {
          setOverrideModelo(mod);
          promessas.push(
            fetchApi("/settings", {
              method: "PUT",
              body: JSON.stringify({
                chave: "secretary.model",
                valor: mod,
                scope: "workspace",
              }),
            }).catch(() => null)
          );
        }
      } else {
        promessas.push(
          fetchApi(`/agents/${encodeURIComponent(agId)}?workspace=${encodeURIComponent(wsAtivo())}`, {
            method: "PUT",
            body: JSON.stringify({
              harness,
              model: mod || undefined,
              rotation: rot,
            }),
          }).catch((err) => {
            console.warn("[chat/store] Aviso ao atualizar frontmatter do agente:", err);
          })
        );
      }

      await Promise.all(promessas);
      void carregarAgentesEMotores().catch(() => null);
      showToast(`Configurações salvas no agente @${agId} e no workspace!`, "sucesso");
    } catch (e: any) {
      showToast(`Erro ao salvar: ${e?.message || e}`, "erro");
      throw e;
    } finally {
      setSalvandoConfig(false);
    }
  };

  const aplicarAgenteAoChat = () => {
    const agId = agenteConfig();
    const mod = modeloConfig().trim();
    const rot = rotacaoConfig()
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);

    setAgente(agId);
    if (mod) {
      setModeloAtivoChat(mod);
      setModeloConfig(mod);
    }
    if (rot.length > 0) setRotacaoAtivaChat(rot);
    showToast(`Modelo e rotação aplicados ao chat!`, "sucesso");
  };

  // Textareas por superfície (editar/focar sempre na instância certa)
  const textareas: Partial<Record<SuperficieChat, HTMLTextAreaElement>> = {};
  const refTextareaPara = (superficie: SuperficieChat) => (el: HTMLTextAreaElement) => {
    textareas[superficie] = el;
  };
  const textareaDe = (superficie: SuperficieChat): HTMLTextAreaElement | null =>
    textareas[superficie] || null;

  let abortController: AbortController | null = null;
  let timerInterval: any = null;

  let syncChannel: BroadcastChannel | null = null;
  if (typeof window !== "undefined" && "BroadcastChannel" in window) {
    try {
      syncChannel = new BroadcastChannel("opencorp_chat_sync");
    } catch {}
  }

  const scrollFim = (_forcar = false) => {};

  const carregarSessoes = async () => {
    try {
      void aplicarAgentePadraoSecretario();
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
        executando: s.executando,
        status: s.status,
      }));
      setSessoes(lista);
      if (emNovaConversa()) {
        return;
      }
      const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const urlSessaoId = params?.get("sessao");
      const ativa = urlSessaoId || sessaoAtivaId();
      if (ativa && lista.some((s) => s.id === ativa)) {
        void selecionarSessao(ativa);
      } else if (lista.length > 0 && !sessaoAtivaId() && !urlSessaoId) {
        void selecionarSessao(lista[0].id);
      }
    } catch (err) {
      console.error("Erro ao carregar sessões do secretário:", err);
    }
  };

  let monitorTimeout: any = null;
  const [streamingAtivo, setStreamingAtivo] = createSignal(false);

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
    let hashLocal = "";

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
      if (streamingAtivo()) {
        monitorTimeout = setTimeout(tick, 1000);
        return;
      }
      try {
        const msgs = await fetchApi<ChatMensagem[]>(`/secretario/sessoes/${encodeURIComponent(sessaoId)}/mensagens`);
        if (streamingAtivo()) {
          monitorTimeout = setTimeout(tick, 1000);
          return;
        }
        if (!Array.isArray(msgs)) {
          monitorTimeout = setTimeout(tick, 1000);
          return;
        }

        const ult = msgs[msgs.length - 1];
        const hash = msgs.length + ":" + (ult?.content?.length ?? 0) + ":" + (ult?.pensamento?.length ?? 0) + ":" + (ult?.acoes?.length ?? 0) + ":" + (ult?.passos?.length ?? 0) + ":" + ult?.concluida;
        if (hash !== hashLocal) {
          hashLocal = hash;
          tentativasSemMudanca = 0;
          setMensagens((prev) => reconciliarMensagens(prev, msgs));
          setTimeout(() => scrollFim(false), 30);
        } else {
          tentativasSemMudanca++;
        }

        if (ult && ult.role === "assistant" && ult.concluida === true) {
          pararMonitoramento();
          setCarregando(false);
          if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
          }
          return;
        }

        const sessaoOcupadaNoTick = sessoes().find((s) => s.id === sessaoId && (s as any).executando);
        if (!sessaoOcupadaNoTick && ult && (ult.concluida === true || ult.role === "user")) {
          tentativasSemMudanca++;
          if (tentativasSemMudanca >= 2) {
            pararMonitoramento();
            setCarregando(false);
            if (timerInterval) {
              clearInterval(timerInterval);
              timerInterval = null;
            }
            return;
          }
        }

        // Se o servidor confirma que a sessão não está ocupada mas a mensagem do assistente ficou incompleta,
        // aguarda 5s para confirmação e destrava a interface sem disparar abort desnecessário.
        if (!sessaoOcupadaNoTick && ult && ult.role === "assistant" && ult.concluida === false && tentativasSemMudanca >= 5) {
          setMensagens((prev) => {
            const u = prev[prev.length - 1];
            if (u && u.role === "assistant" && u.concluida === false) {
              return [
                ...prev.slice(0, -1),
                {
                  ...u,
                  concluida: true,
                  content: u.content || "⚠️ O processamento foi finalizado.",
                },
              ];
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

        // Teto de segurança: apenas se houver inatividade absoluta por mais de 5 minutos (300 ticks)
        if (tentativasSemMudanca > 300) {
          void fetchApi(`/secretario/sessoes/${encodeURIComponent(sessaoId)}/abort`, { method: "POST" }).catch(() => {});
          setMensagens((prev) => {
            const u = prev[prev.length - 1];
            if (u && u.role === "assistant" && u.concluida === false) {
              return [
                ...prev.slice(0, -1),
                {
                  ...u,
                  concluida: true,
                  content: u.content || "⚠️ Tempo limite de espera esgotado. A sessão foi liberada.",
                },
              ];
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

    tick();
  };

  const selecionarSessao = async (id: string) => {
    setEmNovaConversa(false);
    pararMonitoramento();
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    setSessaoAtivaId(id);
    try {
      const respPag = await fetchApi<any>(`/secretario/sessoes/${encodeURIComponent(id)}/mensagens?turnos=2`);

      let lista: ChatMensagem[] = [];
      let paginacao: PaginacaoMensagens | null = null;

      if (respPag && typeof respPag === "object" && "mensagens" in respPag) {
        lista = Array.isArray(respPag.mensagens) ? respPag.mensagens : [];
        paginacao = respPag.paginacao || null;
      } else if (Array.isArray(respPag)) {
        lista = respPag;
      }

      setMensagens(lista);

      if (paginacao) {
        setTotalMensagensServidor(paginacao.total_mensagens);
        setTemMaisMensagensAnteriores(paginacao.tem_mais);
      } else {
        setTotalMensagensServidor(lista.length);
        setTemMaisMensagensAnteriores(false);
      }

      setTimeout(() => scrollFim(true), 50);

      const ult = lista[lista.length - 1];
      const sessaoOcupada = sessoes().find((s) => s.id === id && (s as any).executando);
      const emAndamento = Boolean(sessaoOcupada) || (ult && ult.role === "assistant" && ult.concluida === false);

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
      restaurarRascunho();
    } catch {
      setMensagens([]);
      setTotalMensagensServidor(0);
      setTemMaisMensagensAnteriores(false);
      setCarregando(false);
    }
  };

  let syncEmAndamento = false;
  let ultimoHashSincronizado = "";

  /**
   * Sincroniza periodicamente a sessão aberta com o servidor.
   * Se o servidor tiver novas mensagens ou mudanças de status (ex.: resposta concluída em background,
   * tool calls adicionadas, ou stream que terminou sem evento SSE), atualiza o estado local sem
   * necessitar de reload da página.
   */
  const sincronizarSessaoAtiva = async (opts?: { silencioso?: boolean; forcar?: boolean }): Promise<boolean> => {
    const sid = sessaoAtivaId();
    if (!sid || (streamingAtivo() && !opts?.forcar) || syncEmAndamento) {
      return false;
    }
    syncEmAndamento = true;
    try {
      const respPag = await fetchApi<any>(`/secretario/sessoes/${encodeURIComponent(sid)}/mensagens?turnos=2`).catch(() => null);
      if (!respPag) return false;

      let lista: ChatMensagem[] = [];
      let paginacao: PaginacaoMensagens | null = null;

      if (respPag && typeof respPag === "object" && "mensagens" in respPag) {
        lista = Array.isArray(respPag.mensagens) ? respPag.mensagens : [];
        paginacao = respPag.paginacao || null;
      } else if (Array.isArray(respPag)) {
        lista = respPag;
      }

      if (lista.length === 0) return false;

      const ult = lista[lista.length - 1];
      const hashAtual = `${lista.length}:${ult?.role}:${ult?.content?.length || 0}:${ult?.pensamento?.length || 0}:${ult?.acoes?.length || 0}:${ult?.concluida}`;

      const msgsLocais = mensagens();
      const ultLocal = msgsLocais[msgsLocais.length - 1];
      const hashLocal = `${msgsLocais.length}:${ultLocal?.role}:${ultLocal?.content?.length || 0}:${ultLocal?.pensamento?.length || 0}:${ultLocal?.acoes?.length || 0}:${ultLocal?.concluida}`;

      const mudou = hashAtual !== hashLocal || hashAtual !== ultimoHashSincronizado || opts?.forcar;

      if (mudou) {
        ultimoHashSincronizado = hashAtual;

        // Se o usuário já rolou e carregou mensagens anteriores, mesclamos apenas o final
        if (msgsLocais.length > lista.length && temMaisMensagensAnteriores()) {
          const offset = msgsLocais.length - lista.length;
          const anteriores = msgsLocais.slice(0, offset);
          setMensagens([...anteriores, ...reconciliarMensagens(msgsLocais.slice(offset), lista)]);
        } else {
          setMensagens((prev) => reconciliarMensagens(prev, lista));
        }

        if (paginacao) {
          setTotalMensagensServidor(paginacao.total_mensagens);
          setTemMaisMensagensAnteriores(paginacao.tem_mais);
        }

        // Se no servidor a mensagem do assistente já concluiu e o chat ainda estava com loading, desativa
        if (ult?.role === "assistant" && ult?.concluida === true) {
          if (carregando()) {
            setCarregando(false);
          }
          if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
          }
        }

        // Se no servidor a mensagem está em execução e o frontend não estava com streaming ou monitoramento ativo
        if (ult?.role === "assistant" && ult?.concluida === false && !streamingAtivo() && !monitorTimeout) {
          setCarregando(true);
          retomarMonitoramento(sid);
        }

        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      syncEmAndamento = false;
    }
  };

  const carregarMensagensAnteriores = async () => {
    const sid = sessaoAtivaId();
    if (!sid || carregandoAnteriores() || !temMaisMensagensAnteriores()) return;

    setCarregandoAnteriores(true);
    try {
      const msgsAtuais = mensagens();
      let menorIndice = Infinity;
      for (const m of msgsAtuais) {
        if (m.indice_global !== undefined && m.indice_global < menorIndice) {
          menorIndice = m.indice_global;
        }
      }

      const antesDoIndice = menorIndice === Infinity ? undefined : menorIndice;
      let urlAnterior = `/secretario/sessoes/${encodeURIComponent(sid)}/mensagens?turnos=2`;
      if (antesDoIndice !== undefined) {
        urlAnterior += `&antes_do_indice=${antesDoIndice}`;
      }

      const respPag = await fetchApi<any>(urlAnterior);

      let anteriores: ChatMensagem[] = [];
      let paginacao: PaginacaoMensagens | null = null;

      if (respPag && typeof respPag === "object" && "mensagens" in respPag) {
        anteriores = Array.isArray(respPag.mensagens) ? respPag.mensagens : [];
        paginacao = respPag.paginacao || null;
      } else if (Array.isArray(respPag)) {
        anteriores = respPag;
      }

      if (anteriores.length > 0) {
        setMensagens((prev) => [...anteriores, ...prev]);
      }

      if (paginacao) {
        setTotalMensagensServidor(paginacao.total_mensagens);
        setTemMaisMensagensAnteriores(paginacao.tem_mais);
      } else {
        setTemMaisMensagensAnteriores(false);
      }
    } catch {
      // Silenciosamente ignora erros de carregamento
    } finally {
      setCarregandoAnteriores(false);
    }
  };

  const novaConversa = () => {
    setEmNovaConversa(true);
    pararMonitoramento();
    if (abortController) {
      abortController.abort();
      setCarregando(false);
    }
    setSessaoAtivaId(null);
    setMensagens([]);
    setInputValorRaw("");
    try { localStorage.removeItem(CHAVE_RASCUNHO(null)); } catch {}
    setAnexos([]);
    setTotalMensagensServidor(0);
    setTemMaisMensagensAnteriores(false);
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
    const sid = sessaoAtivaId();
    if (sid) {
      void fetchApi(`/sessions/${encodeURIComponent(sid)}/abort`, { method: "POST" }).catch(() => null);
    }
    pararMonitoramento();
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    setStreamingAtivo(false);
    setCarregando(false);
    setMensagens((prev) => {
      const ult = prev[prev.length - 1];
      if (ult && ult.role === "assistant" && ult.concluida === false) {
        return [...prev.slice(0, -1), { ...ult, concluida: true, content: ult.content || "(interrompido pelo usuário)" }];
      }
      return prev;
    });
    showToast("Agente interrompido com sucesso", "aviso");
  };

  const focarTextarea = (superficie: SuperficieChat, texto: string) => {
    const el = textareaDe(superficie);
    if (!el) return;
    el.value = texto;
    el.focus();
    try {
      el.setSelectionRange(texto.length, texto.length);
    } catch {}
    el.style.height = "auto";
    const scrollH = el.scrollHeight;
    el.style.height = `${Math.max(38, Math.min(scrollH, 220))}px`;
    el.style.overflowY = scrollH > 220 ? "auto" : "hidden";
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const editarPrompt = async (indice: number, superficie: SuperficieChat) => {
    const m = mensagens()[indice];
    if (!m || m.role !== "user") return;

    pararMonitoramento();
    if (carregando()) {
      pararStream();
    }

    const textoPrompt = m.content || "";
    const indiceGlobal = m.indice_global !== undefined ? m.indice_global : indice;

    setInputValor(textoPrompt);
    focarTextarea(superficie, textoPrompt);

    const sid = sessaoAtivaId();
    if (sid) {
      try {
        await fetchApi(`/secretario/sessoes/${encodeURIComponent(sid)}/truncar`, {
          method: "POST",
          body: JSON.stringify({ manter_ate: indiceGlobal }),
        });
      } catch (err: any) {
        showToast("Falha ao truncar no servidor: " + err.message, "aviso");
      }
    }

    ultimoHash = "";
    setMensagens((prev) => prev.slice(0, indice));

    showToast("Prompt restaurado para edição!", "sucesso");
  };

  const adicionarFila = (texto: string, anexosRecebidos?: Anexo[]) => {
    const item: PromptFilaItem = {
      id: `flw_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      texto,
      anexos: anexosRecebidos,
      criadoEm: Date.now(),
    };
    setFilaPrompts((prev) => [...prev, item]);
  };

  const removerFila = (id: string) => {
    setFilaPrompts((prev) => prev.filter((i) => i.id !== id));
    showToast("Prompt removido da fila", "info");
  };

  const editarFila = (id: string, superficie: SuperficieChat) => {
    const item = filaPrompts().find((i) => i.id === id);
    if (!item) return;
    setFilaPrompts((prev) => prev.filter((i) => i.id !== id));
    setInputValor(item.texto);
    if (item.anexos) setAnexos(item.anexos);
    focarTextarea(superficie, item.texto);
    showToast("Prompt devolvido para edição!", "sucesso");
  };

  const adiantarFila = async (id: string) => {
    const item = filaPrompts().find((i) => i.id === id);
    if (!item) return;
    setFilaPrompts((prev) => prev.filter((i) => i.id !== id));
    if (carregando()) {
      pararStream();
      await new Promise((r) => setTimeout(r, 250));
    }
    setInputValor(item.texto);
    if (item.anexos) setAnexos(item.anexos);
    showToast("Adiantando prompt da fila...", "info");
    // O stream anterior pode ainda estar liberando a sessão no servidor (409) — tenta de novo
    for (let t = 0; t < 6; t++) {
      const ok = await enviarMensagem();
      if (ok) return;
      await new Promise((r) => setTimeout(r, 900));
      setInputValor(item.texto);
      if (item.anexos) setAnexos(item.anexos);
    }
  };

  // Disparo sequencial automático quando o turno atual do assistente terminar
  let bloqueioFilaAte = 0;
  createEffect(() => {
    const estaCarregando = carregando();
    const fila = filaPrompts();
    if (!estaCarregando && fila.length > 0 && !processandoFila && Date.now() >= bloqueioFilaAte) {
      processandoFila = true;
      const proximo = fila[0];
      setFilaPrompts((prev) => prev.slice(1));
      setTimeout(async () => {
        setInputValor(proximo.texto);
        if (proximo.anexos) setAnexos(proximo.anexos);
        const ok = await enviarMensagem({ silencioso: true });
        if (!ok) {
          // Sessão ainda ocupada no servidor — devolve à frente da fila com backoff
          setFilaPrompts((prev) => [proximo, ...prev]);
          bloqueioFilaAte = Date.now() + 2000;
        }
        processandoFila = false;
      }, 350);
    }
  });

  const enviarMensagem = async (opts?: { silencioso?: boolean }): Promise<boolean> => {
    if (streamingAtivo()) {
      if (!opts?.silencioso) showToast("Aguarde a resposta atual terminar (ou pare a execução)", "aviso");
      return false;
    }
    pararMonitoramento();
    const texto = inputValor().trim();
    const imgs = anexos().map((a) => a.url);
    if (!texto && imgs.length === 0) return false;

    if (texto === "/clear") {
      setMensagens([]);
      setInputValorRaw("");
      try { localStorage.removeItem(CHAVE_RASCUNHO(sessaoAtivaId())); } catch {}
      setAnexos([]);
      showToast("Histórico de mensagens da tela limpo", "info");
      return true;
    }

    setMensagens((prev) => {
      const ult = prev[prev.length - 1];
      if (ult && ult.role === "assistant" && ult.concluida === false) {
        return [...prev.slice(0, -1), { ...ult, concluida: true }];
      }
      return prev;
    });

    const sid = sessaoAtivaId();

    const msgUsuario: ChatMensagem = {
      role: "user",
      content: texto,
      imagens: imgs.length > 0 ? imgs : undefined,
    };

    const msgAssistente: ChatMensagem = {
      role: "assistant",
      content: "",
      pensamento: "",
      concluida: false,
      acoes: [],
    };

    setMensagens((prev) => [...prev, msgUsuario, msgAssistente]);
    const lenAntesOtimista = mensagens().length - 2;
    setInputValorRaw("");
    try { localStorage.removeItem(CHAVE_RASCUNHO(sessaoAtivaId())); } catch {}
    setAnexos([]);
    setCarregando(true);
    setStreamingAtivo(true);
    setDecorridoSegundos(0);

    if (sid) {
      try { syncChannel?.postMessage({ tipo: "mensagem_enviada", sessao_id: sid }); } catch {}
    }

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
        cliente_id: `web_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        mensagem: texto,
        prompt: texto,
        agente: agente(),
        imagens: imgs,
      };
      if (modeloAtivoChat()) {
        corpoEnvio.modelo = modeloAtivoChat();
        corpoEnvio.model = modeloAtivoChat();
      }
      if (rotacaoAtivaChat().length > 0) {
        corpoEnvio.rotation = rotacaoAtivaChat();
      }
      if (sid) corpoEnvio.sessao_id = sid;
      // Pequeno contexto de localização: de que página veio a ordem (fora de /secretario)
      try {
        const rotaAtual = window.location.pathname;
        if (rotaAtual && rotaAtual !== "/secretario") {
          corpoEnvio.contexto = [`localização: ${rotaAtual}`];
        }
      } catch {}

      const resp = await fetch(urlStream, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(corpoEnvio),
        signal: abortController.signal,
      });

      if (!resp.ok) {
        if (resp.status === 409) {
          const detalhe = await resp.json().catch(() => null);
          // Sessão ocupada por outro stream — desfaz o otimismo e avisa
          setMensagens((prev) => prev.slice(0, lenAntesOtimista));
          setInputValor(texto);
          if (imgs.length > 0) setAnexos(anexos());
          if (!opts?.silencioso) {
            showToast((detalhe as any)?.erro || "Sessão ocupada em outra execução — tente de novo em instantes", "aviso");
          }
          if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
          }
          setStreamingAtivo(false);
          setCarregando(false);
          const sidRec = sessaoAtivaId();
          if (sidRec) {
            void fetchApi<ChatMensagem[]>(`/secretario/sessoes/${encodeURIComponent(sidRec)}/mensagens`)
              .then((msgs) => {
                if (Array.isArray(msgs) && msgs.length > 0) {
                  setMensagens((prev) => reconciliarMensagens(prev, msgs));
                }
              })
              .catch(() => null);
          }
          return false;
        }
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

          if (trimmed.startsWith("event: ")) {
            currentEvent = trimmed.slice(7).trim();
            continue;
          }

          if (!trimmed.startsWith("data: ")) {
            if (trimmed === "") currentEvent = "";
            continue;
          }

          const jsonStr = trimmed.slice(6).trim();
          if (jsonStr === "[DONE]") continue;

          try {
            const payload = JSON.parse(jsonStr);
            const evtType = currentEvent || payload.tipo || "";

            if (evtType === "inicio" && payload.sessao_id) {
              setEmNovaConversa(false);
              setSessaoAtivaId(payload.sessao_id);
              try { syncChannel?.postMessage({ tipo: "mensagem_enviada", sessao_id: payload.sessao_id }); } catch {}
            }

            setMensagens((prev) => {
              const ultIdx = prev.length - 1;
              if (ultIdx < 0) return prev;
              const assistente = { ...prev[ultIdx] };

              if (payload.gitStatus) {
                assistente.gitStatus = payload.gitStatus;
              }
              if (payload.gitDiff) {
                assistente.gitDiff = payload.gitDiff;
              }

              if (evtType === "status" || evtType === "fallback_modelo") {
                if (payload.aviso) {
                  const rotacoes = [...(assistente.rotacoes || [])];
                  const jaExiste = rotacoes.some((r) => r.aviso === payload.aviso);
                  if (!jaExiste) {
                    rotacoes.push({
                      tipo: evtType,
                      modelo: payload.modelo,
                      aviso: payload.aviso,
                      erro: Boolean(payload.erro || payload.aviso.includes("falhou") || payload.aviso.includes("⚠️") || payload.aviso.includes("erro")),
                      timestamp: Date.now(),
                    });
                    assistente.rotacoes = rotacoes;
                  }
                }
                if (payload.modelo) {
                  assistente.modelo = payload.modelo;
                }
              } else if (evtType === "passos" && Array.isArray(payload.passos)) {
                assistente.passos = payload.passos;

                const textoPassos = payload.passos
                  .filter((p: any) => p.tipo === "texto")
                  .map((p: any) => p.texto || "")
                  .join("\n\n");
                if (textoPassos) {
                  assistente.content = textoPassos;
                }
              } else if (evtType === "delta") {
                let deltaTxt = payload.delta || payload.texto || "";
                if (deltaTxt.includes("<think>") || deltaTxt.includes("</think>")) {
                  const thinkMatch = /<think>([\s\S]*?)(?:<\/think>|$)/i.exec(deltaTxt);
                  if (thinkMatch) {
                    const pTxt = thinkMatch[1] ?? "";
                    assistente.pensamento = (assistente.pensamento || "") + pTxt;
                    deltaTxt = deltaTxt.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "");
                  }
                }
                if (deltaTxt) {
                  assistente.content += deltaTxt;
                  const passos = [...(assistente.passos || [])];
                  const ultP = passos[passos.length - 1];
                  if (ultP && ultP.tipo === "texto") {
                    if (!ultP.texto?.endsWith(deltaTxt)) {
                      ultP.texto = (ultP.texto || "") + deltaTxt;
                    }
                  } else {
                    passos.push({ tipo: "texto", texto: deltaTxt });
                  }
                  assistente.passos = passos;
                }
              } else if (evtType === "pensamento") {
                const deltaTxt = payload.delta || payload.pensamento || payload.texto || "";
                if (deltaTxt) {
                  assistente.pensamento = (assistente.pensamento || "") + deltaTxt;
                  const passos = [...(assistente.passos || [])];
                  const ultP = passos[passos.length - 1];
                  if (ultP && ultP.tipo === "pensamento") {
                    if (!ultP.texto?.endsWith(deltaTxt)) {
                      ultP.texto = (ultP.texto || "") + deltaTxt;
                    }
                  } else {
                    passos.push({ tipo: "pensamento", texto: deltaTxt });
                  }
                  assistente.passos = passos;
                }
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
                if (payload.modelo) {
                  assistente.modelo = payload.modelo;
                }
                if (payload.resposta && !assistente.content) {
                  assistente.content = payload.resposta;
                }
                if (payload.gitStatus) {
                  assistente.gitStatus = payload.gitStatus;
                }
                if (payload.gitDiff) {
                  assistente.gitDiff = payload.gitDiff;
                }
              } else if (evtType === "erro") {
                assistente.concluida = true;
                const msgErro = payload.erro || payload.mensagem || "Erro desconhecido";
                const rotacoes = [...(assistente.rotacoes || [])];
                const jaExiste = rotacoes.some((r) => r.aviso?.includes(msgErro));
                if (!jaExiste) {
                  rotacoes.push({
                    tipo: "erro",
                    aviso: `⚠️ Erro: ${msgErro}`,
                    erro: true,
                    timestamp: Date.now(),
                  });
                  assistente.rotacoes = rotacoes;
                }
                assistente.content = assistente.content
                  ? `${assistente.content}\n\n> **Erro no Secretário**: ${msgErro}`
                  : `> **Erro no Secretário**: ${msgErro}`;
              }

              return [...prev.slice(0, ultIdx), assistente];
            });

            scrollFim(false);
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
      setStreamingAtivo(false);
      abortController = null;
      void carregarSessoes();
      const sidFinal = sessaoAtivaId();
      if (sidFinal) {
        try { syncChannel?.postMessage({ tipo: "mensagem_concluida", sessao_id: sidFinal }); } catch {}
        void fetchApi<ChatMensagem[]>(`/secretario/sessoes/${encodeURIComponent(sidFinal)}/mensagens`)
          .then((msgsFinais) => {
            if (Array.isArray(msgsFinais) && msgsFinais.length > 0) {
              setMensagens((prev) => reconciliarMensagens(prev, msgsFinais));
              const ult = msgsFinais[msgsFinais.length - 1];
              if (ult && (ult.concluida === false || ult.role === "user")) {
                retomarMonitoramento(sidFinal);
                return;
              }
            }
            if (timerInterval) {
              clearInterval(timerInterval);
              timerInterval = null;
            }
            setCarregando(false);
          })
          .catch(() => {
            if (timerInterval) {
              clearInterval(timerInterval);
              timerInterval = null;
            }
            setCarregando(false);
          });
      } else {
        if (timerInterval) {
          clearInterval(timerInterval);
          timerInterval = null;
        }
        setCarregando(false);
      }
    }
    return true;
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
    void carregarAgentesEMotores();
    void verificarAlertasFalhas();
    const timerAlertas = setInterval(() => void verificarAlertasFalhas(), 60000);

    if (syncChannel) {
      syncChannel.onmessage = (ev) => {
        const d = ev.data;
        if (!d) return;
        if (d.sessao_id && d.sessao_id === sessaoAtivaId()) {
          if (!streamingAtivo()) {
            retomarMonitoramento(d.sessao_id);
          }
        } else if (d.tipo === "nova_sessao" || d.tipo === "sessao_deletada") {
          void carregarSessoes();
        }
      };
    }

    const onFoco = () => {
      const sid = sessaoAtivaId();
      if (sid && !streamingAtivo() && !temMaisMensagensAnteriores()) {
        void fetchApi<ChatMensagem[]>(`/secretario/sessoes/${encodeURIComponent(sid)}/mensagens`)
          .then((msgs) => {
            if (Array.isArray(msgs) && msgs.length > 0) {
              setMensagens((prev) => reconciliarMensagens(prev, msgs));
              const ult = msgs[msgs.length - 1];
              if (ult && (ult.concluida === false || ult.role === "user")) {
                retomarMonitoramento(sid);
              }
            }
          })
          .catch(() => null);
      }
    };
    window.addEventListener("focus", onFoco);

    const onSseSecretario = (e: Event) => {
      const d = (e as CustomEvent).detail;
      const sid = d?.dados?.sessao_id || d?.sessao_id;
      if (sid && sid === sessaoAtivaId() && !streamingAtivo()) {
        retomarMonitoramento(sid);
      }
    };
    window.addEventListener("secretario:mensagem", onSseSecretario);

    onCleanup(() => {
      window.removeEventListener("focus", onFoco);
      window.removeEventListener("secretario:mensagem", onSseSecretario);
      clearInterval(timerAlertas);
      if (syncChannel) {
        try { syncChannel.close(); } catch {}
      }
    });
  });

  createEffect(() => {
    void wsAtivo();
    void carregarSessoes();
    void carregarAgentesEMotores();
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

  const store: ChatStore = {
    sessoes,
    sessaoAtivaId,
    emNovaConversa,
    selecionarSessao,
    novaConversa,
    excluirSessao,
    carregarSessoes,
    mensagens,
    carregando,
    decorridoSegundos,
    decorridoFmt,
    retomarMonitoramento,
    carregarMensagensAnteriores,
    totalMensagensServidor,
    temMaisMensagensAnteriores,
    carregandoAnteriores,
    inputValor,
    setInputValor,
    anexos,
    setAnexos,
    filaPrompts,
    adicionarFila,
    removerFila,
    editarFila,
    adiantarFila,
    enviarMensagem,
    pararStream,
    editarPrompt,
    refTextareaPara,
    agente,
    setAgente,
    listaAgentes,
    listaMotores,
    modeloConfig,
    setModeloConfig,
    carregarAgentesEMotores,
    agenteConfig,
    motorConfig,
    motorInferido,
    rotacaoConfig,
    modeloAtivoChat,
    setModeloAtivoChat,
    overrideAgente,
    overrideModelo,
    setRotacaoConfig,
    testandoMotor,
    resultadoTeste,
    salvandoConfig,
    abrirPainelLateral,
    aoMudarAgenteConfig,
    aoMudarMotorConfig,
    testarMotorConexao,
    salvarConfigLateral,
    aplicarAgenteAoChat,
    sincronizarSessaoAtiva,
    alertaFalhas,
    dispensarAlertaFalhas: () => setAlertaFalhas(null),
    aprovarHitl,
    rejeitarHitl,
    sugestoes: SUGESTOES_RAPIDAS.map((s) => ({ rotulo: s, prompt: s })),
  };

  return <ChatContext.Provider value={store}>{props.children}</ChatContext.Provider>;
};
