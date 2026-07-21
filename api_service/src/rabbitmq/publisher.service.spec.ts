import * as amqp from 'amqplib';
import { Test, TestingModule } from '@nestjs/testing';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { PublisherService } from './publisher.service';
import { buildRabbitMqConfig, EXCHANGE } from './rabbitmq.module';
import {
  RabbitMqTestBroker,
  startRabbitMqTestBroker,
  stopRabbitMqTestBroker,
} from './testing/rabbitmq-test-container';

jest.setTimeout(120_000);

describe('PublisherService', () => {
  let broker: RabbitMqTestBroker;
  let moduleRef: TestingModule;
  let service: PublisherService;
  let verifyConnection: Awaited<ReturnType<typeof amqp.connect>>;
  let verifyChannel: amqp.Channel;

  beforeAll(async () => {
    broker = await startRabbitMqTestBroker();

    moduleRef = await Test.createTestingModule({
      imports: [RabbitMQModule.forRoot(buildRabbitMqConfig(broker.amqpUrl))],
      providers: [PublisherService],
    }).compile();

    await moduleRef.init();
    service = moduleRef.get(PublisherService);

    verifyConnection = await amqp.connect(broker.amqpUrl);
    verifyChannel = await verifyConnection.createChannel();
  });

  afterAll(async () => {
    await verifyChannel?.close();
    await verifyConnection?.close();
    await moduleRef?.close();
    if (broker) {
      await stopRabbitMqTestBroker(broker);
    }
  });

  async function subscribeToRoutingKey(
    routingKey: string,
  ): Promise<() => Promise<Record<string, unknown>>> {
    const { queue } = await verifyChannel.assertQueue('', {
      exclusive: true,
      autoDelete: true,
    });
    await verifyChannel.bindQueue(queue, EXCHANGE, routingKey);

    return () =>
      new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Timed out waiting for published message')),
          10_000,
        );

        verifyChannel
          .consume(
            queue,
            (message) => {
              if (!message) {
                return;
              }
              clearTimeout(timeout);
              verifyChannel.ack(message);
              resolve(JSON.parse(message.content.toString()));
            },
            { noAck: false },
          )
          .catch(reject);
      });
  }

  it('publishes the minimal payload and it is delivered to the real broker', async () => {
    const waitForMessage = await subscribeToRoutingKey('video.metadata.trans');

    const result = await service.transferVideoMetadata('video-1');

    const received = await waitForMessage();
    expect(received).toEqual({ correlationId: 'video-1', videoId: 'video-1' });
    expect(result).toBe('video-1');
  });

  it('includes optional fields only when provided', async () => {
    const waitForMessage = await subscribeToRoutingKey('video.metadata.trans');

    await service.transferVideoMetadata('video-2', 'title', 'description', [
      'tag1',
      'tag2',
    ]);

    const received = await waitForMessage();
    expect(received).toEqual({
      correlationId: 'video-2',
      videoId: 'video-2',
      title: 'title',
      description: 'description',
      hashtags: ['tag1', 'tag2'],
    });
  });
});
