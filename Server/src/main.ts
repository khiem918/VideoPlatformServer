import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configservice = app.get<ConfigService>(ConfigService)

  const server_port = configservice.get('SERVER_PORT'); 
  await app.listen(server_port);
}
bootstrap();
