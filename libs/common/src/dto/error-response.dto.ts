import { ApiProperty } from '@nestjs/swagger';

export class ErrorResponse {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: 'BadRequest' })
  error: string;

  @ApiProperty({ example: 'A descriptive error message' })
  message: string | string[];

  @ApiProperty({ example: 'ERR_INVALID_TRADE', required: false })
  code?: string;

  @ApiProperty({ example: {}, required: false })
  details?: unknown;

  @ApiProperty({ example: '/api/trades' })
  path: string;

  @ApiProperty({ example: new Date().toISOString() })
  timestamp: string;
}
