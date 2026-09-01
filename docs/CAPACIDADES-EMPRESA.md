# O que o opencorp deve ser capaz de fazer — como uma empresa

> Documento de capacidades: o que o sistema **faz hoje** (verificado no código, v0.7.0) e o que **deve alcançar** (visão marcada como 🔮).
> Base factual: 26 stores/managers em `src/core/`, 103 rotas de API, ~25 comandos de CLI, 14 agentes de catálogo, 4 templates de fluxo, painel web com 13 views.

---

## 1. Propósito

O opencorp é um **sistema operacional de empresas autônomas**: cada workspace é uma empresa dirigida por agentes de IA com governança humana (HITL), orçamento, permissões e histórico auditável. O dono comanda pelo CLI ou painel web; os agentes executam, se coordenam e reportam.

---

## 2. A empresa em funções (o time)

Cada workspace nasce com uma equipe — alguns ativos por padrão, o catálogo completo semeável com 1 clique:

| Função | Agente | O que faz |
|--------|--------|-----------|
| **Presidência** | `secretario` / `secretario-exec` | Conversa com o dono (chat ChatGPT/opencode), analisa e relata; o **exec** também executa ações (tools). Ponto de entrada de tudo |
| **Operação** | `executor-padrao` | Executa ordens gerais, assume tasks do board |
| **Conteúdo/Site** | `ceo-documentos`, `frontend-especialista`, `corretor-site`, `critico-site`, `auditor` | Fila editorial, código do site, correção, crítica de conteúdo e auditoria técnica |
| **Vendas** | `agente-vendas` 🔮 | Prospecção, follow-ups (precisa canal WhatsApp/e-mail ativo) |
| **Marketing** | `agente-marketing` | Campanhas, conteúdo, calendário |
| **Financeiro** | `agente-financeiro` | Conciliação, relatórios, alertas de custo |
| **Suporte** | `agente-suporte` | Responde tickets/dúvidas recorrentes |
| **Jurídico** | `agente-juridico` 🔮 | Revisão de contratos/templates (com HITL obrigatório) |
| **Ops** | `agente-ops` | Rotinas de manutenção, monitoramento, backups |

Todo agente tem: role, model, permissões (level-1 leitura / level-2 bash local / level-3 rede+HITL), tools, orçamento diário, e pode ser **ativado/desativado com 1 clique** (desativado = bloqueado em runtime em qualquer caminho: API, hooks, fluxos, reuniões, scheduler, menções).

---

## 3. Capacidades operacionais (o que a empresa sabe fazer hoje)

### 3.1 Dirigir
- **Conversar com a presidência**: chat estilo opencode/ChatGPT (página + drawer lateral global com FAB), com streaming, markdown, anexos (imagens/Arquivo), histórico popup, e comandos **`/` (comandos próprios + opencode), `@` (contexto: arquivos/agentes/tasks), `!` (terminal whitelistado)**.
- **Reuniões multi-agente**: chat de grupo onde cada agente responde como profissional; **loop com consenso** (encerra quando todos concordam ou o moderador decide); sala **ao vivo** no painel (poll 2s); **agendável** como rotina (`meeting iniciar --nao-interativo`).
- **Notificações**: agentes chamam a tool `notificar` ao finalizar com resumo do que fizeram → painel mostra feed com badge não-lidas ao vivo (SSE).

### 3.2 Executar
- **Tasks (kanban)**: backlog/fazendo/bloqueado/feito com drag-and-drop, prioridade, labels, due date, responsável agente, chat por task, bloqueios por dependência/aprovação.
- **Fluxos (grafos declarativos)**: 4 templates editáveis — **Pipeline, Fanout, Review, Debate** — com nós manual/agente/task_create/registro/saída/condição/webhook/fanout/review/debate; ordem e paralelismo; **retomada** de fluxo interrompido; migração de teams legados.
- **Rotinas (agenda)**: cron (5 campos), intervalo em minutos, data única; whitelist de comandos; execução e histórico de rodadas.
- **Hooks (webhooks de entrada)**: disparo por API com token próprio (`x-opencorp-token`), placeholders `{{campo}}`, modos final/imediato, alvos agent_run/flow_run.
- **Menções**: `@agente` no chat de uma task escala a execução automaticamente.

### 3.3 Organizar conhecimento e ambiente
- **Workspaces (empresas)**: múltiplas empresas isoladas, com perfil editorial (wizard: empresa/nicho/público/tom/tópicos), subcorps delegáveis com permissão read/ask/write, templates.
- **Workspace FS**: página estilo VS Code — árvore de arquivos, tabs, editor/preview/lado-a-lado (md), salvar via API; **terminais em tabs** (execução whitelistada, sem shell, auditada).
- **Registros**: registry por categoria (documentos, logs, execuções, agentes, chats, custos) — a memória consultável da empresa.
- **Histórico unificado**: execuções + tasks + rotinas + conversas da secretária, com gatilho de origem.

### 3.4 Controlar (governança)
- **Human-in-the-loop**: execuções podem parar em `hitl_pendente`; aprovar/rejeitar pelo painel ou CLI. Nada de destrutivo sem humano em level-1/2.
- **Orçamento**: limite diário e por agente (`budget`), `pause_on_exceed`; consulta de custo em tempo real.
- **Segurança**: política permissive/strict, allowlist de comandos por agente (`security_policy.json`), terminal sem shell + SIGKILL + cap, secrets nunca retornados pela API (só nome/definido/tipo), path-traversal bloqueado (resolver + realpath), symlinks para fora bloqueados.
- **Credenciais de apps** (secrets tipados): VPS (host/usuário/senha/chave), WordPress (url/senha app/onde roda), MercadoPago (keys + ambiente), **cartão — só referência (bandeira/últimos 4) com banner "Atenção: não testado"** e rejeição server-side de número/CVV, custom livres.
- **Auditoria**: log de terminal, ledger de execuções com gatilho, eventos SSE de tudo.

### 3.5 Observar
- **Dashboard (home)**: KPIs (tasks vencidas, custo do dia, saúde daemon/scheduler/secretário, fluxos, notificações) + barra de comando que inicia conversa no Secretário + feed de atividade ao vivo + aprovações pendentes + hub de fluxos.
- **Monitor**: pulso da empresa (tasks/execuções/custos/approvals) via CLI.
- **Doctor**: diagnóstico completo do ambiente (13 verificações).
- **Painel**: 13 views no shell Preline (topbar + page-header + cards), navbar colapsável, responsivo (sem overflow horizontal verificado), token opcional.

---

## 4. Ciclo de vida de uma empresa no opencorp

1. **Fundar** — `opencorp workspace create` (ou wizard no painel): nasce com agentes base, security policy, registries, projeto.json.
2. **Contratar time** — "Semear catálogo" (6 agentes de área, nascem desativados) + ativar os que a empresa usa.
3. **Cadastrar credenciais** — Apps → Configurar apps (VPS, WordPress, MercadoPago...).
4. **Desenhar processos** — Fluxos (4 templates) + rotinas (agenda) + hooks (integrações de entrada).
5. **Operar** — conversar com o Secretário, criar tasks, rodar fluxos, deixar rotinas rodando.
6. **Governar** — aprovar HITL, respeitar orçamento, ler notificações, monitorar.
7. **Escalar** — subcorps, clones de agentes, novos workspaces.

---

## 5. Capabilities matriciais: chamada de serviço da "empresa"

| O dono diz... | O opencorp faz... |
|---|---|
| "O que aconteceu hoje?" | Secretário consulta board/execuções/notificações e resume (com contexto `@`) |
| "Crie um post sobre X" | Fila editorial → fluxo de conteúdo (redator → crítico → auditor) → site |
| "Rode a reunião semanal" | Rotina dispara `meeting iniciar` → sala ao vivo no painel → ata registrada |
| "Integre o formulário do site" | Hook webhook → dispara agent_run/flow_run |
| "Quanto gastamos?" | KPI custo + `budget status` + registry de custos |
| "Isso não pode ir pro ar sem eu ver" | Approvals HITL — execução para até aprovar |
| "Me avise quando acabar" | Tool `notificar` → painel com badge |

---

## 6. Visão (🔮 o que ainda deve alcançar)

| Capacidade | Estado atual | Caminho |
|------------|--------------|---------|
| **Canais reais** (WhatsApp/Telegram/e-mail) | ADR-0001 + esqueleto `Canal` (fallback: notificações) | Gateways externos (`opencorp-channel-gateway`): Telegram Bot API primeiro; WhatsApp via Baileys (risco de ban — número dedicado) ou Meta Cloud API |
| **Injeção de secrets nas sessões** | `env_hint` na UI | Opt-in por agente/permissão (nunca em logs/feed) |
| **Vendas/Jurídico ativos** | Agentes no catálogo, desativados | Requerem canais + prompts afiados + HITL |
| **Busca global no topbar** | placeholder | Indexar tasks/agentes/arquivos/conversas |
| **Workspace switcher no topbar** | placeholder | Dropdown |
| **Aprendizado contínuo** | registries passivos | Memória consultável por agentes + pós-mortem automático de falhas |

---

## 7. Métricas de "empresa funcionando"

- Uma rotina rodando sem intervenção há >30 dias.
- Taxa de aprovação HITL < 20% das execuções (agentes confiáveis).
- Custo diário dentro do orçamento, sem `pause_on_exceed`.
- Zero execuções fora de whitelist; zero secrets expostos.
- Notificações sendo geradas por agentes (resumos) e lidas pelo dono.
- Pelo menos 1 fluxo de receita (ex.: fila editorial publicando) ponta a ponta.

---

*Gerado em 2026-09-01 sobre v0.7.0. Fatos verificados em código por subagente de inventário; visão marcada com 🔮.*
