import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';

export const EXCHANGE = 'video.processing';
export const DLX_EXCHANGE = 'video.processing.dlx';

/**
 * Shared exchange/queue topology, reused by the production module bootstrap
 * and by tests booting a real broker (e.g. via Testcontainers) so the two
 * can never drift apart.
 */
export function buildRabbitMqConfig(uri: string) {
  return {
    uri,

    exchanges: [
      { name: EXCHANGE, type: 'topic' },
      { name: DLX_EXCHANGE, type: 'topic' },
    ],

    connectionInitOptions: {
      wait: true,
    },
    reconnectTimeInSeconds: 5,

    queues: [
      {
        name: 'video.meta.transfer',
        exchange: EXCHANGE,
        routingKey: 'video.metadata.trans',
        options: {
          durable: true,
          arguments: {
            'x-dead-letter-exchange': DLX_EXCHANGE,
            'x-dead-letter-routing-key': 'video.metadata.dlx',
          },
        },
      },

      {
        name: 'video.metadata.dead-letter',
        exchange: DLX_EXCHANGE,
        routingKey: '#',
        options: {
          durable: true,
        },
      },
    ],
  };
}

@Global()
@Module({
  imports: [
    RabbitMQModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        buildRabbitMqConfig(configService.getOrThrow<string>('RABBITMQ_URI')),
    }),
  ],
  exports: [RabbitMQModule],
})
export class RabbitmqModule {}
