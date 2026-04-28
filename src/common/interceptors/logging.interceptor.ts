import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const requestId = uuidv4();
    const method = request.method;
    const url = request.url;
    const startTime = Date.now();

    // Attach request ID to request
    request.headers['x-request-id'] = requestId;

    this.logger.log(`${method} ${url} [${requestId}]`);

    const now = Date.now();

    return next.handle().pipe(
      tap(() => {
        const responseTime = Date.now() - now;
        const statusCode = response.statusCode;

        this.logger.log(
          `${method} ${url} ${statusCode} ${responseTime}ms [${requestId}]`,
        );

        // Attach request ID to response headers
        response.setHeader('X-Request-Id', requestId);
        response.setHeader('X-Response-Time', `${responseTime}ms`);
      }),
    );
  }
}
