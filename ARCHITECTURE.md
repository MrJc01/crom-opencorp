# ARCHITECTURE.md — Arquitetura Canônica do OpenCorp (2026)

> **Documento Oficial de Arquitetura, Engenharia e Governança Técnica**  
> Repositório: `crom-org/opencorp` / `MrJc01/crom-opencorp`  
> Versão do Sistema: **0.7.0 (React 19 + Assistant-UI + XYFlow + SQLite WAL + OpenCorp SDK)**

---

## 1. Visão Geral e Filosofia Arquitetural

O **OpenCorp** é um Sistema Operacional para Empresas Autônomas dirigidas por Agentes de IA. O sistema unifica:
1. **Governança Operacional Baseada em Arquivos e SQLite**: Cada empresa (*workspace*) possui sua própria estrutura isolada de banco de dados (`tasks.db`, `scheduler.db`, `settings.db`), segredos criptografados, logs de telemetria e checkpoints de Git.
2. **O Fluxo comanda tudo (Paradigma n8n)**: Automações periódicas, esteiras de produção e reações a webhooks residem exclusivamente em grafos declarativos DAG (`.opencorp/flows/<id>.json`), evitando loops infinitos ocultos (`while true`).
3. **Paridade Absoluta CLI & Web**: Qualquer operação executada na interface web reflete exatamente o estado interno do backend e pode ser auditada e reproduzida via CLI (`oc` / `opencorp`).
4. **Zero Mocks em Produção**: O sistema interage com harnesses reais de IA (OpenCode, Claude Code, Antigravity, LiteLLM), executores de código isolados e bancos SQLite WAL em disco.

---

## 2. Stack Tecnológico de 2026

```
┌────────────────────────────────────────────────────────────────────────┐
│                          CAMADA WEB FRONTEND                           │
│  React 19 + TypeScript 7 + Vite v7 + TailwindCSS v4 + DaisyUI v5        │
│  @assistant-ui/react (Runtime SSE) · @xyflow/react v12 (Studio DAG)     │
├────────────────────────────────────────────────────────────────────────┤
│                          CAMADA DE CLIENTE / SDK                       │
│  @opencorp/sdk (HttpClient, Resources tipados: tasks, agents, flows)   │
├────────────────────────────────────────────────────────────────────────┤
│                          CAMADA BACKEND & DAEMON                       │
│  Node.js 22+ · TypeScript · Server HTTP REST + SSE · Commander CLI     │
│  OpenCode Engine Bridge · LiteLLM / Ollama Drivers · FFMPEG / Piper    │
├────────────────────────────────────────────────────────────────────────┤
│                          PERSISTÊNCIA & STORAGE                        │
│  SQLite 3 (WAL mode) · Atomic FS Writes · Git Checkpoints / Rollback    │
└────────────────────────────────────────────────────────────────────────┘
```

### Componentes Chave da Camada Web:
- **React 19 (`react`, `react-dom`)**: Arquitetura orientada a componentes com reconciliação ultra-rápida, hooks modernos e estrita ausência de estados zumbi.
- **`@assistant-ui/react`**: Framework de UI para conversação agêntica profissional com streaming de pensamentos (`<think>`), renderização de ferramentas interativas e adaptadores SSE sob demanda.
- **`@xyflow/react` (React Flow v12)**: Motor visual de nós e arestas magnéticas Bézier para modelagem e depuração de fluxos DAG.
- **`@opencorp/sdk`**: Cliente oficial fortemente tipado que encapsula chamadas para `/tasks`, `/agents`, `/flows`, `/settings`, `/engines` e `/files`.
- **TailwindCSS v4 & DaisyUI v5**: Paleta ultra-dark pura (`#09090b` / `zinc-950`) sem vazamentos de bordas ou cores não-curadas.

---

## 3. Os 7 Módulos Funcionais do OpenCorp

A interface é organizada sob a pasta canônica `src/web/features/` em 7 módulos de missão crítica:

### Módulo 1: Tasks / Kanban Operacional (`src/web/features/tasks/`)
- **Quadro de 4 Colunas**: `a_fazer` (todo), `fazendo` (in_progress), `revisao` (review / human-in-the-loop) e `feito` (done).
- **Gaveta de Detalhes (`TaskDetailsDrawer`)**: Exibe histórico de interações, mensagens entre agentes, sub-tarefas filhas e execuções vinculadas com tempo de CPU e modelo utilizado.
- **Human-In-The-Loop (HITL)**: Tarefas sensíveis permanecem bloqueadas até aprovação manual do operador, disparando o desbloqueio atômico.
- **Agendador Cron Embutido**: Suporte a repetições periódicas configuradas diretamente no modal de criação.

### Módulo 2: Agentes & Equipes Autônomas (`src/web/features/agents/`)
- **Padrões de Orquestração Multi-Agente**:
  - *Pipeline Sequencial*: Encadeamento ordenado de tarefas (Agente A → Agente B).
  - *Fan-out*: Distribuição de trabalho paralelo para múltiplos agentes simultâneos.
  - *Review*: Submissão automática do output de um agente para revisão e crítica de outro.
  - *Debate*: Rodadas de deliberação argumentativa entre especialistas até convergência.
- **Criação com IA (`AgentCreateModal`)**: Geração automática de `system_prompt`, instruções e restrições com base em objetivo de alto nível.
- **Governança de Modelos xB**: Dimensionamento de parâmetros conforme o porte da tarefa (mini-agentes determinísticos, redatores 14-35B e raciocínio >70B).

### Módulo 3: Workspace IDE (`src/web/features/workspace/`)
- **Explorador de Arquivos (`FileTree`)**: Visualização em árvore com suporte à raiz completa do projeto (18+ pastas e arquivos) ou filtro seletivo de escopo.
- **Editor Multi-Tab (`CodeEditorTabs`)**: Alternância dinâmica de abas com syntax highlighting, split-preview Markdown e suporte a visualização de mídia.
- **Terminais Integrados (`WorkspaceTerminals`)**: 4 instâncias de shell interativo isolado para diagnósticos rápidos sem sair do navegador.

### Módulo 4: Fluxos Studio DAG (`src/web/features/workflows/`)
- **Canvas Reativo XYFlow**: Renderização de pipelines DAG com minimap, zoom inteligente e alinhamento magnético.
- **5 Custom Node Components**:
  - `TriggerNode`: Gatilhos de agendamento cron, webhooks externos ou disparo manual.
  - `AgentNode`: Agentes autônomos com injeção de parâmetros e modelos vinculados.
  - `LogicNode`: Condições lógicas (*If/Else*), loops de iteração, delays e sub-fluxos.
  - `IntegrationNode`: Chamadas HTTP, consultas a bancos de dados e comandos de terminal.
  - `OutputNode`: Gravação de artefatos, notificação e encerramento de esteira.
- **Gaveta NDV (Node Detail View)**: Configuração tipada com alternância instantânea para editor JSON bruto.

### Módulo 5: Histórico Forense & Observabilidade (`src/web/features/history/`)
- **Conexão Direta com Execuções Reais**: Rastreabilidade completa de execuções agênticas arquivadas.
- **Gaveta de Inspeção Forense com 6 Abas**:
  1. *Chat / Raciocínio*: Diálogo completo segregando blocos `<think>...</think>`.
  2. *Spans OpenTelemetry*: Telemetria profunda de cada tool call com contagem de tokens de entrada/saída e custo em USD.
  3. *Log de Terminal*: Saída de stdout/stderr sem filtros.
  4. *Git Diff & Rollback*: Visualização gráfica de alterações em arquivos com botão de reversão atômica (`git checkout / revert`).
  5. *Grafo do Fluxo*: Realce do caminho percorrido pelos nós durante a execução.
  6. *Resultado*: Payload final entregue pela esteira.

### Módulo 6: Configurações & Governança do Sistema (`src/web/features/settings/`)
- **Seletor de Escopo Dual**: Alternância entre parâmetros *Globais* (plataforma inteira) e parâmetros *Locais* (específicos do workspace ativo).
- **14 Abas de Governança Especializada**:
  - `Geral`, `Motores (Harnesses)`, `Modelos & Rotação`, `Segredos & Variáveis`, `Orçamento & Segurança (Budget/Tokens)`, `Diagnóstico (Doctor)`, `Runner & Concorrência`, `Ferramentas & Skills MCP`, `Workspaces`, `Storage & Backup`, `Notificações`, `Auditoria`, `Webhooks`, `Avançado`.
- **Persistência Atômica**: Atualizações via `PUT /settings` refletidas instantaneamente no SQLite sem necessidade de recarga da página.

### Módulo 7: Reuniões Colegiadas & Catálogo de Apps/MCPs (`src/web/features/meetings/` e `src/web/features/apps/`)
- **Reuniões do Conselho**: Deliberações ao vivo entre múltiplos agentes com moderador dedicado e timeline de intervenções cronológicas.
- **Geração de Ata (Minutes)**: Síntese executiva com decisões tomadas e conversão em 1 clique para tarefas pendentes no Kanban operacional.
- **Catálogo MCP**: Servidores de ferramentas (*Model Context Protocol*) e Mini-Apps com configuração de credenciais mascaradas, ativação dinâmica e inspeção de schemas de tools.

---

## 4. App Shell & Secretário Executivo Residente

O aplicativo é envolvido por [`AppLayout.tsx`](file:///home/j/Documentos/GitHub/opencorp/src/web/shared/layout/AppLayout.tsx), que provê:
- **Sidebar Fixa com 14 Rotas Oficiais**: Acesso imediato a todas as ferramentas corporativas com indicação de workspace ativo.
- **Secretário Dock (`Ctrl+J`)**: O supervisor residente acessível de qualquer ponto do sistema via teclado ou botão de cabeçalho, com streaming contínuo sem bloquear o fluxo de trabalho principal.

---

## 5. Diretrizes de Governança e Manutenibilidade

1. **Inviolabilidade dos 1.184 Testes**: Qualquer evolução arquitetural deve preservar 100% de sucesso nas 122 suítes de teste Vitest.
2. **Zero Dependências Mortas**: O sistema não tolera pacotes órfãos ou frameworks paralelos descontinuados no bundle final.
3. **Escrita Atômica em Disco**: Toda persistência em arquivo utiliza `writeFileAtomic` para evitar corrupção em falhas inesperadas.
4. **Isolamento de Workspaces**: Um workspace jamais acessa credenciais, variáveis de ambiente ou diretórios físicos de outro workspace.
