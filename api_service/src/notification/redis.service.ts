import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import Redis from 'ioredis/built/Redis';

@Injectable()
export class RedisNotifyService implements OnModuleInit, OnModuleDestroy {
  protected readonly pub: Redis;
  protected readonly sub: Redis;
  private readonly logger = new Logger(RedisNotifyService.name);

  constructor() {
    const redisPort = Number.parseInt(process.env.REDIS_PORT ?? '6379', 10);

    const redisConfig: import('ioredis').RedisOptions = {
      host: process.env.REDIS_HOST ?? '127.0.0.1',
      port: Number.isNaN(redisPort) ? 6379 : redisPort,
      db: 2,
    };

    this.pub = new Redis(redisConfig);
    this.sub = new Redis(redisConfig);

    this.pub.on('connect', () => this.logger.log('pub connecting...'));
    this.sub.on('connect', () => this.logger.log('sub connecting...'));

    this.pub.on('ready', () => this.logger.log('pub connected and ready'));
    this.sub.on('ready', () => this.logger.log('sub connected and ready'));

    this.pub.on('error', (error: Error) =>
      this.logger.error(`Redis error: ${error.message}`),
    );
    this.sub.on('error', (error: Error) =>
      this.logger.error(`Redis error: ${error.message}`),
    );

    this.pub.on('close', () => this.logger.warn('Redis connection closed'));
    this.sub.on('close', () => this.logger.warn('Redis connection closed'));
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.pub.ping();
      await this.sub.ping();
      this.logger.log('pub and sub ping success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Redis connection failed: ${message}`);
      throw new InternalServerErrorException('Redis connection failed');
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.pub.quit();
      await this.sub.quit();
      this.logger.log('pub and sub disconnected');
    } catch (error) {
      this.logger.error('Error disconnecting from Redis');
    }
  }

  async publishToRedisStream(
    key: string,
    userId: string,
    payload: string,
    id: string,
    type: string,
    subject: string,
    targetUserIds: string[],
  ): Promise<void> {
    try {
      await this.pub.xadd(
        key,
        '*',
        'userId',
        userId,
        'payload',
        payload,
        'id',
        id,
        'type',
        type,
        'subject',
        subject,
        'targetUserIds',
        JSON.stringify(targetUserIds),
      );
      this.logger.log(
        `Published message to Redis stream ${key} for user ${userId}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to publish message to Redis stream: ${message}`,
      );
    }
  }

  async ensureConsumerGroup(key: string, groupName: string): Promise<void> {
    try {
      await this.pub.xgroup('CREATE', key, groupName, '$', 'MKSTREAM');
      this.logger.log(`Consumer group ${groupName} created for stream ${key}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('BUSYGROUP')) {
        this.logger.warn(
          `Consumer group ${groupName} already exists for stream ${key}`,
        );
      } else {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Failed to create consumer group: ${message}`);
      }
    }
  }

  async consumeFromRedisStream(
    key: string,
    groupName: string,
    consumerName: string,
    count: number,
    block: number,
  ): Promise<any[]> {
    try {
      const messages = await this.sub.xreadgroup(
        'GROUP',
        groupName,
        consumerName,
        'COUNT',
        count,
        'BLOCK',
        block,
        'STREAMS',
        key,
        '>',
      );
      // this.logger.log("messages: " + JSON.stringify(messages));
      return messages;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to consume messages from Redis stream: ${message}`,
      );
      return [];
    }
  }

  async acknowledgeMessage(
    key: string,
    groupName: string,
    id: string,
  ): Promise<void> {
    try {
      await this.sub.xack(key, groupName, id);
      this.logger.log(
        `Acknowledged message ${id} in stream ${key} for group ${groupName}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to acknowledge message: ${message}`);
    }
  }
}
