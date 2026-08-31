/**
 * Wizard de criação de empresa — modal fullscreen, 4 passos (estilo Stripe):
 *  1. Identidade (nome, id kebab-case, nicho, público, tom/tom_evitar em chips)
 *  2. Tipo (cards radio: Portal/Blog · Serviços · E-commerce · Genérica)
 *  3. Template + tópicos editoriais (3 sugeridos por tipo, editável)
 *  4. Revisão → POST /workspaces {id, perfil} → projeto.json no workspace
 *
 * Voltar preserva tudo (estado em memória do módulo).
 */

import { toast, icone, escapeHtml } from "../api.js";
import { ajuda } from "../help.js";

interface Perfil {
  empresa: string;
  id: string;
  idTocado?: boolean;
  nicho: string;
  publico: string;
  tom: string[];
  tomEvitar: string[];
  tipo: string;
  template: string;
  topicos: string[];
}

let passoAtual = 1;
let perfil: Perfil = perfilVazio();

function perfilVazio(): Perfil {
  return { empresa: '', id: '', idTocado: false, nicho: '', publico: '', tom: [], tomEvitar: [], tipo: 'portal', template: 'default', topicos: [] };
}

const TONS_SUGERIDOS = ['direto', 'jornalístico', 'técnico', 'acessível'];
const TONS_EVITAR_SUGERIDOS = ['clickbait', 'promessas exageradas', 'jargão sem explicação', 'linguagem robótica'];

const TIPOS: Array<{ id: string; label: string; desc: string; topicos: string[] }> = [
  { id: 'portal', label: 'Portal / Blog', desc: 'conteúdo recorrente, SEO, fila editorial', topicos: ['tendências do setor', 'guias práticos para o público', 'análises e casos de uso'] },
  { id: 'servicos', label: 'Prestador de serviços', desc: 'página de venda, provas sociais, captação', topicos: ['serviços e escopos', 'perguntas frequentes', 'cases e depoimentos'] },
  { id: 'ecommerce', label: 'E-commerce', desc: 'catálogo, produto, conversão', topicos: ['lançamentos e coleções', 'dicas de uso dos produtos', 'promoções e kits'] },
  { id: 'generica', label: 'Empresa genérica', desc: 'presença digital completa, sem foco único', topicos: ['sobre a empresa', 'novidades e avisos', 'conteúdo do setor'] },
];

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Abre o wizard (substitui o antigo modalPrompt de 1 campo) */
export function abrirWizard(): void {
  passoAtual = 1;
  perfil = perfilVazio();
  renderWizard();
}

function fecharWizard(): void {
  document.getElementById('wizard-overlay')?.remove();
}

function renderWizard(): void {
  fecharWizard();
  const overlay = document.createElement('div');
  overlay.id = 'wizard-overlay';
  overlay.className = 'wizard-overlay';
  overlay.innerHTML = `
    <div class="wizard-box" role="dialog" aria-modal="true" aria-label="Nova empresa">
      <div class="wizard-topo">
        <h2 class="wizard-titulo">${icone('spark')} Nova empresa ${ajuda('wizard-workspace')}</h2>
        <button class="btn-ghost text-xs" onclick="window.__wizFechar()" aria-label="Fechar wizard">✕</button>
      </div>
      <div class="wizard-progresso"><div class="wizard-progresso-barra" style="width:${(passoAtual / 4) * 100}%"></div></div>
      <div class="wizard-passos">Identidade · Tipo · Template · Revisão</div>
      <div class="wizard-corpo" id="wizard-corpo"></div>
      <div class="wizard-acoes" id="wizard-acoes"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  renderPasso();
}

function renderPasso(): void {
  const corpo = document.getElementById('wizard-corpo');
  const acoes = document.getElementById('wizard-acoes');
  const barra = document.querySelector('.wizard-progresso-barra') as HTMLElement | null;
  if (barra) barra.style.width = `${(passoAtual / 4) * 100}%`;
  if (!corpo || !acoes) return;

  const chips = (valores: string[], selecionados: string[], fn: string) => `
    <div class="wiz-chips">
      ${valores.map((v) => `<button class="chip ${selecionados.includes(v) ? 'chip-ativo' : ''}" onclick="${fn}('${escapeHtml(v)}')">${escapeHtml(v)}</button>`).join('')}
    </div>`;

  const topicosSugeridos = TIPOS.find((t) => t.id === perfil.tipo)?.topicos ?? [];

  if (passoAtual === 1) {
    corpo.innerHTML = `
      <label class="modal-label" for="wiz-nome">Nome da empresa</label>
      <input id="wiz-nome" value="${escapeHtml(perfil.empresa)}" placeholder="ex.: Empório Aurora" oninput="window.__wizNome(this.value)"/>
      <label class="modal-label" for="wiz-id">ID (kebab-case, editável)</label>
      <input id="wiz-id" value="${escapeHtml(perfil.id)}" placeholder="ex.: emporio-aurora" oninput="window.__wizId(this.value)"/>
      <div class="wiz-erro ${ID_RE.test(perfil.id) || !perfil.id ? 'hidden' : ''}" id="wiz-erro-id">use letras minúsculas, números e hífens</div>
      <label class="modal-label" for="wiz-nicho">Nicho (o que a empresa faz)</label>
      <textarea id="wiz-nicho" rows="2" placeholder="ex.: empório gourmet artesanal — cafés, queijos, presentes" oninput="window.__wizCampo('nicho', this.value)">${escapeHtml(perfil.nicho)}</textarea>
      <label class="modal-label" for="wiz-publico">Público-alvo</label>
      <input id="wiz-publico" value="${escapeHtml(perfil.publico)}" placeholder="ex.: consumidores que valorizam artesanato" oninput="window.__wizCampo('publico', this.value)"/>
      <label class="modal-label">Tom de voz ${chips(TONS_SUGERIDOS, perfil.tom, '__wizToggleTom')}</label>
      <label class="modal-label">Tom a evitar ${chips(TONS_EVITAR_SUGERIDOS, perfil.tomEvitar, '__wizToggleEvitar')}</label>
    `;
    acoes.innerHTML = `
      <button class="btn btn-ghost" onclick="window.__wizFechar()">Cancelar</button>
      <button class="btn" onclick="window.__wizAvancar()">Continuar →</button>
    `;
  } else if (passoAtual === 2) {
    corpo.innerHTML = `
      <div class="wiz-tipos">
        ${TIPOS.map((t) => `
          <button class="wiz-tipo ${perfil.tipo === t.id ? 'ativo' : ''}" onclick="window.__wizTipo('${t.id}')">
            <b>${escapeHtml(t.label)}</b>
            <small>${escapeHtml(t.desc)}</small>
          </button>`).join('')}
      </div>
    `;
    acoes.innerHTML = `
      <button class="btn btn-ghost" onclick="window.__wizVoltar()">← Voltar</button>
      <button class="btn" onclick="window.__wizAvancar()">Continuar →</button>
    `;
  } else if (passoAtual === 3) {
    corpo.innerHTML = `
      <label class="modal-label" for="wiz-template">Template</label>
      <select id="wiz-template" onchange="window.__wizCampo('template', this.value)">
        <option value="default" selected>default — executor-padrao, critico-site, corretor-site, editor, ceo-documentos, auditor, secretário…</option>
      </select>
      <p class="wiz-dica">O template traz a papelaria completa: agentes, specs de ferramentas e configuração base.</p>
      <label class="modal-label" for="wiz-topicos">Tópicos editoriais (1 por linha — sugeridos pelo tipo)</label>
      <textarea id="wiz-topicos" rows="4" oninput="window.__wizTopicos(this.value)">${escapeHtml(perfil.topicos.length ? perfil.topicos.join('\n') : topicosSugeridos.join('\n'))}</textarea>
    `;
    acoes.innerHTML = `
      <button class="btn btn-ghost" onclick="window.__wizVoltar()">← Voltar</button>
      <button class="btn" onclick="window.__wizAvancar()">Revisar →</button>
    `;
    if (!perfil.topicos.length) perfil.topicos = [...topicosSugeridos];
  } else {
    const tipo = TIPOS.find((t) => t.id === perfil.tipo);
    corpo.innerHTML = `
      <div class="wiz-revisao">
        <div><small>Empresa</small><b>${escapeHtml(perfil.empresa || '—')}</b></div>
        <div><small>ID</small><b class="font-mono">${escapeHtml(perfil.id || '—')}</b></div>
        <div><small>Nicho</small><b>${escapeHtml(perfil.nicho || '—')}</b></div>
        <div><small>Público</small><b>${escapeHtml(perfil.publico || '—')}</b></div>
        <div><small>Tom</small><b>${escapeHtml(perfil.tom.join(', ') || '—')}</b></div>
        <div><small>Evitar</small><b>${escapeHtml(perfil.tomEvitar.join(', ') || '—')}</b></div>
        <div><small>Tipo</small><b>${escapeHtml(tipo?.label ?? perfil.tipo)}</b></div>
        <div><small>Template</small><b class="font-mono">${escapeHtml(perfil.template)}</b></div>
        <div><small>Tópicos</small><b>${escapeHtml(perfil.topicos.join(' · ') || '—')}</b></div>
      </div>
      <p class="wiz-dica">Grava <code>.opencorp/projeto.json</code> no workspace — é o que guia editor e crítico.</p>
    `;
    acoes.innerHTML = `
      <button class="btn btn-ghost" onclick="window.__wizVoltar()">← Voltar</button>
      <button class="btn" id="wiz-criar" onclick="window.__wizCriar()">${icone('spark')} Criar empresa</button>
    `;
  }
}

function toggle(arr: string[], v: string): void {
  const i = arr.indexOf(v);
  if (i >= 0) arr.splice(i, 1);
  else arr.push(v);
}

async function avancar(): Promise<void> {
  if (passoAtual === 1) {
    if (!perfil.empresa.trim()) { toast('Dê um nome à empresa', 'aviso'); return; }
    if (!ID_RE.test(perfil.id)) { toast('ID inválido — use kebab-case (ex.: minha-empresa)', 'erro'); return; }
  }
  if (passoAtual === 3) {
    perfil.topicos = perfil.topicos.map((t) => t.trim()).filter(Boolean);
  }
  passoAtual = Math.min(4, passoAtual + 1);
  renderPasso();
}

function voltar(): void {
  passoAtual = Math.max(1, passoAtual - 1);
  renderPasso();
}

async function criar(): Promise<void> {
  const btn = document.getElementById('wiz-criar') as HTMLButtonElement | null;
  if (!btn) return;
  btn.disabled = true;
  btn.innerHTML = `${icone('run')} Criando…`;

  try {
    const { api } = await import("../api.js");
    const { setWsAtivo } = await import("../state.js");
    const { navegar } = await import("../router.js");
    const { renderView } = await import("../main.js");

    await api('/workspaces', {
      method: 'POST',
      body: JSON.stringify({
        id: perfil.id,
        perfil: {
          empresa: perfil.empresa,
          nicho: perfil.nicho,
          publico: perfil.publico,
          tom: perfil.tom.join(', '),
          tom_evitar: perfil.tomEvitar,
          topicos: perfil.topicos,
        },
      }),
    });

    fecharWizard();
    setWsAtivo(perfil.id);
    navegar('tasks');
    renderView();
    toast(`Empresa "${perfil.empresa}" criada — template ${perfil.template} instalado. Próximo: rode um agente ou agende a primeira rotina.`, 'ok');
  } catch (e) {
    toast('Erro ao criar: ' + (e as Error).message, 'erro');
    btn.disabled = false;
    btn.innerHTML = `${icone('spark')} Criar empresa`;
  }
}

/** Instala os globais (chamar uma vez no boot) */
export function exporWizard(): void {
  const g = window as unknown as Record<string, unknown>;
  g.abrirWizard = abrirWizard;
  g.__wizFechar = fecharWizard;
  g.__wizNome = (v: string) => {
    perfil.empresa = v;
    const idInput = document.getElementById('wiz-id') as HTMLInputElement | null;
    if (idInput && !perfil.idTocado) {
      perfil.id = slugify(v);
      idInput.value = perfil.id;
    }
    const erro = document.getElementById('wiz-erro-id');
    if (erro) erro.classList.toggle('hidden', !perfil.id || ID_RE.test(perfil.id));
  };
  g.__wizId = (v: string) => {
    perfil.id = v;
    perfil.idTocado = true;
    const erro = document.getElementById('wiz-erro-id');
    if (erro) erro.classList.toggle('hidden', !v || ID_RE.test(v));
  };
  g.__wizCampo = (campo: 'nicho' | 'publico' | 'template', v: string) => { perfil[campo] = v; };
  g.__wizToggleTom = (v: string) => { toggle(perfil.tom, v); renderPasso(); };
  g.__wizToggleEvitar = (v: string) => { toggle(perfil.tomEvitar, v); renderPasso(); };
  g.__wizTipo = (id: string) => {
    perfil.tipo = id;
    perfil.topicos = [...(TIPOS.find((t) => t.id === id)?.topicos ?? [])];
    renderPasso();
  };
  g.__wizTopicos = (v: string) => { perfil.topicos = v.split('\n'); };
  g.__wizAvancar = () => { void avancar(); };
  g.__wizVoltar = voltar;
  g.__wizCriar = () => { void criar(); };
}
