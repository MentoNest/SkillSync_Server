/**
 * #1007: Standardized pagination response shapes shared by every
 * list endpoint in the app.
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface PaginationLinks {
  first: string;
  prev: string | null;
  next: string | null;
  last: string;
}

export interface CursorPaginationMeta {
  limit: number;
  nextCursor: string | null;
  hasNext: boolean;
}

export interface CursorPaginatedResponse<T> {
  data: T[];
  meta: CursorPaginationMeta;
}
