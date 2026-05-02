import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';

export const restCurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext) => {
    const req = context.switchToHttp().getRequest();

    if (!req) {
      throw new UnauthorizedException('Request not found');
    }

    const user = (req as any).user;

    if (!user) {
      throw new UnauthorizedException('User not found in request');
    }

    return user;
  } 
);