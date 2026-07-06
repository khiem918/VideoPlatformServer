#!/bin/sh
# api_service entrypoint: wait for postgres, run prisma migrate deploy, then exec CMD
set -e

echo "[entrypoint] waiting for postgres at $DATABASE_URL_HOST:$DATABASE_URL_PORT..."
# Best-effort wait: just sleep + try a TCP probe using node
node -e "
const net = require('net');
const host = process.env.DATABASE_URL_HOST || 'postgres';
const port = parseInt(process.env.DATABASE_URL_PORT || '5432', 10);
const start = Date.now();
const timeoutMs = 60000;
function tryConnect() {
  const sock = net.createConnection(port, host);
  sock.on('connect', () => { sock.end(); console.log('[entrypoint] postgres is up'); process.exit(0); });
  sock.on('error', () => { if (Date.now() - start > timeoutMs) { console.error('[entrypoint] postgres wait timeout'); process.exit(1); } setTimeout(tryConnect, 1000); });
}
tryConnect();
"

echo "[entrypoint] running prisma migrate deploy..."
npx prisma migrate deploy

echo "[entrypoint] starting application: $@"
exec "$@"
