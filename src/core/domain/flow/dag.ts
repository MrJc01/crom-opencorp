/**
 * @module dag — Domínio puro de cálculo de topologia de grafos dirigidos (DAG)
 *
 * Módulo extraído de `flow-store.ts` como parte da padronização DDD do OpenCorp.
 *
 * Regras:
 * - ZERO dependência de I/O, SQLite, filesystem ou timers.
 * - Adjacências usam `Set<string>` para garantir idempotência de arestas.
 * - Funções puras: mesma entrada → mesma saída, sempre.
 *
 * @see docs/PADRONIZACAO_ARQUITETURAL_OPENCORP.md
 */

// ── Tipos mínimos de contrato (independentes do Zod runtime) ─────────

/** Representação mínima de um nó para cálculo topológico. */
export interface DagNo {
  readonly id: string;
  readonly tipo: string;
  readonly config?: Readonly<Record<string, unknown>>;
}

/** Representação mínima de uma aresta explícita. */
export interface DagAresta {
  readonly de: string;
  readonly para: string;
}

/** Contrato mínimo de um fluxo para cálculo de DAG puro. */
export interface DagFlow {
  readonly nos: readonly DagNo[];
  readonly arestas: readonly DagAresta[];
}

// ── Mapa de adjacência idempotente ───────────────────────────────────

/**
 * Constrói mapas de adjacência direta (`adj`) e reversa (`rev`) a partir
 * de um fluxo, usando `Set<string>` para que `ligar(A, B)` seja chamado
 * N vezes sem efeito colateral (idempotência garantida pelo `Set.add`).
 *
 * Arestas implícitas (derivadas de `config.entao`, `config.senao`, etc.)
 * são normalizadas junto com as explícitas no mesmo grafo.
 */
export function construirAdjacencia(flow: DagFlow): {
  adj: Map<string, Set<string>>;
  rev: Map<string, Set<string>>;
  porId: Map<string, DagNo>;
} {
  const ids = flow.nos.map((n) => n.id);
  const porId = new Map<string, DagNo>(flow.nos.map((n) => [n.id, n]));

  const adj = new Map<string, Set<string>>();
  const rev = new Map<string, Set<string>>();

  for (const id of ids) {
    adj.set(id, new Set<string>());
    rev.set(id, new Set<string>());
  }

  const ligar = (de: string, para: string): void => {
    if (porId.has(de) && porId.has(para) && de !== para) {
      adj.get(de)!.add(para);  // Set.add é idempotente
      rev.get(para)!.add(de);
    }
  };

  // 1) Arestas explícitas do array `flow.arestas`
  for (const a of flow.arestas) ligar(a.de, a.para);

  // 2) Arestas implícitas derivadas da config dos nós
  for (const no of flow.nos) {
    const c = (no.config ?? {}) as Record<string, unknown>;

    if (no.tipo === "condicao") {
      if (typeof c.entao === "string") ligar(no.id, c.entao);
      if (typeof c.senao === "string") ligar(no.id, c.senao);
    } else if (no.tipo === "decisao") {
      const opcoes = c.opcoes as readonly { proximo: string }[] | undefined;
      for (const o of opcoes ?? []) {
        if (typeof o.proximo === "string") ligar(no.id, o.proximo);
      }
    } else if (no.tipo === "loop") {
      if (typeof c.retornar_para === "string") ligar(no.id, c.retornar_para);
      if (typeof c.saida_final === "string") ligar(no.id, c.saida_final);
    }
  }

  return { adj, rev, porId };
}

// ── Alcançabilidade (BFS/DFS) ────────────────────────────────────────

/**
 * Retorna o conjunto de todos os nós alcançáveis a partir de `origem`
 * seguindo arestas diretas do grafo (sem incluir `origem` em si).
 */
export function alcancaveis(
  adj: ReadonlyMap<string, ReadonlySet<string>>,
  origem: string,
): Set<string> {
  const vis = new Set<string>();
  const pilha = [origem];

  while (pilha.length > 0) {
    const atual = pilha.pop()!;
    for (const prox of adj.get(atual) ?? []) {
      if (!vis.has(prox)) {
        vis.add(prox);
        pilha.push(prox);
      }
    }
  }

  return vis;
}

// ── Grau de entrada para barreira de junção ──────────────────────────

/**
 * Calcula o grau de entrada _efetivo_ de cada nó para fins de barreira
 * de junção (`join: "all"`).
 *
 * O grau de um nó N é o número de predecessores diretos de N que **não**
 * são alcançáveis a partir de N. Isso exclui back-edges de loop: um nó
 * de loop que retorna a um ponto anterior não conta como entrada de
 * junção — apenas ramos paralelos genuínos contam.
 *
 * **Correção crítica (Passo 1 da padronização):**
 * A versão anterior usava `string[]` (arrays) para adjacência, onde
 * `ligar(A, B)` chamado 2x inseria 2 entradas no array. Quando a aresta
 * A→B aparecia simultaneamente em `flow.arestas` E em `config.senao`,
 * o `rev[B]` ficava com `[A, A]`, resultando em `inDegree = 2` ao invés
 * de `1`. Agora com `Set<string>`, a inserção é automaticamente idempotente.
 *
 * @param flow - O fluxo com nós e arestas (contrato `DagFlow`)
 * @returns Map de `idNo → grau de entrada efetivo`
 */
export function grauEntradaJoin(flow: DagFlow): Map<string, number> {
  const { adj, rev } = construirAdjacencia(flow);

  const graus = new Map<string, number>();

  for (const no of flow.nos) {
    const desc = alcancaveis(adj, no.id);
    let grau = 0;

    for (const predecessor of rev.get(no.id) ?? []) {
      // Só conta predecessores que NÃO são descendentes do nó
      // (exclui back-edges de ciclos de loop)
      if (!desc.has(predecessor)) {
        grau += 1;
      }
    }

    graus.set(no.id, grau);
  }

  return graus;
}
