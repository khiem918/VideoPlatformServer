import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { readFileSync } from 'fs';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
<<<<<<< HEAD
import { join } from 'path';
=======
import { GRPC_PACKAGE, GRPC_PROTO_PATH } from './grpc/constants';
>>>>>>> main

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

<<<<<<< HEAD
  const app = await NestFactory.create(AppModule, { 
                                                    httpsOptions,
                                                    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
                                                    snapshot: true,
                                                  });
=======
  const app = await NestFactory.create(AppModule, {
    httpsOptions,
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
    snapshot: true,
  });
>>>>>>> main

  const configservice = app.get<ConfigService>(ConfigService);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
<<<<<<< HEAD
      package: 'video.metadata.v1',
      protoPath: join(process.cwd(), '../proto/video.proto'),
=======
      package: GRPC_PACKAGE,
      protoPath: GRPC_PROTO_PATH,
>>>>>>> main
      url: configservice.get<string>('GRPC_URL') ?? 'localhost:50051',
    },
  });

  await app.startAllMicroservices();

  app.use(cookieParser(configservice.get<string>('COOKIE_SECRET')));
  // app.use(helmet());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({
    origin: configservice.get<string>('CLIENT_URL') ?? 'http://localhost:5173',
    credentials: true,
  });

  await app.listen(8080);
}

bootstrap();
