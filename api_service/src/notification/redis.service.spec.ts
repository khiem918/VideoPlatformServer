import { InternalServerErrorException } from '@nestjs/common';

const mockPub = {
  on: jest.fn(),
  ping: jest.fn(),
  quit: jest.fn(),
  xadd: jest.fn(),
  xgroup: jest.fn(),
};

const mockSub = {
  on: jest.fn(),
  ping: jest.fn(),
  quit: jest.fn(),
  xreadgroup: jest.fn(),
  xack: jest.fn(),
};

let redisInstanceCount = 0;

jest.mock('ioredis/built/Redis', () => {
  return jest.fn().mockImplementation(() => {
    redisInstanceCount += 1;
    return redisInstanceCount === 1 ? mockPub : mockSub;
  });
});

import { RedisNotifyService } from './redis.service';

describe('RedisNotifyService', () => {
  let service: RedisNotifyService;

  beforeEach(() => {
    redisInstanceCount = 0;
    jest.clearAllMocks();
    service = new RedisNotifyService();
  });

  describe('onModuleInit', () => {
    it('pings both connections successfully', async () => {
      mockPub.ping.mockResolvedValue('PONG');
      mockSub.ping.mockResolvedValue('PONG');

      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });

    it('throws InternalServerErrorException when a ping fails', async () => {
      mockPub.ping.mockRejectedValue(new Error('connection refused'));

      await expect(service.onModuleInit()).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('onModuleDestroy', () => {
    it('quits both connections', async () => {
      mockPub.quit.mockResolvedValue('OK');
      mockSub.quit.mockResolvedValue('OK');

      await service.onModuleDestroy();

      expect(mockPub.quit).toHaveBeenCalled();
      expect(mockSub.quit).toHaveBeenCalled();
    });

    it('swallows errors when disconnecting fails', async () => {
      mockPub.quit.mockRejectedValue(new Error('already closed'));

      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    });
  });

  describe('publishToRedisStream', () => {
    it('publishes the message fields to the stream', async () => {
      mockPub.xadd.mockResolvedValue('1-0');

      await service.publishToRedisStream(
        'stream-key',
        'user-1',
        'payload',
        'id-1',
        'SYSTEM',
        'subject',
        ['user-1'],
      );

      expect(mockPub.xadd).toHaveBeenCalledWith(
        'stream-key',
        '*',
        'userId',
        'user-1',
        'payload',
        'payload',
        'id',
        'id-1',
        'type',
        'SYSTEM',
        'subject',
        'subject',
        'targetUserIds',
        '["user-1"]',
      );
    });

    it('does not throw when publishing fails', async () => {
      mockPub.xadd.mockRejectedValue(new Error('stream unavailable'));

      await expect(
        service.publishToRedisStream(
          'stream-key',
          'user-1',
          'payload',
          'id-1',
          'SYSTEM',
          'subject',
          ['user-1'],
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('ensureConsumerGroup', () => {
    it('creates the consumer group', async () => {
      mockPub.xgroup.mockResolvedValue('OK');

      await service.ensureConsumerGroup('stream-key', 'group-name');

      expect(mockPub.xgroup).toHaveBeenCalledWith(
        'CREATE',
        'stream-key',
        'group-name',
        '$',
        'MKSTREAM',
      );
    });

    it('does not throw when the group already exists', async () => {
      mockPub.xgroup.mockRejectedValue(new Error('BUSYGROUP already exists'));

      await expect(
        service.ensureConsumerGroup('stream-key', 'group-name'),
      ).resolves.toBeUndefined();
    });

    it('does not throw for unexpected errors', async () => {
      mockPub.xgroup.mockRejectedValue(new Error('unexpected failure'));

      await expect(
        service.ensureConsumerGroup('stream-key', 'group-name'),
      ).resolves.toBeUndefined();
    });
  });

  describe('consumeFromRedisStream', () => {
    it('returns the messages read from the stream', async () => {
      mockSub.xreadgroup.mockResolvedValue([['stream-key', []]]);

      const result = await service.consumeFromRedisStream(
        'stream-key',
        'group-name',
        'consumer-1',
        10,
        2000,
      );

      expect(mockSub.xreadgroup).toHaveBeenCalledWith(
        'GROUP',
        'group-name',
        'consumer-1',
        'COUNT',
        10,
        'BLOCK',
        2000,
        'STREAMS',
        'stream-key',
        '>',
      );
      expect(result).toEqual([['stream-key', []]]);
    });

    it('returns an empty array when reading the stream fails', async () => {
      mockSub.xreadgroup.mockRejectedValue(new Error('stream unavailable'));

      const result = await service.consumeFromRedisStream(
        'stream-key',
        'group-name',
        'consumer-1',
        10,
        2000,
      );

      expect(result).toEqual([]);
    });
  });

  describe('acknowledgeMessage', () => {
    it('acknowledges the message', async () => {
      mockSub.xack.mockResolvedValue(1);

      await service.acknowledgeMessage('stream-key', 'group-name', 'msg-1');

      expect(mockSub.xack).toHaveBeenCalledWith(
        'stream-key',
        'group-name',
        'msg-1',
      );
    });

    it('does not throw when acknowledging fails', async () => {
      mockSub.xack.mockRejectedValue(new Error('ack failed'));

      await expect(
        service.acknowledgeMessage('stream-key', 'group-name', 'msg-1'),
      ).resolves.toBeUndefined();
    });
  });
});
