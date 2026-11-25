import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UsernameAvailableResponseDto {
  @ApiProperty({
    description: 'The username that was checked.',
    example: 'alice_dev',
  })
  username!: string;

  @ApiProperty({
    description:
      'True when the username is both syntactically valid and not already taken.',
    example: true,
  })
  available!: boolean;

  @ApiPropertyOptional({
    description: 'Human-readable reason when available is false.',
    example: 'Username is already taken.',
    nullable: true,
  })
  reason?: string;
}
