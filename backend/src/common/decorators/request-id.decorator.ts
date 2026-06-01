import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { getContextRequestId } from '../utils/request-id.util';

/**
 * Parameter decorator to inject request ID into controller methods
 * Can be used in two ways:
 * 1. @RequestIdParam() - gets from async context (recommended)
 * 2. @RequestIdParam() requestId: string - injects from context
 * 
 * @example
 * @Get()
 * getUser(@RequestIdParam() requestId: string) {
 *   // requestId is available here
 * }
 */
export const RequestIdParam = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    // Try to get from async context first
    const contextRequestId = getContextRequestId();
    if (contextRequestId) {
      return contextRequestId;
    }

    // Fallback to request header
    const request = ctx.switchToHttp().getRequest<Request>();
    const requestHeader = request.headers['x-request-id'];
    
    if (Array.isArray(requestHeader)) {
      return requestHeader[0] || 'unknown';
    }
    
    return (requestHeader as string) || 'unknown';
  },
);
