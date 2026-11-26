import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import {
  IsAfterDate,
  IsIsoDateTime,
  IsValidWalletAddress,
} from '../validators';

const WALLET_EXAMPLE =
  'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';

/**
 * Reusable base for path DTOs that identify a wallet. Concrete DTOs add the
 * actual parameter name so Nest can map `@Param()` onto the class (#1692).
 */
export abstract class WalletAddressParamDto {
  @ApiPropertyOptional({
    description: 'Stellar wallet address.',
    example: WALLET_EXAMPLE,
  })
  @IsOptional()
  @IsValidWalletAddress()
  walletAddress?: string;
}

export class UserIdParamDto extends WalletAddressParamDto {
  @ApiProperty({
    description: 'Stellar wallet address of the user.',
    example: WALLET_EXAMPLE,
  })
  @IsValidWalletAddress()
  userId!: string;
}

export class MentorIdParamDto extends WalletAddressParamDto {
  @ApiProperty({
    description: 'Stellar wallet address of the mentor.',
    example: WALLET_EXAMPLE,
  })
  @IsValidWalletAddress()
  mentorId!: string;
}

/** Public profile identifiers may be either a wallet address or a username. */
export class WalletIdentifierParamDto {
  @ApiProperty({
    description: 'Wallet address or username.',
    example: 'alice_dev',
    minLength: 1,
    maxLength: 56,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(56)
  identifier!: string;
}

/** Base for date-window query strings. */
export abstract class DateRangeQueryDto {
  @ApiPropertyOptional({ description: 'Inclusive start (ISO 8601).' })
  @IsOptional()
  @IsIsoDateTime()
  from?: string;

  @ApiPropertyOptional({
    description: 'Inclusive end (ISO 8601), not before `from`.',
  })
  @IsOptional()
  @IsIsoDateTime()
  @IsAfterDate('from')
  to?: string;
}

/** Query DTO for the availability check endpoint. */
export class AvailabilityCheckQueryDto extends DateRangeQueryDto {
  @ApiProperty({
    description: 'ISO 8601 date-time to check.',
    example: '2026-11-23T10:30:00.000Z',
  })
  @IsIsoDateTime()
  dateTime!: string;
}
