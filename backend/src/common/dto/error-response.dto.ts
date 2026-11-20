import { ApiProperty } from '@nestjs/swagger';

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
}
