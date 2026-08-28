# 07 — Segurança e Custos

## Níveis de permissão do agente

| Nível | Nome | Pode | Exigência |
|---|---|---|---|
| `level-1` | Leitura | ler registros, docs; **não** roda comandos | — |
| `level-2` | Sandbox | rodar código apenas em `sandbox/` do workspace; criar registros | security policy padrão |
| `level-3` | Sistema | comandos amplos, rede, git push | cada comando sensível pede **HITL** |

## SecurityGuard (interceptor)

Antes de qualquer comando sair da sessão do agente, o Guard valida contra `security_policy.json`:

```json
{
  "level": "standard",
  "blocklist": ["rm -rf", "shutdown", "reboot", "curl * | bash", "git push --force"],
  "allowlist_extra": ["git", "node", "npm", "python3", "pytest"],
  "network_allowlist": ["registry.npmjs.org", "github.com", "pypi.org"],
  "hitl_patterns": ["git push", "npm publish", "DROP ", "DELETE FROM", "email"]
}
```

Fluxo do comando:

```
agente roda <cmd>
  ├─ casa com blocklist?        → BLOQUEADO (evento em registries/logs/)
  ├─ casa com hitl_patterns?    → PAUSADO, aguarda aprovação do humano:
  │     opencorp approvals list / opencorp approvals approve <id>
  ├─ nível level-1?             → BLOQUEADO (não executa nada)
  └─ senão                      → permitido (level-2 restrito ao sandbox)
```

Níveis de policy: `permissive` (só blocklist), `standard` (blocklist + HITL), `strict` (só allowlist).

## BudgetManager (teto de custos)

Toda sessão estima custo por resposta (tokens × preço do modelo):

- Acumulado por **agente/dia** e por **workspace/dia** (`budget.json`).
- Ao atingir 80% → aviso no terminal e evento em `registries/custos/`.
- Ao atingir 100% → `pause_on_exceed: true` pausa novas sessões do agente; o Secretário registra a notificação.
- Consulta: `opencorp agent cost auditor` · `opencorp budget status [--workspace x]`.

`budget.json` (gerido pelo core, não editar à mão):

```json
{
  "dia": "2026-08-28",
  "workspace_usd_hoje": 2.31,
  "por_agente": { "executor-padrao": 0.84, "ceo-documentos": 1.47 }
}
```

## Human-in-the-Loop (HITL)

1. Agente dispara comando que casa com `hitl_patterns` → sessão pausa.
2. Aparece em `opencorp approvals list`.
3. Humano: `opencorp approvals approve <id>` ou `reject <id> --motivo "..."`.
4. Resultado é registrado em `registries/execucoes/`.

## Auditoria

Tudo que importa fica registrado (append-only):

- comando bloqueado → `registries/logs/`
- HITL concedido/negado → `registries/execucoes/`
- mudança de config/agente → `registries/agentes/`
- gasto → `registries/custos/`

## Segredos

- Nunca dentro do workspace (vazaria em templates/exports/git).
- Vivem em `~/.opencorp/secrets.json` (chmod 600) ou variáveis `OPENCODE_*`/`OPENCORP_*`.
- `opencorp template export` **sempre** exclui segredos; `opencorp doctor` alerta se achar segredo dentro de workspace.
