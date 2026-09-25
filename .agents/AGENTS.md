# AGENTS.md — Diretrizes de Engenharia e Governança do OpenCorp

> Este documento define as regras arquiteturais, padrões de código e diretrizes de desenvolvimento para agentes de IA que operam no repositório **OpenCorp** (`MrJc01/crom-opencorp`).

---

## 1. Princípios Arquiteturais Mestres

1. **O Fluxo comanda tudo (Paradigma n8n)**:
   - Toda automação, rotina periódica e reação a eventos pertence a um **Fluxo** (`.opencorp/flows/<id>.json`).
   - Gatilhos de agendamento (`cron`), pontos de entrada (`webhook`) e orquestrações encadeadas (`subflow`) devem residir nos nós do fluxo, nunca em scripts de loop infinito (`while true`).
2. **Supervisor Global Unificado**:
   - O agendamento de todos os workspaces é gerenciado centralmente pelo daemon do OpenCorp (`scheduler.db`).
   - O supervisor avalia periodicamente os nós de gatilho ativos e despacha as execuções de forma pontual e assíncrona.
3. **Papel do Secretário**:
   - O Secretário Executivo é o supervisor residente do workspace. Ele consulta status, diagnostica logs, lê a documentação em `docs/` e orquestra ações.
4. **Papel do Quadro Kanban (`tasks.db`)**:
   - É o quadro operacional onde os próprios agentes se organizam autonomamente e exibem em tempo real para o Cliente/Operador e para o Secretário o progresso das atividades.
5. **Comunicação com o Usuário**:
   - Embora as diretrizes e os schemas técnicos sigam o padrão internacional da indústria, toda interação, relatório e comunicação com o usuário deve ser conduzida nativamente em **Português do Brasil (PT-BR)**.

---

## 2. Governança e Seleção de Modelos (Dimensionamento xB)

Ao configurar agentes, fluxos ou rotinas:
- **Mini-Agentes (< 14B)**: Utilizar para validações determinísticas, checagem de estoque, deduplicação de listas e formatação simples.
- **Agentes Redatores (14B a 35B)**: Utilizar para redação de roteiros, resumos analíticos e geração de títulos.
- **Raciocínio / Secretário (> 70B e Flagships)**: Utilizar para o Secretário Executivo, curadoria investigativa e diagnóstico de incidentes (Gemini Flash/Pro via motor AGY, Nemotron Ultra 550B, Claude).
- ⛔ **Modelos Proibidos para Agentes**: Jamais atribuir modelos `< 4B` (ex: `liquid 2.6b`) ou roteadores cegos (`openrouter/free`) a agentes autônomos com ferramentas.

---

## 3. Padrões de Código TypeScript e Qualidade

1. **Tipagem e Schemas Rigorosos**:
   - Toda entrada externa, configuração de fluxo e dados de registro devem ser validados via **Zod** (`src/schemas/`).
   - Não utilizar `any` solto em assinaturas públicas; definir interfaces explícitas.
2. **Operações Atômicas de Filesystem**:
   - Gravações em disco devem usar `writeFileAtomic` de `src/utils/fs-safe.ts` para evitar arquivos corrompidos em caso de parada abrupta.
3. **Tratamento de Erros Sem Silenciamento**:
   - Erros devem ser capturados e propagados via classes customizadas derivadas de `OpencorpError` (`src/core/shared/errors.ts`) ou classes ativas em `src/core/domain/`, com serialização HTTP padronizada em RFC 7807 (`ProblemDetails`).
4. **Resiliência e Timeouts**:
   - Requisições HTTP e execuções de scripts devem sempre possuir timeouts declarados (`AbortSignal.timeout` ou `timeout_ms`).
5. **Zero Mocks em Produção**:
   - O sistema opera com esteiras reais (FFMPEG, Piper TTS, SQLite WAL, Git checkpoints). Mantenha a integridade das integrações reais.
