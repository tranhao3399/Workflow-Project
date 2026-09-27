import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import type { RequestWithContext } from '../http/request-context.interface.js';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: RequestWithContext, response: Response, next: NextFunction): void {
    const requestId = randomUUID();
    request.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);
    next();
  }
}
