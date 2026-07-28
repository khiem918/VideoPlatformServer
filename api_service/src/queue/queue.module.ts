import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.getOrThrow<string>('QUEUE_HOST'),
          port: configService.getOrThrow<number>('QUEUE_PORT'),
          db: 1,
        },
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
