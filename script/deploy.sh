#!/bin/bash
# deploy.sh — runs on EC2 via SSM
# Updates api_service or search_service via docker compose v2.
# Compose files are pulled from S3 (no git pull needed on EC2).

set -euo pipefail

SERVICE="${1:-}"
S3_BUCKET="${DEPLOY_S3_BUCKET:-videoplatform-deploy-artifacts-dsk}"
S3_PREFIX="${DEPLOY_S3_PREFIX:-compose}"
COMPOSE_DIR="/app/compose"

if [ -z "$SERVICE" ]; then
  echo "usage: $0 <api|search>" >&2
  exit 1
fi

mkdir -p "$COMPOSE_DIR"
cd "$COMPOSE_DIR"

echo "[deploy] syncing compose files from s3://${S3_BUCKET}/${S3_PREFIX}/ ..."
aws s3 sync "s3://${S3_BUCKET}/${S3_PREFIX}/" "$COMPOSE_DIR/" --delete

# Detect env var name used in DATABASE_URL to extract host/port for the wait probe.
# Expected: postgres://user:pass@HOST:PORT/db  or  postgresql://...
extract_db_host_port() {
  python3 -c "
import os, sys, urllib.parse
url = os.environ.get('DATABASE_URL', '')
if not url:
    sys.exit('DATABASE_URL not set')
p = urllib.parse.urlparse(url)
print(p.hostname or 'postgres')
print(str(p.port or 5432))
"
fi

if [ "$SERVICE" = "api" ]; then
  COMPOSE_FILE="docker-compose.api-service.yml"
  ENV_FILE="$COMPOSE_DIR/.env.api"
  SECRET_ID="prod/backend/api-service"
  COMPOSE_SERVICE="api_service"
  ECR_REPO="api-service"
elif [ "$SERVICE" = "search" ]; then
  COMPOSE_FILE="docker-compose.search-service.yml"
  ENV_FILE="$COMPOSE_DIR/.env.search"
  SECRET_ID="prod/backend/search-service"
  COMPOSE_SERVICE="search_service"
  ECR_REPO="search-service"
else
  echo "[deploy] unknown service: $SERVICE" >&2
  exit 1
fi

echo "[deploy] fetching secrets: $SECRET_ID"
SECRET_JSON=$(aws secretsmanager get-secret-value \
  --secret-id "$SECRET_ID" \
  --query SecretString \
  --output text)

# Write .env file. Use python (not jq) to preserve newlines and special chars correctly.
python3 - <<PY > "$ENV_FILE"
import json, sys
data = json.loads('''$SECRET_JSON''')
for k, v in data.items():
    # Use %s printf-style; backslashes/n are interpreted by docker compose env_file as literal chars,
    # but newlines in private_key must be preserved.
    v = v.replace('\r\n', '\n')
    # Quote values that contain spaces or special chars; use double quotes and escape \ and "
    needs_quote = any(c in v for c in [' ', '#', '"', '\\'])
    if needs_quote:
        v_escaped = v.replace('\\\\', '\\\\\\\\').replace('"', '\\"')
        print(f'{k}="{v_escaped}"')
    else:
        print(f'{k}={v}')
PY

echo "[deploy] env file written to $ENV_FILE"
echo "[deploy] env file content (first 200 chars):"
head -c 200 "$ENV_FILE"
echo

# Export DB host/port for the entrypoint wait probe (derived from DATABASE_URL)
DATABASE_URL_HOST=$(extract_db_host_port | sed -n '1p')
DATABASE_URL_PORT=$(extract_db_host_port | sed -n '2p')
export DATABASE_URL_HOST DATABASE_URL_PORT
# Re-export into the env file so the container picks them up
printf '\nDATABASE_URL_HOST=%s\nDATABASE_URL_PORT=%s\n' "$DATABASE_URL_HOST" "$DATABASE_URL_PORT" >> "$ENV_FILE"

echo "[deploy] pulling image for service: $COMPOSE_SERVICE (ECR repo: $ECR_REPO)"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull "$COMPOSE_SERVICE"

echo "[deploy] starting service: $COMPOSE_SERVICE"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --no-deps "$COMPOSE_SERVICE"

echo "[deploy] pruning old images"
docker image prune -f --filter "until=24h"

echo "[deploy] done"
