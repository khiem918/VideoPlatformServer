import {
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { AuthRepository } from './repository/auth.repository';
import { v4 as uuidv4 } from 'uuid';
import { compare, hash } from 'bcryptjs';
import { randomBytes } from 'crypto';
import { RedisService } from 'src/auth/session.service';
import { Session } from './type/session.type';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

const ACCESS_TOKEN_EXPIRES_IN = 15 * 60; // 15 minutes
const REFRESH_TOKEN_EXPIRES_IN = 7 * 24 * 60 * 60; // 7 days

@Injectable()
export class AuthService {
  constructor(
    private readonly AuthRepository: AuthRepository,
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
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
      const user = await this.AuthRepository.findByEmail(userEmail);
      const sessionId: string = uuidv4();
      const refreshToken = randomBytes(64).toString('hex');
      const userId: string = user.id;

      const accessToken = this.jwtService.sign(
        { userId } as Record<string, any>,
        {
          secret: this.config.get('JWT_SECRET'),
          expiresIn: ACCESS_TOKEN_EXPIRES_IN,
        },
      );

      const hashedRefreshToken = await this.hashToken(refreshToken);
      const session_data: Session = {
        userId,
        refreshToken: hashedRefreshToken,
        createdAt: new Date().toISOString(),
      };

      await this.redisService.set(
        `s:${sessionId}`,
        session_data,
        REFRESH_TOKEN_EXPIRES_IN,
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

        await this.redisService.set(
          `s:${newSessionId}`,
          new_sesssion_data,
          REFRESH_TOKEN_EXPIRES_IN,
        );

        return {
          newAccessToken: this.jwtService.sign(
            { userId } as Record<string, any>,
            {
              secret: this.config.get('JWT_SECRET'),
              expiresIn: ACCESS_TOKEN_EXPIRES_IN,
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
          secret: this.config.get('JWT_SECRET'),
          expiresIn: ACCESS_TOKEN_EXPIRES_IN,
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

}
