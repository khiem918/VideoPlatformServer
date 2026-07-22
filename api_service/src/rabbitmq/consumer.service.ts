import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger } from '@nestjs/common';
import { EXCHANGE } from './rabbitmq.module';
import { TransferVideoMetaDataResponse } from './dto/transferdata.dto';
import { TransferDataRepository } from './repository/transferdata.repository';

@Injectable()
export class ConsumerService {
  private readonly logger = new Logger(ConsumerService.name);
  
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

    this.logger.debug(`Received message: ${JSON.stringify(message)}`);

    if (message.status === 'succeeded') {
      await this.transferDataRepository.updateMetaProcessingStatus(
        message.correlationId,
        'succeeded',
      );
      return;
    }

    if (message.status === 'failed') {
      await this.transferDataRepository.updateMetaProcessingStatus(
        message.correlationId,
        'failed',
      );
      return;
    }
  }
}
