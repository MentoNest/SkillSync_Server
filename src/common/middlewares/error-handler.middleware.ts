import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class ErrorHandlerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    console.log(`Incoming Request: ${req.method} ${req.originalUrl}`);

    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(
        ` ${req.method} ${req.originalUrl} - Status: ${res.statusCode} - ${duration}ms`,
      );
    });

    res.on('error', (err) => {
      console.error(` Error occurred: ${err.message}`);
    });

    next();
  }
}
