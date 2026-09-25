import {
  Globe,
  Server,
  Sparkles,
  GitBranch,
  CreditCard,
  KeyRound,
  type LucideIcon,
} from "lucide-react";

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
  id: "wordpress" | "vps" | "llm" | "github" | "mercadopago" | "custom";
  rotulo: string;
  subtitulo: string;
  icone: LucideIcon;
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
        chave: "onde_roda",
        rotulo: "Onde Roda (Ambiente / Hospedagem)",
        placeholder: "Ex: Hetzner VPS ou Hostinger",
        tipo: "text",
      },
      {
        chave: "notas",
        rotulo: "Notas / Regras Adicionais",
        placeholder: "Ex: Portal de notícias de tecnologia — publicar apenas em draft",
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
    sugestaoNome: "app:mercadopago:loja-checkout",
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
        rotulo: "Public Key *",
        placeholder: "TEST-xxxxxx ou APP_USR-xxxxxx",
        obrigatorio: true,
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
    sugestaoNome: "app:custom:variavel-privada",
    comoEncontrar: [
      "1. Consulte a documentação oficial da API, serviço ou biblioteca que deseja integrar.",
      "2. Gere o token ou credencial no painel do fornecedor.",
      "3. Copie o valor para o campo abaixo.",
    ],
    oQueDaAcesso: [
      "Injeção segura como variável de ambiente no runtime do workspace e nas ferramentas dos agentes.",
    ],
    regrasDeUso: [
      "O valor é gravado em ~/.opencorp/secrets.json ou <workspace>/.opencorp/secrets.json com permissões estritas (chmod 0600 — somente escrita/leitura interna do servidor).",
      "Para perfil app, use app:custom:<identificador>. Para ENV normal, use formato MAIÚSCULAS_COM_UNDERLINE.",
    ],
    campos: [
      {
        chave: "nome_identificador",
        rotulo: "Nome da Variável / Chave *",
        placeholder: "Ex: app:custom:variavel-privada ou STRIPE_API_KEY",
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

export function identificarTemplatePorNome(nome: string): SecretTemplate {
  const n = nome.toLowerCase();
  const mApp = /^app:([a-z0-9_-]+):/.exec(n);
  if (mApp) {
    const porTipo = TEMPLATES_SECRETS.find((t) => t.id === mApp[1]);
    if (porTipo) return porTipo;
  }
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
}
