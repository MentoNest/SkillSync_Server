/** Offset/limit pagination metadata shared by every list endpoint (#1461). */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/** Navigation helpers derived from the current page and `path` (#1461). */
export interface PaginationLinks {
  first: string | null;
  prev: string | null;
  self: string;
  next: string | null;
  last: string | null;
}

/** Standard paginated envelope. */
export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
  links?: PaginationLinks;
}

/** Metadata for keyset ("cursor") pagination. */
export interface CursorMeta {
  limit: number;
  hasNext: boolean;
  hasPrev: boolean;
  nextCursor: string | null;
  prevCursor: string | null;
}

export interface CursorPaginatedResponse<T> {
  data: T[];
  meta: CursorMeta;
}

export interface ResolvedPage {
  page: number;
  limit: number;
  skip: number;
}

/** Options accepted by {@link PaginationService.paginate}. */
export interface PaginateOptions {
  /** Page size ceiling. Defaults to the service's configured max limit. */
  maxLimit?: number;
  /** Emit `meta.links`. Defaults to true. */
  links?: boolean;
  /** Request path used to build the navigation links. */
  path?: string;
  /** Extra query parameters preserved when building the links. */
  query?: Record<string, string | number | boolean | undefined>;
}