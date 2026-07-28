import { BadRequestException, UnauthorizedException } from '@nestjs/common';

jest.mock('firebase-admin/app', () => ({
  cert: jest.fn(),
  initializeApp: jest.fn(),
  getApp: jest.fn(),
  getApps: jest.fn().mockReturnValue([]),
}));

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(),
}));

import { AuthResolver } from './auth.resolver';
import { AuthService } from './auth.service';
import { FirebaseService } from './firebase.service';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

function createAuthServiceMock() {
  return {
    signIn: jest.fn(),
    rotateToken: jest.fn(),
    signOut: jest.fn(),
  };
}

function createFirebaseServiceMock() {
  return {
    verifyIdToken: jest.fn(),
  };
}

function createConfigServiceMock() {
  return {
    get: jest.fn().mockReturnValue('3600'),
  };
}

function createResponse() {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  };
}

function createRequest(signedCookies: Record<string, string>) {
  return { signedCookies };
}

describe('AuthResolver', () => {
  let resolver: AuthResolver;
  let authService: ReturnType<typeof createAuthServiceMock>;
  let firebaseService: ReturnType<typeof createFirebaseServiceMock>;
  let config: ReturnType<typeof createConfigServiceMock>;

  beforeEach(() => {
    authService = createAuthServiceMock();
    firebaseService = createFirebaseServiceMock();
    config = createConfigServiceMock();

    resolver = new AuthResolver(
      authService as unknown as AuthService,
      firebaseService as unknown as FirebaseService,
      config as unknown as ConfigService,
    );
  });

  describe('verifyFirebaseToken', () => {
    it('throws BadRequestException when the token is empty', async () => {
      await expect(resolver.verifyFirebaseToken('')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when the token is only whitespace', async () => {
      await expect(resolver.verifyFirebaseToken('   ')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns the decoded token when Firebase verification succeeds', async () => {
      firebaseService.verifyIdToken.mockResolvedValue({
        email: 'user@example.com',
      });

      const result = await resolver.verifyFirebaseToken('valid-token');

      expect(result).toEqual({ email: 'user@example.com' });
    });

    it('throws UnauthorizedException when Firebase verification fails', async () => {
      firebaseService.verifyIdToken.mockRejectedValue(new Error('bad token'));

      await expect(
        resolver.verifyFirebaseToken('invalid-token'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('me', () => {
    it('returns the userId from the current user', () => {
      const result = resolver.me({ userId: 'user-1' });

      expect(result).toBe('user-1');
    });
  });

  describe('signIn', () => {
    it('sets session cookies and returns the auth payload on success', async () => {
      firebaseService.verifyIdToken.mockResolvedValue({
        email: 'user@example.com',
      });
      authService.signIn.mockResolvedValue({
        userId: 'user-1',
        refreshToken: 'refresh-token',
        accessToken: 'access-token',
        sessionId: 'session-1',
      });
      const res = createResponse();

      const result = await resolver.signIn(
        { clientId: 'client-token' },
        res as unknown as Response,
      );

      expect(authService.signIn).toHaveBeenCalledWith('user@example.com');
      expect(res.cookie).toHaveBeenCalledWith(
        'SSID',
        'session-1',
        expect.objectContaining({ httpOnly: true }),
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'FTK',
        'refresh-token',
        expect.objectContaining({ httpOnly: true }),
      );
      expect(result).toEqual({
        user_id: 'user-1',
        accessToken: 'access-token',
      });
    });

    it('throws UnauthorizedException when Firebase payload has no email', async () => {
      firebaseService.verifyIdToken.mockResolvedValue({});
      const res = createResponse();

      await expect(
        resolver.signIn(
          { clientId: 'client-token' },
          res as unknown as Response,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('rotateToken', () => {
    it('throws UnauthorizedException when the refresh token cookie is missing', async () => {
      const req = createRequest({ SSID: 'session-1' });
      const res = createResponse();

      await expect(
        resolver.rotateToken(
          { userId: 'user-1', iat: 0 },
          req as unknown as Request,
          res as unknown as Response,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the session id cookie is missing', async () => {
      const req = createRequest({ FTK: 'refresh-token' });
      const res = createResponse();

      await expect(
        resolver.rotateToken(
          { userId: 'user-1', iat: 0 },
          req as unknown as Request,
          res as unknown as Response,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rotates cookies when a new session is issued', async () => {
      const req = createRequest({
        FTK: 'refresh-token',
        SSID: 'session-1',
      });
      const res = createResponse();
      authService.rotateToken.mockResolvedValue({
        newAccessToken: 'new-access-token',
        newFreshToken: 'new-refresh-token',
        newSessionId: 'new-session-1',
        userId: 'user-1',
      });

      const result = await resolver.rotateToken(
        { userId: 'user-1', iat: 0 },
        req as unknown as Request,
        res as unknown as Response,
      );

      expect(res.cookie).toHaveBeenCalledWith(
        'FTK',
        'new-refresh-token',
        expect.any(Object),
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'SSID',
        'new-session-1',
        expect.any(Object),
      );
      expect(result).toEqual({
        user_id: 'user-1',
        accessToken: 'new-access-token',
      });
    });

    it('does not set cookies when the session is simply refreshed', async () => {
      const req = createRequest({
        FTK: 'refresh-token',
        SSID: 'session-1',
      });
      const res = createResponse();
      authService.rotateToken.mockResolvedValue({
        newAccessToken: 'new-access-token',
        userId: 'user-1',
      });

      await resolver.rotateToken(
        { userId: 'user-1', iat: 0 },
        req as unknown as Request,
        res as unknown as Response,
      );

      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('throws UnauthorizedException when cookies are missing', async () => {
      const req = createRequest({});
      const res = createResponse();

      await expect(
        resolver.refresh(req as unknown as Request, res as unknown as Response),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns a new access token when refresh succeeds', async () => {
      const req = createRequest({
        FTK: 'refresh-token',
        SSID: 'session-1',
      });
      const res = createResponse();
      authService.rotateToken.mockResolvedValue({
        newAccessToken: 'new-access-token',
        userId: 'user-1',
      });

      const result = await resolver.refresh(
        req as unknown as Request,
        res as unknown as Response,
      );

      expect(authService.rotateToken).toHaveBeenCalledWith(
        '',
        'session-1',
        'refresh-token',
      );
      expect(result).toEqual({
        user_id: 'user-1',
        accessToken: 'new-access-token',
      });
    });

    it('returns an empty user_id when no userId is resolved', async () => {
      const req = createRequest({
        FTK: 'refresh-token',
        SSID: 'session-1',
      });
      const res = createResponse();
      authService.rotateToken.mockResolvedValue({
        newAccessToken: 'new-access-token',
        userId: '',
      });

      const result = await resolver.refresh(
        req as unknown as Request,
        res as unknown as Response,
      );

      expect(result.user_id).toBe('');
    });
  });

  describe('signOut', () => {
    it('throws UnauthorizedException when the session id cookie is missing', async () => {
      const req = createRequest({});
      const res = createResponse();

      await expect(
        resolver.signOut(
          { userId: 'user-1', iat: 0 },
          res as unknown as Response,
          req as unknown as Request,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('clears cookies and signs the user out', async () => {
      const req = createRequest({ SSID: 'session-1' });
      const res = createResponse();

      const result = await resolver.signOut(
        { userId: 'user-1', iat: 0 },
        res as unknown as Response,
        req as unknown as Request,
      );

      expect(authService.signOut).toHaveBeenCalledWith('user-1', 'session-1');
      expect(res.clearCookie).toHaveBeenCalledWith('FTK');
      expect(res.clearCookie).toHaveBeenCalledWith('SSID');
      expect(result).toBe(true);
    });
  });
});
