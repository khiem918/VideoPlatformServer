import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable } from '@nestjs/common';
import { EXCHANGE } from './rabbitmq.module';
import { TransferVideoMetaDataResponse } from './dto/transferdata.dto';
import { TransferDataRepository } from './repository/transferdata.repository';

@Injectable()
export class ConsumerService {
  constructor(
    private readonly transferDataRepository: TransferDataRepository,
  ) {}

  @RabbitSubscribe({
    exchange: EXCHANGE,
    routingKey: 'video.metadata.res',
    queue: 'video.metadata.response',
    queueOptions: {
      durable: true,
      deadLetterExchange: 'video.processing.dlx',
      deadLetterRoutingKey: 'video.metadata.res',
    },
  })
  async handleVideoMetadataRespone(
    message: TransferVideoMetaDataResponse,
  ): Promise<void> {
    if (message.status === 'successed') {
      await this.transferDataRepository.updateProcessingStatus(
        message.correlationId,
        'successed',
      );
      return;
    }

    if (message.status === 'failed') {
      await this.transferDataRepository.updateProcessingStatus(
        message.correlationId,
        'failed',
        message.error,
      );
      return;
    }
  }
}
