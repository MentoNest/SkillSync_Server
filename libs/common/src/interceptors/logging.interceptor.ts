import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const request = context.switchToHttp().getRequest();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { method, url } = request;
    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const response = context.switchToHttp().getResponse();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const { statusCode } = response;
        const duration = Date.now() - startTime;

        /* eslint-disable @typescript-eslint/no-unsafe-assignment */
        console.log(
          JSON.stringify({
            method,
            url,
            statusCode,
            durationMs: duration,
            timestamp: new Date().toISOString(),
          }),
        );
        /* eslint-enable @typescript-eslint/no-unsafe-assignment */
      }),
    );
  }
}
