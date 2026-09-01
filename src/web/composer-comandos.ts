/**
 * Parser do composer inteligente (PLANO-PAINEL-V2 Etapa 2.1) — funções PURAS,
 * sem DOM, testáveis em node (tests/composer-comandos.test.ts).
 *
 * Tokens reconhecidos:
 *   `/cmd args…` no início → comando próprio do opencorp (resolvido no front)
 *   `!comando` no início   → terminal (POST /terminal, whitelist de COMANDOS_AGENDA)
 *   `@alvo` em qualquer lugar → contexto anexado ao envio (campo `contexto`)
 */

export interface ComandoParseado {
  nome: string;
  args: string;
}

export interface TerminalParseado {
  comando: string;
}

export interface ResultadoComposer {
  comando?: ComandoParseado;
  terminal?: TerminalParseado;
  contexto: string[];
  textoLimpo: string;
}

/** Comandos próprios do painel — resolvidos localmente (fetch na API + bloco no feed),
 *  nunca vão para o LLM. Outros `/cmd` passam direto ao Secretário (passthrough opencode). */
export interface ComandoOpencorp {
  nome: string;
  descricao: string;
  exemplo: string;
}

export const COMANDOS_OPCORP: ComandoOpencorp[] = [
  { nome: 'status', descricao: 'Resumo do estado da empresa', exemplo: '/status' },
  { nome: 'tasks', descricao: 'Resumo do board de tasks', exemplo: '/tasks' },
  { nome: 'custos', descricao: 'Gasto de hoje do workspace', exemplo: '/custos' },
  { nome: 'fluxos', descricao: 'Lista os flows disponíveis', exemplo: '/fluxos' },
  { nome: 'agenda', descricao: 'Lista as rotinas agendadas', exemplo: '/agenda' },
  { nome: 'agentes', descricao: 'Lista a equipe de agentes', exemplo: '/agentes' },
  { nome: 'limpar', descricao: 'Inicia uma nova conversa', exemplo: '/limpar' },
];

const RE_CONTEXTO = /(^|\s)@([a-z0-9._-]+)/gi;

/**
 * Parseia o texto do composer:
 * - `/cmd args…` se COMEÇA com `/` → comando (nome sem a barra = 1º token)
 * - `!cmd` se COMEÇA com `!` → terminal (resto como comando bruto)
 * - `@alvo` em qualquer lugar → contexto[] (sem o @, sem duplicatas, ordem de aparição)
 * - textoLimpo = texto sem os tokens @ (comando/terminal mantêm o texto original)
 */
export function parsearComposer(texto: string): ResultadoComposer {
  const bruto = texto.trim();

  const contexto: string[] = [];
  for (const m of bruto.matchAll(RE_CONTEXTO)) {
    const alvo = m[2]!;
    if (!contexto.includes(alvo)) contexto.push(alvo);
  }

  const textoLimpo = bruto
    .replace(/(^|\s)@[a-z0-9._-]+/gi, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();

  let comando: ComandoParseado | undefined;
  let terminal: TerminalParseado | undefined;

  if (bruto.startsWith('!')) {
    const comandoBruto = bruto.slice(1).trim();
    if (comandoBruto) terminal = { comando: comandoBruto };
  } else if (bruto.startsWith('/')) {
    const semBarra = bruto.slice(1);
    const espaco = semBarra.search(/\s/);
    const nome = espaco === -1 ? semBarra : semBarra.slice(0, espaco);
    if (nome) {
      comando = { nome, args: espaco === -1 ? '' : semBarra.slice(espaco + 1).trim() };
    }
  }

  return { comando, terminal, contexto, textoLimpo };
}
