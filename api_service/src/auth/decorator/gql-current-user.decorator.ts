import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { Request } from 'express';

export const gqlCurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext) => {
    const gqlContext = GqlExecutionContext.create(context);
    const contextObj = gqlContext.getContext<{ req?: Request }>();

    if (!contextObj) {
      throw new UnauthorizedException('Context not found');
    }

    const req = contextObj.req;

    if (!req) {
      throw new UnauthorizedException('Request not found in context');
    }

    const user = req.user;

    if (!user) {
      throw new UnauthorizedException('User not found in request');
    }

    return user;
  },
);
