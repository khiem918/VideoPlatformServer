import { IsNotEmpty, IsNumber, IsString, IsOptional } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

export class EnvironmentVariables {
  @IsNumber()
  SERVER_PORT!: number;

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
  @IsNumber()
  ACCESS_TOKEN_EXPIRES_IN!: number;

  @IsNotEmpty()
  @IsNumber()
  REFRESH_TOKEN_EXPIRES_IN!: number;

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
  S3_REGION!: string;

  @IsNotEmpty()
  S3_ACCESS_KEY_ID!: string;

  @IsNotEmpty()
  S3_SECRET_ACCESS_KEY!: string;

  @IsNotEmpty()
  BUCKET_NAME!: string;

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
