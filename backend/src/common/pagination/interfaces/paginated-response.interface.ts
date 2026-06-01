import { ApiProperty } from '@nestjs/swagger';

export class PaginatedMeta {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  limit: number;

  @ApiProperty({ example: 100 })
  total: number;

  @ApiProperty({ example: 10 })
  totalPages: number;

  @ApiProperty({ example: true })
  hasNext: boolean;

  @ApiProperty({ example: false })
  hasPrev: boolean;

  @ApiProperty({ required: false, example: 'xyz...' })
  nextCursor?: string;
}

export class PaginatedResponse<T> {
  data: T[];

  @ApiProperty({ type: PaginatedMeta })
  meta: PaginatedMeta;

  @ApiProperty({
    required: false,
    type: 'object',
    properties: {
      first: { type: 'string' },
      prev: { type: 'string', nullable: true },
      next: { type: 'string', nullable: true },
      last: { type: 'string' },
    },
  })
  links?: {
    first: string;
    prev: string | null;
    next: string | null;
    last: string;
  };
}

export interface PaginationOptions {
  maxLimit?: number;
  route?: string;
  cursorField?: string;
  cursor?: string;
}
