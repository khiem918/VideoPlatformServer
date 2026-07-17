import 'reflect-metadata';
import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  function createValidConfig(): Record<string, unknown> {
    return {
      SERVER_PORT: 3000,
      DATABASE_URL: 'postgres://localhost',
      REDIS_HOST: 'localhost',
      REDIS_PORT: 6379,
      JWT_SECRET: 'secret',
      ACCESS_TOKEN_EXPIRES_IN: 900,
      REFRESH_TOKEN_EXPIRES_IN: 3600,
      FIREBASE_PROJECT_ID: 'project',
      FIREBASE_CLIENT_EMAIL: 'client@example.com',
      FIREBASE_PRIVATE_KEY: 'private-key',
      COOKIE_SECRET: 'cookie-secret',
      S3_REGION: 'auto',
      S3_ACCESS_KEY_ID: 'access-key',
      S3_SECRET_ACCESS_KEY: 'secret-key',
      BUCKET_NAME: 'bucket',
      MAX_FILE_SIZE: 1073741824,
      QUEUE_NAME: 'video-processing',
      QUEUE_HOST: 'localhost',
      QUEUE_PORT: '6380',
      EMBED_API_URL: 'https://embed.example.com',
      EMBED_API_KEY: 'embed-key',
      R2_SIGN_SECRET: 'sign-secret',
      RABBITMQ_URI: 'amqp://localhost',
      GRPC_URL: 'localhost:5000',
      SEARCH_SERVICE_GRPC_URL: 'localhost:5001',
      CLOUDFRONT_DOMAIN_NAME: 'cdn.example.com',
      CLOUDFRONT_KEY_PAIR_ID: 'key-pair-id',
      CLOUDFRONT_PRIVATE_KEY: 'private-key',
      COOKIE_DOMAIN: '.example.com',
    };
  }

  it('returns a validated instance when all required variables are present', () => {
    const result = validateEnv(createValidConfig());

    expect(result.SERVER_PORT).toBe(3000);
    expect(result.DATABASE_URL).toBe('postgres://localhost');
  });

  it('throws a descriptive error when a required variable is missing', () => {
    const config = createValidConfig();
    delete config.JWT_SECRET;

    expect(() => validateEnv(config)).toThrow(/JWT_SECRET/);
  });

  it('throws when a numeric variable receives a non-numeric value', () => {
    const config = createValidConfig();
    config.SERVER_PORT = 'not-a-number';

    expect(() => validateEnv(config)).toThrow(/SERVER_PORT/);
  });

  it('allows optional variables to be omitted', () => {
    const config = createValidConfig();
    delete config.REDIS_PASSWORD;
    delete config.CLOUDFLARE_R2_ENDPOINT;
    delete config.CLOUDFLARE_R2_FORCE_PATH_STYLE;

    expect(() => validateEnv(config)).not.toThrow();
  });
});
