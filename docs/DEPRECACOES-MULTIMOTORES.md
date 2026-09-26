# Depreciações — arquitetura multimotores

> Texto para as notas de release das próximas versões menores. Nada aqui é removido antes das **três** condições aprovadas.

## Condições para remover o formato antigo

1. Data: **não antes de 2026-11-24** (primeiro aviso em 2026-09-25; mínimo de 60 dias).
2. Pelo menos **duas versões menores** publicadas com o tradutor e o `opencorp migrate-configs`.
3. Remoção somente na **v2.0.0** ou posterior.

Enquanto isso, o formato antigo continua funcionando e emite `[DEPRECATION NOTICE]` uma vez por campo e processo. A data do primeiro aviso de cada instalação fica em `~/.opencorp/deprecation-state.json`.

## O que está depreciado

| Formato antigo | Formato novo |
|---|---|
| `~/.opencorp/runner.json` → `engine` | `settings.run_engine.default` |
| `runner.json` → `timeout_min` | `settings.run_engine.timeout_min` |
| `runner.json` → `harness_fallback` | `settings.run_engine.fallback` (cadeia explícita de motores; vazia = nunca trocar de motor) |
| `runner.json` → `binary_path` | `settings.engines[<motor>].binary_path` |
| `runner.json` → `limits` | `settings.engines[<motor>].limits` |
| agente `harness` | `engine` |
| agente `harness_fallback` | `engine_fallback` |
| agente `model_fallback` | `rotation` |
| aliases de motor (`claude`, `agy`, `crom`, …) | ids canônicos (`claude-code`, `antigravity`, `crom-agente`, …) |

## Como migrar

```bash
opencorp migrate-configs            # prévia (não altera nada)
opencorp migrate-configs --apply    # backup em ~/.opencorp/backups/ + migração validada
opencorp migrate-configs --rollback # restaura byte a byte o backup mais recente
```

Na interface: **Configurações → Motores** mostra um aviso quando há formato antigo, com prévia, confirmação obrigatória e opção de desfazer. Nada é migrado automaticamente.

Códigos de saída: `0` ok · `1` erro · `2` resultado inválido (nada alterado) · `3` migração pendente (com `--check`) · `4` rollback falhou.

## Mudanças de comportamento já em vigor

- O motor explícito (execução ou agente) não é mais trocado pelo prefixo do modelo: `engine: opencode` com `model: codex/…` falha antes da execução (`MODEL_INCOMPATIBLE`).
- O retry automático usa só a cadeia explícita de modelos (agente → workspace ou `tests.rotation`); não há lista embutida. Modelos sem metadados de capacidade (tier `NAO_RECOMENDADO`) não entram em rotação automática.
- A troca automática de motor só ocorre com `settings.run_engine.fallback` definido e com modelo de compatibilidade comprovada.
- Gravações pela UI/CLI (`motores usar`, conectar/desconectar motor, limites) vão para `settings.json`; `runner.json` não é mais gravado.
