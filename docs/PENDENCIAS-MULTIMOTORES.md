# Pendências — arquitetura multimotores

Lista do que ficou para depois da conclusão das Etapas 0–15 do
[plano de execução](PLANO-EXECUCAO-ARQUITETURA-MULTIMOTORES.md) (seção 13 do plano tem o histórico completo).
Estado de referência: branch `claude/brave-tesla-q1dcyv`, commit `82a8739` (26/09/2026).

Legenda de prioridade: 🔴 alta · 🟡 média · 🟢 baixa.

---

## 1. Testes contra motores reais (consomem cota / exigem login)

A lógica foi validada com fakes fiéis aos protocolos reais; falta confirmar contra os serviços de verdade.

| ID | Prioridade | O que falta | Como fazer | Pronto quando |
|---|---|---|---|---|
| P-01 | 🟡 | Probe real do **Codex** (inferência, streaming, ferramentas, conversa) | `OPENCORP_REAL_PROBES=codex OPENCORP_PROBE_CODEX_MODEL=<modelo> npm run test:real` | Todos os níveis de saúde PASS com a conta do usuário |
| P-08 | 🟡 | Conversa real via **ACP** com Copilot e MiMo (só o handshake foi verificado) | Fazer login (`copilot` / `mimo auth login`) e rodar `OPENCORP_REAL_PROBES=copilot,mimo OPENCORP_PROBE_COPILOT_MODEL=<m> OPENCORP_PROBE_MIMO_MODEL=<m> npm run test:real` | `tests/real/acp-conversation.real.test.ts` PASS para os dois |
| P-09 | 🟡 | Seleção de modelo do **Copilot** via `session/set_config_option` não verificada | Rodar P-08 com modelo explícito; se o agente não expuser o seletor, iniciar o processo com `--model` (`launchModelArgs` em `src/core/engines/acp/vendors.ts`) | Conversa com modelo explícito não falha com `MODEL_INCOMPATIBLE` |
| — | 🟢 | Botão **"Teste funcional"** da UI não exercitado com inferência real | Com um motor instalado e autenticado: Configurações › Motores › Teste funcional | Chips de nível exibem o resultado real sem erro de console |

> O tier gratuito do MiMo foi encerrado: sem conta paga, P-08 para o MiMo resulta (corretamente) em `ENGINE_AUTH_REQUIRED`.

## 2. Testes E2E e qualidade

| ID | Prioridade | Pendência | Detalhe | Pronto quando |
|---|---|---|---|---|
| P-12 | 🔴 | **15 testes Playwright falhando** | `config.spec` ×5, `agentes-catalogo.spec` ×4, `chat.spec` ×2, `engine-accounts-limits.spec` ×2, `engine-live-tokens-full.spec` ×2. As mesmas falhas ocorrem na base `fcc5f2d` (não são regressões da migração), mas bloqueiam o item "E2E verdes" da definição de pronto | `npm run test:e2e` 100% verde |
| P-13 | 🟢 | Sem suíte de **acessibilidade** para as seleções/erros novos (seletor de motor, banner de migração, chips de saúde, selos do catálogo) | Sugestão: `@axe-core/playwright` nas telas de Configurações › Motores e no `ModelPicker` | Zero violações sérias/críticas nessas telas |

## 3. Comportamento e produto

| ID | Prioridade | Pendência | Detalhe | Pronto quando |
|---|---|---|---|---|
| P-03 | 🟡 | Desconectar o motor padrão ainda troca para **`opencode` fixo** | Já grava em `settings.run_engine`, só troca se o motor era o padrão e informa na resposta (UI confirma). Falta deixar o usuário escolher o substituto ou deixar o padrão vazio com erro explícito na próxima execução (D1). Rota: `POST /api/motores/:id/desconectar` em `src/server/routes/config.ts` | Nenhum motor é escolhido implicitamente |
| P-02 | 🟢 | Sessões do adaptador **Codex** ficam só em memória | Após reinício a conversa é retomada via `thread/resume`, mas título/modelo da sessão se perdem | Metadados persistidos (ex.: junto do `ProcessRegistry` ou do workspace) |
| P-06 | 🟢 | **Instalação gerenciada** só tem artefatos aprovados para Codex e OpenCode | Demais motores dependem de instalação manual / `PATH` / `binary_path` | Entradas adicionadas apenas com SHA-256 publicado pelo fornecedor |
| — | 🟢 | `opencorp doctor` ainda verifica "opencode no PATH" | Deveria verificar os motores efetivamente configurados (`run_engine.default`, `default_conversation_engine`, overrides de workspace) | `doctor` não exige OpenCode quando ele não está configurado |

## 4. Depreciação do formato legado (D6)

A remoção do tradutor (`runner.json`, `harness:`, `harness_fallback:`, `model_fallback:`) só pode acontecer
quando **todas** as condições de [`DEPRECACOES-MULTIMOTORES.md`](DEPRECACOES-MULTIMOTORES.md) forem cumpridas:

| ID | Condição | Estado |
|---|---|---|
| — | 60 dias desde o primeiro aviso (no mínimo **24/11/2026**) | ⏳ aguardando data |
| P-11 | Duas versões menores publicadas com o tradutor e o aviso | ⬜ nenhuma publicada |
| — | Remoção apenas na **v2.0.0** ou posterior | ⬜ |

Checklist da remoção (para quando as condições forem atendidas):

- [ ] Publicar 1ª versão menor com o tradutor (registrar na seção 14 do plano).
- [ ] Publicar 2ª versão menor com o tradutor.
- [ ] Confirmar que `opencorp migrate-configs --check` retorna 0 nos ambientes conhecidos.
- [ ] Remover leitura de `runner.json` em `src/core/config/run-engine-config.ts` e o `LegacyConfigTranslator`.
- [ ] Remover aliases legados de agentes em `src/schemas/agent.ts` (manter `migrate-configs` por mais uma versão, se desejado).
- [ ] Atualizar README, `docs/04-motores-e-modelos.md` e notas de release da v2.0.0.

## 5. Registro de marcos em aberto

A seção 14 do plano ainda tem os marcos sem data/commit (plano aprovado, primeiro aviso legado, versões menores,
runtimes validados, ACP validado, catálogo soberano, liberação 2.0). Preencher conforme os itens acima forem fechados.

---

### Ordem sugerida

1. **P-12** — estabilizar o E2E (único bloqueio da definição global de pronto).
2. **P-03** e ajuste do `doctor` — pequenos e fecham os últimos resquícios de "OpenCode implícito".
3. **P-01 / P-08 / P-09** — quando houver contas autenticadas e cota disponível.
4. **P-13**, **P-02**, **P-06** — melhorias.
5. **P-11** e remoção do legado — a partir de 24/11/2026, na v2.0.0.
