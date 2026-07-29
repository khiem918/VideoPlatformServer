import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConfigService } from '@nestjs/config';
import {
  buildRedisOptions,
  parseRedisPort,
} from '../common/redis/redis-connection';

@Module({
  imports: [
    ConfigModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        // QUEUE_PORT is validated as a string (see env.validation.ts), so it
        // has to be parsed here rather than read as a number.
        connection: buildRedisOptions({
          host: configService.getOrThrow<string>('QUEUE_HOST'),
          port: parseRedisPort(configService.getOrThrow<string>('QUEUE_PORT')),
          db: 1,
        }),
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
