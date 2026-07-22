import { Module } from '@nestjs/common';
import { ConsumerService } from './consumer.service';
import { TransferDataRepository } from './repository/transferdata.repository';
import { RabbitmqModule } from './rabbitmq.module';

@Module({
  imports: [RabbitmqModule],
  providers: [ConsumerService, TransferDataRepository],
})
export class ConsumerModule {}
