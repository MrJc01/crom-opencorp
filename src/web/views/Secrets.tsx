import { type Component, createSignal, createMemo, onMount, For, Show } from "solid-js";
import {
  KeyRound,
  ShieldCheck,
  Lock,
  Globe,
  Plus,
  Trash2,
  Info,
  Server,
  Sparkles,
  GitBranch,
  CreditCard,
  Eye,
  EyeOff,
  ChevronRight,
  X,
  MapPin,
  Key,
  Layers,
  Check,
} from "lucide-solid";
import { fetchApi, wsAtivo } from "../lib/context";
import { showToast } from "../ui/Toast";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";

export interface CampoTemplate {
  chave: string;
  rotulo: string;
  placeholder: string;
  tipo?: "text" | "password" | "textarea" | "select";
  obrigatorio?: boolean;
  dica?: string;
  opcoes?: Array<{ valor: string; rotulo: string }>;
}

export interface SecretTemplate {
  id: string;
  rotulo: string;
  subtitulo: string;
  icone: any;
  sugestaoNome: string;
  comoEncontrar: string[];
  oQueDaAcesso: string[];
  regrasDeUso: string[];
  campos: CampoTemplate[];
}

export const TEMPLATES_SECRETS: SecretTemplate[] = [
  {
    id: "wordpress",
    rotulo: "WordPress (Application Password)",
    subtitulo: "Publicação autônoma de posts, mídias e drafts via REST API do WP",
    icone: Globe,
    sugestaoNome: "app:wordpress:site-principal",
    comoEncontrar: [
      "1. Acesse seu painel WordPress (ex: seusite.com/wp-admin).",
      "2. Vá em 'Usuários' → 'Perfil' (ou 'Todos os Usuários' e edite seu usuário).",
      "3. Role até a seção 'Senhas de Aplicativo' (Application Passwords).",
      "4. Digite um nome (ex: 'OpenCorp Worker') e clique em 'Adicionar nova senha de aplicativo'.",
      "5. Copie a chave de 24 caracteres gerada (formato: xxxx xxxx xxxx xxxx).",
    ],
    oQueDaAcesso: [
      "Criação, edição e publicação de posts e páginas.",
      "Upload de imagens destacadas e mídias para a biblioteca.",
      "Definição de categorias, tags, slugs e metadados SEO.",
    ],
    regrasDeUso: [
      "NUNCA use sua senha principal de login do WordPress. Use APENAS Senha de Aplicativo (Application Password), pois ela pode ser revogada a qualquer momento sem trocar sua senha mestre.",
      "Crie um usuário com permissão 'Editor' ou 'Autor' específico para a IA em vez de usar Administrador.",
    ],
    campos: [
      {
        chave: "nome_identificador",
        rotulo: "Nome do Segredo *",
        placeholder: "Ex: app:wordpress:site-principal ou WP_APP_PASSWORD",
        obrigatorio: true,
      },
      {
        chave: "url",
        rotulo: "URL do Site WordPress *",
        placeholder: "https://seusite.com.br",
        obrigatorio: true,
      },
      {
        chave: "usuario",
        rotulo: "Usuário do WordPress *",
        placeholder: "Ex: redator-ia ou admin",
        obrigatorio: true,
      },
      {
        chave: "senha_app",
        rotulo: "Senha de Aplicativo (Application Password) *",
        placeholder: "xxxx xxxx xxxx xxxx xxxx xxxx",
        tipo: "password",
        obrigatorio: true,
      },
      {
        chave: "notas",
        rotulo: "Notas / Regras Adicionais",
        placeholder: "Ex: Portal de notícias de finanças — publicar apenas em draft",
        tipo: "textarea",
      },
    ],
  },
  {
    id: "vps",
    rotulo: "Servidor VPS / SSH",
    subtitulo: "Deploy, automação remota, comandos de terminal e infraestrutura",
    icone: Server,
    sugestaoNome: "app:vps:servidor-prod",
    comoEncontrar: [
      "1. No seu terminal local ou provedor VPS (DigitalOcean, Hetzner, AWS), gere ou localize sua chave SSH pública/privada.",
      "2. Ou copie a senha de acesso root/deploy fornecida pelo provedor.",
    ],
    oQueDaAcesso: [
      "Execução de comandos remotos via SSH.",
      "Deploy de código, reinicialização de serviços (systemctl, docker).",
      "Transferência de arquivos de build via SFTP / SCP.",
    ],
    regrasDeUso: [
      "PREFIRA Chave Privada SSH (id_rsa ou ed25519) em vez de senha pura.",
      "Restrinja o usuário SSH a um usuário de deploy sem sudo irrestrito se possível.",
    ],
    campos: [
      {
        chave: "nome_identificador",
        rotulo: "Nome do Segredo *",
        placeholder: "Ex: app:vps:servidor-prod",
        obrigatorio: true,
      },
      {
        chave: "host",
        rotulo: "Host / Endereço IP *",
        placeholder: "Ex: 192.168.1.100 ou vps.seusite.com",
        obrigatorio: true,
      },
      {
        chave: "porta",
        rotulo: "Porta SSH",
        placeholder: "22",
      },
      {
        chave: "usuario",
        rotulo: "Usuário SSH *",
        placeholder: "root ou deploy",
        obrigatorio: true,
      },
      {
        chave: "chave_ssh",
        rotulo: "Chave Privada SSH (OpenSSH PEM / Ed25519)",
        placeholder: "-----BEGIN OPENSSH PRIVATE KEY-----\n...",
        tipo: "textarea",
      },
      {
        chave: "senha",
        rotulo: "Senha SSH (se não usar chave)",
        placeholder: "Senha do usuário no VPS",
        tipo: "password",
      },
      {
        chave: "notas",
        rotulo: "Notas",
        placeholder: "Ex: Servidor de staging com nginx e docker-compose",
        tipo: "textarea",
      },
    ],
  },
  {
    id: "llm",
    rotulo: "Provedor LLM / Chave de IA",
    subtitulo: "OpenRouter, OpenAI, Anthropic, Gemini, Groq para os motores de agentes",
    icone: Sparkles,
    sugestaoNome: "OPENROUTER_API_KEY",
    comoEncontrar: [
      "1. Acesse openrouter.ai/keys (ou console.anthropic.com, platform.openai.com).",
      "2. Clique em 'Create Key' ou 'Nova Chave'.",
      "3. Defina um limite de crédito mensal para segurança.",
      "4. Copie a chave gerada (inicia com sk-or-v1- ou sk-ant-).",
    ],
    oQueDaAcesso: [
      "Chamada de inferência para os modelos configurados na equipe de agentes.",
      "Execução de rondas automáticas, síntese editorial e chats.",
    ],
    regrasDeUso: [
      "Configure SEMPRE limites de gastos (Credit Limit) no painel do provedor.",
      "A chave é injetada automaticamente para o motor de fallback e chamadas diretas.",
    ],
    campos: [
      {
        chave: "nome_identificador",
        rotulo: "Nome da Variável de Ambiente *",
        placeholder: "Ex: OPENROUTER_API_KEY ou OPENAI_API_KEY",
        obrigatorio: true,
      },
      {
        chave: "chave_api",
        rotulo: "Chave de API (Secret Key) *",
        placeholder: "sk-or-v1-xxxxxxxxxxxxxxxxx",
        tipo: "password",
        obrigatorio: true,
      },
      {
        chave: "notas",
        rotulo: "Notas / Limites",
        placeholder: "Ex: Conta principal com limite de $10/mês",
        tipo: "textarea",
      },
    ],
  },
  {
    id: "github",
    rotulo: "GitHub (Personal Access Token)",
    subtitulo: "Clonagem de repositórios privados, criação de PRs e commits automáticos",
    icone: GitBranch,
    sugestaoNome: "GITHUB_TOKEN",
    comoEncontrar: [
      "1. No GitHub, clique na sua foto de perfil → 'Settings'.",
      "2. No menu esquerdo, role até o final e clique em 'Developer Settings'.",
      "3. Selecione 'Personal access tokens' → 'Fine-grained tokens' (ou 'Tokens (classic)').",
      "4. Marque escopo 'repo' (para repositórios privados) ou apenas leitura.",
      "5. Copie o token ghp_xxxxxxxx ou github_pat_xxxxxxxx.",
    ],
    oQueDaAcesso: [
      "Leitura e escrita de repositórios, abertura de Issues e Pull Requests.",
      "Disparo de GitHub Actions e webhooks de CI/CD.",
    ],
    regrasDeUso: [
      "Prefira tokens 'Fine-grained' limitados exclusivamente aos repositórios necessários.",
      "Defina data de expiração (ex: 90 dias) e renove periodicamente.",
    ],
    campos: [
      {
        chave: "nome_identificador",
        rotulo: "Nome do Segredo *",
        placeholder: "Ex: GITHUB_TOKEN ou app:github:deploy",
        obrigatorio: true,
      },
      {
        chave: "token",
        rotulo: "Personal Access Token *",
        placeholder: "ghp_xxxxxxxxxxxx ou github_pat_xxxxxxxxxxxx",
        tipo: "password",
        obrigatorio: true,
      },
      {
        chave: "notas",
        rotulo: "Notas",
        placeholder: "Ex: Token com escopo de commit no repositório do projeto",
        tipo: "textarea",
      },
    ],
  },
  {
    id: "mercadopago",
    rotulo: "Mercado Pago / Checkout",
    subtitulo: "Credenciais de checkout, recebimento Pix e validação de webhooks",
    icone: CreditCard,
    sugestaoNome: "MERCADOPAGO_ACCESS_TOKEN",
    comoEncontrar: [
      "1. Acesse o portal Mercado Pago Developers (mercadopago.com.br/developers).",
      "2. Vá em 'Suas integrações' e selecione ou crie a sua aplicação.",
      "3. No menu lateral, acesse 'Credenciais de teste' (ou 'Credenciais de produção').",
      "4. Copie a Public Key e o Access Token.",
    ],
    oQueDaAcesso: [
      "Geração de cobranças Pix imediatas, boletos e checkout transparente.",
      "Consulta e reconciliação de pagamentos recebidos.",
      "Assinatura e validação de webhooks de pagamento.",
    ],
    regrasDeUso: [
      "Comece SEMPRE com o ambiente de Homologação / Teste ('test') antes de conectar credenciais de Produção ('prod').",
      "Nunca compartilhe o Access Token de produção.",
    ],
    campos: [
      {
        chave: "nome_identificador",
        rotulo: "Nome do Segredo *",
        placeholder: "Ex: app:mercadopago:loja-checkout",
        obrigatorio: true,
      },
      {
        chave: "ambiente",
        rotulo: "Ambiente *",
        placeholder: "test",
        tipo: "select",
        obrigatorio: true,
        opcoes: [
          { valor: "test", rotulo: "Teste / Homologação (Sandbox)" },
          { valor: "prod", rotulo: "Produção (Live)" },
        ],
      },
      {
        chave: "public_key",
        rotulo: "Public Key",
        placeholder: "TEST-xxxxxx ou APP_USR-xxxxxx",
      },
      {
        chave: "access_token",
        rotulo: "Access Token *",
        placeholder: "TEST-xxxxxx ou APP_USR-xxxxxx",
        tipo: "password",
        obrigatorio: true,
      },
      {
        chave: "notas",
        rotulo: "Notas",
        placeholder: "Ex: Gateway para venda de relatórios automáticos",
        tipo: "textarea",
      },
    ],
  },
  {
    id: "custom",
    rotulo: "Customizado / Chave Livre",
    subtitulo: "Variável de ambiente segura para qualquer ferramenta, script ou API externa",
    icone: KeyRound,
    sugestaoNome: "MINHA_API_KEY",
    comoEncontrar: [
      "1. Consulte a documentação oficial da API, serviço ou biblioteca que deseja integrar.",
      "2. Gere o token ou credencial no painel do fornecedor.",
      "3. Copie o valor para o campo abaixo.",
    ],
    oQueDaAcesso: [
      "Injeção segura como variável de ambiente no runtime do workspace e nas ferramentas MCP dos agentes.",
    ],
    regrasDeUso: [
      "O valor é gravado em ~/.opencorp/secrets.json ou <workspace>/.opencorp/secrets.json com permissões restritas (chmod 600) e mascarado na visualização.",
      "Nomeie a variável em letras MAIÚSCULAS separadas por underline (formato ENV padrão: MINHA_CHAVE).",
    ],
    campos: [
      {
        chave: "nome_identificador",
        rotulo: "Nome da Variável / Chave *",
        placeholder: "Ex: STRIPE_API_KEY ou SUPABASE_SERVICE_ROLE",
        obrigatorio: true,
      },
      {
        chave: "valor_secreto",
        rotulo: "Valor Secreto / Token *",
        placeholder: "Cole o segredo, token ou JSON aqui...",
        tipo: "textarea",
        obrigatorio: true,
      },
      {
        chave: "notas",
        rotulo: "Descrição de Uso & Regras",
        placeholder: "Ex: Chave de acesso à API de logística para consulta de fretes",
        tipo: "textarea",
      },
    ],
  },
];

export const SecretsView: Component = () => {
  const [secrets, setSecrets] = createSignal<any[]>([]);
  const [carregando, setCarregando] = createSignal(false);
  const [modalNovo, setModalNovo] = createSignal(false);
  const [templateSelecionadoId, setTemplateSelecionadoId] = createSignal<string>("wordpress");
  const [valoresForm, setValoresForm] = createSignal<Record<string, string>>({});
  const [salvando, setSalvando] = createSignal(false);
  const [mostrarSenha, setMostrarSenha] = createSignal<Record<string, boolean>>({});
  const [filtroEscopo, setFiltroEscopo] = createSignal<"todos" | "workspace" | "global">("todos");
  const [escopoSalvar, setEscopoSalvar] = createSignal<"workspace" | "global">("workspace");

  // Modal de Detalhes / Regras de Uso de Segredo Existente
  const [detalhesSecret, setDetalhesSecret] = createSignal<any | null>(null);

  const templateAtual = createMemo(
    () => TEMPLATES_SECRETS.find((t) => t.id === templateSelecionadoId()) || TEMPLATES_SECRETS[0],
  );

  const secretsFiltrados = createMemo(() => {
    const f = filtroEscopo();
    const lista = secrets();
    if (f === "todos") return lista;
    return lista.filter((s: any) => (s.origem || "global") === f);
  });

  const mudarTemplate = (id: string) => {
    setTemplateSelecionadoId(id);
    const tmpl = TEMPLATES_SECRETS.find((t) => t.id === id);
    if (tmpl) {
      setValoresForm({
        nome_identificador: tmpl.sugestaoNome,
        ambiente: "test",
      });
    }
  };

  const atualizarCampo = (campo: string, valor: string) => {
    setValoresForm((prev) => ({ ...prev, [campo]: valor }));
  };

  const alternarMostrarSenha = (campo: string) => {
    setMostrarSenha((prev) => ({ ...prev, [campo]: !prev[campo] }));
  };

  const carregarSecrets = async () => {
    setCarregando(true);
    try {
      const lista = await fetchApi<any[]>("/secrets");
      setSecrets(lista || []);
    } catch {
      setSecrets([]);
    } finally {
      setCarregando(false);
    }
  };

  const abrirModalNovo = (templateId?: string) => {
    const id = templateId || "wordpress";
    mudarTemplate(id);
    setModalNovo(true);
  };

  const salvarSegredo = async () => {
    const vals = valoresForm();
    const tmpl = templateAtual();
    const nome = (vals["nome_identificador"] || tmpl.sugestaoNome).trim();

    if (!nome) {
      showToast("Informe o nome do segredo / variável", "aviso");
      return;
    }

    let valorFinal = "";

    if (tmpl.id === "custom") {
      valorFinal = (vals["valor_secreto"] || "").trim();
    } else if (tmpl.id === "llm") {
      valorFinal = (vals["chave_api"] || "").trim();
    } else if (tmpl.id === "github") {
      valorFinal = (vals["token"] || "").trim();
    } else if (tmpl.id === "wordpress") {
      if (!nome.startsWith("app:wordpress:")) {
        valorFinal = (vals["senha_app"] || "").trim();
      } else {
        const obj = {
          rotulo: vals["nome_identificador"] || "WordPress",
          url: vals["url"] || "",
          usuario: vals["usuario"] || "",
          senha_app: vals["senha_app"] || "",
          notas: vals["notas"] || undefined,
        };
        valorFinal = JSON.stringify(obj, null, 2);
      }
    } else if (tmpl.id === "vps") {
      if (!nome.startsWith("app:vps:")) {
        valorFinal = (vals["chave_ssh"] || vals["senha"] || "").trim();
      } else {
        const obj = {
          rotulo: vals["nome_identificador"] || "VPS",
          host: vals["host"] || "",
          porta: vals["porta"] ? parseInt(vals["porta"], 10) : 22,
          usuario: vals["usuario"] || "root",
          chave_ssh: vals["chave_ssh"] || undefined,
          senha: vals["senha"] || undefined,
          notas: vals["notas"] || undefined,
        };
        valorFinal = JSON.stringify(obj, null, 2);
      }
    } else if (tmpl.id === "mercadopago") {
      if (!nome.startsWith("app:mercadopago:")) {
        valorFinal = (vals["access_token"] || "").trim();
      } else {
        const obj = {
          rotulo: vals["nome_identificador"] || "MercadoPago",
          public_key: vals["public_key"] || "",
          access_token: vals["access_token"] || "",
          ambiente: vals["ambiente"] || "test",
          notas: vals["notas"] || undefined,
        };
        valorFinal = JSON.stringify(obj, null, 2);
      }
    }

    if (!valorFinal) {
      showToast("Preencha o valor do segredo / chave secreta", "aviso");
      return;
    }

    setSalvando(true);
    try {
      await fetchApi(`/secrets/${encodeURIComponent(nome)}`, {
        method: "PUT",
        body: JSON.stringify({ valor: valorFinal, escopo: escopoSalvar() }),
      });

      setModalNovo(false);
      showToast(`Segredo "${nome}" salvo com sucesso (${escopoSalvar() === "workspace" ? "Workspace" : "Global"})!`, "sucesso");
      void carregarSecrets();
    } catch (err: any) {
      showToast(`Erro ao salvar: ${err.message}`, "erro");
    } finally {
      setSalvando(false);
    }
  };

  const excluirSecret = async (nome: string, origem?: string) => {
    const escopoDesc = origem === "workspace" ? "do workspace" : "global";
    if (!confirm(`Tem certeza que deseja remover o segredo "${nome}" (${escopoDesc})? Esta ação é irreversível.`)) {
      return;
    }
    try {
      const query = origem ? `?escopo=${origem}` : "";
      await fetchApi(`/secrets/${encodeURIComponent(nome)}${query}`, { method: "DELETE" });
      setSecrets((prev) =>
        prev.filter((s) => (typeof s === "string" ? s !== nome : s.nome !== nome)),
      );
      showToast(`Segredo "${nome}" removido.`, "sucesso");
    } catch (err: any) {
      showToast(`Erro ao excluir: ${err.message}`, "erro");
    }
  };

  const identificarTipoNome = (nome: string): SecretTemplate => {
    const n = nome.toLowerCase();
    if (n.includes("wp") || n.includes("wordpress")) {
      return TEMPLATES_SECRETS.find((t) => t.id === "wordpress")!;
    }
    if (n.includes("vps") || n.includes("ssh") || n.includes("server")) {
      return TEMPLATES_SECRETS.find((t) => t.id === "vps")!;
    }
    if (n.includes("github") || n.includes("gitlab") || n.includes("git")) {
      return TEMPLATES_SECRETS.find((t) => t.id === "github")!;
    }
    if (n.includes("openrouter") || n.includes("openai") || n.includes("claude") || n.includes("llm")) {
      return TEMPLATES_SECRETS.find((t) => t.id === "llm")!;
    }
    if (n.includes("mercadopago") || n.includes("pagamento") || n.includes("stripe")) {
      return TEMPLATES_SECRETS.find((t) => t.id === "mercadopago")!;
    }
    return TEMPLATES_SECRETS.find((t) => t.id === "custom")!;
  };

  onMount(() => {
    void carregarSecrets();
  });

  return (
    <div class="flex flex-col h-full w-full overflow-hidden p-4 sm:p-6 space-y-5 bg-zinc-950">
      {/* Header */}
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80 flex-shrink-0">
        <div>
          <div class="flex items-center gap-2">
            <KeyRound size={20} class="text-emerald-400" />
            <h1 class="text-xl font-bold text-zinc-100 tracking-tight">Segredos & Credenciais</h1>
          </div>
          <p class="text-xs text-zinc-400 mt-1 max-w-2xl">
            Gestão segura de tokens, chaves de API, senhas de serviço e credenciais isoladas por workspace ou globais.
          </p>
        </div>

        <Button size="sm" variant="primary" onClick={() => abrirModalNovo()}>
          <Plus size={14} class="mr-1" /> Adicionar Credencial
        </Button>
      </div>

      {/* Conteúdo com Scroll */}
      <div class="flex-1 overflow-y-auto min-h-0 space-y-6 scrollbar-thin">
        {/* Templates Rápidos de Conexão */}
        <div>
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-xs font-bold uppercase tracking-wider text-zinc-400 font-mono">
              Templates Prontos de Conexão
            </h2>
            <span class="text-[11px] text-zinc-500 font-sans">
              Selecione para ver instruções de como encontrar e regras de uso
            </span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <For each={TEMPLATES_SECRETS}>
              {(tmpl) => {
                const Icone = tmpl.icone;
                return (
                  <div
                    onClick={() => abrirModalNovo(tmpl.id)}
                    class="p-4 rounded-xl bg-zinc-900/50 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700 transition-all cursor-pointer flex flex-col justify-between group shadow-xs"
                  >
                    <div>
                      <div class="flex items-center justify-between mb-2">
                        <div class="h-8 w-8 rounded-lg bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-emerald-400 group-hover:text-emerald-300">
                          <Icone size={16} />
                        </div>
                        <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800/60 text-zinc-400 border border-zinc-700/40">
                          Template
                        </span>
                      </div>
                      <h3 class="text-sm font-semibold text-zinc-100 group-hover:text-emerald-300 transition-colors">
                        {tmpl.rotulo}
                      </h3>
                      <p class="text-xs text-zinc-400 mt-1 leading-relaxed line-clamp-2">
                        {tmpl.subtitulo}
                      </p>
                    </div>

                    <div class="mt-4 pt-3 border-t border-zinc-800/60 flex items-center justify-between text-xs text-zinc-400">
                      <span class="text-[11px] font-medium text-emerald-400 flex items-center gap-1 group-hover:underline">
                        Configurar agora <ChevronRight size={12} />
                      </span>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </div>

        {/* Tabela de Segredos Armazenados */}
        <div>
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div class="flex items-center gap-2">
              <h2 class="text-xs font-bold uppercase tracking-wider text-zinc-400 font-mono">
                Credenciais Armazenadas ({secretsFiltrados().length})
              </h2>
              <Show when={wsAtivo()}>
                <span class="text-[10px] text-zinc-500 font-mono bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                  ws: {wsAtivo()}
                </span>
              </Show>
            </div>
            {/* Filtros de Escopo */}
            <div class="flex items-center gap-1 bg-zinc-900/80 p-1 rounded-lg border border-zinc-800 text-xs">
              <button
                type="button"
                onClick={() => setFiltroEscopo("todos")}
                class={`px-2.5 py-1 rounded text-[11px] font-medium transition-all flex items-center gap-1 cursor-pointer ${
                  filtroEscopo() === "todos"
                    ? "bg-zinc-800 text-zinc-100 font-semibold shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Layers size={11} class="mr-1 inline text-zinc-400" />
                <span>Todos (Merge)</span>
              </button>
              <button
                type="button"
                onClick={() => setFiltroEscopo("workspace")}
                class={`px-2.5 py-1 rounded text-[11px] font-medium transition-all flex items-center gap-1 cursor-pointer ${
                  filtroEscopo() === "workspace"
                    ? "bg-amber-950/60 text-amber-300 border border-amber-800/60 font-semibold shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Lock size={11} class="mr-1 inline" />
                <span>Workspace</span>
              </button>
              <button
                type="button"
                onClick={() => setFiltroEscopo("global")}
                class={`px-2.5 py-1 rounded text-[11px] font-medium transition-all flex items-center gap-1 cursor-pointer ${
                  filtroEscopo() === "global"
                    ? "bg-blue-950/60 text-blue-300 border border-blue-800/60 font-semibold shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Globe size={11} class="mr-1 inline" />
                <span>Global</span>
              </button>
            </div>
          </div>

          <div class="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden shadow-xs">
            <For
              each={secretsFiltrados()}
              fallback={
                <div class="p-10 text-center text-xs text-zinc-500 space-y-2">
                  <Lock size={20} class="mx-auto text-zinc-600 mb-1" />
                  <p>Nenhuma credencial ou segredo cadastrado para este filtro.</p>
                  <Button size="xs" variant="secondary" onClick={() => abrirModalNovo()}>
                    <Plus size={12} class="mr-1" /> Adicionar Primeiro Segredo
                  </Button>
                </div>
              }
            >
              {(s) => {
                const nome = typeof s === "string" ? s : s.nome || s.name;
                const tmpl = identificarTipoNome(nome);
                const Icone = tmpl.icone;
                const origem = typeof s === "object" && s.origem ? s.origem : "global";

                return (
                  <div class="p-4 border-b border-zinc-800/60 last:border-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-900/60 transition-colors">
                    <div class="flex items-center gap-3.5 min-w-0">
                      <div class="h-8 w-8 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center text-emerald-400 flex-shrink-0">
                        <Icone size={15} />
                      </div>
                      <div class="min-w-0">
                        <div class="flex items-center gap-2">
                          <span class="font-mono text-xs font-bold text-zinc-100 truncate">
                            {nome}
                          </span>
                          <span class="text-[10px] font-mono px-2 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                            {tmpl.rotulo}
                          </span>
                          <span
                            class={`text-[10px] font-mono px-2 py-0.2 rounded border flex items-center gap-1 ${
                              origem === "workspace"
                                ? "bg-amber-950/40 text-amber-300 border-amber-800/60"
                                : "bg-blue-950/40 text-blue-300 border-blue-800/60"
                            }`}
                          >
                            <Show when={origem === "workspace"} fallback={<><Globe size={10} /> Global</>}>
                              <Lock size={10} /> Workspace
                            </Show>
                          </span>
                        </div>
                        <div class="font-mono text-[10px] text-zinc-500 mt-0.5 flex items-center gap-1.5">
                          <span>••••••••••••••••••••</span>
                          <span>·</span>
                          <span class="text-emerald-500/80">Protegido (0600)</span>
                        </div>
                      </div>
                    </div>

                    <div class="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setDetalhesSecret({ nome, tmpl, origem })}
                        title="Ver regras de uso e permissões desta credencial"
                      >
                        <Info size={13} class="mr-1 text-blue-400" /> Regras de Uso
                      </Button>
                      <IconButton
                        size="xs"
                        variant="ghost"
                        class="text-zinc-500 hover:text-rose-400"
                        onClick={() => excluirSecret(nome, origem)}
                        title="Excluir segredo permanentemente"
                      >
                        <Trash2 size={13} />
                      </IconButton>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </div>
      </div>

      {/* MODAL ADICIONAR COM TEMPLATES E REGRAS DE USO */}
      <Show when={modalNovo()}>
        <div class="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50">
          <div class="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-3xl w-full p-5 space-y-4 shadow-2xl max-h-[92vh] flex flex-col">
            {/* Topo do Modal */}
            <div class="flex items-center justify-between border-b border-zinc-800 pb-3 flex-shrink-0">
              <div class="flex items-center gap-2">
                <KeyRound size={17} class="text-emerald-400" />
                <h2 class="text-sm font-bold text-zinc-100">
                  Adicionar Credencial com Template
                </h2>
              </div>
              <IconButton size="xs" variant="ghost" onClick={() => setModalNovo(false)}>
                <X size={16} />
              </IconButton>
            </div>

            {/* Seletor Horizontal de Templates */}
            <div class="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin flex-shrink-0">
              <For each={TEMPLATES_SECRETS}>
                {(tmpl) => {
                  const Icone = tmpl.icone;
                  const ativo = () => templateSelecionadoId() === tmpl.id;

                  return (
                    <button
                      type="button"
                      onClick={() => mudarTemplate(tmpl.id)}
                      class={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 flex-shrink-0 cursor-pointer ${
                        ativo()
                          ? "bg-zinc-800 text-emerald-400 border border-zinc-700 shadow-sm font-semibold"
                          : "text-zinc-400 hover:text-zinc-200 bg-zinc-950/60 border border-zinc-850"
                      }`}
                    >
                      <Icone size={14} class={ativo() ? "text-emerald-400" : "text-zinc-400"} />
                      <span>{tmpl.rotulo}</span>
                    </button>
                  );
                }}
              </For>
            </div>

            {/* Conteúdo com Scroll */}
            <div class="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin text-xs">
              {/* Box de Instruções & Regras de Uso do Template Selecionado */}
              <div class="rounded-xl border border-blue-900/40 bg-blue-950/20 p-4 space-y-3">
                <div class="flex items-center gap-2 font-bold text-blue-300 text-xs font-mono">
                  <Info size={15} class="text-blue-400" />
                  <span>Guia de Configuração: {templateAtual().rotulo}</span>
                </div>

                {/* Como Encontrar */}
                <div class="space-y-1">
                  <div class="font-semibold text-zinc-200 text-[11px] uppercase tracking-wider font-mono flex items-center gap-1">
                    <MapPin size={11} class="text-zinc-400" />
                    <span>Como Encontrar / Gerar o Token:</span>
                  </div>
                  <div class="text-zinc-300 space-y-1 leading-relaxed pl-1 text-[11px]">
                    <For each={templateAtual().comoEncontrar}>
                      {(passo) => <p>{passo}</p>}
                    </For>
                  </div>
                </div>

                {/* O Que Dá Acesso */}
                <div class="space-y-1 pt-1 border-t border-blue-900/30">
                  <div class="font-semibold text-zinc-200 text-[11px] uppercase tracking-wider font-mono flex items-center gap-1">
                    <Key size={11} class="text-zinc-400" />
                    <span>O Que Esta Credencial Acessa:</span>
                  </div>
                  <ul class="list-disc list-inside text-zinc-300 space-y-0.5 pl-1 text-[11px]">
                    <For each={templateAtual().oQueDaAcesso}>
                      {(item) => <li>{item}</li>}
                    </For>
                  </ul>
                </div>

                {/* Regras de Uso & Segurança */}
                <div class="space-y-1 pt-1 border-t border-blue-900/30">
                  <div class="font-semibold text-amber-300 text-[11px] uppercase tracking-wider font-mono flex items-center gap-1">
                    <ShieldCheck size={13} />
                    <span>Regras de Uso & Boas Práticas de Segurança:</span>
                  </div>
                  <ul class="list-disc list-inside text-amber-200/90 space-y-0.5 pl-1 text-[11px] leading-relaxed">
                    <For each={templateAtual().regrasDeUso}>
                      {(regra) => <li>{regra}</li>}
                    </For>
                  </ul>
                </div>
              </div>

              {/* Formulário dos Campos do Template */}
              <div class="space-y-3 pt-1">
                {/* Seletor de Escopo de Armazenamento */}
                <div class="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80 space-y-2">
                  <div class="flex items-center justify-between">
                    <label class="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                      <Lock size={13} class="text-emerald-400" />
                      <span>Onde Armazenar este Segredo:</span>
                    </label>
                    <span class="text-[10px] text-zinc-500">
                      Isolamento por workspace ou compartilhado
                    </span>
                  </div>
                  <div class="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setEscopoSalvar("workspace")}
                      class={`p-2.5 rounded-lg border text-left flex flex-col gap-0.5 transition-all cursor-pointer ${
                        escopoSalvar() === "workspace"
                          ? "bg-amber-950/30 border-amber-600/60 text-amber-200 ring-1 ring-amber-500/40"
                          : "bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      <span class="text-xs font-bold flex items-center gap-1">
                        <Lock size={11} class="text-amber-400" /> Workspace Atual
                      </span>
                      <span class="text-[10px] opacity-80 leading-tight">
                        {wsAtivo() ? `Isolado em ${wsAtivo()}` : "Isolado no workspace ativo"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEscopoSalvar("global")}
                      class={`p-2.5 rounded-lg border text-left flex flex-col gap-0.5 transition-all cursor-pointer ${
                        escopoSalvar() === "global"
                          ? "bg-blue-950/30 border-blue-600/60 text-blue-200 ring-1 ring-blue-500/40"
                          : "bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      <span class="text-xs font-bold flex items-center gap-1">
                        <Globe size={11} class="text-blue-400" /> Global (Todos)
                      </span>
                      <span class="text-[10px] opacity-80 leading-tight">
                        Disponível para todos os workspaces
                      </span>
                    </button>
                  </div>
                </div>

                <div class="font-semibold text-zinc-200 font-mono text-[11px] uppercase tracking-wider">
                  Preenchimento dos Parâmetros:
                </div>

                <For each={templateAtual().campos}>
                  {(campo) => {
                    const valorAtual = () => valoresForm()[campo.chave] || "";
                    const mostrar = () => Boolean(mostrarSenha()[campo.chave]);

                    return (
                      <div class="space-y-1">
                        <label class="block text-zinc-300 font-medium">
                          {campo.rotulo}
                        </label>

                        <Show
                          when={campo.tipo === "textarea"}
                          fallback={
                            <Show
                              when={campo.tipo === "select"}
                              fallback={
                                <div class="relative flex items-center">
                                  <input
                                    type={
                                      campo.tipo === "password"
                                        ? mostrar()
                                          ? "text"
                                          : "password"
                                        : campo.tipo || "text"
                                    }
                                    placeholder={campo.placeholder}
                                    value={valorAtual()}
                                    onInput={(e) =>
                                      atualizarCampo(campo.chave, e.currentTarget.value)
                                    }
                                    class={`w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono ${
                                      campo.tipo === "password" ? "pr-10" : ""
                                    }`}
                                  />
                                  <Show when={campo.tipo === "password"}>
                                    <button
                                      type="button"
                                      onClick={() => alternarMostrarSenha(campo.chave)}
                                      class="absolute right-2.5 text-zinc-400 hover:text-zinc-200 p-1 cursor-pointer"
                                      title={mostrar() ? "Ocultar" : "Mostrar"}
                                    >
                                      <Show when={mostrar()} fallback={<Eye size={14} />}>
                                        <EyeOff size={14} />
                                      </Show>
                                    </button>
                                  </Show>
                                </div>
                              }
                            >
                              <select
                                value={valorAtual() || "test"}
                                onChange={(e) =>
                                  atualizarCampo(campo.chave, e.currentTarget.value)
                                }
                                class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono"
                              >
                                <For each={campo.opcoes}>
                                  {(op) => (
                                    <option value={op.valor} class="bg-zinc-900 text-zinc-200">
                                      {op.rotulo}
                                    </option>
                                  )}
                                </For>
                              </select>
                            </Show>
                          }
                        >
                          <textarea
                            rows={3}
                            placeholder={campo.placeholder}
                            value={valorAtual()}
                            onInput={(e) =>
                              atualizarCampo(campo.chave, e.currentTarget.value)
                            }
                            class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono"
                          />
                        </Show>

                        <Show when={campo.dica}>
                          <span class="text-[10px] text-zinc-500 block">
                            {campo.dica}
                          </span>
                        </Show>
                      </div>
                    );
                  }}
                </For>
              </div>
            </div>

            {/* Rodapé com Ações */}
            <div class="pt-3 border-t border-zinc-800 flex items-center justify-between flex-shrink-0">
              <span class="text-[11px] text-zinc-500 font-mono">
                Gravado (chmod 600) em {escopoSalvar() === "workspace" ? "<workspace>/.opencorp/secrets.json" : "~/.opencorp/secrets.json"}
              </span>
              <div class="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => setModalNovo(false)}>
                  <X size={13} class="mr-1" /> Cancelar
                </Button>
                <Button size="sm" variant="primary" loading={salvando()} onClick={salvarSegredo}>
                  <Check size={13} class="mr-1" /> Salvar Credencial
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Show>

      {/* MODAL DETALHES E REGRAS DE USO DE SEGREDO EXISTENTE */}
      <Show when={detalhesSecret()}>
        <div class="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50">
          <div class="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div class="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div class="flex items-center gap-2 min-w-0">
                <ShieldCheck size={18} class="text-emerald-400 flex-shrink-0" />
                <div class="truncate">
                  <h2 class="text-sm font-bold text-zinc-100 truncate">
                    {detalhesSecret()!.nome}
                  </h2>
                  <div class="flex items-center gap-2">
                    <span class="text-[11px] text-zinc-400 font-mono">
                      Tipo: {detalhesSecret()!.tmpl.rotulo}
                    </span>
                    <span
                      class={`text-[10px] font-mono px-1.5 py-0.2 rounded border flex items-center gap-1 ${
                        detalhesSecret()!.origem === "workspace"
                          ? "bg-amber-950/40 text-amber-300 border-amber-800/60"
                          : "bg-blue-950/40 text-blue-300 border-blue-800/60"
                      }`}
                    >
                      <Show when={detalhesSecret()!.origem === "workspace"} fallback={<><Globe size={10} /> Global</>}>
                        <Lock size={10} /> Workspace
                      </Show>
                    </span>
                  </div>
                </div>
              </div>
              <IconButton size="xs" variant="ghost" onClick={() => setDetalhesSecret(null)}>
                <X size={16} />
              </IconButton>
            </div>

            <div class="space-y-3.5 text-xs">
              {/* O que dá acesso */}
              <div class="space-y-1.5 p-3 rounded-xl bg-zinc-950 border border-zinc-800/80">
                <span class="font-bold text-zinc-200 uppercase font-mono text-[10px] tracking-wider block flex items-center gap-1">
                  <Key size={11} class="text-zinc-400" />
                  <span>O que este token acessa:</span>
                </span>
                <ul class="list-disc list-inside text-zinc-300 space-y-0.5 text-[11px]">
                  <For each={detalhesSecret()!.tmpl.oQueDaAcesso}>
                    {(item) => <li>{item}</li>}
                  </For>
                </ul>
              </div>

              {/* Regras de Uso & Boas Práticas */}
              <div class="space-y-1.5 p-3 rounded-xl bg-amber-950/20 border border-amber-800/50">
                <span class="font-bold text-amber-300 uppercase font-mono text-[10px] tracking-wider block flex items-center gap-1">
                  <ShieldCheck size={11} />
                  <span>Regras de Uso & Limites de Segurança:</span>
                </span>
                <ul class="list-disc list-inside text-amber-200/90 space-y-0.5 text-[11px] leading-relaxed">
                  <For each={detalhesSecret()!.tmpl.regrasDeUso}>
                    {(regra) => <li>{regra}</li>}
                  </For>
                </ul>
              </div>

              {/* Como renovar ou revogar */}
              <div class="space-y-1 p-3 rounded-xl bg-zinc-950 border border-zinc-800/80">
                <span class="font-bold text-zinc-200 uppercase font-mono text-[10px] tracking-wider block flex items-center gap-1">
                  <MapPin size={11} class="text-zinc-400" />
                  <span>Como encontrar ou revogar:</span>
                </span>
                <div class="text-zinc-400 text-[11px] space-y-1">
                  <For each={detalhesSecret()!.tmpl.comoEncontrar}>
                    {(p) => <p>{p}</p>}
                  </For>
                </div>
              </div>
            </div>

            <div class="pt-2 border-t border-zinc-800 flex justify-end">
              <Button size="sm" variant="secondary" onClick={() => setDetalhesSecret(null)}>
                <X size={13} class="mr-1" /> Fechar
              </Button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};
