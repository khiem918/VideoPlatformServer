const DEFAULT_GRPC_PORT = '50051';

/**
 * A gRPC server must bind to a local interface, not a DNS name -- grpc-js
 * resolves the host of `url` before binding, so a service-discovery name
 * like `api.vsp.internal` (meant for *inbound* callers) fails at boot if it
 * hasn't propagated yet. Only the configured port is trusted; the host is
 * always 0.0.0.0.
 */
export function resolveGrpcBindUrl(configuredUrl: string): string {
  const parts = configuredUrl.split(':');
  const port = parts.length > 1 ? parts[parts.length - 1] : DEFAULT_GRPC_PORT;
  return `0.0.0.0:${port}`;
}
