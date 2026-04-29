import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { v4 as uuidv4 } from 'uuid';

export interface RequestContextData {
  requestId: string;
  timestamp: Date;
  userId?: string;
  tenantId?: string;
}

/**
 * Request context service using AsyncLocalStorage for request-scoped data.
 * Enables propagation of request ID and other context across the application
 * without explicit parameter passing.
 * 
 * Performance: AsyncLocalStorage adds < 0.1ms overhead per request.
 */
@Injectable()
export class RequestContextService {
  private readonly asyncLocalStorage = new AsyncLocalStorage<RequestContextData>();

  /**
   * Run a function with the given request context
   */
  run<T>(context: RequestContextData, callback: () => T): T {
    return this.asyncLocalStorage.run(context, callback);
  }

  /**
   * Get the current request context
   */
  getContext(): RequestContextData | undefined {
    return this.asyncLocalStorage.getStore();
  }

  /**
   * Get the current request ID
   */
  getRequestId(): string | undefined {
    return this.asyncLocalStorage.getStore()?.requestId;
  }

  /**
   * Create a new request context with a generated request ID
   */
  static createRequestId(): string {
    return uuidv4();
  }

  /**
   * Get or create request ID from headers
   * Supports X-Request-Id header for distributed tracing
   */
  static getOrCreateRequestId(headerValue?: string): string {
    if (headerValue && typeof headerValue === 'string') {
      return headerValue;
    }
    return uuidv4();
  }
}
