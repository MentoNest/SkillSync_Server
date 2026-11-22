import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Pagination metadata embedded in list responses. */
export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 137 })
  total!: number;

  @ApiProperty({ example: 7 })
  totalPages!: number;

  @ApiProperty({ example: true })
  hasNext!: boolean;

  @ApiProperty({ example: false })
  hasPrev!: boolean;
}

/** The `data` value for a paginated list. */
export class ListDataDto {
  @ApiProperty({ type: Array, description: 'Items on the current page.' })
  items!: unknown[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

/** Envelope emitted by the global response interceptor. */
export class SuccessResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 200 })
  statusCode!: number;

  @ApiProperty({ example: 'OK' })
  message!: string;

  @ApiProperty({ description: 'Endpoint payload, or { items, meta } for lists.' })
  data!: unknown;

  @ApiProperty({ example: '2026-11-22T10:00:00.000Z', format: 'date-time' })
  timestamp!: string;

  @ApiProperty({ example: '/users?page=1' })
  path!: string;

  @ApiProperty({ example: '0f1c...', description: 'Correlation id shared with logs and errors.' })
  requestId!: string;
}

/** Envelope emitted by the global exception filter. */
export class ErrorEnvelopeDto {
  @ApiProperty({ example: false })
  success!: boolean;

  @ApiProperty({ example: 404 })
  statusCode!: number;

  @ApiProperty({ example: 'Not Found' })
  error!: string;

  @ApiProperty({ example: 'Mentor was not found' })
  message!: string;

  @ApiProperty({ example: '2026-11-22T10:00:00.000Z', format: 'date-time' })
  timestamp!: string;

  @ApiProperty({ example: '/mentors/unknown' })
  path!: string;

  @ApiProperty({ example: '0f1c...' })
  requestId!: string;

  @ApiPropertyOptional({ description: 'Stable machine-readable error code.' })
  code?: string;
}
