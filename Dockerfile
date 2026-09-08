# ==============================================================================
# OpenCorp Autonomous OS — Dockerfile All-in-One (Dev & Production)
# ==============================================================================
FROM node:22-bookworm-slim AS base

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production
ENV OPENCORP_HOME=/data
ENV PATH="/data/.opencorp/bin:/root/.opencorp/bin:/root/.opencode/bin:${PATH}"

# Instala ferramentas essenciais do SO, compilador Go e utilitários
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    ca-certificates \
    golang-go \
    python3 \
    sqlite3 \
    build-essential \
    procps \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instala dependências com cache otimizado
COPY package*.json ./
RUN npm install --include=dev

# Copia todo o código-fonte do projeto
COPY . .

# Compila TypeScript e a interface Web (web-dist)
RUN npm run build

# Cria diretórios de dados e binários isolados
RUN mkdir -p /data/.opencorp/bin /data/workspaces /data/logs /root/.opencorp/bin

# Prepara o binário do OpenCode via instalador oficial ou npm
RUN curl -fsSL https://opencode.ai/install.sh | bash || \
    npm install -g @anthropic-ai/claude-code || true

# Expõe a porta padrão do OpenCorp
EXPOSE 4100

# Volume persistente para dados, workspaces e banco de dados SQLite
VOLUME ["/data"]

# Healthcheck do serviço
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://127.0.0.1:4100/health || curl -f http://127.0.0.1:4100/ || exit 1

# Comando padrão para iniciar o OpenCorp serve
CMD ["node", "bin/opencorp.mjs", "serve", "--host", "0.0.0.0", "--port", "4100"]
