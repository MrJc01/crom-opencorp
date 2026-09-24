import React, { useState, useEffect, useCallback, type FC, type ChangeEvent } from "react";
import {
  Key,
  RefreshCw,
  Play,
  Trash2,
  Plus,
  Lock,
  Eye,
  EyeOff,
  Copy,
  Check,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { showToast } from "../../../../shared/ui/Toast.js";
import { useOpenCorp } from "../../../../providers/OpenCorpProvider.js";
import type { SecretItem } from "../../types.js";

export interface TabSecretsProps {
  escopoConfig: "global" | "workspace";
}

export const TabSecrets: FC<TabSecretsProps> = ({ escopoConfig }) => {
  const { client, tratarErro } = useOpenCorp();

  const [chavesApi, setChavesApi] = useState<any>({
    global: { chaves: [] },
    workspace: { chaves: [], herdadas: [] },
  });
  const [carregandoChaves, setCarregandoChaves] = useState(false);
  const [novoProvider, setNovoProvider] = useState("openrouter");
  const [novaChaveValor, setNovaChaveValor] = useState("");
  const [novoEscopo, setNovoEscopo] = useState<"global" | "workspace">(escopoConfig);
  const [salvandoChave, setSalvandoChave] = useState(false);

  const [secretsLista, setSecretsLista] = useState<SecretItem[]>([]);
  const [novoSecretNome, setNovoSecretNome] = useState("");
  const [novoSecretValor, setNovoSecretValor] = useState("");
  const [salvandoSecret, setSalvandoSecret] = useState(false);
  const [revelarSenhas, setRevelarSenhas] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setNovoEscopo(escopoConfig);
  }, [escopoConfig]);

  const carregarChaves = useCallback(async () => {
    setCarregandoChaves(true);
    try {
      const data = await client.http.get<any>("/provider-keys");
      if (data) setChavesApi(data);
    } catch {
      // Silencioso se rota ainda não responder
    } finally {
      setCarregandoChaves(false);
    }
  }, [client]);

  const carregarSecrets = useCallback(async () => {
    try {
      const data = await client.http.get<any[]>("/secrets");
      const normalizada = (data || []).map((s: any) =>
        typeof s === "string" ? { nome: s, origem: "global" } : s
      );
      setSecretsLista(normalizada);
    } catch {
      setSecretsLista([]);
    }
  }, [client]);

  const adicionarChave = async () => {
    const prov = novoProvider.trim();
    const chave = novaChaveValor.trim();
    if (!chave) {
      showToast("Insira a chave de API", "aviso");
      return;
    }
    setSalvandoChave(true);
    try {
      await client.http.put("/provider-keys", {
        provider: prov,
        key: chave,
        escopo: novoEscopo,
      });
      showToast(`Chave do provedor ${prov} salva com sucesso!`, "sucesso");
      setNovaChaveValor("");
      await carregarChaves();
    } catch (err: unknown) {
      tratarErro(err, "Erro ao salvar chave de API");
    } finally {
      setSalvandoChave(false);
    }
  };

  const removerChave = async (provider: string, escopoAlvo: string) => {
    if (
      !confirm(
        `Deseja remover a chave do provedor "${provider}" no escopo ${escopoAlvo}?`
      )
    )
      return;
    try {
      await client.http.delete(
        `/provider-keys/${encodeURIComponent(provider)}?escopo=${escopoAlvo}`
      );
      showToast(`Chave do provedor ${provider} removida`, "sucesso");
      await carregarChaves();
    } catch (err: unknown) {
      tratarErro(err, "Erro ao remover chave");
    }
  };

  const testarConexaoModelo = async (model: string) => {
    try {
      const res = await client.http.post<any>("/llm/test", { model });
      if (res.ok) {
        showToast(
          `Modelo respondendo (${res.ms || 0}ms)! ${
            res.is_byok ? "• BYOK Custo $0" : ""
          }`,
          "sucesso"
        );
      } else {
        showToast(`Falha no teste: ${res.error || "Erro na API"}`, "erro");
      }
    } catch (err: unknown) {
      tratarErro(err, "Erro ao testar conexão");
    }
  };

  const salvarSecret = async () => {
    if (!novoSecretNome.trim() || !novoSecretValor.trim()) {
      showToast("Informe o nome e o valor do segredo", "aviso");
      return;
    }
    setSalvandoSecret(true);
    try {
      await client.http.post("/secrets", {
        nome: novoSecretNome.trim(),
        valor: novoSecretValor.trim(),
        escopo: escopoConfig,
      });
      showToast(`Segredo "${novoSecretNome}" salvo com sucesso!`, "sucesso");
      setNovoSecretNome("");
      setNovoSecretValor("");
      await carregarSecrets();
    } catch (err: unknown) {
      tratarErro(err, "Erro ao salvar segredo");
    } finally {
      setSalvandoSecret(false);
    }
  };

  const removerSecret = async (nome: string, origem?: string) => {
    if (!confirm(`Remover o segredo "${nome}"?`)) return;
    try {
      await client.http.delete(
        `/secrets/${encodeURIComponent(nome)}?escopo=${origem || escopoConfig}`
      );
      showToast(`Segredo "${nome}" removido`, "sucesso");
      await carregarSecrets();
    } catch (err: unknown) {
      tratarErro(err, "Erro ao remover segredo");
    }
  };

  const copiarNomeSecret = (nome: string) => {
    void navigator.clipboard.writeText(nome);
    showToast(`Nome do secret "${nome}" copiado!`, "sucesso");
  };

  useEffect(() => {
    void carregarChaves();
    void carregarSecrets();
  }, [carregarChaves, carregarSecrets]);

  const chavesGlobal = chavesApi?.global?.chaves || [];
  const chavesWs = chavesApi?.workspace?.chaves || [];

  return (
    <div className="space-y-8 bg-transparent">
      {/* ─────────────────────────────────────────────────────────────
          SEÇÃO 1: CHAVES DE API DOS PROVEDORES (BYOK & INFERÊNCIA)
         ───────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-800 gap-3">
          <div>
            <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <Key size={16} className="text-amber-400" />
              Chaves de API dos Motores de IA (BYOK)
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Credenciais para OpenRouter, Google AI Studio, Anthropic e OpenAI com herança transparente por workspace.
            </p>
          </div>
          <button
            type="button"
            disabled={carregandoChaves}
            onClick={carregarChaves}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-850 text-zinc-300 border border-zinc-800 text-xs font-medium transition-colors cursor-pointer self-start sm:self-center"
          >
            <RefreshCw size={13} className={carregandoChaves ? "animate-spin" : ""} />
            <span>Atualizar Chaves</span>
          </button>
        </div>

        {/* Formulário de Adicionar Nova Chave de Provedor */}
        <div className="p-4 rounded-xl border border-zinc-850 bg-zinc-900/30 space-y-3">
          <span className="text-xs font-semibold text-zinc-200 block">
            Adicionar ou Atualizar Chave de Provedor
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
            <select
              value={novoProvider}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                setNovoProvider(e.target.value)
              }
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-orange-500 cursor-pointer"
            >
              <option value="openrouter">OpenRouter (BYOK / Universal)</option>
              <option value="google">Google AI Studio (Gemini Direct)</option>
              <option value="anthropic">Anthropic (Claude Direct)</option>
              <option value="openai">OpenAI (GPT-4o Direct)</option>
              <option value="groq">Groq (Ultra-Fast Inference)</option>
              <option value="ollama">Ollama Local (Offline)</option>
            </select>

            <select
              value={novoEscopo}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                setNovoEscopo(e.target.value as "global" | "workspace")
              }
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-orange-500 cursor-pointer"
            >
              <option value="global">Escopo Global (Todas as Empresas)</option>
              <option value="workspace">Escopo Workspace (Exclusivo)</option>
            </select>

            <input
              type="password"
              placeholder="sk-or-v1-... ou chave da API"
              value={novaChaveValor}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setNovaChaveValor(e.target.value)
              }
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-orange-500"
            />

            <button
              type="button"
              disabled={salvandoChave}
              onClick={adicionarChave}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
            >
              {salvandoChave ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Plus size={13} />
              )}
              <span>Salvar Chave</span>
            </button>
          </div>
        </div>

        {/* Lista de Chaves Ativas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Chaves Globais */}
          <div className="p-4 rounded-xl border border-zinc-850 bg-zinc-900/30 space-y-2.5">
            <div className="flex items-center justify-between pb-1 border-b border-zinc-800/40">
              <span className="text-xs font-semibold text-cyan-400 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                Chaves no Escopo Global
              </span>
              <span className="text-[10px] font-mono text-zinc-500">
                {chavesGlobal.length} ativas
              </span>
            </div>
            <div className="space-y-2">
              {chavesGlobal.map((c: any, idx: number) => (
                <div
                  key={c.provider || idx}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-850 text-xs"
                >
                  <div>
                    <span className="font-semibold text-zinc-200 block font-mono">
                      {c.provider}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500">
                      {c.preview || "sk-••••••••"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void testarConexaoModelo(c.provider)}
                      className="p-1 rounded text-zinc-400 hover:text-emerald-400 transition-colors"
                      title="Testar ping"
                    >
                      <Play size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void removerChave(c.provider, "global")}
                      className="p-1 rounded text-zinc-400 hover:text-rose-400 transition-colors"
                      title="Remover chave"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
              {chavesGlobal.length === 0 && (
                <p className="text-xs text-zinc-500 py-3 text-center">
                  Nenhuma chave global cadastrada.
                </p>
              )}
            </div>
          </div>

          {/* Chaves do Workspace */}
          <div className="p-4 rounded-xl border border-zinc-850 bg-zinc-900/30 space-y-2.5">
            <div className="flex items-center justify-between pb-1 border-b border-zinc-800/40">
              <span className="text-xs font-semibold text-purple-400 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                Chaves Exclusivas do Workspace
              </span>
              <span className="text-[10px] font-mono text-zinc-500">
                {chavesWs.length} ativas
              </span>
            </div>
            <div className="space-y-2">
              {chavesWs.map((c: any, idx: number) => (
                <div
                  key={c.provider || idx}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-850 text-xs"
                >
                  <div>
                    <span className="font-semibold text-zinc-200 block font-mono">
                      {c.provider}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500">
                      {c.preview || "sk-••••••••"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void testarConexaoModelo(c.provider)}
                      className="p-1 rounded text-zinc-400 hover:text-emerald-400 transition-colors"
                      title="Testar ping"
                    >
                      <Play size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void removerChave(c.provider, "workspace")}
                      className="p-1 rounded text-zinc-400 hover:text-rose-400 transition-colors"
                      title="Remover chave"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
              {chavesWs.length === 0 && (
                <p className="text-xs text-zinc-500 py-3 text-center">
                  O workspace utiliza chaves herdadas do escopo global.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          SEÇÃO 2: COFRE DE SEGREDOS & CREDENCIAIS DE APPS (SECRETS)
         ───────────────────────────────────────────────────────────── */}
      <div className="space-y-4 pt-4 border-t border-zinc-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-800 gap-3">
          <div>
            <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <Lock size={16} className="text-emerald-400" />
              Cofre de Segredos & Credenciais de Mini-Apps (Secrets)
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Tokens para WordPress, Mercado Pago, GitHub, Supabase e webhooks utilizados autonomamente pelos agentes.
            </p>
          </div>
          <button
            type="button"
            onClick={carregarSecrets}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-850 text-zinc-300 border border-zinc-800 text-xs font-medium transition-colors cursor-pointer self-start sm:self-center"
          >
            <RefreshCw size={13} />
            <span>Atualizar Secrets</span>
          </button>
        </div>

        {/* Formulário Novo Secret */}
        <div className="p-4 rounded-xl border border-zinc-850 bg-zinc-900/30 space-y-3">
          <span className="text-xs font-semibold text-zinc-200 block">
            Cadastrar Novo Segredo
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <input
              type="text"
              placeholder="Ex: WP_APP_PASSWORD ou MERCADOPAGO_TOKEN"
              value={novoSecretNome}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setNovoSecretNome(e.target.value)
              }
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-orange-500"
            />
            <input
              type="password"
              placeholder="Valor do segredo (guardado com hash seguro)"
              value={novoSecretValor}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setNovoSecretValor(e.target.value)
              }
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-orange-500"
            />
            <button
              type="button"
              disabled={salvandoSecret}
              onClick={salvarSecret}
              className="flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
            >
              {salvandoSecret ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Plus size={13} />
              )}
              <span>Adicionar ao Cofre</span>
            </button>
          </div>
        </div>

        {/* Tabela de Segredos */}
        <div className="divide-y divide-zinc-850/60 border border-zinc-850 rounded-xl bg-zinc-900/30 overflow-hidden">
          {secretsLista.map((sec, idx) => {
            const nome = sec.nome;
            const origem = sec.origem || "global";
            const revelado = Boolean(revelarSenhas[nome]);

            return (
              <div
                key={nome || idx}
                className="p-3.5 flex items-center justify-between gap-3 text-xs hover:bg-zinc-900/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-1.5 rounded-lg bg-zinc-850 border border-zinc-750 text-emerald-400 shrink-0">
                    <Lock size={13} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-zinc-100 font-mono truncate">
                        {nome}
                      </span>
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.2 rounded border uppercase font-bold ${
                          origem === "workspace"
                            ? "text-purple-400 bg-purple-950/40 border-purple-800/40"
                            : "text-cyan-400 bg-cyan-950/40 border-cyan-800/40"
                        }`}
                      >
                        {origem}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500 block mt-0.5">
                      {revelado ? "•••••••••••• (protegido no storage)" : "••••••••••••"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => copiarNomeSecret(nome)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                    title="Copiar nome do secret"
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setRevelarSenhas((prev) => ({
                        ...prev,
                        [nome]: !prev[nome],
                      }))
                    }
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                    title={revelado ? "Ocultar" : "Inspecionar"}
                  >
                    {revelado ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => void removerSecret(nome, origem)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 transition-colors"
                    title="Excluir segredo do cofre"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}

          {secretsLista.length === 0 && (
            <div className="py-8 text-center text-xs text-zinc-500">
              Nenhum segredo ou credencial cadastrado no cofre.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
