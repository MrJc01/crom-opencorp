import { type Component, createSignal, onMount, Show, For, type Accessor } from "solid-js";
import { Key, RefreshCw, Play, Trash2, Plus, Lock } from "lucide-solid";
import { Button } from "../../../ui/Button";
import { showToast } from "../../../ui/Toast";
import { fetchApi } from "../../../lib/context";
import { type SecretItem } from "./types";

export interface TabSecretsProps {
  escopoConfig?: Accessor<"global" | "workspace">;
}

export const TabSecrets: Component<TabSecretsProps> = (props) => {
  const escopo = () => (props.escopoConfig ? props.escopoConfig() : "global");

  const [chavesApi, setChavesApi] = createSignal<any>({
    global: { chaves: [] },
    workspace: { chaves: [], herdadas: [] },
  });
  const [carregandoChaves, setCarregandoChaves] = createSignal(false);
  const [novoProvider, setNovoProvider] = createSignal("openrouter");
  const [novaChaveValor, setNovaChaveValor] = createSignal("");
  const [novoEscopo, setNovoEscopo] = createSignal<"global" | "workspace">("global");
  const [salvandoChave, setSalvandoChave] = createSignal(false);

  const [secretsLista, setSecretsLista] = createSignal<SecretItem[]>([]);
  const [novoSecretNome, setNovoSecretNome] = createSignal("");
  const [novoSecretValor, setNovoSecretValor] = createSignal("");
  const [salvandoSecret, setSalvandoSecret] = createSignal(false);

  const carregarChaves = async () => {
    setCarregandoChaves(true);
    try {
      const data = await fetchApi<any>("/provider-keys");
      if (data) setChavesApi(data);
    } catch (err: any) {
      console.error("Falha ao carregar chaves:", err);
    } finally {
      setCarregandoChaves(false);
    }
  };

  const carregarSecrets = async () => {
    try {
      const data = await fetchApi<SecretItem[]>("/secrets");
      setSecretsLista(Array.isArray(data) ? data : []);
    } catch {
      setSecretsLista([]);
    }
  };

  const adicionarChave = async () => {
    const prov = novoProvider().trim();
    const chave = novaChaveValor().trim();
    if (!chave) {
      showToast("Insira a chave de API", "aviso");
      return;
    }
    setSalvandoChave(true);
    try {
      await fetchApi("/provider-keys", {
        method: "PUT",
        body: JSON.stringify({
          provider: prov,
          key: chave,
          escopo: novoEscopo(),
        }),
      });
      showToast(`Chave do provedor ${prov} salva com sucesso!`, "sucesso");
      setNovaChaveValor("");
      await carregarChaves();
    } catch (err: any) {
      showToast("Erro ao salvar chave: " + err.message, "erro");
    } finally {
      setSalvandoChave(false);
    }
  };

  const removerChave = async (provider: string, escopoAlvo: string) => {
    if (!confirm(`Deseja remover a chave do provedor "${provider}" no escopo ${escopoAlvo}?`)) return;
    try {
      await fetchApi(`/provider-keys/${encodeURIComponent(provider)}?escopo=${escopoAlvo}`, { method: "DELETE" });
      showToast(`Chave ${provider} removida`, "sucesso");
      await carregarChaves();
    } catch (err: any) {
      showToast("Erro ao remover: " + err.message, "erro");
    }
  };

  const testarConexaoModelo = async (model: string) => {
    try {
      const res = await fetchApi<any>("/llm/test", {
        method: "POST",
        body: JSON.stringify({ model }),
      });
      if (res.ok) {
        showToast(`Modelo respondendo (${res.ms}ms)!`, "sucesso");
      } else {
        showToast(`Falha no teste: ${res.error || "Erro na API"}`, "erro");
      }
    } catch (err: any) {
      showToast(`Erro ao testar: ${err.message}`, "erro");
    }
  };

  const salvarSecret = async () => {
    if (!novoSecretNome().trim() || !novoSecretValor().trim()) {
      showToast("Informe o nome e o valor do segredo", "aviso");
      return;
    }
    setSalvandoSecret(true);
    try {
      await fetchApi("/secrets", {
        method: "POST",
        body: JSON.stringify({
          nome: novoSecretNome().trim(),
          valor: novoSecretValor().trim(),
          escopo: escopo(),
        }),
      });
      showToast(`Segredo "${novoSecretNome()}" salvo!`, "sucesso");
      setNovoSecretNome("");
      setNovoSecretValor("");
      await carregarSecrets();
    } catch (err: any) {
      showToast(`Erro ao salvar secret: ${err.message}`, "erro");
    } finally {
      setSalvandoSecret(false);
    }
  };

  const removerSecret = async (nome: string) => {
    if (!confirm(`Remover segredo "${nome}"?`)) return;
    try {
      await fetchApi(`/secrets/${encodeURIComponent(nome)}?escopo=${escopo()}`, { method: "DELETE" });
      showToast(`Segredo "${nome}" removido`, "sucesso");
      await carregarSecrets();
    } catch (err: any) {
      showToast(`Erro ao remover secret: ${err.message}`, "erro");
    }
  };

  onMount(() => {
    void carregarChaves();
    void carregarSecrets();
  });

  return (
    <div class="space-y-6 bg-transparent">
      <div class="flex items-center justify-between pb-1 border-b border-zinc-800/40">
        <div>
          <h2 class="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <Key size={15} class="text-zinc-400" />
            Gerenciamento Seguro de Chaves de API
          </h2>
          <p class="text-xs text-zinc-400 mt-0.5">
            Chaves de API para os motores e inferência direta, com herança por workspace.
          </p>
        </div>
        <Button size="xs" variant="ghost" loading={carregandoChaves()} onClick={carregarChaves}>
          <RefreshCw size={12} class="mr-1" /> Atualizar
        </Button>
      </div>

      {/* TABELA DE CHAVES ATIVAS */}
      <div class="space-y-3">
        <span class="text-xs font-semibold text-zinc-300 uppercase tracking-wider block">
          Chaves Configuradas no Sistema
        </span>

        <div class="divide-y divide-zinc-800/40">
          <For each={chavesApi()?.global?.chaves || []}>
            {(chk: any) => (
              <div class="py-3 flex items-center justify-between bg-transparent">
                <div class="flex items-center gap-3">
                  <div class="h-7 w-7 rounded-md bg-zinc-800/60 flex items-center justify-center text-zinc-300 font-mono text-xs">
                    {chk.provider.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="text-xs font-medium text-zinc-100">{chk.provider}</span>
                      <span class="text-[10px] font-mono px-1.5 py-0.2 rounded border text-cyan-400 bg-cyan-950/40 border-cyan-800/40">
                        global
                      </span>
                    </div>
                    <span class="text-[11px] font-mono text-zinc-500">{chk.preview}</span>
                  </div>
                </div>

                <div class="flex items-center gap-1.5">
                  <Button
                    size="xs"
                    variant="ghost"
                    class="text-zinc-400 hover:text-zinc-200"
                    onClick={() => testarConexaoModelo(chk.provider)}
                    title="Testar Conectividade"
                  >
                    <Play size={11} class="mr-1" /> Testar
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    class="text-zinc-400 hover:text-rose-400"
                    onClick={() => removerChave(chk.provider, "global")}
                    title="Remover Chave"
                  >
                    <Trash2 size={11} />
                  </Button>
                </div>
              </div>
            )}
          </For>

          <Show when={(chavesApi()?.global?.chaves || []).length === 0}>
            <p class="text-xs text-zinc-500 py-3 italic">
              Nenhuma chave de API global cadastrada. Adicione abaixo para habilitar inferência dos agentes.
            </p>
          </Show>
        </div>
      </div>

      {/* ADICIONAR NOVA CHAVE */}
      <div class="pt-4 border-t border-zinc-800/40 space-y-3">
        <span class="text-xs font-semibold text-zinc-300 uppercase tracking-wider block">
          Cadastrar ou Atualizar Chave de Provedor
        </span>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <select
            value={novoProvider()}
            onChange={(e) => setNovoProvider(e.currentTarget.value)}
            class="bg-zinc-900/80 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600"
          >
            <option value="openrouter">OpenRouter (Universal)</option>
            <option value="google">Google AI Studio</option>
            <option value="anthropic">Anthropic Claude</option>
            <option value="openai">OpenAI (GPT-4o/o3)</option>
            <option value="groq">Groq LPU</option>
            <option value="deepseek">DeepSeek Official</option>
          </select>

          <input
            type="password"
            placeholder="Cole a chave de API aqui..."
            value={novaChaveValor()}
            onInput={(e) => setNovaChaveValor(e.currentTarget.value)}
            class="bg-zinc-900/80 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-600 sm:col-span-2"
          />
        </div>

        <div class="flex items-center justify-between pt-1">
          <div class="flex items-center gap-3 text-xs">
            <span class="text-zinc-500">Escopo da Chave:</span>
            <label class="flex items-center gap-1.5 cursor-pointer text-zinc-300">
              <input
                type="radio"
                name="escopoChave"
                checked={novoEscopo() === "global"}
                onChange={() => setNovoEscopo("global")}
                class="accent-cyan-500"
              />
              <span>Global (Todas as Empresas)</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer text-zinc-300">
              <input
                type="radio"
                name="escopoChave"
                checked={novoEscopo() === "workspace"}
                onChange={() => setNovoEscopo("workspace")}
                class="accent-purple-500"
              />
              <span>Apenas Workspace Atual</span>
            </label>
          </div>

          <Button size="xs" variant="secondary" loading={salvandoChave()} onClick={adicionarChave}>
            <Plus size={12} class="mr-1" /> Salvar Chave
          </Button>
        </div>
      </div>

      {/* GERENCIAMENTO DE VARIÁVEIS DE AMBIENTE / SECRETS (.SECRETS.JSON) */}
      <div class="pt-6 border-t border-zinc-800/40 space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-xs font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
              <Lock size={13} class="text-zinc-400" />
              Variáveis Secretas do Ambiente (.secrets.json)
            </h3>
            <p class="text-xs text-zinc-400 mt-0.5">
              Segredos acessíveis aos agentes durante a execução de ferramentas e rotinas automatizadas.
            </p>
          </div>
          <Button size="xs" variant="ghost" onClick={carregarSecrets}>
            <RefreshCw size={11} class="mr-1" /> Recarregar
          </Button>
        </div>

        <div class="space-y-2">
          <For each={secretsLista()}>
            {(sec) => (
              <div class="p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800/60 flex items-center justify-between text-xs">
                <div class="flex items-center gap-2">
                  <span class="font-mono font-medium text-zinc-200">{sec.nome}</span>
                  <span class="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-800/40">
                    definido
                  </span>
                </div>
                <Button
                  size="xs"
                  variant="ghost"
                  class="text-zinc-400 hover:text-rose-400"
                  onClick={() => removerSecret(sec.nome)}
                >
                  <Trash2 size={11} />
                </Button>
              </div>
            )}
          </For>

          <Show when={secretsLista().length === 0}>
            <p class="text-xs text-zinc-500 italic py-1">Nenhum segredo cadastrado para este escopo.</p>
          </Show>
        </div>

        {/* ADICIONAR NOVO SECRET */}
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
          <input
            type="text"
            placeholder="NOME_DA_VARIAVEL"
            value={novoSecretNome()}
            onInput={(e) => setNovoSecretNome(e.currentTarget.value.toUpperCase())}
            class="bg-zinc-900/80 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-600"
          />
          <input
            type="password"
            placeholder="Valor secreto..."
            value={novoSecretValor()}
            onInput={(e) => setNovoSecretValor(e.currentTarget.value)}
            class="bg-zinc-900/80 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-600"
          />
          <Button size="xs" variant="secondary" loading={salvandoSecret()} onClick={salvarSecret}>
            <Plus size={11} class="mr-1" /> Adicionar Segredo
          </Button>
        </div>
      </div>
    </div>
  );
};
