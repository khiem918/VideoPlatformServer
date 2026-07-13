import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { PublisherService } from './publisher.service';

describe('PublisherService', () => {
  let service: PublisherService;
  let amqpConnection: jest.Mocked<AmqpConnection>;

  beforeEach(() => {
    amqpConnection = {
      publish: jest.fn(),
    } as unknown as jest.Mocked<AmqpConnection>;

    service = new PublisherService(amqpConnection);
  });

  it('publishes the minimal payload and returns the videoId as correlationId', async () => {
    amqpConnection.publish.mockResolvedValue(undefined as any);

    const result = await service.transferVideoMetadata('video-1');

    expect(amqpConnection.publish).toHaveBeenCalledWith(
      'video.processing',
      'video.metadata.trans',
      { correlationId: 'video-1', videoId: 'video-1' },
      { persistent: true },
    );
    expect(result).toBe('video-1');
  });

  it('includes optional fields only when provided', async () => {
    amqpConnection.publish.mockResolvedValue(undefined as any);

    await service.transferVideoMetadata('video-1', 'title', 'description', [
      'tag1',
      'tag2',
    ]);

    expect(amqpConnection.publish).toHaveBeenCalledWith(
      'video.processing',
      'video.metadata.trans',
      {
        correlationId: 'video-1',
        videoId: 'video-1',
        title: 'title',
        description: 'description',
        hashtags: ['tag1', 'tag2'],
      },
      { persistent: true },
    );
  });
});
