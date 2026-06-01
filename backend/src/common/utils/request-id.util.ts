import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { getRequestId } from '../contexts/request-id.context';

/**
 * Generate a UUID v4 request ID
 * @returns UUID v4 string
 */
export function generateRequestId(): string {
  return randomUUID();
}

/**
 * Extract request ID from request headers or generate a new one
 * @param request Express Request object
 * @returns Request ID string
 */
export function extractOrGenerateRequestId(request: Request): string {
  const requestHeader = request.headers['x-request-id'];
  
  if (Array.isArray(requestHeader)) {
    return requestHeader[0] || generateRequestId();
  }
  
  return (requestHeader as string) || generateRequestId();
}

/**
 * Set request ID in response headers
 * @param response Express Response object
 * @param requestId Request ID to set
 */
export function setRequestIdHeader(response: Response, requestId: string): void {
  response.setHeader('X-Request-Id', requestId);
}

/**
 * Get request ID from current async context
 * @returns Request ID string or undefined
 */
export function getContextRequestId(): string | undefined {
  return getRequestId();
}

/**
 * Format request ID for database comments
 * PostgreSQL supports SET LOCAL application_name for context
 * @param requestId Request ID to format
 * @returns Formatted string for database context
 */
export function formatRequestIdForDatabase(requestId: string): string {
  // Remove dashes and limit to 63 chars for PostgreSQL identifier
  return `req_${requestId.replace(/-/g, '').substring(0, 59)}`;
}

/**
 * Create a database comment with request ID
 * Useful for correlating database queries with application logs
 * @param requestId Request ID
 * @returns SQL comment
 */
export function createDatabaseComment(requestId: string): string {
  return `-- Request-ID: ${requestId}`;
}

/**
 * Validate that a request ID is a valid UUID v4
 * @param requestId Request ID to validate
 * @returns true if valid UUID v4 format
 */
export function isValidRequestId(requestId: string): boolean {
  // UUID v4 format: 8-4-4-4-12 hex digits
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(requestId);
}

/**
 * Create correlation headers for external service calls
 * @param requestId Request ID
 * @returns Object with correlation headers
 */
export function createCorrelationHeaders(requestId: string): Record<string, string> {
  return {
    'X-Request-Id': requestId,
    'X-Correlation-Id': requestId,
    'Traceparent': `00-${requestId.replace(/-/g, '')}-${generateTraceParentSpanId()}-01`,
  };
}

/**
 * Generate a span ID for W3C Trace Context
 * @returns 16-character hex string
 */
function generateTraceParentSpanId(): string {
  return randomUUID().replace(/-/g, '').substring(0, 16);
}
