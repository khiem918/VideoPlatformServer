import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

export const restCurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext) => {
    const req = context.switchToHttp().getRequest<Request>();

    if (!req) {
      throw new UnauthorizedException('Request not found');
    }

    const user = req.user;

    if (!user) {
      throw new UnauthorizedException('User not found in request');
    }

    return user;
  },
);
