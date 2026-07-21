import { Injectable } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Options } from 'amqplib';
import { TransferVideoMetadata } from './interface/transferdata.interface';
import { EXCHANGE } from './rabbitmq.module';

type PublishOptionsWithTimeout = Options.Publish & { timeout?: number };

const PUBLISH_TIMEOUT_MS = 10_000;

@Injectable()
export class PublisherService {
  constructor(private readonly amqpConnection: AmqpConnection) {}

  async transferVideoMetadata(
    videoId: string,
    title?: string,
    description?: string,
    hashtags?: string[],
  ): Promise<string> {
    const correlationId = videoId;
    const payload: TransferVideoMetadata = {
      correlationId,
      videoId,
      ...(title && { title }),
      ...(description && { description }),
      ...(hashtags && { hashtags }),
    };

    await this.amqpConnection.publish(
      EXCHANGE,
      'video.metadata.trans',
      payload,
      {
        persistent: true,
        timeout: PUBLISH_TIMEOUT_MS,
      } as PublishOptionsWithTimeout,
    );

    return correlationId;
  }
}
