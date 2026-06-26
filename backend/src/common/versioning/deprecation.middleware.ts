import { Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class DeprecationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const match = req.path.match(/^\/api\/v(\d+)\//);
    if (match) {
      const version = parseInt(match[1], 10);
      if (version < 1) {
        throw new NotFoundException(`API version v${version} is not supported`);
      }
      if (version > 1) {
        throw new NotFoundException(`API version v${version} is not yet available`);
      }
    }
    next();
  }
}
