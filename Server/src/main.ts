import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { readFileSync } from 'fs';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const bootstrapConfigService = new ConfigService();
  const sslKeyPath = bootstrapConfigService.get<string>('SSL_KEY_PATH');
  const sslCertPath = bootstrapConfigService.get<string>('SSL_CERT_PATH');

  const httpsOptions =
    sslKeyPath && sslCertPath
      ? {
          key: readFileSync(sslKeyPath),
          cert: readFileSync(sslCertPath),
        }
      : undefined;

  const app = await NestFactory.create(AppModule, { 
                                                    httpsOptions,
                                                    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
                                                    snapshot: true,
                                                  });
  const configservice = app.get<ConfigService>(ConfigService);

  app.use(cookieParser(configservice.get<string>('COOKIE_SECRET')));
  // app.use(helmet());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({
    origin: configservice.get<string>('CLIENT_URL') ?? 'http://localhost:5173',
    credentials: true,
  });

  const server_port = configservice.get('SERVER_PORT');
  await app.listen(server_port);
}
bootstrap();
