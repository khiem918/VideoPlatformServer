import {
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { AuthService } from './auth.service';
import { AuthRepository } from './repository/auth.repository';
import { RedisService } from 'src/auth/session.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let authRepository: jest.Mocked<AuthRepository>;
  let redisService: jest.Mocked<RedisService>;
  let jwtService: jest.Mocked<JwtService>;
  let config: jest.Mocked<ConfigService>;

  beforeEach(() => {
    authRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
    } as unknown as jest.Mocked<AuthRepository>;

    redisService = {
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
    } as unknown as jest.Mocked<RedisService>;

    jwtService = {
      sign: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          JWT_SECRET: 'secret',
          ACCESS_TOKEN_EXPIRES_IN: '15m',
          REFRESH_TOKEN_EXPIRES_IN: '3600',
        };
        return values[key];
      }),
    } as unknown as jest.Mocked<ConfigService>;

    service = new AuthService(authRepository, redisService, jwtService, config);

    jest.clearAllMocks();
    (hash as jest.Mock).mockResolvedValue('hashed-token');
    jwtService.sign.mockReturnValue('signed-access-token');
  });

  describe('signIn', () => {
    it('returns tokens and stores a hashed session when the user is found', async () => {
      authRepository.findByEmail.mockResolvedValue({ id: 'user-1' } as any);

      const result = await service.signIn('user@example.com');

      expect(authRepository.findByEmail).toHaveBeenCalledWith(
        'user@example.com',
      );
      expect(redisService.set).toHaveBeenCalledWith(
        expect.stringMatching(/^s:/),
        expect.objectContaining({
          userId: 'user-1',
          refreshToken: 'hashed-token',
        }),
        7 * 24 * 60 * 60,
      );
      expect(result.userId).toBe('user-1');
      expect(result.accessToken).toBe('signed-access-token');
      expect(typeof result.refreshToken).toBe('string');
      expect(typeof result.sessionId).toBe('string');
    });

    it('throws InternalServerErrorException when the repository lookup fails', async () => {
      authRepository.findByEmail.mockRejectedValue(new Error('db down'));

      await expect(service.signIn('user@example.com')).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('throws InternalServerErrorException with a generic message when a non-Error is thrown', async () => {
      authRepository.findByEmail.mockRejectedValue('unexpected failure');

      await expect(service.signIn('user@example.com')).rejects.toThrow(
        'Sign in failed',
      );
    });
  });

  describe('rotateToken', () => {
    it('issues a brand new session when no session data exists', async () => {
      redisService.get.mockResolvedValue(null);

      const result = await service.rotateToken(
        'user-1',
        'session-1',
        'refresh-1',
      );

      expect(redisService.set).toHaveBeenCalledWith(
        expect.stringMatching(/^s:/),
        expect.objectContaining({ userId: 'user-1' }),
        7 * 24 * 60 * 60,
      );
      expect(result.newAccessToken).toBe('signed-access-token');
      expect(result.newFreshToken).toEqual(expect.any(String));
      expect(result.newSessionId).toEqual(expect.any(String));
      expect(result.userId).toBe('user-1');
    });

    it('falls back to the stored session userId when userId argument is empty', async () => {
      redisService.get.mockResolvedValue(null);

      const result = await service.rotateToken('', 'session-1', 'refresh-1');

      expect(result.userId).toBe('');
    });

    it('rotates the access token when the refresh token is valid', async () => {
      redisService.get.mockResolvedValue({
        userId: 'user-1',
        refreshToken: 'hashed-stored-token',
        createdAt: new Date().toISOString(),
      });
      (compare as jest.Mock).mockResolvedValue(true);

      const result = await service.rotateToken(
        'user-1',
        'session-1',
        'refresh-1',
      );

      expect(compare).toHaveBeenCalledWith('refresh-1', 'hashed-stored-token');
      expect(result.newAccessToken).toBe('signed-access-token');
      expect(result.newFreshToken).toBeUndefined();
      expect(result.newSessionId).toBeUndefined();
      expect(result.userId).toBe('user-1');
    });

    it('uses the session userId when the userId argument is falsy but the token is valid', async () => {
      redisService.get.mockResolvedValue({
        userId: 'stored-user',
        refreshToken: 'hashed-stored-token',
        createdAt: new Date().toISOString(),
      });
      (compare as jest.Mock).mockResolvedValue(true);

      const result = await service.rotateToken('', 'session-1', 'refresh-1');

      expect(result.userId).toBe('stored-user');
    });

    it('throws UnauthorizedException when the refresh token does not match', async () => {
      redisService.get.mockResolvedValue({
        userId: 'user-1',
        refreshToken: 'hashed-stored-token',
        createdAt: new Date().toISOString(),
      });
      (compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.rotateToken('user-1', 'session-1', 'refresh-1'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws InternalServerErrorException when Redis fails unexpectedly', async () => {
      redisService.get.mockRejectedValue(new Error('redis down'));

      await expect(
        service.rotateToken('user-1', 'session-1', 'refresh-1'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('signOut', () => {
    it('deletes the session when it belongs to the requesting user', async () => {
      redisService.get.mockResolvedValue({
        userId: 'user-1',
        refreshToken: 'hashed-token',
        createdAt: new Date().toISOString(),
      });

      await service.signOut('user-1', 'session-1');

      expect(redisService.del).toHaveBeenCalledWith('s:session-1');
    });

    it('does not delete the session when it belongs to a different user', async () => {
      redisService.get.mockResolvedValue({
        userId: 'someone-else',
        refreshToken: 'hashed-token',
        createdAt: new Date().toISOString(),
      });

      await service.signOut('user-1', 'session-1');

      expect(redisService.del).not.toHaveBeenCalled();
    });

    it('does nothing when there is no session data', async () => {
      redisService.get.mockResolvedValue(null);

      await service.signOut('user-1', 'session-1');

      expect(redisService.del).not.toHaveBeenCalled();
    });

    it('throws InternalServerErrorException when Redis fails', async () => {
      redisService.get.mockRejectedValue(new Error('redis down'));

      await expect(service.signOut('user-1', 'session-1')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
