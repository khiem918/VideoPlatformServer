#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/../Infra"

PORTS=(5434 6379 6333 6334)

stop_existing() {
  echo "==> Stopping existing containers..."
  docker compose -f "$INFRA_DIR/Postgres/docker-compose.yml" down 2>/dev/null || true
  docker compose -f "$INFRA_DIR/Redis/docker-compose.yml" down 2>/dev/null || true
  docker compose -f "$INFRA_DIR/Qdrant/docker-compose.yml" down 2>/dev/null || true
}

free_port() {
  local port=$1
  local pids
  pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "  Port $port still in use by host process — killing PID(s): $pids"
    kill -9 $pids 2>/dev/null || true
    sleep 0.3
  fi
}

stop_existing

echo "==> Freeing any remaining host processes on ports: ${PORTS[*]}"
for port in "${PORTS[@]}"; do
  free_port "$port"
done

echo "==> Starting Postgres..."
docker compose -f "$INFRA_DIR/Postgres/docker-compose.yml" up -d

echo "==> Starting Redis..."
docker compose -f "$INFRA_DIR/Redis/docker-compose.yml" up -d

echo "==> Starting Qdrant..."
docker compose -f "$INFRA_DIR/Qdrant/docker-compose.yml" up -d

echo ""
echo "All containers started."
echo "  Postgres : localhost:5434"
echo "  Redis    : localhost:6379"
echo "  Qdrant   : localhost:6333 (HTTP) / 6334 (gRPC)"
