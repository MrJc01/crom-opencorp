/**
 * Menu de contexto (right-click) — PLANO-PAINEL-V2 Etapa 2.5 (P-21 base).
 * Listener delegado em document:
 *   alvo `.task-card`    → Ver detalhes / Copiar título / Excluir
 *   alvo `.tree-arquivo` → Abrir / Enviar como contexto @ / Copiar caminho (Etapa 3)
 */

import { toast } from "./api.js";
import { posicaoMenu } from "./ui/primitivas.js";
import { setRascunho, getRascunho } from "./rascunho.js";
import { abrirChatLateral } from "./chat-lateral.js";

interface ItemCtx {
  rotulo: string;
  perigoso?: boolean;
  acao: () => void;
}

let menuEl: HTMLElement | null = null;
let aoForaFn: ((ev: MouseEvent) => void) | null = null;
let aoEscFn: ((ev: KeyboardEvent) => void) | null = null;
let aoScrollFn: (() => void) | null = null;

/** Registra o listener global de contextmenu (chamado 1× no boot). */
export function registrarMenuContexto(): void {
  document.addEventListener('contextmenu', (ev: MouseEvent) => {
    const alvo = ev.target as HTMLElement | null;
    const arquivo = alvo?.closest?.('.tree-arquivo') as HTMLElement | null;
    const card = alvo?.closest?.('.task-card') as HTMLElement | null;
    if (!arquivo && !card) {
      fecharMenuContexto();
      return;
    }
    ev.preventDefault();
    if (arquivo) abrirMenuCtxArquivo(ev.clientX, ev.clientY, arquivo.dataset.path ?? '');
    else abrirMenuCtx(ev.clientX, ev.clientY, card!);
  });
}

export function fecharMenuContexto(): void {
  if (aoForaFn) document.removeEventListener('mousedown', aoForaFn);
  if (aoEscFn) document.removeEventListener('keydown', aoEscFn);
  if (aoScrollFn) window.removeEventListener('scroll', aoScrollFn, true);
  aoForaFn = null;
  aoEscFn = null;
  aoScrollFn = null;
  menuEl?.remove();
  menuEl = null;
}

/** Menu para nós de ARQUIVO da árvore do Workspace (Etapa 3). */
function abrirMenuCtxArquivo(x: number, y: number, caminho: string): void {
  if (!caminho) return;
  fecharMenuContexto();

  const itens: ItemCtx[] = [
    {
      rotulo: 'Abrir',
      acao: () => {
        void import('./views/workspace.js').then((m) => m.abrirArquivo(caminho));
      },
    },
    {
      rotulo: 'Enviar como contexto @',
      acao: () => {
        // o usuário vê o @ pronto no drawer lateral (rascunho é a fonte única)
        setRascunho('@' + caminho);
        abrirChatLateral();
        const ta = document.getElementById('lat-input') as HTMLTextAreaElement | null;
        if (ta) ta.value = getRascunho();
      },
    },
    {
      rotulo: 'Copiar caminho',
      acao: () => {
        void navigator.clipboard.writeText(caminho).then(() => toast('Caminho copiado', 'ok'));
      },
    },
  ];

  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  menu.setAttribute('role', 'menu');
  for (const item of itens) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'palette-item' + (item.perigoso ? ' perigoso' : '');
    btn.setAttribute('role', 'menuitem');
    btn.textContent = item.rotulo;
    btn.addEventListener('click', () => {
      fecharMenuContexto();
      item.acao();
    });
    menu.appendChild(btn);
  }
  document.body.appendChild(menu);

  const pos = posicaoMenu(x, y, 210, itens.length * 34 + 8, window.innerWidth, window.innerHeight);
  menu.style.left = pos.left + 'px';
  menu.style.top = pos.top + 'px';
  menuEl = menu;

  aoForaFn = (ev: MouseEvent) => {
    if (menuEl && ev.target instanceof Node && menuEl.contains(ev.target)) return;
    fecharMenuContexto();
  };
  aoEscFn = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') fecharMenuContexto();
  };
  aoScrollFn = () => fecharMenuContexto();
  document.addEventListener('mousedown', aoForaFn);
  document.addEventListener('keydown', aoEscFn);
  window.addEventListener('scroll', aoScrollFn, true);
}

function abrirMenuCtx(x: number, y: number, card: HTMLElement): void {
  fecharMenuContexto();

  const taskId = card.dataset.taskId ?? '';
  const titulo = card.querySelector('.task-title')?.textContent?.trim() ?? taskId;
  const itens: ItemCtx[] = [
    {
      rotulo: 'Ver detalhes',
      acao: () => card.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    },
    {
      rotulo: 'Copiar título',
      acao: () => {
        void navigator.clipboard.writeText(titulo).then(() => toast('Título copiado', 'ok'));
      },
    },
    {
      rotulo: 'Excluir',
      perigoso: true,
      acao: () => {
        (window as unknown as { excluirTask?: (id?: string) => Promise<void> }).excluirTask?.(taskId);
      },
    },
  ];

  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  menu.setAttribute('role', 'menu');
  for (const item of itens) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'palette-item' + (item.perigoso ? ' perigoso' : '');
    btn.setAttribute('role', 'menuitem');
    btn.textContent = item.rotulo;
    btn.addEventListener('click', () => {
      fecharMenuContexto();
      item.acao();
    });
    menu.appendChild(btn);
  }
  document.body.appendChild(menu);

  const pos = posicaoMenu(x, y, 210, itens.length * 34 + 8, window.innerWidth, window.innerHeight);
  menu.style.left = pos.left + 'px';
  menu.style.top = pos.top + 'px';
  menuEl = menu;

  aoForaFn = (ev: MouseEvent) => {
    if (menuEl && ev.target instanceof Node && menuEl.contains(ev.target)) return;
    fecharMenuContexto();
  };
  aoEscFn = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') fecharMenuContexto();
  };
  aoScrollFn = () => fecharMenuContexto();
  document.addEventListener('mousedown', aoForaFn);
  document.addEventListener('keydown', aoEscFn);
  window.addEventListener('scroll', aoScrollFn, true);
}
