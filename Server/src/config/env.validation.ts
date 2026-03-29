import { IsNotEmpty, IsNumber, IsString, IsOptional } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

export class EnvironmentVariables {
  @IsNumber()
  SERVER_PORT: number;

  @IsNotEmpty()
  @IsString()
  NODE_ENV: string;

  @IsNotEmpty()
  @IsString()
  DATABASE_URL: string;

  @IsNotEmpty()
  @IsString()
  REDIS_HOST: string;

  @IsNumber()
  REDIS_PORT: number;

  @IsOptional()
  @IsString()
  REDIS_PASSWORD?: string;

  @IsNotEmpty()
  @IsString()
  JWT_SECRET: string;

  @IsNotEmpty()
  @IsString()
  ACCESS_TOKEN_EXPIRES_IN: string;

  @IsNotEmpty()
  @IsString()
  REFRESH_TOKEN_EXPIRES_IN: string;

  @IsNotEmpty()
  @IsString()
  GOOGLE_CLIENT_ID: string;

  @IsNotEmpty()
  @IsString()
  COOKIE_SECRET: string;

  @IsNotEmpty()
  @IsString()
  CLIENT_URL: string;

  @IsOptional()
  @IsString()
  SSL_KEY_PATH?: string;

  @IsOptional()
  @IsString()
  SSL_CERT_PATH?: string;
}

export async function validateEnv(
  config: Record<string, unknown>,
): Promise<EnvironmentVariables> {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = await validate(validatedConfig);

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
