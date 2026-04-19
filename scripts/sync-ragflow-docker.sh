#!/usr/bin/env bash
# Đồng bộ lại các file docker chính thức của RAGFlow vào docker/ragflow/upstream/
set -euo pipefail
REF="${1:-main}"
BASE="https://raw.githubusercontent.com/infiniflow/ragflow/${REF}/docker"
DEST="$(dirname "$0")/../docker/ragflow/upstream"
mkdir -p "$DEST"
for f in docker-compose.yml docker-compose-base.yml init.sql service_conf.yaml.template entrypoint.sh; do
  curl -fsSL "$BASE/$f" -o "$DEST/$f"
done
chmod +x "$DEST/entrypoint.sh" 2>/dev/null || true
echo "Đã tải vào $DEST — hãy so sánh và gộp thủ công .env nếu upstream đổi biến."
