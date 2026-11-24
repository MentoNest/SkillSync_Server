import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** A single field-level validation failure, as returned inside `errors`. */
export class FieldErrorDto {
  @ApiProperty({ example: 'address', description: 'Dotted path of the offending field.' })
  field!: string;

  @ApiProperty({
    example: ['address must be a valid Stellar public key'],
    description: 'Human-readable validation messages for the field.',
    type: [String],
  })
  errors!: string[];
}

/**
 * Envelope produced by `AllExceptionsFilter` for every error response:
 * `{ statusCode, message, error, code, timestamp, path, requestId }`, plus `errors`
 * for validation failures. Kept in sync with `ErrorResponseBody` in the filter.
 */
export class ErrorResponseDto {
  @ApiProperty({ example: 400, description: 'HTTP status code.' })
  statusCode!: number;

  @ApiProperty({ example: 'Validation failed', description: 'Human-readable error message.' })
  message!: string;

  @ApiProperty({ example: 'Bad Request', description: 'HTTP error label.' })
  error!: string;

  @ApiProperty({
    example: 'VALIDATION_FAILED',
    description: 'Stable machine-readable error code. Clients should branch on this, not on message.',
  })
  code!: string;

  @ApiProperty({ example: '2026-11-22T10:00:00.000Z', description: 'ISO 8601 timestamp of the error.' })
  timestamp!: string;

  @ApiProperty({ example: '/auth/nonce', description: 'Request path that produced the error.' })
  path!: string;

  @ApiProperty({
    example: 'b1f2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Correlation id of the request (from the X-Request-Id header when supplied).',
  })
  requestId!: string;

  @ApiPropertyOptional({
    description: 'Per-field validation details. Only present on VALIDATION_FAILED responses.',
    type: () => [FieldErrorDto],
  })
  errors?: FieldErrorDto[];
}

export class UnauthorizedResponseDto {
  @ApiProperty({ example: 401 })
  statusCode!: number;

  @ApiProperty({ example: 'Signature verification failed' })
  message!: string;

  @ApiProperty({ example: 'Unauthorized' })
  error!: string;

  @ApiProperty({ example: 'INVALID_CREDENTIALS' })
  code!: string;

  @ApiProperty({ example: '2026-11-22T10:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({ example: '/auth/login' })
  path!: string;

  @ApiProperty({ example: 'b1f2c3d4-e5f6-7890-abcd-ef1234567890' })
  requestId!: string;
}

export class ForbiddenResponseDto {
  @ApiProperty({ example: 403 })
  statusCode!: number;

  @ApiProperty({ example: 'Forbidden resource' })
  message!: string;

  @ApiProperty({ example: 'Forbidden' })
  error!: string;

  @ApiProperty({ example: 'FORBIDDEN' })
  code!: string;

  @ApiProperty({ example: '2026-11-22T10:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({ example: '/users/me' })
  path!: string;

  @ApiProperty({ example: 'b1f2c3d4-e5f6-7890-abcd-ef1234567890' })
  requestId!: string;
}

export class TooManyRequestsResponseDto {
  @ApiProperty({ example: 429 })
  statusCode!: number;

  @ApiProperty({ example: 'Too many requests' })
  message!: string;

  @ApiProperty({ example: 'Too Many Requests' })
  error!: string;

  @ApiProperty({ example: 'RATE_LIMITED' })
  code!: string;

  @ApiProperty({ example: '2026-11-22T10:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({ example: '/auth/nonce' })
  path!: string;

  @ApiProperty({ example: 'b1f2c3d4-e5f6-7890-abcd-ef1234567890' })
  requestId!: string;
}

export class InternalServerErrorResponseDto {
  @ApiProperty({ example: 500 })
  statusCode!: number;

  @ApiProperty({ example: 'Internal server error' })
  message!: string;

  @ApiProperty({ example: 'Internal Server Error' })
  error!: string;

  @ApiProperty({ example: 'INTERNAL_ERROR' })
  code!: string;

  @ApiProperty({ example: '2026-11-22T10:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({ example: '/users/me' })
  path!: string;

  @ApiProperty({ example: 'b1f2c3d4-e5f6-7890-abcd-ef1234567890' })
  requestId!: string;
}
