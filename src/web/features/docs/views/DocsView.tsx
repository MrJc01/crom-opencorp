import React, { useState, type FC } from "react";
import { BookOpen, Search, FileText, ChevronRight, Copy, Check } from "lucide-react";
import { showToast } from "../../../shared/ui/Toast.js";

interface DocumentoItem {
  id: string;
  titulo: string;
  categoria: string;
  conteudo: string;
}

const DOCUMENTOS_SISTEMA: DocumentoItem[] = [
  {
    id: "agents-governance",
    titulo: "Diretrizes de Agentes (AGENTS.md)",
    categoria: "Governança",
    conteudo: `# AGENTS.md — Diretrizes de Engenharia e Governança do OpenCorp

## 1. Princípios Arquiteturais Mestres
1. **O Fluxo comanda tudo (Paradigma n8n)**:
   - Toda automação, rotina periódica e reação a eventos pertence a um Fluxo (.opencorp/flows/<id>.json).
   - Gatilhos de agendamento (cron), pontos de entrada (webhook) e orquestrações encadeadas devem residir nos nós do fluxo.
2. **Supervisor Global Unificado**:
   - O agendamento de todos os workspaces é gerenciado centralmente pelo daemon do OpenCorp.
3. **Papel do Secretário**:
   - O Secretário Executivo é o supervisor residente do workspace. Ele consulta status, diagnostica logs e orquestra ações.
4. **Governança xB**:
   - Modelos < 14B: checagem determinística.
   - Modelos 14B-35B: redação e resumos.
   - Modelos > 70B: Secretário Executivo, curadoria e raciocínio profundo.`,
  },
  {
    id: "architecture-overview",
    titulo: "Visão Geral da Arquitetura DDD",
    categoria: "Arquitetura",
    conteudo: `# Visão Geral da Arquitetura DDD do OpenCorp

O OpenCorp foi refatorado cirurgicamente seguindo os princípios de Domain-Driven Design (DDD):
- **src/core/contexts/agents/**: Gestão de agentes, personas e catálogos.
- **src/core/contexts/flows/**: Orquestração de workflows e grafos de execução.
- **src/core/contexts/tasks/**: Gestão de tarefas Kanban com persistência SQLite WAL.
- **src/core/contexts/workspace/**: Checkpoints Git, isolamento de ambiente e telemetria.
- **src/sdk/**: Cliente TypeScript com contratos tipados e tratamento de erros RFC 7807.`,
  },
  {
    id: "sdk-usage",
    titulo: "Guia de Uso do @opencorp/sdk",
    categoria: "SDK & APIs",
    conteudo: `# Guia de Uso do @opencorp/sdk

O SDK oficial fornece uma interface fluente para consumo de todos os módulos:
\`\`\`typescript
import { OpenCorpClient } from "@opencorp/sdk";

const client = new OpenCorpClient({
  baseUrl: "http://127.0.0.1:4100",
  token: process.env.OPENCORP_TOKEN,
  workspaceId: "default",
});

// Listar tarefas do Kanban
const tarefas = await client.tasks.listar();

// Enviar mensagem ao Secretário
const resposta = await client.secretary.enviarMensagem({
  mensagem: "Analise a saúde do workspace",
});
\`\`\``,
  },
];

export const DocsView: FC = () => {
  const [busca, setBusca] = useState("");
  const [docAtivoId, setDocAtivoId] = useState(DOCUMENTOS_SISTEMA[0].id);
  const [copiado, setCopiado] = useState(false);

  const docAtivo =
    DOCUMENTOS_SISTEMA.find((d) => d.id === docAtivoId) || DOCUMENTOS_SISTEMA[0];

  const docsFiltrados = DOCUMENTOS_SISTEMA.filter(
    (d) =>
      d.titulo.toLowerCase().includes(busca.toLowerCase()) ||
      d.categoria.toLowerCase().includes(busca.toLowerCase()),
  );

  const copiarConteudo = () => {
    if (!docAtivo) return;
    navigator.clipboard.writeText(docAtivo.conteudo);
    setCopiado(true);
    showToast("Documento copiado para a área de transferência", "sucesso");
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <div className="flex flex-col lg:flex-row h-full w-full bg-zinc-950 overflow-hidden select-text">
      {/* Navegação de Tópicos */}
      <aside className="w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-zinc-850 p-4 space-y-4 flex-shrink-0 bg-zinc-950/80">
        <div>
          <h2 className="text-xs font-bold text-zinc-100 flex items-center gap-1.5 uppercase tracking-wider">
            <BookOpen size={14} className="text-emerald-400" />
            Documentação Técnica
          </h2>
          <p className="text-[11px] text-zinc-500 mt-0.5">Guias do sistema e especificações</p>
        </div>

        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar tópicos..."
            className="w-full pl-8 pr-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="space-y-1 overflow-y-auto max-h-48 lg:max-h-[calc(100vh-180px)]">
          {docsFiltrados.map((doc) => {
            const ativo = doc.id === docAtivoId;
            return (
              <button
                key={doc.id}
                type="button"
                onClick={() => setDocAtivoId(doc.id)}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left text-xs transition-colors cursor-pointer ${
                  ativo
                    ? "bg-emerald-950/40 text-emerald-300 border border-emerald-800/40 font-semibold"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <FileText size={13} className={ativo ? "text-emerald-400" : "text-zinc-500"} />
                  <span className="truncate">{doc.titulo}</span>
                </div>
                <ChevronRight size={13} className="opacity-40" />
              </button>
            );
          })}
        </div>
      </aside>

      {/* Conteúdo do Documento */}
      <section className="flex-1 p-6 lg:p-8 overflow-y-auto space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-850">
          <div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-850 text-zinc-400">
              {docAtivo.categoria}
            </span>
            <h1 className="text-xl font-bold text-zinc-100 mt-1">{docAtivo.titulo}</h1>
          </div>

          <button
            type="button"
            onClick={copiarConteudo}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-xs text-zinc-300 transition-colors cursor-pointer"
          >
            {copiado ? <Check size={14} className="text-emerald-400" /> : <Copy size={13} />}
            <span>{copiado ? "Copiado!" : "Copiar"}</span>
          </button>
        </div>

        <div className="bg-zinc-900/40 border border-zinc-850/80 rounded-2xl p-6 font-mono text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap max-w-4xl shadow-inner">
          {docAtivo.conteudo}
        </div>
      </section>
    </div>
  );
};
