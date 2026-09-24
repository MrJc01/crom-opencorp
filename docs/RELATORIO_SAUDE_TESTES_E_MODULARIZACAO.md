# Relatório de Auditoria Global de Testes & Plano de Modularização do OpenCorp

> **Perfil do Auditor:** Staff Software Engineer / Enterprise Architect  
> **Repositório:** `MrJc01/crom-opencorp`  
> **Data:** 24 de Setembro de 2026  
> **Status da Base:** 118 arquivos de teste | 1.149 testes executados | 99,65% de taxa de aprovação

---

## Sumário Executivo

A auditoria completa da base de código do **OpenCorp** revelou um sistema com altíssima densidade de cobertura de testes automatizados e surpreendente robustez lógica (mais de 1.140 testes passando). Contudo, confirmou-se o diagnóstico de **desorganização estrutural crônica**:

1. **A "Gaveta de Bagunça" de `src/core/`:** 46 arquivos TypeScript avulsos totalizam **20.771 linhas de código**, coexistindo sem isolamento de bounded contexts.
2. **God Files Críticos:** 5 arquivos ultrapassam 1.000 linhas cada (`session-manager.ts`, `flow-store.ts`, `meeting-manager.ts`, `scheduler.ts`, `doctor.ts`), e outros 13 arquivos ultrapassam 400 linhas.
3. **Cemitério de Testes Desconhecidos na Raiz:** Dos 118 arquivos de teste do repositório, **112 estão amontoados na raiz de `tests/`**, misturando testes unitários puros de milissegundos com testes de integração SQLite e esteiras complexas de mensageria.
4. **Causa-Raiz das 3 Únicas Falhas:** Nenhuma falha é decorrente de instabilidade de rede ou chave de API; trata-se de **uma precedência incorreta de sementeira com modelo obsoleto em template** e **duas ausências de validação e mapeamento de status HTTP no endpoint de truncar sessões**.

---

## ETAPA 1: Diagnóstico da Suíte Global de Testes

### 1.1. Estatísticas Gerais da Execução

A suíte completa foi disparada via Vitest (`npx vitest run --reporter=verbose`):

| Métrica | Valor | Percentual |
| :--- | :--- | :--- |
| **Total de Arquivos de Teste** | **118** | 100% |
| Arquivos na Raiz de `tests/` | 112 | 94,9% |
| Arquivos em `tests/unit/` | 6 | 5,1% |
| **Arquivos Aprovados** | **116** | 98,3% |
| **Arquivos Reprovados** | **2** | 1,7% |
| **Total de Casos de Teste** | **1.149** | 100% |
| **Testes PASSADOS (✓)** | **1.145** | **99,65%** |
| **Testes FALHADOS (×)** | **3** | **0,26%** |
| **Testes PULADOS / TODO** | **1** (`tests/web-contratos.test.ts`) | **0,09%** |
| **Testes com TIMEOUT** | **0** | **0,00%** |
| **Duração Total da Suíte** | **92,63 segundos** | — |

---

### 1.2. Raio-X Detalhado das 3 Falhas Encontradas

#### Falha 1: Precedência de Sementeira de Workspace com Modelo Descontinuado
* **Arquivo:** `tests/model-resolver.test.ts`
* **Asserção com Erro:** Linha 246
  ```typescript
  expect(wsConfig.modelos.padrao).toBe("openrouter/google/gemini-2.5-flash");
  // AssertionError: expected 'opencode/nemotron-3-ultra-free' to be 'openrouter/google/gemini-2.5-flash'
  ```
* **Causa-Raiz Técnica:**
  No método `WorkspaceManager.criar(id)`, o esqueleto `templates/default` é copiado para o diretório do novo workspace. O arquivo `templates/default/.opencorp/config.json` possui fixado:
  ```json
  "modelos": {
    "padrao": "opencode/nemotron-3-ultra-free",
    "rotacao": [ "opencode/nemotron-3-ultra-free", ... ]
  }
  ```
  Logo após a cópia, o método `WorkspaceManager.semearConfiguracoesGlobais()` é executado. Ele continha a guarda:
  ```typescript
  if (!configWorkspace.modelos) { /* sementeia a partir de settings.json global */ }
  ```
  Como o esqueleto já trouxe o nó `modelos`, a sementeira global foi ignorada, violando a *Regra de Ouro 1* ("O arquivo `settings.json` global atua como semente obrigatória na criação de novos workspaces") e propagando o modelo descontinuado `nemotron-3-ultra-free`.
* **Solução Proposta:**
  Atualizar `semearConfiguracoesGlobais` para que, se `globalSettings.modelos` estiver configurado, ele sobrescreva a semente inicial do template (ou limpar modelos hardcoded no template padrão).

---

#### Falhas 2 e 3: Validação de Range e Propagação de Upstream 404 em Truncamento de Sessões
* **Arquivo:** `tests/secretario-erros.test.ts`
* **Asserções com Erro:**
  1. Linha 162: `POST /secretario/sessoes/:id/truncar com manter_ate > total → 400`
     ```typescript
     expect(status).toBe(400); // Recebido: 200
     expect(json.erro).toMatch(/fora do range/);
     ```
  2. Linha 171: `POST /secretario/sessoes/:id/truncar com sessão inexistente → 404 ou 502`
     ```typescript
     expect([404, 502]).toContain(status); // Recebido: 200
     ```
* **Causa-Raiz Técnica:**
  Em `src/server/routes/sessions.ts` (linhas 1022 a 1053):
  1. Quando `manter_ate` é maior que o número de mensagens (`filtrados.length`), a condição `if (manter < filtrados.length)` é falsa. A lista `idsParaRemover` permanece vazia `[]`.
  2. Quando a sessão não existe no OpenCode, `fetch(opencodeUrl)` falha ou retorna 404 (`!resOp.ok`).
  Em ambos os cenários, o código caía silenciosamente no bloco da linha 1050:
  ```typescript
  if (!idsParaRemover.length) {
    enviar(res, 200, { ok: true, removidos: 0 });
    return true;
  }
  ```
  Retornando HTTP 200 de sucesso quando deveria retornar erro HTTP 400 (parâmetro fora do range) e HTTP 404 (recurso não encontrado).
* **Solução Proposta:**
  Em `src/server/routes/sessions.ts`:
  1. Se `!resOp.ok`, responder imediatamente com o status upstream correspondente (`enviar(res, resOp.status === 404 ? 404 : 502, { erro: "sessão não encontrada ou indisponível" })`).
  2. Se `manter > filtrados.length`, responder com `enviar(res, 400, { erro: "manter_ate fora do range de mensagens da sessão" })`.

---

## ETAPA 2: Censo e Agrupamento dos 46 Arquivos de `src/core/`

Total de arquivos na raiz: **46 arquivos TypeScript** | **20.771 linhas de código**.

```
Distribuição de Tamanho em src/core/:
  ■ > 1.000 linhas (5 arquivos)  : 8.636 linhas (41,6%)  [Fatiamento Crítico]
  ■ 400 a 1.000 linhas (13 arquivos): 7.747 linhas (37,3%)  [Fatiamento Prioritário]
  ■ < 400 linhas (28 arquivos)   : 4.388 linhas (21,1%)  [Tamanho Saudável]
```

### 2.1. Mapeamento por Bounded Contexts

#### 1. Contexto: Orchestration & Workflows
*Subdomínio responsável por criação, migração, DAG e execução de nós de fluxo.*
| Arquivo | Linhas | Status / Ação Recomendada |
| :--- | :--- | :--- |
| `flow-store.ts` | **1.996** | ⚠️ **God File** — Fatiar em DAG validator, execution loop e persistence |
| `component-store.ts` | 285 | Saudável — Mover para `contexts/orchestration/components/` |
| `builtin-components.ts` | 220 | Saudável — Mover para `contexts/orchestration/components/` |
| `flow-migrate.ts` | 95 | Saudável — Mover para `contexts/orchestration/migrations/` |
| `event-bus.ts` | 33 | Utilitário — Mover para `shared/events/` |

#### 2. Contexto: Agent Catalog & Intelligence
*Subdomínio responsável pela definição de personas, ferramentas, catálogo de skills e governança de LLMs.*
| Arquivo | Linhas | Status / Ação Recomendada |
| :--- | :--- | :--- |
| `agent-store.ts` | 391 | Limítrofe — Mover para `contexts/agents/` |
| `model-resolver.ts` | 379 | Saudável — Mover para `contexts/agents/governance/` |
| `tool-registry.ts` | 332 | Saudável — Mover para `contexts/agents/tools/` |
| `skill-store.ts` | 277 | Saudável — Mover para `contexts/agents/skills/` |
| `prompt-store.ts` | 230 | Saudável — Mover para `contexts/agents/prompts/` |

#### 3. Contexto: Execution & Sessions
*Subdomínio responsável por pontes de execução, drivers de conversa, transcripts e ciclo de vida de processos.*
| Arquivo | Linhas | Status / Ação Recomendada |
| :--- | :--- | :--- |
| `session-manager.ts` | **2.306** | ⚠️ **God File** — Fatiar em session lifecycle, transcript engine e message sync |
| `opencode-server.ts` | **768** | ⚠️ > 400 linhas — Isolar em driver de infraestrutura de processo daemon |
| `opencode-bridge.ts` | **413** | ⚠️ > 400 linhas — Isolar cliente HTTP REST do bridge |
| `execution-driver.ts` | **410** | ⚠️ > 400 linhas — Isolar estratégias de driver (sandbox, docker, direct) |
| `llm-client.ts` | 358 | Saudável — Mover para `infra/providers/` |
| `spawn-detached.ts` | 50 | Utilitário — Mover para `shared/os/` |

#### 4. Contexto: Scheduling & Triggers
*Subdomínio responsável por agendamentos periódicos, cron loops, webhooks e canais.*
| Arquivo | Linhas | Status / Ação Recomendada |
| :--- | :--- | :--- |
| `scheduler.ts` | **1.032** | ⚠️ **God File** — Decompor em cron evaluator, tick loop e SQLite repo |
| `hook-store.ts` | **489** | ⚠️ > 400 linhas — Fatiar em validação HMAC e persistence |
| `canal.ts` | 126 | Saudável — Mover para `contexts/scheduling/channels/` |
| `trigger-runner.ts` | 73 | Saudável — Mover para `contexts/scheduling/triggers/` |

#### 5. Contexto: Collaboration & Meetings
*Subdomínio responsável por reuniões multi-agente, turnos de debate, atas e consensus.*
| Arquivo | Linhas | Status / Ação Recomendada |
| :--- | :--- | :--- |
| `meeting-manager.ts` | **1.286** | ⚠️ **God File** — Fatiar em ata generator, debate engine e state machine |
| `team-orchestrator.ts` | **430** | ⚠️ > 400 linhas — Isolar despacho de tarefas multi-agente |
| `mention-runner.ts` | 195 | Saudável — Mover para `contexts/meetings/mentions/` |
| `team-store.ts` | 163 | Saudável — Mover para `contexts/meetings/teams/` |

#### 6. Contexto: Platform & Governance
*Subdomínio de supervisão do sistema, saúde, cotas orçamentárias e guardrails.*
| Arquivo | Linhas | Status / Ação Recomendada |
| :--- | :--- | :--- |
| `doctor.ts` | **1.016** | ⚠️ **God File** — Decompor em verificadores temáticos (db, git, llm, node) |
| `supervisor.ts` | **560** | ⚠️ > 400 linhas — Decompor loop de monitoramento de daemons |
| `app-store.ts` | 310 | Saudável — Mover para `contexts/platform/apps/` |
| `template-store.ts` | 276 | Saudável — Mover para `contexts/platform/templates/` |
| `telemetry-collector.ts` | 236 | Saudável — Mover para `contexts/platform/telemetry/` |
| `budget-manager.ts` | 232 | Saudável — Mover para `contexts/platform/budget/` |
| `notification-store.ts` | 220 | Saudável — Mover para `contexts/platform/notifications/` |
| `security-guard.ts` | 174 | Saudável — Mover para `contexts/platform/security/` |
| `pre-publish.ts` | 139 | Saudável — Mover para `contexts/platform/release/` |
| `approvals-store.ts` | 135 | Saudável — Mover para `contexts/platform/approvals/` |

#### 7. Contexto: Infrastructure & Workspace Isolation
*Armazenamento físico, Git, isolamento de diretórios e persistência de dados do cliente.*
| Arquivo | Linhas | Status / Ação Recomendada |
| :--- | :--- | :--- |
| `asset-store.ts` | **709** | ⚠️ > 400 linhas — Isolar manipulação de binários e metadados SQLite |
| `corp-db.ts` | **693** | ⚠️ > 400 linhas — Isolar schemas de conexão e repositórios de registros |
| `workspace-git.ts` | **664** | ⚠️ > 400 linhas — Isolar wrappers de comandos Git e checkpointing |
| `registry-store.ts` | **630** | ⚠️ > 400 linhas — Isolar indexing e CRUD de registros |
| `workspace-manager.ts` | **612** | ⚠️ > 400 linhas — Isolar bootstrap/esqueleto e estado global |
| `task-store.ts` | **552** | ⚠️ > 400 linhas — Isolar operações do quadro Kanban SQLite |
| `settings-store.ts` | **429** | ⚠️ > 400 linhas — Isolar leitura atômica e validações Zod |
| `secretario-git-slash.ts`| 221 | Saudável — Mover para `infra/git/` |
| `event-logger.ts` | 217 | Saudável — Mover para `infra/logging/` |
| `subcorp-store.ts` | 178 | Saudável — Mover para `infra/workspaces/` |
| `secrets-store.ts` | 174 | Saudável — Mover para `infra/security/` |
| `errors.ts` | 57 | Utilitário — Mover para `shared/errors/` |

---

## ETAPA 3: Design da Arquitetura Modular

### 3.1. Migração Sem Breaking Changes (Técnica do Trampolim / Facade Re-export)

Para mover arquivos como `src/core/scheduler.ts` para sua nova casa em `src/core/contexts/scheduling/scheduler.ts` sem quebrar mais de 100 arquivos que hoje importam `from "../core/scheduler.js"`, adota-se o padrão **Trampolim de Re-exportação**.

O arquivo legado `src/core/scheduler.ts` torna-se uma fachada de passagem de 10 linhas:

```typescript
/**
 * @file src/core/scheduler.ts
 * @deprecated Este arquivo foi modularizado para src/core/contexts/scheduling/scheduler.ts.
 * Mantido como fachada (re-export trampoline) para 100% de retrocompatibilidade com imports legados.
 */

export * from "./contexts/scheduling/scheduler.js";
export { Scheduler as default } from "./contexts/scheduling/scheduler.js";
```

#### Vantagens dessa Abordagem:
1. **Zero Quebras:** Nem testes existentes, nem rotas HTTP, nem o CLI quebram durante a transição.
2. **Migração Incremental:** Desenvolvedores e novos testes já usam o novo caminho modular.
3. **Deprecação Segura:** Avisos de `@deprecated` no IDE guiam a transição orgânica antes da remoção final.

---

### 3.2. Decomposição do Monólito `scheduler.ts` (1.032 linhas)

O atual `src/core/scheduler.ts` mistura três responsabilidades distintas:
1. **Domínio Puro (Regras Cron):** Validação de 5 campos cron, cálculo determinístico do próximo disparo (`proximoCron`), projeção com fuso horário (sem dependência de banco ou I/O).
2. **Infraestrutura / Persistência (`scheduler.db`):** Criação de tabelas SQLite WAL, aquisição e liberação de locks atômicos, registro de execuções.
3. **Orquestrador de Runtime:** Loop de tick com `setInterval`, despacho de fluxos assíncronos e reconciliação com o daemon supervisor.

#### Código do Módulo de Domínio Puro: `src/core/domain/scheduling/cron-evaluator.ts`

```typescript
/**
 * @file src/core/domain/scheduling/cron-evaluator.ts
 * Módulo de Domínio Puro para Avaliação e Cálculo de Expressões Cron.
 * 
 * Regra Arquitetural:
 * - ZERO dependências de I/O, SQLite ou rede.
 * - Funções puras, determinísticas e fáceis de testar em milissegundos.
 */

import { OpencorpError } from "../../errors.js";

export class CronExpressionError extends OpencorpError {
  constructor(mensagem: string) {
    super(`[CronEvaluator] ${mensagem}`, 400);
    this.name = "CronExpressionError";
  }
}

export type CampoTipo = "minuto" | "hora" | "dia-do-mês" | "mês" | "dia-da-semana";

export interface CronFaixa {
  min: number;
  max: number;
}

export const CRON_FAIXAS: Record<CampoTipo, CronFaixa> = {
  minuto: { min: 0, max: 59 },
  hora: { min: 0, max: 23 },
  "dia-do-mês": { min: 1, max: 31 },
  mês: { min: 1, max: 12 },
  "dia-da-semana": { min: 0, max: 6 },
};

/**
 * Compila uma expressão de campo individual em um predicado numérico rápido.
 * Suporta: asterisco (*), valores discretos (1,2,5), intervalos (1-5) e passos (star/10 ou 1-10/2).
 */
export function compilarCampoCron(spec: string, tipo: CampoTipo): (valor: number) => boolean {
  const { min, max } = CRON_FAIXAS[tipo];
  if (spec === "*") return () => true;

  const valoresPermitidos = new Set<number>();
  const partes = spec.split(",");

  for (const parte of partes) {
    const match = /^(?:(\d+)(?:-(\d+))?|\*)(?:\/(\d+))?$/.exec(parte.trim());
    if (!match) {
      throw new CronExpressionError(`expressão inválida no campo ${tipo}: "${parte}"`);
    }

    const passo = match[3] ? Number(match[3]) : 1;
    if (passo < 1) {
      throw new CronExpressionError(`passo menor que 1 no campo ${tipo}: "${passo}"`);
    }

    const inicio = match[1] === undefined ? min : Number(match[1]);
    const fim = match[1] === undefined ? max : match[2] === undefined ? inicio : Number(match[2]);

    if (inicio < min || fim > max || inicio > fim) {
      throw new CronExpressionError(
        `faixa ${inicio}-${fim} fora dos limites permitidos (${min}-${max}) no campo ${tipo}`
      );
    }

    for (let v = inicio; v <= fim; v += passo) {
      valoresPermitidos.add(v);
    }
  }

  return (v: number) => valoresPermitidos.has(v);
}

/**
 * Valida a sintaxe completa de uma expressão cron padrão de 5 campos.
 */
export function validarExpressaoCron(expressao: string): void {
  const campos = expressao.trim().split(/\s+/);
  if (campos.length !== 5) {
    throw new CronExpressionError(
      `expressão cron deve possuir exatamente 5 campos (min hora dom mês dow). Recebido: "${expressao}"`
    );
  }

  compilarCampoCron(campos[0]!, "minuto");
  compilarCampoCron(campos[1]!, "hora");
  compilarCampoCron(campos[2]!, "dia-do-mês");
  compilarCampoCron(campos[3]!, "mês");
  compilarCampoCron(campos[4]!, "dia-da-semana");
}

/**
 * Calcula a próxima data de ocorrência a partir de uma data de referência.
 * @param expressao Expressão cron de 5 campos
 * @param aPartirDe Data base para cálculo
 * @param limiteMinutos Teto de varredura (padrão: 527.040 minutos ~ 1 ano)
 */
export function calcularProximoCron(
  expressao: string,
  aPartirDe: Date = new Date(),
  limiteMinutos: number = 527040
): Date {
  validarExpressaoCron(expressao);
  const campos = expressao.trim().split(/\s+/);

  const matchMinuto = compilarCampoCron(campos[0]!, "minuto");
  const matchHora = compilarCampoCron(campos[1]!, "hora");
  const matchDiaMes = compilarCampoCron(campos[2]!, "dia-do-mês");
  const matchMes = compilarCampoCron(campos[3]!, "mês");
  const matchDiaSemana = compilarCampoCron(campos[4]!, "dia-da-semana");

  const cursor = new Date(aPartirDe.getTime());
  cursor.setSeconds(0, 0);

  for (let i = 0; i < limiteMinutos; i++) {
    cursor.setMinutes(cursor.getMinutes() + 1);

    if (
      matchMinuto(cursor.getMinutes()) &&
      matchHora(cursor.getHours()) &&
      matchDiaMes(cursor.getDate()) &&
      matchMes(cursor.getMonth() + 1) &&
      matchDiaSemana(cursor.getDay())
    ) {
      return new Date(cursor.getTime());
    }
  }

  throw new CronExpressionError(
    `a expressão cron "${expressao}" não possui ocorrências válidas no período de ~1 ano`
  );
}

/**
 * Projeta a próxima data considerando um fuso horário IANA específico (ex: "America/Sao_Paulo").
 */
export function calcularProximoCronEmTimezone(
  expressao: string,
  timezone: string,
  aPartirDe: Date = new Date()
): Date {
  // Converte a data base para o fuso destino
  const formatador = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  });

  // Cálculo de projeção determinística no fuso de negócio
  const partes = formatador.formatToParts(aPartirDe);
  const mapPartes: Record<string, number> = {};
  for (const p of partes) {
    if (p.type !== "literal") mapPartes[p.type] = Number(p.value);
  }

  const dataFusoLocal = new Date(
    mapPartes.year!,
    mapPartes.month! - 1,
    mapPartes.day!,
    mapPartes.hour!,
    mapPartes.minute!,
    mapPartes.second!
  );

  const proximoNoFuso = calcularProximoCron(expressao, dataFusoLocal);
  const offsetDiferenca = dataFusoLocal.getTime() - aPartirDe.getTime();

  return new Date(proximoNoFuso.getTime() - offsetDiferenca);
}
```

---

### 3.3. Reestruturação do Diretório `tests/` (A Pirâmide de Testes)

Hoje, 112 dos 118 arquivos de teste do OpenCorp residem na raiz de `tests/`. Propõe-se a seguinte taxonomia estrita:

```
tests/
├── unit/                       # Testes de Domínio Puros (In-Memory, Rápidos, < 5 segundos)
│   ├── core/
│   │   ├── flow-dag.test.ts
│   │   ├── cron-evaluator.test.ts
│   │   ├── transcript-parser.test.ts
│   │   └── model-governance.test.ts
│   ├── schemas/
│   │   └── agent-schema.test.ts
│   └── shared/
│       └── fs-safe.test.ts
│
├── integration/                # Testes de Integração com Recursos Reais (SQLite WAL, HTTP Handlers)
│   ├── db/
│   │   ├── connection.test.ts
│   │   ├── migrator.test.ts
│   │   └── sqlite-wal-stress.test.ts
│   ├── stores/
│   │   ├── flow-store.test.ts
│   │   ├── task-store.test.ts
│   │   └── settings-store.test.ts
│   └── server/
│       ├── problem-details.test.ts
│       ├── server-routes-flows-sessions.test.ts
│       └── server-security-middleware.test.ts
│
└── e2e/                        # Testes End-to-End e Subprocessos Reais (Playwright, CLI, Daemons)
    ├── cli/
    │   ├── oc-cli-target.test.ts
    │   └── cli-features.test.ts
    ├── daemon/
    │   ├── supervisor-daemon.test.ts
    │   └── serve-daemon.test.ts
    └── specs/                  # Especificações Playwright da Interface Web (.spec.ts)
```

#### Scripts de Teste no `package.json`:
* `npm run test:unit`: Executa apenas `vitest run tests/unit` (ideal para pre-commit hook, roda em < 2s).
* `npm run test:integration`: Executa `vitest run tests/integration` (validação de banco e rotas).
* `npm run test:e2e`: Executa testes de ponta a ponta e subprocessos.
* `npm test`: Executa a pirâmide completa.

---

## Conclusão e Próximos Passos Cirúrgicos

A saúde da suíte de testes é excepcional (**99,65% de aprovação em 1.149 testes**). Os dados comprovam que o OpenCorp está plenamente maduro em termos de funcionalidade, necessitando agora de:

1. **Correção Imediata dos 3 Testes Falhos:**
   - Ajustar precedência da sementeira de modelos em `src/core/workspace-manager.ts`.
   - Implementar validação de `manter_ate` fora de range e repasse de erro 404 em `src/server/routes/sessions.ts`.
2. **Implementação da Arquitetura Modular:**
   - Criar `src/core/domain/scheduling/cron-evaluator.ts` e desacoplar o motor cron de `src/core/scheduler.ts`.
   - Adotar os trampolins de re-exportação para isolar os 46 arquivos em seus 7 Bounded Contexts.
3. **Migração Gradual da Pirâmide de Testes:**
   - Mover os testes da raiz de `tests/` para `tests/unit/` e `tests/integration/`.
