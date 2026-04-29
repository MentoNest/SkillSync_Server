import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestContextService } from '../services/request-context.service';

/**
 * Decorator to get the current request ID from the async context.
 * Usage: @RequestId() requestId: string
 */
export const RequestId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | undefined => {
    const requestContext = new RequestContextService();
    return requestContext.getRequestId();
  },
);

/**
 * Decorator to get the full request context.
 * Usage: @RequestContext() context: RequestContextData
 */
export const RequestContext = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const requestContext = new RequestContextService();
    return requestContext.getContext();
  },
);
