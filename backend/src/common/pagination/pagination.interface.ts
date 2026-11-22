/** Metadata returned alongside every paginated list. */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/** Standard response shape for list endpoints. */
export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

/** HATEOAS-style links for a paginated collection. */
export interface PaginationLinks {
  first: string;
  prev: string | null;
  next: string | null;
  last: string;
}

/** Options accepted by `PaginationService.paginate`. */
export interface PaginationOptions {
  page?: number;
  limit?: number;
  defaultLimit?: number;
  maxLimit?: number;
  baseUrl?: string;
  includeLinks?: boolean;
}

/** Response for cursor-based pagination. */
export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
  prevCursor: string | null;
  hasMore: boolean;
  limit: number;
}

/** Options accepted by `PaginationService.paginateCursor`. */
export interface CursorPaginationOptions {
  limit?: number;
  maxLimit?: number;
  defaultLimit?: number;
  cursor?: string;
  /** Column used as the stable cursor. Defaults to `id`. */
  cursorColumn?: string;
  /** Alias used in the generated where/order clauses. Defaults to the entity alias passed in. */
  alias?: string;
}

/** Minimal TypeORM QueryBuilder surface needed for offset pagination. */
export interface OffsetQueryBuilder<T> {
  skip(skip: number): this;
  take(take: number): this;
  getManyAndCount(): Promise<[T[], number]>;
}

/** Minimal repository surface needed for offset pagination. */
export interface OffsetRepository<T> {
  findAndCount(options: {
    skip: number;
    take: number;
  }): Promise<[T[], number]>;
}

/** Minimal QueryBuilder surface needed for cursor pagination. */
export interface CursorQueryBuilder<T> {
  andWhere(condition: string, parameters?: Record<string, unknown>): this;
  orderBy(sort: string, order: 'ASC' | 'DESC'): this;
  take(take: number): this;
  getMany(): Promise<T[]>;
}

export type PaginateableSource<T> = OffsetQueryBuilder<T> | OffsetRepository<T>;
