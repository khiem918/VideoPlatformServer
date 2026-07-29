import {
  buildRedisOptions,
  isRedisTlsEnabled,
  parseRedisPort,
  pingWithTimeout,
} from './redis-connection';

describe('redis-connection', () => {
  const originalTlsValue = process.env.REDIS_TLS;

  afterEach(() => {
    if (originalTlsValue === undefined) {
      delete process.env.REDIS_TLS;
    } else {
      process.env.REDIS_TLS = originalTlsValue;
    }
  });

  describe('parseRedisPort', () => {
    it('parses a numeric port from its string form', () => {
      expect(parseRedisPort('6380')).toBe(6380);
    });

    it('falls back to 6379 when the port is unset', () => {
      expect(parseRedisPort(undefined)).toBe(6379);
    });

    it('falls back to 6379 when the port is not a number', () => {
      expect(parseRedisPort('not-a-port')).toBe(6379);
    });
  });

  describe('isRedisTlsEnabled', () => {
    it.each(['true', 'TRUE', ' true ', '1'])(
      'is enabled when REDIS_TLS is %p',
      (value) => {
        process.env.REDIS_TLS = value;

        expect(isRedisTlsEnabled()).toBe(true);
      },
    );

    it.each(['false', '0', ''])('is disabled when REDIS_TLS is %p', (value) => {
      process.env.REDIS_TLS = value;

      expect(isRedisTlsEnabled()).toBe(false);
    });

    it('is disabled when REDIS_TLS is unset', () => {
      delete process.env.REDIS_TLS;

      expect(isRedisTlsEnabled()).toBe(false);
    });
  });

  describe('buildRedisOptions', () => {
    it('omits tls so plaintext local Redis still connects', () => {
      delete process.env.REDIS_TLS;

      const options = buildRedisOptions({
        host: 'localhost',
        port: 6379,
        db: 1,
      });

      expect(options).not.toHaveProperty('tls');
    });

    it('enables tls when REDIS_TLS is set', () => {
      process.env.REDIS_TLS = 'true';

      const options = buildRedisOptions({
        host: 'cache.example.com',
        port: 6379,
        db: 0,
      });

      expect(options.tls).toEqual({});
    });

    it('preserves the endpoint and bounds the handshake', () => {
      delete process.env.REDIS_TLS;

      const options = buildRedisOptions({
        host: 'cache.example.com',
        port: 6380,
        db: 2,
      });

      expect(options.host).toBe('cache.example.com');
      expect(options.port).toBe(6380);
      expect(options.db).toBe(2);
      expect(options.connectTimeout).toBeGreaterThan(0);
    });
  });

  describe('pingWithTimeout', () => {
    it('resolves when the server answers', async () => {
      const client = { ping: jest.fn().mockResolvedValue('PONG') };

      await expect(pingWithTimeout(client)).resolves.toBeUndefined();
      expect(client.ping).toHaveBeenCalledTimes(1);
    });

    it('propagates a rejected ping', async () => {
      const client = {
        ping: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      };

      await expect(pingWithTimeout(client)).rejects.toThrow('ECONNREFUSED');
    });

    it('rejects when the server never answers instead of hanging', async () => {
      jest.useFakeTimers();

      try {
        // A plaintext client against a TLS-only ElastiCache node leaves PING
        // pending forever; without the timeout this awaits indefinitely and
        // the app never reaches app.listen().
        const client = {
          ping: jest.fn().mockReturnValue(new Promise<string>(() => {})),
        };
        const pending = pingWithTimeout(client);
        const assertion =
          expect(pending).rejects.toThrow(/did not answer PING/);

        await jest.advanceTimersByTimeAsync(15_000);
        await assertion;
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
