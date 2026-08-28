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
