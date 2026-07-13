import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  function createConfig(
    secret: string | undefined,
  ): jest.Mocked<ConfigService> {
    return {
      get: jest.fn().mockReturnValue(secret),
    } as unknown as jest.Mocked<ConfigService>;
  }

  describe('constructor', () => {
    it('throws when JWT_SECRET is not configured', () => {
      const config = createConfig(undefined);

      expect(() => new JwtStrategy(config)).toThrow(
        'JWT_SECRET is not configured',
      );
    });

    it('constructs successfully when JWT_SECRET is configured', () => {
      const config = createConfig('secret');

      expect(() => new JwtStrategy(config)).not.toThrow();
    });
  });

  describe('validate', () => {
    let strategy: JwtStrategy;

    beforeEach(() => {
      strategy = new JwtStrategy(createConfig('secret'));
    });

    it('returns the payload when it is valid and not expired', () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;

      const result = strategy.validate({
        userId: 'user-1',
        iat: 0,
        exp: futureExp,
      });

      expect(result).toEqual({ userId: 'user-1', iat: 0, exp: futureExp });
    });

    it('throws UnauthorizedException when the payload has no userId', () => {
      expect(() => strategy.validate({ userId: '', iat: 0, exp: 0 })).toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when the token has expired', () => {
      const pastExp = Math.floor(Date.now() / 1000) - 3600;

      expect(() =>
        strategy.validate({ userId: 'user-1', iat: 0, exp: pastExp }),
      ).toThrow(UnauthorizedException);
    });
  });

  describe('token extraction from request', () => {
    let strategy: JwtStrategy;
    let extractToken: (request: any) => string | null;

    beforeEach(() => {
      strategy = new JwtStrategy(createConfig('secret'));
      extractToken = (strategy as any)._jwtFromRequest;
    });

    it('extracts the token from the Authorization bearer header', () => {
      const request = {
        headers: { authorization: 'Bearer header-token' },
        query: {},
        params: {},
        url: '/graphql',
      };

      expect(extractToken(request)).toBe('header-token');
    });

    it('extracts the token from a query string parameter', () => {
      const request = {
        headers: {},
        query: { token: 'query-token' },
        params: {},
        url: '/graphql?token=query-token',
      };

      expect(extractToken(request)).toBe('query-token');
    });

    it('extracts the token from a route parameter', () => {
      const request = {
        headers: {},
        query: {},
        params: { token: 'param-token' },
        url: '/stream/param-token',
      };

      expect(extractToken(request)).toBe('param-token');
    });

    it('extracts the token from the raw url when no other source matches', () => {
      const request = {
        headers: {},
        query: {},
        params: {},
        url: '/stream?foo=bar&token=url-token',
      };

      expect(extractToken(request)).toBe('url-token');
    });

    it('returns null when no token can be found anywhere', () => {
      const request = {
        headers: {},
        query: {},
        params: {},
        url: '/stream',
      };

      expect(extractToken(request)).toBeNull();
    });
  });
});
