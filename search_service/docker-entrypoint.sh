#!/bin/sh
# search_service entrypoint: wait for postgres, run prisma migrate deploy, then exec CMD
set -e

echo "[entrypoint] waiting for postgres..."
python -c "
import os, socket, time, sys
host = os.environ.get('DATABASE_URL_HOST', 'postgres')
port = int(os.environ.get('DATABASE_URL_PORT', '5432'))
start = time.time()
while True:
    try:
        with socket.create_connection((host, port), timeout=2):
            print('[entrypoint] postgres is up')
            sys.exit(0)
    except Exception:
        if time.time() - start > 60:
            print('[entrypoint] postgres wait timeout', file=sys.stderr)
            sys.exit(1)
        time.sleep(1)
"

echo "[entrypoint] running prisma migrate deploy..."
prisma migrate deploy --schema=prisma/schema.prisma

echo "[entrypoint] starting application: $@"
exec "$@"
