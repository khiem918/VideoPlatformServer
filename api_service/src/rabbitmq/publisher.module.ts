import { Global, Module } from '@nestjs/common';
import { PublisherService } from './publisher.service';
import { RabbitmqModule } from './rabbitmq.module';

@Global()
@Module({
  imports: [RabbitmqModule],
  providers: [PublisherService],
  exports: [PublisherService],
})
export class PublisherModule {}
