import path from "node:path";
import Database from "better-sqlite3";
import fs from "node:fs";

const workspacesRoot = path.join(process.env.HOME || "/home/j", ".opencorp", "workspaces");

console.log("==================================================================");
console.log("     SEMEANDO TAREFAS ATIVAS NO KANBAN SQLITE DOS 10 WORKSPACES   ");
console.log("==================================================================");

const kanbanPorWorkspace = {
  "yt-factory-01": {
    fazendo: [
      { id: "tsk-yt-fazendo-1", titulo: "Renderização do Short #002: O Loop de 2012", desc: "Produção de áudio neural pt-BR, legendas SRT sincronizadas e vídeo MP4 1080x1920.", resp: "agente:produtor-video", prioridade: "urgente", labels: "producao,video" }
    ],
    backlog: [
      { id: "tsk-yt-backlog-1", titulo: "Roteirização: Os 5 Bugs Mais Caros da História", desc: "Escrever roteiro aplicando regra dos 3s com quebra de expectativa.", resp: "agente:roteirista-video", prioridade: "alta", labels: "roteiro,retencao" },
      { id: "tsk-yt-backlog-2", titulo: "Auditoria de Retenção do Vídeo #001", desc: "Avaliar taxa de retenção média e sugerir cortes de ritmo no manual.", resp: "agente:analista-qualidade", prioridade: "media", labels: "qualidade,auto-evolucao" },
      { id: "tsk-yt-backlog-3", titulo: "Geração de Variações de Títulos A/B para Pauta 003", desc: "Gerar 2 versões magnéticas para teste de CTR.", resp: "agente:pautador-youtube", prioridade: "media", labels: "pautas,ctr" }
    ]
  },
  "tech-hub-news": {
    fazendo: [
      { id: "tsk-tech-fazendo-1", titulo: "Redação: Por que SQLite e WAL Superam Bancos Pesados", desc: "Elaborar artigo técnico com benchmarks e diagramas de arquitetura.", resp: "agente:redator-artigo", prioridade: "alta", labels: "artigo,editorial" }
    ],
    backlog: [
      { id: "tsk-tech-backlog-1", titulo: "Fact-Checking de Fontes da Matéria sobre Modelos Locais", desc: "Checagem de links HTTP e referências originais.", resp: "agente:auditor-factcheck", prioridade: "alta", labels: "auditoria,fact-check" },
      { id: "tsk-tech-backlog-2", titulo: "Auditoria de Métricas no Analytics SQLite", desc: "Consolidar pageviews e tempo de leitura médio da semana.", resp: "agente:pautador-editorial", prioridade: "media", labels: "analytics,kpi" },
      { id: "tsk-tech-backlog-3", titulo: "Curadoria de 5 Novas Pautas para o Fim de Semana", desc: "Mapear avanços em IA generativa de código e ferramentas open source.", resp: "agente:pautador-editorial", prioridade: "baixa", labels: "pautas" }
    ]
  },
  "uptime-pulse": {
    fazendo: [
      { id: "tsk-uptime-fazendo-1", titulo: "Sonda Ativa: Monitoramento de Latência P95 em Endpoints", desc: "Execução de healthchecks periódicos e cálculo de p95/p99.", resp: "agente:sentinela-uptime", prioridade: "alta", labels: "sre,monitoramento" }
    ],
    backlog: [
      { id: "tsk-uptime-backlog-1", titulo: "Calibração de Thresholds de Alerta para Falhas HTTP 5xx", desc: "Ajustar regras do circuito de proteção para evitar falsos alarmes.", resp: "agente:arquiteto-sre", prioridade: "alta", labels: "sre,contingencia" },
      { id: "tsk-uptime-backlog-2", titulo: "Relatório de SLA e Disponibilidade Semanal (99.98%)", desc: "Compilar relatório consolidado para exportação executiva.", resp: "agente:analista-metricas", prioridade: "media", labels: "relatorio,sla" }
    ]
  },
  "prompt-vault": {
    fazendo: [
      { id: "tsk-prompt-fazendo-1", titulo: "Curadoria & Teste: Prompts de Refatoração e Clean Code", desc: "Testar asserts de prompts para redução de débito técnico em TypeScript.", resp: "agente:redator-artigo", prioridade: "alta", labels: "prompts,curadoria" }
    ],
    backlog: [
      { id: "tsk-prompt-backlog-1", titulo: "Classificação por Tags e Modelos Recomendados", desc: "Categorizar 10 novos prompts para GPT-4o, Claude 3.7 e Gemini.", resp: "agente:pautador-editorial", prioridade: "media", labels: "taxonomia" },
      { id: "tsk-prompt-backlog-2", titulo: "Auditoria de Prompt Injection & Robustez", desc: "Verificar vulnerabilidades e escapes indesejados.", resp: "agente:auditor-factcheck", prioridade: "alta", labels: "seguranca" }
    ]
  },
  "ofertas-radar": {
    fazendo: [
      { id: "tsk-ofertas-fazendo-1", titulo: "Mineração de Descontos: Hardware & Periféricos Tech", desc: "Varredura contínua de lojas para identificar descontos reais acima de 25%.", resp: "agente:minerador-dados", prioridade: "alta", labels: "radar,ofertas" }
    ],
    backlog: [
      { id: "tsk-ofertas-backlog-1", titulo: "Validação de Cupons Ativos e Histórico de Preços", desc: "Descartar ofertas com aumento prévio maquiado.", resp: "agente:curador-qualidade", prioridade: "alta", labels: "qualidade" },
      { id: "tsk-ofertas-backlog-2", titulo: "Exportação Semanal do Feed de Oportunidades em CSV", desc: "Gerar relatório para envio a assinantes do canal.", resp: "agente:analista-radar", prioridade: "media", labels: "exportacao" }
    ]
  },
  "leadhunter-b2b": {
    fazendo: [
      { id: "tsk-lead-fazendo-1", titulo: "Qualificação de Decisores no Setor de Logística & Supply Chain", desc: "Mapeamento de Diretores de Operações e CTOs com fit para automação.", resp: "agente:analista-radar", prioridade: "alta", labels: "b2b,prospeccao" }
    ],
    backlog: [
      { id: "tsk-lead-backlog-1", titulo: "Pesquisa de Dores Operacionais em Empresas de Saúde", desc: "Identificar gargalos em clínicas e telemedicina.", resp: "agente:minerador-dados", prioridade: "alta", labels: "pesquisa,icp" },
      { id: "tsk-lead-backlog-2", titulo: "Preparação de Cadência de E-mails Consultivos", desc: "Elaborar cópias personalizadas para primeiro contato.", resp: "agente:curador-qualidade", prioridade: "media", labels: "copy,outreach" }
    ]
  },
  "cryptobrief-news": {
    fazendo: [
      { id: "tsk-crypto-fazendo-1", titulo: "Síntese On-Chain: Fluxo de Entrada em ETFs de Bitcoin", desc: "Análise quantitativa dos saldos de custódia e pressão de compra.", resp: "agente:redator-artigo", prioridade: "alta", labels: "on-chain,btc" }
    ],
    backlog: [
      { id: "tsk-crypto-backlog-1", titulo: "Mapeamento de Taxas e Adoção em Redes Layer-2", desc: "Levantamento de TPS e TVL em Arbitrum, Base e Optimism.", resp: "agente:pautador-editorial", prioridade: "media", labels: "l2,defi" },
      { id: "tsk-crypto-backlog-2", titulo: "Revisão e Fact-Check de Notícias Macro", desc: "Confrontar declarações de bancos centrais com fontes primárias.", resp: "agente:auditor-factcheck", prioridade: "alta", labels: "fact-check" }
    ]
  },
  "sre-watchdog": {
    fazendo: [
      { id: "tsk-sre-fazendo-1", titulo: "Inspeção Contínua de Host: Monitor de RAM, Load e Zombie Procs", desc: "Telemetria local com coleta a cada minuto e alerta preventivo.", resp: "agente:sentinela-uptime", prioridade: "alta", labels: "sre,telemetria" }
    ],
    backlog: [
      { id: "tsk-sre-backlog-1", titulo: "Configuração de Faxina Automática de Logs e Temp", desc: "Script de contingência para acionar quando o disco atinge 80%.", resp: "agente:arquiteto-sre", prioridade: "media", labels: "self-healing" },
      { id: "tsk-sre-backlog-2", titulo: "Auditoria de Picos de Latência e I/O de Disco", desc: "Identificar processos com alta contenção de escrita.", resp: "agente:analista-metricas", prioridade: "baixa", labels: "diagnostico" }
    ]
  },
  "licitacoes-diario": {
    fazendo: [
      { id: "tsk-licit-fazendo-1", titulo: "Triagem de Editais: Pregões Federais para Contratação de Nuvem e IA", desc: "Análise semântica de termos de referência e prazos de impugnação.", resp: "agente:analista-radar", prioridade: "alta", labels: "licitacao,gov" }
    ],
    backlog: [
      { id: "tsk-licit-backlog-1", titulo: "Análise de Riscos Jurídicos do Pregão 42/2026", desc: "Exame das exigências de habilitação técnica e certidões.", resp: "agente:curador-qualidade", prioridade: "urgente", labels: "juridico" },
      { id: "tsk-licit-backlog-2", titulo: "Mapeamento de Oportunidades em Câmaras e Prefeituras", desc: "Varredura em portais de compras de capitais.", resp: "agente:minerador-dados", prioridade: "media", labels: "triagem" }
    ]
  },
  "pulso-diario": {
    fazendo: [
      { id: "tsk-pulso-fazendo-1", titulo: "Ciclo Editorial 24h: Redação de Pauta Econômica para PMEs", desc: "Produção de artigo completo com SEO e citação de fontes primárias.", resp: "agente:editor", prioridade: "alta", labels: "editorial,wordpress" }
    ],
    backlog: [
      { id: "tsk-pulso-backlog-1", titulo: "Auditoria Noturna de Higiene e Links 404", desc: "Ronda automatizada via wp.cjs para conferência de integridade.", resp: "agente:critico-site", prioridade: "media", labels: "higiene,auditoria" },
      { id: "tsk-pulso-backlog-2", titulo: "Agendamento da Fila de Publicação Diária", desc: "Sortear janelas ótimas de publicação entre 08h e 22h BRT.", resp: "agente:agendador-publicacao", prioridade: "alta", labels: "publicacao" }
    ]
  }
};

for (const [wsId, dados] of Object.entries(kanbanPorWorkspace)) {
  const wsDir = path.join(workspacesRoot, wsId);
  const dbPath = path.join(wsDir, ".opencorp", "tasks.db");
  if (!fs.existsSync(dbPath)) continue;

  const db = new Database(dbPath);

  // Inserir tasks em fazendo
  for (const t of dados.fazendo) {
    db.prepare(`INSERT OR REPLACE INTO tasks (id, titulo, descricao, coluna, pos, prioridade, labels, responsavel, criado_por, criado_em, atualizado_em)
      VALUES (?, ?, ?, 'fazendo', 10, ?, ?, ?, 'sistema:benchmark', datetime('now'), datetime('now'))`)
      .run(t.id, t.titulo, t.desc, t.prioridade, t.labels, t.resp);
  }

  // Inserir tasks em backlog
  let pos = 20;
  for (const t of dados.backlog) {
    db.prepare(`INSERT OR REPLACE INTO tasks (id, titulo, descricao, coluna, pos, prioridade, labels, responsavel, criado_por, criado_em, atualizado_em)
      VALUES (?, ?, ?, 'backlog', ?, ?, ?, ?, 'sistema:benchmark', datetime('now'), datetime('now'))`)
      .run(t.id, t.titulo, t.desc, pos, t.prioridade, t.labels, t.resp);
    pos += 10;
  }

  const counts = db.prepare("SELECT coluna, count(*) as c FROM tasks GROUP BY coluna").all();
  console.log(`✔ [${wsId.padEnd(17)}] Kanban populado:`, counts.map(r => `${r.coluna}: ${r.c}`).join(" | "));
}

console.log("\n==================================================================");
console.log("       KANBAN DE TODOS OS 10 WORKSPACES VIVO E POPULADO!          ");
console.log("==================================================================");
