import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import { RedisNotifyService } from './redis.service';

const STREAM_KEY = 'notifications:stream';
const GROUP_NAME = 'notify_wokers';
const CONSUMER_NAME = `worker-${process.pid}`;

@Injectable()
export class NotificationConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationConsumer.name);
  private running = false;

  constructor(
    private readonly notificationService: NotificationService,
    private readonly redisNotifyService: RedisNotifyService,
  ) {}

  async onModuleInit() {
    await this.notificationService.ensureConsumerGroup();
    this.running = true;
    this.startConsuming();
  }

  async onModuleDestroy() {
    this.running = false;
  }

  private async startConsuming() {
    this.logger.log('Starting notification consumer...');

    while (this.running) {
      try {
        const messages = await this.redisNotifyService.consumeFromRedisStream(
          STREAM_KEY,
          GROUP_NAME,
          CONSUMER_NAME,
          10,
          2000,
        );

        if (!messages || messages.length === 0) {
          continue;
        }

        for (const [, message] of messages) {
          for (const [key, value] of message) {
            this.logger.log(`Received notification for user ${key}: ${value}`);

            await this.handleMessage(key, value);
          }
        }
      } catch (error) {
        this.logger.error(
          'Error occurred while consuming messages from Redis stream :',
          error,
        );
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  private async handleMessage(id: string, fields: string[]) {
    try {
      const data: Record<string, string> = {};
      for (let i = 0; i < fields.length; i += 2) {
        data[fields[i]] = fields[i + 1];
      }

      const userId = data['userId'];
      const payload = data['payload'];
      const type = data['type'] as 'SYSTEM' | 'CHANNEL';
      const targetUserIds = JSON.parse(
        data['targetUserIds'] || '[]',
      ) as string[];

      this.logger.log(
        `Processing notification for user ${userId} with payload: ${payload} and type: ${type} and targetUserIds: ${targetUserIds.join(',')}`,
      );

      this.notificationService.pushToDedicatedUser(targetUserIds, {
        userId: userId,
        type: type,
        payload: payload,
        id: data['id'] || id,
      });

      await this.redisNotifyService.acknowledgeMessage(
        STREAM_KEY,
        GROUP_NAME,
        id,
      );
    } catch (error) {
      this.logger.error(
        `Error processing notification for user ${id}: ${error.message}`,
      );
    }
  }
}
