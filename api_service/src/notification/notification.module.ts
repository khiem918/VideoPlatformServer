import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationRepository } from './repository/notification.repository';
import { NotificationConsumer } from './notification.consumer';
import { NotificationController } from './notification.controller';
import { NotificationResolver } from './notification.resolver';
import { RedisNotifyService } from './redis.service';

@Module({
  imports: [],
  providers: [
    NotificationService,
    NotificationRepository,
    NotificationResolver,
    NotificationConsumer,
    RedisNotifyService,
  ],
  controllers: [NotificationController],

  exports: [NotificationService],
})
export class NotificationModule {}
