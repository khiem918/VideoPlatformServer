import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { Request } from 'express';

@Injectable()
export class GqlAuthGuard extends AuthGuard('jwt') {
  getRequest(context: ExecutionContext): Request {
    const gqlContext = GqlExecutionContext.create(context);
    const req = gqlContext.getContext().req as Request | undefined;

    if (!req) {
      throw new UnauthorizedException('Request context not found');
    }

    return req;
  }
}

