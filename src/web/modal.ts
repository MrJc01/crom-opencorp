/**
 * Modais no lugar de prompt()/confirm() nativos.
 * API: modalPrompt({titulo, label?, placeholder?, valor?, multiline?, obrigatorio?, textoOk?}) → Promise<string|null>
 *      modalConfirm(msg, {titulo?, confirmar?}) → Promise<boolean>
 * Cancelar (Esc, backdrop, botão) resolve null/false. Enter confirma. Foco no campo ao abrir.
 * Acessível (role=dialog, aria-modal, aria-label). Título/label são strings nossas;
 * valores digitados entram via .value (nunca innerHTML).
 */

let modalAberto: HTMLElement | null = null;
let resolverCancelamento: (() => void) | null = null;

function fecharModal(): void {
  modalAberto?.remove();
  modalAberto = null;
  const r = resolverCancelamento;
  resolverCancelamento = null;
  r?.();
}

let escInstalado = false;
function instalarEsc(): void {
  if (escInstalado) return;
  escInstalado = true;
  document.addEventListener('keydown', ev => {
    if (modalAberto && ev.key === 'Escape') fecharModal();
  });
}

interface ModalPromptOpts {
  titulo: string;
  label?: string;
  placeholder?: string;
  valor?: string;
  multiline?: boolean;
  obrigatorio?: boolean;
  textoOk?: string;
}

interface ModalConfirmOpts {
  titulo?: string;
  confirmar?: string;
}

function criarEstrutura(titulo: string, textoOk: string): HTMLDivElement {
  fecharModal();
  resolverCancelamento = null;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'presentation');

  const box = document.createElement('div');
  box.className = 'modal-box';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', titulo);

  box.innerHTML = `
    <h2 class="modal-titulo">${titulo}</h2>
    <div class="modal-corpo"></div>
    <div class="modal-acoes">
      <button type="button" class="btn btn-ghost modal-cancelar" aria-label="Cancelar">Cancelar</button>
      <button type="button" class="btn modal-ok" aria-label="${textoOk}">${textoOk}</button>
    </div>
  `;

  overlay.appendChild(box);
  overlay.addEventListener('mousedown', ev => {
    if (ev.target === overlay) fecharModal();
  });

  document.body.appendChild(overlay);
  modalAberto = overlay;

  box.querySelector('.modal-cancelar')!.addEventListener('click', () => fecharModal());
  instalarEsc();

  return box;
}

/** Modal de entrada de texto — substitui prompt() nativo. Resolve null ao cancelar. */
export function modalPrompt(opts: ModalPromptOpts): Promise<string | null> {
  return new Promise(resolve => {
    const box = criarEstrutura(opts.titulo, opts.textoOk || 'OK');
    resolverCancelamento = () => resolve(null);

    const corpo = box.querySelector('.modal-corpo') as HTMLDivElement;
    let campo: HTMLInputElement | HTMLTextAreaElement;

    if (opts.multiline) {
      corpo.innerHTML = `
        ${opts.label ? `<label class="modal-label" for="modal-campo">${opts.label}</label>` : ''}
        <textarea id="modal-campo" class="modal-campo" rows="4" placeholder="${opts.placeholder || ''}"></textarea>
      `;
      campo = corpo.querySelector('#modal-campo') as HTMLTextAreaElement;
    } else {
      corpo.innerHTML = `
        ${opts.label ? `<label class="modal-label" for="modal-campo">${opts.label}</label>` : ''}
        <input id="modal-campo" class="modal-campo" placeholder="${opts.placeholder || ''}"/>
      `;
      campo = corpo.querySelector('#modal-campo') as HTMLInputElement;
    }

    if (opts.valor) campo.value = opts.valor;

    const ok = box.querySelector('.modal-ok') as HTMLButtonElement;

    function confirmar(): void {
      const v = campo.value;
      if (opts.obrigatorio && !v.trim()) {
        campo.focus();
        return;
      }
      resolverCancelamento = null;
      fecharModal();
      resolve(v);
    }

    ok.addEventListener('click', confirmar);
    campo.addEventListener('keydown', ev => {
      if ((ev as KeyboardEvent).key === 'Enter' && !opts.multiline) confirmar();
    });

    setTimeout(() => campo.focus(), 0);
  });
}

/** Modal de confirmação — substitui confirm() nativo. Resolve false ao cancelar. */
export function modalConfirm(msg: string, opts?: ModalConfirmOpts): Promise<boolean> {
  return new Promise(resolve => {
    const box = criarEstrutura(opts?.titulo || 'Confirmação', opts?.confirmar || 'Confirmar');
    resolverCancelamento = () => resolve(false);

    const corpo = box.querySelector('.modal-corpo') as HTMLDivElement;
    corpo.innerHTML = `<p class="modal-msg">${msg}</p>`;

    const ok = box.querySelector('.modal-ok') as HTMLButtonElement;
    ok.addEventListener('click', () => {
      resolverCancelamento = null;
      fecharModal();
      resolve(true);
    });

    setTimeout(() => ok.focus(), 0);
  });
}
