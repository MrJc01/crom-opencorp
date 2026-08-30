/**
 * View Apps — Mini-apps com widgets.
 * Mantém contratos: renderWidget, loadAppsList, abrirApp, enviarForm
 */

import { api, toast, icone, escapeHtml } from "../api.js";

interface WidgetSpec {
  id: string;
  titulo: string;
  tipo: string;
  fonte?: { rota?: string; rotulo_campo?: string; campo_valor?: string };
  acao?: { tipo?: string; campos?: Array<{ nome: string; rotulo?: string }> };
  texto?: string;
  paginas?: unknown[];
}

interface AppSpec {
  id: string;
  titulo: string;
  paginas: Array<{
    titulo?: string;
    widgets: WidgetSpec[];
  }>;
}

interface AppInfo {
  id: string;
  titulo: string;
  widgets: number;
}

/** Renderiza a view Apps (lista) */
export async function renderApps(): Promise<void> {
  const viewEl = document.getElementById('view-apps');
  if (!viewEl) return;

  viewEl.innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold flex items-center gap-2">${icone('apps')} Mini-apps</h1>
    </div>
    <div id="apps-lista" class="apps-grid"></div>
    <div id="app-view" class="hidden"></div>
  `;

  await loadAppsList();
}

/** Carrega lista de apps — FUNÇÃO EXPOSTA GLOBALMENTE para testes cegos */
export async function loadAppsList(): Promise<void> {
  const lista = await api<AppInfo[]>('/apps').catch(() => []);
  const el = document.getElementById('apps-lista');
  if (!el) return;

  if (!Array.isArray(lista) || !lista.length) {
    el.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">' + icone('apps') + '</div><div class="empty-title">Nenhum mini-app</div><div class="empty-desc">Instale com: <code>opencorp app seed painel-tarefas</code> ou crie via <code>POST /apps</code>.</div></div>';
    return;
  }

  el.innerHTML = lista.map(a => `
    <div class="app-card" onclick="abrirApp('${escapeHtml(a.id)}')">
      <div class="app-title">${escapeHtml(a.titulo)}</div>
      <div class="app-meta">${escapeHtml(a.id)} · ${a.widgets} widget(s)</div>
    </div>
  `).join('');
}

/** Abre detalhe de um app — FUNÇÃO EXPOSTA GLOBALMENTE */
export async function abrirApp(id: string): Promise<void> {
  const listaEl = document.getElementById('apps-lista');
  const viewEl = document.getElementById('app-view');
  if (!listaEl || !viewEl) return;

  listaEl.classList.add('hidden');
  const spec = await api<AppSpec>('/apps/' + id + '/spec');
  viewEl.classList.remove('hidden');
  viewEl.innerHTML = `
    <div class="flex items-center gap-3 mb-6">
      <button class="btn btn-ghost" onclick="fecharApp()">← Voltar</button>
      <h2 class="font-semibold">${escapeHtml(spec.titulo)}</h2>
    </div>
    <div class="widget-grid" id="widgets-container"></div>
  `;

  const container = document.getElementById('widgets-container');
  if (!container) return;

  for (const pagina of spec.paginas || []) {
    if (spec.paginas.length > 1) {
      const h3 = document.createElement('h3');
      h3.className = 'text-sm text-zinc-500 mb-2';
      h3.textContent = String(pagina.titulo || '');
      container.appendChild(h3);
    }
    const grid = document.createElement('div');
    grid.className = 'widget-grid';
    container.appendChild(grid);
    for (const w of pagina.widgets || []) {
      grid.appendChild(await renderWidget(w));
    }
  }
}

/** Fecha view de app e volta para lista — FUNÇÃO EXPOSTA GLOBALMENTE */
export function fecharApp(): void {
  const viewEl = document.getElementById('app-view');
  const listaEl = document.getElementById('apps-lista');
  if (!viewEl || !listaEl) return;

  viewEl.classList.add('hidden');
  viewEl.innerHTML = '';
  listaEl.classList.remove('hidden');
}

/** Busca dados para um widget */
async function dadosWidget(w: WidgetSpec): Promise<unknown> {
  if (!w.fonte || !w.fonte.rota) return null;
  try {
    const d = await api(w.fonte.rota);
    return Array.isArray(d) ? d : d;
  } catch {
    return null;
  }
}

/** Renderiza um widget — FUNÇÃO EXPOSTA GLOBALMENTE para testes cegos */
export async function renderWidget(w: WidgetSpec): Promise<HTMLElement> {
  const el = document.createElement('div');
  el.className = 'widget-card';
  el.innerHTML = `<h4 class="widget-title">${escapeHtml(w.titulo)}</h4>`;

  const dados = await dadosWidget(w);

  if (w.tipo === 'metrica') {
    const n = Array.isArray(dados) ? dados.length : (dados ? Object.keys(dados as object).length : 0);
    el.innerHTML += `<div class="widget-metric">${n}</div>`;
  } else if (w.tipo === 'tabela' || w.tipo === 'grafico') {
    const rot = w.fonte?.rotulo_campo || 'id';
    const val = w.fonte?.campo_valor || 'status';
    const linhas = (Array.isArray(dados) ? dados : []).slice(0, 10);

    if (w.tipo === 'grafico') {
      const contagem: Record<string, number> = {};
      linhas.forEach((d: Record<string, unknown>) => {
        const k = String(d[val] ?? '?');
        contagem[k] = (contagem[k] || 0) + 1;
      });
      const max = Math.max(1, ...Object.values(contagem));
      el.innerHTML += Object.entries(contagem).map(([k, v]) => `
        <div class="flex items-center gap-2 mb-2">
          <span class="text-xs w-24 truncate">${escapeHtml(k)}</span>
          <div style="width:${(v/max)*100}%" class="widget-chart-bar"></div>
          <span class="text-xs">${v}</span>
        </div>
      `).join('') || '<div class="text-zinc-500 text-xs">Sem dados</div>';
    } else {
      el.innerHTML += `<table class="widget-table">${linhas.map((d: Record<string, unknown>) => `
        <tr>
          <td class="font-mono text-xs truncate max-w-[150px]">${escapeHtml(String(d[rot] ?? '').slice(0, 30))}</td>
          <td class="text-xs text-zinc-500">${escapeHtml(String(d[val] ?? ''))}</td>
        </tr>
      `).join('') || '<tr><td class="text-zinc-500 text-xs" colspan="2">Sem dados</td></tr>'}</table>`;
    }
  } else if (w.tipo === 'kanban') {
    const colunas: Record<string, Record<string, unknown>[]> = {};
    (Array.isArray(dados) ? dados : []).forEach((t: Record<string, unknown>) => {
      const col = String(t.coluna || 'backlog');
      (colunas[col] = colunas[col] || []).push(t);
    });
    el.innerHTML += Object.entries(colunas).map(([c, ts]) => `
      <div class="mb-2">
        <div class="text-xs text-zinc-500 capitalize">${escapeHtml(c)} (${ts.length})</div>
        ${ts.map(t => `<div class="text-xs bg-zinc-800 rounded p-1 mb-1 truncate">${escapeHtml(String(t.titulo || ''))}</div>`).join('')}
      </div>
    `).join('') || '<div class="text-zinc-500 text-xs">Sem dados</div>';
  } else if (w.tipo === 'markdown') {
    el.innerHTML += `<div class="text-xs whitespace-pre-wrap">${escapeHtml(String(w.texto || ''))}</div>`;
  } else if (w.tipo === 'lista_tarefas') {
    el.innerHTML += (Array.isArray(dados) ? dados : []).map((t: Record<string, unknown>) => `
      <label class="flex items-center gap-2 text-xs mb-1">
        <input type="checkbox" ${t.coluna === 'feito' ? 'checked' : ''} disabled/> ${escapeHtml(String(t.titulo || ''))}
      </label>
    `).join('') || '<div class="text-zinc-500 text-xs">Sem dados</div>';
  } else if (w.tipo === 'formulario') {
    const campos = w.acao?.campos || [{ nome: 'titulo' }];
    el.innerHTML += campos.map(c => `
      <input class="mb-2" placeholder="${escapeHtml(String(c.rotulo || c.nome))}" data-campo="${escapeHtml(c.nome)}"/>
    `).join('') + `<button class="btn" onclick="enviarForm(this, '${escapeHtml(w.id)}')">${w.acao?.tipo === 'post_rota' ? 'Enviar' : 'Executar'}</button>`;
    el.dataset.rota = w.fonte?.rota || '';
    el.dataset.acao = w.acao?.tipo || 'post_rota';
  }

  return el;
}

/** Envia formulário de widget — FUNÇÃO EXPOSTA GLOBALMENTE */
export async function enviarForm(btn: HTMLButtonElement, _widgetId: string): Promise<void> {
  const card = btn.closest('.widget-card') as HTMLElement | null;
  if (!card) return;

  const corpo: Record<string, string> = {};
  card.querySelectorAll('[data-campo]').forEach((input) => {
    const el = input as HTMLInputElement;
    corpo[el.dataset.campo!] = el.value;
  });

  const rota = card.dataset.rota || '/tasks';
  try {
    await api(rota, { method: 'POST', body: JSON.stringify(corpo) });
    btn.innerHTML = 'Enviado ' + icone('spark');
    setTimeout(() => {
      btn.innerHTML = card.dataset.acao === 'post_rota' ? 'Enviar' : 'Executar';
    }, 2000);
  } catch (e) {
    toast('Erro: ' + (e as Error).message, 'erro');
    btn.innerHTML = card.dataset.acao === 'post_rota' ? 'Enviar' : 'Executar';
  }
}