/** Shared response-envelope types (#1462). */

/** Envelope every successful response is wrapped in. */
export interface ApiSuccessResponse<T> {
  success: true;
  statusCode: number;
  message: string;
  data: T;
  timestamp: string;
  path: string;
  requestId?: string;
}

/** Envelope produced by the global exception filter. */
export interface ApiErrorResponse {
  success: false;
  statusCode: number;
  error: string;
  message: string | string[];
  code: string;
  timestamp: string;
  path: string;
  requestId: string;
  details?: unknown[];
  stack?: string;
}

/** Type of a paginated `data` payload so Swagger renders it correctly. */
export interface PaginatedPayload<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  links?: {
    first: string | null;
    prev: string | null;
    self: string;
    next: string | null;
    last: string | null;
  };
}