/**
 * Single source of truth for where the "staging environment" under test
 * lives. Defaults match docker/docker-compose.staging.yml's host-mapped
 * ports, so the suite works out of the box against that local stack.
 * Pointing every STAGING_* var at a real deployed staging instead requires
 * no code changes -- only these env vars differ.
 */
export const env = {
  apiUrl: process.env.STAGING_API_URL ?? 'http://localhost:8081',
  searchUrl: process.env.STAGING_SEARCH_URL ?? 'http://localhost:8001',
  apiDatabaseUrl:
    process.env.STAGING_API_DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5535/video_streaming_api_staging?schema=core',
  redisSearchUrl: process.env.STAGING_REDIS_SEARCH_URL ?? 'redis://localhost:6480',
  rabbitmqUri: process.env.STAGING_RABBITMQ_URI ?? 'amqp://guest:guest@localhost:5773',
  qdrantUrl: process.env.STAGING_QDRANT_URL ?? 'http://localhost:6433',
  jwtSecret: process.env.STAGING_JWT_SECRET ?? 'staging-jwt-secret-not-for-production',
};

export const GRAPHQL_ENDPOINT = `${env.apiUrl}/graphql`;
export const SEARCH_ENDPOINT = `${env.searchUrl}/api/v1/search`;
