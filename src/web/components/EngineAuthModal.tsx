import { type Component, createSignal, Show, onCleanup, createEffect } from "solid-js";
import {
  ShieldCheck,
  Terminal,
  KeyRound,
  ExternalLink,
  Copy,
  Check,
  Play,
  CheckCircle2,
  AlertTriangle,
  X,
  Globe,
  RefreshCw,
  Sparkles,
  ArrowRight,
  Shield,
  Zap,
} from "lucide-solid";
import { Modal } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { showToast } from "../ui/Toast";
import { fetchApi } from "../lib/context";

export interface EngineAuthModalProps {
  open: boolean;
  onClose: () => void;
  motor: any | null;
  onSuccess?: () => void;
  onGoToKeysTab?: () => void;
}

interface WebLoginSession {
  id: string;
  motorId: string;
  status: "iniciando" | "aguardando_usuario" | "concluido" | "erro";
  authUrl?: string;
  userCode?: string;
  message?: string;
  autoInheritAvailable?: boolean;
  autoInheritUser?: string;
  accountName?: string;
}

export const EngineAuthModal: Component<EngineAuthModalProps> = (props) => {
  const [abaModal, setAbaModal] = createSignal<"web" | "direto" | "cli">("web");
  const [copiado, setCopiado] = createSignal(false);
  const [codigoCopiado, setCodigoCopiado] = createSignal(false);
  const [urlCopiada, setUrlCopiada] = createSignal(false);
  const [testando, setTestando] = createSignal(false);
  const [testResult, setTestResult] = createSignal<any | null>(null);
  const [conectando, setConectando] = createSignal(false);

  // Web Login Signals
  const [webSession, setWebSession] = createSignal<WebLoginSession | null>(null);
  const [iniciandoWeb, setIniciandoWeb] = createSignal(false);
  const [autoConectando, setAutoConectando] = createSignal(false);
  const [codigoResposta, setCodigoResposta] = createSignal("");
  const [enviandoCodigo, setEnviandoCodigo] = createSignal(false);
  let pollingTimer: any = null;

  const submeterCodigo = async () => {
    const session = webSession();
    if (!session || !codigoResposta().trim()) return;
    setEnviandoCodigo(true);
    try {
      await fetchApi(`/api/motores/${encodeURIComponent(props.motor.id)}/login-web/${encodeURIComponent(session.id)}/code`, {
        method: "POST",
        body: JSON.stringify({ code: codigoResposta().trim() }),
      });
      showToast("Código enviado para validação!", "info");
    } catch (err: any) {
      showToast(`Erro ao enviar código: ${err.message}`, "erro");
    } finally {
      setEnviandoCodigo(false);
    }
  };

  const limparPolling = () => {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
  };

  onCleanup(() => {
    limparPolling();
  });

  // Reset or initialize state when modal opens or motor changes
  createEffect(() => {
    if (props.open && props.motor?.id) {
      setWebSession(null);
      setTestResult(null);
      limparPolling();
      // If engine supports web login, default to 'web', otherwise 'direto'
      const webEngines = ["codex", "cursor", "copilot", "claude-code", "antigravity"];
      if (webEngines.includes(props.motor.id)) {
        setAbaModal("web");
      } else {
        setAbaModal("direto");
      }
    } else {
      limparPolling();
      setWebSession(null);
    }
  });

  const getInstructions = () => {
    const id = props.motor?.id;
    switch (id) {
      case "copilot":
        return {
          title: "GitHub Copilot CLI",
          webTitle: "Login no Navegador com GitHub Copilot",
          cliCommand: "copilot login --device-code",
          cliAlt: "gh auth login",
          envVar: "COPILOT_GITHUB_TOKEN",
          url: "https://github.com/settings/tokens",
          urlText: "GitHub Tokens",
          desc: "O GitHub Copilot pode ser autorizado em 1 clique importando sua conta do GitHub CLI ou pelo navegador via código de dispositivo.",
          webPrompt: "Autorize o GitHub Copilot para permitir que os agentes utilizem modelos GPT-4o, Claude 3.5 Sonnet e o2.",
        };
      case "claude-code":
        return {
          title: "Claude Code (Anthropic)",
          webTitle: "Login no Navegador com Anthropic Claude",
          cliCommand: "claude login",
          cliAlt: "claude setup-token",
          envVar: "ANTHROPIC_API_KEY",
          url: "https://console.anthropic.com/settings/keys",
          urlText: "Anthropic Console",
          desc: "Execute o login via navegador com sua conta Anthropic Claude Pro/Team ou forneça sua chave de API.",
          webPrompt: "Acesse o console da Anthropic para autorizar o Claude Code ou gerar um token de acesso Pro/Team.",
        };
      case "cursor":
        return {
          title: "Cursor Agent CLI",
          webTitle: "Login no Navegador com Cursor Agent",
          cliCommand: "agent login",
          cliAlt: "NO_OPEN_BROWSER=1 agent login",
          envVar: "CURSOR_API_KEY",
          url: "https://cursor.com/settings",
          urlText: "Cursor Settings",
          desc: "O Cursor Agent gera um link direto de autenticação web profunda para vincular sua conta Pro / Business.",
          webPrompt: "Clique para gerar a URL de autorização profunda e vincular sua assinatura Cursor ao OpenCorp.",
        };
      case "codex":
        return {
          title: "OpenAI Codex CLI",
          webTitle: "Login no Navegador com OpenAI Codex",
          cliCommand: "codex login --device-auth",
          cliAlt: "codex login status",
          envVar: "OPENAI_API_KEY",
          url: "https://platform.openai.com/api-keys",
          urlText: "OpenAI Platform",
          desc: "O Codex CLI utiliza autorização de dispositivo (OAuth Device Code). O OpenCorp obtém o link e o código automaticamente.",
          webPrompt: "Inicie o login para receber a URL oficial da OpenAI e o código de dispositivo para vincular sua conta.",
        };
      case "antigravity":
        return {
          title: "Google Antigravity (AGY)",
          webTitle: "Login com Google Antigravity / AI Studio",
          cliCommand: "agy login",
          cliAlt: "gcloud auth application-default login",
          envVar: "GEMINI_API_KEY",
          url: "https://aistudio.google.com/app/apikey",
          urlText: "Google AI Studio",
          desc: "O Antigravity funciona gratuitamente com chaves do Google AI Studio ($0 para Gemini Flash) ou via login desenvolvedor agy.",
          webPrompt: "Obtenha acesso gratuito e instantâneo com chaves do Google AI Studio ou vincule credenciais do agy.",
        };
      case "crom-agente":
        return {
          title: "Crom-Agente Engine (Go)",
          webTitle: "Conexão Crom-Agente Engine",
          cliCommand: "export OPENROUTER_API_KEY=sk-or-...",
          cliAlt: "Verificar chave em Chaves de API",
          envVar: "OPENROUTER_API_KEY",
          url: "https://openrouter.ai/settings/keys",
          urlText: "OpenRouter Keys",
          desc: "O Crom-Agente opera local-first com ciclo ReAct e consome o provedor OpenRouter BYOK já configurado no OpenCorp.",
          webPrompt: "Utilize o provedor OpenRouter já conectado no OpenCorp para executar agentes autónomos.",
        };
      case "opencode":
      default:
        return {
          title: "OpenCode Engine",
          webTitle: "Conexão OpenCode Engine",
          cliCommand: "opencode auth login",
          cliAlt: "Configurações > Chaves de API",
          envVar: "OPENROUTER_API_KEY",
          url: "https://openrouter.ai/settings/keys",
          urlText: "OpenRouter Keys",
          desc: "O OpenCode utiliza OpenRouter BYOK ou provedores diretos configurados no OpenCorp.",
          webPrompt: "Conecte sua conta OpenRouter ou adicione chaves de provedores em Chaves de API.",
        };
    }
  };

  const copiarTexto = (txt: string, tipo: "comando" | "codigo" | "url") => {
    navigator.clipboard.writeText(txt);
    if (tipo === "comando") {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } else if (tipo === "codigo") {
      setCodigoCopiado(true);
      setTimeout(() => setCodigoCopiado(false), 2000);
    } else {
      setUrlCopiada(true);
      setTimeout(() => setUrlCopiada(false), 2000);
    }
    showToast("Copiado para a área de transferência!", "info");
  };

  // 1-Click Web Login Trigger
  const iniciarLoginWeb = async () => {
    if (!props.motor?.id) return;
    setIniciandoWeb(true);
    limparPolling();

    try {
      const res = await fetchApi<{ ok: boolean; session: WebLoginSession }>(
        `/api/motores/${encodeURIComponent(props.motor.id)}/login-web`,
        { method: "POST" }
      );

      if (res.ok && res.session) {
        setWebSession(res.session);

        if (res.session.status === "concluido") {
          showToast(`Motor ${props.motor.name} autenticado com sucesso!`, "sucesso");
          props.onSuccess?.();
          return;
        }

        // Start polling if waiting for user
        if (res.session.status === "iniciando" || res.session.status === "aguardando_usuario") {
          startPolling(res.session.id);
        }
      } else {
        showToast("Não foi possível iniciar a sessão de login web.", "erro");
      }
    } catch (err: any) {
      showToast(`Erro ao iniciar login web: ${err.message}`, "erro");
    } finally {
      setIniciandoWeb(false);
    }
  };

  const startPolling = (sessionId: string) => {
    limparPolling();
    pollingTimer = setInterval(async () => {
      try {
        const res = await fetchApi<{ ok: boolean; session: WebLoginSession }>(
          `/api/motores/${encodeURIComponent(props.motor.id)}/login-web/${encodeURIComponent(sessionId)}`
        );

        if (res.ok && res.session) {
          setWebSession(res.session);

          if (res.session.status === "concluido") {
            limparPolling();
            showToast(`Autenticação de ${props.motor.name} concluída com sucesso!`, "sucesso");
            props.onSuccess?.();
          } else if (res.session.status === "erro") {
            limparPolling();
            showToast(`Falha na autenticação: ${res.session.message || "Processo encerrado"}`, "aviso");
          }
        }
      } catch (err) {
        // Silent poll error
      }
    }, 1800);
  };

  const cancelarLoginWeb = async () => {
    const session = webSession();
    if (!session || !props.motor?.id) return;
    limparPolling();

    try {
      await fetchApi(
        `/api/motores/${encodeURIComponent(props.motor.id)}/login-web/${encodeURIComponent(session.id)}/cancel`,
        { method: "POST" }
      );
    } catch {
      // Ignorar erro ao cancelar
    } finally {
      setWebSession(null);
      showToast("Tentativa de login cancelada.", "info");
    }
  };

  const conectarAutomaticoCli = async () => {
    if (!props.motor?.id) return;
    setAutoConectando(true);
    try {
      const res = await fetchApi<any>(
        `/api/motores/${encodeURIComponent(props.motor.id)}/login-auto`,
        { method: "POST" }
      );
      if (res.ok) {
        showToast(`Conta conectada com sucesso a partir do GitHub CLI!`, "sucesso");
        props.onSuccess?.();
        props.onClose();
      } else {
        showToast(`Não foi possível conectar automaticamente: ${res.error || "Erro desconhecido"}`, "aviso");
      }
    } catch (err: any) {
      showToast(`Erro ao conectar automaticamente: ${err.message}`, "erro");
    } finally {
      setAutoConectando(false);
    }
  };

  const executarDiagnostico = async () => {
    if (!props.motor?.id) return;
    setTestando(true);
    setTestResult(null);
    try {
      const res = await fetchApi<any>(`/api/motores/${encodeURIComponent(props.motor.id)}/test`, {
        method: "POST",
      });
      setTestResult(res.health);
      if (res.health?.healthy) {
        showToast(`Motor ${props.motor.name} está operacional e autenticado!`, "sucesso");
        props.onSuccess?.();
      } else {
        showToast(`Motor requer autenticação: ${res.health?.statusText}`, "aviso");
      }
    } catch (err: any) {
      showToast(`Erro ao testar: ${err.message}`, "erro");
    } finally {
      setTestando(false);
    }
  };

  const conectarMotor = async (forcar = false) => {
    if (!props.motor?.id) return;
    setConectando(true);
    try {
      const query = forcar ? "?forcar=true" : "";
      const res = await fetchApi<any>(`/api/motores/${encodeURIComponent(props.motor.id)}/conectar${query}`, {
        method: "POST",
      });
      if (res.ok) {
        showToast(`Motor "${props.motor.name}" conectado com sucesso como motor ativo!`, "sucesso");
        props.onSuccess?.();
        props.onClose();
      }
    } catch (err: any) {
      showToast(`Erro ao conectar: ${err.message}`, "erro");
    } finally {
      setConectando(false);
    }
  };

  // Direct manual token input
  const [nomeConta, setNomeConta] = createSignal("");
  const [tokenOuChave, setTokenOuChave] = createSignal("");
  const [cotaDiariaUsd, setCotaDiariaUsd] = createSignal(10);
  const [rateLimitRpm, setRateLimitRpm] = createSignal(30);
  const [salvandoConta, setSalvandoConta] = createSignal(false);

  const conectarContaDireta = async () => {
    if (!props.motor?.id) return;
    const nome = nomeConta().trim() || `${props.motor.name} #${Date.now().toString().slice(-4)}`;
    setSalvandoConta(true);
    try {
      await fetchApi(`/api/motores/${encodeURIComponent(props.motor.id)}/contas`, {
        method: "POST",
        body: JSON.stringify({
          nome,
          tokenOuChave: tokenOuChave().trim() || undefined,
          authType: tokenOuChave().trim() ? "token" : "deviceOAuth",
          limits: {
            daily_cost_usd: Number(cotaDiariaUsd()) || 10,
            rate_limit_rpm: Number(rateLimitRpm()) || 30,
          },
        }),
      });
      showToast(`Conta "${nome}" conectada ao motor ${props.motor.name}!`, "sucesso");
      setNomeConta("");
      setTokenOuChave("");
      props.onSuccess?.();
      props.onClose();
    } catch (err: any) {
      showToast(`Erro ao conectar conta: ${err.message}`, "erro");
    } finally {
      setSalvandoConta(false);
    }
  };

  const isWebSupported = () => {
    const id = props.motor?.id;
    return ["codex", "cursor", "copilot", "claude-code", "antigravity"].includes(id);
  };

  return (
    <Modal open={props.open} onClose={props.onClose} title="">
      <div class="space-y-4 max-w-lg bg-transparent">
        {/* HEADER */}
        <div class="flex items-start justify-between gap-3 border-b border-zinc-800/80 pb-3">
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-lg bg-zinc-800/70 border border-zinc-700/50 flex items-center justify-center text-emerald-400 shrink-0">
              <Show when={abaModal() === "web"} fallback={<KeyRound size={18} />}>
                <Globe size={18} />
              </Show>
            </div>
            <div>
              <h3 class="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <span>Autenticar: {props.motor?.name}</span>
                <Show when={props.motor?.health?.healthy}>
                  <span class="inline-flex items-center gap-1 text-[10px] font-normal px-1.5 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-700/50 text-emerald-400">
                    <CheckCircle2 size={10} /> Ativo
                  </span>
                </Show>
              </h3>
              <p class="text-xs text-zinc-400">
                {abaModal() === "web"
                  ? "Login 1-clique via navegador sem necessidade de terminal"
                  : "Gerenciamento de credenciais e conexões do motor"}
              </p>
            </div>
          </div>
          <button
            onClick={props.onClose}
            class="text-zinc-500 hover:text-zinc-300 p-1 rounded-md hover:bg-zinc-800 transition-colors"
            title="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        {/* SELETOR DE MODO / TABS */}
        <div class="flex items-center gap-1.5 border-b border-zinc-800/60 pb-2">
          <Show when={isWebSupported()}>
            <button
              onClick={() => setAbaModal("web")}
              class={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
                abaModal() === "web"
                  ? "bg-emerald-950/40 text-emerald-300 border border-emerald-700/50 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
              }`}
            >
              <Globe size={13} />
              <span>Login no Navegador (1-Clique)</span>
            </button>
          </Show>

          <button
            onClick={() => setAbaModal("direto")}
            class={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
              abaModal() === "direto"
                ? "bg-zinc-800 text-zinc-100 border border-zinc-700/60 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
            }`}
          >
            <KeyRound size={13} />
            <span>Token / Chave Manual</span>
          </button>

          <button
            onClick={() => setAbaModal("cli")}
            class={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
              abaModal() === "cli"
                ? "bg-zinc-800 text-zinc-100 border border-zinc-700/60 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
            }`}
          >
            <Terminal size={13} />
            <span>Terminal CLI</span>
          </button>
        </div>

        {/* TAB 1: LOGIN 1-CLIQUE NO NAVEGADOR (WEB) */}
        <Show when={abaModal() === "web"}>
          <div class="space-y-3.5">
            {/* INSTRUÇÃO E CONTEXTO */}
            <div class="p-3 rounded-lg border border-zinc-800 bg-zinc-900/50 text-xs text-zinc-300 leading-relaxed">
              <p>{getInstructions().webPrompt}</p>
            </div>

            {/* ATALHO GITHUB CLI 1-CLIQUE (PARA COPILOT) */}
            <Show when={props.motor?.id === "copilot"}>
              <div class="p-3.5 rounded-lg border border-emerald-800/50 bg-emerald-950/20 space-y-2.5">
                <div class="flex items-start gap-2">
                  <Sparkles size={16} class="text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span class="text-xs font-semibold text-emerald-300 block">
                      Autenticação Rápida Detectada via GitHub CLI
                    </span>
                    <span class="text-[11px] text-zinc-400 block mt-0.5">
                      Você pode herdar imediatamente o token do GitHub CLI autenticado no sistema sem abrir o navegador.
                    </span>
                  </div>
                </div>
                <Button
                  size="xs"
                  variant="primary"
                  loading={autoConectando()}
                  onClick={conectarAutomaticoCli}
                  class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 py-2 shadow-sm"
                >
                  <Zap size={13} /> Conectar com 1 Clique via GitHub CLI
                </Button>
              </div>
            </Show>

            {/* ESTADO 1: NENHUMA SESSÃO EM ANDAMENTO */}
            <Show when={!webSession()}>
              <div class="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 text-center space-y-3">
                <div class="w-11 h-11 mx-auto rounded-full bg-emerald-950/40 border border-emerald-800/50 flex items-center justify-center text-emerald-400">
                  <Globe size={20} />
                </div>
                <div>
                  <h4 class="text-xs font-semibold text-zinc-100">Iniciar Autorização no Navegador</h4>
                  <p class="text-[11px] text-zinc-400 mt-1 max-w-xs mx-auto">
                    O OpenCorp gerará a URL de autenticação e o código correspondente para você acessar com um clique.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  loading={iniciandoWeb()}
                  onClick={iniciarLoginWeb}
                  class="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs px-5 py-2 shadow-sm"
                >
                  <Show when={!iniciandoWeb()} fallback={<RefreshCw size={13} class="animate-spin mr-1.5" />}>
                    <ExternalLink size={13} class="mr-1.5" />
                  </Show>
                  Iniciar Login no Navegador
                </Button>
              </div>
            </Show>

            {/* ESTADO 2: SESSÃO INICIADA / AGUARDANDO USUÁRIO */}
            <Show when={webSession() && (webSession()?.status === "iniciando" || webSession()?.status === "aguardando_usuario")}>
              <div class="space-y-3 p-4 rounded-xl border border-zinc-700/60 bg-zinc-900/70">
                {/* STATUS BAR PULSANTE */}
                <div class="flex items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                  <div class="flex items-center gap-2">
                    <div class="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    <span class="text-xs font-semibold text-zinc-200">
                      {webSession()?.authUrl ? "Aguardando autorização no navegador" : "Iniciando processo..."}
                    </span>
                  </div>
                  <span class="text-[10px] text-zinc-500 font-mono">
                    Sessão #{webSession()?.id?.slice(0, 8)}
                  </span>
                </div>

                {/* EXIBIÇÃO DO CÓDIGO DO DISPOSITIVO (SE APLICÁVEL - CODEX / COPILOT) */}
                <Show when={webSession()?.userCode}>
                  <div class="space-y-1.5 bg-zinc-950/80 p-3 rounded-lg border border-amber-800/40">
                    <span class="text-[11px] font-medium text-amber-300 block">
                      Passo 1: Copie o seu código de autorização único
                    </span>
                    <div class="flex items-center justify-between gap-2 bg-zinc-900 border border-zinc-800 px-3 py-2 rounded">
                      <span class="font-mono text-sm font-bold tracking-widest text-emerald-400 select-all">
                        {webSession()?.userCode}
                      </span>
                      <Button
                        size="xs"
                        variant="secondary"
                        onClick={() => copiarTexto(webSession()!.userCode!, "codigo")}
                        class="text-xs shrink-0"
                      >
                        <Show when={codigoCopiado()} fallback={<Copy size={12} class="mr-1" />}>
                          <Check size={12} class="mr-1 text-emerald-400" />
                        </Show>
                        {codigoCopiado() ? "Copiado!" : "Copiar Código"}
                      </Button>
                    </div>
                    <p class="text-[10px] text-zinc-400">
                      Cole este código exato na página de autorização que abrirá a seguir.
                    </p>
                  </div>
                </Show>

                {/* BOTÃO PRINCIPAL: ABRIR URL DE LOGIN */}
                <Show when={webSession()?.authUrl}>
                  <div class="space-y-2 pt-1">
                    <span class="text-[11px] font-medium text-zinc-300 block">
                      {webSession()?.userCode ? "Passo 2: Abra a página oficial no navegador" : "Passo 1: Clique para abrir e autorizar"}
                    </span>
                    <a
                      href={webSession()!.authUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs py-2.5 px-4 rounded-lg shadow-md transition-all group"
                    >
                      <span>Abrir Página de Login no Navegador</span>
                      <ExternalLink size={14} class="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                    </a>

                    <div class="flex items-center justify-between text-[11px] text-zinc-500 pt-1">
                      <button
                        onClick={() => copiarTexto(webSession()!.authUrl!, "url")}
                        class="hover:text-zinc-300 flex items-center gap-1 transition-colors"
                      >
                        <Copy size={11} /> {urlCopiada() ? "Link copiado!" : "Copiar link direto"}
                      </button>
                      <span class="flex items-center gap-1.5 text-amber-400/90">
                        <RefreshCw size={11} class="animate-spin" /> Verificando autorização...
                      </span>
                    </div>

                    <Show when={props.motor?.id === "claude-code"}>
                      <div class="space-y-1.5 bg-zinc-950/80 p-2.5 rounded-lg border border-purple-800/40 mt-2">
                        <span class="text-[11px] font-medium text-purple-300 block">
                          Passo 2: Cole o código gerado após autorizar no Claude.ai
                        </span>
                        <div class="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Cole o código retornado aqui..."
                            value={codigoResposta()}
                            onInput={(e) => setCodigoResposta(e.currentTarget.value)}
                            class="flex-1 bg-zinc-900 border border-zinc-700/60 rounded px-2.5 py-1 text-xs text-zinc-100 font-mono focus:outline-none focus:border-purple-500"
                          />
                          <Button
                            size="xs"
                            variant="primary"
                            loading={enviandoCodigo()}
                            onClick={submeterCodigo}
                            class="bg-purple-600 hover:bg-purple-500 text-white text-xs px-3 shrink-0"
                          >
                            Confirmar
                          </Button>
                        </div>
                      </div>
                    </Show>
                  </div>
                </Show>

                {/* SE AINDA NÃO TEM URL */}
                <Show when={!webSession()?.authUrl}>
                  <div class="py-4 text-center space-y-2">
                    <RefreshCw size={20} class="animate-spin text-emerald-400 mx-auto" />
                    <p class="text-xs text-zinc-400">Obtendo link de acesso com o provedor...</p>
                  </div>
                </Show>

                {/* BOTÃO CANCELAR */}
                <div class="pt-2 border-t border-zinc-800/80 flex items-center justify-end">
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={cancelarLoginWeb}
                    class="text-zinc-400 hover:text-zinc-200 text-xs"
                  >
                    Cancelar Tentativa
                  </Button>
                </div>
              </div>
            </Show>

            {/* ESTADO 3: AUTENTICAÇÃO CONCLUÍDA */}
            <Show when={webSession()?.status === "concluido"}>
              <div class="p-4 rounded-xl border border-emerald-800/50 bg-emerald-950/30 text-center space-y-3">
                <div class="w-12 h-12 mx-auto rounded-full bg-emerald-900/60 border border-emerald-600/60 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <h4 class="text-sm font-semibold text-emerald-300">Autenticação Concluída com Sucesso!</h4>
                  <p class="text-xs text-zinc-300 mt-1 max-w-sm mx-auto">
                    {webSession()?.message || `A conta foi vinculada e o motor ${props.motor?.name} está autenticado e pronto para uso.`}
                  </p>
                </div>
                <div class="pt-2 flex items-center justify-center gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      props.onSuccess?.();
                      props.onClose();
                    }}
                    class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-4 py-1.5"
                  >
                    <Check size={13} class="mr-1" /> Concluir e Fechar
                  </Button>
                </div>
              </div>
            </Show>

            {/* ESTADO 4: ERRO NO LOGIN */}
            <Show when={webSession()?.status === "erro"}>
              <div class="p-4 rounded-xl border border-red-800/50 bg-red-950/30 text-center space-y-3">
                <div class="w-11 h-11 mx-auto rounded-full bg-red-900/60 border border-red-600/60 flex items-center justify-center text-red-400">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h4 class="text-xs font-semibold text-red-300">Falha na Autenticação</h4>
                  <p class="text-[11px] text-zinc-400 mt-1">
                    {webSession()?.message || "Ocorreu um erro ou a tentativa expirou. Tente novamente."}
                  </p>
                </div>
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={iniciarLoginWeb}
                  class="text-xs"
                >
                  <RefreshCw size={12} class="mr-1" /> Tentar Novamente
                </Button>
              </div>
            </Show>
          </div>
        </Show>

        {/* TAB 2: TOKEN / CHAVE MANUAL */}
        <Show when={abaModal() === "direto"}>
          <div class="space-y-3">
            <div>
              <label class="block text-xs font-medium text-zinc-300 mb-1">Nome / Identificador da Conta</label>
              <input
                type="text"
                placeholder={`ex.: ${props.motor?.name} - Pessoal ou Trabalho`}
                value={nomeConta()}
                onInput={(e) => setNomeConta(e.currentTarget.value)}
                class="w-full bg-zinc-900/80 border border-zinc-800 rounded px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
              />
            </div>

            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="text-xs font-medium text-zinc-300">
                  Token, Chave de API ou Credencial ({getInstructions().envVar})
                </label>
                <a
                  href={getInstructions().url}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
                >
                  Obter no {getInstructions().urlText} <ExternalLink size={10} />
                </a>
              </div>
              <input
                type="password"
                placeholder="Insira a credencial / token de acesso"
                value={tokenOuChave()}
                onInput={(e) => setTokenOuChave(e.currentTarget.value)}
                class="w-full bg-zinc-900/80 border border-zinc-800 rounded px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 font-mono focus:outline-none focus:border-zinc-600"
              />
              <p class="text-[11px] text-zinc-500 mt-1">
                Credencial armazenada localmente de forma isolada em ~/.opencorp/engine-accounts.json.
              </p>
            </div>

            <div class="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label class="block text-xs text-zinc-400 mb-1">Cota Diária (USD)</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={cotaDiariaUsd()}
                  onInput={(e) => setCotaDiariaUsd(Number(e.currentTarget.value))}
                  class="w-full bg-zinc-900/80 border border-zinc-800 rounded px-3 py-1 text-xs text-zinc-200"
                />
              </div>
              <div>
                <label class="block text-xs text-zinc-400 mb-1">Rate Limit (RPM)</label>
                <input
                  type="number"
                  min="5"
                  step="5"
                  value={rateLimitRpm()}
                  onInput={(e) => setRateLimitRpm(Number(e.currentTarget.value))}
                  class="w-full bg-zinc-900/80 border border-zinc-800 rounded px-3 py-1 text-xs text-zinc-200"
                />
              </div>
            </div>

            <div class="pt-3 border-t border-zinc-800/80 flex items-center justify-end gap-2">
              <Button size="xs" variant="ghost" onClick={props.onClose} class="text-xs">
                Cancelar
              </Button>
              <Button
                size="xs"
                variant="primary"
                loading={salvandoConta()}
                onClick={conectarContaDireta}
                class="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs"
              >
                <CheckCircle2 size={12} class="mr-1" /> Conectar Conta
              </Button>
            </div>
          </div>
        </Show>

        {/* TAB 3: TERMINAL CLI */}
        <Show when={abaModal() === "cli"}>
          <div class="space-y-3">
            {/* STATUS ATUAL */}
            <div
              class={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                (testResult()?.healthy ?? props.motor?.health?.healthy)
                  ? "bg-emerald-950/20 border-emerald-800/40 text-emerald-300"
                  : "bg-amber-950/20 border-amber-800/40 text-amber-300"
              }`}
            >
              <Show
                when={testResult()?.healthy ?? props.motor?.health?.healthy}
                fallback={<AlertTriangle size={16} class="shrink-0 text-amber-400 mt-0.5" />}
              >
                <ShieldCheck size={16} class="shrink-0 text-emerald-400 mt-0.5" />
              </Show>
              <div class="space-y-0.5">
                <span class="font-semibold block">
                  {(testResult()?.healthy ?? props.motor?.health?.healthy)
                    ? "Motor Autenticado e Pronto para Execução"
                    : "Autenticação Necessária"}
                </span>
                <span class="text-[11px] opacity-90 block">
                  {testResult()?.statusText ?? props.motor?.health?.statusText ?? "Status não diagnosticado"}
                </span>
              </div>
            </div>

            <p class="text-xs text-zinc-300 leading-relaxed">{getInstructions().desc}</p>

            {/* COMANDO TERMINAL */}
            <div class="space-y-1.5">
              <div class="flex items-center justify-between text-xs font-semibold text-zinc-200">
                <span class="flex items-center gap-1.5">
                  <Terminal size={13} class="text-zinc-400" /> Comando no Terminal
                </span>
              </div>
              <div class="relative bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/80 font-mono text-xs text-zinc-300 flex items-center justify-between">
                <span class="text-emerald-400 select-all">$ {getInstructions().cliCommand}</span>
                <Button
                  size="xs"
                  variant="ghost"
                  class="text-zinc-400 hover:text-white"
                  onClick={() => copiarTexto(getInstructions().cliCommand, "comando")}
                >
                  <Show when={copiado()} fallback={<Copy size={12} />}>
                    <Check size={12} class="text-emerald-400" />
                  </Show>
                </Button>
              </div>
            </div>

            {/* FOOTER ACTIONS CLI */}
            <div class="pt-3 border-t border-zinc-800/80 flex items-center justify-between gap-2">
              <Button
                size="xs"
                variant="secondary"
                loading={testando()}
                onClick={executarDiagnostico}
                class="text-xs"
              >
                <Play size={11} class="mr-1 fill-current text-zinc-300" /> Testar Prontidão Real
              </Button>

              <div class="flex items-center gap-2">
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={props.onClose}
                  class="text-zinc-400 hover:text-zinc-200 text-xs"
                >
                  Fechar
                </Button>
                <Button
                  size="xs"
                  variant="primary"
                  class="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs"
                  loading={conectando()}
                  onClick={() => conectarMotor(true)}
                >
                  <CheckCircle2 size={12} class="mr-1" /> Conectar Motor
                </Button>
              </div>
            </div>
          </div>
        </Show>
      </div>
    </Modal>
  );
};
