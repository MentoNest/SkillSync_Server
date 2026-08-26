import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { GracefulShutdownService } from './graceful-shutdown.service';

@Injectable()
export class ShutdownInterceptor implements NestInterceptor {
  constructor(private readonly shutdownService: GracefulShutdownService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const state = this.shutdownService.getState();

    // Reject new requests during shutdown
    if (state.isShuttingDown) {
      throw new ServiceUnavailableException(
        'Server is shutting down. Please try again later.',
      );
    }

    // Track this request
    this.shutdownService.trackRequest();

    return next.handle().pipe(
      tap({
        next: () => this.shutdownService.completeRequest(),
        error: () => this.shutdownService.completeRequest(),
      }),
    );
  }
}
