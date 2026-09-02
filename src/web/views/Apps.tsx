import { type Component, createSignal, onMount, For, Show } from "solid-js";
import { KeyRound, ShieldCheck, Server, Globe, Plus, Trash2, X, Lock, RefreshCw } from "lucide-solid";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { showToast } from "../ui/Toast";
import { fetchApi } from "../lib/context";

export const AppsView: Component = () => {
  const [secrets, setSecrets] = createSignal<any[]>([]);
  const [modalNovo, setModalNovo] = createSignal(false);
  const [novoNome, setNovoNome] = createSignal("");
  const [novoValor, setNovoValor] = createSignal("");
  const [salvando, setSalvando] = createSignal(false);

  const carregarSecrets = async () => {
    try {
      const lista = await fetchApi<any[]>("/secrets");
      setSecrets(lista || []);
    } catch {}
  };

  const criarSecret = async () => {
    const nome = novoNome().trim().toUpperCase();
    const valor = novoValor().trim();
    if (!nome || !valor) {
      showToast("Preencha o nome da chave e o valor secreto", "aviso");
      return;
    }
    setSalvando(true);
    try {
      await fetchApi("/secrets", {
        method: "POST",
        body: JSON.stringify({ nome, valor }),
      });
      setNovoNome("");
      setNovoValor("");
      setModalNovo(false);
      showToast("Segredo armazenado com sucesso!", "sucesso");
      void carregarSecrets();
    } catch (err: any) {
      showToast(`Erro ao salvar: ${err.message}`, "erro");
    } finally {
      setSalvando(false);
    }
  };

  const excluirSecret = async (nome: string) => {
    if (!confirm(`Tem certeza que deseja remover o segredo ${nome}?`)) return;
    try {
      await fetchApi(`/secrets/${encodeURIComponent(nome)}`, { method: "DELETE" });
      setSecrets((prev) => prev.filter((s) => (typeof s === "string" ? s !== nome : s.nome !== nome)));
      showToast("Segredo removido", "sucesso");
    } catch (err: any) {
      showToast(`Erro ao excluir: ${err.message}`, "erro");
    }
  };

  onMount(() => {
    void carregarSecrets();
  });

  return (
    <div class="flex flex-col h-full w-full overflow-hidden p-6 space-y-5 bg-zinc-950">
      {/* Header */}
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-800">
        <div>
          <h1 class="text-xl font-bold text-zinc-100 tracking-tight">Apps & Segredos Mascarados</h1>
          <p class="text-xs text-zinc-400">
            Credenciais criptografadas de infraestrutura, WordPress, GitHub e gateways (valores nunca expostos).
          </p>
        </div>
        <div class="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={carregarSecrets} title="Atualizar">
            <RefreshCw size={13} />
          </Button>
          <Button size="sm" variant="primary" onClick={() => setModalNovo(true)}>
            <Plus size={14} class="mr-1" /> Novo Segredo
          </Button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto min-h-0 space-y-6 scrollbar-thin">
        {/* Apps de Infraestrutura Conectados */}
        <div>
          <h2 class="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">
            Conectores de Infraestrutura & Apps
          </h2>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col justify-between">
              <div>
                <div class="flex items-center gap-2 mb-2 text-blue-400">
                  <Server size={18} />
                  <span class="text-sm font-semibold text-zinc-100">Servidores VPS</span>
                </div>
                <p class="text-xs text-zinc-400 leading-relaxed">
                  Parâmetros de conexão remota e chaves SSH para automação de testes e deploys.
                </p>
              </div>
              <div class="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-500">
                <span>Status: Protegido</span>
                <ShieldCheck size={15} class="text-emerald-400" />
              </div>
            </div>

            <div class="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col justify-between">
              <div>
                <div class="flex items-center gap-2 mb-2 text-blue-300">
                  <Globe size={18} />
                  <span class="text-sm font-semibold text-zinc-100">WordPress / CMS</span>
                </div>
                <p class="text-xs text-zinc-400 leading-relaxed">
                  Credenciais de aplicação para rondas de inspeção, curadoria e auto-publish 24h.
                </p>
              </div>
              <div class="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-500">
                <span>Status: Ativo</span>
                <ShieldCheck size={15} class="text-emerald-400" />
              </div>
            </div>

            <div class="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col justify-between">
              <div>
                <div class="flex items-center gap-2 mb-2 text-purple-400">
                  <KeyRound size={18} />
                  <span class="text-sm font-semibold text-zinc-100">OpenRouter LLMs</span>
                </div>
                <p class="text-xs text-zinc-400 leading-relaxed">
                  Autenticação dos modelos de linguagem gratuitos e rotacionados do OpenCode.
                </p>
              </div>
              <div class="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-500">
                <span>Status: Conectado</span>
                <ShieldCheck size={15} class="text-emerald-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Tabela de Segredos Armazenados */}
        <div>
          <h2 class="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">
            Chaves & Variáveis de Ambiente Seguras
          </h2>
          <div class="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
            <For
              each={secrets()}
              fallback={
                <div class="p-8 text-center text-xs text-zinc-500">
                  Nenhum segredo cadastrado manualmente ainda.
                </div>
              }
            >
              {(s) => {
                const nome = typeof s === "string" ? s : s.nome || s.name;
                return (
                  <div class="p-3.5 border-b border-zinc-800/60 last:border-0 flex items-center justify-between gap-4 hover:bg-zinc-900/60 transition-colors">
                    <div class="flex items-center gap-3">
                      <Lock size={15} class="text-emerald-400" />
                      <div>
                        <div class="font-mono text-xs font-semibold text-zinc-200">{nome}</div>
                        <div class="font-mono text-[10px] text-zinc-500">••••••••••••••••••••</div>
                      </div>
                    </div>
                    <IconButton
                      size="xs"
                      variant="ghost"
                      class="text-zinc-500 hover:text-rose-400"
                      onClick={() => excluirSecret(nome)}
                      title="Excluir segredo"
                    >
                      <Trash2 size={13} />
                    </IconButton>
                  </div>
                );
              }}
            </For>
          </div>
        </div>
      </div>

      {/* Modal Novo Segredo */}
      <Show when={modalNovo()}>
        <div class="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div class="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div class="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 class="text-sm font-bold text-zinc-100">Armazenar Novo Segredo</h2>
              <IconButton size="xs" variant="ghost" onClick={() => setModalNovo(false)}>
                <X size={16} />
              </IconButton>
            </div>

            <div class="space-y-3 text-xs">
              <div>
                <label class="block text-zinc-400 mb-1 font-medium">Nome da Chave *</label>
                <input
                  type="text"
                  placeholder="Ex: WP_APP_PASSWORD ou GITHUB_TOKEN"
                  value={novoNome()}
                  onInput={(e) => setNovoNome(e.currentTarget.value)}
                  class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono uppercase"
                />
              </div>

              <div>
                <label class="block text-zinc-400 mb-1 font-medium">Valor Secreto *</label>
                <input
                  type="password"
                  placeholder="Cole o token ou senha..."
                  value={novoValor()}
                  onInput={(e) => setNovoValor(e.currentTarget.value)}
                  class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono"
                />
                <span class="text-[10px] text-zinc-500 mt-1 block">
                  O valor será gravado em formato seguro e mascarado permanentemente.
                </span>
              </div>
            </div>

            <div class="pt-3 border-t border-zinc-800 flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setModalNovo(false)}>
                Cancelar
              </Button>
              <Button size="sm" variant="primary" loading={salvando()} onClick={criarSecret}>
                Salvar Segredo
              </Button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};
