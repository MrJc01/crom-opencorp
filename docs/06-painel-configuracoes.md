# 06 — Painel de Configurações

O opencorp tem **4 níveis de configuração** (do mais específico ao mais geral na hora da leitura):

```
1. CLI/env            --model, --workspace, OPENCORP_*
2. Agente             .opencorp/agents/<id>.md (frontmatter)
3. Workspace          <ws>/.opencorp/config.json
4. Global             ~/.opencorp/settings.json
```

Merge: CLI > agente > workspace > global.

## O painel interativo (CLI)

```bash
opencorp settings
```

Abre um **painel TUI** (via `@clack/prompts`) com seções navegáveis:

```
┌ opencorp — configurações (global) ┐
│ ❯ Modelos        padrão, teste cego, secretário
│   Orçamento      teto diário, por agente, comportamento
│   Segurança      nível, allowlist, blocklist, HITL
│   Workspaces     raiz dos workspaces, ativo
│   Nuvem          backup/sync (ver docs/11)
│   Testes         modelo cego, diretório de relatórios
│   Avançado       telemetria, logs, editor
└ (↑/↓ navegar · Enter editar · S salvar · Q sair) ┘
```

Comandos equivalentes (scriptáveis):

```bash
opencorp settings list                    # dump completo com origem de cada chave
opencorp settings get budget.daily_usd    # lê resolvendo o merge dos níveis
opencorp settings set default_model opencode/grok-code [--scope global|workspace]
opencorp settings edit                    # abre $EDITOR no JSON
opencorp settings path                    # imprime os caminhos dos arquivos
opencorp settings reset budget --scope workspace
```

## Schema `settings.json` (global e workspace)

```json
{
  "version": 1,
  "default_model": "opencode/grok-code",
  "test_model": "opencode/hy3-free",
  "secretary": { "agent": "secretario" },
  "budget": {
    "daily_usd": 5.0,
    "per_agent_usd": 1.0,
    "pause_on_exceed": true,
    "notify_registry": "custos"
  },
  "security": {
    "level": "standard",
    "blocklist": ["rm -rf", "shutdown", "curl * | bash", "git push --force"],
    "hitl_patterns": ["git push", "npm publish", "DROP TABLE", "email*"],
    "network_allowlist": ["registry.npmjs.org", "github.com"]
  },
  "paths": { "workspaces_root": "~/.opencorp/workspaces" },
  "tests": {
    "blind": true,
    "model": "opencode/hy3-free",
    "reports_dir": ".opencorp/reports/testes",
    "max_fix_cycles": 3
  },
  "cloud": { "enabled": false, "mode": "backup-local", "targets": [] },
  "ui": { "theme": "dark", "verbose": false }
}
```

O mesmo schema vale para `config.json` do workspace — só as chaves presentes sobrescrevem. Validação com `zod`: entrada inválida → erro amigável apontando a chave, nada é salvo.

## Chaves mais usadas

| Chave | Para quê | Exemplo |
|---|---|---|
| `default_model` | modelo dos agentes sem `model` no frontmatter | `opencode/grok-code` |
| `test_model` | modelo do **teste cego** (leve/free) | `opencode/hy3-free` |
| `budget.daily_usd` | teto de gasto do workspace/dia | `5.0` |
| `security.level` | `permissive` \| `standard` \| `strict` | `standard` |
| `tests.blind` | exigir teste cego antes de marcar etapa como feita | `true` |
| `paths.workspaces_root` | onde ficam os workspaces | `~/opencorp-corps` |

## Painel de configurações web (Fase C)

A UI web lerá/escreverá **os mesmos arquivos JSON** com os mesmos schemas zod (via API que expõe o core). Nenhum formato novo é criado — o painel CLI e o painel web são duas peles sobre o `SettingsStore`.

## As views do painel web (v0.7.0)

O painel (`opencorp serve` → navegador) organiza a empresa em views, todas com botão "?" de ajuda contextual. A shell segue a **estrutura Preline** (padrões Tailwind copiados, sem bundle): sidebar push colapsável, **topbar sticky** (breadcrumb, busca global, avatar/ações) e **page-header padronizado** (`breadcrumb > H1 + subtítulo` à esquerda, toolbar de ações à direita) em todas as páginas.

| Grupo | View | O que faz |
|---|---|---|
| — | **Home** | Dashboard da empresa: KPIs (tasks vencidas, custos do dia, saúde scheduler/secretário, fluxos ativos, notificações não lidas) + barra de comando que inicia conversa no Secretário (reusa o composer `/ @ !`). |
| Operação | **Tasks** | Kanban (backlog → fazendo → bloqueado → feito) com overflow scroll por coluna. Criar, editar no drawer, excluir (com confirmação). |
| Operação | **Agentes** | Seções **Ativos × Catálogo**: chamar, editar (modelo/permissões/orçamento), toggle ativo/desativado, semear catálogo de áreas, clonar, excluir — bloqueado com 409 se citado em tasks/flows/hooks. |
| Operação | **Secretário** | Chat estilo ChatGPT/opencode com **composer `/ @ !`** (comandos, `@` contexto, `!` terminal), **chat lateral direito** (floating; mobile tela cheia), **histórico como popup** (busca + Hoje/Ontem/Anteriores) e aba **Reuniões v2** (chat em grupo, sala ao vivo, consenso, agendamento automático). |
| Automação | **Agenda** | Rotinas (cron/intervalo): criar, pausar, editar (nome/agenda/comando — tipo e valor vão juntos), excluir. |
| Automação | **Fluxos** | Os 4 templates — Pipeline, Fanout, Review, Debate — num editor único. Criar, executar, editar (linear), excluir. Times legados aparecem aqui com botão **Migrar todos para fluxos**. |
| Automação | **Hooks** | Webhooks de entrada: criar, copiar cURL (token só no detalhe), excluir. |
| Código | **Workspace** | Árvore de arquivos estilo VS Code + tabs com 3 modos (**Editor**, **Preview** — padrão p/ .md, **Lado a lado**) e **terminais em tabs** (até 4, whitelist). Right-click: abrir, `@` contexto, copiar. |
| Dados | **Histórico** | Timeline unificada (execuções, tasks, rotinas, conversas). |
| Dados | **Apps** | Mini-apps declarativos do workspace + aba **Configurar apps** (perfis de secrets: VPS, WordPress, MercadoPago, cartão, custom — valores nunca voltam à tela). |
| Sistema | **Notificações** | Feed de avisos dos agentes (tool `notificar`): não lidas em destaque, marcar como lida, **badge no navbar** atualizado via SSE. |
| Sistema | **Config** | As mesmas chaves do `settings` CLI, editáveis por campo com **badge de origem** (global × workspace) e toggle de escopo respeitado na leitura e na escrita. |

Regras de ouro da UI: tudo passa pela API com validação zod (nada de JSON cru), confirmação em ações destrutivas, e estados vazios que ensinam o próximo passo.

O **chat lateral** é um drawer global (fora do ciclo de navegação): sobrevive a trocas de view e a refresh, sincroniza o rascunho não enviado com o Secretário da página e no mobile ocupa a tela toda. O composer é o mesmo na home, no Secretário e no lateral — `/` abre a paleta (comandos opencorp + passthrough do opencode), `@` anexa contexto (arquivos, agentes, tasks) e `!` executa comandos da whitelist do terminal.

**Notificações** fecham o ciclo de feedback: qualquer agente chama a tool `notificar` ao finalizar um trabalho e o aviso aparece na view, no badge da sidebar e via push SSE — sem recarregar a página.
