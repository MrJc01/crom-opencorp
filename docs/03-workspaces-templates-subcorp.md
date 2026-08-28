# 03 — Workspaces, Templates e Subcorp

## Workspace = uma empresa

Cada workspace é um **corp** isolado: pasta, config, agentes, registros e orçamento próprios. O opencorp gerencia N workspaces e um **workspace ativo** por vez (mas comandos aceitam `--workspace <id>` para operar em outro).

```bash
opencorp workspace create minha-empresa        # cria e usa template "default"
opencorp workspace list                        # lista todos + ativo
opencorp use minha-empresa                     # define o ativo
opencorp workspace show minha-empresa          # config resumida + agentes + orçamento
opencorp workspace delete rascunho --force     # remove (pede confirmação sem --force)
```

Criação a partir de template:

```bash
opencorp workspace create empresa-b --template templates/startup-enxuta
```

## Localização dos workspaces

- Padrão: `~/.opencorp/workspaces/`
- Override: `opencorp settings set paths.workspaces_root /minha/pasta` (ex.: dentro do repo do projeto)
- O **raiz do projeto opencorp** (onde estamos desenvolvendo) pode hospedar workspaces de teste em `/workspaces/` do próprio repo, ignorados pelo git.

## Templates (.corp)

Um **corp template** é um pacote reutilizável: agentes + categorias de registros + settings + security policy. Serve para padronizar empresas (ex.: "e-commerce", "agência de conteúdo").

```bash
opencorp template create startup-enxuta         # cria template vazio editável
opencorp template export minha-empresa -o minha-empresa.corp   # exporta do workspace vivo
opencorp template import ./minha-empresa.corp --as startup-v2  # importa pasta/arquivo
opencorp template list
```

Formato do pacote (pasta ou `.corp` = tar.gz da pasta):

```
startup-enxuta/
├── template.json          # { name, version, description, author }
├── agents/*.md
├── registries/            # categorias + registros iniciais (ex.: SOPs)
├── config.json            # settings base
└── security_policy.json
```

Import aceita caminho local, arquivo `.corp` ou URL git (`opencorp template import https://github.com/x/y.corp`).

## Subcorp (reuso entre empresas)

Um workspace **pai** pode importar outro workspace ou template como **subcorp** — um corpo de agentes/registros delegável com escopo limitado (o OpenCode faz o mesmo com agentes e o opencorp imita esse modelo).

```bash
opencorp subcorp add /caminho/para/outro-ws --as financeiro --perm read,ask
opencorp subcorp list
opencorp subcorp remove financeiro
```

`config.json` do pai registra:

```json
{
  "subcorps": [
    {
      "id": "financeiro",
      "source": "/caminho/para/outro-ws",
      "permissions": ["read", "ask"],
      "exposed_agents": ["contador", "auditor"],
      "exposed_registries": ["custos", "execucoes"]
    }
  ]
}
```

Regras de escopo:

| Permissão | Efeito |
|---|---|
| `read` | pai só **consulta** registros/agentes do subcorp |
| `ask` | pai pode **invocar agentes** do subcorp (ordens) |
| `write` | pai pode **escrever** nos registros do subcorp (evite; requer HITL) |

- Subcorp nunca vê o pai (isolamento unidirecional).
- Agentes expostos aparecem como `financeiro/contador` para o pai.

## Isolamento e segurança por workspace

- CWD de toda sessão = pasta do workspace (ver `02-arquitetura.md`).
- `security_policy.json` é **por workspace** — workspaces diferentes podem ter regras diferentes.
- Workspaces de teste (criados pelo testador cego) vivem em `/workspaces/` com prefixo `test-` e são descartáveis.
