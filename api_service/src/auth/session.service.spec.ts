import { InternalServerErrorException } from '@nestjs/common';

const mockRedisInstance = {
  on: jest.fn(),
  ping: jest.fn(),
  quit: jest.fn(),
  setex: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
};

jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => mockRedisInstance),
);

import { RedisService } from './session.service';

describe('RedisService (auth session store)', () => {
  let service: RedisService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RedisService();
  });

  describe('onModuleInit', () => {
    it('succeeds when the ping resolves', async () => {
      mockRedisInstance.ping.mockResolvedValue('PONG');

      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });

    it('throws InternalServerErrorException when the ping fails', async () => {
      mockRedisInstance.ping.mockRejectedValue(new Error('connection refused'));

      await expect(service.onModuleInit()).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('onModuleDestroy', () => {
    it('quits the redis client', async () => {
      mockRedisInstance.quit.mockResolvedValue('OK');

      await service.onModuleDestroy();

      expect(mockRedisInstance.quit).toHaveBeenCalled();
    });

    it('swallows errors while disconnecting', async () => {
      mockRedisInstance.quit.mockRejectedValue(new Error('already closed'));

      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    });
  });

  describe('set', () => {
    it('stores the value as JSON with an expiry', async () => {
      mockRedisInstance.setex.mockResolvedValue('OK');

      await service.set('key-1', { userId: 'user-1' }, 3600);

      expect(mockRedisInstance.setex).toHaveBeenCalledWith(
        'key-1',
        3600,
        JSON.stringify({ userId: 'user-1' }),
      );
    });

    it('throws InternalServerErrorException for an empty key', async () => {
      await expect(service.set('', {}, 3600)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('throws InternalServerErrorException when the client fails', async () => {
      mockRedisInstance.setex.mockRejectedValue(new Error('redis down'));

      await expect(service.set('key-1', {}, 3600)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('get', () => {
    it('returns the parsed value', async () => {
      mockRedisInstance.get.mockResolvedValue(
        JSON.stringify({ userId: 'user-1' }),
      );

      const result: unknown = await service.get('key-1');

      expect(result).toEqual({ userId: 'user-1' });
    });

    it('returns null when the key does not exist', async () => {
      mockRedisInstance.get.mockResolvedValue(null);

      const result: unknown = await service.get('key-1');

      expect(result).toBeNull();
    });

    it('returns null when the stored value is not valid JSON', async () => {
      mockRedisInstance.get.mockResolvedValue('not-json');

      const result: unknown = await service.get('key-1');

      expect(result).toBeNull();
    });

    it('throws InternalServerErrorException for an empty key', async () => {
      await expect(service.get('')).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('throws InternalServerErrorException when the client fails', async () => {
      mockRedisInstance.get.mockRejectedValue(new Error('redis down'));

      await expect(service.get('key-1')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('del', () => {
    it('deletes the key', async () => {
      mockRedisInstance.del.mockResolvedValue(1);

      await service.del('key-1');

      expect(mockRedisInstance.del).toHaveBeenCalledWith('key-1');
    });

    it('throws InternalServerErrorException for an empty key', async () => {
      await expect(service.del('')).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('throws InternalServerErrorException when the client fails', async () => {
      mockRedisInstance.del.mockRejectedValue(new Error('redis down'));

      await expect(service.del('key-1')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
