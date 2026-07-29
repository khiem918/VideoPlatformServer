import type { RedisOptions } from 'ioredis';

const DEFAULT_REDIS_PORT = 6379;

/**
 * ElastiCache/Valkey nodes created with in-transit encryption accept TLS
 * connections only, and they fail in a way that looks like a hang rather than
 * an error: a plaintext client still completes the TCP handshake (ioredis even
 * emits 'connect'), but the server then waits for a ClientHello that never
 * arrives while the client waits for a reply to its first command. Neither
 * side times out, so the socket stays open and silent forever.
 *
 * Local docker-compose Redis is plaintext, so TLS stays opt-in via this flag.
 */
const TLS_ENV_VAR = 'REDIS_TLS';

/**
 * Bounds the TCP/TLS handshake only. Deliberately no `commandTimeout`: the
 * notification consumer issues blocking XREADGROUP reads that are expected to
 * sit idle, and a global command timeout would abort them. Boot-time liveness
 * is covered by {@link pingWithTimeout} instead.
 */
const CONNECT_TIMEOUT_MS = 10_000;

/**
 * A misconfigured connection leaves PING queued forever rather than rejecting,
 * which turns a Redis outage into a silent boot hang: the process stays alive,
 * never listens on its HTTP port, and every health check fails with no log to
 * explain why. Bounding the boot-time PING makes that failure loud and fast.
 */
const PING_TIMEOUT_MS = 15_000;

export interface RedisEndpoint {
  host: string;
  port: number;
  /** Logical database index; ElastiCache supports 0-15 when cluster mode is off. */
  db: number;
}

export function isRedisTlsEnabled(): boolean {
  const value = process.env[TLS_ENV_VAR]?.trim().toLowerCase();
  return value === 'true' || value === '1';
}

export function parseRedisPort(value: string | undefined): number {
  const port = Number.parseInt(value ?? '', 10);
  return Number.isNaN(port) ? DEFAULT_REDIS_PORT : port;
}

export function buildRedisOptions(
  endpoint: Readonly<RedisEndpoint>,
): RedisOptions {
  return {
    ...endpoint,
    connectTimeout: CONNECT_TIMEOUT_MS,
    ...(isRedisTlsEnabled() ? { tls: {} } : {}),
  };
}

export async function pingWithTimeout(client: {
  ping(): Promise<string>;
}): Promise<void> {
  let timer: NodeJS.Timeout | undefined;

  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `Redis did not answer PING within ${PING_TIMEOUT_MS}ms ` +
              `(check REDIS_TLS and network reachability)`,
          ),
        ),
      PING_TIMEOUT_MS,
    );
  });

  try {
    await Promise.race([client.ping(), expiry]);
  } finally {
    clearTimeout(timer);
  }
}
