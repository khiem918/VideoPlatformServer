import * as amqp from 'amqplib';
import { Test, TestingModule } from '@nestjs/testing';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { ConsumerService } from './consumer.service';
import { buildRabbitMqConfig, EXCHANGE } from './rabbitmq.module';
import { TransferDataRepository } from './repository/transferdata.repository';
import {
  RabbitMqTestBroker,
  startRabbitMqTestBroker,
  stopRabbitMqTestBroker,
} from './testing/rabbitmq-test-container';
import { waitFor } from './testing/wait-for';

const RESPONSE_ROUTING_KEY = 'video.metadata.res';
const MESSAGE_SETTLE_DELAY_MS = 1_000;

jest.setTimeout(120_000);

function createRepositoryMock() {
  return {
    updateMetaProcessingStatus: jest.fn(),
  };
}

describe('ConsumerService', () => {
  let broker: RabbitMqTestBroker;
  let moduleRef: TestingModule;
  let repository: ReturnType<typeof createRepositoryMock>;
  let publishConnection: Awaited<ReturnType<typeof amqp.connect>>;
  let publishChannel: amqp.Channel;

  beforeAll(async () => {
    broker = await startRabbitMqTestBroker();

    repository = createRepositoryMock();

    moduleRef = await Test.createTestingModule({
      imports: [RabbitMQModule.forRoot(buildRabbitMqConfig(broker.amqpUrl))],
      providers: [
        ConsumerService,
        { provide: TransferDataRepository, useValue: repository },
      ],
    }).compile();

    await moduleRef.init();

    publishConnection = await amqp.connect(broker.amqpUrl);
    publishChannel = await publishConnection.createChannel();
  });

  afterAll(async () => {
    await publishChannel?.close();
    await publishConnection?.close();
    await moduleRef?.close();
    if (broker) {
      await stopRabbitMqTestBroker(broker);
    }
  });

  beforeEach(() => {
    repository.updateMetaProcessingStatus.mockClear();
  });

  function publishResponse(payload: Record<string, unknown>): void {
    publishChannel.publish(
      EXCHANGE,
      RESPONSE_ROUTING_KEY,
      Buffer.from(JSON.stringify(payload)),
    );
  }

  it('marks processing as successful for a succeeded message published on the real broker', async () => {
    publishResponse({ correlationId: 'proc-1', status: 'succeeded' });

    await waitFor(
      () => repository.updateMetaProcessingStatus.mock.calls.length > 0,
    );

    expect(repository.updateMetaProcessingStatus).toHaveBeenCalledWith(
      'proc-1',
      'succeeded',
    );
  });

  it('marks processing as failed for a failed message published on the real broker', async () => {
    publishResponse({
      correlationId: 'proc-2',
      status: 'failed',
      error: 'boom',
    });

    await waitFor(
      () => repository.updateMetaProcessingStatus.mock.calls.length > 0,
    );

    expect(repository.updateMetaProcessingStatus).toHaveBeenCalledWith(
      'proc-2',
      'failed',
    );
  });

  it('does nothing for an unrecognized status', async () => {
    publishResponse({ correlationId: 'proc-3', status: 'unknown' });

    await new Promise((resolve) =>
      setTimeout(resolve, MESSAGE_SETTLE_DELAY_MS),
    );

    expect(repository.updateMetaProcessingStatus).not.toHaveBeenCalled();
  });
});
