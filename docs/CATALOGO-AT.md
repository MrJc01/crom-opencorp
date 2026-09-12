# Catálogo de Menções e Comandos do Chat (`/`, `!`, `@`)

> Documenta todos os predefinidos da gramática do chat do Secretário (F3-T01).
> Convenção: `/` e `!` só valem **no início da linha**; `@` vale em **qualquer posição**.
> Regra de ouro: o **servidor é autoritativo** (mesma regex do cliente e do servidor);
> o cliente faz apenas preview otimista.

## Taxonomia

| Prefixo | Posição | Papel | Visual no cliente |
|---|---|---|---|
| `/` | início da linha | **executa ação** (fast-path whitelist; resto = ajuda/erro, nunca LLM silencioso) | texto simples |
| `!` | início da linha | **shell** (`POST /terminal`, whitelist) | texto simples |
| `@agente:<id>` | qualquer posição | **troca o destinatário** (campo `agente` do corpo; só quando é a única menção) | pill de destinatário (não vira texto) |
| `@arquivo:<caminho>` | qualquer posição | **puxa conteúdo** do arquivo (cap 12 KB + fonte citada) | chip resolvido |
| `@task:<id>` | qualquer posição | **puxa dados** da task (título/descrição/coluna) | chip resolvido |
| `@prompt:<chave>` | qualquer posição | **expande** o prompt salvo para texto editável | texto editável (Esc desfaz) |

Menções simples legadas (`@foo`) continuam toleradas: se `foo` for um agente existente e
for a única menção, vira destinatário; caso contrário, ecoa como contexto.

## Comandos `/` (ação)

| Comando | O que faz | Escopo | Fast-path |
|---|---|---|---|
| `/status` | Diagnóstico rápido: secretário (opencode), scheduler (daemon) e tasks em andamento | workspace | sim (ação) |
| `/agents` | Lista o catálogo de agentes do workspace | workspace | sim (ação) |
| `/schedules` | Lista rotinas agendadas do scheduler | workspace | sim (ação) |
| `/task list` | Lista o quadro Kanban de tasks | workspace | sim (ação) |
| `/task status <id>` | Detalhe de uma task (coluna, prioridade, responsável, descrição) | workspace | sim (ação) |
| `/task run <id>` | Despacha a task para o agente responsável (execução assíncrona) | workspace | sim (ação) |
| `/doctor` | Verifica integridade (Node, OpenCode, settings, secrets, scheduler, daemon, hooks/apps/flows) | workspace + global | sim (ação) |
| `/help` | Lista os comandos `/` e a sintaxe de menções `@` | global | sim (ação) |
| `/clear` | Limpa as mensagens visíveis da conversa atual | cliente (não chega ao servidor) | sim (cliente) |
| `/git status` | Arquivos modificados (cards de diff/descarte) | workspace (git) | sim (git) |
| `/git diff [arquivo]` | Diff unificado colorido | workspace (git) | sim (git) |
| `/git restore <arquivo>` | Descarta alterações de um arquivo | workspace (git) | sim (git) |
| `/restore <arquivo>` | Atalho de `/git restore` | workspace (git) | sim (git) |
| `/git log` | Últimos commits semânticos do workspace | workspace (git) | sim (git) |

Extras do módulo git (não listados no autocomplete, mas reconhecidos):
`/rollback <alvo>`, `/git checkpoints`, `/git task-branch <id>`, `/git branch`, `/git help`.

**Comandos `/` não reconhecidos não caem no LLM** — o servidor responde com ajuda
legível listando os comandos disponíveis.

## Comandos `!` (shell — `POST /terminal`)

Todos usam a whitelist `COMANDOS_AGENDA` (subcomandos operacionais `serve`, `web`,
`scheduler`, `test`, `daemon` são bloqueados). Flags (`--*`) e caminhos são descartados;
timeout de 20 s com `SIGKILL`; saída limitada a 100 KB.

| Comando | O que faz | Escopo |
|---|---|---|
| `!oc status` | Diagnóstico completo no terminal | workspace (via CLI) |
| `!oc task list` | Lista tasks do workspace no terminal | workspace (via CLI) |
| `!git status` | Estado dos arquivos no repositório | workspace (git) |
| `!git log -n 5 --oneline` | Últimos 5 commits | workspace (git) |
| `!npm test` | Roda a suíte de testes | workspace (shell) |
| `!ls -la` | Lista arquivos da raiz | workspace (shell) |

## Menções `@`

### Agente (`@agente:<id>`)

| Gatilho | O que faz |
|---|---|
| `@agente:secretario-exec` | Direciona para o orquestrador autônomo (executa ferramentas) |
| `@agente:secretario` | Direciona para o consultor executivo/analista |
| `@agente:editor` | Direciona para o redator/publicador |
| `@agente:critico-site` | Direciona para o auditor de qualidade visual |
| `@agente:pesquisador-fontes` | Direciona para o curador de notícias |
| `@agente:corretor-site` | Direciona para o saneador de rascunhos |
| `@agente:executor-padrao` | Direciona para o executor técnico |
| `@agente:<id-do-workspace>` | Qualquer agente registrado em `.opencorp/agents/*.md` |

Regra de destinatário: o `@agente:<id>` troca o campo `agente` do envio **somente
quando é a única menção** da mensagem e o agente existe. Com mais de uma menção,
vira contexto referenciado.

### Prompt (`@prompt:<chave>`)

| Gatilho | O que faz |
|---|---|
| `@prompt:<chave>` | Expande o prompt salvo (PromptStore, `.opencorp/prompts.json`) para texto editável |

> TODO(F3-T02): o cliente ainda não puxa a lista de prompts (não há endpoint HTTP).
> Hoje a chave é mostrada como texto editável; o servidor resolve a chave via
> `PromptStore.get` e injeta o texto no contexto. Ligar o endpoint de listagem de
> prompts para popular a seção "Prompt" do autocomplete.

### Arquivo (`@arquivo:<caminho>`)

| Gatilho | O que faz |
|---|---|
| `@arquivo:scripts/wp.cjs` | Inclui o conteúdo do script de integração WordPress |
| `@arquivo:docs/` | Referencia a pasta de documentação |
| `@arquivo:<caminho>` | Inclui o conteúdo real de qualquer arquivo do workspace |

O servidor lê o arquivo (path relativo ao workspace, com proteção anti-traversal),
corta em 12 KB e injeta no contexto com a fonte citada. Arquivo inexistente gera
citação de "não encontrado" em vez de falhar a mensagem.

### Task (`@task:<id>`)

| Gatilho | O que faz |
|---|---|
| `@task:<id>` | Inclui título, coluna, responsável e descrição da task |

As tasks são carregadas dinamicamente do board do workspace (até 8 no autocomplete).

## Resolução no servidor (verdade autoritativa)

Ao enviar a mensagem (`POST /secretario/conversa` e `/secretario/conversa/stream`):

1. Comandos `/` no início → fast-path: git (módulo `secretario-git-slash`) e ações
   whitelistadas (`/status`, `/agents`, `/schedules`, `/task …`, `/doctor`, `/help`).
2. Comandos `/` não reconhecidos → resposta de ajuda (nunca vão ao LLM).
3. Menções `@` → `resolverMencoesSecretario`:
   - `@agente:<id>` (única menção + agente existente) → troca `agente` do corpo.
   - `@arquivo:<p>` / `@task:<id>` / `@prompt:<chave>` → hidrata conteúdo no contexto
     (bloco `[CONTEXTO REFERENCIADO]` com fontes), removendo o token do texto.
   - `corpo.contexto` (ex.: `localização: /rota`) continua preservado.
4. Resposta expõe `agente` (destinatário resolvido) para paridade cliente/servidor.
