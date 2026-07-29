import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  UseGuards,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { FirebaseService } from './firebase.service';
import type { Request, Response } from 'express';
import { AuthPayload } from './type/auth-payload.type';
import { GqlAuthGuard } from './guard/gql-auth.guard';
import { gqlCurrentUser } from './decorator/gql-current-user.decorator';
import { ConfigService } from '@nestjs/config';
import { SignInInput } from './dto/auth.dto';

const REFRESH_TOKEN_EXPIRES_IN = 7 * 24 * 60 * 60;

@Resolver()
export class AuthResolver {
  constructor(
    private readonly authService: AuthService,
    private readonly firebaseService: FirebaseService,
  ) {}

  async verifyFirebaseToken(idToken: string): Promise<{ email?: string }> {
    if (!idToken || typeof idToken !== 'string' || idToken.trim() === '') {
      throw new BadRequestException('Invalid or empty Firebase token');
    }

    try {
      return await this.firebaseService.verifyIdToken(idToken);
    } catch {
      throw new UnauthorizedException('Invalid Firebase token');
    }
  }

  @Query(() => String)
  @UseGuards(GqlAuthGuard)
  me(@gqlCurrentUser() user: { userId: string }): string {
    return user.userId;
  }

  @Mutation(() => AuthPayload)
  async signIn(
    @Args('ClientToken') clientToken: SignInInput,
    @Context('res') res: Response,
  ): Promise<AuthPayload> {
    const googlePayload = await this.verifyFirebaseToken(clientToken.clientId);

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
      maxAge: REFRESH_TOKEN_EXPIRES_IN * 1000, 
    });

    res.cookie('FTK', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      signed: true,
      maxAge: REFRESH_TOKEN_EXPIRES_IN * 1000,
    });

    return {
      user_id: userId,
      accessToken,
    };
  }

  @Mutation(() => AuthPayload)
  @UseGuards(GqlAuthGuard)
  async rotateToken(
    @gqlCurrentUser() user: { userId: string; iat: number },
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
        maxAge: REFRESH_TOKEN_EXPIRES_IN * 1000,
      });
      res.cookie('SSID', newSessionId, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        signed: true,
        maxAge: REFRESH_TOKEN_EXPIRES_IN * 1000,
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
        maxAge: REFRESH_TOKEN_EXPIRES_IN * 1000,
      });
      res.cookie('SSID', newSessionId, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        signed: true,
        maxAge: REFRESH_TOKEN_EXPIRES_IN * 1000,
      });
    }

    return { user_id: userId || '', accessToken: newAccessToken };
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async signOut(
    @gqlCurrentUser() user: { userId: string; iat: number },
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
