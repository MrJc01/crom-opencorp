# 🚀 Regras de Deploy, Repositórios e Guia de Publicação

Este documento estabelece as diretrizes de governança, ciclo de release e regras de sincronização entre o **Repositório Pessoal (Desenvolvimento)** e o **Repositório Oficial da Organização (Crom-Org)**.

---

## 🏛️ 1. Mapeamento dos Repositórios

| Repositório | Remote Git | URL | Finalidade |
|---|---|---|---|
| **Desenvolvimento Ativo (Pessoal)** | `origin` | `https://github.com/MrJc01/crom-opencorp.git` | Desenvolvimento contínuo, branches de trabalho, testes de recursos, refatorações experimentais e validações rápidas. |
| **Oficial / Produção (Organização)** | `crom` | `https://github.com/crom-org/opencorp.git` | Fonte oficial e canônica para o ecossistema Crom, releases estáveis (tags `vX.Y.Z`), documentação pública e pacotes de produção. |

---

## 📦 2. O que publicar em cada repositório?

### 🛠️ A. No Repositório Pessoal (`MrJc01/crom-opencorp`)
* **Commits frequentes e incrementais:** Novas rotas, correções de bugs, ajustes de layout ou componentes SolidJS.
* **Branches experimentais:** Novas integrações de motores (harnesses), provas de conceito e spikes.
* **Rascunhos de documentação:** Planos técnicos (`PLANO-*.md`), handoffs de sessão e anotações arquiteturais.
* **Testes exploratórios:** Testes de carga, validação de provedores LLM ou modelos novos.

### 🏛️ B. No Repositório Oficial (`crom-org/opencorp`)
* **Apenas versões consolidadas e testadas:** Nenhum commit com build quebrado ou testes em falha.
* **Releases com Tags SemVer:** Tags no formato `vX.Y.Z` (ex.: `v0.7.0`, `v0.8.0`).
* **Bundle Web compilado e atualizado:** Artefatos em `web-dist/` correspondendo à última versão de `src/web/`.
* **Documentação oficial e limpa:** Guias de instalação, quickstart, manuais de comandos (`opencorp` e `oc`), arquitetura de workspaces e referência de API.
* **Changelog e Notas de Release:** Resumo das capacidades entregues em `docs/release-vX.Y.Z.md`.

---

## 🛡️ 3. Regras e Checklist Pré-Deploy (Quality Gate)

Antes de realizar o push para o repositório oficial (`crom`), **TODOS** os passos abaixo devem ser cumpridos com sucesso:

### Checklist Automatizado

```bash
# 1. Verificar tipagem estática (sem erros)
npx tsc --noEmit

# 2. Executar suíte de testes unitários e de integração
npm test

# 3. Executar testes ponta a ponta (E2E) com Playwright
npx playwright test

# 4. Compilar Backend (TypeScript) e Frontend Web (SolidJS/Vite)
npm run build
```

### Checklist de Segurança e Higiene
1. **Nenhum Segredo no Git:** Certifique-se de que nenhum arquivo de credenciais, tokens de API (`OPENROUTER_API_KEY`, `.env`), banco SQLite `.opencorp/corp.db` ou logs locais estejam rastreados pelo Git.
2. **Atualização de Versão:** Incremente a versão no `package.json` caso seja uma nova release estável.
3. **Testes de Regressão da UI:** Validar que o painel web inicializa em `http://localhost:4100` sem erros no console do navegador.

---

## 🔄 4. Fluxo de Trabalho e Comandos Git

### Sincronização e Configuração Inicial dos Remotes
Para conferir se os dois remotes estão cadastrados:
```bash
git remote -v
# Deve exibir:
# crom    https://github.com/crom-org/opencorp.git (fetch/push)
# origin  https://github.com/MrJc01/crom-opencorp.git (fetch/push)
```

Caso precise configurar:
```bash
git remote add origin https://github.com/MrJc01/crom-opencorp.git
git remote add crom https://github.com/crom-org/opencorp.git
```

---

### Passo a Passo: Publicando no Pessoal (Desenvolvimento)
```bash
# 1. Adicionar arquivos modificados
git add .

# 2. Commit semântico
git commit -m "feat(historico): adiciona botao de retry e clone cross-workspace de execucoes"

# 3. Enviar para o repositório pessoal
git push origin main
```

---

### Passo a Passo: Publicando no Oficial (Crom-Org)
Após rodar os testes e validar que a versão está estável:

```bash
# 1. Garantir que a branch local está sincronizada com a origin
git push origin main

# 2. Publicar a branch principal na organização crom-org
git push crom main

# 3. Se for uma nova versão de release, criar e enviar a tag:
git tag -a v0.7.0 -m "Release v0.7.0: Suporte unificado a retry de execucoes, painel SolidJS e catalogo"
git push crom v0.7.0
```

---

## ⚙️ 5. Regras de Deploy em Servidor de Produção

No servidor onde o OpenCorp roda como serviço de background (ex.: `systemd` user service):

### 1. Atualização do Servidor
```bash
# Entrar no diretório do projeto
cd /home/j/Documentos/GitHub/crom-worker-opencode

# Puxar as atualizações da branch principal oficial
git pull crom main

# Instalar eventuais novas dependências
npm install

# Compilar TypeScript e o frontend Web
npm run build
```

### 2. Reiniciar o Serviço Supervisionado
O daemon de produção supervisiona automaticamente a API (`serve`) e o agendador (`scheduler`):

```bash
# Reiniciar o serviço systemd do usuário
systemctl --user restart opencorp-daemon.service

# Verificar status imediato
systemctl --user status opencorp-daemon.service

# Conferir logs em tempo real
journalctl --user -u opencorp-daemon.service -f
```

### 3. Validação do Healthcheck
```bash
curl -s http://localhost:4100/health
# Resposta esperada: {"ok":true,"versao":"..."}
```

---

## 📌 6. Resumo das Responsabilidades

- **MrJc01/crom-opencorp**: Onde o trabalho é construído, testado, quebrado e refinado.
- **crom-org/opencorp**: A vitrine estável do produto, consumida por operadores e agentes em produção.
- **Nunca fazer push com `--force`** no repositório da organização `crom`.
