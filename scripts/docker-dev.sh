#!/usr/bin/env bash
# ==============================================================================
# Script de Desenvolvimento & Testes Zerados em Docker (OpenCorp)
# ==============================================================================
set -euo pipefail

PORT="${PORT:-4200}"
DATA_DIR="${DATA_DIR:-./data-dev}"
CLEAN="${1:-}"

echo "======================================================"
echo "🤖 OpenCorp Docker Environment (Dev & Testes Zerados)"
echo "======================================================"

if [ "$CLEAN" = "clean" ] || [ "$CLEAN" = "--clean" ]; then
  echo "🧹 Limpando volume de dados anterior ($DATA_DIR)..."
  rm -rf "$DATA_DIR"
fi

mkdir -p "$DATA_DIR"

echo "📦 Construindo e subindo container na porta http://localhost:$PORT..."
echo "📁 Volume de dados montado em: $DATA_DIR"

docker build -t opencorp:dev .

echo "🚀 Iniciando OpenCorp..."
docker run --rm -it \
  -p "$PORT:4100" \
  -v "$(pwd)/$DATA_DIR:/data" \
  -e OPENCORP_HOME=/data \
  --name opencorp-dev \
  opencorp:dev
