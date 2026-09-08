# 17 — Mini-Apps e Segredos & Credenciais

O OpenCorp introduz uma camada declarativa para a criação rápida de **Mini-Apps Web** isolados por workspace e um cofre protegido de **Segredos & Credenciais** corporativas com escopo híbrido (Workspace e Global).

---

## 1. Mini-Apps Web Declarativos

Mini-Apps são pequenas aplicações web (HTML, CSS e JavaScript autônomo) geradas sob medida para visualização de métricas, dashboards de monitoramento, painéis de operação ou ferramentas internas.

### Estrutura e Isolamento

Cada Mini-App reside no diretório do workspace sob o caminho:

```text
<workspace>/apps/<app-id>/
├── index.html       # Interface, scripts e estilos do Mini-App
└── metadata.json    # Título, descrição, ícone e data de criação
```

- **Sandbox Iframe**: Os Mini-Apps são servidos através de `/api/apps/:id/view` em um iframe protegido com política de segurança restrita (`sandbox="allow-scripts allow-forms allow-same-origin"`).
- **Consumo de APIs do OpenCorp**: O iframe pode consumir endpoints locais do workspace para ler dados de tarefas, agentes, agenda e métricas.

---

### Os 3 Modos de Visualização com IA

Ao abrir um Mini-App na interface web (`/apps`), a barra superior oferece três opções integradas de experiência:

```
┌────────────────────────────────────────────────────────────────────────┐
│ [← Voltar] ⚡ Monitor do Pulso   (● Só App | ○ Só Chat | ○ Os Dois)     │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Só App (`"app"`)**:
   - O chat e a barra lateral de IA ficam **completamente ocultos**.
   - O Mini-App ocupa 100% da área útil da tela em tela cheia.
   - Ideal para uso diário da ferramenta ou dashboard sem distrações visuais.
   - É o modo acionado pelo botão principal **"Abrir App"** nos cards.

2. **Só Chat (`"chat"`)**:
   - O iframe do Mini-App é recolhido e a área de conversa com o agente de IA se expande em tela cheia.
   - Permite enviar instruções complexas, debater arquitetura ou revisar código com o agente em espaço amplo.

3. **Os Dois (`"ambos"`)**:
   - Visualização dividida lado a lado (**Split View 50/50**).
   - O chat com o agente fica na lateral esquerda e o Mini-App no iframe à direita.
   - As alterações feitas pelo agente no arquivo `index.html` podem ser recarregadas instantaneamente com o botão de refresh na barra superior.
   - É o modo ativado pelo botão **"Editar com IA"**.

---

### Gerenciamento via CLI (`oc app`)

```bash
# Listar todos os mini-apps do workspace ativo
oc app list
oc app listar

# Criar um novo mini-app interativo ou com título/descrição
oc app novo monitor-vendas --titulo "Monitor de Vendas" --descricao "Painel de métricas diárias"

# Abrir o aplicativo no navegador padrão
oc app open monitor-vendas
oc app abrir monitor-vendas

# Excluir um mini-app
oc app delete monitor-vendas
oc app remover monitor-vendas
```

---

## 2. Segredos & Credenciais (`/secrets`)

O OpenCorp centraliza a governança de credenciais, chaves de API, senhas de aplicação e chaves privadas, impedindo que segredos vazem em logs ou sejam expostos no frontend.

### Princípios de Segurança

1. **Valores Nunca Devolvidos**: A API `/secrets` lista apenas os **nomes**, metadados e escopos dos segredos. Os valores reais nunca são retornados em consultas GET públicas.
2. **Escopo Híbrido (Merge)**:
   - **Workspace**: Armazenado em `<workspace>/.opencorp/secrets.json`. Visível apenas para o workspace em questão.
   - **Global**: Armazenado em `~/.opencorp/secrets.json`. Compartilhado entre todos os workspaces da máquina.
   - Na resolução, segredos com mesmo nome no **Workspace** têm precedência sobre os **Globais**.
3. **Restrição por Tipo de Perfil**: Segredos do tipo `app:<tipo>:<id>` exigem formato JSON e são validados antes da gravação.

---

### Templates Rápidos de Conexão

Na view `/secrets`, o usuário conta com modelos prontos que trazem orientações de segurança e regras de boas práticas:

- **WordPress (`app:wordpress:<id>`)**:
  - Uso: Senhas de aplicativo para publicação autônoma de posts, mídias e drafts via REST API.
  - Campos: URL do site, Usuário WordPress, Application Password.
- **Servidor VPS / SSH (`app:vps:<id>`)**:
  - Uso: Automação remota via SSH para deploys e manutenção de servidores.
  - Campos: Host/IP, Porta SSH, Usuário, Chave Privada (Ed25519/RSA).
- **Provedores de IA / LLM (`app:llm:<id>`)**:
  - Uso: Chaves de API para OpenRouter, OpenAI, Anthropic, Gemini, DeepSeek, etc.
  - Campos: API Key, Organização (opcional), URL Base.
- **GitHub (`app:github:<id>`)**:
  - Uso: Personal Access Token (PAT) com escopo restrito de leitura/escrita de repositórios.
  - Campos: PAT Token, Usuário/Org.
- **Mercado Pago / Pagamentos (`app:mercadopago:<id>`)**:
  - Uso: Access Token para webhooks e emissão de cobranças PIX.
  - Campos: Access Token (Produção ou Teste), Public Key.

---

### Gerenciamento via CLI (`oc secret`)

```bash
# Definir um segredo no escopo do workspace (padrão)
oc secret set OPENAI_API_KEY "sk-..."

# Definir um segredo no escopo global
oc secret set OPENROUTER_KEY "sk-or-..." --scope global

# Obter o valor de um segredo (somente via CLI local autenticada)
oc secret get OPENAI_API_KEY

# Listar segredos cadastrados (somente os nomes e escopos)
oc secret list
oc secret list --scope workspace
oc secret list --scope global

# Excluir um segredo
oc secret delete OPENAI_API_KEY
oc secret delete OPENROUTER_KEY --scope global
```
