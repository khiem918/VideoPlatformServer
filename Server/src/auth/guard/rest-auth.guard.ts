import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

@Injectable()
export class RestAuthGuard extends AuthGuard('jwt') {
  getRequest(context: ExecutionContext): Request {
    return context.switchToHttp().getRequest<Request>();
  }
}
