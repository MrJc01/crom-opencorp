/**
 * Sistema de ajuda "?" — popups explicativos por contexto.
 * Uso em qualquer view: ajuda(niveL) injeta botões "?" inline.
 *   <span class="help-wrap">${ajuda('chave', 'Texto explicativo...')}</span>
 * O popup é gerenciado por UM elemento global (não cria DOM repetido).
 */

const popupId = 'help-popup';

export function ajuda(chave: string, texto?: string): string {
  const esc = (texto ?? '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return `<button class="help-btn" aria-label="Ajuda: ${chave}" onclick="window.__ajuda(event, '${chave}')"${esc ? ` data-help="${esc}"` : ''}>?</button>`;
}

/** Conteúdo das ajudas — single source of truth (editável aqui) */
export const AJUDAS: Record<string, string> = {
  'workspace': 'Uma <b>empresa autônoma</b>: tem seus próprios agentes, task board, registros, orçamento e site. Cada pasta em ~/.opencorp/workspaces/ é uma empresa. Você alterna entre elas na barra lateral.',
  'agentes': 'Os <b>funcionários</b> da empresa. Cada agente é um arquivo Markdown com prompt + configuração (modelo, permissões, orçamento). Permissões: level-1 só lê · level-2 executa comandos · level-3 acessa rede.',
  'tasks': 'O <b>quadro kanban</b> da empresa: backlog → fazendo → bloqueado → feito. Agentes assumem tasks, conversam no chat da task e movem entre colunas. Você também pode criar e delegar.',
  'mentions': 'Para chamar um agente dentro de uma task, use <b>@nome-do-agente</b> na mensagem. O orquestrador desperta o agente mencionado com o contexto da task.',
  'agenda': '<b>Rotinas agendadas</b> (cron ou intervalo). O daemon do scheduler executa comandos opencorp automaticamente. Ex.: auditoria do site todo dia às 6h.',
  'teams': '<b>Times multi-agente</b>: pipeline (em sequência), fanout (em paralelo), review (um revisa outro) e debate (discordar até convergir).',
  'reunioes': '<b>Reuniões</b> entre agentes com pauta e moderador. Terminam com ata gravada em registros. Útil para decisões entre "áreas".',
  'historico': '<b>Timeline unificada</b> de tudo que aconteceu: execuções de agentes, tasks movidas, rotinas disparadas. É o diário da empresa.',
  'secretario': 'O <b>assistente executivo</b> da empresa — uma sessão real do OpenCode com acesso às ferramentas do opencorp (via MCP). O secretário <b>analisa e relata</b>; o <b>secretário-exec</b> também executa. Pergunte "o que aconteceu hoje?" ou peça ações.',
  'flows': '<b>Linhas de pensamento</b> executáveis (estilo n8n): gatilho → agentes → decisões → tasks/registros. O CEO analisa o board e abre tasks sozinho. Agentes podem criar novas linhas.',
  'apps': '<b>Mini-apps</b> declarativas do workspace (JSON em .opencorp/apps). Widgets e formulários que o próprio workspace define.',
  'budget': 'Teto de gasto diário em USD. Quando um agente atinge 80% ele avisa; a 100% pausa. Por agente e por workspace.',
  'secrets': 'Credenciais do workspace (senhas de API, WordPress etc.) em ~/.opencorp/secrets.json. <b>Nunca</b> são exibidas — só o nome e o estado. Os agentes usam via variável de ambiente, sem ler o arquivo.',
  'security': 'Política de segurança: nível padrão, lista de comandos bloqueados (rm -rf…), padrões que exigem <b>aprovação humana</b> (HITL: git push, npm publish…) e allowlist de rede.',
  'wizard-workspace': 'A empresa nasce de um <b>template</b> (papelaria pronta: agentes, specs, ferramentas). Depois você responde o perfil (nicho, público, tom) — é o que guia editor e crítico.',
  'modelos': 'Modelo padrão dos agentes, modelo dos testes cegos e do secretário. Formato: provedor/modelo. Opções do plano Go: opencode-go/glm-5.3-flash (rápido/barato) · minimax-m3 (análise profunda).',
  'kanban': 'Colunas do quadro: <b>backlog</b> (fila) → <b>fazendo</b> (em execução) → <b>bloqueado</b> (aguarda algo) → <b>feito</b>. Arraste cards entre colunas ou clique para detalhes.',
  'level': 'Níveis de permissão dos agentes: <b>level-1</b> só leitura · <b>level-2</b> executa comandos locais (bash) · <b>level-3</b> acessa rede. Menos permissão = mais seguro.',
  'hitl': '<b>Human-in-the-loop</b>: ações sensíveis (git push, npm publish…) pausam e esperam sua aprovação aqui. Nada sensível roda sem você ver.',
  'execucoes': 'Cada vez que um agente roda (via CLI, rotina, flow ou team) vira uma <b>execução</b> com status e log. Consulte o log para depurar.',
  'feed': 'Eventos em tempo real de TODAS as empresas: tasks criadas/movidas, sessões iniciadas, hooks disparados. Chega via SSE sem recarregar.',
  'scheduler': 'O <b>daemon do scheduler</b> é o processo que dispara rotinas agendadas (jobs) no horário certo. Se estiver parado, as rotinas não rodam: <code>opencorp scheduler start</code>.',
  'tools': 'Ferramentas declarativas do workspace (JSON em <code>.opencorp/tools/</code>): specs que os agentes usam — ex.: wp.pagina, wp.configurar. A web lista; executar fica no terminal.',
  'config': 'Preferências do sistema: modelos, orçamento, segurança, testes e mais. Cada campo mostra de onde vem o valor (global, workspace ou padrão) e salva individualmente. Secrets e Ferramentas têm aba própria aqui.',
  'testes': '<b>Testes cegos</b>: outputs de agentes avaliados por outro modelo que não sabe quem escreveu — evita favoritismo. Você define se estão ativos, o modelo avaliador e a rotação de juízes.',
  'healing': '<b>Self-healing</b>: se uma execução de agente falha, o sistema tenta corrigir sozinho (reenvia com o erro no contexto) até o limite de tentativas configurado aqui.',
};

/** Mostra o popup de ajuda ancorado ao botão clicado */
export function mostrarAjuda(ev: Event, chave: string): void {
  ev.stopPropagation();
  const texto = AJUDAS[chave] ?? (ev.currentTarget as HTMLElement)?.getAttribute('data-help') ?? '';
  fecharAjuda();
  const overlay = document.createElement('div');
  overlay.id = popupId;
  overlay.innerHTML = `
    <div class="help-backdrop" onclick="window.__ajudaFechar()"></div>
    <div class="help-pop" role="dialog" aria-label="Ajuda">
      <div class="help-titulo"><span class="help-badge">?</span> Como funciona</div>
      <div class="help-corpo">${texto}</div>
      <button class="btn" onclick="window.__ajudaFechar()">Entendi</button>
    </div>
  `;
  document.body.appendChild(overlay);
}

export function fecharAjuda(): void {
  document.getElementById(popupId)?.remove();
}

/** Instala os globais (chamar uma vez no boot) */
export function exporAjuda(): void {
  const g = window as unknown as Record<string, unknown>;
  g.__ajuda = mostrarAjuda;
  g.__ajudaFechar = fecharAjuda;
  // ESC fecha
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharAjuda();
  });
}
