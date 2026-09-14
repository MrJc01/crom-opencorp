import type { TabSession, MessagePart } from "./types";

export const INITIAL_TABS: TabSession[] = [
  {
    id: "tab-1",
    title: "Nova sessão",
    active: true,
    agent: "secretario-exec",
    model: "openrouter/google/gemini-2.5-flash",
    tokensTotal: 0,
    costEstimate: "$0.0000",
    updatedAt: "Agora",
  },
  {
    id: "tab-2",
    title: "Pauta YouTube",
    active: false,
    agent: "pautador-youtube",
    model: "opencode/nemotron-3-ultra-free",
    tokensTotal: 3420,
    costEstimate: "$0.0000",
    updatedAt: "há 4m",
  },
  {
    id: "tab-3",
    title: "Análise de Código",
    active: false,
    agent: "code-reviewer",
    model: "anthropic/claude-3-7-sonnet",
    tokensTotal: 1890,
    costEstimate: "$0.0045",
    updatedAt: "há 12m",
  },
];

export const INTERLEAVED_SIMULATION_PARTS: MessagePart[] = [
  // 1. Pensamento Inicial
  {
    type: "reasoning",
    id: "part-r1",
    title: "Pensamento (3s)",
    durationSeconds: 3,
    completed: true,
    thoughts: [
      "Ordem recebida: 'Analise os vídeos de hoje e gere o boletim'.",
      "Identificado workspace de destino: yt-factory-01.",
      "Primeira ação: verificar transmissões ao vivo em andamento nos 28 canais.",
    ],
  },
  // 2. Resposta Intermediária
  {
    type: "text",
    id: "part-t1",
    content: "Vou iniciar a auditoria do workspace verificando as transmissões ao vivo em andamento.",
  },
  // 3. Primeira Chamada de Ferramenta (Shell)
  {
    type: "tool",
    id: "part-tool1",
    tool: "shell",
    command: "python scripts/check_streams.py --live",
    durationMs: 420,
    exitCode: 0,
    status: "success",
    output: `stdout: 18 ao vivo detectados | 48.240 espectadores simultâneos | exit: 0
[info] 18 transmissões ativas em 28 canais monitorados
[metrics] Canal principal 'Radar Tech & IA': 12.480 espectadores ao vivo`,
  },
  // 4. Segundo Pensamento
  {
    type: "reasoning",
    id: "part-r2",
    title: "Pensamento (4s)",
    durationSeconds: 4,
    completed: true,
    thoughts: [
      "Transmissões ativas obtidas com sucesso (18 lives).",
      "Agora preciso consultar a grade de transmissões agendadas para o horário nobre hoje (19h–22h).",
      "Executando script de agendamentos no banco SQLite do workspace.",
    ],
  },
  // 5. Segunda Chamada de Ferramenta (Shell)
  {
    type: "tool",
    id: "part-tool2",
    tool: "shell",
    command: "python scripts/get_schedule.py --today",
    durationMs: 380,
    exitCode: 0,
    status: "success",
    output: `stdout: 10 transmissões agendadas para hoje à noite | exit: 0
[schedule] 19:00 - Podcast Exclusivo #84 (4.200 inscritos na espera)
[schedule] 20:30 - Mesa Redonda Cripto & Mercado
[schedule] 21:00 - Resumo Noturno da Redação`,
  },
  // 6. Terceiro Pensamento
  {
    type: "reasoning",
    id: "part-r3",
    title: "Pensamento (2s)",
    durationSeconds: 2,
    completed: true,
    thoughts: [
      "Todos os dados coletados: 18 ao vivo e 10 agendados.",
      "Calculando média de audiência (+24.5% acima do esperado).",
      "Formatando o boletim executivo com tabela e destaques editoriais.",
    ],
  },
  // 7. Resposta Final Formatada
  {
    type: "text",
    id: "part-t2",
    content: `### 📊 Boletim Diário de Transmissões — YouTube Factory

Analisei as transmissões de hoje em todos os 28 canais do workspace **yt-factory-01**. Foram consolidadas **18 lives ativas** e **10 transmissões agendadas** para o horário nobre.

#### 🔴 Destaques de Audiência em Tempo Real

| Canal / Stream | Status | Espectadores | Tópico Principal |
| :--- | :---: | :---: | :--- |
| **Radar Tech & IA** | 🔴 Ao vivo | **12.480** | Modelos Open-Source & Arquitetura OpenCode |
| **Mercado & Finanças 24h** | 🔴 Ao vivo | **8.920** | Abertura dos Mercados & Tendências Macro |
| **Fábrica de Notícias** | 🔴 Ao vivo | **6.140** | Resumo dos Fatos do Dia (Edição da Tarde) |
| **Podcast Exclusivo #84** | ⏳ 19:00 | *4.200 agendados* | Entrevista com Desenvolvedores Principais |

> **Resumo Executivo:** Audiência total consolidada superou em **+24.5%** a média da semana anterior. Boletim pronto para despacho à equipe editorial.`,
  },
];
