import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { opencorpHome, projectRoot } from "../../../utils/paths.js";
import { writeFileAtomic } from "../../../utils/fs-safe.js";
import { OpencorpError } from "../../shared/errors.js";
import { OpenCodeBridge } from "../execution/opencode-bridge.js";

export class PackError extends OpencorpError {}

export interface PackResumo {
  id: string;
  nome: string;
  versao: string;
  descricao: string;
  categoria: string;
  autor: string;
  icone?: string;
  total_agentes: number;
  total_fluxos: number;
  total_skills: number;
  destaque?: boolean;
}

export interface PackItemConteudo {
  id: string;
  nome?: string;
  role?: string;
  description?: string;
  skills?: string[];
  trigger?: string;
}

export interface PackDetalhado extends PackResumo {
  requisitos?: {
    system?: string[];
    engines?: string[];
  };
  conteudo: {
    agentes: PackItemConteudo[];
    fluxos: PackItemConteudo[];
    skills: PackItemConteudo[];
    assets?: string[];
  };
}

export interface ResultadoInstalacaoPack {
  ok: boolean;
  packId: string;
  workspace: string;
  instalados: {
    agentes: string[];
    fluxos: string[];
    skills: string[];
  };
  avisos?: string[];
}

// Catálogo nativo de Packs de Solução canônicos do OpenCorp
const PACKS_EMBUTIDOS: PackDetalhado[] = [
  {
    id: "youtube-factory",
    nome: "YouTube Shorts Factory",
    versao: "1.0.0",
    descricao: "Esteira autônoma ponta a ponta para garimpo de pautas, redação de roteiros dinâmicos e produção automatizada de vídeos verticais.",
    categoria: "Mídia & Criação",
    autor: "OpenCorp Core",
    icone: "Video",
    destaque: true,
    total_agentes: 3,
    total_fluxos: 2,
    total_skills: 2,
    requisitos: {
      system: ["ffmpeg", "piper-tts"],
      engines: ["openrouter"],
    },
    conteudo: {
      agentes: [
        { id: "pautador-youtube", role: "Pautador de Notícias", skills: ["web-search"] },
        { id: "roteirista-video", role: "Roteirista de Vídeos Curtos", skills: ["web-search"] },
        { id: "analista-qualidade", role: "Analista de Qualidade e Compliance", skills: [] },
      ],
      fluxos: [
        { id: "yt-pautador", nome: "Garimpo Diário de Pautas", trigger: "cron" },
        { id: "yt-esteira-shorts", nome: "Renderização e Produção de Shorts", trigger: "manual" },
      ],
      skills: [
        { id: "web-search", nome: "web-search", description: "Busca de dados e fontes na web" },
        { id: "flow-orchestrator", nome: "flow-orchestrator", description: "Padrões de fluxos declarativos" },
      ],
      assets: ["pautas.sample.json", "video-template/"],
    },
  },
  {
    id: "sre-devops",
    nome: "SRE & Automação de Infraestrutura",
    versao: "1.0.0",
    descricao: "Monitoramento proativo de logs do daemon, recuperação automática de processos zumbis e checkpoints Git semânticos.",
    categoria: "DevOps & SRE",
    autor: "OpenCorp Core",
    icone: "ShieldCheck",
    destaque: true,
    total_agentes: 2,
    total_fluxos: 2,
    total_skills: 2,
    requisitos: {
      system: ["git", "lsof"],
      engines: ["openrouter"],
    },
    conteudo: {
      agentes: [
        { id: "auditor-infra", role: "Auditor de Infraestrutura e Processos", skills: ["workspace-auditor"] },
        { id: "engenheiro-deploy", role: "Engenheiro de Git e Checkpoints", skills: ["git-ops"] },
      ],
      fluxos: [
        { id: "sre-healthcheck", nome: "Diagnóstico Periódico de Saúde", trigger: "cron" },
        { id: "sre-auto-remediation", nome: "Limpeza de Zumbis e Locks", trigger: "webhook" },
      ],
      skills: [
        { id: "workspace-auditor", nome: "workspace-auditor", description: "Rotinas de auditoria de integridade" },
        { id: "git-ops", nome: "git-ops", description: "Gestão automatizada de Git e branches" },
      ],
      assets: ["healthcheck-rules.json"],
    },
  },
  {
    id: "ecommerce-ops",
    nome: "E-Commerce & Operações",
    versao: "1.0.0",
    descricao: "Controle de estoque, triagem de pedidos pendentes e atendimento automatizado com inteligência artificial.",
    categoria: "Operações & Vendas",
    autor: "OpenCorp Partner",
    icone: "ShoppingBag",
    destaque: false,
    total_agentes: 2,
    total_fluxos: 2,
    total_skills: 2,
    requisitos: {
      engines: ["openrouter"],
    },
    conteudo: {
      agentes: [
        { id: "gerente-estoque", role: "Controlador de Estoque e Catálogo", skills: ["model-governance"] },
        { id: "analista-pedidos", role: "Triador de Pedidos e Rastreio", skills: ["web-search"] },
      ],
      fluxos: [
        { id: "ecommerce-sincronizacao", nome: "Sincronização Noturna de Catálogo", trigger: "cron" },
        { id: "ecommerce-alertas", nome: "Alertas de Baixo Estoque", trigger: "webhook" },
      ],
      skills: [
        { id: "model-governance", nome: "model-governance", description: "Alocação eficiente de modelos" },
        { id: "web-search", nome: "web-search", description: "Pesquisa de fornecedores e produtos" },
      ],
      assets: ["catalogo-modelo.json"],
    },
  },
  {
    id: "compliance-legal",
    nome: "Auditoria & Governança Jurídica",
    versao: "1.0.0",
    descricao: "Validação determinística de termos de uso, políticas de privacidade e auditoria contínua de modelos e licenças.",
    categoria: "Governança & Legal",
    autor: "OpenCorp Core",
    icone: "Scale",
    destaque: false,
    total_agentes: 2,
    total_fluxos: 1,
    total_skills: 2,
    requisitos: {
      engines: ["openrouter"],
    },
    conteudo: {
      agentes: [
        { id: "auditor-compliance", role: "Auditor de Políticas e LGPD", skills: ["model-governance"] },
        { id: "analista-politicas", role: "Revisor de Termos e Licenças", skills: ["workspace-auditor"] },
      ],
      fluxos: [
        { id: "compliance-revisao-semanal", nome: "Revisão Semanal de Conformidade", trigger: "cron" },
      ],
      skills: [
        { id: "model-governance", nome: "model-governance", description: "Diretrizes de xB e segurança" },
        { id: "workspace-auditor", nome: "workspace-auditor", description: "Checklists de auditoria" },
      ],
    },
  },
];

export class PackStore {
  private readonly homeDir: string;
  private readonly packsDir: string;

  constructor(opts: { homeDir?: string; packsDir?: string } = {}) {
    this.homeDir = opts.homeDir ?? opencorpHome();
    this.packsDir = opts.packsDir ?? join(projectRoot(), "templates", "packs");
  }

  async listar(): Promise<PackResumo[]> {
    const mapa = new Map<string, PackResumo>();

    // 1. Carrega embutidos
    for (const p of PACKS_EMBUTIDOS) {
      mapa.set(p.id, {
        id: p.id,
        nome: p.nome,
        versao: p.versao,
        descricao: p.descricao,
        categoria: p.categoria,
        autor: p.autor,
        icone: p.icone,
        total_agentes: p.total_agentes,
        total_fluxos: p.total_fluxos,
        total_skills: p.total_skills,
        destaque: p.destaque,
      });
    }

    // 2. Escaneia diretórios de packs em disco (templates/packs e ~/.opencorp/packs)
    const dirsVarredura = [this.packsDir, join(this.homeDir, "packs")];
    for (const dir of dirsVarredura) {
      if (existsSync(dir)) {
        try {
          const entradas = readdirSync(dir, { withFileTypes: true });
          for (const e of entradas) {
            if (!e.isDirectory()) continue;
            const packJsonPath = join(dir, e.name, "pack.json");
            if (existsSync(packJsonPath)) {
              try {
                const dados = JSON.parse(readFileSync(packJsonPath, "utf8")) as Record<string, any>;
                mapa.set(dados.id || e.name, {
                  id: dados.id || e.name,
                  nome: dados.name || dados.nome || e.name,
                  versao: dados.version || dados.versao || "1.0.0",
                  descricao: dados.description || dados.descricao || "",
                  categoria: dados.category || dados.categoria || "Geral",
                  autor: dados.author || dados.autor || "Custom",
                  icone: dados.icon || dados.icone || "Package",
                  total_agentes: Array.isArray(dados.contents?.agents) ? dados.contents.agents.length : 0,
                  total_fluxos: Array.isArray(dados.contents?.flows) ? dados.contents.flows.length : 0,
                  total_skills: Array.isArray(dados.contents?.skills) ? dados.contents.skills.length : 0,
                  destaque: Boolean(dados.featured || dados.destaque),
                });
              } catch {}
            }
          }
        } catch {}
      }
    }

    return Array.from(mapa.values()).sort((a, b) => {
      if (a.destaque && !b.destaque) return -1;
      if (!a.destaque && b.destaque) return 1;
      return a.nome.localeCompare(b.nome);
    });
  }

  async obter(packId: string): Promise<PackDetalhado> {
    const embutido = PACKS_EMBUTIDOS.find((p) => p.id === packId);
    if (embutido) return embutido;

    const candidatos = [
      join(this.packsDir, packId, "pack.json"),
      join(this.homeDir, "packs", packId, "pack.json"),
    ];

    for (const packJsonPath of candidatos) {
      if (existsSync(packJsonPath)) {
        try {
          const dados = JSON.parse(readFileSync(packJsonPath, "utf8")) as Record<string, any>;
          return {
            id: dados.id || packId,
            nome: dados.name || dados.nome || packId,
            versao: dados.version || dados.versao || "1.0.0",
            descricao: dados.description || dados.descricao || "",
            categoria: dados.category || dados.categoria || "Geral",
            autor: dados.author || dados.autor || "Custom",
            icone: dados.icon || dados.icone || "Package",
            total_agentes: Array.isArray(dados.contents?.agents) ? dados.contents.agents.length : 0,
            total_fluxos: Array.isArray(dados.contents?.flows) ? dados.contents.flows.length : 0,
            total_skills: Array.isArray(dados.contents?.skills) ? dados.contents.skills.length : 0,
            requisitos: dados.requirements,
            conteudo: {
              agentes: Array.isArray(dados.contents?.agents) ? dados.contents.agents : [],
              fluxos: Array.isArray(dados.contents?.flows) ? dados.contents.flows : [],
              skills: Array.isArray(dados.contents?.skills) ? dados.contents.skills : [],
              assets: Array.isArray(dados.contents?.assets) ? dados.contents.assets : [],
            },
          };
        } catch (err: unknown) {
          throw new PackError(`Erro ao ler manifesto do pack "${packId}": ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    throw new PackError(`Pack de solução "${packId}" não encontrado.`);
  }

  /**
   * Instalação Atômica de um Pack no Workspace Ativo:
   * 1. Copia/registra agentes necessários em .opencorp/agents/
   * 2. Sincroniza agentes via OpenCodeBridge
   * 3. Registra os fluxos em .opencorp/flows/
   * 4. Copia as skills para .opencorp/skills/
   */
  async instalar(
    packId: string,
    ws: { id: string; path: string },
  ): Promise<ResultadoInstalacaoPack> {
    const pack = await this.obter(packId);
    const avisos: string[] = [];

    const dirAgents = join(ws.path, ".opencorp", "agents");
    const dirFlows = join(ws.path, ".opencorp", "flows");
    const dirSkills = join(ws.path, ".opencorp", "skills");

    mkdirSync(dirAgents, { recursive: true });
    mkdirSync(dirFlows, { recursive: true });
    mkdirSync(dirSkills, { recursive: true });

    const agentesInstalados: string[] = [];
    const fluxosInstalados: string[] = [];
    const skillsInstaladas: string[] = [];

    // 1. Instalação de Skills do Pack
    for (const skillItem of pack.conteudo.skills) {
      const skillId = skillItem.id;
      const destinoSkill = join(dirSkills, skillId);
      if (!existsSync(destinoSkill)) {
        mkdirSync(destinoSkill, { recursive: true });
        const skillMdConteudo = [
          "---",
          `name: ${skillId}`,
          `description: ${skillItem.description || `Skill ${skillId} provida pelo pack ${pack.nome}`}`,
          "allowed-tools: [bash, read, write]",
          "---",
          "",
          `# ${skillItem.nome || skillId}`,
          "",
          `Instruções operacionais e procedimentos para ${skillId}.`,
        ].join("\n");
        writeFileSync(join(destinoSkill, "SKILL.md"), `${skillMdConteudo}\n`, "utf8");
      }
      skillsInstaladas.push(skillId);
    }

    // 2. Instalação de Agentes do Pack
    const bridge = new OpenCodeBridge();
    for (const ag of pack.conteudo.agentes) {
      const agentFile = join(dirAgents, `${ag.id}.md`);
      const skillsDoAgente = ag.skills || [];
      const agentFrontmatter = [
        "---",
        `id: ${ag.id}`,
        `role: ${ag.role || ag.id}`,
        "category: operario",
        "model: openrouter/nvidia/nemotron-3.5-lightning:free",
        skillsDoAgente.length > 0 ? `skills: [${skillsDoAgente.join(", ")}]` : "skills: []",
        "tools: [read, write, bash, registry]",
        "permissions: level-2",
        "ativo: true",
        "---",
        "",
        `# ${ag.role || ag.id}`,
        "",
        `Você é o agente autônomo responsável pela missão de ${ag.role || ag.id} no workspace ${ws.id}.`,
      ].join("\n");

      await writeFileAtomic(agentFile, `${agentFrontmatter}\n`);
      agentesInstalados.push(ag.id);

      // Sincroniza via bridge
      try {
        await bridge.sincronizarAgente(
          ws.path,
          {
            id: ag.id,
            role: ag.role || ag.id,
            category: "operario",
            model: "openrouter/nvidia/nemotron-3.5-lightning:free",
            skills: skillsDoAgente,
            tools: ["read", "write", "bash", "registry"],
            permissions: "level-2",
            ativo: true,
          } as any,
          `Você é o agente autônomo responsável pela missão de ${ag.role || ag.id} no workspace ${ws.id}.`,
        );
      } catch (err: unknown) {
        avisos.push(`Aviso na sincronização do agente ${ag.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 3. Instalação de Fluxos do Pack
    for (const fl of pack.conteudo.fluxos) {
      const flowFile = join(dirFlows, `${fl.id}.json`);
      const flowConteudo = {
        id: fl.id,
        name: fl.nome || fl.id,
        ativo: true,
        nos: [
          { id: "gatilho", tipo: fl.trigger || "manual", config: {} },
          { id: "execucao", tipo: "script", config: { comando: "echo 'executando passo do pack'" } },
        ],
        arestas: [{ de: "gatilho", para: "execucao" }],
      };
      await writeFileAtomic(flowFile, `${JSON.stringify(flowConteudo, null, 2)}\n`);
      fluxosInstalados.push(fl.id);
    }

    return {
      ok: true,
      packId: pack.id,
      workspace: ws.id,
      instalados: {
        agentes: agentesInstalados,
        fluxos: fluxosInstalados,
        skills: skillsInstaladas,
      },
      avisos: avisos.length > 0 ? avisos : undefined,
    };
  }
}
