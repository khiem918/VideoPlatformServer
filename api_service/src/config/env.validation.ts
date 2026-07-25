import { IsNotEmpty, IsNumber, IsString, IsOptional } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

export class EnvironmentVariables {
  @IsNotEmpty()
  @IsString()
  DATABASE_URL!: string;

  @IsNotEmpty()
  @IsString()
  REDIS_HOST!: string;

  @IsNumber()
  REDIS_PORT!: number;

  @IsOptional()
  @IsString()
  REDIS_PASSWORD?: string;

  @IsNotEmpty()
  @IsString()
  JWT_SECRET!: string;

  @IsNotEmpty()
  @IsString()
  FIREBASE_PROJECT_ID!: string;

  @IsNotEmpty()
  @IsString()
  FIREBASE_CLIENT_EMAIL!: string;

  @IsNotEmpty()
  @IsString()
  FIREBASE_PRIVATE_KEY!: string;

  @IsNotEmpty()
  @IsString()
  COOKIE_SECRET!: string;

  @IsNotEmpty()
  CLOUDFLARE_R2_REGION!: string;

  @IsNotEmpty()
  CLOUDFLARE_R2_ACCESS_KEY_ID!: string;

  @IsNotEmpty()
  CLOUDFLARE_R2_SECRET_ACCESS_KEY!: string;

  @IsNotEmpty()
  CLOUDFLARE_R2_BUCKET_NAME!: string;

  @IsOptional()
  CLOUDFLARE_R2_ENDPOINT?: string;

  @IsOptional()
  CLOUDFLARE_R2_FORCE_PATH_STYLE?: boolean;

  @IsNotEmpty()
  MAX_FILE_SIZE!: number;

  @IsNotEmpty()
  @IsString()
  QUEUE_NAME!: string;

  @IsNotEmpty()
  @IsString()
  QUEUE_HOST!: string;

  @IsNotEmpty()
  @IsString()
  QUEUE_PORT!: string;

  @IsNotEmpty()
  @IsString()
  EMBED_API_URL!: string;

  @IsNotEmpty()
  @IsString()
  EMBED_API_KEY!: string;

  @IsNotEmpty()
  @IsString()
  R2_SIGN_SECRET!: string;

  @IsNotEmpty()
  @IsString()
  RABBITMQ_URI!: string;

  @IsNotEmpty()
  @IsString()
  GRPC_URL!: string;

  @IsNotEmpty()
  @IsString()
  SEARCH_SERVICE_GRPC_URL!: string;
<<<<<<< HEAD

  @IsNotEmpty()
  @IsString()
  CLOUDFRONT_DOMAIN_NAME!: string;

  @IsNotEmpty()
  @IsString()
  CLOUDFRONT_KEY_PAIR_ID!: string;

  @IsNotEmpty()
  @IsString()
  CLOUDFRONT_PRIVATE_KEY!: string;

  @IsNotEmpty()
  @IsString()
  CDN_DOMAIN!: string;

=======
>>>>>>> parent of 2247c5d (Merge pull request #5 from khiem918/feat/aws-integration)
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig);

  if (errors.length > 0) {
    const errorMessages = errors
      .map(
        (error) =>
          `${error.property}: ${Object.values(error.constraints || {}).join(', ')}`,
      )
      .join('\n');
    throw new Error(`Environment validation failed:\n${errorMessages}`);
  }

  return validatedConfig;
}
