import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  InternalServerErrorException,
} from '@nestjs/common';
import Redis from 'ioredis';
import {
  buildRedisOptions,
  parseRedisPort,
  pingWithTimeout,
} from '../common/redis/redis-connection';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly redisClient: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor() {
    this.redisClient = new Redis(
      buildRedisOptions({
        host: process.env.REDIS_HOST ?? '127.0.0.1',
        port: parseRedisPort(process.env.REDIS_PORT),
        db: 0,
      }),
    );

    this.redisClient.on('connect', () =>
      this.logger.log('Redis connecting...'),
    );
    this.redisClient.on('ready', () =>
      this.logger.log('Redis connected and ready'),
    );
    this.redisClient.on('error', (error: Error) =>
      this.logger.error(`Redis error: ${error.message}`),
    );
    this.redisClient.on('close', () =>
      this.logger.warn('Redis connection closed'),
    );
  }

  async onModuleInit(): Promise<void> {
    try {
      await pingWithTimeout(this.redisClient);
      this.logger.log('Redis ping success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Redis connection failed: ${message}`);
      throw new InternalServerErrorException('Redis connection failed');
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redisClient.quit();
      this.logger.log('Redis disconnected');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error disconnecting from Redis: ${message}`);
    }
  }

  async set(key: string, value: any, expireSeconds: number): Promise<void> {
    try {
      if (!key || key.trim() === '') {
        throw new Error('Key cannot be empty');
      }
      await this.redisClient.setex(key, expireSeconds, JSON.stringify(value));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Redis set failed: ${message}`);
      throw new InternalServerErrorException(`Redis set failed: ${message}`);
    }
  }

  async get(key: string): Promise<any> {
    try {
      if (!key || key.trim() === '') {
        throw new Error('Key cannot be empty');
      }
      const value = await this.redisClient.get(key);
      if (!value) {
        return null;
      }
      try {
        return JSON.parse(value);
      } catch {
        this.logger.warn(`Failed to parse Redis value for key: ${key}`);
        return null;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Redis get failed: ${message}`);
      throw new InternalServerErrorException(`Redis get failed: ${message}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      if (!key || key.trim() === '') {
        throw new Error('Key cannot be empty');
      }
      await this.redisClient.del(key);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Redis del failed: ${message}`);
      throw new InternalServerErrorException(`Redis del failed: ${message}`);
    }
  }
}
