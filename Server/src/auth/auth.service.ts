import {
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { UserService } from 'src/user/user.service';
import { v4 as uuidv4 } from 'uuid';
import { compare, hash } from 'bcryptjs';
import { randomBytes, timingSafeEqual } from 'crypto';
import { RedisService } from 'src/redis/redis.service';
import { Session } from './type/session.type';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
  ) {}

  private async hashToken(token: string): Promise<string> {
    return hash(token, 10);
  }

  async signIn(userEmail: string): Promise<{
    userId: string;
    refreshToken: string;
    accessToken: string;
    sessionId: string;
  }> {
    try {
      const user = await this.userService.findByEmail(userEmail);
      const sessionId: string = uuidv4();
      const refreshToken = randomBytes(64).toString('hex');
      const userId: string = user.id;

      const accessToken = this.jwtService.sign(
        { userId } as Record<string, any>,
        {
          secret: process.env.JWT_SECRET || 'default-secret',
          expiresIn: (process.env.ACCESS_TOKEN_EXPIRES_IN || '1h') as any,
        },
      );

      const hashedRefreshToken = await this.hashToken(refreshToken);
      const session_data: Session = {
        userId,
        refreshToken: hashedRefreshToken,
        createdAt: new Date().toISOString(),
      };

      const refreshTokenExpiry = this.parseExpiryToDays(
        process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
      );

      await this.redisService.set(
        `s:${sessionId}`,
        session_data,
        refreshTokenExpiry * 24 * 60 * 60, // Convert days to seconds
      );

      return {
        userId: userId,
        refreshToken: refreshToken,
        accessToken: accessToken,
        sessionId: sessionId,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new InternalServerErrorException(
          `Sign in failed: ${error.message}`,
        );
      }
      throw new InternalServerErrorException('Sign in failed');
    }
  }

  async rotateToken(
    userId: string,
    sessionId: string,
    refreshToken: string,
  ): Promise<{
    newAccessToken: string;
    newFreshToken?: string;
    newSessionId?: string;
    userId: string;
  }> {
    try {
      const sessionKey = `s:${sessionId}`;
      const sessionData = (await this.redisService.get(
        sessionKey,
      )) as Session | null;

      if (!sessionData || !refreshToken || !sessionId) {
        const newRefreshToken = randomBytes(64).toString('hex');
        const newSessionId: string = uuidv4();
        const hashedNewRefreshToken = await this.hashToken(newRefreshToken);
        const new_sesssion_data: Session = {
          userId,
          refreshToken: hashedNewRefreshToken,
          createdAt: new Date().toISOString(),
        };

        const refreshTokenExpiry = this.parseExpiryToDays(
          process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
        );

        await this.redisService.set(
          `s:${newSessionId}`,
          new_sesssion_data,
          refreshTokenExpiry * 24 * 60 * 60,
        );

        return {
          newAccessToken: this.jwtService.sign(
            { userId } as Record<string, any>,
            {
              secret: process.env.JWT_SECRET || 'default-secret',
              expiresIn: (process.env.ACCESS_TOKEN_EXPIRES_IN || '1h') as any,
            },
          ),
          newFreshToken: newRefreshToken,
          newSessionId: newSessionId,
          userId: userId || (sessionData?.userId ?? ''),
        };
      }

      const isTokenValid = await compare(
        refreshToken,
        sessionData.refreshToken,
      );

      if (!isTokenValid) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const finalUserId = userId || sessionData.userId;

      const newAccessToken = this.jwtService.sign(
        { userId: finalUserId } as Record<string, any>,
        {
          secret: process.env.JWT_SECRET || 'default-secret',
          expiresIn: (process.env.ACCESS_TOKEN_EXPIRES_IN || '1h') as any,
        },
      );

      return {
        newAccessToken: newAccessToken,
        userId: finalUserId,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      if (error instanceof Error) {
        throw new InternalServerErrorException(
          `Token rotation failed: ${error.message}`,
        );
      }
      throw new InternalServerErrorException('Token rotation failed');
    }
  }

  async signOut(userId: string, sessionId: string): Promise<void> {
    try {
      const sessionKey = `s:${sessionId}`;
      const sessionData = (await this.redisService.get(
        sessionKey,
      )) as Session | null;

      if (sessionData && sessionData.userId === userId) {
        await this.redisService.del(sessionKey);
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new InternalServerErrorException(
          `Sign out failed: ${error.message}`,
        );
      }
      throw new InternalServerErrorException('Sign out failed');
    }
  }

  private parseExpiryToDays(expiry: string): number {
    if (expiry.endsWith('d')) {
      return parseInt(expiry, 10);
    }
    if (expiry.endsWith('h')) {
      return Math.ceil(parseInt(expiry, 10) / 24);
    }
    return 7; // default 7 days
  }
}
