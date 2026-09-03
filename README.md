# 🏢 OpenCorp — Sistema Operacional de Empresas Autônomas

[![Licença MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-5.x-blue.svg)](https://www.typescriptlang.org)
[![OpenCode](https://img.shields.io/badge/engine-OpenCode%20%7C%20Claude%20Code%20%7C%20Antigravity-orange.svg)](https://opencode.ai)

O **OpenCorp** é um sistema operacional distribuído para governar empresas autônomas movidas por agentes de IA. Ele orquestra sessões de modelos de linguagem sobre múltiplos harnesses ([OpenCode](https://opencode.ai), [Claude Code](https://claude.ai), [Antigravity](https://github.com)), mantendo cada empresa (workspace) isolada com seu próprio banco de dados SQLite, sistema de segredos, arquivos de tarefas, registros e auditoria.

> **Filosofia Core:** Tudo vive no sistema de arquivos em formatos legíveis e versionáveis (`.md`, `.json`, `.db`). O painel web reativo (SolidJS + TailwindCSS) espelha 100% dos comandos do terminal.

---

## 🌐 Repositórios & Links

* 🏛️ **Repositório Oficial (Organização):** [crom-org/opencorp](https://github.com/crom-org/opencorp) · Org: [crom-org](https://github.com/crom-org)
* 🛠️ **Repositório de Desenvolvimento Ativo:** [MrJc01/crom-opencorp](https://github.com/MrJc01/crom-opencorp) · Mantenedor: [@MrJc01](https://github.com/MrJc01)

---

## 📋 Pré-requisitos

* **Node.js**: `>= 20.0.0` (recomendado Node 22+)
* **npm** ou **pnpm**
* **Git**
* *(Opcional)* Runner do [OpenCode](https://opencode.ai) instalado no PATH para execução local (`opencode`).

---

## 🚀 Instalação

```bash
# 1. Clone o repositório oficial (ou o repositório de desenvolvimento)
git clone https://github.com/crom-org/opencorp.git
cd opencorp

# (Para desenvolvimento ativo):
# git clone https://github.com/MrJc01/crom-opencorp.git && cd crom-opencorp

# 2. Instale as dependências
npm install

# 3. Compile o core (TypeScript) e a interface web (SolidJS)
npm run build

# 4. (Opcional) Crie um link global para usar o comando "oc" de qualquer pasta
npm link
```

Se preferir não usar `npm link`, utilize o executável direto: `./bin/oc`.

---

## 🖥️ Início Rápido (Quickstart)

### 1. Iniciar o Servidor API e Painel Web

Inicie o daemon em background com o comando `serve`:

```bash
# Inicia a API e a interface web na porta 4100
oc serve --port 4100

# Ou em foreground com logs ao vivo
oc serve start --foreground --port 4100
```

Abra no navegador: **`http://localhost:4100`** para acessar o painel de controle.

---

## 📸 Demonstração da Interface (Screenshots)

### 1. Painel de Operações & Rondas 24h
> Visão geral da saúde da empresa, custos do dia, status dos agentes e feed de execuções em tempo real.
![Painel de Operações](docs/assets/01-painel-operacoes.png)

---

### 2. Secretário Executivo Autônomo
> Conversação fluida com o Secretário Executivo para obter diagnósticos, status de infraestrutura e delegar ordens.
![Secretário Executivo](docs/assets/02-secretario-executivo.png)

---

### 3. Workspace & Editor com Terminal Integrado
> Navegação direta nos arquivos da empresa, documentações, logs e terminal inline isolado.
![Workspace e Código](docs/assets/03-workspace-codigo.png)

---

### 4. Quadro Kanban de Tarefas
> Acompanhamento de entregas, tarefas bloqueadas e atribuição direta a agentes autônomos.
![Quadro Kanban](docs/assets/04-quadro-kanban.png)

---

### 5. Fluxos de Trabalho & Automação Visual
> Construtor de automações em grafo: conecte gatilhos, tomadas de decisão e agentes corporativos.
![Fluxos de Trabalho](docs/assets/05-fluxos-trabalho.png)

---

### 6. Apps & Gestão Segura de Segredos
> Gerenciamento seguro de credenciais (WordPress, VPS, GitHub, LLMs) com isolamento por workspace e proteção `chmod 600`.
![Apps e Segredos](docs/assets/06-apps-e-segredos.png)

---

### 7. Histórico & Rastreabilidade de Execuções
> Inspeção transparente de cada ordem, ferramentas chamadas (bash, curl, APIs) e tempo de resposta.
![Histórico de Execução](docs/assets/07-historico-execucao.png)

---

### 8. Documentação Interna & Diagramas Mermaid
> Renderização nativa de manuais, playbooks e diagramas de arquitetura com alternância de código.
![Documentação Integrada](docs/assets/08-documentacao-interna.png)

---

### 9. Configurações de Governança & Motores LLM
> Diagnóstico de runtimes em tempo real, alternância de escopos (Global vs. Workspace) e controle de chaves de API.
![Configurações e Motores](docs/assets/09-configuracoes-motores.png)

---

## 💻 Referência Completa de Comandos da CLI (`opencorp` & `oc`)

> [!NOTE]
> **Dois comandos disponíveis:** O sistema instala e suporta tanto o comando completo **`opencorp`** quanto o atalho ágil **`oc`**. Ambos executam exatamente as mesmas funções:
> - `opencorp <comando>`: Nome oficial completo da plataforma.
> - `oc <comando>`: Atalho conciso recomendado para humanos e agentes no terminal.
>
> Qualquer comando executado sem a flag `--workspace` opera automaticamente no workspace ativo ou na pasta onde foi invocado.

### 1. ⚡ Execução & Interação com Agentes
| Comando Completo | Atalho Rápido | Descrição | Exemplo de Uso |
|---|---|---|---|
| `opencorp run <ordem>` | `oc run <ordem>` | Dispara uma ordem para o agente executor padrão (ou especificado) | `opencorp run "Auditar rascunhos" --agent corretor-site` |
| `opencorp open [workspace]` | `oc open [workspace]` | Abre a TUI interativa do OpenCode com o ambiente isolado | `oc open` *(digite `/quit` para sair)* |
| `opencorp secretario "<msg>"` | `oc secretario "<msg>"` | Conversa com o Secretário Executivo direto pelo terminal | `oc secretario "Como está a saúde das rondas de hoje?"` |
| `opencorp session list` | `oc session list` | Lista as sessões ativas e recentes do OpenCode | `opencorp session list` |
| `opencorp session log <id>` | `oc session log <id>` | Exibe os logs brutos capturados de uma sessão | `oc session log ses_123` |
| `opencorp session kill <id>` | `oc session kill <id>` | Encerra forçadamente um processo de agente em execução | `oc session kill ses_123` |

---

### 2. 🏢 Governança de Workspaces & Pacotes `.corp`
| Comando Completo | Atalho Rápido | Descrição | Exemplo de Uso |
|---|---|---|---|
| `opencorp workspace create <id>` | `oc workspace create <id>` | Cria uma nova empresa isolada a partir do template padrão | `opencorp workspace create filial-sp` |
| `opencorp workspace list` | `oc workspace list` | Lista todas as empresas cadastradas no sistema | `oc workspace list` |
| `opencorp workspace use <id>` | `oc workspace use <id>` | Define a empresa ativa globalmente no terminal | `oc workspace use filial-sp` |
| `opencorp workspace delete <id>` | `oc workspace delete <id>` | Remove uma empresa e seus arquivos locais | `opencorp workspace delete filial-antiga` |
| `opencorp template list` | `oc template list` | Lista templates disponíveis para novos workspaces | `oc template list` |
| `opencorp template export <id>` | `oc template export <id>` | Exporta a empresa como pacote `.corp` (sanitiza segredos) | `opencorp template export pulso-diario -o /tmp/pulso.corp` |
| `opencorp template import <arq>` | `oc template import <arq>` | Importa um pacote `.corp` como nova empresa | `opencorp template import /tmp/pulso.corp --as nova-empresa` |
| `opencorp subcorp run <id>` | `oc subcorp run <id>` | Delega uma ordem para ser executada em um sub-workspace | `oc subcorp run filial "Gere o relatório"` |

---

### 3. 🤖 Catálogo e Gestão de Agentes
| Comando Completo | Atalho Rápido | Descrição | Exemplo de Uso |
|---|---|---|---|
| `opencorp agent list` | `oc agent list` | Lista todos os agentes configurados no workspace atual | `oc agent list` |
| `opencorp agent show <id>` | `oc agent show <id>` | Exibe a ficha completa do agente (modelo, permissões, custo) | `opencorp agent show editor` |
| `opencorp agent create` | `oc agent create` | Assistente interativo para criar um novo agente no workspace | `oc agent create` |
| `opencorp agent clone <origem> <novo>` | `oc agent clone <origem> <novo>` | Clona instruções e parâmetros de um agente existente | `oc agent clone editor editor-senior` |
| `opencorp agent edit <id>` | `oc agent edit <id>` | Abre a definição em Markdown do agente para edição | `opencorp agent edit critico-site` |
| `opencorp agent delete <id>` | `oc agent delete <id>` | Remove um agente do workspace | `oc agent delete agente-teste` |
| `opencorp agent sync` | `oc agent sync` | Sincroniza agentes do template default para o workspace atual | `oc agent sync` |

---

### 4. 📋 Quadro Kanban de Tarefas (Task Board)
| Comando Completo | Atalho Rápido | Descrição | Exemplo de Uso |
|---|---|---|---|
| `opencorp task list` | `oc task list` | Lista as tarefas do Kanban com filtros opcionais | `oc task list --coluna backlog` |
| `opencorp task create` | `oc task create` | Cria uma nova tarefa atribuível a humanos ou agentes | `opencorp task create --titulo "Configurar GA4" --prioridade alta` |
| `opencorp task show <id>` | `oc task show <id>` | Exibe detalhes, histórico e mensagens de uma tarefa | `oc task show tsk-123` |
| `opencorp task move <id> <coluna>` | `oc task move <id> <coluna>` | Move uma tarefa entre colunas (`backlog`, `fazendo`, `feito`) | `oc task move tsk-123 "fazendo"` |
| `opencorp task assign <id> <agente>` | `oc task assign <id> <agente>` | Atribui a tarefa para um agente autônomo resolver | `oc task assign tsk-123 corretor-site` |
| `opencorp task chat <id> --msg` | `oc task chat <id> --msg` | Adiciona comentário ou instrução no chat da tarefa | `oc task chat tsk-123 --msg "@corretor-site execute agora"` |
| `opencorp task label <id> <tags>` | `oc task label <id> <tags>` | Adiciona etiquetas organizacionais na tarefa | `oc task label tsk-123 "seo,urgente"` |
| `opencorp task delete <id>` | `oc task delete <id>` | Exclui uma tarefa do quadro | `oc task delete tsk-123` |

---

### 5. ⏰ Automação: Agendador (Cron), Workflows e Webhooks
| Comando Completo | Atalho Rápido | Descrição | Exemplo de Uso |
|---|---|---|---|
| `opencorp schedule list` | `oc schedule list` | Lista todos os agendamentos periódicos configurados | `oc schedule list` |
| `opencorp schedule create` | `oc schedule create` | Cria uma rotina cron ou intervalo recorrente de execução | `opencorp schedule create checar-fila --intervalo-min 60 --args "task list"` |
| `opencorp schedule run-now <id>` | `oc schedule run-now <id>` | Força o disparo imediato de uma rotina agendada | `oc schedule run-now sch-pulso-24h` |
| `opencorp schedule pause / resume` | `oc schedule pause / resume` | Pausa ou retoma um agendamento sem excluí-lo | `oc schedule pause sch-pulso-24h` |
| `opencorp scheduler start / stop` | `oc scheduler start / stop` | Inicia ou encerra o daemon do scheduler em background | `opencorp scheduler start` |
| `opencorp flow list` | `oc flow list` | Lista os fluxos de trabalho (workflows em grafo) do workspace | `oc flow list` |
| `opencorp flow run <id>` | `oc flow run <id>` | Executa um fluxo completo a partir do nó gatilho | `oc flow run analise-board --entrada "Auditar"` |
| `opencorp flow status <id>` | `oc flow status <id>` | Consulta o status de execução de nós e histórico do fluxo | `oc flow status analise-board` |
| `opencorp hook list / create` | `oc hook list / create` | Cria e lista webhooks HTTP externos com verificação de token | `oc hook list` |
| `opencorp trigger list / create` | `oc trigger list / create` | Conecta eventos internos (ex: `task.concluida`) a ações de agentes | `oc trigger list` |

---

### 6. 🔒 Gestão Segura de Segredos (`opencorp secrets` & `oc secrets`)
O OpenCorp conta com hierarquia segura de resolução (`Workspace` com override prioritário sobre `Global`). Os valores são gravados com permissão estrita `chmod 600`.

| Comando Completo | Atalho Rápido | Descrição | Exemplo de Uso |
|---|---|---|---|
| `opencorp secrets list` | `oc secrets list` | Lista segredos com nomes, tipos e badges de escopo | `oc secrets list` |
| `opencorp secrets list --scope` | `oc secrets list --scope` | Filtra segredos apenas do `workspace` ou apenas `global` | `oc secrets list --scope workspace` |
| `opencorp secrets get <nome>` | `oc secrets get <nome>` | Retorna o valor limpo em stdout para piping e scripting | `oc secrets get wp_app_pass` |
| `opencorp secrets set <nome> <val>` | `oc secrets set <nome> <val>` | Salva um segredo no workspace ou globalmente | `opencorp secrets set wp_app_pass "minha-senha" --scope workspace` |
| `opencorp secrets delete <nome>` | `oc secrets delete <nome>` | Remove com segurança um segredo cadastrado | `oc secrets delete wp_app_pass --scope workspace` |
| `opencorp secrets info` | `oc secrets info` | Exibe manual sobre herança de chaves e convenções de uso | `oc secrets info` |

---

### 7. 🤝 Equipes Multi-Agente & Reuniões (Boardroom)
| Comando Completo | Atalho Rápido | Descrição | Exemplo de Uso |
|---|---|---|---|
| `opencorp team list` | `oc team list` | Lista os times multi-agente configurados | `oc team list` |
| `opencorp team create` | `oc team create` | Cria um time com padrão: `pipeline`, `fanout`, `review` ou `debate` | `opencorp team create editorial --padrao pipeline` |
| `opencorp team run <id>` | `oc team run <id>` | Dispara uma orquestração em equipe com dados de entrada | `oc team run editorial --entrada "Tendências de IA 2026"` |
| `opencorp meeting list` | `oc meeting list` | Lista reuniões deliberativas da diretoria | `oc meeting list` |
| `opencorp meeting run <id>` | `oc meeting run <id>` | Executa uma reunião multi-agente e gera ata oficial em Markdown | `oc meeting run reuniao-estrategica` |

---

### 8. 🛠️ Ferramentas Plugáveis & Protocolo MCP
| Comando Completo | Atalho Rápido | Descrição | Exemplo de Uso |
|---|---|---|---|
| `opencorp tool list` | `oc tool list` | Lista ferramentas nativas (`task.*`, `http.get`, etc.) e manifests JSON | `oc tool list` |
| `opencorp tool call <tool>` | `oc tool call <tool>` | Invoca uma ferramenta diretamente pelo terminal com parâmetros JSON | `oc tool call http.get --params '{"url":"https://api.site.com"}'` |
| `opencorp mcp serve` | `oc mcp serve` | Inicia o servidor MCP stdio para conectar a IDEs (Cursor, Claude Desktop) | `opencorp mcp serve` |

---

### 9. 🛡️ Governança, Orçamento & Auditoria HITL
| Comando Completo | Atalho Rápido | Descrição | Exemplo de Uso |
|---|---|---|---|
| `opencorp approvals list` | `oc approvals list` | Lista ações aguardando aprovação humana (Human-In-The-Loop) | `oc approvals list` |
| `opencorp approvals approve <id>` | `oc approvals approve <id>` | Autoriza a execução de uma ação de agente sensível | `oc approvals approve app-001` |
| `opencorp approvals reject <id>` | `oc approvals reject <id>` | Rejeita uma ação bloqueada | `oc approvals reject app-001` |
| `opencorp budget status` | `oc budget status` | Exibe teto diário, consumo atual e saldo em USD do workspace | `opencorp budget status` |
| `opencorp budget reset` | `oc budget reset` | Reseta os contadores de custo diário | `oc budget reset` |
| `opencorp settings show` | `oc settings show` | Exibe todas as configurações consolidadas (global + workspace) | `oc settings show` |
| `opencorp settings set <k> <v>` | `oc settings set <k> <v>` | Define um parâmetro de configuração (ex: modelo padrão, HITL) | `opencorp settings set model.default "gemini-3.8-flash"` |
| `opencorp registry list` | `oc registry list` | Lista documentos, atas, pareceres e registros de memória | `oc registry list` |

---

### 10. 🩺 Diagnóstico, Histórico e Telemetria
| Comando Completo | Atalho Rápido | Descrição | Exemplo de Uso |
|---|---|---|---|
| `opencorp historico` | `oc historico` | Exibe o histórico de execuções com tempo, modelo e exit code | `oc historico --limite 20` |
| `opencorp historico --falhas` | `oc historico --falhas` | Filtra apenas execuções que falharam com diagnóstico de causa raiz | `oc historico --falhas` |
| `opencorp historico retry <id>` | `oc historico retry <id>` | Redispara uma execução anterior preservando contexto e ordem | `oc historico retry exec-20260903-1234` |
| `opencorp historico erro <id>` | `oc historico erro <id>` | Imprime o stacktrace e mensagem exata do erro da execução | `oc historico erro exec-20260903-1234` |
| `opencorp saude` | `oc saude` | Painel rápido com contagem de agentes, scheduler e processos | `oc saude` |
| `opencorp relatorio [--hoje]` | `oc relatorio [--hoje]` | Gera relatório consolidado de produção, custos e taxa de sucesso | `opencorp relatorio --hoje` |
| `opencorp logs [--follow]` | `oc logs [--follow]` | Stream ao vivo de eventos estruturados do sistema (`events.jsonl`) | `oc logs -f --tail 50` |
| `opencorp monitor` | `oc monitor` | TUI interativa em tempo real com métricas e custos | `oc monitor` |
| `opencorp status` | `oc status` | Painel geral de status dos serviços ativos | `oc status` |
| `opencorp doctor` | `oc doctor` | Auditoria completa do ambiente: Node, OpenCode, daemons e chaves | `opencorp doctor` |

---

### 11. 🌐 Servidores e Daemons de Fundo
| Comando Completo | Atalho Rápido | Descrição | Exemplo de Uso |
|---|---|---|---|
| `opencorp serve` | `oc serve` | Inicia o servidor daemon da API REST + SSE em background | `opencorp serve --host 0.0.0.0 --port 4100` |
| `opencorp serve stop` | `oc serve stop` | Encerra com segurança o servidor API em execução | `opencorp serve stop` |
| `opencorp web` | `oc web` | Inicia a API, a interface web e abre o navegador automaticamente | `opencorp web --port 4100` |
| `opencorp daemon start / stop` | `oc daemon start / stop` | Gerencia o supervisor permanente de processos à prova de reboot | `opencorp daemon start` |

---

## 🧩 Arquitetura & Motores Suportados

O OpenCorp oferece suporte a múltiplos motores de execução (harnesses):

* **OpenCode Engine:** Runner local isolado com suporte a MCP, ferramentas customizadas e histórico de sessões.
* **Claude Code Engine:** Execução orquestrada com Claude.
* **Antigravity Engine:** Integração com o ecossistema Antigravity.
* **Provedores de Inferência Direta:** Conexão nativa com OpenRouter, Google AI Studio, Anthropic e OpenAI com rotatividade automática em caso de rate-limit.

---

## 🧪 Testes Automatizados

O projeto conta com cobertura de testes unitários e de integração utilizando Vitest:

```bash
# Executar a bateria de testes unitários
npm test

# Executar testes específicos de isolamento de segredos
npx vitest run tests/secrets-store.test.ts

# Executar testes de isolamento de workspaces
npx vitest run tests/workspace-isolation.test.ts
```

---

## 🔒 Segurança e Privacidade

1. **Isolamento Total:** Cada workspace possui seu próprio banco SQLite (`corp.db`), sessões e diretórios de dados.
2. **Proteção contra Vazamentos:** Arquivos `.corp` exportados passam por sanitização automática que remove chaves de API, senhas e arquivos de ambiente (`.env`, `secrets.json`, `auth.json`).
3. **Nível de Intervenção Humana (HITL):** Suporte a políticas de segurança configuráveis por workspace (`permissivo`, `moderado`, `estrito`).

---

## 📄 Licença

Este projeto está licenciado sob os termos da licença [MIT](LICENSE).
