import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';

function extractTokenFromRequest(request: Request): string | null {
  const bearerToken = ExtractJwt.fromAuthHeaderAsBearerToken()(request);
  if (bearerToken) {
    return bearerToken;
  }

  const queryToken =
    typeof request.query.token === 'string' ? request.query.token : null;
  if (queryToken) {
    return queryToken.startsWith('token=')
      ? queryToken.slice('token='.length)
      : queryToken;
  }

  const pathToken =
    typeof request.params?.token === 'string' ? request.params.token : null;
  if (pathToken) {
    return pathToken.startsWith('token=')
      ? pathToken.slice('token='.length)
      : pathToken;
  }

  const urlMatch = request.url.match(/(?:\?|&)token=([^&]+)/);
  if (!urlMatch) {
    return null;
  }

  const rawToken = decodeURIComponent(urlMatch[1]);
  return rawToken.startsWith('token=')
    ? rawToken.slice('token='.length)
    : rawToken;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    const jwtSecret = configService.get<string>('JWT_SECRET');

    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not configured');
    }

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([extractTokenFromRequest]),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  validate(payload: { userId: string; iat: number; exp: number }): {
    userId: string;
    iat: number;
    exp: number;
  } {
    if (!payload?.userId) {
      throw new UnauthorizedException('Invalid token payload');
    }

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Token has expired');
    }

    return {
      userId: payload.userId,
      iat: payload.iat,
      exp: payload.exp,
    };
  }
}
