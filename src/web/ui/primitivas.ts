/**
 * Primitivas de UI reutilizáveis (PLANO-PAINEL-V2 — Etapa 0.1).
 *
 * Decisão de design (Etapa 0.1 do plano): copiar os PADRÕES do Preline
 * (drawer/overlay, dropdown/position flip, tabs) sem adotar o bundle —
 * o painel já tem Tailwind v4 + DaisyUI 5 como design system, e estas
 * primitivas em TS vanilla pesam ~150 linhas em vez de um bundle externo.
 *
 * Funções puras (posicaoMenu) ficam separadas do glue de DOM para serem
 * testáveis sem jsdom (ver tests/web-primitivas.test.ts).
 */

/** Posição calculada para um menu/dropdown contextual. */
export interface PosicaoMenu {
  left: number;
  top: number;
}

/**
 * Calcula a posição de um menu contextual com flip nas bordas da janela
 * (padrão Dropdown do Preline): se o menu estourar à direita/abaixo,
 * abre para a esquerda/acima. Sempre respeita a margem mínima.
 * Pure — sem DOM.
 */
export function posicaoMenu(
  x: number,
  y: number,
  larguraMenu: number,
  alturaMenu: number,
  larguraJanela: number,
  alturaJanela: number,
  margem = 8,
): PosicaoMenu {
  const cabeDireita = x + larguraMenu + margem <= larguraJanela;
  const cabeBaixo = y + alturaMenu + margem <= alturaJanela;
  const esquerda = Math.max(margem, cabeDireita ? x : x - larguraMenu);
  const topo = Math.max(margem, cabeBaixo ? y : y - alturaMenu);
  // Garante que o menu nunca saia da janela nem fique menor que a margem
  const maxEsq = Math.max(margem, larguraJanela - larguraMenu - margem);
  const maxTopo = Math.max(margem, alturaJanela - alturaMenu - margem);
  return { left: Math.min(esquerda, maxEsq), top: Math.min(topo, maxTopo) };
}

/**
 * Oculta a scrollbar de um elemento mantendo a rolagem funcionando
 * (P-16: navbar/chats sem scrollbars visíveis — padrão VS Code/ChatGPT).
 */
export function ocultarScrollbar(el: HTMLElement): void {
  el.classList.add('scrollbar-none');
}

/** Controlador de drawer lateral direito (padrão Overlay do Preline, sem dependência). */
export interface ControladorDrawer {
  abrir(): void;
  fechar(): void;
  alternar(): void;
  aberto(): boolean;
}

/**
 * Cria um controlador de drawer reutilizável: alterna classes `.open`
 * no painel e no overlay, fecha com Escape e devolve estado consultável.
 * Reuso previsto: chat lateral (Etapa 1), terminais/preview (Etapa 3).
 */
export function criarControladorDrawer(
  painel: HTMLElement,
  overlay: HTMLElement | null,
  aoFechar?: () => void,
): ControladorDrawer {
  const aplicar = (abrir: boolean): void => {
    painel.classList.toggle('open', abrir);
    overlay?.classList.toggle('open', abrir);
  };
  const aoTeclar = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') controlador.fechar();
  };
  const controlador: ControladorDrawer = {
    abrir: () => {
      aplicar(true);
      document.addEventListener('keydown', aoTeclar);
    },
    fechar: () => {
      const estavaAberto = painel.classList.contains('open');
      aplicar(false);
      document.removeEventListener('keydown', aoTeclar);
      if (estavaAberto) aoFechar?.();
    },
    alternar: () => {
      if (painel.classList.contains('open')) controlador.fechar();
      else controlador.abrir();
    },
    aberto: () => painel.classList.contains('open'),
  };
  return controlador;
}

/** Definição de uma aba (usado por criarTabs — terminais na Etapa 3). */
export interface Aba {
  id: string;
  rotulo: string;
}

/**
 * Renderiza uma barra de tabs (padrão Tabs do Preline) dentro do container
 * e devolve a função para trocar a aba programaticamente. role="tab" básico;
 * tablist/setas/aria-controls completam quando as tabs virarem produto
 * (terminais, Etapa 3). O conteúdo é responsabilidade do caller.
 */
export function criarTabs(
  container: HTMLElement,
  abas: Aba[],
  aoTrocar: (id: string) => void,
  inicial?: string,
): (id: string) => void {
  container.innerHTML = '';
  const ativaInicial = inicial ?? abas[0]?.id ?? '';
  const botoes = new Map<string, HTMLButtonElement>();
  for (const aba of abas) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ui-tab' + (aba.id === ativaInicial ? ' ui-tab-ativa' : '');
    b.textContent = aba.rotulo;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(aba.id === ativaInicial));
    b.onclick = () => trocar(aba.id);
    botoes.set(aba.id, b);
    container.appendChild(b);
  }
  function trocar(id: string): void {
    for (const [abaId, b] of botoes) {
      const ativa = abaId === id;
      b.classList.toggle('ui-tab-ativa', ativa);
      b.setAttribute('aria-selected', String(ativa));
    }
    aoTrocar(id);
  }
  return trocar;
}
