# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## 0.7.0 — 2026-09-01

Ciclo completo do PLANO-COMPLETO (29 pedidos, docs/PLANO-COMPLETO.md) — painel web reconstruído sobre a estrutura Preline:

- **Etapa 0 — Fundação:** primitivas de UI reutilizáveis (drawer/tabs/posição de menu), navbar colapsável no desktop com scrollbar invisível, tasks com overflow scroll por coluna e Reuniões removida do navbar (rota mantida como aba do Secretário).
- **Etapa 1 — Secretário v2:** chat estilo ChatGPT/opencode com drawer lateral direito global (floating; mobile tela cheia), rascunho sincronizado página ↔ lateral e histórico como popup limpo (busca, Hoje/Ontem/Anteriores).
- **Etapa 1c — Estrutura Preline:** topbar sticky (breadcrumb + busca global + ações), page-header padronizado em todas as views e design system de cards/botões/inputs — sem bundle JS.
- **Etapa 2 — Composer `/ @ !`:** parser puro de comandos, paleta de comandos (opencorp + passthrough opencode), `@` contexto clicável (arquivos/agentes/tasks) e `!` terminal com whitelist, sanitização e execução sem shell.
- **Etapa 3 — Workspace VS Code:** árvore de arquivos (cap 800, depth ≤6) + tabs com modos editor/preview/lado a lado, salvamento com cap 1MB e terminais em tabs (até 4).
- **Etapa 4 — Apps & Secrets:** perfis tipados `app:vps|wordpress|mercadopago|cartao|custom` com validação zod, cartão rejeita número completo/CVV (422), valores nunca expostos em GET.
- **Etapa 5 — Catálogo de Agentes:** campo `ativo` com seções Ativos × Catálogo, 6 templates de áreas nascem desativados, semeadura idempotente e guard único de execuções (409 para inativos).
- **Etapa 6 — Reuniões v2:** chat em grupo com seleção de participantes, loop desligável por consenso ([CONSENSO-ENCERRAR]), sala ao vivo com feed em tempo real, encerramento manual e agendamento automático via schedule.
- **Etapa 7 — Notificações:** store por workspace + endpoints (`GET/POST /notifications`, `PATCH :id/lida`), tool `notificar` para os agentes, página com feed lidas/não lidas, badge no navbar e push SSE.
- **Etapa 8 — Config fix:** toggle global × workspace respeitado no `GET /settings`, badges de origem em cada campo e escrita coerente com o escopo.
- **Etapa 9 — Home dashboard:** KPIs (tasks vencidas, custos do dia, saúde dos daemons, fluxos ativos, notificações) com degradação graciosa + barra de comando que inicia conversa no Secretário.
- **Etapa 10 — Integrações (análise):** ADR-0001 comparando webhook × agente-bridge × plugin opencode para canais (WhatsApp/Telegram) com decisão documentada, e esqueleto de canais no core com fallback de notificação (sem provider ainda).
- **Etapa 11 — QA/docs:** revisão de segurança final (secrets sem retorno, whitelist de terminal, realpath, cartão ofuscado, hooks com token), docs 06 atualizado e este changelog.

## 0.6.0

- Painel web CRUD completo (tasks, agentes, agenda, fluxos, hooks, apps, config), Secretário v1, mini-apps, testes cegos, self-healing, orçamento e HITL.
