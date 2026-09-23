import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { projectRoot } from "../../../utils/paths.js";

export interface ResumoFluxoContexto {
  id: string;
  nome?: string;
  descricao?: string;
  ativo?: boolean;
}

/**
 * Constrói o contexto automático e preâmbulo estruturado para o Secretário Executivo,
 * injetando as diretrizes de governança (AGENTS.md), configuração de negócio (.opencorp/config.json)
 * e o catálogo de fluxos ativos do workspace.
 */
export async function construirContextoWorkspace(ws: { id: string; path: string }): Promise<string> {
  const partes: string[] = [];

  partes.push(`[CONTEXTO OPERACIONAL DO WORKSPACE: "${ws.id}"]`);
  partes.push(`Caminho Base: ${ws.path}`);

  // 1. Carrega configuração de negócio (.opencorp/config.json)
  const configPath = join(ws.path, ".opencorp", "config.json");
  if (existsSync(configPath)) {
    try {
      const configRaw = await readFile(configPath, "utf8");
      const cfg = JSON.parse(configRaw) as Record<string, any>;
      const linhasCfg: string[] = [];
      if (cfg.nicho) linhasCfg.push(`- Nicho: ${cfg.nicho}`);
      if (cfg.descricao_nicho) linhasCfg.push(`- Descrição do Nicho: ${cfg.descricao_nicho}`);
      if (cfg.regra_temas) linhasCfg.push(`- Regra de Temas: ${cfg.regra_temas}`);
      if (Array.isArray(cfg.foco_prioritario) && cfg.foco_prioritario.length > 0) {
        linhasCfg.push(`- Foco Prioritário: ${cfg.foco_prioritario.join(" | ")}`);
      }
      if (cfg.lingua) linhasCfg.push(`- Idioma Operacional: ${cfg.lingua}`);
      if (cfg.duracao_segundos_alvo) linhasCfg.push(`- Duração Alvo de Vídeos/Conteúdo: ${cfg.duracao_segundos_alvo}s`);
      if (linhasCfg.length > 0) {
        partes.push(`\nConfiguração de Negócio do Workspace:\n${linhasCfg.join("\n")}`);
      }
    } catch {}
  }

  // 2. Carrega fluxos registrados no workspace (.opencorp/flows/*.json)
  const flowsDir = join(ws.path, ".opencorp", "flows");
  if (existsSync(flowsDir)) {
    try {
      const arquivos = await readdir(flowsDir);
      const fluxos: ResumoFluxoContexto[] = [];
      for (const arq of arquivos) {
        if (!arq.endsWith(".json")) continue;
        try {
          const flowRaw = await readFile(join(flowsDir, arq), "utf8");
          const flowData = JSON.parse(flowRaw) as Record<string, any>;
          fluxos.push({
            id: flowData.id || arq.replace(/\.json$/, ""),
            nome: flowData.name || flowData.nome,
            descricao: flowData.description || flowData.descricao,
            ativo: flowData.active !== false && flowData.ativo !== false,
          });
        } catch {}
      }
      if (fluxos.length > 0) {
        const linhasFluxos = fluxos.map(
          (f) => `- ${f.id}${f.nome ? ` ("${f.nome}")` : ""}${f.descricao ? `: ${f.descricao}` : ""}`,
        );
        partes.push(`\nFluxos Disponíveis no Workspace:\n${linhasFluxos.join("\n")}`);
      }
    } catch {}
  }

  // 3. Carrega regras de engenharia e governança (AGENTS.md)
  let agentsMdPath: string | null = null;
  const candidatosAgentsMd = [
    join(ws.path, "AGENTS.md"),
    join(ws.path, ".opencorp", "AGENTS.md"),
    join(projectRoot(), ".agents", "AGENTS.md"),
    join(projectRoot(), "AGENTS.md"),
  ];
  for (const c of candidatosAgentsMd) {
    if (existsSync(c)) {
      agentsMdPath = c;
      break;
    }
  }

  if (agentsMdPath) {
    try {
      await readFile(agentsMdPath, "utf8");
      // Resumo conciso e diretivo das regras para não estourar a janela de contexto
      partes.push(
        `\nDiretrizes de Governança e Engenharia (AGENTS.md):\n` +
          `1. Paradigma n8n: toda automação periódica, reação a eventos e agendamentos reside em fluxos (.opencorp/flows/<id>.json). Proibidos scripts de loop infinito (while true).\n` +
          `2. Supervisor Daemon: o agendamento é centralizado no supervisor. Não manipule crontab do sistema operacional.\n` +
          `3. Idioma: comunique-se estritamente em Português do Brasil (PT-BR) com o operador.\n` +
          `4. Isolamento estrito de Workspace: você está operando exclusivamente no workspace "${ws.id}". Ao rodar ferramentas de terminal ('oc', scripts, python), passe sempre '--workspace ${ws.id}'. Nunca acesse dados de outros workspaces.`,
      );
    } catch {}
  } else {
    partes.push(
      `\nDiretrizes Operacionais:\n` +
        `- Responda sempre em Português do Brasil (PT-BR).\n` +
        `- Isole suas ações exclusivamente no workspace "${ws.id}". Utilize '--workspace ${ws.id}' em comandos CLI.`,
    );
  }

  partes.push("---\n");
  return partes.join("\n");
}
