import { type Component, For, Show } from "solid-js";

export interface NoFluxograma {
  id: string;
  tipo: string;
  agente?: string | null;
  status: string;
  exec_id: string | null;
}

export interface ArestaFluxograma {
  de: string;
  para: string;
  rotulo?: string;
}

interface NoLayout extends NoFluxograma {
  x: number;
  y: number;
  coluna: number;
}

const LARG_NO = 208;
const ALT_NO = 66;
const GAP_X = 72;
const GAP_Y = 18;
const PAD = 16;

function corStatus(status: string): { borda: string; fundo: string; texto: string; ponto: string } {
  switch (status) {
    case "ok":
      return { borda: "#065f46", fundo: "#0a0f0d", texto: "#6ee7b7", ponto: "#34d399" };
    case "falhou":
      return { borda: "#881337", fundo: "#14090c", texto: "#fda4af", ponto: "#fb7185" };
    case "executando":
      return { borda: "#3730a3", fundo: "#0d0d1a", texto: "#a5b4fc", ponto: "#818cf8" };
    default:
      return { borda: "#3f3f46", fundo: "#0c0c0e", texto: "#a1a1aa", ponto: "#71717a" };
  }
}

function rotuloStatus(status: string): string {
  if (status === "ok") return "ok";
  if (status === "falhou") return "falhou";
  if (status === "executando") return "executando";
  if (status === "skip") return "pulado";
  return "não executado";
}

/**
 * Layout em camadas (colunas) por profundidade BFS a partir das raízes
 * (nós sem aresta de entrada). Ciclos/back-edges não quebram o layout:
 * nós já visitados mantém a coluna, e a seta indica a direção real.
 */
function calcularLayout(
  nos: NoFluxograma[],
  arestas: ArestaFluxograma[]
): { nos: NoLayout[]; largura: number; altura: number } {
  const ids = new Set(nos.map((n) => n.id));
  const valido = arestas.filter((a) => ids.has(a.de) && ids.has(a.para));
  const entradas = new Map<string, string[]>();
  for (const n of nos) entradas.set(n.id, []);
  for (const a of valido) entradas.get(a.para)!.push(a.de);

  const coluna = new Map<string, number>();
  const fila: Array<{ id: string; col: number }> = nos
    .filter((n) => (entradas.get(n.id) ?? []).length === 0)
    .map((n) => ({ id: n.id, col: 0 }));
  // Grafo só de ciclo (sem raiz): ancora o primeiro nó na coluna 0
  if (fila.length === 0 && nos.length > 0) fila.push({ id: nos[0]!.id, col: 0 });
  const visitados = new Set<string>();
  while (fila.length > 0) {
    const { id, col } = fila.shift()!;
    if (visitados.has(id)) continue;
    visitados.add(id);
    coluna.set(id, Math.max(coluna.get(id) ?? 0, col));
    for (const a of valido) {
      if (a.de === id && !visitados.has(a.para)) fila.push({ id: a.para, col: (coluna.get(id) ?? 0) + 1 });
    }
  }
  for (const n of nos) if (!coluna.has(n.id)) coluna.set(n.id, 0);

  const porColuna = new Map<number, NoFluxograma[]>();
  for (const n of nos) {
    const c = coluna.get(n.id) ?? 0;
    if (!porColuna.has(c)) porColuna.set(c, []);
    porColuna.get(c)!.push(n);
  }
  const maxCol = porColuna.size > 0 ? Math.max(...porColuna.keys()) : 0;
  const maxLinhas = porColuna.size > 0 ? Math.max(...[...porColuna.values()].map((v) => v.length)) : 0;

  const nosLayout: NoLayout[] = [];
  for (const [c, lista] of porColuna) {
    lista.forEach((n, i) => {
      nosLayout.push({ ...n, x: PAD + c * (LARG_NO + GAP_X), y: PAD + i * (ALT_NO + GAP_Y), coluna: c });
    });
  }
  void maxCol;
  return {
    nos: nosLayout,
    largura: PAD * 2 + (porColuna.size > 0 ? porColuna.size * LARG_NO + (porColuna.size - 1) * GAP_X : LARG_NO),
    altura: PAD * 2 + (maxLinhas > 0 ? maxLinhas * ALT_NO + (maxLinhas - 1) * GAP_Y : ALT_NO),
  };
}

function escapar(s: string): string {
  return s.length > 26 ? s.slice(0, 25) + "…" : s;
}

export const FlowChart: Component<{
  nos: NoFluxograma[];
  arestas: ArestaFluxograma[];
  onAbrirExec?: (execId: string) => void;
}> = (props) => {
  const layout = () => {
    const ids = new Set(props.nos.map((n) => n.id));
    return calcularLayout(
      props.nos,
      props.arestas.filter((a) => ids.has(a.de) && ids.has(a.para))
    );
  };
  const porId = () => new Map(layout().nos.map((n) => [n.id, n]));

  return (
    <div class="overflow-x-auto scrollbar-thin rounded-xl border border-zinc-800/80 bg-zinc-950/40">
      <svg
        width={Math.max(layout().largura, 320)}
        height={layout().altura}
        viewBox={`0 0 ${layout().largura} ${layout().altura}`}
        class="block min-w-full"
        role="img"
        aria-label="Fluxograma da execução"
      >
        <defs>
          <marker id="fc-seta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#52525b" />
          </marker>
        </defs>
        {/* Arestas */}
        <For each={props.arestas.filter((a) => porId().has(a.de) && porId().has(a.para))}>
          {(a) => {
            const de = porId().get(a.de)!;
            const para = porId().get(a.para)!;
            const x1 = de.x + LARG_NO;
            const y1 = de.y + ALT_NO / 2;
            const x2 = para.x;
            const y2 = para.y + ALT_NO / 2;
            const mx = (x1 + x2) / 2;
            const indoParaTras = x2 <= x1;
            return (
              <g>
                <path
                  d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2 - 2} ${y2}`}
                  fill="none"
                  stroke={indoParaTras ? "#71717a" : "#52525b"}
                  stroke-width={indoParaTras ? 1.6 : 1.3}
                  stroke-dasharray={indoParaTras ? "5 3" : undefined}
                  marker-end="url(#fc-seta)"
                />
                <Show when={a.rotulo}>
                  <text x={mx} y={Math.min(y1, y2) - 5} fill="#a1a1aa" font-size="9" font-family="monospace" text-anchor="middle">
                    {a.rotulo}
                  </text>
                </Show>
              </g>
            );
          }}
        </For>
        {/* Nós */}
        <For each={layout().nos}>
          {(n) => {
            const c = corStatus(n.status);
            const clicavel = !!n.exec_id;
            return (
              <g
                onClick={() => n.exec_id && props.onAbrirExec?.(n.exec_id)}
                style={clicavel ? { cursor: "pointer" } : undefined}
              >
                <title>{`${n.id} · ${n.tipo}${n.agente ? ` · @${n.agente}` : ""} · ${rotuloStatus(n.status)}${n.exec_id ? ` · ${n.exec_id} (clique para abrir o chat)` : ""}`}</title>
                <rect
                  x={n.x}
                  y={n.y}
                  width={LARG_NO}
                  height={ALT_NO}
                  rx="10"
                  fill={c.fundo}
                  stroke={c.borda}
                  stroke-width="1.5"
                />
                <circle cx={n.x + 14} cy={n.y + 16} r="4.5" fill={c.ponto}>
                  <Show when={n.status === "executando"}>
                    <animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite" />
                  </Show>
                </circle>
                <text x={n.x + 26} y={n.y + 20} fill="#e4e4e7" font-size="11" font-weight="bold" font-family="monospace">
                  {escapar(n.id)}
                </text>
                <text x={n.x + 14} y={n.y + 38} fill={c.texto} font-size="10.5" font-family="monospace">
                  {escapar(n.agente ? `@${n.agente}` : n.tipo)}
                </text>
                <text x={n.x + 14} y={n.y + 53} fill="#71717a" font-size="9" font-family="monospace">
                  {escapar(n.tipo)}{n.exec_id ? ` · ${rotuloStatus(n.status)} ›` : ` · ${rotuloStatus(n.status)}`}
                </text>
              </g>
            );
          }}
        </For>
      </svg>
    </div>
  );
};
