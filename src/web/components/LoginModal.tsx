import { type Component, createSignal, Show } from "solid-js";
import { KeyRound, ShieldCheck, ArrowRight, Terminal, AlertCircle } from "lucide-solid";
import { setToken, setAutenticado, carregarWorkspaces, conectarSSE } from "../lib/context";

export const LoginModal: Component = () => {
  const [tokenInput, setTokenInput] = createSignal("");
  const [erro, setErro] = createSignal("");
  const [carregando, setCarregando] = createSignal(false);

  const submeterLogin = async (e?: Event) => {
    if (e) e.preventDefault();
    const t = tokenInput().trim();
    if (!t) {
      setErro("Informe o token de acesso do OpenCorp");
      return;
    }

    setCarregando(true);
    setErro("");

    try {
      const res = await fetch("/workspaces", {
        headers: {
          Authorization: `Bearer ${t}`,
        },
      });

      if (res.status === 401) {
        setErro("Token inválido ou expirado — verifique seu terminal ou ~/.opencorp/secrets.json");
        setCarregando(false);
        return;
      }

      setToken(t);
      setAutenticado(true);
      await carregarWorkspaces();
      conectarSSE();
    } catch (err: any) {
      setErro(`Erro de conexão com o servidor: ${err?.message || err}`);
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div
      id="login-screen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/90 backdrop-blur-md p-4 animate-in fade-in duration-200"
    >
      <div class="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden p-6 sm:p-8 flex flex-col gap-6">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h2 class="text-lg font-semibold text-zinc-100 flex items-center gap-2">
              Autenticação OpenCorp
            </h2>
            <p class="text-xs text-zinc-400">
              Acesso seguro ao orquestrador de agentes e ferramentas
            </p>
          </div>
        </div>

        <Show when={erro()}>
          <div
            id="login-error"
            class="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400"
          >
            <AlertCircle size={15} class="shrink-0" />
            <span>{erro()}</span>
          </div>
        </Show>

        <form onSubmit={submeterLogin} class="flex flex-col gap-4">
          <div>
            <label class="block text-xs font-medium text-zinc-300 mb-1.5">
              Token de Acesso (API Bearer Token)
            </label>
            <div class="relative">
              <input
                id="login-token"
                type="password"
                placeholder="Ex: test-e2e ou cole o token gerado"
                value={tokenInput()}
                onInput={(e) => setTokenInput(e.currentTarget.value)}
                class="w-full bg-zinc-950 border border-zinc-700/60 rounded-xl px-3.5 py-2.5 pl-10 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all font-mono"
                autofocus
              />
              <KeyRound size={16} class="absolute left-3.5 top-3 text-zinc-500" />
            </div>
          </div>

          <button
            id="login-btn"
            type="submit"
            disabled={carregando()}
            class="w-full bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-zinc-950 font-medium py-2.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm shadow-lg shadow-cyan-500/10 disabled:opacity-50"
          >
            {carregando() ? "Validando..." : "Entrar no OpenCorp"}
            <ArrowRight size={16} />
          </button>
        </form>

        <div class="pt-4 border-t border-zinc-800/80 flex flex-col gap-2">
          <div class="flex items-center gap-2 text-[11px] text-zinc-400">
            <Terminal size={13} class="text-cyan-400 shrink-0" />
            <span>Como obter seu token no terminal:</span>
          </div>
          <code class="text-[11px] font-mono bg-zinc-950 p-2.5 rounded-lg border border-zinc-800 text-zinc-300">
            opencorp serve --token &lt;seu-token&gt;
          </code>
        </div>
      </div>
    </div>
  );
};
