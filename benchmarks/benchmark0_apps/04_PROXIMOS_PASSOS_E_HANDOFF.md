# 04. Próximos Passos e Handoff para a Próxima Fase

Este documento prepara o terreno para a próxima IA ou sessão de desenvolvimento, estabelecendo a ponte direta com o estudo [estudo_arquitetura_templates_analytics_notificacoes.md](file:///home/j/.gemini/antigravity-ide/brain/a44b5b8b-6a6c-4465-8ffb-8a8d507d30d1/estudo_arquitetura_templates_analytics_notificacoes.md) e o plano [plano_teste_24h_10_workspaces.md](file:///home/j/.gemini/antigravity-ide/brain/a44b5b8b-6a6c-4465-8ffb-8a8d507d30d1/plano_teste_24h_10_workspaces.md).

---

## 1. Diretrizes Inegociáveis do Operador

Ao prosseguir para a criação de novos templates e workspaces, **respeite estritamente as 4 regras fixadas pelo usuário**:

1. **Tasks Iniciais de Configuração Obrigatórias (Day 0 Setup)**:
   - Nenhum workspace pode nascer executando apenas uma rotina diária repetitiva.
   - Todo projeto deve começar com uma esteira de **Setup Inicial** no Kanban:
     * Definição de Nicho, Nome do Projeto, Bio e Posicionamento.
     * Brand Kit: Cores, tipografia, prompts de capa e banner em SVG.
     * Manual de Retenção e Roteiro / Diretrizes Operacionais (`docs/manual_producao.md`).
     * Banco inicial de 30 pautas/ideias validadas (`registries/pautas.json`).
     * Calibração técnica do ambiente.

2. **Auto-Evolução e Mudança Contínua (Self-Improving Engine)**:
   - O sistema deve auditar as entregas periodicamente.
   - Detectar gargalos (ex: retenção baixa, introdução demorada, títulos com baixo apelo).
   - O script de auto-evolução (`auto_evolucao.mjs`) deve **reescrever os manuais dos agentes** em `.opencorp/agents/*.md` adicionando tags `<!-- AUTO-APRENDIZADO YYYY-MM-DD -->`.
   - Registrar no Kanban a conclusão da melhoria.

3. **Zero Contas Externas ("O Sistema Se Vira Sozinho")**:
   - O usuário **NÃO deve precisar criar contas** no Cloudflare, Vercel, AWS ou fornecer cartões/tokens.
   - Para expor serviços na internet: Utilizar os **Quick Tunnels públicos e anônimos da Cloudflare** (`cloudflared tunnel --url http://127.0.0.1:4100`), que criam URLs públicas `https://*.trycloudflare.com` sem exigir nenhum cadastro.
   - Para síntese de voz e vídeo: Utilizar ferramentas 100% locais e gratuitas (Node + `edge-tts` para voz neural em pt-BR + `ffmpeg` local).
   - Para banco de dados: SQLite nativo com WAL (`tasks.db`).

4. **Isolamento da VPS**:
   - **Nenhum novo projeto usa a VPS**.
   - Apenas o `pulso-diario` legado permanece alocado na VPS existente. Todos os novos workspaces rodam no ambiente local e usam túnel público anônimo.

---

## 2. Roteiro Imediato de Execução

1. **Template `templates/youtube-video-factory`**:
   - Concluir os scripts de automação (`setup_inicial.mjs`, `produzir_video.mjs`, `auto_evolucao.mjs`).
   - Finalizar o Mini-App em `apps/youtube-factory/index.html` com player integrado.
2. **Script de Inicialização dos 10 Workspaces (`scripts/bootstrap_10_autonomos.mjs`)**:
   - Disparar a criação das 10 bases simultâneas.
   - Semear as tarefas de Day 0 no banco SQLite de cada workspace.
   - Ativar os daemons de auto-evolução para o teste de 24 horas.
