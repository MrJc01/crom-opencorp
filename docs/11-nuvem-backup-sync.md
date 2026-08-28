# 11 — Nuvem: Backup e Sincronização (opcional)

## Recomendação (pensado sobre a proposta)

A ideia da "pasta só para sistemas na nuvem" (backup + sincronização para monitorar outros servidores, com backups locais) **vale a pena, mas como módulo opcional e tardio (ETAPA 8)**, fora do core:

- **Risco de entrar no core cedo**: sync bidirecional gera conflitos, corrupção e complexidade de estado que atrasariam a Fase A inteira.
- **Padrão certo**: core grava arquivos → módulo `cloud` faz **push** desses arquivos para onde quiser. O opencorp nunca *depende* da nuvem para funcionar.
- **Sincronização de monitoramento** (vigiar o que existe em outros servidores) é uma função *read-only + diff + alerta*, que se apoia no mesmo módulo sem alterar o core.

## Os três modos

| Modo | O que faz | Ferramenta |
|---|---|---|
| `backup-local` | copia versionada dos workspaces para pasta local/HD externo | rsync/cp com rotação |
| `backup-nuvem` | envia para S3/B2/Drive/rclone remote | rclone (+ crypt opcional) |
| `mirror-remoto` | **monitora** outros servidores: indexa o que existe lá, faz diff com o local, alerta diferenças; backups locais do remoto | rclone/SSH |

## Estrutura

```
~/.opencorp/
├── cloud/
│   ├── cloud.json           # perfis e alvos
│   ├── state/               # snapshots de índice (o que já foi enviado, hashes)
│   └── cache/               # espelho local temporário de remotos
```

`cloud.json`:

```json
{
  "perfis": [
    {
      "id": "backup-diario",
      "modo": "backup-nuvem",
      "origem": "workspaces/*/.opencorp + workspaces/*/docs",
      "alvo": "remote-backup:opencorp/{{workspace}}",
      "agenda": "0 3 * * *",
      "criptografia": "age (chave em ~/.opencorp/secrets.json)",
      "retencao": "7 diários · 4 semanais"
    },
    {
      "id": "monitor-servidores",
      "modo": "mirror-remoto",
      "remotos": ["ssh://srv-alpha/apps", "ssh://srv-beta/data"],
      "agenda": "*/30 * * * *",
      "on_diff": "registra em registries/logs/ e notifica secretario"
    }
  ]
}
```

## Comandos

```bash
opencorp cloud configure          # wizard: modo, alvos, agenda, criptografia
opencorp cloud backup [--perfil p] [--dry-run]
opencorp cloud sync  [--perfil p] [--dry-run]     # push one-way por padrão
opencorp cloud status             # último backup por perfil, diffs pendentes, remotos saudáveis
opencorp cloud diff monitor-servidores
```

## Regras de segurança (inviolate)

1. **One-way por padrão**: backup/sync **nunca** sobrescreve o workspace local sem `--two-way` explícito + confirmação.
2. **Dry-run primeiro**: todo perfil novo roda `--dry-run` e mostra o plano antes do primeiro push real.
3. **Criptografia** em alvos de terceiros (age/rclone crypt); chave em `~/.opencorp/secrets.json`.
4. **Segredos nunca sincronizados**: `.opencorp/` parcial — `config.json`, `agents/`, `registries/` sim; `secrets*` nunca.
5. **Lock**: um lock por perfil evita dois syncs simultâneos (crash-safe, expira em 1h).
6. **Diffs viram eventos**: qualquer mudança detectada em remoto gera registro em `registries/logs/` (logs referenciais) — o "monitoramento do que tem nos outros servidores".
7. Agenda via cron do sistema gerado pelo wizard (não rodamos daemon permanente na Fase A).

## O que fica para depois da ETAPA 8

- Merge bidirecional com resolução de conflito (por journal do registro).
- Monitoramento ativo multi-servidor com dashboard (Fase C).
- Restauração pontual (`cloud restore --at "2 dias atrás"`) — v1 restaure manual a partir do snapshot.
