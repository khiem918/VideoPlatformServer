import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  UseGuards,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { OAuth2Client } from 'google-auth-library';
import type { Request, Response } from 'express';
import { AuthPayload } from './type/auth-payload.type';
import { GqlAuthGuard } from './guard/gql-auth.guard';
import { CurrentUser } from './decorator/current-user.decorator';
import { ConfigService } from '@nestjs/config';
import { SignInInput } from './dto/auth.dto';

@Resolver()
export class AuthResolver {

  private client: OAuth2Client;

  constructor(
    private readonly authService: AuthService, 
    private readonly config: ConfigService,
  ) {
    this.client = new OAuth2Client(this.config.get('GOOGLE_CLIENT_ID'));
  }

  async verifyGoogleToken(idToken: string): Promise<any> {
    try {
      if (!idToken || typeof idToken !== 'string' || idToken.trim() === '') {
        throw new BadRequestException('Invalid or empty Google token');
      }

      const ticket = await this.client.verifyIdToken({
        idToken: idToken,
        audience: this.config.get('GOOGLE_CLIENT_ID'),
      });

      return ticket.getPayload();
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid Google token');
    }
  }

  @Query(() => String)
  @UseGuards(GqlAuthGuard)
  me(@CurrentUser() user: { userId: string }): string {
    return user.userId;
  }

  @Mutation(() => AuthPayload)
  async signIn(
    @Args('ClientToken') clientToken: SignInInput,
    @Context('res') res: Response,
  ): Promise<AuthPayload> {
    const googlePayload = await this.verifyGoogleToken(clientToken.clientId);

    if (!googlePayload?.email) {
      throw new UnauthorizedException('No email in Google token');
    }

    const { userId, refreshToken, accessToken, sessionId } =
      await this.authService.signIn(googlePayload.email);

    res.cookie('SSID', sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      signed: true,
      maxAge: parseInt(<string>this.config.get('REFRESH_TOKEN_EXPIRES_IN'), 10),
    });

    res.cookie('FTK', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      signed: true,
      maxAge: parseInt(<string>this.config.get('REFRESH_TOKEN_EXPIRES_IN'), 10),
    });

    return {
      user_id: userId,
      accessToken,
    };
  }

  @Mutation(() => AuthPayload)
  @UseGuards(GqlAuthGuard)
  async rotateToken(
    @CurrentUser() user: { userId: string; iat: number },
    @Context('req') req: Request,
    @Context('res') res: Response,
  ): Promise<AuthPayload> {
    const refreshToken = req.signedCookies['FTK'] as string | undefined;
    const sessionId = req.signedCookies['SSID'] as string | undefined;

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    if (!sessionId) {
      throw new UnauthorizedException('Session ID not found');
    }

    const { newAccessToken, newFreshToken, newSessionId } =
      await this.authService.rotateToken(user.userId, sessionId, refreshToken);

    if (newFreshToken && newSessionId) {
      res.cookie('FTK', newFreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        signed: true,
        maxAge: parseInt(<string>this.config.get('REFRESH_TOKEN_EXPIRES_IN'), 10),
      });
      res.cookie('SSID', newSessionId, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        signed: true,
        maxAge: parseInt(<string>this.config.get('REFRESH_TOKEN_EXPIRES_IN'), 10),
      });
    }
    return { user_id: user.userId, accessToken: newAccessToken };
  }

  @Mutation(() => AuthPayload)
  async refresh(
    @Context('req') req: Request,
    @Context('res') res: Response,
  ): Promise<AuthPayload> {
    const refreshToken = req.signedCookies['FTK'] as string | undefined;
    const sessionId = req.signedCookies['SSID'] as string | undefined;

    if (!refreshToken || !sessionId) {
      throw new UnauthorizedException('Missing refresh token or session ID');
    }

    const { newAccessToken, newFreshToken, newSessionId, userId } =
      await this.authService.rotateToken('', sessionId, refreshToken);

    if (newFreshToken && newSessionId) {
      res.cookie('FTK', newFreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        signed: true,
        maxAge: parseInt(<string>this.config.get('REFRESH_TOKEN_EXPIRES_IN'), 10),
      });
      res.cookie('SSID', newSessionId, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        signed: true,
        maxAge: parseInt(<string>this.config.get('REFRESH_TOKEN_EXPIRES_IN'), 10),
      });
    }

    return { user_id: userId || '', accessToken: newAccessToken };
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async signOut(
    @CurrentUser() user: { userId: string; iat: number },
    @Context('res') res: Response,
    @Context('req') req: Request,
  ): Promise<boolean> {
    const sessionId = req.signedCookies['SSID'] as string | undefined;

    if (!sessionId) {
      throw new UnauthorizedException('Session ID not found');
    }

    await this.authService.signOut(user.userId, sessionId);
    res.clearCookie('FTK');
    res.clearCookie('SSID');
    return true;
  }
}
